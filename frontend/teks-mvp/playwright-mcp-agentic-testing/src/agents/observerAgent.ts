// src/agents/observerAgent.ts
import { McpClient } from "../core/mcpClient.js";
import { RunLogger } from "../core/logger.js";
import { EnvironmentSettings } from "../core/env.js";

/**
 * Defines what an observation from Playwright MCP looks like.
 */
export interface PageObservation {
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * ObserverAgent connects to the MCP client and captures Playwright observations
 * about page state, screenshots, or DOM.
 */
export class ObserverAgent {
  private client: McpClient;
  private logger: RunLogger;
  private env: EnvironmentSettings;

  constructor(client: McpClient, logger: RunLogger, env: EnvironmentSettings) {
    this.client = client;
    this.logger = logger;
    this.env = env;
  }

  /**
   * Observes the current state of a web page through the MCP tool.
   * @param url The URL to observe.
   * @returns A PageObservation object.
   */
  async observe(url: string): Promise<PageObservation> {
    try {
      this.logger.info("Observing page", { url });

      const result = (await this.client.callTool({
        name: "playwright.page.observe",
        arguments: { url },
      })) as Partial<PageObservation> | null;

      const observation: PageObservation = {
        path: result?.path ?? "(unknown path)",
        content: result?.content ?? "(empty)",
        metadata: result?.metadata ?? {},
      };

      this.logger.info("Observation captured", {
        path: observation.path,
        contentPreview: observation.content?.substring(0, 120),
      });

      return observation;
    } catch (err: any) {
      this.logger.error("Observation failed", {
        error: err?.message || String(err),
        url,
      });
      throw err;
    }
  }
}
