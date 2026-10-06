import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B3a, migration 20260101005700: place_order and join_waitlist take their day (and, for place_order, the time of day) from
 * public.business_clock() instead of naming the zone. Both functions take real customer orders, so the new migration must
 * restate each one WHOLE and differ from the definition it replaces in the declaration lines alone, one line for one line.
 *
 * The proof: read both files as text, cut each function out (from `create or replace function public.<name>(` to its
 * revoke/grant lines, ending at the first blank line), put the OLD declaration lines back in the new text, and require the
 * result to equal the earlier text character for character. A single other character that differs, in either body, fails it.
 */
const DIR = join('supabase', 'migrations');
const NEW_FILE = '20260101005700_clock_policies.sql';
const migration = (file: string) => readFileSync(join(DIR, file), 'utf8');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** The function's own text plus the revoke/grant lines that follow it, up to the first blank line. */
function extract(text: string, name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = text.indexOf(marker);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(marker, start + 1), `${name} is defined once`).toBe(-1);
  const close = text.indexOf('\n$$;', start);
  expect(close, `${name} ends at $$;`).toBeGreaterThan(start);
  const blank = text.indexOf('\n\n', close);
  return text.slice(start, blank === -1 ? text.length : blank);
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** `${old}` is the declaration line of the earlier migration, `${replacement}` the line that takes its place. */
const CASES = [
  {
    name: 'place_order',
    earlier: '20260101004000_order_extras.sql',
    lines: [
      {
        old: "  v_local   timestamp := now() at time zone 'Asia/Manila';",
        replacement:
          '  v_local   timestamp := (select c.local_time from public.business_clock() c);'
      },
      {
        old: "  v_today   date := (now() at time zone 'Asia/Manila')::date;",
        replacement: '  v_today   date := (select c.today from public.business_clock() c);'
      }
    ]
  },
  {
    name: 'join_waitlist',
    earlier: '20260101003500_place_order.sql',
    lines: [
      {
        old: "  v_today  date := (now() at time zone 'Asia/Manila')::date;",
        replacement: '  v_today  date := (select c.today from public.business_clock() c);'
      }
    ]
  }
];

describe('place_order and join_waitlist keep their text, apart from the clock lines', () => {
  const next = migration(NEW_FILE);

  it.each(CASES)('$name is the earlier definition with only the declaration lines changed', (c) => {
    const before = extract(migration(c.earlier), c.name);
    const after = extract(next, c.name);

    // The substitution happened: each new line once, each old line not at all.
    for (const line of c.lines) {
      expect(occurrences(after, line.replacement), line.replacement).toBe(1);
      expect(occurrences(after, line.old), line.old).toBe(0);
      expect(occurrences(before, line.old), line.old).toBe(1);
    }

    // And nothing else did: undo the substitution and compare the whole text.
    let restored = after;
    for (const line of c.lines) restored = restored.replace(line.replacement, () => line.old);
    expect(restored).toBe(before);

    // The revoke and grant lines came along.
    expect(after).toContain(`revoke execute on function public.${c.name}(`);
    expect(after).toContain(`grant execute on function public.${c.name}(`);
  });

  it('compares against the LATEST earlier definition of each function', () => {
    const earlierFiles = files.filter((f) => f < NEW_FILE);
    for (const c of CASES) {
      const defining = earlierFiles.filter((f) =>
        migration(f).includes(`create or replace function public.${c.name}(`)
      );
      expect(defining.at(-1), c.name).toBe(c.earlier);
    }
  });

  it('fails when a single other character differs (the comparison is exact)', () => {
    const c = CASES[0];
    const before = extract(migration(c.earlier), c.name);
    const tampered = extract(next, c.name).replace('v_capacity integer;', 'v_capacity  integer;');
    let restored = tampered;
    for (const line of c.lines) restored = restored.replace(line.replacement, () => line.old);
    expect(restored).not.toBe(before);
  });
});

describe('the shop zone is named in one function only', () => {
  const ZONE = "'Asia/Manila'";
  const nameOf = /create (?:or replace )?function public\.([a-z_0-9]+)\(/g;

  /** The text of the latest definition of every function across `upTo` migrations, by name. */
  function latestDefinitions(upTo: string[]): Map<string, string> {
    const latest = new Map<string, string>();
    for (const file of upTo) {
      const text = migration(file);
      for (const match of text.matchAll(nameOf)) {
        const close = text.indexOf('\n$$;', match.index);
        latest.set(match[1], text.slice(match.index, close === -1 ? text.length : close));
      }
    }
    return latest;
  }
  const naming = (m: Map<string, string>) =>
    [...m]
      .filter(([, body]) => body.includes(ZONE))
      .map(([name]) => name)
      .sort();

  it('before this migration, three latest definitions named it', () => {
    expect(naming(latestDefinitions(files.filter((f) => f < NEW_FILE)))).toEqual([
      'business_clock',
      'join_waitlist',
      'place_order'
    ]);
  });

  it('after it, only business_clock does', () => {
    expect(naming(latestDefinitions(files))).toEqual(['business_clock']);
  });

  it('this migration holds the zone literal inside business_clock and nowhere else', () => {
    const next = migration(NEW_FILE);
    const clock = extract(next, 'business_clock');
    expect(occurrences(clock, ZONE)).toBe(1);
    expect(occurrences(next, ZONE)).toBe(1);
  });
});
