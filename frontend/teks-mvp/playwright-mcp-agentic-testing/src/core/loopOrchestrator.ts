import { getDomSnapshot } from "./state.js";
import { bedrockConverse } from "./bedrockClient.js";
import { getSharedMcpClient, pageBodyHtml, unwrapText } from "./mcpClient.js";
import { logger } from "./logger.js";
import { sanitizeJs, SYSTEM_RULES } from "./llm.js";

type LoopInput = { goal: string; maxSteps?: number; url?: string; };
type LoopResult = { 
  status: "done" | "incomplete"; 
  steps: number; 
  reason?: string;
  validationErrors?: string[];  // NEW: Actual error messages from the page
};

export async function runAgentLoop({ goal, maxSteps = 12, url }: LoopInput): Promise<LoopResult> {
  const mcp = getSharedMcpClient();
  if (url) {
    await mcp.call("browser_navigate", { url });
    
    // Wait for page to load (especially important for Angular apps)
    logger.info({ t: "wait", message: "Waiting for page to load..." });
    
    // Try multiple times to detect page elements
    let pageReady = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkRes = await mcp.call("browser_evaluate", {
        function: `() => {
          const buttons = document.querySelectorAll('button').length;
          const linkButtons = document.querySelectorAll('a.btn').length;
          const navLinks = document.querySelectorAll('a[routerlinkactive], a[routerlink]').length;
          const tables = document.querySelectorAll('table').length;
          const loading = document.body?.innerText?.toLowerCase().includes('loading');
          return { buttons, linkButtons, navLinks, tables, loading, ready: (buttons > 0 || linkButtons > 0 || navLinks > 0 || tables > 0) && !loading };
        }`
      });
      
      const checkData = JSON.parse(unwrapText(checkRes));
      logger.info({ t: "wait_check", attempt: i + 1, data: checkData });
      
      if (checkData.ready) {
        pageReady = true;
        break;
      }
    }
    
    if (!pageReady) {
      logger.error({ t: "wait_timeout", message: "Page did not load elements after 10 seconds" });
    }
  }

  // Track validation errors and navigation across steps
  let validationErrorCount = 0;
  let stuckOnSameRoute = 0;
  let lastRoute = "";
  const collectedValidationErrors: string[] = [];  // NEW: Collect actual error messages

  for (let step = 1; step <= maxSteps; step++) {
    const obs = await getDomSnapshot();
    logger.info({ t: "observe", step, url: obs.route, title: obs.title, formCount: obs.forms?.length, buttonCount: obs.buttons?.length });

    const hints = {
      formControlNames: (obs.forms || []).flatMap(f => f.inputs.map(i => i.formControlName)).filter(Boolean).slice(0, 20),
      ids:             (obs.forms || []).flatMap(f => f.inputs.map(i => i.id)).filter(Boolean).slice(0, 20),
      names:           (obs.forms || []).flatMap(f => f.inputs.map(i => i.name)).filter(Boolean).slice(0, 20),
      placeholders:    (obs.forms || []).flatMap(f => f.inputs.map(i => i.placeholder)).filter(Boolean).slice(0, 20),
      buttonTexts:     (obs.buttons || []).map(b => b.text).filter(Boolean).slice(0, 20),
    };
    
    // Log hints to help debug
    if (step === 1) {
      logger.info({ t: "hints", hints });
    }

    const system = SYSTEM_RULES;
    const user =
      `Goal: ${goal}\n\n` +
      `Current page: ${obs.route} | ${obs.title}\n\n` +
      `Helpful selectors:\n${JSON.stringify(hints, null, 2)}\n\n` +
      `==================== CRITICAL RULES ====================\n` +
      `1. querySelectorAll() returns NodeList - ALWAYS use Array.from() first!\n` +
      `2. FORM FILLING: Fill ALL required form fields in ONE step, then submit in the NEXT step\n` +
      `3. BEFORE filling a field, CHECK if it already has the correct value - don't refill it!\n` +
      `4. NEVER use setInterval, setTimeout, Promises, or async waiting\n` +
      `5. If element not found, return undefined immediately - don't wait\n` +
      `6. After you click a button, your code ENDS - you cannot do the next step!\n` +
      `7. This app uses <a class="btn"> for buttons and <a routerlink> for tabs/navigation!\n` +
      `========================================================\n\n` +
      `Example - Click ONE button/link (use 'a.btn, a[routerlink], button' selector):\n` +
      `let btn = Array.from(document.querySelectorAll('button, a.btn, a[routerlink]')).find(b => b.textContent.trim() === 'Open');\n` +
      `if (btn) btn.click();\n\n` +
      `Example - Fill ALL form fields in ONE step:\n` +
      `let nameEl = document.querySelector('[formcontrolname="name"]');\n` +
      `if (nameEl && nameEl.value !== 'John') { nameEl.value = 'John'; nameEl.dispatchEvent(new Event('input',{bubbles:true})); }\n` +
      `let ageEl = document.querySelector('[formcontrolname="age"]');\n` +
      `if (ageEl && ageEl.value !== '25') { ageEl.value = '25'; ageEl.dispatchEvent(new Event('input',{bubbles:true})); }\n\n` +
      `WRONG - Filling SAME field multiple times:\n` +
      `// Step 1: fill name, Step 2: fill name again <-- NO! Fill it once, then move to next field!\n\n` +
      `Step ${step} of ${maxSteps}: Do the NEXT SINGLE action toward the goal.`;

    const raw = await bedrockConverse(system, user);
    const body = sanitizeJs(raw);
    const fn = `async () => { ${body} }`;

    logger.info({ t: "plan", step, js: body.slice(0, 200) + (body.length > 200 ? "..." : "") });

    // Execute the generated JavaScript and capture any return value or errors
    const execResult = await mcp.call("browser_evaluate", { function: fn });
    if (step === 1 || step === maxSteps) {
      logger.info({ t: "exec_result", step, result: JSON.stringify(execResult).slice(0, 500) });
    }

    // Check for success indicators
    const html = await pageBodyHtml(mcp);
    const newObs = await getDomSnapshot();
    
    // Track if we're stuck on the same route (validation blocking)
    if (newObs.route === lastRoute) {
      stuckOnSameRoute++;
    } else {
      stuckOnSameRoute = 0;
    }
    lastRoute = newObs.route;
    
    // Only detect success if we navigated AND there's a success indicator in the URL or page
    // This prevents stopping too early on intermediate navigations
    const urlHasSuccessParam = /[?&](added|created|success|saved)=/.test(newObs.route);
    const hasSuccessMessage = /needs assessment (added|created)|successfully (added|created|saved)|assessment.*created/i.test(html);
    
    if (newObs.route !== obs.route && (urlHasSuccessParam || hasSuccessMessage)) {
      logger.info({ t: "done", step, reason: "Success detected", oldRoute: obs.route, newRoute: newObs.route });
      return { status: "done", steps: step, reason: "Success detected" };
    }
    
    // Also succeed if we see explicit success text (even without navigation)
    if (hasSuccessMessage) {
      logger.info({ t: "done", step, reason: "Success message found" });
      return { status: "done", steps: step, reason: "Success message found" };
    }
    
    // SMART SUCCESS DETECTION: Detect form-to-list transitions without explicit success params
    // If we navigated from a "/new" or "/create" form to a list page, and the list has items, assume success
    const wasOnFormPage = /\/(new|create|add|edit)/.test(obs.route);
    const nowOnListPage = newObs.route !== obs.route && !(/\/(new|create|add|edit)/.test(newObs.route));
    const hasTableOrCards = /<table|class=".*card|class=".*list-item|class=".*data-row/.test(html);
    
    if (wasOnFormPage && nowOnListPage && hasTableOrCards) {
      logger.info({ 
        t: "done", 
        step, 
        reason: "Smart success: form submission + navigation to list page", 
        oldRoute: obs.route, 
        newRoute: newObs.route 
      });
      return { status: "done", steps: step, reason: "Form submitted and navigated to list" };
    }
    
    // Check console for submit attempts (form validation passing and API called)
    try {
      const consoleRes = await mcp.call("browser_console_messages", {});
      const consoleTxt = unwrapText(consoleRes);
      if (consoleTxt && /SUBMIT DEBUG.*submit\(\) method called|Submitting to API/i.test(consoleTxt)) {
        logger.info({ t: "done", step, reason: "Form submission detected in console logs" });
        return { status: "done", steps: step, reason: "Form submission detected" };
      }
    } catch (e) {
      // Ignore console check errors
    }
    
    // On last step, take screenshot and check for validation errors
    if (step === maxSteps) {
      try {
        await mcp.call("browser_take_screenshot", { path: `./loop-failure-${Date.now()}.png` });
        logger.info({ t: "screenshot", message: "Saved failure screenshot" });
      } catch (e) {
        logger.error({ t: "screenshot", error: String(e) });
      }
      
      // Check for validation errors in the HTML
      if (/required|invalid|error|must|should/i.test(html)) {
        logger.info({ t: "validation", message: "Possible validation errors detected in page" });
      }
      
      // Check browser console for JavaScript errors
      try {
        const consoleRes = await mcp.call("browser_console_messages", {});
        const consoleTxt = unwrapText(consoleRes);
        if (consoleTxt && consoleTxt.length > 0) {
          logger.info({ t: "console", messages: consoleTxt.slice(0, 1000) });
        }
      } catch (e) {
        logger.error({ t: "console_error", error: String(e) });
      }
    }
    
    // Check for validation errors on every step (not just last)
    if (/required|invalid|error|must|should/i.test(html)) {
      validationErrorCount++;
      
      // Extract actual error messages from the page
      try {
        const errorsRes = await mcp.call("browser_evaluate", {
          function: `() => {
            const errorElements = Array.from(document.querySelectorAll('.error, .invalid, .validation-error, [class*="error"], [class*="invalid"]'));
            const errorTexts = errorElements
              .map(el => el.textContent?.trim())
              .filter(text => text && text.length > 0 && text.length < 200)
              .filter(text => /required|invalid|must|should|error|cannot|failed/i.test(text));
            return [...new Set(errorTexts)]; // Remove duplicates
          }`
        });
        const errorMessages = JSON.parse(unwrapText(errorsRes));
        if (Array.isArray(errorMessages) && errorMessages.length > 0) {
          errorMessages.forEach(msg => {
            if (!collectedValidationErrors.includes(msg)) {
              collectedValidationErrors.push(msg);
            }
          });
          logger.info({ t: "validation_errors", step, errors: errorMessages });
        }
      } catch (e) {
        // Ignore error extraction failures
      }
    }
    
    // EARLY EXIT: If we've tried 3 times with validation errors and stuck on same page, stop immediately
    if (step >= 3 && validationErrorCount >= 3 && stuckOnSameRoute >= 2) {
      logger.info({ 
        t: "early_exit", 
        step, 
        reason: "Form validation blocking detected - stopping test early",
        validationErrorCount,
        stuckOnSameRoute,
        validationErrors: collectedValidationErrors
      });
      
      // Take screenshot for evidence
      try {
        await mcp.call("browser_take_screenshot", { path: `./validation-failure-${Date.now()}.png` });
        logger.info({ t: "screenshot", message: "Saved validation failure screenshot" });
      } catch (e) {
        logger.error({ t: "screenshot", error: String(e) });
      }
      
      return { 
        status: "incomplete", 
        steps: step, 
        reason: "Form validation errors preventing submission",
        validationErrors: collectedValidationErrors
      };
    }
  }

  // Determine the most meaningful failure reason
  let failureReason = "Max steps reached";
  
  // If we detected validation errors multiple times and stayed on same route, it's validation blocking
  if (validationErrorCount >= 3 && stuckOnSameRoute >= 3) {
    failureReason = "Form validation errors preventing submission";
  } else if (stuckOnSameRoute >= 5) {
    failureReason = "Stuck on same page - possible validation or UI issue";
  } else if (validationErrorCount > 0) {
    failureReason = "Validation errors detected in form";
  }

  return { 
    status: "incomplete", 
    steps: maxSteps, 
    reason: failureReason,
    validationErrors: collectedValidationErrors.length > 0 ? collectedValidationErrors : undefined
  };
}
