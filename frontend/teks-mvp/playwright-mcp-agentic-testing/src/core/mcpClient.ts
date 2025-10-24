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

    const started = Date.now();
    this.logger.debug("Calling MCP tool", {
      tool: opts.name,
      arguments: opts.arguments,
    });

    try {
      const result = await this.client.callTool({
        name: opts.name,
        arguments: opts.arguments ?? {},
      });

      this.logger.info("MCP tool completed", {
        tool: opts.name,
        ms: Date.now() - started,
      });

      return result as T;
    } catch (error) {
      this.logger.error("MCP tool failed", {
        tool: opts.name,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.callTool<T>({ name, arguments: args });
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

let sharedClient: McpClient | undefined;

export function setSharedMcpClient(client: McpClient): void {
  sharedClient = client;
}

export function getSharedMcpClient(): McpClient {
  if (!sharedClient) {
    throw new Error("Shared MCP client not registered. Call setSharedMcpClient() after connecting.");
  }
  return sharedClient;
}

export const mcpClient = {
  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return getSharedMcpClient().call<T>(name, args);
  },
  get instance(): McpClient {
    return getSharedMcpClient();
  }
};

export type McpResult = any;

export function unwrapText(res: McpResult): string {
  // Many MCP tools return { content: [{ type: 'text', text: '...' }], isError?: boolean }
  try {
    if (res && Array.isArray(res.content) && res.content.length) {
      const first = res.content[0];
      if (typeof first?.text === "string") {
        let text = first.text;
        
        // Check if text starts with "### Result" and extract only the result section
        const resultMatch = text.match(/### Result\s*\n([\s\S]*?)(?:\n###|$)/);
        if (resultMatch) {
          text = resultMatch[1].trim();
        }
        
        // If still has markdown code blocks, extract the content
        const codeBlockMatch = text.match(/```(?:json|js|javascript)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          text = codeBlockMatch[1].trim();
        }
        
        return text;
      }
      if (typeof first?.data === "string") return first.data;
      if (typeof first === "string") return first;
    }
  } catch {}
  // As a last resort, stringify
  return typeof res === "string" ? res : JSON.stringify(res);
}

export async function pageUrl(mcp: McpClient) {
  const r = await mcp.call("browser_evaluate", { function: "() => location.href" });
  return unwrapText(r);
}

export async function pageTitle(mcp: McpClient) {
  const r = await mcp.call("browser_evaluate", { function: "() => document.title" });
  return unwrapText(r);
  const t2 = await mcp.call("browser_evaluate", { expression: "document.title" });
  return unwrapText(t2);
}

export async function pageBodyHtml(mcp: McpClient) {
  const r = await mcp.call("browser_evaluate", { function: "() => document.body?.innerHTML || ''" });
  return unwrapText(r);
}

