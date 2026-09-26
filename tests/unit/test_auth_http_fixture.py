"""Local-only guards for synthetic GoTrue HTTP orchestration."""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("auth_http_fixture", ROOT / "scripts" / "test-auth-http-fixture.py")
assert SPEC is not None and SPEC.loader is not None
h = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(h)
USER = "00000000-0000-4000-8000-000000000001"
SESSION = "00000000-0000-4000-8000-000000000002"


def jwt(payload: dict) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    return "eyJhbGciOiJIUzI1NiJ9." + encoded + ".signature"


class AuthHttpFixtureGuards(unittest.TestCase):
    def test_claims_parse_only_canonical_bounded_identifiers(self):
        self.assertEqual(h.session_claims(jwt({"sub": USER, "session_id": SESSION})), (USER, SESSION))
        for token in ("not-a-jwt", jwt({"sub": USER}), jwt({"sub": USER, "session_id": "bad"}),
                      "x.abc=.z", "x." + "a" * 9000 + ".z"):
            with self.subTest(token=token[:12]), self.assertRaises(RuntimeError):
                h.session_claims(token)

    def test_http_target_is_fixed_and_token_stays_out_of_host_arguments(self):
        pair = {"auth_id": "a" * 64, "cwd": ROOT}
        with patch.object(h.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b'{"id":"ok"}',
                                                                                         b'HTTP/1.1 200 OK\n')) as run:
            self.assertEqual(h.http(pair, "/user", access_token="TOKEN_CANARY"), (200, {"id": "ok"}))
        args = run.call_args.args[0]
        self.assertNotIn("TOKEN_CANARY", repr(args))
        self.assertEqual(run.call_args.kwargs["env"]["HC_AUTH_TOKEN"], "TOKEN_CANARY")
        self.assertIn("-e", args)
        with patch.object(h.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                h.http(pair, "https://outside.example.test/user")
            run.assert_not_called()

    def test_local_logout_uses_post_without_a_browser_body(self):
        pair = {"auth_id": "a" * 64, "cwd": ROOT}
        response = subprocess.CompletedProcess([], 0, b"", b"HTTP/1.1 204 No Content\n")
        with patch.object(h.subprocess, "run", return_value=response) as run:
            self.assertEqual(h.http(pair, "/logout?scope=local", post_empty=True), (204, None))
        command = run.call_args.args[0]
        self.assertIn("--post-file=/dev/stdin", command[-1])
        self.assertEqual(run.call_args.kwargs["input"], b"")

    def test_private_peer_error_body_is_bounded_and_token_absent_from_argv(self):
        pair = {"auth_name": "auth-fixture", "db_id": "a" * 64, "cwd": ROOT}
        body = b'{"code":403,"error_code":"session_not_found","msg":"PRIVATE"}'
        raw = b'HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body
        with patch.object(h.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, raw, b"")) as run:
            status, parsed = h.revoked_user_response(pair, "TOKEN_CANARY")
        self.assertEqual((status, parsed["error_code"]), (403, "session_not_found"))
        self.assertNotIn("TOKEN_CANARY", repr(run.call_args.args[0]))
        self.assertEqual(run.call_args.kwargs["env"]["HC_AUTH_TOKEN"], "TOKEN_CANARY")

    def test_duplicate_logout_uses_fixed_private_post_target_and_sanitizes_shape(self):
        pair = {"auth_name": "auth-fixture", "db_id": "a" * 64, "cwd": ROOT}
        body = b'{"code":403,"error_code":"session_not_found","msg":"PRIVATE_CANARY"}'
        raw = b'HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body
        with patch.object(h.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, raw, b"")) as run:
            status, parsed = h.revoked_logout_response(pair, "TOKEN_CANARY")
        self.assertEqual((status, h.sanitized_error(parsed)), (403, (403, "session_not_found", ["code", "error_code", "msg"])))
        command = run.call_args.args[0]
        self.assertIn("--request POST", command[-1])
        self.assertIn("/logout?scope=local", command[-1])
        self.assertNotIn("TOKEN_CANARY", repr(command))
        self.assertNotIn("PRIVATE_CANARY", repr(h.sanitized_error(parsed)))
        self.assertEqual(run.call_args.kwargs["env"]["HC_AUTH_TOKEN"], "TOKEN_CANARY")

    def test_private_peer_rejects_external_or_nonfixed_method_before_subprocess(self):
        pair = {"auth_name": "auth-fixture", "db_id": "a" * 64, "cwd": ROOT}
        with patch.object(h.subprocess, "run") as run:
            for path, method in (("https://outside.example.test", "POST"), ("/logout?scope=local", "GET")):
                with self.subTest(path=path, method=method), self.assertRaises(RuntimeError):
                    h.private_peer_response(pair, "TOKEN_CANARY", path=path, method=method)
            run.assert_not_called()

    def test_http_response_errors_never_include_provider_body(self):
        pair = {"auth_id": "a" * 64, "cwd": ROOT}
        response = subprocess.CompletedProcess([], 8, b'{"error":"SECRET_CANARY"}', b'HTTP/1.1 500 ERROR\n')
        with patch.object(h.subprocess, "run", return_value=response):
            status, body = h.http(pair, "/user")
        self.assertEqual(status, 500)
        self.assertEqual(body, {"error": "SECRET_CANARY"})
        with self.assertRaises(RuntimeError) as caught:
            h.token_result(body)
        self.assertNotIn("SECRET_CANARY", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
