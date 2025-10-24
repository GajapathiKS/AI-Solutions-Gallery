// src/cli-dom.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Command } from "commander";
import { fileURLToPath } from "url";

import { RunLogger } from "./core/logger.js";
import { McpClient, setSharedMcpClient } from "./core/mcpClient.js";
import { BedrockClient, setSharedBedrockClient } from "./core/bedrockClient.js";
import { DomIntelligentAgent } from "./agents/domIntelligentAgent.js";
import { loadAgentConfig, selectEnvironment } from "./core/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const program = new Command();
  program
    .argument("<testFile>", "Path to the goal/test text file")
    .option("--env <name>", "Environment key (dev|qa|prod)")
    .option("--run-id <id>", "Run identifier for artifacts/logs")
    .option("--url <url>", "Target URL to test (overrides test file URL if any)");

  program.parse(process.argv);
  const [testFile] = program.args;
  const opts = program.opts<{ env?: string; runId?: string; url?: string }>();

  // Load environment variables
  if (opts.env) {
    dotenv.config({ path: path.resolve(__dirname, `../.env.${opts.env}`) });
  } else {
    dotenv.config();
  }

  if (!testFile) {
    console.error("Missing <testFile> argument");
    process.exit(1);
  }

  const configPath = path.resolve(__dirname, "../agent.config.json");
  const config = loadAgentConfig(configPath);
  const envSel = selectEnvironment(config, opts.env);
  const runId = opts.runId || `dom-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const artifactsRoot = path.resolve(__dirname, "..", config.artifactsDir || "reports");
  const runDir = path.join(artifactsRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const logger = new RunLogger(runId, runDir);
  logger.info("DOM-Intelligent Run started", { runId, startedAt: new Date().toISOString() });
  logger.info("Loaded test goal", { file: path.resolve(testFile) });

  const goalText = fs.readFileSync(path.resolve(testFile), "utf-8");
  
  // Extract URL from goal or use command line override
  const targetUrl = opts.url || envSel.settings.baseUrl || "http://localhost:4200";
  logger.info("Target URL", { url: targetUrl });

  // Initialize Bedrock client
  const bedrock = new BedrockClient();
  setSharedBedrockClient(bedrock);
  
  // Start MCP client and connect to server
  const mcpClient = new McpClient(logger);
  await mcpClient.connect(config.mcp);
  setSharedMcpClient(mcpClient);

  try {
    const domAgent = new DomIntelligentAgent(mcpClient, logger, bedrock);
    await domAgent.executeGoalWithDom(goalText, targetUrl);
    
    logger.info("DOM-Intelligent Run finished", { runId, artifactsDir: runDir });
    console.log(`✅ Test completed successfully!`);
    console.log(`Artifacts: ${runDir}`);
    process.exitCode = 0;
  } catch (err: any) {
    logger.error("DOM-Intelligent Run failed", { error: err?.message || String(err) });
    console.error(`❌ Test failed: ${err?.message}`);
    process.exitCode = 1;
  } finally {
    await mcpClient.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
