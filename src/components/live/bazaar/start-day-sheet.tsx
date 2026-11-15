'use client';

import type { StartPrompt } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/**
 * A2: starting a day whose date is not today asks first, and so does a day with no starting cash. The words are the rule's
 * (`startPromptOf`). Starting anyway is the dark, committing button; with no starting cash, "Set starting cash" opens the day
 * plan instead.
 */
export function StartDaySheet({
  prompt,
  onConfirm,
  onClose,
  onSetFloat
}: {
  prompt: StartPrompt;
  onConfirm: () => void;
  onClose: () => void;
  /** Opens the day plan, where the starting cash is set. */
  onSetFloat?: (() => void) | null;
}) {
  return (
    <Sheet
      title={prompt.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="dark" onClick={onConfirm}>
            Start anyway
          </Button>
          {prompt.noFloat && onSetFloat ? (
            <Button variant="secondary" onClick={onSetFloat}>
              Set starting cash
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="m-0 text-body text-ink">{prompt.body}</p>
    </Sheet>
  );
}
