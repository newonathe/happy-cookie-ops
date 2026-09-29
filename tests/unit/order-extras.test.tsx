import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  addOnId,
  fetchOrderExtras,
  orderExtrasError,
  parseOrderExtras,
  saveOrderExtras,
  type OrderExtrasClient,
  type OrderExtrasFields
} from '@/lib/data/order-extras';
import { OrderExtrasForm } from '@/components/live/order-extras-form';
import type { LiveOrderExtrasFields, OpsVals } from '@/view-models/vals';

/**
 * B4a: the owner's boxes, add-ons, sampler limit and same-day extra. The database enforces every
 * bound; these tests pin that the client parses what it reads strictly, mirrors the bounds so a sure
 * refusal is never sent, and reads its form back faithfully. Each `Mutation:` line names a change that
 * one of these tests must catch (each was applied and seen to fail).
 */
const STAMP = '2026-09-29T02:00:00.123456+00:00';

const wire = (over: Record<string, unknown> = {}) => ({
  same_day_enabled: true,
  same_day_percent: 40,
  same_day_on_extras: false,
  sampler_product_id: null,
  sampler_max_qty: 3,
  box_sizes: [
    { size: 6, charge_cents: 0, active: true },
    { size: 8, charge_cents: 250, active: false }
  ],
  add_ons: [
    {
      id: 'sticker',
      name: 'Sticker',
      price_cents: 1500,
      active: true,
      variants: ['1', '2'],
      text_label: null,
      text_max: 150,
      max_qty: 10
    },
    {
      id: 'note-card',
      name: 'Note card',
      price_cents: 1000,
      active: true,
      variants: [],
      text_label: 'Message',
      text_max: 150,
      max_qty: 1
    }
  ],
  updated_at: STAMP,
  ...over
});

const fields = (over: Partial<OrderExtrasFields> = {}): OrderExtrasFields => {
  const { updated_at: _stamp, ...rest } = parseOrderExtras(wire())!;
  void _stamp;
  return { ...rest, ...over };
};
const oneAddOn = (over: Record<string, unknown>) =>
  fields({ add_ons: [{ ...fields().add_ons[0]!, ...over }] });

describe('parseOrderExtras', () => {
  it('reads a well-formed answer', () => {
    expect(parseOrderExtras(wire())).toMatchObject({
      same_day_percent: 40,
      sampler_product_id: null,
      updated_at: STAMP
    });
    expect(parseOrderExtras(wire({ sampler_product_id: 's1' }))!.sampler_product_id).toBe('s1');
    expect(parseOrderExtras(wire())!.add_ons[1]!.text_label).toBe('Message');
  });

  it('refuses anything unexpected, so the form does not open on a guess', () => {
    for (const bad of [
      null,
      [],
      'x',
      wire({ updated_at: 5 }),
      wire({ same_day_enabled: 'yes' }),
      wire({ same_day_on_extras: null }),
      wire({ same_day_percent: 101 }),
      wire({ same_day_percent: 1.5 }),
      wire({ sampler_max_qty: 0 }),
      wire({ sampler_product_id: 7 }),
      wire({ box_sizes: {} }),
      wire({ box_sizes: [{ size: 1, charge_cents: 0, active: true }] }),
      wire({ box_sizes: [{ size: 6, charge_cents: -1, active: true }] }),
      wire({ box_sizes: [{ size: 6, charge_cents: 0, active: 'on' }] }),
      wire({ box_sizes: [null] }),
      wire({ add_ons: 'none' }),
      wire({ add_ons: [{ ...wire().add_ons[0], variants: 'A' }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], variants: [1] }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], text_label: 3 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], price_cents: 1.5 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], max_qty: 0 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], text_max: 301 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], id: 4 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], active: 1 }] })
    ])
      expect(parseOrderExtras(bad as never)).toBeNull();
    // Mutation: accepting any object turns a changed function shape into a form that saves nonsense.
  });
});

describe('orderExtrasError mirrors the database bounds', () => {
  it('accepts the defaults', () => {
    expect(orderExtrasError(fields())).toBeNull();
    expect(orderExtrasError(fields({ same_day_percent: 0 }))).toBeNull();
    expect(orderExtrasError(fields({ same_day_percent: 100, sampler_max_qty: 20 }))).toBeNull();
  });

  it.each([
    ['percent above 100', fields({ same_day_percent: 101 }), 'same-day'],
    ['percent fractional', fields({ same_day_percent: 12.5 }), 'same-day'],
    ['percent negative', fields({ same_day_percent: -1 }), 'same-day'],
    ['sampler limit 0', fields({ sampler_max_qty: 0 }), 'sampler'],
    ['sampler limit 21', fields({ sampler_max_qty: 21 }), 'sampler'],
    ['box of 1', fields({ box_sizes: [{ size: 1, charge_cents: 0, active: true }] }), 'holds'],
    ['box of 49', fields({ box_sizes: [{ size: 49, charge_cents: 0, active: true }] }), 'holds'],
    [
      'box charge too high',
      fields({ box_sizes: [{ size: 6, charge_cents: 100001, active: true }] }),
      'charge'
    ],
    [
      'box charge fractional',
      fields({ box_sizes: [{ size: 6, charge_cents: 1.5, active: true }] }),
      'charge'
    ],
    [
      'box size twice',
      fields({
        box_sizes: [
          { size: 6, charge_cents: 0, active: true },
          { size: 6, charge_cents: 0, active: false }
        ]
      }),
      'once'
    ],
    [
      'thirteen box sizes',
      fields({
        box_sizes: Array.from({ length: 13 }, (_, i) => ({
          size: i + 2,
          charge_cents: 0,
          active: true
        }))
      }),
      '12 box'
    ],
    ['bad id', oneAddOn({ id: 'Bad Id' }), 'letters or numbers'],
    ['empty id', oneAddOn({ id: '' }), 'letters or numbers'],
    ['blank name', oneAddOn({ name: '   ' }), '1 to 40'],
    ['name of 41', oneAddOn({ name: 'n'.repeat(41) }), '1 to 40'],
    ['name with a control character', oneAddOn({ name: 'a\u0007b' }), '1 to 40'],
    ['price above 10,000 pesos', oneAddOn({ price_cents: 1_000_001 }), 'price'],
    ['max qty 0', oneAddOn({ max_qty: 0 }), 'most of one'],
    ['max qty 51', oneAddOn({ max_qty: 51 }), 'most of one'],
    ['message length 0', oneAddOn({ text_max: 0 }), 'message is'],
    ['message length 301', oneAddOn({ text_max: 301 }), 'message is'],
    ['blank message label', oneAddOn({ text_label: '  ' }), 'label'],
    ['long message label', oneAddOn({ text_label: 'l'.repeat(31) }), 'label'],
    [
      'thirteen choices',
      oneAddOn({ variants: Array.from({ length: 13 }, (_, i) => 'v' + i) }),
      'at most 12'
    ],
    ['blank choice', oneAddOn({ variants: ['1', ' '] }), 'sticker number'],
    ['long choice', oneAddOn({ variants: ['c'.repeat(21)] }), 'sticker number'],
    ['choice twice', oneAddOn({ variants: ['1', ' 1 '] }), 'twice']
  ])('refuses %s', (_name, f, fragment) => {
    expect(orderExtrasError(f)?.toLowerCase()).toContain(fragment.toLowerCase());
    // Mutation: dropping any one of these checks sends a value the database refuses; each row here fails without its check.
  });

  it('refuses two add-ons with one id, and more than twenty add-ons', () => {
    const a = fields().add_ons[0]!;
    expect(orderExtrasError(fields({ add_ons: [a, { ...a }] }))).toContain('share a name');
    expect(
      orderExtrasError(
        fields({ add_ons: Array.from({ length: 21 }, (_, i) => ({ ...a, id: 'a' + i })) })
      )
    ).toContain('20 add-ons');
  });
});

describe('addOnId', () => {
  it('makes a database-safe id from a name, and keeps ids apart', () => {
    expect(addOnId('Cream ribbon', new Set())).toBe('cream-ribbon');
    expect(addOnId('  Sticker!! No. 1 ', new Set())).toBe('sticker-no-1');
    expect(addOnId('Sticker', new Set(['sticker']))).toBe('sticker-2');
    expect(addOnId('Sticker', new Set(['sticker', 'sticker-2']))).toBe('sticker-3');
    expect(addOnId('🍪', new Set())).toBe('add-on');
    const long = addOnId('x'.repeat(60), new Set());
    expect(long.length).toBeLessThanOrEqual(32);
    const suffixed = addOnId('x'.repeat(60), new Set([long]));
    expect(suffixed.length).toBeLessThanOrEqual(32);
    expect(suffixed).not.toBe(long);
    expect(/^[a-z0-9][a-z0-9-]{0,31}$/.test(suffixed)).toBe(true);
    // Mutation: not truncating, or not de-duplicating, yields an id the database refuses.
  });
});

describe('the rpc wrappers', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as unknown as OrderExtrasClient };
  };

  it('fetches and parses, and a failed read throws rather than opening an empty form', async () => {
    const ok = client({ data: wire(), error: null });
    expect((await fetchOrderExtras(ok.client))?.updated_at).toBe(STAMP);
    expect(ok.rpc).toHaveBeenCalledWith('get_order_extras');
    expect(await fetchOrderExtras(client({ data: null, error: null }).client)).toBeNull();
    await expect(
      fetchOrderExtras(client({ data: null, error: { code: '42501' } }).client)
    ).rejects.toThrow('42501');
  });

  it('saves the seven keys, trimmed, against the stamp it read', async () => {
    const f = client({ data: null, error: null });
    const outcome = await saveOrderExtras(
      f.client,
      fields({
        sampler_product_id: 's1',
        add_ons: [
          {
            ...fields().add_ons[0]!,
            name: ' Sticker ',
            variants: [' 1', '2 '],
            text_label: ' Msg '
          }
        ]
      }),
      STAMP
    );
    expect(outcome).toBe('saved');
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_order_extras');
    expect(args.p_expected_updated_at).toBe(STAMP);
    const body = args.p_extras as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'add_ons',
      'box_sizes',
      'same_day_enabled',
      'same_day_on_extras',
      'same_day_percent',
      'sampler_max_qty',
      'sampler_product_id'
    ]);
    expect((body.add_ons as Array<Record<string, unknown>>)[0]).toMatchObject({
      name: 'Sticker',
      variants: ['1', '2'],
      text_label: 'Msg'
    });
    expect(body.sampler_product_id).toBe('s1');
    // Mutation: sending a key the function does not list, or not trimming, is refused (22023) by the server.
  });

  it('classifies the outcome: stale, refused, or not sent', async () => {
    const send = (result: unknown) => saveOrderExtras(client(result).client, fields(), STAMP);
    expect(await send({ error: { code: 'P0002' } })).toBe('conflict');
    expect(await send({ error: { code: '22023' } })).toBe('refused');
    expect(await send({ error: { code: '42501' } })).toBe('refused');
    expect(await send({ error: { code: '' } })).toBe('offline');
    const throwing = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as OrderExtrasClient;
    expect(await saveOrderExtras(throwing, fields(), STAMP)).toBe('offline');
  });
});

describe('the form reads itself back', () => {
  afterEach(() => cleanup());

  const before = (over: Partial<LiveOrderExtrasFields> = {}): LiveOrderExtrasFields => ({
    sameDayEnabled: true,
    sameDayPercent: 40,
    sameDayOnExtras: false,
    samplerProductId: '',
    samplerMaxQty: 3,
    boxSizes: [
      { size: 6, chargePesos: 0, active: true },
      { size: 8, chargePesos: 2.5, active: false }
    ],
    addOns: [
      {
        id: 'sticker',
        name: 'Sticker',
        pricePesos: 15,
        active: true,
        variants: ['1', '2'],
        textLabel: '',
        textMax: 150,
        maxQty: 10
      }
    ],
    ...over
  });
  const setup = (over: Partial<LiveOrderExtrasFields> = {}, online = true) => {
    const save = vi.fn();
    const props: NonNullable<OpsVals['liveOrderExtras']> = {
      online,
      extras: before(over),
      sets: [{ id: 'sampler-1', name: 'Sampler box' }],
      save,
      close: vi.fn()
    };
    const view = render(<OrderExtrasForm liveOrderExtras={props} />);
    const input = (name: string) =>
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const submit = () => fireEvent.submit(view.container.querySelector('form')!);
    return { save, input, submit, view, props };
  };

  it('sends back exactly what it showed when nothing is touched, without the blank new rows', () => {
    const { save, submit } = setup();
    submit();
    expect(save).toHaveBeenCalledWith({
      sameDayEnabled: true,
      sameDayPercent: 40,
      sameDayOnExtras: false,
      samplerProductId: '',
      samplerMaxQty: 3,
      boxSizes: [
        { size: 6, chargePesos: 0, active: true },
        { size: 8, chargePesos: 2.5, active: false }
      ],
      addOns: [
        {
          id: 'sticker',
          name: 'Sticker',
          pricePesos: 15,
          active: true,
          variants: ['1', '2'],
          textLabel: '',
          textMax: 150,
          maxQty: 10
        }
      ]
    });
    // Mutation: not skipping the blank new rows saves an empty box size and an add-on with no name.
  });

  it('reads edits: numbers, switches, the sampler choice and comma-separated choices', () => {
    const { save, input, submit } = setup();
    fireEvent.change(input('sameDayPercent'), { target: { value: '25' } });
    fireEvent.click(input('sameDayEnabled'));
    fireEvent.click(input('sameDayOnExtras'));
    fireEvent.change(input('samplerProductId'), { target: { value: 'sampler-1' } });
    fireEvent.change(input('samplerMaxQty'), { target: { value: '2' } });
    fireEvent.change(input('boxCharge0'), { target: { value: '12.5' } });
    fireEvent.click(input('boxOn1'));
    fireEvent.change(input('aoPrice0'), { target: { value: '20' } });
    fireEvent.change(input('aoVariants0'), { target: { value: ' A, B ,, C' } });
    fireEvent.change(input('aoLabel0'), { target: { value: 'Note' } });
    fireEvent.click(input('aoOn0'));
    submit();
    const sent = save.mock.calls[0]![0] as LiveOrderExtrasFields;
    expect(sent).toMatchObject({
      sameDayEnabled: false,
      sameDayPercent: 25,
      sameDayOnExtras: true,
      samplerProductId: 'sampler-1',
      samplerMaxQty: 2
    });
    expect(sent.boxSizes).toEqual([
      { size: 6, chargePesos: 12.5, active: true },
      { size: 8, chargePesos: 2.5, active: true }
    ]);
    expect(sent.addOns[0]).toMatchObject({
      id: 'sticker',
      pricePesos: 20,
      variants: ['A', 'B', 'C'],
      textLabel: 'Note',
      active: false
    });
    // Mutation: keeping the old id for a renamed add-on is right (an old order keeps its line); minting a new id from the name would orphan it.
  });

  it('a filled new row becomes a new box size and a new add-on with no id yet', () => {
    const { save, input, submit } = setup();
    fireEvent.change(input('boxSize2'), { target: { value: '12' } });
    fireEvent.change(input('boxCharge2'), { target: { value: '40' } });
    fireEvent.change(input('aoName1'), { target: { value: 'Cream ribbon' } });
    fireEvent.change(input('aoPrice1'), { target: { value: '10' } });
    submit();
    const sent = save.mock.calls[0]![0] as LiveOrderExtrasFields;
    expect(sent.boxSizes[2]).toEqual({ size: 12, chargePesos: 40, active: true });
    expect(sent.addOns[1]).toMatchObject({
      id: '',
      name: 'Cream ribbon',
      pricePesos: 10,
      active: true,
      maxQty: 10
    });
  });

  it('a new add-on with no price stays NaN so the runtime refuses it instead of pricing it at zero', () => {
    const { save, input, submit } = setup();
    fireEvent.change(input('aoName1'), { target: { value: 'Ribbon' } });
    submit();
    expect(
      Number.isNaN((save.mock.calls[0]![0] as LiveOrderExtrasFields).addOns[1]!.pricePesos)
    ).toBe(true);
    // Mutation: defaulting a blank price to 0 gives away an add-on the owner forgot to price.
  });

  it('warns when offline and offers the sampler choices that exist', () => {
    const { view } = setup({}, false);
    expect(view.container.textContent).toContain('Offline');
    const options = Array.from(view.container.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['No sampler box', 'Sampler box']);
  });
});
