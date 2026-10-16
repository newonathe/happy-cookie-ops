'use client';

import type { StartPrompt } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/**
 * A2: starting a day whose date is not today asks first. The words are the rule's (`startPromptOf`): which day this is,
 * what today is, and what that does to the dates of its sales and its rent. Starting anyway is the dark, committing button.
 */
export function StartDaySheet({
  prompt,
  onConfirm,
  onClose
}: {
  prompt: StartPrompt;
  onConfirm: () => void;
  onClose: () => void;
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
