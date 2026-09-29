/** Shared styles of the live owner forms: existing tokens only (docs/state/protected-exception.md, MP-10). */
export const inputStyle = {
  height: '48px',
  border: '1px solid #E7E1DC',
  borderRadius: '12px',
  padding: '0 13px',
  fontSize: '14px',
  fontWeight: 600,
  background: '#FFFFFF',
  color: '#3A1F14'
};
export const labelStyle = { display: 'flex', flexDirection: 'column' as const, gap: '5px' };
export const smallLabel = { fontSize: '12px', fontWeight: 600, color: '#6E574B' };
export const primaryButton = {
  minHeight: '48px',
  border: '0',
  borderRadius: '12px',
  background: '#C24A15',
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: 600
};
export const secondaryButton = {
  minHeight: '44px',
  border: '1px solid #E7E1DC',
  background: '#FFFFFF',
  borderRadius: '11px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#3A1F14'
};
