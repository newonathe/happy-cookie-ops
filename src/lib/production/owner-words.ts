/**
 * The locked engine writes production sentences in its own words. The owner rolls dough into balls and keeps them in the
 * fridge (client review, 4 November 2026), so what reaches her screen says that. Sentences with no match stay as they are.
 */
export function bakeWords(text: unknown): string {
  return String(text ?? '')
    .replace(/^no dough yet$/i, 'No dough in the fridge')
    .replace(
      /^Nothing chilled for this flavour, so all (\d+) are mixed fresh\.$/i,
      'No dough in the fridge for this flavour, so all $1 use new ingredients.'
    )
    .replace(/(\d+) chilled dough/gi, '$1 balls of dough in the fridge')
    .replace(/chilled dough/gi, 'dough in the fridge');
}
