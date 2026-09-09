import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function DropStateSheet({ v }: { v: OpsVals }) {
  const { closeDropRollover, dropNoText, dropStateOptions } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(dropStateOptions ?? []).map((dso, $index) => (
          <Fragment key={$index}>
            <Pressable as="button" onClick={dso.go} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '58px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '12px', padding: '11px 13px', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
              {dso.on ? (
                <>
                  <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '12px' }} />
                </>
              ) : null}
              <span style={{ position: 'relative', flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{dso.label}</span>
                <span style={{ fontSize: '12px', color: '#6E574B' }}>{dso.what}</span>
              </span>
            </Pressable>
          </Fragment>
        ))}
        <button onClick={closeDropRollover} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#3A1F14', color: '#FFF5E5', fontSize: '14px', fontWeight: '600' }}>
          Close {dropNoText} and open the next
        </button>
        <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>
          Closing files this drop’s takings into your P&L history and starts the next one. Every order has to be finished first.
        </span>
      </div>
    </>
  );
}
