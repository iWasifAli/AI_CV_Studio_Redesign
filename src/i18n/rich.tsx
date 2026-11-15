import { Fragment, type ReactNode } from 'react';
import type { T } from './core';

/**
 * Translated text with elements in it (links, bold words): `rich(t, 'Contact us at {link}.',
 * { link: <a …>…</a> })`. The translation keeps the {placeholders} where the language needs them.
 */
export function rich(t: T, text: string, parts: Record<string, ReactNode>): ReactNode {
  const out = t(text);
  return out.split(/(\{\w+\})/).map((piece, i) => {
    const m = /^\{(\w+)\}$/.exec(piece);
    return <Fragment key={i}>{m && m[1]! in parts ? parts[m[1]!] : piece}</Fragment>;
  });
}
