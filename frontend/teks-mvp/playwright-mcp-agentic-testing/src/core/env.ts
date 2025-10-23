import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { ensureDir, resolveDirname } from './utils.js';

const EnvironmentSchema = z.object({
  baseUrl: z.string().min(1),
  headless: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(45000)
});

const McpSchema = z.object({
  mode: z.literal('stdio'),
  stdioCommand: z.array(z.string()).min(1),
  cwd: z.string().optional()
});

const ConfigSchema = z.object({
  defaultEnv: z.string(),
  artifactsDir: z.string().default('reports'),
  environments: z.record(EnvironmentSchema),
  mcp: McpSchema
});

export type EnvironmentConfig = z.infer<typeof EnvironmentSchema>;
export type AgentConfig = z.infer<typeof ConfigSchema>;

const __dirname = resolveDirname(import.meta.url);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export function loadEnvFile(envPath = path.join(PROJECT_ROOT, '.env')): void {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function loadAgentConfig(configPath?: string): AgentConfig {
  const resolved = configPath
    ? path.resolve(configPath)
    : path.join(PROJECT_ROOT, 'config', 'agent.config.json');
  if (!fs.existsSync(resolved)) {
    throw new Error(`Agent config not found at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = ConfigSchema.parse(JSON.parse(raw));
  return parsed;
}

export interface RuntimePaths {
  projectRoot: string;
  artifactsRoot: string;
  runDir: string;
}

export function prepareRunDirectories(config: AgentConfig, runId: string): RuntimePaths {
  const artifactsRoot = path.resolve(PROJECT_ROOT, config.artifactsDir);
  ensureDir(artifactsRoot);
  const runDir = path.join(artifactsRoot, runId);
  ensureDir(runDir);
  return {
    projectRoot: PROJECT_ROOT,
    artifactsRoot,
    runDir
  };
}

export interface EnvironmentSelection {
  name: string;
  settings: EnvironmentConfig;
}

export function resolveEnvironment(config: AgentConfig, requested?: string): EnvironmentSelection {
  const key = requested ?? process.env.PLAYWRIGHT_MCP_ENV ?? config.defaultEnv;
  const settings = config.environments[key];
  if (!settings) {
    const available = Object.keys(config.environments).join(', ');
    throw new Error(`Unknown environment "${key}". Available: ${available}`);
  }
  const overrides: Partial<EnvironmentConfig> = {};
  if (process.env.BASE_URL) {
    overrides.baseUrl = process.env.BASE_URL;
  }
  if (process.env.HEADLESS) {
    overrides.headless = process.env.HEADLESS.toLowerCase() === 'true';
  }
  if (process.env.PLAYWRIGHT_TIMEOUT) {
    overrides.timeoutMs = Number(process.env.PLAYWRIGHT_TIMEOUT) || settings.timeoutMs;
  }
  return {
    name: key,
    settings: {
      ...settings,
      ...overrides
    }
  };
}

export interface McpLaunchConfig {
  command: string[];
  cwd?: string;
}

export function resolveMcpLaunch(config: AgentConfig): McpLaunchConfig {
  const command = config.mcp.stdioCommand;
  if (!command || command.length === 0) {
    throw new Error('stdioCommand is required for MCP launch');
  }
  return {
    command,
    cwd: config.mcp.cwd ? path.resolve(PROJECT_ROOT, config.mcp.cwd) : PROJECT_ROOT
  };
}

export { PROJECT_ROOT };
