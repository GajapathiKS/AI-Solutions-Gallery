import { EnvironmentConfig } from '../core/env.js';
import { McpClient } from '../core/mcpClient.js';
import { RunLogger } from '../core/logger.js';
import { AgentPlan } from '../core/schema.js';
import { poll } from '../core/utils.js';
import { buildExistsScript, buildTextContentScript, buildVisibleScript, extractText, isTruthy } from './executorAgent.js';

export interface VerificationResult {
  status: 'passed' | 'failed';
  details?: string;
}

export class VerifierAgent {
  constructor(
    private readonly client: McpClient,
    private readonly logger: RunLogger,
    private readonly environment: EnvironmentConfig
  ) {}

  async verify(plan: AgentPlan): Promise<VerificationResult> {
    if (!plan.verification.length) {
      this.logger.info('No verification steps provided; marking as passed by default');
      return { status: 'passed', details: 'Plan did not define verification steps.' };
    }
    try {
      for (const verifyStep of plan.verification) {
        const timeout = verifyStep.timeoutMs ?? this.environment.timeoutMs;
        this.logger.info('Verifying outcome', { type: verifyStep.type, target: verifyStep.target, value: verifyStep.value });
        if (verifyStep.type === 'visible') {
          await poll(async () => {
            const result = await this.client.callTool({
              name: 'browser_evaluate',
              arguments: { function: buildVisibleScript(verifyStep.target) }
            });
            return isTruthy(result);
          }, { timeoutMs: timeout, intervalMs: 500 });
        } else if (verifyStep.type === 'text') {
          await poll(async () => {
            const result = await this.client.callTool({
              name: 'browser_evaluate',
              arguments: { function: buildTextContentScript(verifyStep.target) }
            });
            const text = extractText(result);
            return verifyStep.value ? text.includes(verifyStep.value) : Boolean(text);
          }, { timeoutMs: timeout, intervalMs: 500 });
        } else if (verifyStep.type === 'url') {
          await poll(async () => {
            const result = await this.client.callTool({
              name: 'browser_evaluate',
              arguments: { function: '() => window.location.href' }
            });
            const text = extractText(result);
            return verifyStep.value ? text.includes(verifyStep.value) : Boolean(text);
          }, { timeoutMs: timeout, intervalMs: 500 });
        } else {
          await poll(async () => {
            const result = await this.client.callTool({
              name: 'browser_evaluate',
              arguments: { function: buildExistsScript(verifyStep.target) }
            });
            return isTruthy(result);
          }, { timeoutMs: timeout, intervalMs: 500 });
        }
      }
      return { status: 'passed' };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error('Verification failed', { error: message });
      return { status: 'failed', details: message };
    }
  }
}
