import { randomBytes } from 'node:crypto';
import { hashPassword } from '../../../db/seed.js';
import { encodePhc, parsePhc } from '../../../src/modules/auth/domain/phc.js';
import { PasswordService } from '../../../src/modules/auth/password.service.js';

describe('PHC string', () => {
  it('round-trips parameters, salt and tag', () => {
    const salt = randomBytes(16);
    const tag = randomBytes(32);
    const phc = encodePhc({ m: 19456, t: 2, p: 1 }, salt, tag);

    expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[^$=]+\$[^$=]+$/);
    expect(parsePhc(phc)).toEqual({ m: 19456, t: 2, p: 1, salt, tag });
  });

  it.each([
    '',
    'plain',
    '$argon2i$v=19$m=1,t=1,p=1$YWJj$YWJj',
    '$argon2id$v=19$m=1,t=1,p=1$YWJj',
  ])('rejects %j', (bad) => {
    expect(parsePhc(bad)).toBeNull();
  });
});

describe('PasswordService', () => {
  const service = new PasswordService();

  it('verifies its own hash and rejects a wrong password', async () => {
    const hash = await service.hash('correct horse battery');

    expect(await service.verify('correct horse battery', hash)).toBe(true);
    expect(await service.verify('wrong', hash)).toBe(false);
  });

  it('accepts the seed script hash', async () => {
    const hash = await hashPassword('seed-password-12345');

    expect(await service.verify('seed-password-12345', hash)).toBe(true);
  });

  it('verifies with the stored parameters, not its own', async () => {
    const salt = randomBytes(16);
    const { argon2Sync } = await import('node:crypto');
    const tag = argon2Sync('argon2id', {
      message: 'pw',
      nonce: salt,
      memory: 64,
      passes: 1,
      parallelism: 1,
      tagLength: 16,
    });
    const hash = encodePhc({ m: 64, t: 1, p: 1 }, salt, tag);

    expect(await service.verify('pw', hash)).toBe(true);
  });

  it('fails a tampered or malformed hash', async () => {
    const hash = await service.hash('pw');
    const tampered = hash.slice(0, -2) + (hash.endsWith('AA') ? 'BB' : 'AA');

    expect(await service.verify('pw', tampered)).toBe(false);
    expect(await service.verify('pw', 'not-a-hash')).toBe(false);
  });

  it('verifyDummy never succeeds', async () => {
    await service.onModuleInit();

    expect(await service.verifyDummy('anything')).toBe(false);
  });
});
