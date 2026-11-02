import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { Clock } from '../../shared/clock.js';
import { DB, type Db } from '../../shared/db.js';
import { REQUIRED_PERMISSION } from './auth.constants.js';
import {
  type Permission,
  permissionsFor,
  type Role,
} from './domain/permissions.js';
import type { AuthedRequest } from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ContextRow extends Record<string, unknown> {
  role: Role;
  timezone: string;
  watch_days: number;
  aging_days: number;
  today_local: string;
}

/** Membership, user status and thresholds in one query on every request (D16). Non-members get 404, never 403. */
@Injectable()
export class DealershipGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const permission = this.reflector.get<Permission>(
      REQUIRED_PERMISSION,
      context.getHandler(),
    );
    const params = req.params as Record<string, string | undefined>;
    const dealershipId = params.dealershipId;
    if (!dealershipId || !UUID.test(dealershipId)) throw notFound();

    const now = this.clock.now().toISOString();
    const { rows } = await this.db.execute<ContextRow>(sql`
      SELECT ud.role, d.timezone, d.watch_days, d.aging_days,
             ((${now}::timestamptz AT TIME ZONE d.timezone)::date)::text AS today_local
      FROM user_dealership ud
      JOIN app_user u ON u.id = ud.user_id AND u.status = 'ACTIVE'
      JOIN dealership d ON d.id = ud.dealership_id
      WHERE ud.user_id = ${req.userId} AND ud.dealership_id = ${dealershipId}`);
    const row = rows[0];
    if (!row) throw notFound();
    if (!permissionsFor(row.role).includes(permission)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }
    req.dealershipId = dealershipId;
    req.dealership = {
      role: row.role,
      timezone: row.timezone,
      watchDays: row.watch_days,
      agingDays: row.aging_days,
      todayLocal: row.today_local,
    };
    return true;
  }
}

const notFound = () => new NotFoundException('Resource not found.');
