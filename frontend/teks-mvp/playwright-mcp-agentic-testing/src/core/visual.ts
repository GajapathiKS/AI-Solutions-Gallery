// src/core/visual.ts
import fs from "node:fs";
import path from "node:path";
import { mcpClient } from "./mcpClient.js";
import { logger } from "./logger.js";

export async function snap(step: number, runDir: string) {
  const file = path.join(runDir, `step-${step}.png`);
  const buf = await mcpClient.call("page_screenshot", {});
  fs.writeFileSync(file, Buffer.from(buf as any));
  logger.info({ t: "snap", step, file });
}
