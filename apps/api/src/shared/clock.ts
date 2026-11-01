/**
 * Source of "now" for the whole app. Inject it instead of calling `new Date()` so tests can pin time.
 * It returns an instant only: time-zone maths stays in Postgres.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
