import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function CategoriesSheet({ v }: { v: OpsVals }) {
  const { catRows, saveCategory } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(catRows ?? []).map((cr, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0', borderBottom: '1px solid #F2EEEB' }}>
              <span style={{ flex: '1', minWidth: '0', fontSize: '14px' }}>{cr.name}</span>
              <button onClick={cr.rename} style={{ minHeight: '42px', padding: '0 11px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                Rename
              </button>
              <button onClick={cr.toggle} style={{ minHeight: '42px', padding: '0 11px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                {cr.stateText}
              </button>
            </div>
          </Fragment>
        ))}
        <form onSubmit={saveCategory} style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
          <input name="cname" placeholder="New category" style={{ flex: '1', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
          <button type="submit" style={{ minHeight: '48px', padding: '0 16px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '13px', fontWeight: '600' }}>
            Add
          </button>
        </form>
      </div>
    </>
  );
}
