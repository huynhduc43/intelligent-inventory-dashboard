import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ARGON2_PARAMS, encodePhc, parsePhc } from './domain/phc.js';

const argon2Async = promisify(argon2);

const derive = (
  password: string,
  { m, t, p }: { m: number; t: number; p: number },
  salt: Buffer,
  tagLength: number,
) =>
  argon2Async('argon2id', {
    message: password,
    nonce: salt,
    memory: m,
    passes: t,
    parallelism: p,
    tagLength,
  });

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  /** Verified for unknown and disabled users so every login pays one argon2 run. */
  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(16).toString('hex'));
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const tag = await derive(password, ARGON2_PARAMS, salt, 32);
    return encodePhc(ARGON2_PARAMS, salt, tag);
  }

  /** Recomputes with the stored hash's own parameters; false for a malformed hash. */
  async verify(password: string, stored: string): Promise<boolean> {
    const parsed = parsePhc(stored);
    if (!parsed) return false;
    const tag = await derive(password, parsed, parsed.salt, parsed.tag.length);
    return tag.length === parsed.tag.length && timingSafeEqual(tag, parsed.tag);
  }

  verifyDummy(password: string): Promise<boolean> {
    return this.verify(password, this.dummyHash);
  }
}
