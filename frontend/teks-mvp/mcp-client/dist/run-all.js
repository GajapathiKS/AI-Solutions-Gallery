// src/run-all.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { v4 as uuid } from "uuid";
const TESTS_DIR = process.env.TESTS_DIR ?? "tests";
function findTxtTests(dir) {
    return fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith(".txt"))
        .map(f => path.join(dir, f));
}
async function runFile(file) {
    return new Promise((resolve) => {
        const RUN_ID = uuid().slice(0, 8);
        const child = spawn(process.execPath, ["dist/client.js", file], {
            stdio: "inherit",
            env: { ...process.env, RUN_ID }
        });
        child.on("close", code => resolve(code ?? 1));
    });
}
async function main() {
    if (!fs.existsSync(TESTS_DIR)) {
        console.error(`Tests dir not found: ${TESTS_DIR}`);
        process.exit(1);
    }
    const files = findTxtTests(TESTS_DIR);
    if (!files.length) {
        console.error(`No .txt files found in ${TESTS_DIR}`);
        process.exit(1);
    }
    let failed = 0;
    for (const f of files) {
        console.log(`\n=== Running: ${f} ===`);
        const code = await runFile(f);
        if (code !== 0)
            failed++;
    }
    if (failed) {
        console.error(`\nCompleted with failures in ${failed}/${files.length} runs.`);
        process.exit(1);
    }
    else {
        console.log(`\nAll ${files.length} runs passed.`);
    }
}
main().catch(e => { console.error(e); process.exit(1); });
