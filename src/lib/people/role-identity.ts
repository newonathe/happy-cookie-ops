/**
 * The sidebar card's two lines from the runtime's "Name · role" (`roleWho`): the name, then the role once, capitalised.
 * "Owner" alone (no display name) is one line (Ethan, 19 November 2026: it read "Ethan · owner / Owner").
 */
export function railIdentity(who: unknown): { name: string; role: string | null } {
  const text = String(who ?? '');
  const at = text.lastIndexOf(' · ');
  if (at < 0) return { name: text, role: null };
  const role = text.slice(at + 3).trim();
  return {
    name: text.slice(0, at),
    role: role ? role.charAt(0).toUpperCase() + role.slice(1) : null
  };
}
