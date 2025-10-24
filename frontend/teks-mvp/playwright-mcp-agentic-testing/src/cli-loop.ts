// src/cli-loop.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import { runAgentLoop } from "./core/loopOrchestrator.js";
import { logger, RunLogger } from "./core/logger.js";
import { McpClient, setSharedMcpClient } from "./core/mcpClient.js";
import { BedrockClient, setSharedBedrockClient } from "./core/bedrockClient.js";
import { loadAgentConfig, selectEnvironment } from "./core/env.js";

function getArg(flag: string, dflt?: string) {
  const idx = process.argv.indexOf(flag);
  return idx > -1 ? process.argv[idx + 1] : dflt;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Check if first arg is a file path (positional) or use --goal flag
  const firstArg = process.argv[2];
  let goalText: string;
  
  if (firstArg && !firstArg.startsWith("--") && fs.existsSync(firstArg)) {
    // Read goal from file
    goalText = fs.readFileSync(path.resolve(firstArg), "utf-8").trim();
  } else {
    // Use --goal flag or default
    goalText = getArg("--goal") || "Create student and verify in list";
  }
  
  const urlArg = getArg("--url");
  const maxSteps = Number(getArg("--max-steps", "12"));
  const envName = getArg("--env");
  const runId = getArg("--run-id") || `loop-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (envName) {
    dotenv.config({ path: path.resolve(__dirname, `../.env.${envName}`) });
  } else {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
  }

  const configPath = path.resolve(__dirname, "../agent.config.json");
  const config = loadAgentConfig(configPath);
  const envSel = selectEnvironment(config, envName);

  const artifactsRoot = path.resolve(__dirname, "..", config.artifactsDir || "reports");
  const runDir = path.join(artifactsRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const runLogger = new RunLogger(runId, runDir);
  
  // Initialize Bedrock client
  const bedrock = new BedrockClient();
  setSharedBedrockClient(bedrock);
  
  const mcp = new McpClient(runLogger);
  await mcp.connect(config.mcp);
  setSharedMcpClient(mcp);

  const targetUrl = urlArg || envSel.settings.baseUrl;

  logger.info({ t: "cli", goal: goalText, url: targetUrl, maxSteps, runId });

  try {
    const result = await runAgentLoop({ goal: goalText, url: targetUrl, maxSteps });
    logger.info({ t: "result", result });
    if (result.status !== "done") process.exitCode = 1;
  } catch (error) {
    logger.error({ t: "error", error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    await mcp.close().catch(() => {});
  }
}

main().catch(err => {
  logger.error({ t: "fatal", error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
