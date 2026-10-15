import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { FieldIssue } from '@/lib/bazaar/plan';

/**
 * The red fields of a form (spec rule 7). A form hands in `validate`, which returns every problem with the id of the input
 * to point at. On submit all of them show, the summary names them, and focus moves to it; a field is checked again when she
 * leaves it, and its red goes as soon as she types in it. The same words are in the summary and under the field.
 */
export function useIssues(validate: () => FieldIssue[]) {
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  // The fields a submit named: only these are listed in the summary.
  const [named, setNamed] = useState<string[]>([]);
  const [focusKey, setFocusKey] = useState(0);

  /** Shows the problems found by a check of the whole form made elsewhere; true when there are none. */
  const submitWith = (found: FieldIssue[]): boolean => {
    setIssues(found);
    setNamed(found.map((i) => i.field));
    if (found.length > 0) setFocusKey((k) => k + 1);
    return found.length === 0;
  };
  /** Checks the whole form; true when nothing is wrong. */
  const submit = (): boolean => submitWith(validate());
  // A tap on a button of the form is on its way. Leaving a field for it must not check the field first: the message would push
  // the button down between the press and the release, and the browser drops the click that lands on something else.
  const pressing = useRef(false);
  /** Props for the `<form>`: they note a press on one of its buttons (see `pressing`). */
  const formProps = {
    onPointerDownCapture: (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button')) pressing.current = true;
    },
    // On touch the browser's own mouse events (which move focus and so blur the field) arrive after the finger is up: the flag
    // is cleared by the click that follows, with a timeout as the safety if no click comes (a press dragged away).
    onClickCapture: () => void (pressing.current = false),
    onPointerUpCapture: () => void setTimeout(() => (pressing.current = false), 600),
    onPointerCancelCapture: () => void (pressing.current = false)
  };
  /** Checks one field when she leaves it. */
  const blur = (field: string) => {
    if (pressing.current) return;
    const mine = validate().find((i) => i.field === field);
    setIssues((all) => [...all.filter((i) => i.field !== field), ...(mine ? [mine] : [])]);
  };
  /** Takes the red off a field she is changing. */
  const touch = (field: string) =>
    setIssues((all) =>
      all.some((i) => i.field === field) ? all.filter((i) => i.field !== field) : all
    );
  const clear = () => {
    setIssues([]);
    setNamed([]);
  };
  const messageOf = (field: string): string | undefined =>
    issues.find((i) => i.field === field)?.message;
  // In the order the submit found them, which is the form's order.
  const summary = named.flatMap((field) => issues.filter((i) => i.field === field));
  return {
    issues,
    summary,
    focusKey,
    formProps,
    submit,
    submitWith,
    blur,
    touch,
    clear,
    messageOf
  };
}
