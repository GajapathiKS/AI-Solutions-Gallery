// src/agents/plannerAgent.ts
import { z } from "zod";
import { RunLogger } from "../core/logger.js";
import { BedrockClient } from "../core/bedrockClient.js";
import type { AgentPlan } from "../core/schema.js";

const PlanSchema = z.object({
  steps: z.array(z.object({
    type: z.enum([
      "navigate","type","click","press","selectOption","hover","drag","waitFor","screenshot","resize"
    ]),
    target: z.string().optional(),
    value: z.string().optional(),
    timeoutMs: z.number().optional()
  })),
  verification: z.array(z.object({
    type: z.enum(["text","visible","url","exists","scroll","screenshot"]),
    target: z.string().optional(),
    value: z.string().optional(),
    timeoutMs: z.number().optional()
  })).default([])
});

export class PlannerAgent {
  constructor(
    private readonly logger: RunLogger,
    private readonly bedrock?: BedrockClient
  ) {}

  async createPlan(goalText: string, ctx: { baseUrl: string; timeoutMs: number }): Promise<AgentPlan> {
    const system = `You are an E2E test planner for a Playwright+MCP agent.
Return JSON with { steps: Step[], verification: VerifyStep[] }.
- "navigate" value must be a full URL.
- "type" requires { target, value } where target is a CSS selector or label text.
- prefer robust selectors like input[name="username"], button[type="submit"].
- verification must include at least one step, e.g. {type:"visible",target:"#students-tab"} or {type:"text",target:"body",value:"Students"}.`;

    const user = `Goal:\n${goalText}\n\nBase URL: ${ctx.baseUrl}\nDefault timeout: ${ctx.timeoutMs}ms\n`;

    try {
      if (!this.bedrock) throw new Error("Bedrock client not configured");
      const raw = await this.bedrock.generateJSON<any>(system, user);
      
      // Normalize LLM output: convert "wait" to "waitFor" before validation
      if (raw && Array.isArray(raw.steps)) {
        raw.steps = raw.steps.map((step: any) => {
          if (step.type === "wait") {
            return { ...step, type: "waitFor" };
          }
          return step;
        });
      }
      
      const parsed = PlanSchema.safeParse(raw);
      if (!parsed.success) {
        this.logger.warn("Planner JSON parse failed, building fallback plan", { issues: parsed.error.issues as any });
        // conservative fallback: just navigate to possible login & leave verification visible Students tab
        const fallback: AgentPlan = {
          steps: [
            { type: "navigate", value: `${ctx.baseUrl}/login` },
          ],
          verification: [
            { type: "visible", target: "#students-tab", timeoutMs: ctx.timeoutMs }
          ],
        };
        return fallback;
      }

      const plan = parsed.data as AgentPlan;
      if (!plan.verification?.length) {
        plan.verification = [{ type: "visible", target: "#students-tab", timeoutMs: ctx.timeoutMs }];
      }
      return plan;
    } catch (err: any) {
      this.logger.warn("Planner failed, building fallback plan", { error: err?.message || String(err) });
      // Smarter fallback: infer from human goal
      const trimTrail = (s: string) => s.replace(/[)\].,!?]+$/g, "");
      const urlMatch = goalText.match(/https?:\/\/[^\s"']+/i);
      const rawUrl = urlMatch ? urlMatch[0] : `${ctx.baseUrl}/login`;
      const targetUrl = trimTrail(rawUrl);
  const userMatch = goalText.match(/username\s+(?:(?:as|=)\s+)?([\w.-]+)/i);
  const passMatch = goalText.match(/password\s+(?:(?:as|=)\s+)?([^\s]+)/i);
      const shotMatch = goalText.match(/screenshot\s+(?:named|name)\s+([\w.-]+)/i);
  const username = userMatch?.[1] ?? "admin";
  // keep punctuation like '!' inside password but trim trailing sentence punctuation like '.' or ','
  const trimPassword = (s: string) => s.replace(/[)\].,]+$/g, "");
  const password = passMatch?.[1] ? trimPassword(passMatch[1]) : "";
      const shotBase = shotMatch?.[1] ? trimTrail(shotMatch[1]) : "after_login";
      const shotName = shotBase.replace(/\.(png|jpe?g)$/i, "") + ".png";

      const steps = [
        { type: "navigate", value: targetUrl },
      ] as AgentPlan["steps"];

      // Heuristic: if goal mentions login fields, try typing and submit
      if (/login|username|password/i.test(goalText)) {
        steps.push(
          { type: "type", target: 'input[name="username"], #username, [data-testid="username"]', value: username },
          { type: "type", target: 'input[name="password"], #password, [data-testid="password"]', value: password },
          { type: "click", target: 'button[type="submit"], button[data-testid="submit"], button:has-text("Submit")' },
          { type: "waitFor", target: '[data-testid="students-heading"]', timeoutMs: ctx.timeoutMs },
          { type: "screenshot", value: shotName }
        );
      }

      const verification: AgentPlan["verification"] = [
        { type: "visible", target: '[data-testid="students-heading"]', timeoutMs: ctx.timeoutMs }
      ];

      return { steps, verification };
    }
  }
}
