import { Test } from '@nestjs/testing';
import { Clock, SystemClock } from '../../../src/shared/clock.js';
import { SharedModule } from '../../../src/shared/shared.module.js';
import { loadConfig } from '../../../src/shared/config.js';

describe('Clock', () => {
  it('SystemClock returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('SharedModule provides SystemClock by default and a test can pin it', async () => {
    // The pg pool is lazy: compiling the module opens no connection.
    const config = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:1/db',
      JWT_SECRET: 'x'.repeat(32),
    });
    const pinned = new Date('2026-03-29T00:30:00Z');
    const build = (pin: boolean) => {
      const builder = Test.createTestingModule({
        imports: [SharedModule.forRoot(config)],
      });
      if (pin) builder.overrideProvider(Clock).useValue({ now: () => pinned });
      return builder.compile();
    };

    const real = await build(false);
    const fixed = await build(true);

    expect(real.get(Clock)).toBeInstanceOf(SystemClock);
    expect(fixed.get(Clock).now()).toBe(pinned);
    await Promise.all([real.close(), fixed.close()]);
  });
});
