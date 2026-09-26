-- Audit records must come from trusted commands, not direct client mutations.
-- Retain owner reads and existing backend/definer-writer privileges.
revoke insert, update, delete on table public.audit_log from public, anon, authenticated;
drop policy "audit staff insert" on public.audit_log;
