"""HTML report writer using Jinja2 templates."""
from __future__ import annotations

from pathlib import Path
from typing import List

from jinja2 import Environment, select_autoescape

from ..mcp_client import Attachment, RunResult


_TEMPLATE = """<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Playwright MCP Run – {{ metadata.runId }}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2933; background: #f9fafb; }
    h1 { margin-bottom: 0.25rem; }
    h2 { margin-top: 2rem; }
    .status { font-weight: 600; }
    .status.passed { color: #047857; }
    .status.failed { color: #b91c1c; }
    .meta { margin-bottom: 1rem; }
    .message { border: 1px solid #d1d5db; border-radius: 0.5rem; background: #fff; padding: 1rem; margin-bottom: 1rem; }
    .message-role { font-weight: 600; margin-bottom: 0.5rem; }
    pre { background: #111827; color: #f9fafb; padding: 1rem; border-radius: 0.5rem; overflow: auto; }
    ul { padding-left: 1.25rem; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <header>
    <h1>Playwright MCP Execution Report</h1>
    <div class=\"meta\">
      <div><strong>Run ID:</strong> {{ metadata.runId }}</div>
      <div><strong>Environment:</strong> {{ metadata.environment }}</div>
      <div><strong>Base URL:</strong> {{ metadata.baseUrl }}</div>
      <div><strong>Model:</strong> {{ metadata.model }}</div>
      <div><strong>Started:</strong> {{ metadata.startedAt }}</div>
      <div><strong>Finished:</strong> {{ metadata.finishedAt }}</div>
      <div><strong>Duration:</strong> {{ metadata.durationSeconds }} seconds</div>
      <div class=\"status {{ status }}\"><strong>Status:</strong> {{ status|upper }}</div>
    </div>
  </header>

  <section>
    <h2>Conversation</h2>
    {% for message in messages %}
      <article class=\"message\">
        <div class=\"message-role\">{{ message.role|capitalize }}</div>
        {% for chunk in message.content %}
          {% if chunk.type == 'text' %}
            <pre>{{ chunk.text }}</pre>
          {% elif chunk.type in ['image', 'file', 'binary'] and chunk.path %}
            <div><a href="{{ chunk.path }}">{{ chunk.name or chunk.path }}</a> ({{ chunk.mimeType }})</div>
          {% endif %}
        {% endfor %}
      </article>
    {% endfor %}
  </section>

  <section>
    <h2>Attachments</h2>
    {% if attachments %}
      <ul>
        {% for attachment in attachments %}
          <li><a href="{{ attachment.path }}">{{ attachment.name }}</a> ({{ attachment.mime_type }})</li>
        {% endfor %}
      </ul>
    {% else %}
      <p>No attachments produced.</p>
    {% endif %}
  </section>
</body>
</html>
"""


def _prepare_message_payloads(result: RunResult, destination: Path) -> List[dict]:
    payloads = []
    for message in result.messages:
        converted_chunks = []
        for chunk in message.content:
            if isinstance(chunk, dict):
                entry = dict(chunk)
                if chunk.get("type") in {"image", "file", "binary"}:
                    path = chunk.get("path")
                    entry["path"] = str(path) if path else None
            else:
                entry = {"type": "text", "text": str(chunk)}
            converted_chunks.append(entry)
        payloads.append({"role": message.role, "content": converted_chunks})
    return payloads


def _normalise_attachments(attachments: List[Attachment], destination: Path) -> List[dict]:
    normalised: List[dict] = []
    root = destination.parent.resolve()
    for attachment in attachments:
        if attachment.path:
            try:
                path_str = str(Path(attachment.path).resolve().relative_to(root))
            except ValueError:
                path_str = str(Path(attachment.path))
        else:
            path_str = None
        normalised.append({
            "name": attachment.name,
            "mime_type": attachment.mime_type,
            "path": path_str,
        })
    return normalised


def write_html_report(destination: Path, result: RunResult) -> None:
    environment = Environment(autoescape=select_autoescape(["html", "xml"]))
    template = environment.from_string(_TEMPLATE)
    payload_messages = _prepare_message_payloads(result, destination)
    attachments = _normalise_attachments(result.attachments, destination)
    html = template.render(
        status=result.status,
        metadata=result.metadata,
        messages=payload_messages,
        attachments=attachments,
    )
    destination.write_text(html, encoding="utf-8")
