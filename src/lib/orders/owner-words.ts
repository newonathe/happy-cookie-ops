/**
 * The words the owner uses for an order's stages (client review, 4 November 2026). Customers pick up from her, so nothing
 * here may sound like delivery. These are labels only: the stored statuses and what each action does stay as they are.
 */
const STATUS_WORDS: Readonly<Record<string, string>> = {
  ready: 'Ready for customer pickup',
  'ready for pickup': 'Ready for customer pickup',
  collected: 'Completed'
};

const ACTION_WORDS: Readonly<Record<string, string>> = {
  'mark ready': 'Mark packed',
  'mark collected': 'Mark picked up'
};

const key = (word: unknown) => String(word ?? '').toLowerCase();

/** A status as she says it. Words with no entry stay as they are. */
export function orderStatusWord(word: unknown): string {
  return STATUS_WORDS[key(word)] ?? String(word ?? '');
}

/** An order's next action as she says it. Words with no entry stay as they are. */
export function orderActionWord(word: unknown): string {
  return ACTION_WORDS[key(word)] ?? String(word ?? '');
}

/** A step of the order's progress, which the engine writes as a sentence. */
export function orderStepWords(step: unknown): string {
  return String(step ?? '')
    .replace(/ready for pickup/i, 'Ready for customer pickup')
    .replace(/collected/i, 'Picked up');
}
