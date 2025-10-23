#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { runAgenticTest } from './core/orchestrator.js';

const program = new Command();

program
  .name('playwright-mcp-agent')
  .description('Agentic Playwright MCP test runner powered by Bedrock')
  .argument('<file>', 'Path to the plain text test goal')
  .option('-e, --env <name>', 'Environment key defined in config')
  .option('--run-id <id>', 'Custom run identifier')
  .option('--debug', 'Enable verbose logging', false)
  .action(async (file: string, options: { env?: string; runId?: string; debug?: boolean }) => {
    try {
      const resolved = path.resolve(file);
      const result = await runAgenticTest({
        file: resolved,
        env: options.env,
        runId: options.runId,
        debug: options.debug
      });
      console.log(JSON.stringify({
        status: result.summary.verification?.status ?? 'passed',
        artifactsDir: result.artifactsDir
      }, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('Run failed');
      console.error((error as Error).stack ?? (error as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
