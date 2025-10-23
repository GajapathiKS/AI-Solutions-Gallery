import path from 'node:path';
import { loadEnvFile, loadAgentConfig, prepareRunDirectories, resolveEnvironment, resolveMcpLaunch } from './env.js';
import { readTextFile, slugify, formatTimestamp, writeJson } from './utils.js';
import { createLogger, persistSummary, RunSummary, StepRecord } from './logger.js';
import { McpClient } from './mcpClient.js';
import { PlannerAgent } from '../agents/plannerAgent.js';
import { ObserverAgent } from '../agents/observerAgent.js';
import { ExecutorAgent } from '../agents/executorAgent.js';
import { VerifierAgent, VerificationResult } from '../agents/verifierAgent.js';
import { AgentPlan } from './schema.js';

export interface RunOptions {
  file: string;
  env?: string;
  runId?: string;
  debug?: boolean;
}

export interface RunOutcome {
  summary: RunSummary;
  artifactsDir: string;
}

export async function runAgenticTest(options: RunOptions): Promise<RunOutcome> {
  loadEnvFile();
  const config = loadAgentConfig();
  const environmentSelection = resolveEnvironment(config, options.env);
  const runLabel = options.runId || `${formatTimestamp()}-${slugify(path.basename(options.file))}`;
  const paths = prepareRunDirectories(config, runLabel);
  const logger = createLogger(paths.runDir, runLabel, options.debug ? 'debug' : 'info');

  const goalText = readTextFile(options.file);
  logger.info('Loaded test goal', { file: options.file });

  const planner = new PlannerAgent(logger);
  const plan = await planner.createPlan(goalText, {
    baseUrl: environmentSelection.settings.baseUrl,
    headless: environmentSelection.settings.headless,
    timeoutMs: environmentSelection.settings.timeoutMs
  });

  const mcpLaunch = resolveMcpLaunch(config);
  const client = new McpClient({
    command: mcpLaunch.command,
    cwd: mcpLaunch.cwd,
    debug: options.debug
  });
  await client.start();
  await client.initialize('playwright-mcp-agentic-orchestrator', '0.1.0');

  const observer = new ObserverAgent(client, logger, paths.runDir);
  const executor = new ExecutorAgent(client, logger, observer, environmentSelection.settings, paths.runDir);
  const verifier = new VerifierAgent(client, logger, environmentSelection.settings);

  const startedAt = new Date();
  let executionPlan: AgentPlan | undefined = plan;
  let executionSteps: StepRecord[] = [];
  let verification: VerificationResult = { status: 'passed', details: undefined };

  let failure: Error | undefined;
  try {
    const execution = await executor.execute(plan);
    executionSteps = execution.steps;
    const verificationResult = await verifier.verify(plan);
    verification = verificationResult;
  } catch (error) {
    failure = error as Error;
    if (Array.isArray((failure as any).steps)) {
      executionSteps = (failure as any).steps as StepRecord[];
    }
    verification = { status: 'failed', details: failure.message };
  } finally {
    await client.stop();
    logger.info('Run finished');
    logger.close();
  }

  const summary: RunSummary = {
    runId: runLabel,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    environment: environmentSelection.name,
    plan: executionPlan,
    steps: executionSteps,
    verification
  };

  persistSummary(path.join(paths.runDir, 'run-summary.json'), summary);
  writeJson(path.join(paths.runDir, 'plan.json'), executionPlan);
  writeJson(path.join(paths.runDir, 'goal.json'), { file: options.file, goal: goalText });

  if (failure) {
    throw failure;
  }

  return {
    summary,
    artifactsDir: paths.runDir
  };
}
