import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { HealthPassthroughFilter } from '../../shared/problem-details.filter.js';
import { DatabaseHealthIndicator } from './database.health.js';

@Controller('health')
@UseFilters(HealthPassthroughFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  // Liveness never touches the DB: a DB outage must not get the process restarted.
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.ping()]);
  }
}
