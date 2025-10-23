// src/core/env.ts
import fs from "fs";
import path from "path";

export type EnvironmentKey = "dev" | "qa" | "prod" | string;

export interface EnvironmentSettings {
  baseUrl: string;
  headless: boolean;
  timeoutMs: number;
}

export type McpConfig =
  | {
      mode: "stdio" | "exec";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
    }
  | {
      mode: "stdio";
      stdioCommand: [string, ...string[]]; // legacy shape
      cwd?: string;
      env?: Record<string, string>;
    };

export interface AgentConfig {
  defaultEnv: EnvironmentKey;
  artifactsDir: string;
  environments: Record<EnvironmentKey, EnvironmentSettings>;
  mcp: McpConfig;
}

export interface EnvironmentSelection {
  key: EnvironmentKey;
  settings: EnvironmentSettings;
}

export function loadAgentConfig(configPath: string): AgentConfig {
  const p = path.resolve(configPath);
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  return parsed;
}

export function selectEnvironment(config: AgentConfig, key?: EnvironmentKey): EnvironmentSelection {
  const chosenKey = (key || config.defaultEnv) as EnvironmentKey;
  const settings = config.environments[chosenKey];
  if (!settings) {
    throw new Error(`Environment "${chosenKey}" not defined in config`);
  }
  return { key: chosenKey, settings };
}
