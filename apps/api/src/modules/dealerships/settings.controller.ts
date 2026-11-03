import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { problemRef } from '../../shared/problem.js';
import { noQuery } from '../../shared/query.js';
import { text } from '../../shared/text.js';
import { RequirePermission } from '../auth/decorators.js';
import type { AuthedRequest } from '../auth/request-context.js';
import { SettingsService } from './settings.service.js';

const patchSchema = z.strictObject({
  timezone: text().optional(),
  watchDays: z.int().optional(),
  agingDays: z.int().optional(),
});

const settingsOpenApi: SchemaObject = {
  type: 'object',
  required: ['name', 'timezone', 'watchDays', 'agingDays', 'todayLocal'],
  properties: {
    name: { type: 'string' },
    timezone: { type: 'string', description: 'IANA name' },
    watchDays: { type: 'integer' },
    agingDays: { type: 'integer' },
    todayLocal: { type: 'string', format: 'date' },
  },
};

const patchOpenApi: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  description:
    'Every field optional; absent means unchanged. Thresholds are validated as the merged pair: 1 <= watchDays < agingDays <= 3650.',
  properties: {
    timezone: {
      type: 'string',
      description:
        'Exact IANA name (case-sensitive); abbreviations such as CET or EST are rejected.',
    },
    watchDays: { type: 'integer' },
    agingDays: { type: 'integer' },
  },
};

const context = (req: AuthedRequest) => {
  if (!req.dealershipId || !req.dealership)
    throw new Error('DealershipGuard did not run');
  return { id: req.dealershipId, ctx: req.dealership };
};

@ApiTags('dealerships')
@ApiBearerAuth()
@ApiParam({ name: 'dealershipId', type: 'string', format: 'uuid' })
@Controller('dealerships/:dealershipId/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('settings:read')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    description: 'The dealership settings and its local date',
    schema: settingsOpenApi,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (the route takes no query parameters)',
    content: problemRef,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
    content: problemRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Unknown dealership, or the caller is not a member',
    content: problemRef,
  })
  get(
    @Req() req: AuthedRequest,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
  ) {
    const { id, ctx } = context(req);
    return this.settings.get(id, ctx);
  }

  @Patch()
  @RequirePermission('settings:update')
  @ApiBody({ schema: patchOpenApi })
  @ApiOkResponse({
    description: 'The settings after the change (`{}` changes nothing)',
    schema: settingsOpenApi,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (body or query parameters)',
    content: problemRef,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
    content: problemRef,
  })
  @ApiResponse({
    status: 403,
    description: 'The caller lacks settings:update',
    content: problemRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Unknown dealership, or the caller is not a member',
    content: problemRef,
  })
  @ApiResponse({
    status: 422,
    description:
      'THRESHOLDS_INVALID (merged pair outside 1 <= watchDays < agingDays <= 3650) or TIMEZONE_INVALID',
    content: problemRef,
  })
  update(
    @Req() req: AuthedRequest,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
    @Body({ schema: patchSchema }) body: z.infer<typeof patchSchema>,
  ) {
    const { id, ctx } = context(req);
    return this.settings.update(id, ctx, body);
  }
}
