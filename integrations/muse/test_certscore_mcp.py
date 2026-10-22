"""Offline transport regressions; never contact the service or create a scan."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location('certscore_mcp', Path(__file__).parent / 'certscore-website-privacy-scan/scripts/certscore_mcp.py')
mcp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mcp)


class Response(io.BytesIO):
    def __init__(self, payload=b'', headers=None):
        super().__init__(payload)
        self.headers = headers or {'Content-Type': 'application/json'}


def reply(request_id, result, headers=None):
    return Response(json.dumps({'jsonrpc': '2.0', 'id': request_id, 'result': result}).encode(), headers)


class Opener:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    def open(self, request, timeout=None):
        self.requests.append(request)
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


class TransportTests(unittest.TestCase):
    def test_negotiates_session_lists_only_and_cleans_up(self):
        opener = Opener([
            reply(1, {'protocolVersion': '2025-06-18'}, {'Content-Type': 'application/json', 'MCP-Session-Id': 'test-session'}),
            Response(), reply(3, {'tools': []}), Response(),
        ])
        client = mcp.LightClient(opener)
        client.connect()
        self.assertEqual(client.request('tools/list'), {'tools': []})
        client.close()
        messages = [json.loads(req.data) for req in opener.requests if req.data]
        self.assertEqual([msg['method'] for msg in messages], ['initialize', 'notifications/initialized', 'tools/list'])
        self.assertNotIn('id', messages[1])
        self.assertEqual(opener.requests[2].get_header('Mcp-session-id'), 'test-session')
        self.assertEqual(opener.requests[2].get_header('Mcp-protocol-version'), '2025-06-18')
        self.assertEqual(opener.requests[-1].method, 'DELETE')
        self.assertTrue(all(req.full_url == mcp.ENDPOINT and req.get_header('Authorization') is None for req in opener.requests))

    def test_sse_skips_notifications_and_preserves_evidence_arguments(self):
        event = {'jsonrpc': '2.0', 'id': 1, 'result': {'structuredContent': {'status': 'ok', 'nextCursor': 'opaque-cursor'}}}
        stream = b': keepalive\n\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n' + b'data: ' + json.dumps(event).encode() + b'\n\n'
        opener = Opener([Response(stream, {'Content-Type': 'text/event-stream'})])
        client = mcp.LightClient(opener)
        arguments = {'scanId': 'existing-scan', 'cursor': 'opaque', 'workpaper': 'original'}
        self.assertEqual(client.call('certscore_get_report_evidence_page', arguments)['structuredContent']['nextCursor'], 'opaque-cursor')
        self.assertEqual(json.loads(opener.requests[0].data)['params']['arguments'], arguments)

    def test_429_and_ambiguous_network_error_never_replay(self):
        for error in (urllib.error.HTTPError(mcp.ENDPOINT, 429, 'limit', {'Retry-After': '60'}, None), urllib.error.URLError('timeout')):
            with self.subTest(error=type(error).__name__):
                opener = Opener([error])
                with self.assertRaises((mcp.McpError, urllib.error.URLError)):
                    mcp.LightClient(opener).call('certscore_scan_site', {'url': 'https://example.com'})
                self.assertEqual(len(opener.requests), 1)

    def test_wrong_identity_and_oversized_response_fail_closed(self):
        for response in (reply(2, {}), Response(b'x' * (mcp.MAX_BYTES + 1))):
            with self.assertRaises(mcp.McpError):
                mcp.LightClient(Opener([response])).request('tools/list')

    def test_tool_errors_and_malformed_content(self):
        with self.assertRaises(mcp.McpError):
            mcp.tool_payload({'isError': True, 'structuredContent': {'status': 'rate_limited'}})
        with self.assertRaises(mcp.McpError):
            mcp.tool_payload({'content': [None, 'invalid']})
        self.assertEqual(mcp.tool_payload({'content': [{'type': 'text', 'text': '{"scanId":"retained"}'}]}), {'scanId': 'retained'})

    def test_preserves_server_navigation_and_guidance(self):
        result = {'structuredContent': {'scanId': 'retained', 'reviewNavigation': {'baseline': {'scanId': 'retained'}}},
                  '_meta': {'ai.certscore/responseGuidance': {'reportUrl': 'https://certscore.ai/scan/retained'}},
                  'content': [{'type': 'text', 'text': 'Relevant optional next actions'}]}
        client = mcp.LightClient(Opener([reply(1, result)]))
        self.assertEqual(client.call('certscore_get_scan_bundle', {'scanId': 'retained'}), result)

    def test_redirect_is_not_forwarded(self):
        with self.assertRaises(mcp.McpError):
            mcp.NoRedirects().redirect_request(None, None, 307, '', {}, 'https://other.example')


if __name__ == '__main__':
    unittest.main()
