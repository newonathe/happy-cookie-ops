'use client';

import type { LiveMoney } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import { Panel } from '@/components/ui/owner-kit';

type Read = LiveMoney['read'];

/** Shown in place of any books-backed figure or list until the books have been read once. */
export function BooksNotLoaded({ read }: { read: Read }) {
  return (
    <Panel tone="hero" title="Books not loaded yet">
      <p className="text-caption text-ink-mute">
        Your books could not be read on this device yet. Figures appear once they load; nothing here
        is counted as zero.
      </p>
      {read && !read.online ? (
        <p className="mt-2 text-caption text-ink-mute">
          Connect to read your books. Nothing here is counted as zero.
        </p>
      ) : null}
      {read ? (
        <Button
          onClick={read.retry}
          disabled={!read.online || read.canRetry === false || read.state === 'loading'}
          reason={read.canRetry === false ? 'Connect to the shop to read your books.' : undefined}
          busy={read.state === 'loading'}
          busyLabel="Reading books…"
        >
          Retry reading books
        </Button>
      ) : null}
    </Panel>
  );
}

/** Shown above books-backed figures that were read earlier: a failed or running refresh. */
export function BooksRefreshNotice({ read }: { read: Read }) {
  return (
    <>
      {read?.state === 'failed' ? (
        <Banner
          tone="warn"
          title="Books could not be refreshed"
          body={`Showing the last successful read. These figures may have changed since then.${read.online ? '' : ' Connect to read updated books.'}`}
          action={read.online ? { label: 'Retry reading books', onPress: read.retry } : undefined}
        />
      ) : null}
      {read?.state === 'loading' ? (
        <p role="status">Reading books. Showing the last successful read until it finishes.</p>
      ) : null}
    </>
  );
}
