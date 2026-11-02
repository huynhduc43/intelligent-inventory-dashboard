import type { Request } from 'express';
import type { Role } from './domain/permissions.js';

export interface DealershipContext {
  role: Role;
  timezone: string;
  watchDays: number;
  agingDays: number;
  /** `YYYY-MM-DD`, computed in Postgres. */
  todayLocal: string;
}

export type AuthedRequest = Request & {
  userId: string;
  dealershipId?: string;
  dealership?: DealershipContext;
};
