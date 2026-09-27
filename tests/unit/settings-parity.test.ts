import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pesosToCentavos } from '@/lib/money';
import { SETTING_COLUMNS } from '@/lib/data/settings';
import settingsCases from '../fixtures/settings-cases.json';

/**
 * docs/state/G2-plan.md "Slice audit" (MP-09 b): save_setting()'s bounds are the engine's
 * own bumpCfg/numCfg call bounds and DEFAULT_CFG, recorded once in
 * tests/fixtures/settings-cases.json. This checks that fixture two ways — against the
 * protected engine's own source text (so it cannot silently diverge from what the engine
 * actually enforces) and against the migration's own VALUES text (so the SQL is not an
 * unchecked second copy) — the same "one rule in two places" discipline
 * src/lib/rules/capacity.ts exists to enforce, extended to three places here.
 */
interface SettingsCase {
  key: string;
  column: 'int' | 'cents' | 'text' | 'half' | 'channels' | 'list';
  min: number | null;
  max: number | null;
  enum: string[] | null;
  source: string;
}

const cases = settingsCases.keys as SettingsCase[];

const ENGINE_PATH = path.resolve(__dirname, '../../src/store/engine/ops-engine.js');
// The newest migration that (re)defines save_setting() is the one in force: b1's
// 20260101002800 until MP-09 b3's 20260101002900 replaced it. Pinning a file name here
// would let a later redefinition drift while this test kept passing against stale text.
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const MIGRATION_PATH = path.join(
  MIGRATIONS_DIR,
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) =>
      readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8').includes(
        'function public.save_setting('
      )
    )
    .at(-1) ?? ''
);
const engineSource = readFileSync(ENGINE_PATH, 'utf8');
const migrationSource = readFileSync(MIGRATION_PATH, 'utf8');

describe('settings-cases.json completeness', () => {
  it('has exactly 28 keys, each named once', () => {
    expect(cases).toHaveLength(28);
    expect(new Set(cases.map((c) => c.key)).size).toBe(28);
  });

  it('reads the newest save_setting() definition', () => {
    expect(path.basename(MIGRATION_PATH)).toBe('20260101002900_settings_preferences.sql');
  });

  it('gives every numeric or list key a min and max, and every text or channel key an enum', () => {
    for (const c of cases) {
      if (c.column === 'text' || c.column === 'channels') {
        expect(c.enum, c.key).not.toBeNull();
        expect(c.enum!.length).toBeGreaterThan(0);
      } else {
        expect(c.min, c.key).not.toBeNull();
        expect(c.max, c.key).not.toBeNull();
        expect(c.enum, c.key).toBeNull();
      }
    }
  });
});

describe('settings-cases.json against the protected engine source', () => {
  const engineCases = cases.filter((c) => c.source.startsWith('engine:'));

  it('covers at least the 11 numeric rules, capacity and the two schedule hours', () => {
    expect(engineCases.length).toBeGreaterThanOrEqual(14);
  });

  it.each(
    engineCases
      .filter((c) => c.column !== 'text' && c.column !== 'channels')
      .map((c) => [c.key, c] as const)
  )('%s: min/max match a bumpCfg/numCfg call bound in the engine source', (_key, c) => {
    const min = c.column === 'cents' ? Math.round((c.min as number) / 100) : c.min;
    const max = c.column === 'cents' ? Math.round((c.max as number) / 100) : c.max;
    // Bounded gap: the row's own min/max, not a later row's, and not an unrelated match
    // anywhere else in a 4000-line file.
    const pattern = new RegExp(
      `(?:'${c.key}',\\s*v,\\s*${min},\\s*${max}\\)|k:\\s*'${c.key}'[\\s\\S]{0,220}?min:\\s*${min},\\s*max:\\s*${max}\\b|bumpCfg\\('${c.key}',\\s*-?1,\\s*${min},\\s*${max}\\))`
    );
    expect(engineSource).toMatch(pattern);
  });

  it("priceMode enum matches the engine's priceModes labels", () => {
    const block = engineSource.match(/priceModes:\s*\[([\s\S]*?)\]\.map/)?.[1] ?? '';
    const labels = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const fixture = cases.find((c) => c.key === 'priceMode')!;
    expect(new Set(labels)).toEqual(new Set(fixture.enum));
  });

  it("retention enum matches the engine's RETENTION_DAYS keys", () => {
    const block = engineSource.match(/const RETENTION_DAYS = \{([\s\S]*?)\};/)?.[1] ?? '';
    const labels = [...block.matchAll(/'([^']*)':/g)].map((m) => m[1]);
    const fixture = cases.find((c) => c.key === 'retention')!;
    expect(new Set(labels)).toEqual(new Set(fixture.enum));
  });

  it("converts every cents-column bound from the engine's pesos with src/lib/money.ts", () => {
    for (const c of cases.filter((x) => x.column === 'cents')) {
      const pesoMatch = engineSource.match(
        new RegExp(`k:\\s*'${c.key}'[\\s\\S]{0,220}?min:\\s*(\\d+),\\s*max:\\s*(\\d+)\\b`)
      );
      expect(pesoMatch, c.key).not.toBeNull();
      const [, pesoMin, pesoMax] = pesoMatch!;
      expect(pesosToCentavos(Number(pesoMin))).toBe(c.min);
      expect(pesosToCentavos(Number(pesoMax))).toBe(c.max);
    }
  });
});

describe('MP-09 b3 kinds against the engine and the migration defaults', () => {
  it('stores exactly the keys the engine steps by 0.5 as half steps', () => {
    const halfKeys = cases.filter((c) => c.column === 'half').map((c) => c.key);
    expect(halfKeys.sort()).toEqual(['cogsMultiple', 'taxRate']);
    for (const key of halfKeys) {
      expect(engineSource, key).toMatch(new RegExp(`k: '${key}'[^\\n]{0,200}step: 0\\.5, min:`));
    }
  });

  it("channels match BASE_STATE's alert names and defaults", () => {
    const block = engineSource.match(/\n {2}channels: \{([\s\S]*?)\n {2}\},/)?.[1] ?? '';
    const engineDefault = Object.fromEntries(
      [...block.matchAll(/'([^']*)': (true|false)/g)].map((m) => [m[1], m[2] === 'true'])
    );
    expect(Object.keys(engineDefault)).toHaveLength(8);
    expect(new Set(Object.keys(engineDefault))).toEqual(
      new Set(cases.find((c) => c.key === 'channels')!.enum)
    );
    const sqlDefault = migrationSource.match(/\('channels', [^']*'(\{[^']*\})'::jsonb\)/)?.[1];
    expect(JSON.parse(sqlDefault ?? 'null')).toEqual(engineDefault);
  });

  it("the default categories are BASE_STATE's categories, in order", () => {
    const engineList = engineSource.match(/\n {2}categories: (\[[^\]]*\]),/)?.[1] ?? '[]';
    const sqlList = migrationSource.match(/\('categories', [^']*'(\[[^']*\])'::jsonb\)/)?.[1];
    const expected = JSON.parse(engineList.replace(/'/g, '"')) as string[];
    expect(expected.length).toBeGreaterThan(5);
    expect(JSON.parse(sqlList ?? 'null')).toEqual(expected);
  });
});

describe('settings-cases.json against the migration', () => {
  it.each(cases.map((c) => [c.key, c] as const))(
    '%s: appears in the migration with the same bounds',
    (_key, c) => {
      if (c.column === 'text' || c.column === 'channels') {
        const pattern = new RegExp(
          `'${c.key}',\\s*'${c.column}',\\s*null::numeric,\\s*null::numeric,\\s*[\\s\\S]{0,20}array\\[([\\s\\S]{0,400}?)\\]`
        );
        const match = migrationSource.match(pattern);
        expect(match, c.key).not.toBeNull();
        for (const label of c.enum!) expect(match![1]).toContain(`'${label}'`);
      } else {
        const pattern = new RegExp(
          `'${c.key}',\\s*'${c.column}',\\s*${c.min}(?:::numeric)?,\\s*${c.max}(?:::numeric)?,`
        );
        expect(migrationSource).toMatch(pattern);
      }
    }
  );

  it('lists no key the migration does not also validate, and vice versa', () => {
    const inMigration = [
      ...migrationSource.matchAll(
        /\n\s*\('([a-zA-Z]+)',\s*'(?:int|cents|text|half|channels|list)',/g
      )
    ].map((m) => m[1]);
    expect(new Set(inMigration)).toEqual(new Set(cases.map((c) => c.key)));
  });
});

describe('settings-cases.json against the app adapter (MP-09 b2)', () => {
  it('src/lib/data/settings.ts puts every key in the same column as the fixture', () => {
    expect(SETTING_COLUMNS).toEqual(Object.fromEntries(cases.map((c) => [c.key, c.column])));
  });
});
