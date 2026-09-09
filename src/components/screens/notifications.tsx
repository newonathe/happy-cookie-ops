import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function NotificationsScreen({ v }: { v: OpsVals }) {
  const {
      channels, clearNotifs, ic, notifAny, notifDismissed, notifDismissedText, notifEmpty,
      notifications, restoreNotifs
  } = v;
  return (
    <>
      <div data-screen-label="Notifications" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {notifAny ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: '1', minWidth: '0', fontSize: '12px', color: '#6E574B' }}>
                Each one points at something you can act on. They come back if the problem is still there.
              </span>
              <Pressable as="button" onClick={clearNotifs} style={{ minHeight: '40px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                Clear all
              </Pressable>
            </div>
          </>
        ) : null}
        {notifDismissed ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
              <span style={{ flex: '1', minWidth: '0', fontSize: '12px', color: '#66524A' }}>{notifDismissedText}</span>
              <Pressable as="button" onClick={restoreNotifs} style={{ minHeight: '38px', padding: '0 12px', border: '0', background: 'transparent', fontSize: '12px', fontWeight: '500', color: '#6E574B', transition: 'color .18s ease' }} hoverStyle={{ color: '#3A1F14' }}>
                Show them again
              </Pressable>
            </div>
          </>
        ) : null}
        {notifEmpty ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '26px 0' }}>
              <span style={{ fontSize: '17px', fontWeight: '600' }}>Nothing waiting</span>
              <span style={{ fontSize: '13px', color: '#6E574B' }}>You are caught up.</span>
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(notifications ?? []).map((nt, $index) => (
            <Fragment key={$index}>
              <div style={{ position: 'relative' }}>
                <Pressable as="button" onClick={nt.go} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', width: '100%', textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '14px', padding: '12px 42px 12px 13px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
                  <span style={s(`width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; background: ${nt.bg}; border: 1px solid ${nt.br}`)}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={nt.fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={nt.icon} />
                    </svg>
                  </span>
                  <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', lineHeight: '1.35' }}>{nt.label}</span>
                    <span style={{ fontSize: '11px', color: '#66524A' }}>{nt.sub} · {nt.urgency}</span>
                  </span>
                </Pressable>
                <Pressable as="button" onClick={nt.dismiss} aria-label="Dismiss" style={{ position: 'absolute', top: '9px', right: '9px', width: '30px', height: '30px', border: '0', background: 'transparent', borderRadius: '999px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease' }} hoverStyle={{ background: 'rgba(58,31,20,.06)' }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#8A7062" strokeWidth="2" strokeLinecap="round">
                    <path d={ic.close} />
                  </svg>
                </Pressable>
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>What you get told about</span>
          <div style={{ border: '1px solid #EDE8E4', borderRadius: '14px', overflow: 'hidden' }}>
            {(channels ?? []).map((ch, $index) => (
              <Fragment key={$index}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderBottom: '1px solid #F2EEEB' }}>
                  <span style={{ flex: '1', fontSize: '14px' }}>{ch.label}</span>
                  <button onClick={ch.toggle} aria-label="Toggle" style={{ width: '46px', height: '28px', borderRadius: '999px', border: '1px solid #E4DDD8', background: '#F4F1EE', display: 'flex', alignItems: 'center', padding: '2px', transition: 'background-color .2s ease' }}>
                    {ch.on ? (
                      <>
                        <span style={{ width: '22px', height: '22px', borderRadius: '999px', background: '#22945B', marginLeft: 'auto', transition: 'margin .2s cubic-bezier(.2,.8,.2,1)' }} />
                      </>
                    ) : null}
                    {ch.off ? (
                      <>
                        <span style={{ width: '22px', height: '22px', borderRadius: '999px', background: '#D8D0CA' }} />
                      </>
                    ) : null}
                  </button>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
