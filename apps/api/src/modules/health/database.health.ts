import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../../shared/db.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async ping() {
    const indicator = this.indicators.check('database');
    try {
      await this.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch {
      // No message: the driver error names host, port and user, which must not reach the response (§4.8).
      return indicator.down();
    }
  }
}
