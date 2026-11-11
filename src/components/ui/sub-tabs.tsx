'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Pressable } from './pressable';

export interface SubTab {
  id: string;
  label: string;
  active: boolean;
  badge?: ReactNode | null;
  go: () => void;
}

export interface SubTabsProps {
  label: string;
  tabs: SubTab[];
  quiet?: boolean;
  refined?: boolean;
}

const navStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  padding: '2px',
  overflow: 'visible'
};

const badgeStyle: CSSProperties = {
  minWidth: '18px',
  height: '18px',
  padding: '0 5px',
  borderRadius: '999px',
  background: '#C24A15',
  color: '#FFFFFF',
  fontSize: '11px',
  fontWeight: 700,
  display: 'grid',
  placeItems: 'center',
  fontVariantNumeric: 'tabular-nums'
};

function tabStyle(active: boolean, quiet: boolean, refined: boolean): CSSProperties {
  const tone: CSSProperties = active
    ? { background: '#FDEDE5', color: '#A63C0E', boxShadow: 'inset 0 0 0 2px #E75F23' }
    : quiet
      ? { background: '#FFFFFF', color: '#3A1F14', boxShadow: 'inset 0 0 0 1px #E7E1DC' }
      : { background: '#F4F1EE', color: '#3A1F14' };
  return {
    minHeight: quiet ? '36px' : '44px',
    padding: quiet ? '0 12px' : '0 14px',
    fontSize: quiet ? '12px' : '13px',
    borderRadius: '12px',
    border: '0',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    fontFamily: 'inherit',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease',
    ...tone,
    ...(refined
      ? {
          minHeight: '44px',
          padding: '10px 13px',
          fontSize: '0.8125rem',
          borderRadius: '11px',
          border: '1px solid transparent',
          boxShadow: 'none',
          background: active ? 'var(--color-cust-bg)' : 'transparent',
          color: active ? 'var(--color-brand)' : 'var(--color-ink-mute)',
          fontWeight: active ? 600 : 500
        }
      : {})
  };
}

/**
 * The sub-tab strip of the live interface (final-plan.md section 8). The labels and which
 * one is open come from data; destinations wrap so a narrow screen never hides them offscreen.
 */
export function SubTabs({ label, tabs, quiet = false, refined = false }: SubTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <nav aria-label={label} data-sub-tabs={quiet ? 'entries' : 'places'} style={navStyle}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          as="button"
          type="button"
          aria-current={tab.active ? 'page' : undefined}
          onClick={tab.go}
          style={tabStyle(tab.active, quiet, refined)}
          hoverStyle={
            tab.active ? undefined : { background: refined ? 'var(--color-raise)' : '#F3EFEC' }
          }
          activeStyle={{ transform: 'scale(.98)' }}
          focusStyle={{ outline: '2px solid #E75F23', outlineOffset: '2px' }}
        >
          {tab.label}
          {tab.badge ? <span style={badgeStyle}>{tab.badge}</span> : null}
        </Pressable>
      ))}
    </nav>
  );
}
