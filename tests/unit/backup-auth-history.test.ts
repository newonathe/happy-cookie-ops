import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authHistoryEnvironment } from '../../scripts/f1-backup.mjs';

const cliOutput = (exports: string[]) =>
  `--exclude-table "auth.schema_migrations"\n${exports.join('\n')}`;

describe('F1 auth-history connection details', () => {
  it('resolves all five PostgreSQL exports as literal environment values', () => {
    const password = `dollar$ backtick\` ; $(whoami) "quoted"`;
    const actual = authHistoryEnvironment(
      cliOutput([
        'export PGHOST="127.0.0.1"',
        'export PGPORT="54322"',
        'export PGUSER="postgres"',
        `export PGPASSWORD="dollar$ backtick\` ; $(whoami) \\"quoted\\""`,
        'export PGDATABASE="postgres"'
      ])
    );

    expect(actual).toEqual({
      PGHOST: '127.0.0.1',
      PGPORT: '54322',
      PGUSER: 'postgres',
      PGPASSWORD: password,
      PGDATABASE: 'postgres'
    });
  });

  it('rejects missing exports with a diagnostic that excludes the supplied secret', () => {
    const secret = 'synthetic-secret-that-must-not-appear';
    let diagnostic = '';
    try {
      authHistoryEnvironment(cliOutput([
        'export PGHOST="127.0.0.1"',
        'export PGPORT="54322"',
        'export PGUSER="postgres"',
        `export PGPASSWORD="${secret}"`
      ]));
    } catch (error) {
      diagnostic = String(error);
    }

    expect(diagnostic).toContain('could not be safely resolved');
    expect(diagnostic).not.toContain(secret);
  });

  it('rejects duplicate exports with a diagnostic that excludes the supplied secret', () => {
    const secret = 'synthetic-secret-that-must-not-appear';
    let diagnostic = '';
    try {
      authHistoryEnvironment(cliOutput([
        'export PGHOST="127.0.0.1"',
        'export PGUSER="postgres"',
        `export PGPASSWORD="${secret}"`,
        'export PGDATABASE="postgres"',
        'export PGDATABASE="other"'
      ]));
    } catch (error) {
      diagnostic = String(error);
    }

    expect(diagnostic).toContain('could not be safely resolved');
    expect(diagnostic).not.toContain(secret);
  });

  it('fails closed when the CLI auth-history exclusion is changed or missing', () => {
    const valid = cliOutput([
      'export PGHOST="127.0.0.1"',
      'export PGPORT="54322"',
      'export PGUSER="postgres"',
      'export PGPASSWORD="synthetic-secret"',
      'export PGDATABASE="postgres"'
    ]);

    expect(() => authHistoryEnvironment(valid.replace('auth.schema_migrations', 'auth.other')))
      .toThrow('CLI Auth-history exclusion changed');
    expect(() => authHistoryEnvironment(valid.replace('--exclude-table "auth.schema_migrations"', '')))
      .toThrow('CLI Auth-history exclusion changed');
  });

  it('rejects an extra export instead of silently selecting its last value', () => {
    expect(() => authHistoryEnvironment(cliOutput([
      'export PGHOST="127.0.0.1"', 'export PGPORT="54322"',
      'export PGUSER="postgres"', 'export PGPASSWORD="synthetic-secret"',
      'export PGDATABASE="postgres"', 'export PGDATABASE="other"'
    ]))).toThrow('could not be safely resolved');
  });

  it('can be imported without starting a backup operation', () => {
    const moduleUrl = pathToFileURL(path.resolve('scripts/f1-backup.mjs')).href;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(moduleUrl)})`],
      { encoding: 'utf8', env: { ...process.env, F1_BACKUP_KEY: '' } }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
