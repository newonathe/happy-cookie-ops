-- B3b (final-plan.md version 2): the books cost the stock USED by default (DP-04, decided "when used").
--
-- get_books already lists `uncosted` (the stock used or wasted that has no cost) on this basis, and the screens now show that list, so the
-- default flips from 'bought' to 'used': the column default for a database that has no row yet, and the one existing row. Nothing else
-- changes. The owner can still choose either basis (set_cost_basis); this only sets where the books start.

alter table public.books_settings alter column cost_basis set default 'used';
update public.books_settings b set cost_basis = 'used', updated_at = now() where b.id;
