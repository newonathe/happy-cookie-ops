import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_IDENTITY,
  IDENTITY_BOUNDS,
  fetchShopIdentity,
  identityFieldError,
  parseShopIdentity,
  saveShopIdentity,
  type IdentityClient,
  type IdentityFields
} from '@/lib/data/shop-identity';

/**
 * B2: the strict reader for `get_shop_identity`, the `missing` answer for a database that has
 * not had migration 20260101005400 yet, the field bounds that mirror `save_shop_identity`, and
 * the classified save. Each rule names the mutation the test below it would catch.
 */
const RAW = {
  shop_name: 'The Happy Cookie',
  owner_name: 'Cine',
  contact_line: '0917 000 0000',
  tagline: 'Baked small',
  updated_at: '2026-10-06T01:02:03.456+00:00'
};
const FIELDS: IdentityFields = {
  shopName: 'The Happy Cookie',
  ownerName: 'Cine',
  contactLine: '0917 000 0000',
  tagline: 'Baked small'
};

type Reply = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  status?: number;
};
function clientFor(reply: Reply | (() => never)) {
  const rpc = vi.fn(async () => {
    if (typeof reply === 'function') return reply();
    return { data: null, error: null, status: 200, ...reply };
  });
  return { client: { rpc } as unknown as IdentityClient, rpc };
}

describe('parseShopIdentity', () => {
  it('reads the four texts and the stamp', () => {
    expect(parseShopIdentity(RAW)).toEqual({
      shopName: 'The Happy Cookie',
      ownerName: 'Cine',
      contactLine: '0917 000 0000',
      tagline: 'Baked small',
      updatedAt: '2026-10-06T01:02:03.456+00:00'
    });
    // Mutation: swapping two keys would show the owner's name as the shop's.
  });

  it('reads the empty answer a database with no row gives', () => {
    expect(
      parseShopIdentity({
        shop_name: '',
        owner_name: '',
        contact_line: '',
        tagline: '',
        updated_at: null
      })
    ).toEqual(EMPTY_IDENTITY);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 5],
    ['an array', [RAW]],
    ['a missing text', { ...RAW, tagline: undefined }],
    ['a missing stamp', { ...RAW, updated_at: undefined }],
    ['a number for a text', { ...RAW, shop_name: 5 }],
    ['null for a text', { ...RAW, owner_name: null }],
    ['a number for the stamp', { ...RAW, updated_at: 5 }],
    ['an over-long shop name', { ...RAW, shop_name: 'x'.repeat(61) }],
    ['an over-long owner name', { ...RAW, owner_name: 'x'.repeat(41) }],
    ['an over-long contact line', { ...RAW, contact_line: 'x'.repeat(161) }],
    ['an over-long tagline', { ...RAW, tagline: 'x'.repeat(121) }],
    ['a tab', { ...RAW, shop_name: 'a\tb' }],
    ['a line break', { ...RAW, contact_line: 'a\nb' }],
    ['a null character', { ...RAW, tagline: 'a\u0000b' }],
    ['a delete character', { ...RAW, owner_name: 'a\u007fb' }],
    ['a C1 control', { ...RAW, shop_name: 'a\u0085b' }]
  ])('gives null for %s', (_name, json) => {
    expect(parseShopIdentity(json)).toBeNull();
    // Mutation: a lenient reader would print text the database would never have stored.
  });

  it('accepts a text exactly at its bound, counting characters rather than UTF-16 units', () => {
    expect(parseShopIdentity({ ...RAW, shop_name: 'x'.repeat(60) })).not.toBeNull();
    // 30 emoji are 60 UTF-16 units but 30 characters; 61 of them are over the 60-character bound.
    expect(parseShopIdentity({ ...RAW, shop_name: '🍪'.repeat(60) })).not.toBeNull();
    expect(parseShopIdentity({ ...RAW, shop_name: '🍪'.repeat(61) })).toBeNull();
  });

  it('ignores a key it does not know, so a later migration does not blank the shop', () => {
    expect(parseShopIdentity({ ...RAW, logo_path: 'qr/x.png' })?.shopName).toBe('The Happy Cookie');
  });
});

describe('fetchShopIdentity', () => {
  it('returns ok with the identity and calls the RPC with no arguments', async () => {
    const { client, rpc } = clientFor({ data: RAW });
    expect(await fetchShopIdentity(client)).toEqual({
      status: 'ok',
      identity: parseShopIdentity(RAW)
    });
    expect(rpc).toHaveBeenCalledWith('get_shop_identity');
  });

  it('returns ok with the empty identity for a database with no row', async () => {
    const { client } = clientFor({
      data: { shop_name: '', owner_name: '', contact_line: '', tagline: '', updated_at: null }
    });
    expect(await fetchShopIdentity(client)).toEqual({ status: 'ok', identity: EMPTY_IDENTITY });
  });

  it.each([
    ['PostgREST PGRST202', { error: { code: 'PGRST202', message: 'not found' }, status: 404 }],
    ['PGRST202 without a status', { error: { code: 'PGRST202' } }],
    ['Postgres 42883', { error: { code: '42883', message: 'function does not exist' } }],
    ['an HTTP 404 with no code', { error: { message: 'Not Found' }, status: 404 }],
    ['an HTTP 404 with an unrelated code', { error: { code: 'XX000' }, status: 404 }]
  ])('returns missing for %s, never throwing', async (_name, reply) => {
    const { client } = clientFor(reply);
    expect(await fetchShopIdentity(client)).toEqual({ status: 'missing' });
    // Mutation: treating this as failed shows an error in a trial that has not migrated yet.
  });

  it.each([
    ['a permission error', { error: { code: '42501' }, status: 403 }],
    ['a server error', { error: { code: 'XX000' }, status: 500 }],
    ['an error with no code and no status', { error: { message: 'Failed to fetch' } }],
    ['a malformed answer', { data: { shop_name: 5 } }],
    ['an empty answer', { data: null }]
  ])('returns failed for %s', async (_name, reply) => {
    const { client } = clientFor(reply);
    expect(await fetchShopIdentity(client)).toEqual({ status: 'failed' });
  });

  it('returns failed, not a throw, when the call itself throws', async () => {
    const { client } = clientFor(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchShopIdentity(client)).toEqual({ status: 'failed' });
  });
});

describe('identityFieldError', () => {
  it('accepts the empty identity, a normal one and every text exactly at its bound', () => {
    expect(identityFieldError({ shopName: '', ownerName: '', contactLine: '', tagline: '' })).toBe(
      null
    );
    expect(identityFieldError(FIELDS)).toBeNull();
    expect(
      identityFieldError({
        shopName: 'x'.repeat(IDENTITY_BOUNDS.shopName),
        ownerName: 'x'.repeat(IDENTITY_BOUNDS.ownerName),
        contactLine: 'x'.repeat(IDENTITY_BOUNDS.contactLine),
        tagline: 'x'.repeat(IDENTITY_BOUNDS.tagline)
      })
    ).toBeNull();
  });

  it.each([
    ['shopName', 'Shop name'],
    ['ownerName', 'Owner name'],
    ['contactLine', 'Contact line'],
    ['tagline', 'Tagline']
  ] as const)('refuses %s one character over its bound and names it', (field, label) => {
    const over = 'x'.repeat(IDENTITY_BOUNDS[field] + 1);
    expect(identityFieldError({ ...FIELDS, [field]: over })).toBe(
      label + ' must be ' + IDENTITY_BOUNDS[field] + ' characters or fewer.'
    );
    // Mutation: a looser bound sends a save the database is sure to refuse.
  });

  it('measures after trimming spaces, as the database does', () => {
    expect(identityFieldError({ ...FIELDS, shopName: '  ' + 'x'.repeat(60) + '  ' })).toBeNull();
  });

  it('counts characters, not UTF-16 units', () => {
    expect(identityFieldError({ ...FIELDS, shopName: '🍪'.repeat(60) })).toBeNull();
    expect(identityFieldError({ ...FIELDS, shopName: '🍪'.repeat(61) })).not.toBeNull();
  });

  it.each([
    ['a tab inside', 'a\tb'],
    ['a line break', 'a\nb'],
    ['a trailing tab, which a space trim does not remove', 'a\t'],
    ['a unit separator', 'a\u001fb'],
    ['a delete character', 'a\u007fb']
  ])('refuses %s', (_name, value) => {
    expect(identityFieldError({ ...FIELDS, tagline: value })).toBe(
      'Tagline cannot contain tabs, line breaks or other controls.'
    );
    // Mutation: a JS trim() would strip the trailing tab and send what the server refuses.
  });
});

describe('saveShopIdentity', () => {
  it('sends the four snake-case keys and the stamp, and returns the new stamp', async () => {
    const { client, rpc } = clientFor({ data: [{ updated_at: '2026-10-06T02:00:00+00:00' }] });
    expect(await saveShopIdentity(client, FIELDS, '2026-10-06T01:00:00+00:00')).toEqual({
      status: 'saved',
      updatedAt: '2026-10-06T02:00:00+00:00'
    });
    expect(rpc).toHaveBeenCalledWith('save_shop_identity', {
      p_identity: {
        shop_name: 'The Happy Cookie',
        owner_name: 'Cine',
        contact_line: '0917 000 0000',
        tagline: 'Baked small'
      },
      p_expected_updated_at: '2026-10-06T01:00:00+00:00'
    });
  });

  it('sends a null stamp for the first save', async () => {
    const { client, rpc } = clientFor({ data: [{ updated_at: '2026-10-06T02:00:00+00:00' }] });
    await saveShopIdentity(client, FIELDS, null);
    expect(rpc).toHaveBeenCalledWith(
      'save_shop_identity',
      expect.objectContaining({ p_expected_updated_at: null })
    );
  });

  it('classifies P0002 as a conflict', async () => {
    const { client } = clientFor({ error: { code: 'P0002' } });
    expect(await saveShopIdentity(client, FIELDS, '2000-01-01T00:00:00+00:00')).toEqual({
      status: 'conflict'
    });
  });

  it.each(['22023', '42501', '23514', 'PGRST202', '57014'])(
    'classifies the code %s as rejected',
    async (code) => {
      const { client } = clientFor({ error: { code } });
      expect(await saveShopIdentity(client, FIELDS, null)).toEqual({ status: 'rejected' });
    }
  );

  it('classifies an error with no code as offline', async () => {
    const { client } = clientFor({ error: { message: 'Failed to fetch' } });
    expect(await saveShopIdentity(client, FIELDS, null)).toEqual({ status: 'offline' });
  });

  it('classifies a thrown call as offline', async () => {
    const { client } = clientFor(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await saveShopIdentity(client, FIELDS, null)).toEqual({ status: 'offline' });
  });

  it('classifies an answer with no row as rejected, never as saved', async () => {
    const { client } = clientFor({ data: [] });
    expect(await saveShopIdentity(client, FIELDS, null)).toEqual({ status: 'rejected' });
    // Mutation: reporting saved without a stamp would let the next save skip its stale check.
  });
});
