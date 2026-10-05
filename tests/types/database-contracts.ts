// Compiled by pnpm typecheck. These functions are never executed.
import type { Database, Tables, TablesInsert, Enums } from '@/lib/types/database';
import type { createClient as browserFactory } from '@/lib/supabase/client';
import type { createClient as serverFactory } from '@/lib/supabase/server';
import type { createServiceClient } from '@/lib/supabase/service';

type Assert<T extends true> = T;
export type NoTableWildcard = Assert<
  string extends keyof Database['public']['Tables'] ? false : true
>;
export type NoFunctionWildcard = Assert<
  string extends keyof Database['public']['Functions'] ? false : true
>;
export type ProductIdIsText = Assert<Tables<'products'>['id'] extends string ? true : false>;
export type ProfileActiveIsBoolean = Assert<
  Tables<'profiles'>['active'] extends boolean ? true : false
>;
export const defaultInactiveProfile: TablesInsert<'profiles'> = {
  id: 'type-only',
  display_name: 'Type fixture'
};
// Keep the next statement on one line: its directive covers only the line below it.
// prettier-ignore
// @ts-expect-error The stored activity gate is a boolean, never a truthy string.
export const invalidProfileActive: TablesInsert<'profiles'> = { id: 'type-only', display_name: 'Type fixture', active: 'true' };
// @ts-expect-error A persisted profile row must always carry a non-null activity flag.
export const nullProfileActive: Tables<'profiles'>['active'] = null;
export type RateLimitHasReset = Assert<
  Database['public']['Functions']['consume_rate_limit']['Returns'][number]['reset_at'] extends string
    ? true
    : false
>;

export function checkDatabaseContracts(
  service: ReturnType<typeof createServiceClient>,
  browser: ReturnType<typeof browserFactory>,
  server: Awaited<ReturnType<typeof serverFactory>>
) {
  service.from('products').select('id');
  service.rpc('consume_rate_limit', { p_key: 'test', p_limit: 1, p_window_s: 60 });
  server.rpc('sync_event_sale', { p_sale: { clientId: 'type-test' } });
  // Json accepts this incomplete sale; SQL/runtime payload validation is a separate contract.
  // @ts-expect-error Unknown tables must be rejected by the browser factory too.
  browser.from('missing_table');
  // @ts-expect-error Unknown RPCs must be rejected by the request-scoped factory.
  server.rpc('missing_rpc', {});
  // @ts-expect-error RPC parameter names come from the actual SQL signature.
  service.rpc('consume_rate_limit', { wrong_argument: 1 });
  // @ts-expect-error PostgreSQL integer parameters are not strings.
  service.rpc('consume_rate_limit', { p_key: 'test', p_limit: '1', p_window_s: 60 });
  // @ts-expect-error Insert columns must exist; select strings alone do not reject at the call site.
  service.from('products').insert({ made_up_column: 1 });
}

// @ts-expect-error A generated row has no arbitrary column index signature.
export type UnknownProductColumn = Tables<'products'>['made_up_column'];
// @ts-expect-error The insert type must not accept an invented column.
export type UnknownInsertColumn = TablesInsert<'orders'>['made_up_column'];
// @ts-expect-error Enum values must come from the actual database.
export const invalidRole: Enums<'app_role'> = 'superuser';
