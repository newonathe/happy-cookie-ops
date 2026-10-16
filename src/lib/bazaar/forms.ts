import { amountCents, typedCostCents, wholeCount } from '@/lib/bazaar/review';
import type { FieldIssue } from '@/lib/bazaar/plan';

/**
 * The small forms of a bazaar event (U4): a fee, a loss, a typed cost per cookie and the target. Each returns every
 * problem with the id of the input to point at, in the form's order, and the words say what is wrong and how to fix it
 * (spec rule 7). The store's own checks (`feeError`, `lossError`, `amountCents`, `typedCostCents`) still run last, when
 * the change is sent: these only make the first refusal one she can see on the field.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MAX_FEE_CENTS = 100_000_000;

/** The input ids of the forms: the error summary links to them. */
export const formIds = {
  feeLabel: 'fee-label',
  feeAmount: 'fee-amount',
  lossFlavour: 'loss-flavour',
  lossQty: 'loss-qty',
  lossReason: 'loss-reason',
  target: 'target-pesos',
  cost: (productId: string) => `cost-${productId}`,
  finalCost: (productId: string) => `final-cost-${productId}`,
  finalShop: (productId: string) => `final-shop-${productId}`
} as const;

/**
 * Pesos as she may type them: a leading ₱ and well-formed thousands commas are taken out ("₱2,500.00" is "2500.00"). A
 * comma anywhere else is left in, and the amount is then refused.
 */
export function pesosText(text: string): string {
  const t = text.trim().replace(/^₱\s*/, '');
  return /^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]*)?$/.test(t) ? t.replace(/,/g, '') : t;
}

/** Whole centavos from an amount typed for a fee or a target ("2,500", "250.50"); null when it is not an amount. */
export function feeCentsOf(text: string): number | null {
  return amountCents(pesosText(text));
}

export function validateFeeForm(input: { label: string; amount: string }): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const label = input.label.trim();
  if (label.length < 1)
    errors.push({ field: formIds.feeLabel, message: 'Say what the fee is for, like "Permit".' });
  else if (label.length > 80)
    errors.push({
      field: formIds.feeLabel,
      message: 'The fee name is at most 80 characters. Shorten it.'
    });
  else if (CONTROL.test(input.label))
    errors.push({
      field: formIds.feeLabel,
      message: 'The fee name has a character that cannot be saved. Retype it.'
    });
  const cents = feeCentsOf(input.amount);
  if (cents === null)
    errors.push({
      field: formIds.feeAmount,
      message: 'Enter the amount in pesos, like 250 or 250.50.'
    });
  else if (cents < 1)
    errors.push({ field: formIds.feeAmount, message: 'The amount must be more than ₱0.' });
  else if (cents > MAX_FEE_CENTS)
    errors.push({ field: formIds.feeAmount, message: 'The amount is at most ₱1,000,000.00.' });
  return errors;
}

export function validateLossForm(input: {
  productId: string;
  qty: string;
  reason: string;
}): FieldIssue[] {
  const errors: FieldIssue[] = [];
  if (input.productId === '')
    errors.push({ field: formIds.lossFlavour, message: 'Choose the flavour that was lost.' });
  if (wholeCount(input.qty) === null)
    errors.push({
      field: formIds.lossQty,
      message: 'Enter how many were lost, a whole number from 1 to 9,999.'
    });
  const reason = input.reason.trim();
  if (reason.length < 1)
    errors.push({ field: formIds.lossReason, message: 'Say what happened, like "Dropped".' });
  else if (reason.length > 80)
    errors.push({
      field: formIds.lossReason,
      message: 'What happened is at most 80 characters. Shorten it.'
    });
  else if (CONTROL.test(input.reason))
    errors.push({
      field: formIds.lossReason,
      message: 'What happened has a character that cannot be saved. Retype it.'
    });
  return errors;
}

/** The message for a typed cost per cookie that is not one; blank is allowed (it goes back to the recipe's). */
export function costFieldError(pesos: string): string | null {
  const t = pesos.trim();
  if (t === '') return null;
  return typedCostCents(pesosText(t)) === null
    ? 'Enter the cost per cookie like 12 or 12.50, with at most four decimals, or leave it blank.'
    : null;
}

export function validateCostForm(input: { field: string; pesos: string }): FieldIssue[] {
  const message = costFieldError(input.pesos);
  return message ? [{ field: input.field, message }] : [];
}

export function validateTargetForm(input: { pesos: string }): FieldIssue[] {
  const t = input.pesos.trim();
  if (t === '') return [];
  const cents = feeCentsOf(t);
  if (cents === null)
    return [
      {
        field: formIds.target,
        message: 'Enter the target profit in pesos, like 5,000 or 5000.50, or leave it blank.'
      }
    ];
  if (cents > MAX_FEE_CENTS)
    return [{ field: formIds.target, message: 'The target is at most ₱1,000,000.00.' }];
  return [];
}
