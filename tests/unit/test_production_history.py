"""The historical SQL gate must preserve mutants and transactionally restore current SQL73."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('security', ROOT / 'scripts/test-db-security.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class ProductionHistory(unittest.TestCase):
    def test_all_affected_suites_keep_every_assertion_and_rollback(self):
        for name in h.HISTORICAL_PRODUCTION_SUITES:
            with self.subTest(name=name):
                original = (ROOT / 'tests/integration/security' / name).read_text()
                wrapped = h.historical_production_sql(original, name)
                self.assertTrue(wrapped.endswith(original.split('begin;', 1)[1]))
                self.assertEqual(wrapped.count('create or replace function public.record_production('), 1)
                self.assertEqual(wrapped.count('SEC_RESULT|'), original.count('SEC_RESULT|'))

    def test_historical_definition_precedes_mutation_instead_of_masking_it(self):
        mutant = h.order_mutant('rule_prod_qty')
        sql = 'begin;\n' + mutant + '\nselect 1;\nrollback;\n'
        wrapped = h.historical_production_sql(sql, 'production.sql')
        self.assertLess(wrapped.index('rule:prod-qty'), wrapped.index('-- mutated'))
        self.assertIn(mutant, wrapped)

    def test_current_contracts_are_never_replaced(self):
        for name in ('legacy-production-retirement.sql', 'dough-only-baking.sql', 'dough-preparation.sql'):
            self.assertEqual(h.historical_production_sql('begin;\nrollback;', name), 'begin;\nrollback;')

    def test_missing_transaction_or_rollback_refuses_compatibility(self):
        for sql in ('select 1;', 'begin;\nselect 1;', 'begin;\nbegin;\nrollback;',
                    'begin;\nrollback;\nselect 1;', 'begin;\nrollback;\nrollback;',
                    'begin;\ncommit;\nrollback;'):
            with self.assertRaisesRegex(RuntimeError, 'explicit rolled-back transaction'):
                h.historical_production_sql(sql, 'production.sql')

    def test_changed_applied_source_cannot_be_injected(self):
        with patch.object(h.hashlib, 'sha256') as digest:
            digest.return_value.hexdigest.return_value = 'unreviewed'
            with self.assertRaisesRegex(RuntimeError, 'reviewed pin'):
                h.historical_production_sql('begin;\nrollback;', 'production.sql')


if __name__ == '__main__':
    unittest.main()
