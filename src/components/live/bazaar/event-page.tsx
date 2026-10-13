import type * as React from 'react';
import type { BazaarDayRow, BazaarEventView } from '@/lib/bazaar/live-bazaar-types';
import {
  Facts,
  INK_SOFT,
  LINE,
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  mutedStyle,
  primaryBase,
  textStyle,
  wrapRow
} from '@/components/live/stock/stock-shared';

const ACTION_WORD: Record<NonNullable<BazaarDayRow['action']>, string> = {
  start: 'Start this day'
};

function DayCard({ day }: { day: BazaarDayRow }) {
  const noteId = 'day-note-' + day.id;
  const blocked = day.actionNote !== null;
  const primary: React.CSSProperties = blocked
    ? { ...primaryBase, background: LINE, color: INK_SOFT, cursor: 'not-allowed' }
    : primaryBase;
  return (
    <li style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ ...wrapRow, justifyContent: 'space-between' }}>
        <span style={{ ...textStyle, fontWeight: 700 }}>{day.dateText}</span>
        <span style={{ ...textStyle, fontWeight: 700 }}>{day.word}</span>
      </span>
      <span style={wrapRow}>
        <span style={textStyle}>{day.cookiesText}</span>
        <span style={mutedStyle}>{day.floatText}</span>
      </span>
      {day.lines.length ? (
        <ul aria-label={'Plan for ' + day.dateText} style={{ ...listStyle, gap: '2px' }}>
          {day.lines.map((line) => (
            <li key={line} style={mutedStyle}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {day.action ? (
          <button
            type="button"
            onClick={day.run}
            disabled={blocked}
            aria-describedby={blocked ? noteId : undefined}
            style={primary}
          >
            {ACTION_WORD[day.action]}
          </button>
        ) : null}
        {day.edit ? (
          <button type="button" onClick={day.edit} style={buttonBase}>
            Change the plan
          </button>
        ) : null}
      </span>
      {day.actionNote ? (
        <p id={noteId} style={mutedStyle}>
          {day.actionNote}
        </p>
      ) : null}
    </li>
  );
}

/** One booking: its details, then its days. A day is planned here and started here. */
export function EventPage({ event }: { event: BazaarEventView }) {
  return (
    <>
      <button
        type="button"
        onClick={event.back}
        style={{ ...buttonBase, alignSelf: 'flex-start', minHeight: '44px' }}
      >
        <span aria-hidden="true">← </span>Back to the events
      </button>
      <h1 style={h1Style}>{event.name}</h1>
      <section aria-label="Event details" style={cardStyle}>
        <Facts
          rows={[
            ['Dates', event.datesText],
            ['Place', event.placeText],
            ['Stall rent', event.rentText.replace(/^Stall rent /, '')]
          ]}
        />
      </section>
      <section
        aria-labelledby="bazaar-days"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <h2 id="bazaar-days" style={h2Style}>
          Days
        </h2>
        {event.days.length === 0 ? (
          <p style={mutedStyle}>No day is planned yet.</p>
        ) : (
          <ul aria-label="Days" style={listStyle}>
            {event.days.map((day) => (
              <DayCard key={day.id} day={day} />
            ))}
          </ul>
        )}
      </section>
      {event.unplanned.length ? (
        <section
          aria-labelledby="bazaar-plan"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <h2 id="bazaar-plan" style={h2Style}>
            Plan a day
          </h2>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {event.unplanned.map((u) => (
              <button
                key={u.ymd}
                type="button"
                onClick={() => event.planDay(u.ymd)}
                style={buttonBase}
              >
                {u.text}
              </button>
            ))}
          </span>
        </section>
      ) : null}
    </>
  );
}
