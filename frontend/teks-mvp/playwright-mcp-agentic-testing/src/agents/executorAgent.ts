// src/agents/executorAgent.ts
import path from "node:path";
import { RunLogger } from "../core/logger.js";
import { McpClient } from "../core/mcpClient.js";
import type { EnvironmentSettings } from "../core/env.js";
import type { AgentPlan, PlanStep, VerifyStep } from "../core/schema.js";

export function buildVisibleScript(selector?: string) {
  if (!selector) return "() => false";
  return `() => !!document.querySelector(${JSON.stringify(selector)}) && getComputedStyle(document.querySelector(${JSON.stringify(selector)})!).display !== 'none'`;
}
export function buildExistsScript(selector?: string) {
  if (!selector) return "() => false";
  return `() => !!document.querySelector(${JSON.stringify(selector)})`;
}
export function buildTextContentScript(selector?: string) {
  if (!selector) return "() => document.body?.innerText || ''";
  return `() => (document.querySelector(${JSON.stringify(selector)})?.textContent || '')`;
}
export function extractText(res: any): string {
  if (!res) return "";
  const fromContent = res?.content?.[0]?.text;
  if (typeof fromContent === "string") return fromContent;
  return String(res ?? "");
}
export function isTruthy(v: any): boolean {
  if (v === true) return true;
  const t = extractText(v);
  return t === "true" || (!!t && t !== "false");
}

export class ExecutorAgent {
  constructor(
    private readonly client: McpClient,
    private readonly logger: RunLogger,
    private readonly environment: EnvironmentSettings,
    private readonly runDir: string
  ) { }

  async executePlan(plan: AgentPlan): Promise<void> {
    let stepIndex = 0;
    for (const step of plan.steps) {
      stepIndex++;
      this.logger.info(`Step ${stepIndex}`, step as unknown as Record<string, unknown>);
      try {
        await this.runStep(step);
      } catch (e: any) {
        this.logger.error(`Step ${stepIndex} failed`, { error: e?.message });
        // best effort screenshot on failure
        const sname = `error_step_${stepIndex}.png`;
        await this.client.callTool({
          name: "browser_take_screenshot",
          arguments: { path: path.join(this.runDir, sname), fullPage: true }
        }).catch(() => { });
        throw e;
      }
    }
  }

  async verify(verification: VerifyStep[]): Promise<void> {
    if (!verification || verification.length === 0) return;
    let vIndex = 0;
    for (const v of verification) {
      vIndex++;
      this.logger.info(`Verify ${vIndex}`, v as unknown as Record<string, unknown>);
      try {
        switch (v.type) {
          case "visible":
          case "exists": {
            await this.client.callTool({
              name: "browser_wait_for",
              arguments: { selector: v.target, timeoutMs: v.timeoutMs ?? this.environment.timeoutMs }
            });
            break;
          }
          case "url": {
            // Best-effort: evaluate location.href and check substring
            const res = await this.client.callTool({
              name: "browser_evaluate",
              arguments: { function: "() => location.href" }
            }).catch(() => null);

            const href = extractText(res);
            if (!v.value || !href.includes(v.value)) {
              throw new Error(`URL verification failed; expected to include ${v.value}, got ${href}`);
            }
            break;
          }
          case "text": {
            const expr = v.target
              ? `() => (document.querySelector(${JSON.stringify(v.target)})?.textContent || '')`
              : `() => document.body?.innerText || ''`;
            const res = await this.client.callTool({
              name: "browser_evaluate",
              arguments: { expression: expr }
            }).catch(() => null);
            const text = extractText(res);
            if (!v.value || !text.includes(v.value)) {
              throw new Error(`Text verification failed; expected to include ${v.value}`);
            }
            break;
          }
          case "scroll":
            // LLM sometimes suggests scroll as verification; treat as no-op (scrolling happens automatically)
            this.logger.info("Scroll verification (no-op); content loaded if we got here");
            break;
          case "screenshot":
            // LLM suggests screenshot as verification; take one
            const shotName = (v.value || `verify_${vIndex}`).endsWith('.png')
              ? v.value || `verify_${vIndex}.png`
              : `${v.value || `verify_${vIndex}`}.png`;
            const shotPath = path.join(this.runDir, shotName);
            this.logger.info(`Taking screenshot`, { shotName, fullPath: shotPath });
            await this.client.callTool({
              name: "browser_take_screenshot",
              arguments: { path: shotPath, fullPage: true }
            });
            this.logger.info(`Screenshot saved`, { shotName });
            break;
          default:
            this.logger.warn("Unknown verification type; skipping", v as any);
        }
      } catch (e: any) {
        this.logger.error(`Verify ${vIndex} failed`, { error: e?.message });
        const sname = `verify_${vIndex}_failed.png`;
        await this.client.callTool({
          name: "browser_take_screenshot",
          arguments: { path: path.join(this.runDir, sname), fullPage: true }
        }).catch(() => { });
        throw e;
      }
    }
  }

  private async runStep(step: PlanStep): Promise<void> {
    switch (step.type) {
      case "navigate":
        await this.client.callTool({
          name: "browser_navigate",
          arguments: { url: step.value }
        });
        break;
      case "type":
        if (!step.target) throw new Error("type requires target");
        // Click first to focus the input (helps with Angular reactive forms)
        await this.client.callTool({
          name: "browser_click",
          arguments: { selector: step.target }
        }).catch(() => { });
        // Then type with slowly=true to trigger change events
        await this.client.callTool({
          name: "browser_type",
          arguments: { selector: step.target, text: step.value ?? "", slowly: true }
        });
        break;
      case "click":
        if (!step.target) throw new Error("click requires target");
        await this.client.callTool({
          name: "browser_click",
          arguments: { selector: step.target }
        });
        break;
      case "press":
        await this.client.callTool({
          name: "browser_press_key",
          arguments: { key: step.value ?? "Enter" }
        });
        break;
      case "selectOption":
        await this.client.callTool({
          name: "browser_select_option",
          arguments: { selector: step.target, value: step.value }
        });
        break;
      case "hover":
        await this.client.callTool({
          name: "browser_hover",
          arguments: { selector: step.target }
        });
        break;
      case "drag":
        // expects value like "sourceSelector -> targetSelector"
        if (!step.value) throw new Error("drag requires value 'src -> dst'");
        {
          const [src, dst] = step.value.split("->").map(s => s.trim());
          await this.client.callTool({ name: "browser_drag", arguments: { source: src, target: dst } });
        }
        break;
      case "waitFor":
        await this.client.callTool({
          name: "browser_wait_for",
          arguments: { selector: step.target, timeoutMs: step.timeoutMs ?? this.environment.timeoutMs }
        });
        break;
      case "screenshot":
        await this.client.callTool({
          name: "browser_take_screenshot",
          arguments: { path: path.join(this.runDir, step.value || `shot_${Date.now()}.png`), fullPage: true }
        });
        break;
      case "resize":
        {
          const [w, h] = String(step.value || "1280x720").split("x").map(n => parseInt(n, 10));
          await this.client.callTool({
            name: "browser_resize",
            arguments: { width: w || 1280, height: h || 720 }
          });
        }
        break;
      case "evaluate":
        if (!step.code) throw new Error("evaluate requires code property");
        this.logger.info("Evaluating JavaScript", { code: step.code });
        await this.client.callTool({
          name: "browser_evaluate",
          arguments: { function: step.code }
        });
        break;
      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }
  }
}
