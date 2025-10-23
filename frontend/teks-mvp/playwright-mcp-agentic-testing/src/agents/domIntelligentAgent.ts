// src/agents/domIntelligentAgent.ts
import { RunLogger } from "../core/logger.js";
import { BedrockClient } from "../core/bedrockClient.js";
import { McpClient } from "../core/mcpClient.js";

export interface DomActionPlan {
  steps: Array<{
    description: string;
    jsCode: string;
  }>;
}

export class DomIntelligentAgent {
  constructor(
    private readonly client: McpClient,
    private readonly logger: RunLogger,
    private readonly bedrock?: BedrockClient
  ) {}

  async executeGoalWithDom(goal: string, url: string): Promise<void> {
    // Step 1: Navigate to the page
    this.logger.info("Navigating to page", { url });
    await this.client.callTool({
      name: "browser_navigate",
      arguments: { url }
    });

    // Step 1.5: Take a snapshot to see what's actually rendered and give Angular time to load
    this.logger.info("Taking page snapshot to verify page is loaded");
    const snapshotResult = await this.client.callTool({
      name: "browser_snapshot",
      arguments: {}
    });
    
    // Extract the page state from snapshot
    const snapshotText = (snapshotResult as any)?.content?.[0]?.text || JSON.stringify(snapshotResult);
    this.logger.info("Snapshot received", { 
      length: snapshotText.length,
      preview: snapshotText.substring(0, 500) 
    });

    // Wait a moment for any async rendering
    this.logger.info("Waiting for page components to render");
    await this.client.callTool({
      name: "browser_wait_for",
      arguments: { time: 2 } // Wait 2 seconds
    });

    // Step 2: Extract the full DOM
    this.logger.info("Extracting DOM structure");
    const domResult = await this.client.callTool({
      name: "browser_evaluate",
      arguments: { 
        function: `() => {
          // Extract ALL inputs and buttons, regardless of whether they're in forms
          const allInputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
            type: i.type || i.tagName.toLowerCase(),
            id: i.id,
            name: i.name,
            formControlName: i.getAttribute('formcontrolname') || i.getAttribute('formControlName'),
            className: i.className,
            placeholder: i.placeholder || ''
          }));
          
          const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
            type: b.type,
            id: b.id,
            className: b.className,
            text: b.textContent?.trim(),
            dataTestId: b.getAttribute('data-testid')
          }));
          
          // Also extract forms if they exist
          const forms = Array.from(document.querySelectorAll('form')).map(f => ({
            id: f.id,
            name: f.name,
            action: f.action
          }));
          
          return { forms, allInputs, allButtons };
        }` 
      }
    });

    this.logger.info("Raw DOM result", { domResult: JSON.stringify(domResult).substring(0, 500) });
    
    const domData = this.extractDomData(domResult);
    this.logger.info("DOM extracted", { 
      formsCount: domData.forms.length,
      inputsCount: domData.allInputs?.length || 0,
      buttonsCount: domData.allButtons?.length || 0,
      inputsPreview: JSON.stringify(domData.allInputs?.slice(0, 3)).substring(0, 300),
      buttonsPreview: JSON.stringify(domData.allButtons?.slice(0, 3)).substring(0, 200)
    });

    // Step 3: Send DOM to LLM and get JavaScript code
    this.logger.info("Asking LLM to generate JavaScript for goal");
    const jsCode = await this.generateJavaScriptFromDom(goal, domData);
    
    this.logger.info("LLM generated JavaScript", { 
      codeLength: jsCode.length,
      preview: jsCode.substring(0, 200) 
    });

    // Step 4: Execute the JavaScript in the browser
    this.logger.info("Executing generated JavaScript in browser");
    
    // Wrap code in arrow function (NOT IIFE - MCP will invoke it)
    let cleanCode = jsCode.trim();
    
    // Remove any existing wrapping
    if (cleanCode.startsWith('(async')) {
      // Already wrapped, clean it up
      cleanCode = cleanCode.replace(/^\(async\s*\(\)\s*=>\s*\{/, '').replace(/\}\)\(\)\s*;?\s*$/, '');
    } else if (cleanCode.startsWith('async')) {
      // Has async keyword but not wrapped
      cleanCode = cleanCode.replace(/^async\s*\(\)\s*=>\s*\{/, '').replace(/\}\s*;?\s*$/, '');
    }
    
    // Wrap in async arrow function (NOT invoked)
    const executableCode = `async () => {
${cleanCode}
}`;
    
    const executeResult = await this.client.callTool({
      name: "browser_evaluate",
      arguments: { function: executableCode }
    });

    this.logger.info("JavaScript execution completed", { 
      result: executeResult 
    });
  }

  private extractDomData(result: any): { html: string; forms: any[]; allInputs?: any[]; allButtons?: any[] } {
    try {
      let textContent = result?.content?.[0]?.text || result?.text || JSON.stringify(result);
      // Remove MCP's "### Result\n" prefix if present
      textContent = textContent.replace(/^###\s*Result\s*\n/, '').trim();
      
      // Extract ONLY the JSON part (before "### Ran Playwright code")
      const jsonEndIndex = textContent.indexOf('\n\n###');
      if (jsonEndIndex > 0) {
        textContent = textContent.substring(0, jsonEndIndex).trim();
      }
      
      // browser_evaluate returns the value directly in the text
      const parsed = JSON.parse(textContent);
      
      return {
        html: '', // No longer extracting full HTML
        forms: parsed.forms || [],
        allInputs: parsed.allInputs || [],
        allButtons: parsed.allButtons || []
      };
    } catch (e) {
      this.logger.warn("Failed to parse DOM data, using fallback", { error: (e as Error).message, textPreview: result?.content?.[0]?.text?.substring(0, 200) });
      return { html: '', forms: [], allInputs: [], allButtons: [] };
    }
  }

  private async generateJavaScriptFromDom(goal: string, domData: { html: string; forms: any[]; allInputs?: any[]; allButtons?: any[] }): Promise<string> {
    if (!this.bedrock) {
      throw new Error("Bedrock client not configured");
    }

    const system = `You are an expert JavaScript automation engineer. 
Your task is to generate JavaScript code that will achieve the user's goal by directly manipulating the DOM ON THE CURRENT PAGE ONLY.

CRITICAL RULES - FOLLOW EXACTLY:
1. The code will run in the browser context via browser_evaluate, so you have access to 'document', 'window', etc.
2. You MUST trigger events properly for Angular/React/Vue frameworks:
   - For inputs: set .value, then dispatch 'input' and 'change' events
   - For clicks: use .click() or dispatchEvent(new MouseEvent('click', {bubbles: true}))
   - For Angular forms: Consider calling form.dispatchEvent(new Event('submit')) or finding the component's submit method
3. Use querySelector with specific selectors based on the metadata provided
4. Add console.log statements to help debug
5. Handle async operations with await if needed
6. Return ONLY the JavaScript code BODY, no markdown formatting, no explanations
7. DO NOT wrap in (async function() { }) or any function declaration - just the raw code statements
8. The code should be self-contained and executable
9. *** NEVER use window.location.href or window.location.assign() or any navigation - clicks will handle navigation ***
10. *** DO NOT use await new Promise(resolve => setTimeout(...)) for waiting - the framework handles this ***
11. Focus ONLY on filling forms and clicking buttons on the CURRENT page
12. *** NEVER use :contains() pseudo-selector - it does NOT exist in CSS! Use Array.from() and .find() instead ***
13. *** INVALID: td:contains("text") - VALID: Array.from(document.querySelectorAll('td')).find(td => td.textContent.includes('text')) ***

Available DOM info:
- All Inputs: ${JSON.stringify(domData.allInputs || [], null, 2)}
- All Buttons: ${JSON.stringify(domData.allButtons || [], null, 2)}
- Forms: ${JSON.stringify(domData.forms || [], null, 2)}

IMPORTANT: Look for inputs by their 'name' attribute first, then by 'formControlName', then by 'id'. 
For buttons, use ONLY these valid selectors:
  - button[type="submit"] (for submit buttons)
  - button.btn.primary (for primary action buttons by class)
  - button:contains("ButtonText") is INVALID - use Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ButtonText'))
  - Never use [text="..."] attribute selector - it doesn't exist in CSS

Generate JavaScript that:
- Fills form fields by setting .value and dispatching input/change events for framework reactivity
- Clicks buttons by:
  1. Use 'let' (not 'const') for button variables that might be reassigned
  2. Example: let submitButton = document.querySelector('button[type="submit"]'); if (!submitButton) { submitButton = ... }
  3. First try: document.querySelector('button[type="submit"]')
  4. Then try: Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Create')
  5. Never use invalid CSS selectors like button[text="Create"]
  6. NEVER reassign const variables - use let instead!
- Waits for navigation or element changes if needed
- Validates success`;

    const user = `Goal: ${goal}

Generate the JavaScript code to achieve this goal. Remember:
- Set input values AND dispatch events for framework reactivity
- Use the 'name' attribute to find form fields (e.g., document.querySelector('input[name="fieldName"]'))
- Use button ID, data-testid, or type to find submit buttons
- Add console.log for debugging each step
- Return ONLY the code statements, NO function wrappers like (async function() {}), NO markdown
- The code will be wrapped in async () => {} automatically, so just write the statements`;

    const response = await this.bedrock.generateText(system, user);
    
    // Clean up the response - remove markdown code blocks if present
    let code = response.trim();
    if (code.startsWith('```javascript') || code.startsWith('```js')) {
      code = code.replace(/```(javascript|js)?\n?/g, '').replace(/```\s*$/g, '');
    } else if (code.startsWith('```')) {
      code = code.replace(/```\n?/g, '');
    }
    
    // Remove function wrappers if LLM added them despite instructions
    if (code.startsWith('(async function()') || code.startsWith('async function()')) {
      // Remove (async function() { at start and })(); or }); at end
      code = code.replace(/^\(async\s+function\s*\(\)\s*\{/, '').replace(/\}\s*\)\s*\(\)\s*;?\s*$/, '');
      code = code.replace(/^async\s+function\s*\(\)\s*\{/, '').replace(/\}\s*;?\s*$/, '');
    }
    
    return code.trim();
  }
}
