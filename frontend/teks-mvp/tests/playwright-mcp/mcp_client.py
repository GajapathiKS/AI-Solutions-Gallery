"""Async JSON-RPC (MCP) client used to converse with the Playwright MCP server."""
from __future__ import annotations

import asyncio
import base64
import contextlib
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence

from msgspec import json as msgjson

LOGGER = logging.getLogger("playwright_mcp.client")

_CONTENT_LENGTH_RE = re.compile(rb"Content-Length:\s*(\d+)", re.IGNORECASE)


class MCPError(RuntimeError):
    """Represents an error returned by the MCP server."""

    def __init__(self, message: str, *, code: Optional[int] = None, data: Any | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


NotificationHandler = Callable[[Dict[str, Any]], Awaitable[None] | None]


@dataclass
class Attachment:
    """Represents a binary artifact returned by the MCP server."""

    name: str
    mime_type: str
    data: bytes
    path: Optional[Path] = None


@dataclass
class MessageEvent:
    """Rich message emitted while executing a scenario."""

    role: str
    content: List[Dict[str, Any]]


@dataclass
class RunResult:
    status: str
    messages: List[MessageEvent] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class MCPClient:
    """Minimal JSON-RPC client that speaks the Model Context Protocol via stdio."""

    def __init__(
        self,
        command: Sequence[str],
        *,
        cwd: Optional[Path] = None,
        env: Optional[Dict[str, str]] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ) -> None:
        if not command:
            raise ValueError("Command is required to start the MCP server")
        self._command = list(command)
        self._cwd = str(cwd) if cwd else None
        self._env = env
        self._loop = loop or asyncio.get_event_loop()
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._stdout: Optional[asyncio.StreamReader] = None
        self._stderr_task: Optional[asyncio.Task[None]] = None
        self._reader_task: Optional[asyncio.Task[None]] = None
        self._pending: Dict[int, asyncio.Future[Any]] = {}
        self._next_id = 1
        self._notifications: Dict[str, List[NotificationHandler]] = {}
        self._shutdown = asyncio.Event()

    async def __aenter__(self) -> "MCPClient":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    def on_notification(self, method: str, handler: NotificationHandler) -> None:
        self._notifications.setdefault(method, []).append(handler)

    async def start(self) -> None:
        if self._proc is not None:
            return
        LOGGER.debug("Spawning MCP server: %s", " ".join(self._command))
        self._proc = await asyncio.create_subprocess_exec(
            *self._command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._cwd,
            env=self._env,
        )
        if self._proc.stdout is None or self._proc.stdin is None:
            raise RuntimeError("Failed to open stdio pipes to MCP process")
        self._stdout = self._proc.stdout
        self._reader_task = self._loop.create_task(self._read_loop())
        if self._proc.stderr:
            self._stderr_task = self._loop.create_task(self._consume_stderr(self._proc.stderr))

    async def close(self) -> None:
        if self._proc is None:
            return
        if self._proc.stdin:
            try:
                self._proc.stdin.close()
            except Exception:  # pragma: no cover - defensive
                LOGGER.debug("Failed closing MCP stdin", exc_info=True)
        if self._reader_task:
            await self._shutdown.wait()
            self._reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader_task
        if self._stderr_task:
            self._stderr_task.cancel()
        try:
            await asyncio.wait_for(self._proc.wait(), timeout=2)
        except asyncio.TimeoutError:
            self._proc.kill()
        self._proc = None

    async def initialize(self, client_name: str, client_version: str) -> Dict[str, Any]:
        payload = {
            "clientInfo": {"name": client_name, "version": client_version},
            "protocolVersion": "2024-05-03",
        }
        return await self.request("initialize", payload)

    async def create_message(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        model: str,
        stream: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        params = {
            "model": {"name": model},
            "messages": [
                {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
                {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
            ],
            "stream": stream,
        }
        if metadata:
            params["metadata"] = metadata
        return await self.request("sampling/createMessage", params)

    async def request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("MCP client has not been started")
        message_id = self._next_id
        self._next_id += 1
        envelope = {"jsonrpc": "2.0", "id": message_id, "method": method}
        if params is not None:
            envelope["params"] = params
        payload = msgjson.encode(envelope)
        header = f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
        LOGGER.debug("--> %s", envelope)
        self._proc.stdin.write(header + payload)
        await self._proc.stdin.drain()
        future: asyncio.Future[Any] = self._loop.create_future()
        self._pending[message_id] = future
        return await future

    async def _consume_stderr(self, stream: asyncio.StreamReader) -> None:
        try:
            while not stream.at_eof():
                line = await stream.readline()
                if not line:
                    break
                LOGGER.debug("[mcp stderr] %s", line.decode(errors="ignore").rstrip())
        except asyncio.CancelledError:  # pragma: no cover - cancellation path
            return

    async def _read_loop(self) -> None:
        assert self._stdout is not None
        try:
            while True:
                header_bytes = await self._read_headers()
                if header_bytes is None:
                    break
                match = _CONTENT_LENGTH_RE.search(header_bytes)
                if not match:
                    raise RuntimeError(f"Malformed MCP header: {header_bytes!r}")
                length = int(match.group(1))
                body = await self._stdout.readexactly(length)
                message = msgjson.decode(body)
                LOGGER.debug("<-- %s", message)
                await self._dispatch(message)
        except asyncio.IncompleteReadError:
            LOGGER.debug("MCP stdout closed")
        finally:
            self._shutdown.set()

    async def _read_headers(self) -> Optional[bytes]:
        assert self._stdout is not None
        buffer = bytearray()
        while True:
            line = await self._stdout.readline()
            if not line:
                if buffer:
                    LOGGER.debug("EOF while reading headers: %s", buffer)
                return None
            buffer.extend(line)
            if line in (b"\r\n", b"\n"):
                break
        return bytes(buffer)

    async def _dispatch(self, message: Dict[str, Any]) -> None:
        if "id" in message and ("result" in message or "error" in message):
            message_id = int(message["id"])
            future = self._pending.pop(message_id, None)
            if future is None:
                LOGGER.warning("Received response for unknown id %s", message_id)
                return
            if "error" in message:
                error = message["error"]
                future.set_exception(MCPError(error.get("message", "Unknown MCP error"), code=error.get("code"), data=error.get("data")))
            else:
                future.set_result(message.get("result"))
            return
        method = message.get("method")
        if method:
            handlers = self._notifications.get(method, [])
            for handler in handlers:
                result = handler(message.get("params", {}))
                if asyncio.iscoroutine(result):
                    await result

    # Convenience helpers -------------------------------------------------

    @staticmethod
    def extract_attachments(content: List[Dict[str, Any]], *, default_name_prefix: str = "attachment") -> List[Attachment]:
        attachments: List[Attachment] = []
        counter = 1
        for item in content:
            if item.get("type") in {"image", "binary", "file"}:
                data = item.get("data")
                if not data:
                    continue
                if isinstance(data, str):
                    try:
                        payload = base64.b64decode(data)
                    except Exception:  # pragma: no cover - protective
                        continue
                elif isinstance(data, bytes):
                    payload = data
                else:
                    continue
                mime_type = item.get("mimeType") or item.get("mediaType") or "application/octet-stream"
                name = item.get("name") or f"{default_name_prefix}-{counter}"
                counter += 1
                attachments.append(Attachment(name=name, mime_type=mime_type, data=payload))
        return attachments
