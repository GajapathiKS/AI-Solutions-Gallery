import fs from 'node:fs';
import path from 'node:path';
import { McpClient } from '../core/mcpClient.js';
import { RunLogger } from '../core/logger.js';
import { ensureDir, writeJson } from '../core/utils.js';

export interface ObservationResult {
  htmlPath: string;
  metadata: Record<string, unknown>;
}

export class ObserverAgent {
  constructor(
    private readonly client: McpClient,
    private readonly logger: RunLogger,
    private readonly runDir: string
  ) {}

  async capture(stepIndex: number): Promise<ObservationResult | undefined> {
    try {
      const result = await this.client.callTool({
        name: 'browser_evaluate',
        arguments: {
          function: `() => ({
            url: window.location.href,
            title: document.title,
            visibleText: document.body.innerText.slice(0, 2000)
          })`
        }
      });
      const payload = {
        ...result,
        capturedAt: new Date().toISOString()
      };
      const fileName = `step-${String(stepIndex + 1).padStart(3, '0')}-observation.json`;
      const filePath = path.join(this.runDir, fileName);
      writeJson(filePath, payload);
      this.logger.debug('Observer captured snapshot', { file: fileName });
      return {
        htmlPath: filePath,
        metadata: payload
      };
    } catch (error) {
      this.logger.warn('Observer failed to capture snapshot', { error: (error as Error).message });
      return undefined;
    }
  }

  async screenshot(stepIndex: number, name?: string): Promise<string | undefined> {
    try {
      const screenshotsDir = path.join(this.runDir, 'screenshots');
      ensureDir(screenshotsDir);
      const fileName = `${String(stepIndex + 1).padStart(3, '0')}-${name ?? 'snapshot'}.png`;
      const result = await this.client.callTool({
        name: 'browser_take_screenshot',
        arguments: {
          type: 'png',
          filename: fileName,
          fullPage: true
        }
      });
      const imageEntry = Array.isArray(result?.content)
        ? result.content.find((item: any) => item.type === 'image' && typeof item.data === 'string')
        : undefined;
      if (imageEntry) {
        const buffer = Buffer.from(imageEntry.data, 'base64');
        const filePath = path.join(screenshotsDir, fileName);
        await fs.promises.writeFile(filePath, buffer);
        return filePath;
      }
      return undefined;
    } catch (error) {
      this.logger.warn('Observer failed to capture screenshot', { error: (error as Error).message });
      return undefined;
    }
  }
}
