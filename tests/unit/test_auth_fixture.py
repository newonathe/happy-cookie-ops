"""Focused, simulated safety guards for the MP-08g private Auth fixture."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("auth_fixture", ROOT / "scripts" / "test-auth-fixture.py")
h = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(h)


class AuthFixtureGuards(unittest.TestCase):
    def setUp(self):
        self.run_id, self.network, self.network_id = "abc123-1234abcd", "hcb-auth-abc123-1234abcd", "n" * 64
        self.cid, self.image = "a" * 64, h.POSTGRES_ID
        self.info = {"id": self.cid, "name": "/hcb-auth-db-" + self.run_id, "image": self.image,
                     "labels": {h.LABEL: self.run_id}, "mounts": [{"Type": "volume", "Name": "owned-volume"}],
                     "network": self.network_id, "bindings": {}, "ports": {}, "running": False}

    def test_prestart_identity_requires_private_unpublished_owned_container(self):
        self.assertEqual(h.assert_container(self.info, container_id=self.cid, name="hcb-auth-db-" + self.run_id,
                                            image_id=self.image, run_id=self.run_id, network_id=self.network_id, running=False), ["owned-volume"])
        for key, value in (("id", "b" * 64), ("labels", {}), ("network", "m" * 64), ("image", "other"),
                           ("bindings", {"5432/tcp": [{"HostIp": "0.0.0.0", "HostPort": "5432"}]}),
                           ("ports", {"9999/tcp": [{"HostIp": "::", "HostPort": "9999"}]}),
                           ("mounts", [{"Type": "bind", "Source": "C:/"}])):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                h.assert_container(self.info | {key: value}, container_id=self.cid, name="hcb-auth-db-" + self.run_id,
                                   image_id=self.image, run_id=self.run_id, network_id=self.network_id, running=False)
        self.assertEqual(h.assert_container(self.info | {"ports": {"9999/tcp": None}}, container_id=self.cid,
                                            name="hcb-auth-db-" + self.run_id, image_id=self.image, run_id=self.run_id,
                                            network_id=self.network_id, running=False), ["owned-volume"])

    def test_network_rejects_unexpected_endpoint(self):
        info = {"id": "n" * 64, "name": self.network, "labels": {h.LABEL: self.run_id},
                "driver": "bridge", "internal": True, "containers": {self.cid: {}, "b" * 64: {}}}
        h.assert_network(info, network_id="n" * 64, name=self.network, run_id=self.run_id, expected_ids=set(info["containers"]), exact=True)
        with self.assertRaises(RuntimeError):
            h.assert_network(info, network_id="n" * 64, name=self.network, run_id=self.run_id, expected_ids={self.cid}, exact=True)
        h.assert_network({**info, "containers": {self.cid: {}}}, network_id="n" * 64, name=self.network,
                         run_id=self.run_id, expected_ids=set(info["containers"]), exact=False)
        for key, value in (("driver", "overlay"), ("internal", False)):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                h.assert_network(info | {key: value}, network_id="n" * 64, name=self.network,
                                 run_id=self.run_id, expected_ids=set(info["containers"]), exact=True)

    def test_images_are_exact_cached_ids(self):
        with patch.object(h, "docker", return_value=h.POSTGRES_ID + "\n"):
            self.assertEqual(h.resolve_image(h.POSTGRES_IMAGE, h.POSTGRES_ID, ROOT), h.POSTGRES_ID)
        with patch.object(h, "docker", return_value="sha256:" + "0" * 64):
            with self.assertRaises(RuntimeError):
                h.resolve_image(h.POSTGRES_IMAGE, h.POSTGRES_ID, ROOT)

    def test_migration_inputs_are_pinned_before_execution(self):
        pins = h.source_pins()
        expected_count = len(pins["migrations"])
        inputs = h.migration_inputs()
        self.assertEqual(len(inputs), expected_count)
        self.assertEqual([name[:14] for name, _content, _digest in inputs],
                         [f"{20260101000000 + 100 * index:014d}" for index in range(expected_count)])
        self.assertTrue(all(len(digest) == 64 for _name, _content, digest in inputs))
        pins["migrations"][inputs[0][0]] = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "differ from reviewed"):
            h.migration_inputs(pins)

    def test_preflight_pin_rejects_changed_sql_before_docker(self):
        pins = h.source_pins()
        pins["preflight_sha256"] = "0" * 64
        with patch.object(sys, "argv", ["fixture"]), patch.object(h, "source_pins", return_value=pins), \
                patch.object(h, "require_local_docker") as docker:
            with self.assertRaisesRegex(RuntimeError, "preflight bytes differ"):
                h.main()
        docker.assert_not_called()

    def test_preflight_parser_requires_all_three_metadata_relations(self):
        with self.assertRaises(RuntimeError):
            h.parse_preflight('{"contract":"provider-session-v1"}')
        record = {"contract": "provider-session-v1", "server_version_num": "150008",
                  "relations": [{"name": name, "owner": "postgres", "rls": False, "acl": None}
                                for name in ("auth.sessions", "auth.users", "public.profiles")]}
        self.assertEqual(h.parse_preflight(json.dumps(record)), record)

    def test_auth_schema_digest_is_schema_only_and_ignores_dump_restrict_nonce(self):
        first = "\\restrict one\nCREATE SCHEMA auth;\nCREATE TABLE auth.sessions(id uuid);\n\\unrestrict one\n"
        second = first.replace("one", "two")
        with patch.object(h, "docker", side_effect=[first, second]) as docker:
            a = h.auth_schema_digest(self.cid, ROOT, "fixture-password")
            b = h.auth_schema_digest(self.cid, ROOT, "fixture-password")
        self.assertEqual(a, b)
        args = docker.call_args_list[0].args[0]
        self.assertIn("--schema-only", args)
        self.assertIn("--schema=auth", args)
        self.assertNotIn("fixture-password", args)

    def test_gotrue_literal_environment_uses_docker_equals_syntax(self):
        args = h.gotrue_environment_args()
        pairs = list(zip(args[::2], args[1::2]))
        self.assertTrue(all(flag == "-e" for flag, _value in pairs))
        literals = [value for _flag, value in pairs[:-2]]
        self.assertEqual(literals, ["GOTRUE_API_HOST=0.0.0.0", "GOTRUE_API_PORT=9999", "GOTRUE_DB_DRIVER=postgres",
                                "GOTRUE_DB_DB_NAMESPACE=auth", "GOTRUE_SITE_URL=http://localhost:3000", "GOTRUE_JWT_EXP=3600",
                                "API_EXTERNAL_URL=http://localhost:9999",
                                "GOTRUE_DISABLE_SIGNUP=true"])
        self.assertEqual(pairs[-2:], [("-e", "GOTRUE_DB_DATABASE_URL"), ("-e", "GOTRUE_JWT_SECRET")])

    def test_synthetic_signup_is_explicit_opt_in(self):
        default = h.gotrue_environment_args()
        opt_in = h.gotrue_environment_args(synthetic_signup=True)
        self.assertIn("GOTRUE_DISABLE_SIGNUP=true", default)
        self.assertNotIn("GOTRUE_MAILER_AUTOCONFIRM=true", default)
        self.assertIn("GOTRUE_DISABLE_SIGNUP=false", opt_in)
        self.assertIn("GOTRUE_EXTERNAL_EMAIL_ENABLED=true", opt_in)
        self.assertIn("GOTRUE_MAILER_AUTOCONFIRM=true", opt_in)

    def test_database_readiness_uses_tcp_not_initialization_socket(self):
        with patch.object(h, "docker", side_effect=["", "supabase_auth_admin"]) as docker, \
                patch.object(h, "psql", side_effect=["supabase_auth_admin", "supabase_admin\ton", ""]) as psql:
            h.wait_for_db(self.cid, "fixture-db", ROOT, "fixture-password")
        args = docker.call_args_list[0].args[0]
        self.assertEqual(args[:5], ["exec", self.cid, "pg_isready", "-h", "127.0.0.1"])
        auth_args = docker.call_args_list[1].args[0]
        self.assertEqual(auth_args[:4], ["exec", "-e", "PGPASSWORD", self.cid])
        self.assertIn("fixture-db", auth_args)
        self.assertIn("alter role supabase_auth_admin", psql.call_args_list[2].args[3])
        self.assertEqual(psql.call_args_list[2].kwargs["user"], "supabase_admin")

    def test_sql_password_is_passed_by_child_environment_only(self):
        with patch.object(h, "docker", return_value="") as docker:
            h.psql(self.cid, ROOT, "fixture-password", "select 1", user="supabase_admin")
        args = docker.call_args.args[0]
        self.assertEqual(args[:4], ["exec", "-e", "PGPASSWORD", "-i"])
        self.assertNotIn("fixture-password", args)
        self.assertEqual(docker.call_args.kwargs["extra_env"], {"PGPASSWORD": "fixture-password"})

    def test_arguments_rejected_before_docker_or_workdir(self):
        with patch.object(sys, "argv", ["fixture", "--publish"]), patch.object(h, "require_local_docker") as check:
            with self.assertRaises(RuntimeError):
                h.main()
        check.assert_not_called()

    def test_secret_is_redacted_from_child_failure(self):
        secret = "fixture-secret-value"
        with self.assertRaises(RuntimeError) as caught:
            h.run([sys.executable, "-c", "import sys; print('ERROR: fixture-secret-value'); sys.exit(1)"],
                  cwd=ROOT, timeout=10, extra_env={"GOTRUE_JWT_SECRET": secret})
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("redacted-generated-secret", str(caught.exception))

    def test_cleanup_refuses_when_captured_claim_set_differs(self):
        # A disposable workdir: the refusal writes a retain marker, which must never land in the repo.
        with tempfile.TemporaryDirectory() as workdir:
            pair = {"cwd": ROOT, "run_id": self.run_id, "workdir": Path(workdir), "db_id": self.cid, "auth_id": "b" * 64,
                    "db_name": "hcb-auth-db-" + self.run_id, "auth_name": "hcb-auth-gotrue-" + self.run_id,
                    "postgres_image": h.POSTGRES_ID, "gotrue_image": h.GOTRUE_ID, "network_name": self.network,
                    "network_id": "n" * 64, "volumes": set()}
            with patch.object(h, "owned", return_value=True), patch.object(h, "docker", return_value=self.cid) as docker:
                with self.assertRaises(RuntimeError):
                    h.cleanup(pair)
            self.assertEqual(docker.call_count, 1)
            self.assertTrue((Path(workdir) / "retain-resources").is_file())
        self.assertFalse((ROOT / "retain-resources").exists())

    def test_cleanup_retains_workdir_when_network_create_response_was_uncertain(self):
        pair = {"cwd": ROOT, "run_id": self.run_id, "workdir": ROOT, "db_id": None, "auth_id": None,
                "db_name": "hcb-auth-db-" + self.run_id, "auth_name": "hcb-auth-gotrue-" + self.run_id,
                "postgres_image": h.POSTGRES_ID, "gotrue_image": h.GOTRUE_ID, "network_name": self.network,
                "network_id": None, "volumes": set()}
        with patch.object(h, "owned", return_value=True), patch.object(h, "docker", side_effect=["", "n" * 64]), \
                patch.object(h.shutil, "rmtree") as remove, patch.object(Path, "write_text") as marker:
            with self.assertRaisesRegex(RuntimeError, "captured exact owned network"):
                h.cleanup(pair)
        remove.assert_not_called(); marker.assert_called_once()

    def test_source_has_no_publish_or_supabase_start_or_config_read(self):
        source = (ROOT / "scripts" / "test-auth-fixture.py").read_text(encoding="utf-8")
        self.assertNotIn("supabase start", source)
        self.assertNotIn("--publish", source)
        self.assertNotIn("Config.Env", source)


if __name__ == "__main__":
    unittest.main()
