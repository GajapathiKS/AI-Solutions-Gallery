// src/client.ts
// MCP runner: Bedrock (Nova Lite) over Converse + SQLite logging + per-run artifacts.
// Node 18+, TS NodeNext/ESM.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { v4 as uuid } from "uuid";
import * as fs from "node:fs";
import * as path from "node:path";
import { openDb, upsertRun, insertSteps } from "./db.js";
// ---------- Config ----------
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4200";
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const REPORT_DIR = process.env.REPORT_DIR ?? "reports";
const TESTS_DIR = process.env.TESTS_DIR ?? "tests";
const REGION = process.env.AWS_REGION || "eu-north-1";
const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? 20000);
// One folder per run (stable id if provided)
const RUN_ID = process.env.RUN_ID || uuid().slice(0, 8);
if (!TOKEN) {
    console.error("Missing AWS_BEARER_TOKEN_BEDROCK in env.");
    process.exit(1);
}
// ---------- FS helpers ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function writeTXT(p, text) { fs.writeFileSync(p, text); }
function safePath(base, name) { return path.join(base, name); }
function redact(s) { return s ? (s.length <= 12 ? "***" : s.slice(0, 6) + "..." + s.slice(-4)) : s; }
function cleanEnv(src) {
    return Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined));
}
// ---------- Extract + validate ----------
function extractJsonArray(text) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) {
        const parsed = JSON.parse(fence[1].trim().replace(/^\uFEFF/, ""));
        if (Array.isArray(parsed))
            return parsed;
    }
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed))
            return parsed;
    }
    const parsed = JSON.parse(text.trim().replace(/^\uFEFF/, ""));
    if (Array.isArray(parsed))
        return parsed;
    throw new Error("Parsed JSON is not an array");
}
const allowed = ["navigate", "type", "click", "waitFor", "screenshot", "assertVisible"];
function validateSteps(steps) {
    if (!Array.isArray(steps))
        return { ok: false, error: "Output is not an array" };
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!s || typeof s !== "object")
            return { ok: false, error: `Step ${i + 1} is not an object` };
        if (!allowed.includes(s.action))
            return { ok: false, error: `Step ${i + 1}: invalid action '${s.action}'` };
        if (["type", "click", "waitFor", "assertVisible"].includes(s.action) && typeof s.selector !== "string")
            return { ok: false, error: `Step ${i + 1}: '${s.action}' requires 'selector'` };
        if (s.action === "type" && typeof s.value !== "string")
            return { ok: false, error: `Step ${i + 1}: 'type' requires 'value'` };
        if (s.action === "screenshot" && s.name && typeof s.name !== "string")
            return { ok: false, error: `Step ${i + 1}: screenshot 'name' must be string` };
    }
    return { ok: true, steps: steps };
}
// small helpers to derive selectors from "field" / "text"
function selectorFromField(field) {
    // Prefer label-based targeting (works with Playwright selectors the MCP understands)
    return `label=${field}`;
}
function selectorFromTextForClick(text) {
    // Try a role button first; runner can fall back in prelude or later steps if needed
    return `role=button[name="${text}"]`;
}
function selectorFromText(text) {
    // Generic "element containing text"
    return `text=${text}`;
}
function normalizeStep(obj) {
    if (!obj || typeof obj !== "object")
        return null;
    // --- Already canonical ------------------------------------------------------
    // Handle: { action:"waitFor", redirect:true }  --> assume dashboard visible after login
    if (obj.action === "waitFor" && obj.redirect === true && !obj.selector) {
        // Default to a robust post-login signal. Adjust if your app uses a different landing cue.
        return { action: "waitFor", selector: 'role=heading[name=/dashboard/i]' };
    }
    // Also handle: { action:"waitFor", urlContains:"/dashboard" } style hints (if the LLM sends them)
    if (obj.action === "waitFor" && typeof obj.urlContains === "string" && !obj.selector) {
        // Use a visible UI cue instead of URL polling (MCP tools are DOM-oriented)
        return { action: "waitFor", selector: 'role=heading[name=/dashboard/i]' };
    }
    if (typeof obj.action === "string") {
        // Fix common field-name drift inside canonical objects
        // 1) type: { action, selector, text }  -> use "value"
        if (obj.action === "type" && typeof obj.selector === "string" && typeof obj.text === "string") {
            return { action: "type", selector: obj.selector, value: String(obj.text) };
        }
        // 2) type: { action, field, text } -> derive selector from field
        if (obj.action === "type" && typeof obj.field === "string" && typeof obj.text === "string") {
            return { action: "type", selector: selectorFromField(obj.field), value: String(obj.text) };
        }
        // 3) screenshot: { action, filename } -> use "name"
        if (obj.action === "screenshot" && typeof obj.filename === "string") {
            return { action: "screenshot", name: String(obj.filename) };
        }
        // 4) click: { action, text } -> derive button selector
        if (obj.action === "click" && typeof obj.text === "string" && !obj.selector) {
            return { action: "click", selector: selectorFromTextForClick(obj.text) };
        }
        // 5) waitFor/assertVisible: { action, text } -> derive generic text selector
        if ((obj.action === "waitFor" || obj.action === "assertVisible") &&
            typeof obj.text === "string" && !obj.selector) {
            return { action: obj.action, selector: selectorFromText(obj.text) };
        }
        // 6) ensure "type" uses "value" if it's given as "value" already
        if (obj.action === "type" && typeof obj.selector === "string" && typeof obj.value === "string") {
            return { action: "type", selector: obj.selector, value: obj.value };
        }
        // If it already fits our schema, pass through
        return obj;
    }
    // --- Shorthand objects (no "action" key) -----------------------------------
    // { "navigate": "/x" }
    if (typeof obj.navigate === "string") {
        return { action: "navigate", url: obj.navigate };
    }
    // { "waitFor": "text=..." } or { "waitFor": "Dashboard" }
    if (typeof obj.waitFor === "string") {
        const sel = obj.waitFor.startsWith("text=") || obj.waitFor.includes("=")
            ? obj.waitFor
            : selectorFromText(obj.waitFor);
        return { action: "waitFor", selector: sel };
    }
    // { "click": "button text" } or { click: { text: "..." } }
    if (typeof obj.click === "string") {
        return { action: "click", selector: selectorFromTextForClick(obj.click) };
    }
    if (obj.click && typeof obj.click === "object" && typeof obj.click.text === "string") {
        return { action: "click", selector: selectorFromTextForClick(obj.click.text) };
    }
    // { "assertVisible": "something" }
    if (typeof obj.assertVisible === "string") {
        const sel = obj.assertVisible.startsWith("text=") || obj.assertVisible.includes("=")
            ? obj.assertVisible
            : selectorFromText(obj.assertVisible);
        return { action: "assertVisible", selector: sel };
    }
    // { "type": { selector: "...", text/value: "..." } }
    if (obj.type && typeof obj.type === "object") {
        const sel = typeof obj.type.selector === "string"
            ? obj.type.selector
            : (typeof obj.type.field === "string" ? selectorFromField(obj.type.field) : null);
        const val = typeof obj.type.value === "string"
            ? obj.type.value
            : (typeof obj.type.text === "string" ? obj.type.text : null);
        if (sel && val)
            return { action: "type", selector: sel, value: val };
    }
    // { "type": "selector=...,value=..." } (rare)
    if (typeof obj.type === "string") {
        const m = obj.type.match(/selector=(.*?),\s*value=(.*)/);
        if (m)
            return { action: "type", selector: m[1].trim(), value: m[2].trim() };
    }
    // { "screenshot": "name=foo" } or { "screenshot": "foo" } or { "screenshot": { name:"foo" } }
    if (typeof obj.screenshot === "string") {
        const m = obj.screenshot.match(/^name=(.*)$/i);
        return { action: "screenshot", name: (m ? m[1] : obj.screenshot).trim() };
    }
    if (obj.screenshot && typeof obj.screenshot === "object" && typeof obj.screenshot.name === "string") {
        return { action: "screenshot", name: obj.screenshot.name };
    }
    // Generic fallbacks
    if (typeof obj.selector === "string" && typeof obj.value === "string") {
        return { action: "type", selector: obj.selector, value: obj.value };
    }
    if (typeof obj.selector === "string" && obj.click === true) {
        return { action: "click", selector: obj.selector };
    }
    if (typeof obj.selector === "string" && obj.waitFor === true) {
        return { action: "waitFor", selector: obj.selector };
    }
    return null;
}
function normalizeSteps(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        const s = normalizeStep(item);
        if (s)
            out.push(s);
    }
    return out;
}
function toAbsoluteUrl(url) {
    if (!url)
        return BASE_URL;
    return url.startsWith("/") ? BASE_URL.replace(/\/+$/, "") + url : url;
}
// ---------- HTTP helpers ----------
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(t);
    }
}
// ---------- LLM planner (Bedrock Converse) ----------
async function planWithNovaLite(plain, outDir) {
    const system = `
You are a test planner for a Playwright MCP client.
Return ONLY a raw JSON array (no markdown, no prose).
Each item MUST include "action" and required fields:
- navigate:     { "action":"navigate", "url":"..." }
- type:         { "action":"type", "selector":"...", "value":"..." }
- click:        { "action":"click", "selector":"..." }
- waitFor:      { "action":"waitFor", "selector":"..." }  // do NOT use "redirect" or "url" fields
- screenshot:   { "action":"screenshot", "name":"..." }
- assertVisible:{ "action":"assertVisible", "selector":"..." }
Use relative URLs like "/login"; the runner prefixes ${BASE_URL}.
`.trim();
    const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;
    const llmReq = {
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: plain }] }],
        inferenceConfig: { maxTokens: 900, temperature: 0.2 }
    };
    writeJSON(safePath(outDir, "llm-request.json"), llmReq);
    let resText = "";
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(llmReq)
        }, LLM_TIMEOUT_MS);
        const raw = await res.text().catch(() => "");
        resText = raw;
        writeTXT(safePath(outDir, "llm-raw-response.json"), raw);
        if (!res.ok) {
            const msg = `Converse HTTP ${res.status}: ${raw}`;
            writeTXT(safePath(outDir, "run-error.txt"), msg);
            throw new Error(msg);
        }
        const json = JSON.parse(raw);
        const text = json?.output?.message?.content?.[0]?.text ?? "";
        writeTXT(safePath(outDir, "llm-output.txt"), text);
        if (!text) {
            const msg = "Empty LLM output";
            writeTXT(safePath(outDir, "run-error.txt"), msg);
            throw new Error(msg);
        }
        const rawArr = extractJsonArray(text);
        const arr = normalizeSteps(rawArr);
        const guard = validateSteps(arr);
        if ("error" in guard) {
            const msg = `Validation failed: ${guard.error}`;
            writeTXT(safePath(outDir, "run-error.txt"), msg);
            throw new Error(msg);
        }
        return guard.steps;
    }
    catch (e) {
        const msg = `Planner failed: ${String(e?.message || e)}\n--- Raw (truncated) ---\n${resText.slice(0, 2000)}`;
        writeTXT(safePath(outDir, "run-error.txt"), msg);
        throw new Error(msg);
    }
}
// ---------- MCP wiring ----------
async function withPlaywrightMCP(fn) {
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        env: cleanEnv(process.env)
    });
    const client = new Client({ name: "nova-lite-mcp-client", version: "0.1.0" });
    await client.connect(transport);
    let screenshotToolName = null;
    try {
        const tools = await client.listTools();
        screenshotToolName = tools.tools?.find(t => /screenshot/i.test(t.name))?.name ?? null;
    }
    catch { /* ignore */ }
    try {
        return await fn(client, screenshotToolName);
    }
    finally {
        await client.close();
    }
}
async function callToolWithTimeout(client, name, args, timeoutMs) {
    const p = client.callTool({ name, arguments: args });
    const t = new Promise((_, rej) => setTimeout(() => rej(new Error(`Step timeout after ${timeoutMs}ms`)), timeoutMs));
    return Promise.race([p, t]);
}
// ---------- Auth & Data seeding (optional) ----------
const TEST_API_BASE = process.env.TEST_API_BASE || "https://localhost:7140";
const TEST_USERNAME = process.env.TEST_USERNAME || "admin";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "P@ssword1";
async function apiLogin() {
    const creds = [
        { username: TEST_USERNAME, password: TEST_PASSWORD },
        { username: "admin", password: "ChangeMe123!" },
        { username: "admin", password: "P@ssword1" }
    ];
    for (const c of creds) {
        const r = await fetch(`${TEST_API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(c)
        });
        if (r.ok) {
            const j = await r.json().catch(() => ({}));
            const token = j?.token ?? j?.accessToken;
            if (token)
                return token;
        }
    }
    throw new Error("Failed to obtain auth token from API");
}
async function apiCreateStudent(authToken) {
    const stamp = Date.now();
    const payload = {
        firstName: `pw_${stamp}_First`,
        lastName: `pw_${stamp}_Last`,
        dateOfBirth: "2012-01-15",
        gradeLevel: "5",
        campus: `pw_${stamp}_Campus`,
        guardianContact: `pw_${stamp}_Guardian`,
        programFocus: `pw_${stamp}_Focus`,
        localId: `pw_${stamp}`,
        enrollmentDate: "2024-09-01",
        nextReviewDate: null
    };
    const r = await fetch(`${TEST_API_BASE}/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify(payload)
    });
    if (!r.ok)
        throw new Error(`createStudent failed: HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const id = String(j?.id ?? j);
    return { id, localId: payload.localId, name: `${payload.firstName} ${payload.lastName}` };
}
// ---------- Execute steps ----------
async function executeSteps(client, steps, outDir, screenshotToolName, visitedUrls = []) {
    const results = [];
    async function tryScreenshot(label, idx) {
        const file = safePath(outDir, `step_${String(idx).padStart(2, "0")}_${label}.png`);
        if (screenshotToolName) {
            try {
                await callToolWithTimeout(client, screenshotToolName, { fullPage: true, path: file }, STEP_TIMEOUT_MS);
                return file;
            }
            catch { /* ignore */ }
        }
        return undefined;
    }
    // Best-effort URL recorder: record explicit navigations; try to query current URL if MCP offers a tool
    let currentUrlTool = null;
    try {
        const tools = await client.listTools();
        currentUrlTool = tools.tools?.find(t => /current.*url|get.*url/i.test(t.name))?.name ?? null;
    }
    catch { }
    async function recordUrlFallback(url) {
        if (url) {
            visitedUrls.push(url);
            return;
        }
        if (!currentUrlTool)
            return;
        try {
            const res = await callToolWithTimeout(client, currentUrlTool, {}, 2000);
            const u = res?.content?.[0]?.text || res?.url || "";
            if (u)
                visitedUrls.push(String(u));
        }
        catch { }
    }
    for (const [i, step] of steps.entries()) {
        const started = Date.now();
        const entry = { ...step, index: i + 1, status: "passed", durationMs: 0 };
        try {
            switch (step.action) {
                case "navigate": {
                    const url = toAbsoluteUrl(step.url || "/");
                    await callToolWithTimeout(client, "browser_navigate", { url }, STEP_TIMEOUT_MS);
                    await recordUrlFallback(url);
                    entry.screenshot = await tryScreenshot("after_nav", i + 1);
                    break;
                }
                case "type": {
                    const s = step;
                    await callToolWithTimeout(client, "browser_type", { element: s.selector, text: s.value ?? "" }, STEP_TIMEOUT_MS);
                    await recordUrlFallback();
                    entry.screenshot = await tryScreenshot("after_type", i + 1);
                    break;
                }
                case "click": {
                    const s = step;
                    await callToolWithTimeout(client, "browser_click", { element: s.selector }, STEP_TIMEOUT_MS);
                    await recordUrlFallback();
                    entry.screenshot = await tryScreenshot("after_click", i + 1);
                    break;
                }
                case "waitFor": {
                    const s = step;
                    await callToolWithTimeout(client, "browser_wait_for", { element: s.selector }, STEP_TIMEOUT_MS);
                    await recordUrlFallback();
                    entry.screenshot = await tryScreenshot("after_wait", i + 1);
                    break;
                }
                case "screenshot": {
                    const s = step;
                    const name = (s.name ?? `shot_${i + 1}`);
                    entry.screenshot = await tryScreenshot(name, i + 1);
                    await recordUrlFallback();
                    break;
                }
                case "assertVisible": {
                    const s = step;
                    await callToolWithTimeout(client, "browser_wait_for", { element: s.selector }, STEP_TIMEOUT_MS);
                    await recordUrlFallback();
                    entry.screenshot = await tryScreenshot("assert_visible", i + 1);
                    break;
                }
                default:
                    throw new Error("Unknown action: " + step.action);
            }
        }
        catch (e) {
            entry.status = "failed";
            entry.error = String(e?.message || e);
            entry.screenshot = entry.screenshot || await tryScreenshot("on_fail", i + 1);
        }
        finally {
            entry.durationMs = Date.now() - started;
            results.push(entry);
        }
    }
    return results;
}
// ---------- HTML per-run ----------
function renderHtml(opts) {
    const { runId, steps, baseUrl, modelId, region, errors, testName, visitedUrls } = opts;
    const totals = {
        passed: steps.filter(s => s.status === "passed").length,
        failed: steps.filter(s => s.status === "failed").length,
        skipped: steps.filter(s => s.status === "skipped").length,
        total: steps.length
    };
    return `<!doctype html><meta charset="utf-8"><title>MCP Run - ${testName}</title>
  <style>
    body{font-family:system-ui;margin:24px;line-height:1.4}
    table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ddd;padding:8px;vertical-align:top}
    .ok{color:green;font-weight:600}.fail{color:#b00020;font-weight:600}
    details{margin:8px 0}
    code{background:#f7f7f7;padding:2px 4px;border-radius:4px}
    .meta{margin-bottom:12px}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#eee;margin-right:6px}
    img{max-width:480px;border:1px solid #ddd;border-radius:8px}
    ul.urls{margin:6px 0 14px 18px}
  </style>
  <h1>MCP Run</h1>
  <div class="meta">
    <span class="badge">Test: <strong>${testName}</strong></span>
    <span class="badge">Run: <code>${runId}</code></span>
    <span class="badge">Base URL: <code>${baseUrl}</code></span>
    <span class="badge">Model: <code>${modelId}</code></span>
    <span class="badge">Region: <code>${region}</code></span>
    <span class="badge">Totals: <strong>${totals.passed}/${totals.total}</strong> passed</span>
  </div>
  ${visitedUrls.length ? `<h3>Visited URLs</h3><ul class="urls">${visitedUrls.map(u => `<li><code>${u}</code></li>`).join("")}</ul>` : ""}
  ${errors.length ? `<p><strong>Run Errors:</strong> ${errors.map(e => `<code>${e}</code>`).join(", ")}</p>` : ""}
  <table>
    <tr><th>#</th><th>Action</th><th>Status</th><th>Duration (ms)</th><th>Selector/URL</th><th>Error</th><th>Screenshot</th></tr>
    ${steps.map(s => `
      <tr>
        <td>${s.index}</td>
        <td>${s.action}</td>
        <td class="${s.status === 'passed' ? 'ok' : 'fail'}">${s.status}</td>
        <td>${s.durationMs}</td>
        <td>${s.selector || s.url || ''}</td>
        <td>${s.error ?? ''}</td>
        <td>${s.screenshot ? `<img src="./${path.basename(s.screenshot)}" alt="s${s.index}">` : ''}</td>
      </tr>
    `).join("")}
  </table>
  <details><summary>LLM Artifacts</summary>
    <ul>
      <li>Request: <code>llm-request.json</code></li>
      <li>Raw Response: <code>llm-raw-response.json</code></li>
      <li>Output Text: <code>llm-output.txt</code></li>
    </ul>
  </details>`;
}
// ---------- Entrypoint ----------
async function main() {
    const runDir = path.join(REPORT_DIR, RUN_ID);
    ensureDir(runDir);
    // env snapshot
    writeJSON(safePath(runDir, "env-summary.json"), {
        AWS_REGION: REGION,
        BEDROCK_MODEL_ID: MODEL_ID,
        BASE_URL, REPORT_DIR, TESTS_DIR,
        AWS_BEARER_TOKEN_BEDROCK: redact(TOKEN)
    });
    const db = openDb(); // reports/runs.db
    const errors = [];
    const startedAt = new Date().toISOString();
    try {
        const testFile = process.argv[2] || path.join(TESTS_DIR, "sample-login.txt");
        const testName = path.basename(testFile);
        let inputText = fs.readFileSync(testFile, "utf-8");
        // seed a student if placeholder appears
        if (/\{STUDENT_ID\}/.test(inputText)) {
            try {
                const token = await apiLogin();
                const student = await apiCreateStudent(token);
                inputText = inputText.replace(/\{STUDENT_ID\}/g, student.id);
            }
            catch (e) {
                console.warn("Seeding skipped:", String(e?.message || e));
            }
        }
        const steps = await planWithNovaLite(inputText, runDir);
        if (!steps || steps.length === 0) {
            const m = "Planner returned zero steps. See llm-output.txt / llm-raw-response.json";
            writeTXT(safePath(runDir, "run-error.txt"), m);
            throw new Error(m);
        }
        await withPlaywrightMCP(async (client, shotName) => {
            // Auto-login prelude
            // replace your current prelude with this:
            const prelude = [
                { action: "navigate", url: "/login" },
                // username (try label first, then id)
                { action: "type", selector: "label=Username", value: process.env.TEST_USERNAME || "admin" },
                { action: "type", selector: "#username", value: process.env.TEST_USERNAME || "admin" },
                // password (try label first, then id)
                { action: "type", selector: "label=Password", value: process.env.TEST_PASSWORD || "ChangeMe123!" },
                { action: "type", selector: "#password", value: process.env.TEST_PASSWORD || "ChangeMe123!" },
                // submit (try role first, then id)
                { action: "click", selector: "role=button[name=/sign in/i]" },
                { action: "click", selector: "#submit-button" },
                { action: "waitFor", selector: "role=heading[name=/dashboard/i]" }
            ];
            const visitedUrls = [];
            const allSteps = [...prelude, ...steps];
            const results = await executeSteps(client, allSteps, runDir, shotName, visitedUrls);
            // Write per-run artifacts
            writeJSON(safePath(runDir, "run-steps.json"), results);
            writeTXT(safePath(runDir, "visited-urls.txt"), visitedUrls.join("\n"));
            writeTXT(safePath(runDir, "run-report.html"), renderHtml({
                runId: RUN_ID, steps: results, baseUrl: BASE_URL, modelId: MODEL_ID,
                region: REGION, errors, testName, visitedUrls
            }));
            // Insert into SQLite
            const totals = {
                passed: results.filter(s => s.status === "passed").length,
                failed: results.filter(s => s.status === "failed").length,
                skipped: results.filter(s => s.status === "skipped").length,
                total: results.length
            };
            upsertRun(db, {
                run_id: RUN_ID,
                started_at: startedAt,
                finished_at: new Date().toISOString(),
                base_url: BASE_URL,
                model_id: MODEL_ID,
                region: REGION,
                total: totals.total,
                passed: totals.passed,
                failed: totals.failed,
                skipped: totals.skipped,
                reports_dir: runDir
            });
            const stepRows = results.map(r => ({
                run_id: RUN_ID,
                idx: r.index,
                action: r.action,
                selector: r.selector ?? null,
                url: r.url ?? null,
                status: r.status,
                duration_ms: r.durationMs,
                error: r.error ?? null,
                screenshot: r.screenshot ?? null
            }));
            insertSteps(db, stepRows);
            console.log(`DB: wrote ${stepRows.length} steps for run ${RUN_ID}`);
        });
    }
    catch (e) {
        const m = String(e?.message || e);
        errors.push(m);
        console.error("RUN FAILED:", m);
        upsertRun(openDb(), {
            run_id: RUN_ID,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            base_url: BASE_URL,
            model_id: MODEL_ID,
            region: REGION,
            total: 0, passed: 0, failed: 0, skipped: 0,
            reports_dir: path.join(REPORT_DIR, RUN_ID)
        });
        writeTXT(safePath(runDir, "run-error.txt"), errors.join("\n"));
    }
}
main().catch(e => { console.error(e); process.exit(1); });
