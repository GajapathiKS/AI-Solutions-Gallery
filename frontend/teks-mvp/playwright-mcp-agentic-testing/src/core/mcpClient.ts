// src/core/mcpClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { RunLogger } from "./logger.js";

export type McpLaunchConfig =
  | {
      // Preferred shape
      mode: "stdio" | "exec";
      command: string;           // e.g. "node"
      args?: string[];           // e.g. ["./node_modules/@playwright/mcp/cli.js"]
      cwd?: string;              // e.g. "."
      env?: Record<string, string>;
    }
  | {
      // Backward compatibility for earlier config
      mode: "stdio";
      stdioCommand: [string, ...string[]]; // e.g. ["node", "./node_modules/@playwright/mcp/cli.js"]
      cwd?: string;
      env?: Record<string, string>;
    };

export class McpClient {
  private logger: RunLogger;
  private client?: Client;

  constructor(logger: RunLogger) {
    this.logger = logger;
  }

  async connect(cfg: McpLaunchConfig): Promise<void> {
    // Normalize config to { command, args, cwd, env }
    const norm = this.normalize(cfg);

    this.logger.info("Starting MCP process", {
      command: norm.command,
      args: norm.args,
      cwd: norm.cwd ?? process.cwd(),
    });

    // Prepare transport (let SDK spawn the process)
    const transport = new StdioClientTransport({
      command: norm.command,
      args: norm.args,
      cwd: norm.cwd ?? process.cwd(),
      env: { ...process.env, ...(norm.env ?? {}) },
    } as any);

    // Connect SDK client
    this.client = new Client({
      name: "teks-agentic-runner",
      version: "0.1.0",
    });

    await this.client.connect(transport);

    // Basic health check: list tools (and log)
    const tools = await this.client.listTools();
    this.logger.info("MCP connected; tools available", {
      tools: tools.tools.map(t => t.name),
    });
  }

  get isConnected(): boolean {
    return Boolean(this.client);
  }

  async callTool<T = unknown>(opts: { name: string; arguments?: Record<string, unknown> }): Promise<T> {
    if (!this.client) throw new Error("MCP client not connected");
    const result = await this.client.callTool({
      name: opts.name,
      arguments: opts.arguments ?? {},
    });
    return result as T;
  }

  async close(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch {}
    }
    this.client = undefined;
  }

  private normalize(cfg: McpLaunchConfig): {
    mode: "stdio" | "exec";
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
  } {
    // If it has stdioCommand (legacy), expand it
    if ("stdioCommand" in cfg) {
      const [command, ...rest] = cfg.stdioCommand;
      return {
        mode: "stdio",
        command,
        args: rest,
        cwd: cfg.cwd,
        env: cfg.env,
      };
    }

    // New shape
    return {
      mode: cfg.mode,
      command: cfg.command,
      args: cfg.args ?? [],        // <— never undefined
      cwd: cfg.cwd,
      env: cfg.env,
    };
  }
}
