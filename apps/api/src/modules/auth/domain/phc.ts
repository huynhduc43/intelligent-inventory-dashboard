export interface Argon2Params {
  m: number;
  t: number;
  p: number;
}

export interface ParsedHash extends Argon2Params {
  salt: Buffer;
  tag: Buffer;
}

export const ARGON2_PARAMS: Argon2Params = { m: 19456, t: 2, p: 1 };

export function encodePhc(
  { m, t, p }: Argon2Params,
  salt: Buffer,
  tag: Buffer,
): string {
  const b64 = (b: Buffer) => b.toString('base64').replaceAll('=', '');
  return `$argon2id$v=19$m=${String(m)},t=${String(t)},p=${String(p)}$${b64(salt)}$${b64(tag)}`;
}

const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Returns null for anything that is not an argon2id v19 PHC string. */
export function parsePhc(hash: string): ParsedHash | null {
  const match = PHC.exec(hash);
  if (!match) return null;
  const [m, t, p, salt, tag] = match.slice(1) as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    m: Number(m),
    t: Number(t),
    p: Number(p),
    salt: Buffer.from(salt, 'base64'),
    tag: Buffer.from(tag, 'base64'),
  };
}
