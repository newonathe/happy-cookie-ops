import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function SystemHealthScreen({ v }: { v: OpsVals }) {
  const {
      cols2, contactSupport, exportNow, hasRecords, healthOk, healthRows, healthSub, healthTitle,
      ic, recordGroups, retryBackup
  } = v;
  return (
    <>
      <div data-screen-label="System health" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          {healthOk ? (
            <>
              <span style={{ width: '44px', height: '44px', borderRadius: '13px', background: '#E8F5EE', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1B7A4B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ic.check} />
                </svg>
              </span>
            </>
          ) : null}
          <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.4px' }}>{healthTitle}</span>
            <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.45' }}>{healthSub}</span>
          </span>
        </div>
        <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden' }}>
          {(healthRows ?? []).map((h, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '13px 14px', borderBottom: '1px solid #F2EEEB' }}>
                {h.bad ? (
                  <>
                    <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: '#C1352B', marginTop: '5px', flexShrink: '0' }} />
                  </>
                ) : null}
                {h.good ? (
                  <>
                    <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: '#22945B', marginTop: '5px', flexShrink: '0' }} />
                  </>
                ) : null}
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{h.label}</span>
                  <span style={{ fontSize: '12px', color: '#6E574B' }}>{h.value}</span>
                  <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.45' }}>{h.hint}</span>
                </span>
                {h.retry ? (
                  <>
                    <button onClick={retryBackup} style={{ minHeight: '40px', padding: '0 13px', border: '0', borderRadius: '10px', background: '#C24A15', color: '#FFFFFF', fontSize: '12px', fontWeight: '600', flexShrink: '0' }}>
                      Retry
                    </button>
                  </>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
        {hasRecords ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>What has been recorded</span>
              <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px; align-items: start`)}>
                {(recordGroups ?? []).map((rg, $index) => (
                  <Fragment key={$index}>
                    <div style={{ border: '1px solid #EDE8E4', borderRadius: '14px', overflow: 'hidden', minWidth: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', padding: '11px 13px', background: '#FCFBFA', borderBottom: '1px solid #F2EEEB' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>{rg.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                          {rg.countText}
                        </span>
                      </div>
                      {(rg.rows ?? []).map((rgr, $index) => (
                        <Fragment key={$index}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '10px 13px', borderBottom: '1px solid #F5F2F0' }}>
                            <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '500' }}>{rgr.what}</span>
                              <span style={{ fontSize: '11px', color: '#66524A' }}>{rgr.when}</span>
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {rgr.value}
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </Fragment>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>
                Kept so your stock and your money can always be explained. Nothing here is deleted.
              </span>
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Pressable as="button" onClick={exportNow} style={{ flex: '1', minWidth: '140px', minHeight: '46px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
            Export my data
          </Pressable>
          <Pressable as="button" onClick={contactSupport} style={{ flex: '1', minWidth: '140px', minHeight: '46px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
            Report a problem
          </Pressable>
        </div>
      </div>
    </>
  );
}
