import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { problemContent } from '../../shared/problem.js';
import { component } from '../../shared/components.js';
import { text } from '../../shared/text.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import type { AuthedRequest } from './request-context.js';

const loginSchema = z
  .strictObject({
    email: text().min(1).max(254),
    password: text().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // shortcut: the throttler's storage is in memory, per process; use a shared store when the API runs on several instances.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('auth/login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    description: 'Access token',
    schema: component('AccessToken', {
      type: 'object',
      required: ['accessToken', 'expiresIn'],
      properties: {
        accessToken: { type: 'string' },
        expiresIn: { type: 'integer', description: 'Seconds' },
      },
    }),
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    content: problemContent(400),
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    content: problemContent(401, 'INVALID_CREDENTIALS'),
  })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts',
    content: problemContent(429),
  })
  login(@Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>) {
    return this.auth.login(body.email, body.password);
  }

  @ApiBearerAuth()
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    description: 'The caller and their dealership memberships',
    schema: component('Me', {
      type: 'object',
      required: ['user', 'memberships'],
      properties: {
        user: {
          type: 'object',
          required: ['id', 'email', 'displayName'],
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
          },
        },
        memberships: {
          type: 'array',
          items: {
            type: 'object',
            required: ['dealershipId', 'name', 'role', 'permissions'],
            properties: {
              dealershipId: { type: 'string' },
              name: { type: 'string' },
              role: { type: 'string' },
              permissions: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }),
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
    content: problemContent(401),
  })
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.userId);
  }
}
