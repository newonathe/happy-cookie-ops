-- New public application objects require explicit reviewed application grants.
-- Preserve existing objects, service defaults, other creators and managed schemas.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
