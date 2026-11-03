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
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { problemContent } from '../../shared/problem.js';
import { component } from '../../shared/components.js';
import { noQuery } from '../../shared/query.js';
import { text } from '../../shared/text.js';
import { RequirePermission } from '../auth/decorators.js';
import type { AuthedRequest } from '../auth/request-context.js';
import { SettingsService } from './settings.service.js';

const updateSettingsSchema = z
  .strictObject({
    timezone: text()
      .meta({
        description:
          'Exact IANA name (case-sensitive); abbreviations such as CET or EST are rejected.',
      })
      .optional(),
    watchDays: z.int().optional(),
    agingDays: z.int().optional(),
  })
  .meta({
    id: 'UpdateSettingsRequest',
    description:
      'Every field optional; absent means unchanged. Thresholds are validated as the merged pair: 1 <= watchDays < agingDays <= 3650.',
  });

const settingsOpenApi = component('Settings', {
  type: 'object',
  required: ['name', 'timezone', 'watchDays', 'agingDays', 'todayLocal'],
  properties: {
    name: { type: 'string' },
    timezone: { type: 'string', description: 'IANA name' },
    watchDays: { type: 'integer' },
    agingDays: { type: 'integer' },
    todayLocal: { type: 'string', format: 'date' },
  },
});

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
    content: problemContent(400),
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
    content: problemContent(401),
  })
  @ApiResponse({
    status: 404,
    description: 'Unknown dealership, or the caller is not a member',
    content: problemContent(404),
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
  @ApiOkResponse({
    description: 'The settings after the change (`{}` changes nothing)',
    schema: settingsOpenApi,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (body or query parameters)',
    content: problemContent(400),
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
    content: problemContent(401),
  })
  @ApiResponse({
    status: 403,
    description: 'The caller lacks settings:update',
    content: problemContent(403),
  })
  @ApiResponse({
    status: 404,
    description: 'Unknown dealership, or the caller is not a member',
    content: problemContent(404),
  })
  @ApiResponse({
    status: 422,
    description:
      'THRESHOLDS_INVALID (merged pair outside 1 <= watchDays < agingDays <= 3650) or TIMEZONE_INVALID',
    content: problemContent(422, 'THRESHOLDS_INVALID'),
  })
  update(
    @Req() req: AuthedRequest,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
    @Body({ schema: updateSettingsSchema })
    body: z.infer<typeof updateSettingsSchema>,
  ) {
    const { id, ctx } = context(req);
    return this.settings.update(id, ctx, body);
  }
}
