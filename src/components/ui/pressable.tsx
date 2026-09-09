'use client';

import { useState } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

type Tag = 'button' | 'a' | 'div' | 'span' | 'label' | 'li';

export interface PressableProps {
  as?: Tag;
  children?: ReactNode;
  style?: CSSProperties;
  /** Applied while a pointer that can hover is over the element. */
  hoverStyle?: CSSProperties;
  /** Applied between pointer-down and pointer-up. */
  activeStyle?: CSSProperties;
  /** Applied while the element has keyboard focus. */
  focusStyle?: CSSProperties;
  [prop: string]: unknown;
}

/**
 * An element that carries hover, press and focus styling as style objects.
 *
 * The prototype expressed these as style-hover / style-active / style-focus on the
 * element itself. Keeping them as objects — rather than translating each one into a
 * utility class — is what makes the port literal: the pressed scale, the hover fill and
 * the focus ring are the exact values the owner approved.
 */
export function Pressable({
  as = 'button',
  children,
  style,
  hoverStyle,
  activeStyle,
  focusStyle,
  ...rest
}: PressableProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const [focus, setFocus] = useState(false);
  const Tag = as as ElementType;

  // Wraps the caller's own handler, if any, then applies the state change. Not memoised:
  // `rest` is a fresh object on every render, so a useCallback keyed on it would rebuild
  // these anyway while costing a dependency-array bug surface.
  const on =
    (name: string, fn: () => void) =>
    (event: { [k: string]: unknown }) => {
      const handler = rest[name];
      if (typeof handler === 'function') (handler as (e: unknown) => void)(event);
      fn();
    };

  const merged: CSSProperties = {
    ...style,
    ...(hover && hoverStyle ? hoverStyle : null),
    ...(focus && focusStyle ? focusStyle : null),
    ...(press && activeStyle ? activeStyle : null)
  };

  const props: Record<string, unknown> = {
    ...rest,
    style: merged,
    onPointerEnter: on('onPointerEnter', () => setHover(true)),
    onPointerLeave: on('onPointerLeave', () => {
      setHover(false);
      setPress(false);
    }),
    onPointerDown: on('onPointerDown', () => setPress(true)),
    onPointerUp: on('onPointerUp', () => setPress(false)),
    onPointerCancel: on('onPointerCancel', () => setPress(false)),
    onFocus: on('onFocus', () => setFocus(true)),
    onBlur: on('onBlur', () => {
      setFocus(false);
      setPress(false);
    })
  };
  if (as === 'button' && props.type === undefined) props.type = 'button';

  return <Tag {...props}>{children}</Tag>;
}
