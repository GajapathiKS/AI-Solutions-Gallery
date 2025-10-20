"""Utilities for loading client configuration and constructing MCP prompts."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List
import json
import os
import re
import textwrap

from pydantic import BaseModel, Field, ValidationError

_COMMENT_RE = re.compile(r"//.*?$|/\*.*?\*/", re.DOTALL | re.MULTILINE)


def _strip_json_comments(raw: str) -> str:
    """Remove both single and multi-line comments from JSONC content."""
    return re.sub(_COMMENT_RE, "", raw)


class EnvironmentSettings(BaseModel):
    """Environment specific knobs consumed by the MCP orchestration."""

    baseUrl: str = Field(..., description="Target base URL for the AUT")
    headless: bool = Field(default=True, description="Run browsers in headless mode")
    timeoutMs: int = Field(default=30_000, description="Default per-step timeout in milliseconds")


class MCPSettings(BaseModel):
    """How to communicate with the downstream Playwright MCP server."""

    mode: str = Field("stdio", description="Transport type. Currently only stdio is supported")
    stdioCommand: List[str] = Field(..., description="Command/args to spawn the MCP server")


class ProjectConfig(BaseModel):
    """Top-level configuration for the Playwright MCP Python client."""

    defaultEnv: str = Field(..., description="Environment name that should be used when none is provided")
    artifactsDir: str = Field(..., description="Directory where run artifacts will be written")
    environments: Dict[str, EnvironmentSettings]
    mcp: MCPSettings

    def get_environment(self, name: str | None) -> EnvironmentSettings:
        target = name or self.defaultEnv
        if target not in self.environments:
            available = ", ".join(sorted(self.environments))
            raise KeyError(f"Unknown environment '{target}'. Known environments: {available or 'none'}")
        return self.environments[target]


@dataclass
class RunContext:
    """Fully resolved runtime information for an MCP run."""

    env_name: str
    env: EnvironmentSettings
    config: ProjectConfig
    run_id: str
    artifacts_root: Path

    @property
    def artifacts_dir(self) -> Path:
        return self.artifacts_root / f"{self.run_id}"


def load_config(path: Path) -> ProjectConfig:
    """Load and validate the JSONC configuration file."""

    try:
        raw_text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Configuration file not found at {path}") from exc
    cleaned = _strip_json_comments(raw_text)
    data = json.loads(cleaned)
    try:
        return ProjectConfig.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Invalid configuration at {path}: {exc}") from exc


def resolve_run_context(config: ProjectConfig, env_name: str | None, run_id: str, base_dir: Path) -> RunContext:
    env = config.get_environment(env_name)
    artifacts_root = (base_dir / config.artifactsDir).resolve()
    artifacts_root.mkdir(parents=True, exist_ok=True)
    return RunContext(env_name=env_name or config.defaultEnv, env=env, config=config, run_id=run_id, artifacts_root=artifacts_root)


def build_system_prompt(context: RunContext) -> str:
    """Create a deterministic system prompt to steer the Claude-backed MCP server."""

    env = context.env
    prompt = f"""
    You are an automation specialist executing Playwright end-to-end tests for the TEKS MVP Angular application.
    Always prefer reliable selectors such as data-testid or ARIA roles and wait for UI readiness before acting.

    ## Execution Environment
    - Base URL: {env.baseUrl}
    - Browser headless mode: {env.headless}
    - Default action timeout: {env.timeoutMs} ms
    - Run identifier: {context.run_id}

    ## Expectations
    - Honour explicit screenshot names provided by the user instructions.
    - Capture additional context (console logs, network failures) when steps error.
    - Produce concise status updates for each step so the client can stream progress.
    - Treat all credentials as already configured inside the AUT – do not request tokens from the client.
    """
    return textwrap.dedent(prompt).strip()


def load_env_file(env_path: Path) -> Dict[str, str]:
    """Load an optional .env style file for convenience when running ad-hoc."""

    if not env_path.exists():
        return {}
    from dotenv import dotenv_values

    return {k: v for k, v in dotenv_values(env_path).items() if v is not None}


def merge_env(overrides: Dict[str, str]) -> Dict[str, str]:
    """Merge the provided overrides onto the current environment variables."""

    merged = dict(os.environ)
    merged.update(overrides)
    return merged
