import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { IS_PUBLIC, REQUIRED_PERMISSION } from './auth.constants.js';
import { DealershipGuard } from './dealership.guard.js';
import type { Permission } from './domain/permissions.js';

/** Opts a route out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Marks a `/dealerships/:dealershipId/...` route: membership check plus this permission (ADR 0008). */
export const RequirePermission = (permission: Permission) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSION, permission),
    UseGuards(DealershipGuard),
  );
