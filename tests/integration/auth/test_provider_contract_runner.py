"""Runner guard tests; simulated fixture only, never SQL/provider acceptance."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('provider_runner', ROOT / 'scripts/test-provider-session-contract.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerGuards(unittest.TestCase):
    def exercise(self, fixture, times=1):
        with tempfile.TemporaryDirectory(prefix='hc-provider-guard-') as directory:
            root = Path(directory)
            (root / 'docs/state/evidence').mkdir(parents=True)
            sql = root / 'fixture.sql'; sql.write_text('select 1;', encoding='utf-8')
            fake_spec = SimpleNamespace(loader=SimpleNamespace(exec_module=lambda module: None))
            with patch.multiple(runner, ROOT=root, SQL=sql), patch.object(runner.sys, 'argv', ['runner']), \
                 patch.object(runner.importlib.util, 'spec_from_file_location', return_value=fake_spec), \
                 patch.object(runner.importlib.util, 'module_from_spec', return_value=fixture), contextlib.redirect_stdout(io.StringIO()):
                codes = [runner.main() for _ in range(times)]
            reports = [json.loads(path.read_text(encoding='utf-8')) for path in (root / 'docs/state/evidence').glob('MP-08e-provider-*.json')]
            return codes, reports

    def test_unavailable_engine_never_starts_fixture_or_sql_and_preserves_attempts(self):
        fixture = SimpleNamespace(require_local_docker=Mock(side_effect=RuntimeError('private diagnostic')), main=Mock(), psql=Mock())
        codes, reports = self.exercise(fixture, times=2)
        self.assertEqual(codes, [1, 1]); self.assertEqual(len(reports), 2)
        fixture.main.assert_not_called(); fixture.psql.assert_not_called()
        for report in reports:
            self.assertEqual(report['status'], 'BLOCKED_ENVIRONMENT'); self.assertIs(report['fixture_created'], False)
            self.assertEqual(report['runs'], []); self.assertNotIn('private diagnostic', json.dumps(report))

    def test_arguments_are_rejected_before_loading_fixture(self):
        with patch.object(runner.sys, 'argv', ['runner', 'postgresql://forbidden']), patch.object(runner.importlib.util, 'spec_from_file_location') as load:
            with self.assertRaises(SystemExit): runner.main()
            load.assert_not_called()

    def test_pass_requires_two_equal_metadata_results_and_successful_fixture(self):
        for count, changed, exit_code, expected in [(2, False, 0, 'PASS'), (1, False, 0, 'FAIL'), (2, True, 0, 'FAIL'), (2, False, 1, 'FAIL')]:
            with self.subTest(count=count, changed=changed, exit_code=exit_code):
                fixture = SimpleNamespace(require_local_docker=Mock())
                fixture.psql = Mock(side_effect=[json.dumps({'contract':'provider-session-v1','version':i if changed else 1}) for i in range(count)])
                def fake_main(*, after_reset):
                    for _ in range(count): after_reset('owned-fixture', Path('.'), 'unused', {})
                    return exit_code
                fixture.main = fake_main
                codes, reports = self.exercise(fixture)
                self.assertEqual(reports[0]['status'], expected); self.assertEqual(codes, [0 if expected == 'PASS' else 1])


if __name__ == '__main__':
    unittest.main()
