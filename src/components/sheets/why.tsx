import type { OpsVals } from '@/view-models/vals';

export function WhySheet({ v }: { v: OpsVals }) {
  const { sheet } = v;
  if (!sheet) throw new Error('why sheet requires active sheet data.');
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: '600' }}>{sheet.name}</span>
        <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.6', color: '#6E574B' }}>{sheet.why}</p>
        <span style={{ fontSize: '12px', color: '#66524A' }} />
      </div>
    </>
  );
}
