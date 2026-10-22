#!/usr/bin/env python3
"""One explicit CertScore.ai MCP Light call; curl transport when available."""

import argparse
import email
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ENDPOINT = "https://mcp.certscore.ai/mcp/light"
PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26")
TOOLS = (
    "certscore_scan_site", "certscore_get_scan_status",
    "certscore_get_scan_bundle", "certscore_get_report_evidence_page",
)
MAX_BYTES = 2 * 1024 * 1024
VERSION = "1.0.2"


class McpError(Exception):
    def __init__(self, payload):
        self.payload = payload
        super().__init__(str(payload.get("message", payload.get("status", "MCP error"))))


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise McpError({"status": "connection_error", "message": "Unexpected MCP endpoint redirect; no request was forwarded."})


class BufferedResponse(io.BytesIO):
    def __init__(self, body, headers):
        super().__init__(body)
        self.headers = headers


class CurlOpener:
    """Avoid truncated urllib reads in Muse's proxy. Never replay a request."""
    def __init__(self, executable):
        self.executable = executable

    def open(self, request, timeout=30):
        with tempfile.TemporaryDirectory(prefix="certscore-mcp-") as directory:
            body_path = Path(directory) / "body"
            header_path = Path(directory) / "headers"
            command = [self.executable, "--disable", "--silent", "--show-error", "--max-time", str(timeout),
                       "--connect-timeout", str(min(timeout, 10)), "--max-filesize", str(MAX_BYTES),
                       "--request", request.get_method(), "--dump-header", str(header_path),
                       "--output", str(body_path), "--write-out", "%{http_code}", "--url", request.full_url]
            for key, value in request.header_items():
                if any(character in key + value for character in ("\r", "\n")):
                    raise ValueError("Invalid MCP header.")
                command.extend(["--header", f"{key}: {value}"])
            if request.data is not None:
                command.extend(["--data-binary", "@-"])
            try:
                process = subprocess.run(command, input=request.data, capture_output=True, timeout=timeout + 5, check=False)
            except subprocess.TimeoutExpired:
                raise McpError({"status": "connection_error", "message": "MCP request timed out. No automatic retry was made."}) from None
            if process.returncode:
                raise McpError({"status": "connection_error", "message": "MCP curl transport failed. No automatic retry was made.", "transportExitCode": process.returncode})
            try:
                status = int(process.stdout)
            except ValueError:
                raise McpError({"status": "invalid_response", "message": "MCP transport returned no HTTP status."}) from None
            raw_headers = header_path.read_bytes()
            if len(raw_headers) > 64 * 1024 or body_path.stat().st_size > MAX_BYTES:
                raise McpError({"status": "invalid_response", "message": "MCP response exceeded the client size limit."})
            # Proxy CONNECT and informational responses can precede the final header block.
            blocks = raw_headers.replace(b"\r\n", b"\n").strip().split(b"\n\n")
            http_blocks = [block for block in blocks if block.startswith(b"HTTP/")]
            if not http_blocks:
                raise McpError({"status": "invalid_response", "message": "MCP response headers were missing."})
            headers = email.message_from_bytes(http_blocks[-1].partition(b"\n")[2])
            body = body_path.read_bytes()
        if 300 <= status < 400:
            raise McpError({"status": "connection_error", "message": "Unexpected MCP endpoint redirect; no request was forwarded."})
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, "MCP request failed", headers, io.BytesIO(body))
        if not 200 <= status < 300:
            raise McpError({"status": "invalid_response", "message": "Unexpected MCP HTTP status."})
        return BufferedResponse(body, headers)


def tool_payload(result):
    payload = result.get("structuredContent")
    if not isinstance(payload, dict):
        payload = None
        for item in result.get("content", []) or []:
            if isinstance(item, dict) and item.get("type") == "text":
                try:
                    candidate = json.loads(item.get("text", ""))
                except (ValueError, TypeError):
                    continue
                if isinstance(candidate, dict):
                    payload = candidate
                    break
    if payload is None:
        raise McpError({"status": "invalid_response", "message": "No structured tool result was returned."})
    if result.get("isError") or payload.get("status") == "rate_limited":
        raise McpError(payload)
    return payload


class LightClient:
    def __init__(self, opener=None):
        curl = shutil.which("curl")
        self.opener = opener if opener is not None else CurlOpener(curl) if curl else urllib.request.build_opener(NoRedirects())
        self.session = None
        self.protocol = PROTOCOLS[0]
        self.request_id = 0

    def _headers(self):
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": self.protocol, "User-Agent": f"CertScore.ai-Muse-Skill/{VERSION}"}
        if self.session:
            headers["MCP-Session-Id"] = self.session
        return headers

    def _decode(self, response, request_id):
        if "text/event-stream" not in response.headers.get("Content-Type", ""):
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise McpError({"status": "invalid_response", "message": "MCP response exceeded the client size limit."})
            return json.loads(raw)
        size, data = 0, []
        deadline = time.monotonic() + 45
        while True:
            line = response.readline(MAX_BYTES + 1)
            size += len(line)
            if size > MAX_BYTES or time.monotonic() > deadline:
                raise McpError({"status": "invalid_response", "message": "MCP event stream exceeded the client bounds."})
            if not line.strip():
                if data:
                    event = json.loads("\n".join(data))
                    if isinstance(event, dict) and event.get("id") == request_id:
                        return event
                    data = []
                if not line:
                    break
            elif line.startswith(b"data:"):
                value = line[5:].decode("utf-8").strip()
                if value:
                    data.append(value)
        raise McpError({"status": "connection_error", "message": "MCP stream ended without a matching response. The tool call was not retried."})

    def request(self, method, params=None, notification=False):
        self.request_id += 1
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notification:
            message["id"] = self.request_id
        request = urllib.request.Request(ENDPOINT, json.dumps(message).encode("utf-8"), headers=self._headers(), method="POST")
        try:
            with self.opener.open(request, timeout=30) as response:
                if method == "initialize":
                    self.session = response.headers.get("MCP-Session-Id")
                if notification:
                    return None
                envelope = self._decode(response, message["id"])
        except urllib.error.HTTPError as error:
            error.close()
            if error.code == 429:
                raise McpError({"status": "rate_limited", "httpStatus": 429, "retryAfter": error.headers.get("Retry-After"), "message": "Stop and tell the user; do not retry in a loop."}) from None
            raise McpError({"status": "connection_error", "httpStatus": error.code, "message": "MCP request failed. No automatic retry was made."}) from None
        if not isinstance(envelope, dict) or envelope.get("jsonrpc") != "2.0" or envelope.get("id") != message["id"]:
            raise McpError({"status": "invalid_response", "message": "MCP response identity did not match the request."})
        if "error" in envelope:
            raise McpError({"status": "mcp_error", "error": envelope["error"]})
        result = envelope.get("result")
        if not isinstance(result, dict):
            raise McpError({"status": "invalid_response", "message": "MCP result was not an object."})
        return result

    def connect(self):
        result = self.request("initialize", {"protocolVersion": self.protocol, "capabilities": {}, "clientInfo": {"name": "certscore-muse-skill", "version": VERSION}})
        if result.get("protocolVersion") not in PROTOCOLS:
            raise McpError({"status": "unsupported_protocol", "message": "The server selected an unsupported MCP protocol."})
        self.protocol = result["protocolVersion"]
        self.request("notifications/initialized", notification=True)

    def call(self, name, arguments):
        if name not in TOOLS:
            raise ValueError("Only the four MCP Light tools are supported.")
        result = self.request("tools/call", {"name": name, "arguments": arguments})
        tool_payload(result)  # Validate errors without dropping server navigation or guidance.
        return result

    def close(self):
        if self.session:
            request = urllib.request.Request(ENDPOINT, headers=self._headers(), method="DELETE")
            try:
                self.opener.open(request, timeout=10).close()
            except (urllib.error.URLError, OSError, McpError):
                pass
            self.session = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--list-tools", action="store_true", help="Check the connection and list tools; does not scan a site.")
    action.add_argument("--call", choices=TOOLS, help="Make one explicit tool call.")
    parser.add_argument("--arguments", default="{}", help="Tool arguments as a JSON object.")
    args = parser.parse_args()
    client = LightClient()
    try:
        arguments = json.loads(args.arguments)
        if not isinstance(arguments, dict):
            raise ValueError("--arguments must be a JSON object.")
        client.connect()
        payload = client.request("tools/list") if args.list_tools else client.call(args.call, arguments)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    except McpError as error:
        print(json.dumps(error.payload, ensure_ascii=False, indent=2))
        return 1
    except (ValueError, OSError, urllib.error.URLError) as error:
        print(json.dumps({"status": "client_error", "message": str(error)}))
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
