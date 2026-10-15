import type { BazaarDay, BazaarSummary, CloseLine } from '@/lib/data/bazaar-days';
import type { CloseInput, ReviewFigure, ReviewStockRow } from '@/lib/bazaar/live-bazaar-types';
import { COST_COPY } from '@/lib/orders/staff-copy';
import { costPesosToCentavos, pesosToCentavos } from '@/lib/money';
import { cookiesText } from '@/lib/bazaar/plan';
import { peso, pesoUnit } from '@/lib/money/format';
import { dateRange } from '@/lib/data/scheduled-events';

/**
 * A bazaar day's review and an event's summary, as words (S3). Every figure here is `bazaar_summary`'s, formatted: nothing
 * is worked out again, so the screen can never disagree with the database. The one sum made here is what should be left
 * of a flavour before she counts (on the table less sold, given away and lost), which only bounds what she may type; the
 * database works the day out again when it closes. A cost that is not known reads "Cost pending", never ₱0.
 */
const MONEY = /^[0-9]{1,7}(\.[0-9]{1,2})?$/;
const COST = /^[0-9]{1,6}(\.[0-9]{1,4})?$/;
const COUNT = /^[0-9]{1,5}$/;

/** "₱880.00", "-₱5.00", or "Cost pending" for an amount that is not known. */
export function moneyText(cents: number | null): string {
  return cents === null ? COST_COPY.pending : peso(cents);
}

/** "₱12.005", from centavos with up to four decimals; "Cost pending" when there is none. */
export function unitCostText(unitCents: number | null): string {
  return unitCents === null || !Number.isFinite(unitCents)
    ? COST_COPY.pending
    : pesoUnit(unitCents);
}

const plural = (n: number, one: string, many: string) =>
  n.toLocaleString('en-PH') + ' ' + (n === 1 ? one : many);

type Part = ReviewFigure['parts'][number];

function revenueFigure(
  key: string,
  r: {
    revenueCents: number;
    grossCents: number;
    discountCents: number;
    freebieCents: number;
    byPay: Record<string, number>;
    sales: number;
    voided: number;
  }
): ReviewFigure {
  const parts: Part[] = [
    {
      label: 'Before discounts and freebies',
      detail: plural(r.sales, 'sale', 'sales'),
      valueText: moneyText(r.grossCents)
    }
  ];
  if (r.discountCents)
    parts.push({ label: 'Discounts', detail: null, valueText: moneyText(-r.discountCents) });
  if (r.freebieCents)
    parts.push({
      label: 'Given away',
      detail: 'At their price',
      valueText: moneyText(-r.freebieCents)
    });
  for (const method of Object.keys(r.byPay).sort())
    parts.push({
      label: method,
      detail: 'How it was paid',
      valueText: moneyText(r.byPay[method] ?? 0)
    });
  return {
    key,
    label: 'Revenue',
    valueText: moneyText(r.revenueCents),
    note: r.voided
      ? plural(r.voided, 'voided sale is', 'voided sales are') + ' not counted.'
      : null,
    parts
  };
}

/** The day's own figures: revenue, cash, fees. */
export function dayFiguresOf(s: BazaarSummary, day: BazaarDay): ReviewFigure[] {
  const cashParts: Part[] = [
    { label: 'Float', detail: null, valueText: moneyText(day.floatCents) },
    { label: 'Cash sales', detail: null, valueText: moneyText(day.cashSalesCents) }
  ];
  let cash: ReviewFigure;
  if (day.state === 'closed') {
    const word =
      day.countedCents === null
        ? 'Not counted'
        : day.shortCents
          ? moneyText(day.shortCents) + ' short'
          : day.overCents
            ? moneyText(day.overCents) + ' over'
            : day.overCents === 0 && day.shortCents === 0
              ? 'Exact'
              : moneyText(day.countedCents) + ' counted';
    cash = {
      key: 'day-cash',
      label: 'Cash',
      valueText: word,
      note: null,
      parts: [
        ...cashParts,
        { label: 'Expected', detail: null, valueText: moneyText(day.cashExpectedCents) },
        {
          label: 'Counted',
          detail: null,
          valueText: day.countedCents === null ? 'Not counted' : moneyText(day.countedCents)
        }
      ]
    };
  } else
    cash = {
      key: 'day-cash',
      label: 'Cash expected in the drawer',
      valueText: moneyText(day.cashExpectedCents),
      note: null,
      parts: cashParts
    };
  return [
    revenueFigure('day-revenue', day),
    cash,
    {
      key: 'day-fees',
      label: 'Fees for this day',
      valueText: moneyText(day.feesCents),
      note: null,
      parts: s.fees.parts
        .filter((f) => f.dayId === day.id)
        .map((f) => ({
          label: f.label,
          detail: f.atTheTill ? 'Added at the till' : null,
          valueText: moneyText(f.amountCents)
        }))
    }
  ];
}

/** Why a cost is pending, in her words. */
function whyText(s: BazaarSummary): string | null {
  if (s.cookieCost.why === null) return null;
  const names = s.cookieCost.lines.filter((l) => l.uncosted).map((l) => l.name);
  return (
    'No cost per cookie yet for ' +
    (names.length ? names.join(', ') : 'a flavour') +
    '. Type one under Cost per cookie on the event page.'
  );
}

/** The event's figures: revenue, fees, cookie cost, profit, against the target. Each opens into the database's own parts. */
export function eventFiguresOf(s: BazaarSummary): ReviewFigure[] {
  const dayText = new Map(s.days.map((d) => [d.id, dateRange(d.day, d.day)]));
  const why = whyText(s);
  const cc = s.cookieCost;
  const costParts: Part[] = [];
  for (const p of cc.parts) {
    // The rounding part is shown only when there is some: a few centavos between the rounded lines and the total.
    if (p.label === 'Rounding' && !p.amountCents) continue;
    costParts.push({
      label: p.label,
      detail: p.quantity === null ? null : cookiesText(p.quantity),
      valueText: moneyText(p.amountCents)
    });
  }
  for (const l of cc.lines) {
    if (l.made === 0 && !l.uncosted) continue;
    costParts.push({
      label: l.name,
      detail:
        plural(l.made, 'made', 'made') +
        (l.toShop ? ', ' + l.toShop.toLocaleString('en-PH') + ' to the shop' : '') +
        (l.unitCents === null
          ? ''
          : ', at ' +
            unitCostText(l.unitCents) +
            (l.source === 'typed'
              ? ' typed by you'
              : l.source === 'flavour'
                ? ' typed by you for the flavour'
                : ' from the recipe')),
      valueText: moneyText(l.costCents)
    });
  }
  const t = s.target;
  const target: ReviewFigure =
    t.cents === null
      ? {
          key: 'target',
          label: 'Against the target',
          valueText: 'No target set',
          note: null,
          parts: []
        }
      : {
          key: 'target',
          label: 'Against the target',
          valueText:
            t.againstCents === null
              ? COST_COPY.pending
              : t.againstCents < 0
                ? moneyText(-t.againstCents) + ' under the target'
                : moneyText(t.againstCents) + ' over the target',
          note: t.againstCents === null ? why : null,
          parts: [
            { label: 'Target', detail: null, valueText: moneyText(t.cents) },
            {
              label: 'Revenue still needed',
              detail: null,
              valueText: moneyText(t.revenueNeededCents)
            }
          ]
        };
  return [
    revenueFigure('revenue', s.revenue),
    {
      key: 'fees',
      label: 'Fees',
      valueText: moneyText(s.fees.totalCents),
      note: null,
      parts: s.fees.parts.map((f) => ({
        label: f.label,
        detail:
          (f.dayId === null ? 'Whole event' : (dayText.get(f.dayId) ?? 'One day')) +
          (f.atTheTill ? ' · added at the till' : ''),
        valueText: moneyText(f.amountCents)
      }))
    },
    {
      key: 'cookie-cost',
      label: 'Cookie cost',
      valueText: moneyText(cc.cents),
      note: why ?? 'Cookies made, less those sent to the shop.',
      parts: costParts
    },
    {
      key: 'profit',
      label: 'Profit',
      valueText: moneyText(s.profit.cents),
      note: why,
      parts: s.profit.parts.map((p) => ({
        label: p.label,
        detail: null,
        valueText: moneyText(p.amountCents)
      }))
    },
    target
  ];
}

/** What should be left of a flavour before she counts. A bound for the form only: the database works the day out itself. */
export function shouldBeLeft(l: BazaarDay['lines'][number]): number {
  return l.made + l.carried - l.sold - l.given - l.lost;
}

/** Each flavour of the day: what was on the table, where it went, and her count once the day is closed. */
export function stockRowsOf(day: BazaarDay, names: ReadonlyMap<string, string>): ReviewStockRow[] {
  return day.lines.map((l) => {
    const c = day.count?.find((x) => x.productId === l.productId);
    return {
      productId: l.productId,
      name: names.get(l.productId) ?? l.name,
      onTableText:
        l.made.toLocaleString('en-PH') +
        ' made' +
        (l.carried ? ' · ' + l.carried.toLocaleString('en-PH') + ' carried over' : ''),
      goneText: `${l.sold} sold · ${l.given} given away · ${l.lost} lost`,
      shouldBeLeft: shouldBeLeft(l),
      countText: c
        ? `${c.left} left: ${c.carryNext} carried over, ${c.toShop} to the shop, ${c.writtenOff} written off` +
          (c.notAccounted ? ` · ${c.notAccounted} not accounted` : '')
        : null
    };
  });
}

/** A whole count from text. A blank is `blank`; anything but digits is null. */
function count(text: string, blank: number | null): number | null {
  const t = text.trim();
  if (t === '') return blank;
  return COUNT.test(t) ? Number(t) : null;
}

export type CloseResult =
  | { ok: true; lines: Record<string, CloseLine>; countedCents: number | null }
  | { ok: false; error: string };

/**
 * Her count as the close is sent: every flavour of the day (the ones with nothing on the table too), each split into what
 * carries over, goes to the shop and is written off. The same bounds `close_bazaar_day` enforces, said in words first.
 */
export function closeFromForm(
  day: BazaarDay,
  input: CloseInput,
  lastDay: boolean,
  names: ReadonlyMap<string, string>
): CloseResult {
  const lines: Record<string, CloseLine> = {};
  for (const l of day.lines) {
    const name = names.get(l.productId) ?? l.name;
    const row = input.rows.find((r) => r.productId === l.productId);
    if (!row) return { ok: false, error: 'Count every flavour of the day.' };
    const was = shouldBeLeft(l);
    const left = count(row.left, was > 0 ? null : 0);
    if (left === null) return { ok: false, error: name + ': type how many are left, 0 for none.' };
    const carryNext = count(row.carryNext, 0);
    const toShop = count(row.toShop, 0);
    const writtenOff = count(row.writtenOff, 0);
    if (carryNext === null || toShop === null || writtenOff === null)
      return { ok: false, error: name + ': each count is a whole number.' };
    if (left > was)
      return {
        ok: false,
        error: `${name}: ${left} left is more than was there (${was}). If more was made than the plan says, add that stock first.`
      };
    if (lastDay && carryNext > 0)
      return { ok: false, error: 'Nothing carries over from the last day of the event.' };
    if (left !== carryNext + toShop + writtenOff)
      return {
        ok: false,
        error:
          `${name}: split the ${left} left into ` +
          (lastDay ? '' : 'carried over, ') +
          `to the shop and written off. They add up to ${carryNext + toShop + writtenOff}.`
      };
    lines[l.productId] = { left, carryNext, toShop, writtenOff };
  }
  const counted = input.countedPesos.trim();
  if (counted !== '' && !MONEY.test(counted))
    return { ok: false, error: 'The cash counted must be an amount like 1500 or 1500.50.' };
  return {
    ok: true,
    lines,
    countedCents: counted === '' ? null : pesosToCentavos(Number(counted))
  };
}

/** Whole centavos from an amount she typed ("250", "250.50"); null when it is not an amount. */
export function amountCents(text: string): number | null {
  const t = text.trim();
  return MONEY.test(t) ? pesosToCentavos(Number(t)) : null;
}

/** A whole count of 1 to 9,999 from text; null otherwise. */
export function wholeCount(text: string): number | null {
  const n = count(text, null);
  return n !== null && n >= 1 && n <= 9999 ? n : null;
}

/** Her cost per cookie from typed pesos ("28.7525"), as centavos with at most four decimals; null when it is not a cost. */
export function typedCostCents(text: string): number | null {
  const t = text.trim();
  return COST.test(t) ? costPesosToCentavos(Number(t)) : null;
}
