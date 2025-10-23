import path from 'node:path';
import { EnvironmentConfig } from '../core/env.js';
import { McpClient } from '../core/mcpClient.js';
import { RunLogger, StepRecord } from '../core/logger.js';
import { AgentPlan, PlanStep } from '../core/schema.js';
import { absoluteUrl, poll } from '../core/utils.js';
import { ObserverAgent } from './observerAgent.js';

export interface ExecutionResult {
  steps: StepRecord[];
}

export class ExecutorAgent {
  constructor(
    private readonly client: McpClient,
    private readonly logger: RunLogger,
    private readonly observer: ObserverAgent,
    private readonly environment: EnvironmentConfig,
    private readonly runDir: string
  ) {}

  async execute(plan: AgentPlan): Promise<ExecutionResult> {
    const steps: StepRecord[] = [];
    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      const record: StepRecord = {
        index,
        action: step.action,
        description: step.description,
        status: 'pending',
        startedAt: new Date().toISOString()
      };
      steps.push(record);
      const start = Date.now();
      try {
        await this.executeStep(step, index, record);
        record.status = 'passed';
      } catch (error) {
        record.status = 'failed';
        record.error = (error as Error).message;
        this.logger.error('Step failed', { step: step.action, index, error: record.error });
        (error as any).steps = steps;
        throw error;
      } finally {
        record.completedAt = new Date().toISOString();
        record.durationMs = Date.now() - start;
        const observation = await this.observer.capture(index);
        if (observation) {
          record.observationPath = path.relative(this.runDir, observation.htmlPath);
        }
      }
    }
    return { steps };
  }

  private async executeStep(step: PlanStep, index: number, record: StepRecord): Promise<void> {
    switch (step.action) {
      case 'navigate': {
        const targetUrl = step.url || step.value || step.target;
        if (!targetUrl) {
          throw new Error('navigate action requires url');
        }
        const url = absoluteUrl(this.environment.baseUrl, targetUrl);
        this.logger.info('Navigating', { url });
        await this.client.callTool({ name: 'browser_navigate', arguments: { url } });
        if (step.waitFor) {
          await this.waitForTarget(step.waitFor, step.timeoutMs ?? this.environment.timeoutMs);
        }
        break;
      }
      case 'type': {
        const target = step.target;
        if (!target) {
          throw new Error('type action requires target');
        }
        const value = step.value ?? step.text ?? '';
        await this.typeInto(target, value);
        break;
      }
      case 'click': {
        const target = step.target;
        if (!target) {
          throw new Error('click action requires target');
        }
        await this.click(target);
        break;
      }
      case 'waitFor': {
        const target = step.target || step.waitFor;
        if (!target) {
          throw new Error('waitFor action requires target');
        }
        await this.waitForTarget(target, step.timeoutMs ?? this.environment.timeoutMs);
        break;
      }
      case 'expectVisible': {
        const target = step.target;
        if (!target) {
          throw new Error('expectVisible action requires target');
        }
        await this.expectVisible(target, step.timeoutMs ?? this.environment.timeoutMs);
        break;
      }
      case 'expectText': {
        const target = step.target;
        if (!target) {
          throw new Error('expectText action requires target');
        }
        const text = step.expect ?? step.text ?? step.value;
        if (!text) {
          throw new Error('expectText action requires expected text');
        }
        await this.expectText(target, text, step.timeoutMs ?? this.environment.timeoutMs);
        break;
      }
      case 'screenshot': {
        const screenshotPath = await this.observer.screenshot(
          index,
          step.screenshotName ?? step.value ?? step.description ?? undefined
        );
        if (screenshotPath) {
          record.observationPath = record.observationPath ?? path.relative(this.runDir, screenshotPath);
        }
        break;
      }
      case 'planNote': {
        this.logger.info('Planner note', { message: step.description ?? step.text ?? step.value });
        break;
      }
      default:
        this.logger.warn('Unknown action skipped', { action: step.action });
    }
  }

  private async typeInto(target: string, value: string): Promise<void> {
    this.logger.info('Typing', { target, value });
    const script = `() => {
      ${buildDomHelpersScript()}
      const target = ${JSON.stringify(normalizeTargetInput(target))};
      const el = (__mcpQueryAll(target)[0] || null);
      if (!el) throw new Error('Target not found for type');
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.textContent = ${JSON.stringify(value)};
      }
      return true;
    }`;
    await this.evaluate(script);
  }

  private async click(target: string): Promise<void> {
    this.logger.info('Clicking', { target });
    const script = `() => {
      ${buildDomHelpersScript()}
      const target = ${JSON.stringify(normalizeTargetInput(target))};
      const el = (__mcpQueryAll(target)[0] || null);
      if (!el) throw new Error('Target not found for click');
      el.click();
      return true;
    }`;
    await this.evaluate(script);
  }

  private async waitForTarget(target: string, timeoutMs: number): Promise<void> {
    this.logger.info('Waiting for target', { target, timeoutMs });
    const script = buildExistsScript(target);
    await poll(async () => {
      const result = await this.evaluate(script);
      return isTruthy(result);
    }, { timeoutMs, intervalMs: 500 });
  }

  private async expectVisible(target: string, timeoutMs: number): Promise<void> {
    const script = buildVisibleScript(target);
    await poll(async () => {
      const result = await this.evaluate(script);
      return isTruthy(result);
    }, { timeoutMs, intervalMs: 500 });
  }

  private async expectText(target: string, expected: string, timeoutMs: number): Promise<void> {
    const script = buildTextContentScript(target);
    await poll(async () => {
      const result = await this.evaluate(script);
      const text = extractText(result);
      return text.includes(expected);
    }, { timeoutMs, intervalMs: 500 });
  }

  private async evaluate(script: string): Promise<any> {
    return this.client.callTool({ name: 'browser_evaluate', arguments: { function: script } });
  }
}

export interface NormalizedTarget {
  selector?: string;
  css?: string;
  testId?: string;
  role?: string;
  name?: string;
  text?: string;
  exact?: boolean;
  nth?: number;
}

export function normalizeTargetInput(target: string): NormalizedTarget {
  const trimmed = target.trim();
  if (trimmed.startsWith('role=')) {
    const rest = trimmed.slice('role='.length);
    const match = rest.match(/([^\[]+)(?:\[(.+)\])?/);
    const role = match ? match[1].trim() : rest.trim();
    const normalized: NormalizedTarget = { role };
    if (match && match[2]) {
      const inner = match[2];
      const nameMatch = inner.match(/name\s*=\s*"([^"]+)"/i);
      if (nameMatch) {
        normalized.name = nameMatch[1];
      }
    }
    return normalized;
  }
  if (trimmed.startsWith('data-testid=')) {
    return { testId: trimmed.slice('data-testid='.length).replace(/^"|"$/g, '') };
  }
  if (trimmed.startsWith('text=')) {
    return { text: trimmed.slice('text='.length).replace(/^"|"$/g, '') };
  }
  if (trimmed.startsWith('css=')) {
    return { css: trimmed.slice('css='.length) };
  }
  return { selector: trimmed };
}

export function buildDomHelpersScript(): string {
  return `
    const __implicitRoles = {
      button: 'button',
      summary: 'button',
      input: 'textbox',
      textarea: 'textbox',
      select: 'combobox',
      a: 'link',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      h4: 'heading',
      h5: 'heading',
      h6: 'heading'
    };
    function __mcpRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit.toLowerCase();
      const tag = el.tagName.toLowerCase();
      const implicit = __implicitRoles[tag];
      if (implicit === 'heading') {
        return 'heading';
      }
      return implicit || '';
    }
    function __mcpName(el) {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) {
          return (labelEl.textContent || '').trim();
        }
      }
      if (el.tagName.toLowerCase() === 'input') {
        const id = el.getAttribute('id');
        if (id) {
          const label = document.querySelector('label[for="' + id + '"]');
          if (label) {
            return (label.textContent || '').trim();
          }
        }
      }
      return (el.textContent || '').trim();
    }
    function __mcpMatchesText(el, text, exact) {
      if (!text) return true;
      const content = (el.textContent || '').trim();
      if (exact) {
        return content === text;
      }
      return content.includes(text);
    }
    function __mcpMatchesTarget(el, target) {
      if (!el) return false;
      if (target.selector) {
        return el.matches(target.selector);
      }
      if (target.css) {
        return el.matches(target.css);
      }
      if (target.testId) {
        return el.getAttribute('data-testid') === target.testId;
      }
      if (target.role) {
        if (__mcpRole(el) !== target.role.toLowerCase()) {
          return false;
        }
        if (target.name && !__mcpMatchesText(el, target.name, target.exact)) {
          return false;
        }
        return true;
      }
      if (target.text) {
        return __mcpMatchesText(el, target.text, target.exact);
      }
      return true;
    }
    function __mcpQueryAll(target, within) {
      const root = within || document;
      if (target.selector) {
        return Array.from(root.querySelectorAll(target.selector));
      }
      if (target.css) {
        return Array.from(root.querySelectorAll(target.css));
      }
      if (target.testId) {
        return Array.from(root.querySelectorAll('[data-testid="' + target.testId + '"]'));
      }
      const all = Array.from(root.querySelectorAll('*'));
      return all.filter(el => __mcpMatchesTarget(el, target));
    }
  `;
}

export function buildExistsScript(target: string): string {
  const helpers = buildDomHelpersScript();
  const normalized = normalizeTargetInput(target);
  return `() => {
    ${helpers}
    const target = ${JSON.stringify(normalized)};
    const matches = __mcpQueryAll(target);
    return matches.length > 0;
  }`;
}

export function buildVisibleScript(target: string): string {
  const helpers = buildDomHelpersScript();
  const normalized = normalizeTargetInput(target);
  return `() => {
    ${helpers}
    const target = ${JSON.stringify(normalized)};
    const matches = __mcpQueryAll(target);
    if (!matches.length) return false;
    const el = matches[0];
    const rect = el.getBoundingClientRect();
    return !!rect.width || !!rect.height;
  }`;
}

export function buildTextContentScript(target: string): string {
  const helpers = buildDomHelpersScript();
  const normalized = normalizeTargetInput(target);
  return `() => {
    ${helpers}
    const target = ${JSON.stringify(normalized)};
    const matches = __mcpQueryAll(target);
    if (!matches.length) return '';
    return (matches[0].textContent || '').trim();
  }`;
}

export function extractText(result: any): string {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content
    .map((item: any) => {
      if (typeof item?.text === 'string') {
        return item.text;
      }
      if (typeof item?.value === 'string') {
        return item.value;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

export function isTruthy(result: any): boolean {
  const text = extractText(result).toLowerCase();
  if (!text) {
    return false;
  }
  return ['true', '1', 'yes', 'on'].some(flag => text.includes(flag));
}
