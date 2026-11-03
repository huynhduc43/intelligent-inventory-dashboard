import { z } from 'zod';

// Postgres rejects U+0000 in `text` (SQLSTATE 22021, a 500), so refuse it at the edge.
export const noNul = (s: string) => !s.includes('\u0000');

/** Base for every free-text request field. */
export const text = () =>
  z.string().refine(noNul, 'Must not contain NUL (U+0000)');

/** A name the user sees as one value: trimmed, inner whitespace runs collapsed to one space (ADR 0017). */
export const name = () =>
  text()
    .trim()
    .overwrite((s) => s.replace(/\s+/g, ' '));
