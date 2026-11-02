import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
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
  ApiResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { problemRef } from '../../shared/problem.js';
import { noQuery } from '../../shared/query.js';
import { text } from '../../shared/text.js';
import { UUID } from '../auth/dealership.guard.js';
import { RequirePermission } from '../auth/decorators.js';
import type { AuthedRequest } from '../auth/request-context.js';
import { ACTION_TYPES, ActionsService } from './actions.service.js';

const createActionSchema = z.strictObject({
  actionType: z.enum(ACTION_TYPES),
  note: text().trim().max(1000).nullish(),
});

const actionOpenApi: SchemaObject = {
  type: 'object',
  required: ['id', 'actionType', 'note', 'createdBy', 'createdAt'],
  properties: {
    id: { type: 'integer' },
    actionType: { type: 'string', enum: [...ACTION_TYPES] },
    note: { type: 'string', nullable: true },
    createdBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const pathParams = applyDecorators(
  ApiParam({ name: 'dealershipId', type: 'string', format: 'uuid' }),
  ApiParam({ name: 'vehicleId', type: 'string', format: 'uuid' }),
);
const notFound = ApiResponse({
  status: 404,
  description:
    'Unknown or malformed dealership or vehicle, a vehicle of another dealership, or the caller is not a member',
  content: problemRef,
});
const unauthenticated = ApiResponse({
  status: 401,
  description: 'Unauthenticated',
  content: problemRef,
});

const dealershipId = (req: AuthedRequest) => {
  if (!req.dealershipId) throw new Error('DealershipGuard did not run');
  return req.dealershipId;
};

@ApiTags('actions')
@ApiBearerAuth()
@Controller('dealerships/:dealershipId/vehicles/:vehicleId/actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post()
  @RequirePermission('vehicle_action:create')
  @pathParams
  @ApiCreatedResponse({
    description: 'The logged action; Location names it',
    schema: actionOpenApi,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (body or query parameters)',
    content: problemRef,
  })
  @unauthenticated
  @ApiResponse({
    status: 403,
    description: 'The caller lacks vehicle_action:create',
    content: problemRef,
  })
  @notFound
  @ApiResponse({
    status: 409,
    description: 'VEHICLE_NOT_IN_STOCK: the vehicle is RESERVED or SOLD',
    content: problemRef,
  })
  async create(
    @Req() req: AuthedRequest,
    @Param('vehicleId') vehicleId: string,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
    @Body({ schema: createActionSchema })
    body: z.infer<typeof createActionSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!UUID.test(vehicleId))
      throw new NotFoundException('Resource not found.');
    const d = dealershipId(req);
    const action = await this.actions.log(d, req.userId, vehicleId, body);
    // No GET for one action yet (issue #11, Decision 6); Location still names the resource.
    res.location(
      `/api/v1/dealerships/${d}/vehicles/${vehicleId}/actions/${String(action.id)}`,
    );
    return action;
  }

  @Get()
  @RequirePermission('vehicle_action:read')
  @Header('Cache-Control', 'no-store')
  @pathParams
  @ApiOkResponse({
    description: 'Every action of the vehicle, newest first',
    schema: {
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array', items: actionOpenApi } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (the route takes no query parameters)',
    content: problemRef,
  })
  @unauthenticated
  @notFound
  list(
    @Req() req: AuthedRequest,
    @Param('vehicleId') vehicleId: string,
    @Query({ schema: noQuery }) _query: z.infer<typeof noQuery>,
  ) {
    if (!UUID.test(vehicleId))
      throw new NotFoundException('Resource not found.');
    return this.actions.list(dealershipId(req), vehicleId);
  }
}
