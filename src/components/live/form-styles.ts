/**
 * Shared styles of the live owner forms: tokens from `@theme` in globals.css, no hex (docs/design/bazaar-v2.md, rule 11).
 * Sizes that no token covers (the 11 px radius, the 5 px gap) stay as they were, so no form changes shape.
 */
export const inputStyle = {
  height: '48px',
  border: '1px solid var(--color-line-strong)',
  borderRadius: 'var(--radius-control)',
  padding: '0 13px',
  fontSize: '14px',
  fontWeight: 600,
  background: 'var(--color-surface)',
  color: 'var(--color-ink)'
};
export const labelStyle = { display: 'flex', flexDirection: 'column' as const, gap: '5px' };
export const smallLabel = { fontSize: '12px', fontWeight: 600, color: 'var(--color-ink-soft)' };
export const primaryButton = {
  minHeight: '48px',
  border: '0',
  borderRadius: 'var(--radius-control)',
  background: 'var(--color-brand)',
  color: 'var(--color-surface)',
  fontSize: '14px',
  fontWeight: 600
};
export const secondaryButton = {
  minHeight: '44px',
  border: '1px solid var(--color-line-strong)',
  background: 'var(--color-surface)',
  borderRadius: '11px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--color-ink)'
};
