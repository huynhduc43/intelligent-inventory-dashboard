import { z } from 'zod';

// Postgres rejects U+0000 in `text` (SQLSTATE 22021, a 500), so refuse it at the edge.
export const noNul = (s: string) => !s.includes('\u0000');

/** Base for every free-text request field. */
export const text = () =>
  z.string().refine(noNul, 'Must not contain NUL (U+0000)');
