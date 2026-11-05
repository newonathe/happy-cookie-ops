/**
 * Why a sale is still on this device, in the owner's words. The queue keeps the server's own text in `lastError`; each
 * known refusal comes from `record_event_sale` or from `sync.ts`. An unknown one shows the server's text, so the real
 * reason can always be read off the screen and never has to be guessed.
 */
const KNOWN: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /no server event/i,
    'This event was never opened on the server, so this sale has nowhere to go.'
  ],
  [/not the selling device/i, 'Another device is the one selling this event.'],
  [/event closed before/i, 'This event was closed before this sale was sent.'],
  [/event not found/i, 'The server has no record of this event.'],
  [/before the event started/i, 'This sale is dated before the event started.'],
  [/not in the event price snapshot/i, "This cookie was not on the event's price list."],
  [/does not match the event prices/i, "This sale's total does not match the event's prices."],
  [/only the owner/i, "The server only accepts sales from the owner's sign-in."],
  [/jwt|PGRST30|invalid.*token|not authenticated/i, 'Your sign-in has run out. Sign in again.']
];

/** The reachability errors: nothing was refused, so the timer keeps trying. */
const UNREACHABLE = /failed to fetch|network|not acknowledged|load failed|timeout|timed out/i;

export function saleProblemWords(row: {
  lastError: string | null;
  refused?: boolean;
}): string | null {
  const error = row.lastError?.trim();
  if (!error) return null;
  const known = KNOWN.find(([pattern]) => pattern.test(error))?.[1];
  if (known) return `${known} It is still saved on this device.`;
  if (!row.refused && UNREACHABLE.test(error))
    return 'The server could not be reached. It will keep trying by itself.';
  return row.refused
    ? `The server refused this sale: ${error}. It is still saved on this device.`
    : `This sale could not be sent yet: ${error}. It will keep trying by itself.`;
}
