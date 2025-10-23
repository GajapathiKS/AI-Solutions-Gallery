# Playwright MCP Agentic Testing

This package provides an autonomous, multi-agent testing harness for the TEKS MVP Angular application. Natural-language goals are converted into executable plans through Amazon Bedrock Nova-Lite, executed via the Playwright MCP server, and verified with rich reporting.

## Features

- **Planner agent** – converts plain-text goals into structured action plans using Bedrock.
- **Executor agent** – maps actions to Playwright MCP tools and records per-step metadata.
- **Observer agent** – captures DOM snapshots and screenshots for every step.
- **Verifier agent** – asserts end-state expectations declared by the planner.
- **Reporter** – stores plan, goal, logs, and run summary artifacts under `reports/`.

## Prerequisites

1. Node.js 18+ (the repo currently uses Node 20.19.5).
2. The Playwright MCP server must be accessible via `node mcp/server.js` (from `frontend/teks-mvp`).
3. Bedrock bearer token credentials exported as environment variables:
   ```bash
   export AWS_REGION=eu-north-1
   export BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
   export AWS_BEARER_TOKEN_BEDROCK=bedrock-<token>
   export BASE_URL=http://localhost:4200/login
   ```
4. Install project dependencies:
   ```bash
   cd frontend/teks-mvp/playwright-mcp-agentic-testing
   npm install
   ```

## Usage

```bash
npm run build
node dist/cli.js src/tests/login.txt --env dev --run-id local-check
```

The CLI will:
1. Load configuration from `src/config/agent.config.json`.
2. Ask Bedrock Nova-Lite to generate a structured plan for the natural-language goal.
3. Start the Playwright MCP server via stdio and execute the planned steps with observations.
4. Perform verification checks and persist run artifacts to `reports/<run-id>/`.

Each run directory contains:

- `run.log` – timestamped console log.
- `goal.json` – original plain-text scenario.
- `plan.json` – structured action plan returned by Bedrock.
- `run-summary.json` – execution summary with per-step metadata.
- `screenshots/` – observer and scenario screenshots.
- `step-###-observation.json` – DOM/text snapshots per step.

## VS Code Task

Add the following to `.vscode/tasks.json` (project root) to trigger a sample run via the Task palette:

```json
{
  "label": "Run Agentic Playwright Test",
  "type": "shell",
  "command": "node",
  "args": [
    "frontend/teks-mvp/playwright-mcp-agentic-testing/dist/cli.js",
    "frontend/teks-mvp/playwright-mcp-agentic-testing/src/tests/login.txt",
    "--env",
    "dev",
    "--run-id",
    "vscode-run"
  ],
  "group": {
    "kind": "test",
    "isDefault": true
  },
  "presentation": {
    "reveal": "always",
    "panel": "new",
    "clear": true
  }
}
```

## Development Tips

- Use `npm run dev` for ts-node execution when iterating locally.
- Update `src/config/agent.config.json` to register additional environments or adjust default timeouts.
- Store environment secrets in `.env` (see `.env.example`).
- The planner prompt lives in `src/agents/plannerAgent.ts` if you need to adjust schema or instructions.
- Extend `src/agents/executorAgent.ts` for new tool mappings (API calls, keyboard shortcuts, etc.).

## Troubleshooting

- **Bedrock authentication errors** – ensure `AWS_BEARER_TOKEN_BEDROCK` is exported and valid.
- **MCP connection failures** – confirm the stdio command in `agent.config.json` points to the Playwright MCP server entry.
- **Selector misses** – update the AUT with resilient `data-testid` hooks or tweak the planner prompt to prefer role-based selectors.
- **Timeouts** – raise `timeoutMs` per step through the planner output or globally via environment config.

## Sample Goals

The `src/tests/` folder contains ready-to-run scenarios (`login.txt`, `student-create.txt`, `dashboard-verify.txt`). Duplicate and edit these files to add new natural-language flows.
