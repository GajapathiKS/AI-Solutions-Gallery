#!/usr/bin/env node
/**
 * 🤖 Fully Autonomous Playwright MCP Client with Amazon Bedrock Nova Lite
 * Author: Gajapathi's AI Assistant
 *
 * Flow:
 *   1️⃣ Reads natural-language goal from test file
 *   2️⃣ Connects to @playwright/mcp CLI (browser controller)
 *   3️⃣ Sends goal + page snapshot to Bedrock Nova Lite
 *   4️⃣ Executes returned JSON actions autonomously
 *   5️⃣ Verifies success by detecting '/dashboard' or equivalent URLs
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { execPath } from "process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// --- Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Bedrock configuration
const REGION = process.env.AWS_REGION ?? "eu-north-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
if (!TOKEN) {
  console.error("❌ Missing AWS_BEARER_TOKEN_BEDROCK");
  process.exit(1);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Ask Bedrock Nova Lite
async function askBedrock(prompt: string): Promise<string> {
  const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(
    MODEL_ID
  )}/converse`;

  const body = {
    system: [
      {
        text: "You are an autonomous test executor controlling a Playwright MCP browser. Always respond with one JSON object like {\"action\":\"click\",\"text\":\"Sign In\"}. Supported actions: navigate, type, click, screenshot, finish. Never include prose or commentary.",
      },
    ],
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { temperature: 0.3, maxTokens: 600 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return json?.output?.message?.content?.[0]?.text ?? JSON.stringify(json, null, 2);
}

// --- Start Playwright MCP server
async function startMCP() {
  const mcpCli = path.resolve(__dirname, "../node_modules/@playwright/mcp/cli.js");
  if (!fs.existsSync(mcpCli)) {
    console.error(`❌ Could not find MCP CLI at: ${mcpCli}`);
    process.exit(1);
  }

  console.log(`🟡 Launching MCP Server: node ${mcpCli}`);

  // ✅ No extra args — CLI auto-serves on stdio
  const serverProc = spawn(execPath, [mcpCli], {
    stdio: ["pipe", "pipe", "inherit"],
    detached: false,
  });

  // give the server a short head-start
  await new Promise((r) => setTimeout(r, 2500));

  // create transport + client
  const transport = new StdioClientTransport({
    command: execPath,
    args: [mcpCli],
  });

  // wire stdio
  // @ts-ignore
  transport.stdin = serverProc.stdin!;
  // @ts-ignore
  transport.stdout = serverProc.stdout!;

  const client = new Client({ name: "autonomous-client", version: "1.0.0" });

  await client.connect(transport);
  console.log("🔗 Connected to MCP server.");

  // quick tool check
  const tools = await client.listTools();
  console.log("🧩 Tools:", tools.tools.map((t: any) => t.name));

  return client;
}



// --- Autonomous execution
async function runAutonomousTest(testFile: string) {
  const goal = fs.readFileSync(testFile, "utf8").trim();
  console.log(`🚀 Autonomous Test Started: ${testFile}`);
  console.log(`🧠 Goal: ${goal}`);

  const client = await startMCP();
  const tools = await client.listTools();
  console.log("🧩 Tools:", tools.tools.map((t) => t.name));

  const runDir = path.join("reports", Date.now().toString(36));
  fs.mkdirSync(runDir, { recursive: true });

  let step = 0;
  let currentUrl = "";
  let lastAction = "";

  while (step < 25) {
    step++;
    console.log(`➡️ Step ${step}`);

    // --- Observe
    let snapshot = "";
    try {
      const snap: any = await client.callTool({
  name: "browser_snapshot",
  arguments: {},
});
snapshot = snap?.content?.[0]?.text ?? "";

    } catch {
      snapshot = "";
    }

    // --- Ask LLM for next step
    const llmPrompt = `
You are controlling a browser via Playwright MCP.
Goal: ${goal}
Current Page:
${snapshot}

Think step-by-step and output ONE JSON action.
Examples:
{"action":"navigate","url":"http://localhost:4200/login"}
{"action":"type","text":"Username","value":"admin"}
{"action":"type","text":"Password","value":"ChangeMe123!"}
{"action":"click","text":"Sign In"}
{"action":"finish","reason":"Dashboard visible"}
`;
    const llmText = await askBedrock(llmPrompt);
    fs.writeFileSync(path.join(runDir, `step_${step}_llm.json`), llmText);

    let next: any = {};
    try {
      next = JSON.parse(llmText.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    } catch {
      next = {};
    }

    if (next.action === "finish") {
      console.log(`✅ ${next.reason || "Goal achieved"}`);
      break;
    }

    // --- Execute next action
    try {
      if (next.action === "navigate" && next.url) {
        await client.callTool({ name: "browser_navigate", arguments: { url: next.url } });
      } else if (next.action === "click" && next.text) {
        await client.callTool({ name: "browser_click", arguments: { text: next.text } });
      } else if (next.action === "type" && next.text && next.value) {
        await client.callTool({
          name: "browser_type",
          arguments: { text: next.text, value: next.value },
        });
      } else if (next.action === "screenshot") {
        await client.callTool({
          name: "browser_take_screenshot",
          arguments: { fullPage: true },
        });
      } else {
        console.log("⚠️ Unknown or incomplete action:", next);
      }
    } catch (err: any) {
      console.log(`❌ Action failed: ${err.message}`);
    }

    // --- Verify URL
    try {
     const res: any = await client.callTool({
  name: "browser_tabs",
  arguments: {},
});
currentUrl = res?.content?.[0]?.text ?? "";

      if (currentUrl.includes("/dashboard") || currentUrl.endsWith("dashboard")) {
        console.log(`🎯 Verification success: Dashboard URL reached -> ${currentUrl}`);
        break;
      }
    } catch {
      currentUrl = "";
    }

    // --- Log snapshot
    fs.writeFileSync(path.join(runDir, `step_${step}_page.txt`), snapshot.slice(0, 2500));
    lastAction = next.action;
    await sleep(2000);
  }

  fs.writeFileSync(
    path.join(runDir, "summary.txt"),
    `Last action: ${lastAction}\nFinal URL: ${currentUrl}`
  );

  await client.close();
  console.log(`🧾 Results stored at ${runDir}`);
  console.log("🏁 MCP Autonomous Run Completed.");
}

// --- Entry point
const testFile = process.argv[2];
if (!testFile) {
  console.error("Usage: node dist/client.js tests/sample-login.txt");
  process.exit(1);
}

runAutonomousTest(testFile).catch(console.error);
