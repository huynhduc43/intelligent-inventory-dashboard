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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import type { AuthedRequest } from './request-context.js';

const loginSchema = z.strictObject({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

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
  login(@Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>) {
    return this.auth.login(body.email, body.password);
  }

  @ApiBearerAuth()
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.userId);
  }
}
