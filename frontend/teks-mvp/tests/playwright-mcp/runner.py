#!/usr/bin/env python
"""CLI entry point that executes plain-English Playwright MCP scenarios."""
from __future__ import annotations

import argparse
import asyncio
import logging
import mimetypes
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from rich.console import Console
from rich.panel import Panel

if __package__ is None:  # pragma: no cover - allows direct execution via python runner.py
    sys.path.append(str(Path(__file__).resolve().parent))
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from context import (  # noqa: E402
    build_system_prompt,
    load_config,
    load_env_file,
    merge_env,
    resolve_run_context,
)
from mcp_client import Attachment, MCPClient, MCPError, MessageEvent, RunResult  # noqa: E402
from reporters import write_html_report, write_json_report  # noqa: E402

console = Console()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute a plain-English Playwright MCP scenario")
    parser.add_argument("--file", required=True, help="Path to the plain text instruction file")
    parser.add_argument("--env", help="Environment key defined in config.jsonc")
    parser.add_argument("--config", default=None, help="Optional alternative config path")
    parser.add_argument("--env-file", default=None, help="Optional path to a .env file with Bedrock credentials")
    parser.add_argument("--run-id", default=None, help="Logical run identifier to append to the timestamp")
    parser.add_argument("--model", default=None, help="Override the Bedrock model id (defaults to BEDROCK_MODEL env var)")
    parser.add_argument("--artifacts-dir", default=None, help="Override the artifacts directory in config.jsonc")
    parser.add_argument("--debug", action="store_true", help="Enable verbose logging output")
    return parser.parse_args(argv)


def _timestamped_run_id(run_id: Optional[str]) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    label = run_id or "manual"
    return f"{stamp}-{label}"


def _sanitize_name(name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return safe or "artifact"


def _ensure_extension(name: str, mime_type: str) -> str:
    if Path(name).suffix:
        return name
    guess = mimetypes.guess_extension((mime_type or "application/octet-stream").split(";")[0])
    if guess == ".jpe":  # normalise JPEG extension
        guess = ".jpg"
    return f"{name}{guess or '.bin'}"


async def _run_once(args: argparse.Namespace) -> RunResult:
    project_root = Path(__file__).resolve().parents[2]
    config_path = Path(args.config) if args.config else Path(__file__).parent / "config.jsonc"
    config = load_config(config_path)
    if args.artifacts_dir:
        config = config.model_copy(update={"artifactsDir": args.artifacts_dir})

    run_id = _timestamped_run_id(args.run_id)
    context = resolve_run_context(config, args.env, run_id, project_root)
    run_dir = context.artifacts_dir
    run_dir.mkdir(parents=True, exist_ok=True)
    screenshots_dir = run_dir / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    attachments_dir = run_dir / "artifacts"
    attachments_dir.mkdir(parents=True, exist_ok=True)

    env_file = Path(args.env_file) if args.env_file else Path(__file__).parent / ".env"
    env_overrides = load_env_file(env_file) if env_file else {}
    env_overrides.setdefault("BEDROCK_MODEL", env_overrides.get("BEDROCK_MODEL", "anthropic.claude-3-sonnet-20240229"))
    env_overrides.setdefault("PLAYWRIGHT_MCP_BASE_URL", context.env.baseUrl)
    env_overrides.setdefault("PLAYWRIGHT_MCP_HEADLESS", str(context.env.headless).lower())
    env_overrides.setdefault("PLAYWRIGHT_MCP_TIMEOUT_MS", str(context.env.timeoutMs))
    runtime_env = merge_env(env_overrides)

    system_prompt = build_system_prompt(context)
    plain_path = Path(args.file).expanduser().resolve()
    if not plain_path.exists():
        raise FileNotFoundError(f"Plain English test file not found at {plain_path}")
    user_prompt = plain_path.read_text(encoding="utf-8").strip()
    if not user_prompt:
        raise ValueError("Plain English instruction file is empty")

    command = context.config.mcp.stdioCommand
    if not command:
        raise ValueError("MCP stdio command is not configured")

    model = args.model or runtime_env.get("BEDROCK_MODEL", "anthropic.claude-3-sonnet-20240229")

    messages: list[MessageEvent] = []
    attachments: list[Attachment] = []

    ready_event = asyncio.Event()

    def _update_chunk_paths(event: MessageEvent, saved: list[Attachment]) -> None:
        for chunk in event.content:
            if not isinstance(chunk, dict):
                continue
            if chunk.get("type") in {"image", "file", "binary"} and not chunk.get("path"):
                related = next((att for att in saved if att.name == chunk.get("name")), None)
                path = related.path if related else saved[0].path if saved else None
                if path:
                    chunk["path"] = str(path)
                    chunk.setdefault("mimeType", related.mime_type if related else None)

    def _save_attachment(attachment: Attachment) -> Attachment:
        base_dir = screenshots_dir if attachment.mime_type.startswith("image/") else attachments_dir
        filename = _ensure_extension(_sanitize_name(attachment.name), attachment.mime_type)
        destination = base_dir / filename
        counter = 1
        while destination.exists():
            destination = base_dir / f"{Path(filename).stem}_{counter}{Path(filename).suffix}"
            counter += 1
        destination.write_bytes(attachment.data)
        attachment.path = destination
        return attachment

    async def handle_ready(_: Dict[str, object]) -> None:
        ready_event.set()

    async def handle_message(params: Dict[str, object]) -> None:
        message = params.get("message") if isinstance(params, dict) else None
        if not isinstance(message, dict):
            return
        event = MessageEvent(role=message.get("role", "server"), content=message.get("content", []))
        messages.append(event)
        text_parts = [chunk.get("text", "") for chunk in event.content if isinstance(chunk, dict) and chunk.get("type") == "text"]
        if text_parts:
            console.print(Panel("\n".join(part for part in text_parts if part), title=f"{event.role}"))
        saved = []
        for attachment in MCPClient.extract_attachments(event.content, default_name_prefix=event.role):
            saved.append(_save_attachment(attachment))
            attachments.append(attachment)
        if saved:
            _update_chunk_paths(event, saved)

    async def handle_progress(params: Dict[str, object]) -> None:
        progress = params.get("progress") if isinstance(params, dict) else None
        total = params.get("total") if isinstance(params, dict) else None
        message = params.get("message") if isinstance(params, dict) else ""
        label = f"Progress {progress}/{total}" if progress is not None else "Progress"
        console.log(f"{label} {message}")

    async def handle_log(params: Dict[str, object]) -> None:
        if isinstance(params, dict):
            level = params.get("level", "info")
            message = params.get("message", "")
            console.log(f"[{level}] {message}")

    started_at = datetime.now(timezone.utc)

    client = MCPClient(command, cwd=project_root, env=runtime_env)
    client.on_notification("notifications/serverReady", handle_ready)
    client.on_notification("notifications/message", handle_message)
    client.on_notification("notifications/progress", handle_progress)
    client.on_notification("notifications/log", handle_log)

    status = "passed"
    response_payload: Dict[str, object] | None = None

    try:
        await client.start()
        await client.initialize("playwright-mcp-python", "0.1.0")
        try:
            await asyncio.wait_for(ready_event.wait(), timeout=30)
        except asyncio.TimeoutError:
            console.log("Warning: MCP server did not emit serverReady within 30s")
        response_payload = await client.create_message(system_prompt=system_prompt, user_prompt=user_prompt, model=model, stream=True, metadata={
            "runId": run_id,
            "environment": context.env_name,
            "baseUrl": context.env.baseUrl,
        })
    except MCPError as exc:
        status = "failed"
        console.log(f"MCP server returned an error: {exc}")
    finally:
        await client.close()

    finished_at = datetime.now(timezone.utc)

    metadata = {
        "runId": run_id,
        "environment": context.env_name,
        "baseUrl": context.env.baseUrl,
        "headless": context.env.headless,
        "timeoutMs": context.env.timeoutMs,
        "model": model,
        "startedAt": started_at.isoformat(),
        "finishedAt": finished_at.isoformat(),
        "durationSeconds": round((finished_at - started_at).total_seconds(), 3),
        "artifactsDir": str(run_dir),
        "plainTestFile": str(plain_path),
        "response": response_payload,
    }

    result = RunResult(status=status, messages=messages, attachments=attachments, metadata=metadata)

    write_json_report(run_dir / "run-summary.json", result)
    write_html_report(run_dir / "run-report.html", result)

    console.print(Panel(f"Run complete with status: {status.upper()}\nArtifacts saved to {run_dir}", title="Playwright MCP"))

    return result


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO, format="[%(levelname)s] %(message)s")
    try:
        asyncio.run(_run_once(args))
        return 0
    except Exception as exc:  # pragma: no cover - surfacing CLI error states
        console.print(f"[red]Run failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
