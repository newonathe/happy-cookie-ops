import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function SettingsScreen({ v }: { v: OpsVals }) {
  const { ic, settingsGroups } = v;
  return (
    <>
      <div data-screen-label="Settings" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {(settingsGroups ?? []).map((sg, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B564C' }}>{sg.title}</span>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '14px', overflow: 'hidden' }}>
                {(sg.rows ?? []).map((sr, $index) => (
                  <Fragment key={$index}>
                    <Pressable as="button" onClick={sr.go} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', minHeight: '54px', background: 'transparent', border: '0', borderBottom: '1px solid #F2EEEB', padding: '10px 14px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                      <span style={{ flex: '1', minWidth: '0', fontSize: '14px' }}>{sr.label}</span>
                      <span style={{ fontSize: '13px', color: '#66524A', textAlign: 'right' }}>{sr.value}</span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#C0A899" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                        <path d={ic.right} />
                      </svg>
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
