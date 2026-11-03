import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { problemRef, ValidationFailedException } from '../../shared/problem.js';
import { component } from '../../shared/components.js';
import { noQuery } from '../../shared/query.js';
import { RequirePermission } from '../auth/decorators.js';
import { UUID } from '../auth/dealership.guard.js';
import type { AuthedRequest } from '../auth/request-context.js';
import { changeStatusSchema, createVehicleSchema } from './vehicles.body.js';
import { vehicleListQuery } from './vehicles.query.js';
import { VehiclesService } from './vehicles.service.js';

const vehicleSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'vin',
    'make',
    'model',
    'modelYear',
    'mileage',
    'listPrice',
    'status',
    'stockedOn',
    'daysInStock',
    'tier',
    'currentAction',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    vin: { type: 'string' },
    make: { type: 'string' },
    model: { type: 'string' },
    modelYear: { type: 'integer' },
    mileage: { type: 'integer' },
    listPrice: {
      type: 'string',
      nullable: true,
      description: 'Decimal string, e.g. "23995.00"',
    },
    status: { type: 'string', enum: ['IN_STOCK', 'RESERVED', 'SOLD'] },
    stockedOn: { type: 'string', format: 'date' },
    daysInStock: { type: 'integer' },
    tier: { type: 'string', enum: ['FRESH', 'WATCH', 'AGING'] },
    currentAction: {
      type: 'object',
      nullable: true,
      required: ['actionType', 'note', 'createdBy', 'createdAt'],
      properties: {
        actionType: {
          type: 'string',
          enum: [
            'PRICE_REDUCTION_PLANNED',
            'TRANSFER',
            'AUCTION',
            'PROMOTION',
            'MONITOR',
            'OTHER',
          ],
        },
        note: { type: 'string', nullable: true },
        createdBy: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};
const vehicleOpenApi = component('Vehicle', vehicleSchema);

const dealershipParam = ApiParam({
  name: 'dealershipId',
  type: 'string',
  format: 'uuid',
});

/** `DealershipGuard` has already set `req.dealership` on these routes. */
const context = (req: AuthedRequest) => {
  if (!req.dealershipId || !req.dealership) {
    throw new Error('DealershipGuard did not run');
  }
  return { id: req.dealershipId, ctx: req.dealership };
};

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('dealerships/:dealershipId/vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermission('vehicle:read')
  @Header('Cache-Control', 'no-store')
  @dealershipParam
  @ApiQuery({
    name: 'status',
    style: 'form',
    explode: false,
    required: false,
    schema: { type: 'string', default: 'IN_STOCK' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    schema: { type: 'integer', minimum: 0, default: 0 },
  })
  @ApiOkResponse({
    description: 'A page of vehicles and the total matching the filters',
    schema: component('VehicleList', {
      type: 'object',
      required: ['items', 'total'],
      properties: {
        items: { type: 'array', items: vehicleOpenApi },
        total: { type: 'integer' },
      },
    }),
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
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
  list(
    @Req() req: AuthedRequest,
    @Query({ schema: vehicleListQuery })
    query: z.infer<typeof vehicleListQuery>,
  ) {
    const { id, ctx } = context(req);
    return this.vehicles.list(id, ctx, query);
  }

  @Post()
  @RequirePermission('vehicle:create')
  @dealershipParam
  @ApiCreatedResponse({
    description: 'The new vehicle; Location names it',
    schema: vehicleOpenApi,
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
    description: 'The caller lacks vehicle:create',
    content: problemRef,
  })
  @ApiResponse({
    status: 404,
    description:
      'Unknown or malformed dealership, or the caller is not a member',
    content: problemRef,
  })
  @ApiResponse({
    status: 409,
    description:
      'VIN_ALREADY_IN_STOCK: an IN_STOCK or RESERVED vehicle here has the VIN',
    content: problemRef,
  })
  async create(
    @Req() req: AuthedRequest,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
    @Body({ schema: createVehicleSchema })
    body: z.infer<typeof createVehicleSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { id, ctx } = context(req);
    // ISO dates compare as strings; todayLocal is computed in Postgres.
    if (body.stockedOn > ctx.todayLocal)
      throw new ValidationFailedException([
        {
          pointer: '/stockedOn',
          message: `Must not be after the dealership's local today (${ctx.todayLocal})`,
        },
      ]);
    const vehicle = await this.vehicles.create(id, req.userId, ctx, body);
    res.location(`/api/v1/dealerships/${id}/vehicles/${vehicle.id}`);
    return vehicle;
  }

  @Get(':vehicleId')
  @RequirePermission('vehicle:read')
  @Header('Cache-Control', 'no-store')
  @dealershipParam
  @ApiParam({ name: 'vehicleId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'The vehicle', schema: vehicleOpenApi })
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
    description:
      'Unknown or malformed dealership or vehicle, a vehicle of another dealership, or the caller is not a member',
    content: problemRef,
  })
  get(
    @Req() req: AuthedRequest,
    @Param('vehicleId') vehicleId: string,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
  ) {
    if (!UUID.test(vehicleId))
      throw new NotFoundException('Resource not found.');
    const { id, ctx } = context(req);
    return this.vehicles.get(id, ctx, vehicleId);
  }

  @Patch(':vehicleId/status')
  @RequirePermission('vehicle:change_status')
  @dealershipParam
  @ApiParam({ name: 'vehicleId', type: 'string', format: 'uuid' })
  @ApiOkResponse({
    description: 'The vehicle after the move',
    schema: vehicleOpenApi,
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
    description: 'The caller lacks vehicle:change_status',
    content: problemRef,
  })
  @ApiResponse({
    status: 404,
    description:
      'Unknown or malformed dealership or vehicle, a vehicle of another dealership, or the caller is not a member',
    content: problemRef,
  })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_TRANSITION: the move is not allowed from the current status, including the same status',
    content: problemRef,
  })
  changeStatus(
    @Req() req: AuthedRequest,
    @Param('vehicleId') vehicleId: string,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
    @Body({ schema: changeStatusSchema })
    body: z.infer<typeof changeStatusSchema>,
  ) {
    if (!UUID.test(vehicleId))
      throw new NotFoundException('Resource not found.');
    const { id, ctx } = context(req);
    return this.vehicles.changeStatus(
      id,
      req.userId,
      ctx,
      vehicleId,
      body.status,
    );
  }
}
