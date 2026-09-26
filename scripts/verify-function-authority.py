"""Exact local public-function drift guard; no remote connection or auto-update."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tests/fixtures/function-authority.json'


def verify_functions(actual):
    expected = json.loads(MANIFEST.read_text(encoding='utf-8'))['functions']

    def keyed(rows):
        if not isinstance(rows, list):
            raise RuntimeError('function inventory is not a list')
        result = {}
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get('name'), str) or not isinstance(row.get('identity'), str):
                raise RuntimeError('function inventory identity is invalid')
            key = (row['name'], row['identity'])
            if key in result:
                raise RuntimeError('duplicate function identity')
            result[key] = row
        return result

    wanted, observed = keyed(expected), keyed(actual)
    if wanted.keys() != observed.keys():
        raise RuntimeError('unreviewed or missing public function identity')
    for key in wanted:
        if wanted[key] != observed[key]:
            raise RuntimeError('public function authority drift: ' + key[0])
    return len(wanted)
