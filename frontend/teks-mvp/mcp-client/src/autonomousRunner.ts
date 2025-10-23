#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const REGION = process.env.AWS_REGION ?? "eu-north-1";
const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4200";
const RUN_ID = Date.now().toString();

if (!TOKEN) {
    console.error("Missing AWS_BEARER_TOKEN_BEDROCK");
    process.exit(1);
}

const REPORT_DIR = path.join("reports", `auto-${RUN_ID}`);
fs.mkdirSync(REPORT_DIR, { recursive: true });

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// --- Simple Bedrock conversation helper ---
async function askModel(prompt: string): Promise<string> {
    const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;
    const body = {
        system: [{ text: "You are an autonomous test agent that drives a browser like a human." }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 600 }
    };
    const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    return json?.output?.message?.content?.[0]?.text ?? "";
}

// --- MCP wiring ---
async function withPlaywrightMCP(fn: (client: Client) => Promise<void>) {
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        env: { ...process.env, PWDEBUG: "0", HEADLESS: "0" }
    });
    const client = new Client({ name: "autonomous-runner", version: "0.1.0" });
    await client.connect(transport);
    try { await fn(client); } finally { await client.close(); }
}

// --- Main logic ---
async function runScenario(scenario: string) {
    console.log(`🚀 Starting autonomous run: ${scenario}`);

    await withPlaywrightMCP(async (client) => {
        const tools = await client.listTools();
        const canRead = tools.tools.find(t => /read|dump/i.test(t.name))?.name;
        const canNavigate = tools.tools.find(t => /navigate/i.test(t.name))?.name;
        const canClick = tools.tools.find(t => /click/i.test(t.name))?.name;
        const canType = tools.tools.find(t => /type/i.test(t.name))?.name;
        const canScreenshot = tools.tools.find(t => /screenshot/i.test(t.name))?.name;

        // Start on base URL
        await client.callTool({ name: canNavigate!, arguments: { url: BASE_URL } });
        await sleep(1500);

        for (let step = 1; step <= 12; step++) {
            // 1️⃣ Observe
            // Safely extract visible page text from MCP response
            const obs: any = await client.callTool({ name: canRead!, arguments: {} }).catch(() => ({ content: [{ text: "" }] }));
            const firstContent = Array.isArray(obs?.content) ? obs.content[0] : {};
            const pageText = typeof firstContent?.text === "string" ? firstContent.text.slice(0, 2000) : "";
            fs.writeFile


            // 2️⃣ Decide
            const prompt = `
Current page text (truncated):
${pageText}

Scenario: ${scenario}
Step ${step}: Describe ONE next browser action (navigate, click, type, wait, screenshot, or finish).
Output JSON only, e.g. {"action":"click","text":"Sign In"} or {"action":"finish","reason":"Dashboard visible"}.
`;
            const llm = await askModel(prompt);
            fs.writeFileSync(path.join(REPORT_DIR, `step_${step}_llm.txt`), llm);

            let next: any;
            try { next = JSON.parse(llm.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { next = {}; }
            if (next.action === "finish") {
                console.log(`✅ ${next.reason || "Goal reached"}`);
                break;
            }

            // 3️⃣ Act
            try {
                if (next.action === "navigate" && next.url) {
                    await client.callTool({ name: canNavigate!, arguments: { url: next.url } });
                } else if (next.action === "click" && next.text) {
                    await client.callTool({ name: canClick!, arguments: { text: next.text } });
                } else if (next.action === "type" && next.text && next.value) {
                    await client.callTool({ name: canType!, arguments: { text: next.text, value: next.value } });
                } else if (next.action === "screenshot") {
                    await client.callTool({ name: canScreenshot!, arguments: { fullPage: true } });
                }
            } catch (e) {
                console.error(`Step ${step} failed:`, e);
            }

            await sleep(1500);
        }
    });

    console.log(`🧾 Results in ${REPORT_DIR}`);
}

const scenario = process.argv.slice(2).join(" ") || "Login with admin credentials and verify dashboard loads.";
runScenario(scenario).catch(console.error);
