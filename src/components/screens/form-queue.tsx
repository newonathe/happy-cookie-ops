import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function FormQueueScreen({ v }: { v: OpsVals }) {
  const { hasQueueArchive, ic, queueArchive, queueEmpty, queueRows } = v;
  return (
    <>
      <div data-screen-label="Form queue" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#EEF4FE', border: '1px solid #CFE0FB', borderRadius: '14px', padding: '12px 14px' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#24487F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0', marginTop: '1px' }}>
            <path d={ic.sync} />
          </svg>
          <span style={{ fontSize: '13px', lineHeight: '1.5', color: '#24487F' }}>
            Nothing here becomes an order until you accept it.
          </span>
        </div>
        {queueEmpty ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '26px 0' }}>
              <span style={{ fontSize: '17px', fontWeight: '600' }}>Queue is clear</span>
              <span style={{ fontSize: '13px', color: '#6E574B' }}>Nothing waiting.</span>
            </div>
          </>
        ) : null}
        {(queueRows ?? []).map((q, $index) => (
          <Fragment key={$index}>
            <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ flex: '1', minWidth: '0', fontSize: '16px', fontWeight: '600' }}>{q.name}</span>
                {q.unclear ? (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#95600A', flexShrink: '0' }}>Check this</span>
                  </>
                ) : null}
              </div>
              <div style={{ background: '#F8F6F4', borderRadius: '12px', padding: '11px 12px' }}>
                <span style={{ fontSize: '13px', color: '#4A342A', lineHeight: '1.5' }}>{q.raw}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{q.orderLine}</span>
                <span style={{ fontSize: '12px', color: '#66524A' }}>{q.countText}</span>
              </div>
              {q.note ? (
                <>
                  <span style={{ fontSize: '12px', color: '#8E1F18', lineHeight: '1.45' }}>{q.note}</span>
                </>
              ) : null}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>Payment reference</span>
                <input value={q.ref} onChange={q.setRef} placeholder="Type it from their message" style={{ height: '46px', border: '1px solid #E4DDD8', borderRadius: '11px', padding: '0 12px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={q.accept} style={{ flex: '1', minHeight: '48px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
                  Accept
                </button>
                <button onClick={q.reject} style={{ minHeight: '48px', padding: '0 18px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600', color: '#A8231B' }}>
                  Reject
                </button>
              </div>
            </div>
          </Fragment>
        ))}
        {hasQueueArchive ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Rejected responses</span>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '14px', overflow: 'hidden' }}>
                {(queueArchive ?? []).map((qa, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px', borderBottom: '1px solid #F2EEEB' }}>
                      <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{qa.name}</span>
                        <span style={{ fontSize: '11px', color: '#66524A' }}>{qa.id} · rejected {qa.when}</span>
                      </span>
                      <Pressable as="button" onClick={qa.restore} style={{ minHeight: '40px', padding: '0 12px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                        Put back
                      </Pressable>
                    </div>
                  </Fragment>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: '#66524A' }}>Kept so nothing disappears without a trace.</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
