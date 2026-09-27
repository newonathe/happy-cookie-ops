import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  column: 'int' | 'cents' | 'text';
  min: number | null;
  max: number | null;
  enum: string[] | null;
  source: string;
}

const cases = settingsCases.keys as SettingsCase[];

const ENGINE_PATH = path.resolve(__dirname, '../../src/store/engine/ops-engine.js');
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260101002800_settings_authority.sql'
);
const engineSource = readFileSync(ENGINE_PATH, 'utf8');
const migrationSource = readFileSync(MIGRATION_PATH, 'utf8');

describe('settings-cases.json completeness', () => {
  it('has exactly 24 keys, each named once', () => {
    expect(cases).toHaveLength(24);
    expect(new Set(cases.map((c) => c.key)).size).toBe(24);
  });

  it('gives every numeric key a min and max, and every text key an enum', () => {
    for (const c of cases) {
      if (c.column === 'text') {
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

  it.each(engineCases.filter((c) => c.column !== 'text').map((c) => [c.key, c] as const))(
    '%s: min/max match a bumpCfg/numCfg call bound in the engine source',
    (_key, c) => {
      const min = c.column === 'cents' ? Math.round((c.min as number) / 100) : c.min;
      const max = c.column === 'cents' ? Math.round((c.max as number) / 100) : c.max;
      // Bounded gap: the row's own min/max, not a later row's, and not an unrelated match
      // anywhere else in a 4000-line file.
      const pattern = new RegExp(
        `(?:'${c.key}',\\s*v,\\s*${min},\\s*${max}\\)|k:\\s*'${c.key}'[\\s\\S]{0,220}?min:\\s*${min},\\s*max:\\s*${max}\\b|bumpCfg\\('${c.key}',\\s*-?1,\\s*${min},\\s*${max}\\))`
      );
      expect(engineSource).toMatch(pattern);
    }
  );

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

describe('settings-cases.json against the migration', () => {
  it.each(cases.map((c) => [c.key, c] as const))(
    '%s: appears in the migration with the same bounds',
    (_key, c) => {
      if (c.column === 'text') {
        const pattern = new RegExp(
          `'${c.key}',\\s*'text',\\s*null::numeric,\\s*null::numeric,\\s*[\\s\\S]{0,20}array\\[([\\s\\S]{0,400}?)\\]`
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
      ...migrationSource.matchAll(/\n\s*\('([a-zA-Z]+)',\s*'(?:int|cents|text)',/g)
    ].map((m) => m[1]);
    expect(new Set(inMigration)).toEqual(new Set(cases.map((c) => c.key)));
  });
});

describe('settings-cases.json against the app adapter (MP-09 b2)', () => {
  it('src/lib/data/settings.ts puts every key in the same column as the fixture', () => {
    expect(SETTING_COLUMNS).toEqual(Object.fromEntries(cases.map((c) => [c.key, c.column])));
  });
});
