#!/usr/bin/env python3
"""One explicit CertScore.ai MCP Light call; Python standard library only."""

import argparse
import json
import sys
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


class McpError(Exception):
    def __init__(self, payload):
        self.payload = payload
        super().__init__(str(payload.get("message", payload.get("status", "MCP error"))))


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise McpError({"status": "connection_error", "message": "Unexpected MCP endpoint redirect; no request was forwarded."})


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
        self.opener = opener or urllib.request.build_opener(NoRedirects())
        self.session = None
        self.protocol = PROTOCOLS[0]
        self.request_id = 0

    def _headers(self):
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": self.protocol, "User-Agent": "CertScore.ai-Muse-Skill/1.0.0"}
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
        result = self.request("initialize", {"protocolVersion": self.protocol, "capabilities": {}, "clientInfo": {"name": "certscore-muse-skill", "version": "1.0.0"}})
        if result.get("protocolVersion") not in PROTOCOLS:
            raise McpError({"status": "unsupported_protocol", "message": "The server selected an unsupported MCP protocol."})
        self.protocol = result["protocolVersion"]
        self.request("notifications/initialized", notification=True)

    def call(self, name, arguments):
        if name not in TOOLS:
            raise ValueError("Only the four MCP Light tools are supported.")
        return tool_payload(self.request("tools/call", {"name": name, "arguments": arguments}))

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
