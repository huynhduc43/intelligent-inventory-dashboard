import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Clock } from '../../shared/clock.js';
import { IS_PUBLIC, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import type { AuthedRequest } from './request-context.js';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/** Global, fail-closed (ADR 0008). jsonwebtoken's messages are never forwarded. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    try {
      if (!token) throw new Error('no token');
      const payload = this.jwt.verify<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      if (typeof payload.sub !== 'string') throw new Error('no sub');
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Authentication is required.');
    }
  }
}
