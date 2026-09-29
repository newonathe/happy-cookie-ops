"""Negative drift oracles; no database or secrets."""
import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[3]
guard = runpy.run_path(str(ROOT / 'scripts/verify-function-authority.py'))
BASE = json.loads(guard['MANIFEST'].read_text(encoding='utf-8'))['functions']


class FunctionAuthority(unittest.TestCase):
    def test_exact_inventory_and_reordering_pass(self):
        self.assertEqual(guard['verify_functions'](BASE), 52)
        self.assertEqual(guard['verify_functions'](list(reversed(BASE))), 52)

    def test_unknown_missing_and_duplicate_fail(self):
        unknown = copy.deepcopy(BASE[0])
        unknown['name'] = 'unreviewed_rpc'
        for rows in [BASE+[unknown], BASE[:-1], BASE+[BASE[0]]]:
            with self.subTest(size=len(rows)), self.assertRaises(RuntimeError):
                guard['verify_functions'](rows)

    def test_authority_and_body_mutations_fail(self):
        for field, value in [('owner','anon'), ('acl','{=X/postgres}'),
                             ('execute_service_role',False), ('execute_anon',True),
                             ('config',None), ('body_md5','changed'), ('returns','void')]:
            rows = copy.deepcopy(BASE)
            self.assertNotEqual(rows[0][field], value)
            rows[0][field] = value
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                guard['verify_functions'](rows)

    def test_malformed_inventory_fails(self):
        for value in [None, {}, [None], [{'name':'x'}]]:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                guard['verify_functions'](value)
