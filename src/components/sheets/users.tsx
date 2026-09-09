import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';

export function UsersSheet({ v }: { v: OpsVals }) {
  const { users } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(users ?? []).map((u, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '10px', borderBottom: '1px solid #F2EEEB' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{u.name}</span>
                <span style={s(`border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 600; background: ${u.bg}; color: ${u.fg}; border: 1px solid ${u.br}`)}>
                  {u.role}
                </span>
              </span>
              <span style={{ fontSize: '12px', color: '#6E574B' }}>{u.can}</span>
              {u.extra ? (
                <>
                  <span style={{ fontSize: '11px', color: '#66524A' }}>{u.extra}</span>
                </>
              ) : null}
            </div>
          </Fragment>
        ))}
      </div>
    </>
  );
}
