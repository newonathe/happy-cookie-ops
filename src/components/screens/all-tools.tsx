import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function AllToolsScreen({ v }: { v: OpsVals }) {
  const { cols2, toolGroups } = v;
  return (
    <>
      <div data-screen-label="All tools" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {(toolGroups ?? []).map((tg, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B564C' }}>{tg.title}</span>
              <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 8px`)}>
                {(tg.items ?? []).map((ti, $index) => (
                  <Fragment key={$index}>
                    <Pressable as="button" onClick={ti.go} style={{ display: 'flex', alignItems: 'center', gap: '11px', textAlign: 'left', minHeight: '58px', border: '0', background: '#FAF8F7', borderRadius: '12px', padding: '11px 13px', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#F3EFEC' }} activeStyle={{ transform: 'scale(.99)' }}>
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#6E574B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                        <path d={ti.icon} />
                      </svg>
                      <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600' }}>{ti.label}</span>
                        <span style={{ fontSize: '11px', color: '#66524A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ti.sub}
                        </span>
                      </span>
                      {ti.badge ? (
                        <>
                          <span style={{ minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: '#C24A15', color: '#FFFFFF', fontSize: '11px', fontWeight: '700', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                            {ti.badge}
                          </span>
                        </>
                      ) : null}
                    </Pressable>
                  </Fragment>
                ))}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </>
  );
}
