import { expect, test } from '@playwright/test';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL, admin, ensureOwner, OWNER_EMAIL, OWNER_PASSWORD, sql } from './stack';
import { resetScenarioC } from './fixture-c';

/**
 * S4 (20 November 2026): who actually RECEIVES a live change from the real Realtime service. The owner and an active helper hear an
 * open day's sale and its void; anon and an expired helper hear nothing; a helper stops hearing when the day closes while the owner
 * still does. Local stack with Realtime only (docs/TESTING.md, "Browser scenarios"). No browser is used.
 */
const ANON_KEY = process.env.HC_SCN_ANON_KEY;
const PASSWORD = 'live-sync-pass-1';
const BOOKING = 'b4a00000-0000-4000-8000-000000000001';
const DAY = 'b4a00000-0000-4000-8000-000000000002';
const EVENT = 'b4a00000-0000-4000-8000-000000000003';

interface Listener {
  name: string;
  client: SupabaseClient;
  channel: RealtimeChannel;
  heard: string[];
}

async function helper(email: string, expiresAt: string | null): Promise<void> {
  const db = admin();
  const list = await db.auth.admin.listUsers({ perPage: 200 });
  let user = list.data?.users.find((u) => u.email === email);
  if (!user) {
    const made = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (made.error || !made.data.user) throw new Error(`createUser: ${made.error?.message}`);
    user = made.data.user;
  }
  const saved = await db.from('profiles').upsert({
    id: user.id,
    role: 'helper',
    display_name: email,
    active: true,
    access_expires_at: expiresAt
  });
  if (saved.error) throw new Error(`profile: ${saved.error.message}`);
}

async function listen(name: string, email: string | null, password: string): Promise<Listener> {
  if (!ANON_KEY) throw new Error("Set HC_SCN_ANON_KEY to the synthetic stack's publishable key");
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  if (email) {
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error(`${name} sign-in: ${signed.error.message}`);
    await client.realtime.setAuth(signed.data.session.access_token);
  }
  const heard: string[] = [];
  const channel = client
    .channel(`delivery-${name}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_sales', filter: `event_id=eq.${EVENT}` },
      (payload) => heard.push(`sales:${payload.eventType}`)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bazaar_stock_adds', filter: `day_id=eq.${DAY}` },
      (payload) => heard.push(`adds:${payload.eventType}`)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bazaar_losses', filter: `day_id=eq.${DAY}` },
      (payload) => heard.push(`losses:${payload.eventType}`)
    );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: channel did not join`)), 20000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { name, client, channel, heard };
}

test('SCENARIO E: only the owner and an active helper hear the open day', async () => {
  await ensureOwner();
  resetScenarioC();
  await helper('live.active@scenario.test', null);
  await helper('live.expired@scenario.test', new Date(Date.now() - 60_000).toISOString());
  sql(`insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values ('${BOOKING}', 'Live fair', current_date, current_date, 0);
insert into public.events(id, name, starts_at, selling_device, price_snapshot, opened_at, loaded)
  values ('${EVENT}', 'Live fair', now() - interval '1 hour', 'devP', '{"dcf": 12500}', now() - interval '1 hour', '{"dcf": 40}');
insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash) values ('${DAY}', '${BOOKING}', current_date, 0, '${EVENT}', repeat('a', 64));
insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents) values ('${DAY}', 'dcf', 40, 0, 12500);`);

  const owner = await listen('owner', OWNER_EMAIL, OWNER_PASSWORD);
  const active = await listen('active helper', 'live.active@scenario.test', PASSWORD);
  const expired = await listen('expired helper', 'live.expired@scenario.test', PASSWORD);
  const anon = await listen('anon', null, '');
  const everyone = [owner, active, expired, anon];
  try {
    // The expired helper can sign in (the account exists) and join the channel; the database decides what they hear.
    // A sale on the open day.
    sql(`insert into public.event_sales(client_id, event_id, gross_cents, total_cents, pay_method, sold_at)
      values ('devP:S1:1', '${EVENT}', 12500, 12500, 'Cash', now());`);
    await expect.poll(() => owner.heard.length, { timeout: 15000 }).toBeGreaterThan(0);
    await expect.poll(() => active.heard.length, { timeout: 15000 }).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 3000));
    expect(owner.heard).toContain('sales:INSERT');
    expect(active.heard).toContain('sales:INSERT');
    expect(expired.heard).toEqual([]);
    expect(anon.heard).toEqual([]);

    // A void, a stock add and a loss on the same day.
    sql(`update public.event_sales set voided_at = now() where client_id = 'devP:S1:1';
insert into public.bazaar_stock_adds(client_id, day_id, product_id, qty, kind) values (gen_random_uuid(), '${DAY}', 'dcf', 3, 'made');
insert into public.bazaar_losses(client_id, day_id, product_id, qty, reason, at, payload_hash) values ('devP:L1', '${DAY}', 'dcf', 1, 'dropped', now(), repeat('b', 64));`);
    for (const who of [owner, active]) {
      await expect
        .poll(() => who.heard.slice().sort(), { timeout: 15000 })
        .toEqual(['adds:INSERT', 'losses:INSERT', 'sales:INSERT', 'sales:UPDATE']);
    }
    expect(expired.heard).toEqual([]);
    expect(anon.heard).toEqual([]);

    // The day closes: the helper hears nothing more of it, the owner still does.
    sql(`update public.events set closed_at = now() where id = '${EVENT}';`);
    const heardBefore = active.heard.length;
    const ownerBefore = owner.heard.length;
    sql(`update public.event_sales set pay_ref = 'late note' where client_id = 'devP:S1:1';`);
    await expect.poll(() => owner.heard.length, { timeout: 15000 }).toBeGreaterThan(ownerBefore);
    await new Promise((r) => setTimeout(r, 3000));
    expect(active.heard.length).toBe(heardBefore);
  } finally {
    for (const who of everyone) {
      await who.client.removeChannel(who.channel);
      await who.client.removeAllChannels();
    }
  }
});
