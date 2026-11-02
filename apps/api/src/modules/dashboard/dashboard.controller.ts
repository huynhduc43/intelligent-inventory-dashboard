import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { z } from 'zod';
import { problemRef } from '../../shared/problem.js';
import { noQuery } from '../../shared/query.js';
import { RequirePermission } from '../auth/decorators.js';
import type { AuthedRequest } from '../auth/request-context.js';
import { DashboardService } from './dashboard.query.js';

const count = { type: 'integer' } as const;
const dashboardOpenApi: SchemaObject = {
  type: 'object',
  required: [
    'asOf',
    'timezone',
    'thresholds',
    'summary',
    'ageBuckets',
    'byMakeModel',
    'actionStats',
  ],
  properties: {
    asOf: { type: 'string', format: 'date-time' },
    timezone: { type: 'string' },
    thresholds: {
      type: 'object',
      required: ['watchDays', 'agingDays'],
      properties: { watchDays: count, agingDays: count },
    },
    summary: {
      type: 'object',
      required: [
        'totalInStock',
        'byTier',
        'agingWithoutAction',
        'avgDaysInStock',
      ],
      properties: {
        totalInStock: count,
        byTier: {
          type: 'object',
          required: ['FRESH', 'WATCH', 'AGING'],
          properties: { FRESH: count, WATCH: count, AGING: count },
        },
        agingWithoutAction: count,
        avgDaysInStock: {
          type: 'number',
          nullable: true,
          description: 'One decimal; null when there is no stock.',
        },
      },
    },
    ageBuckets: {
      type: 'array',
      description: 'Always four, in order, zero-filled.',
      items: {
        type: 'object',
        required: ['bucket', 'count'],
        properties: {
          bucket: { type: 'string', enum: ['0-30', '31-60', '61-90', '90+'] },
          count,
        },
      },
    },
    byMakeModel: {
      type: 'array',
      items: {
        type: 'object',
        required: ['make', 'model', 'count', 'aging'],
        properties: {
          make: { type: 'string' },
          model: { type: 'string' },
          count,
          aging: count,
        },
      },
    },
    actionStats: {
      type: 'array',
      description: 'Always seven, NONE first, zero-filled.',
      items: {
        type: 'object',
        required: ['actionType', 'count'],
        properties: {
          actionType: {
            type: 'string',
            enum: [
              'NONE',
              'PRICE_REDUCTION_PLANNED',
              'TRANSFER',
              'AUCTION',
              'PROMOTION',
              'MONITOR',
              'OTHER',
            ],
          },
          count,
        },
      },
    },
  },
};

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dealerships/:dealershipId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard:read')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'dealershipId', type: 'string', format: 'uuid' })
  @ApiOkResponse({
    description: 'KPI summary and breakdowns of the IN_STOCK vehicles',
    schema: dashboardOpenApi,
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
    if (!req.dealershipId || !req.dealership) {
      throw new Error('DealershipGuard did not run');
    }
    return this.dashboard.get(req.dealershipId, req.dealership);
  }
}
