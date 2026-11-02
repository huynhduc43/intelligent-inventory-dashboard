import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { asc, eq, sql } from 'drizzle-orm';
import { Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config.js';
import { CodedHttpException } from '../../shared/problem.js';
import { DB, type Db } from '../../shared/db.js';
import { appUser, dealership, userDealership } from '../../shared/schema.js';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import { permissionsFor } from './domain/permissions.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async login(email: string, password: string) {
    const [user] = await this.db
      .select()
      .from(appUser)
      .where(sql`lower(${appUser.email}) = lower(${email})`);
    // Unknown and disabled users verify against a dummy hash, so all failures cost the same.
    const ok =
      user?.status === 'ACTIVE'
        ? await this.passwords.verify(password, user.passwordHash)
        : await this.passwords.verifyDummy(password);
    if (!user || !ok) {
      throw new CodedHttpException(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const expiresIn = this.config.JWT_TTL_S;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, iat, exp: iat + expiresIn },
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    );
    return { accessToken, expiresIn };
  }

  async me(userId: string) {
    const [user] = await this.db
      .select()
      .from(appUser)
      .where(eq(appUser.id, userId));
    if (user?.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication is required.');
    }
    const rows = await this.db
      .select({
        dealershipId: dealership.id,
        name: dealership.name,
        role: userDealership.role,
      })
      .from(userDealership)
      .innerJoin(dealership, eq(dealership.id, userDealership.dealershipId))
      .where(eq(userDealership.userId, userId))
      .orderBy(asc(dealership.name), asc(dealership.id));
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      memberships: rows.map((r) => ({
        ...r,
        permissions: permissionsFor(r.role),
      })),
    };
  }
}
