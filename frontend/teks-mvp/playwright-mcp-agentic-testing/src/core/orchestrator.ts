// src/core/orchestrator.ts
import fs from 'fs/promises';
import { PlannerAgent } from '../agents/plannerAgent.js';
// import { ObserverAgent } from '../agents/observerAgent.js'; // not used in current flow
import { ExecutorAgent } from '../agents/executorAgent.js';
import { BedrockClient, setSharedBedrockClient } from './bedrockClient.js';

import { McpClient } from './mcpClient.js';
import { RunLogger } from './logger.js';
import type { EnvironmentSettings } from './env.js';

export interface OrchestratorOptions { runDir: string }

export async function runAgenticTest(
  goalText: string,
  client: McpClient,
  env: EnvironmentSettings,
  logger: RunLogger,
  options: OrchestratorOptions
): Promise<void> {
  // Ensure artifacts directory exists
  await fs.mkdir(options.runDir, { recursive: true });

  // 1) Plan using Bedrock-backed planner with baseline fallback
  const bedrock = process.env.AWS_BEARER_TOKEN_BEDROCK ? new BedrockClient() : undefined;
  if (bedrock) setSharedBedrockClient(bedrock);
  const planner = new PlannerAgent(logger, bedrock);
  const plan = await planner.createPlan(goalText, { baseUrl: env.baseUrl, timeoutMs: env.timeoutMs });

  // 2) (Optional) Observation phase could be added here if needed

  // 3) Execute steps into artifacts dir
  const executor = new ExecutorAgent(client, logger, env, options.runDir);
  await executor.executePlan(plan);

  // 4) Run verifications (if any)
  await executor.verify(plan.verification || []);

  // 5) Capture console messages and network requests for debugging
  try {
    const consoleRes = await client.callTool({ name: 'browser_console_messages', arguments: {} });
    logger.info('Console messages captured', { data: consoleRes });
    
    const networkRes = await client.callTool({ name: 'browser_network_requests', arguments: {} });
    logger.info('Network requests captured', { data: networkRes });
  } catch (e: any) {
    logger.warn('Failed to capture debug info', { error: e?.message });
  }

  // 6) Close browser to prevent "Restore pages" popup on next run
  try {
    await client.callTool({ name: 'browser_close', arguments: {} });
    logger.info('Browser closed successfully');
  } catch (e: any) {
    logger.warn('Failed to close browser', { error: e?.message });
  }

  // (Optional) Final observation could be added here
}
