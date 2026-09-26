-- Private cost/configuration values require active owner authority.
-- The existing owner FOR ALL policy retains owner reads and writes.
-- Publish safe operating settings through a separately reviewed projection.
drop policy "settings staff read" on public.settings;
