import { RunLogger } from '../core/logger.js';
import { AgentPlan, normalisePlan, PlanSchema } from '../core/schema.js';
import { safeJsonParse } from '../core/utils.js';
import { askBedrock } from './bedrockClient.js';

export interface PlannerContext {
  baseUrl: string;
  headless: boolean;
  timeoutMs: number;
}

const SYSTEM_PROMPT = `You are an autonomous Playwright test planner for the TEKS MVP web application.
- Only respond with minified JSON matching the schema {"plan": Step[], "verification": VerifyStep[], "notes"?: string}.
- Step objects can contain: action, description, url, target, value, text, waitFor, timeoutMs, screenshotName.
- Supported actions: navigate, type, click, waitFor, expectText, expectVisible, screenshot, planNote.
- Include at least one verification entry describing the final state to validate.
- Prefer role= and data-testid selectors when possible.
- Always ensure the final plan logs into the app when credentials are mentioned.`;

export class PlannerAgent {
  constructor(private readonly logger: RunLogger) {}

  async createPlan(goal: string, context: PlannerContext): Promise<AgentPlan> {
    this.logger.info('Planner generating plan', { goal });
    const userPrompt = this.buildPrompt(goal, context);
    const responseText = await askBedrock(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 900
      },
      this.logger
    );
    let parsed = safeJsonParse<unknown>(responseText.trim());
    if (!parsed) {
      const startIndex = responseText.indexOf('{');
      const endIndex = responseText.lastIndexOf('}');
      if (startIndex >= 0 && endIndex > startIndex) {
        parsed = safeJsonParse(responseText.slice(startIndex, endIndex + 1));
      }
    }
    if (!parsed) {
      throw new Error('Planner could not parse Bedrock output as JSON');
    }
    const plan = normalisePlan(PlanSchema.parse(parsed));
    this.logger.info('Planner created plan', { stepCount: plan.steps.length, verificationCount: plan.verification.length });
    return plan;
  }

  private buildPrompt(goal: string, context: PlannerContext): string {
    return [
      `AUT base URL: ${context.baseUrl}`,
      `Browser mode: ${context.headless ? 'headless' : 'headed'}`,
      `Default timeout (ms): ${context.timeoutMs}`,
      '',
      'Goal:',
      goal.trim(),
      '',
      'Return JSON only.'
    ].join('\n');
  }
}
