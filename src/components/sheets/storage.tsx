import type { OpsVals } from '@/view-models/vals';

export function StorageSheet({ v }: { v: OpsVals }) {
  const { askReset, goHealth, savedText } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>{savedText}</span>
        <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.5' }}>
          Nothing leaves this device. Use backups to protect it.
        </span>
        <button onClick={goHealth} style={{ minHeight: '48px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
          Backups and export
        </button>
        <button onClick={askReset} style={{ minHeight: '48px', border: '1px solid #F2CFCB', background: '#FFFFFF', color: '#A8231B', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
          Start the books over
        </button>
      </div>
    </>
  );
}
