"""JSON report writer for Playwright MCP runs."""
from __future__ import annotations

import json
from pathlib import Path

from ..mcp_client import RunResult


def write_json_report(destination: Path, result: RunResult) -> None:
    """Persist a structured JSON summary for the run."""

    payload = {
        "status": result.status,
        "metadata": result.metadata,
        "messages": [
            {
                "role": event.role,
                "content": event.content,
            }
            for event in result.messages
        ],
        "attachments": [
            {
                "name": attachment.name,
                "mimeType": attachment.mime_type,
                "path": str(attachment.path) if attachment.path else None,
            }
            for attachment in result.attachments
        ],
    }
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
