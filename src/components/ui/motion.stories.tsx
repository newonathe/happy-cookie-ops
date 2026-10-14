import { useState } from 'react';
import type { Meta } from '@storybook/nextjs';
import { Button } from './button';
import { cx } from './cx';
import { useCountUp, usePresence, useViewTransition } from './motion';
import { flushSync } from 'react-dom';

const meta = {
  title: 'Bazaar v2/Motion',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Only transform and opacity animate. Every demo here stops under reduced motion. The tokens: --dur-fast 150 ms, --dur-base 250 ms, --dur-slow 400 ms; --ease-enter, --ease-exit, --ease-standard.'
      }
    }
  }
} satisfies Meta;

export default meta;

function Row({ name, leaving }: { name: string; leaving: boolean }) {
  return (
    <li
      data-leaving={leaving}
      className="motion-enter motion-leave rounded-control border border-line bg-surface px-3 py-2 text-body"
    >
      {name}
    </li>
  );
}

function ListDemo() {
  const [rows, setRows] = useState(['Ateneo bazaar', 'Christmas fair']);
  const [next, setNext] = useState(1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          variant="dark"
          onClick={() => {
            setRows((r) => [`New event ${next}`, ...r]);
            setNext((n) => n + 1);
          }}
        >
          Add a row
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((name) => (
          <PresentRow
            key={name}
            name={name}
            onRemove={() => setRows((r) => r.filter((x) => x !== name))}
          />
        ))}
      </ul>
    </div>
  );
}

function PresentRow({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [present, setPresent] = useState(true);
  const { mounted, leaving } = usePresence(present);
  if (!mounted) return null;
  return (
    <div className="flex items-center gap-2">
      <ul className="m-0 flex-1 list-none p-0">
        <Row name={name} leaving={leaving} />
      </ul>
      <Button
        size="sm"
        variant="danger"
        onClick={() => {
          setPresent(false);
          window.setTimeout(onRemove, 200);
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export const ListEnterAndLeave = { render: () => <ListDemo /> };

function CountDemo() {
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <Count key={key} />
      <Button onClick={() => setKey((k) => k + 1)}>Show again</Button>
    </div>
  );
}
function Count() {
  const n = useCountUp(144);
  return <span className="text-display tabular-nums">{n}</span>;
}
export const CountUp = { render: () => <CountDemo /> };

function ViewDemo() {
  const run = useViewTransition();
  const [on, setOn] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={() => run(() => flushSync(() => setOn((v) => !v)))}>Switch</Button>
      <div
        style={{ viewTransitionName: 'demo-box' }}
        className={cx('rounded-card bg-brand p-4 text-surface', on ? 'ml-24 w-40' : 'w-24')}
      >
        {on ? 'Over here' : 'Here'}
      </div>
    </div>
  );
}
export const ViewTransition = { render: () => <ViewDemo /> };
