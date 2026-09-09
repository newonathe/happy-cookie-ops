/**
 * PLACEHOLDER — replaced by `pnpm db:types`.
 *
 * The real file is generated from the live schema:
 *
 *   pnpm db:start && pnpm db:reset && pnpm db:types
 *
 * This is a structural SDK placeholder, not generated schema evidence.
 * G0 adds the SDK-required Relationships member and uses unknown values.
 * It is committed so `pnpm typecheck` passes on a fresh clone before anyone has run
 * Supabase (T-01 runs before T-01b). Without it the Supabase clients import a module
 * that does not exist, and the first thing a new developer sees is an unresolved import
 * that looks like a missing dependency.
 *
 * The shape below is deliberately permissive. It is NOT a description of the schema —
 * `docs/DATA.md` and the migrations are. Do not hand-edit this file to add a table:
 * regenerate it, or the types and the database disagree and the types win in review.
 */


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
