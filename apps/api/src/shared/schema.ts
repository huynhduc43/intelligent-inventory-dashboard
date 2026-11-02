import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Enums are text + CHECK (no Postgres enum types); values are UPPER_SNAKE. See §4.3.

export const dealership = pgTable(
  'dealership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // IANA name; checked against pg_timezone_names by the dealerships module on write (a CHECK cannot hold a subquery).
    timezone: text('timezone').notNull(),
    watchDays: smallint('watch_days').notNull().default(60),
    agingDays: smallint('aging_days').notNull().default(90),
  },
  (t) => [
    check(
      'dealership_thresholds_chk',
      sql`${t.watchDays} >= 1 AND ${t.watchDays} < ${t.agingDays} AND ${t.agingDays} <= 3650`,
    ),
  ],
);

export const appUser = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    // argon2id PHC string
    passwordHash: text('password_hash').notNull(),
    status: text('status', { enum: ['ACTIVE', 'DISABLED'] })
      .notNull()
      .default('ACTIVE'),
  },
  (t) => [
    uniqueIndex('app_user_email_lower_uq').on(sql`lower(${t.email})`),
    check('app_user_status_chk', sql`${t.status} IN ('ACTIVE','DISABLED')`),
  ],
);

export const userDealership = pgTable(
  'user_dealership',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    dealershipId: uuid('dealership_id')
      .notNull()
      .references(() => dealership.id),
    role: text('role', { enum: ['ADMIN', 'MANAGER', 'VIEWER'] }).notNull(),
  },
  (t) => [
    primaryKey({
      name: 'user_dealership_pkey',
      columns: [t.userId, t.dealershipId],
    }),
    check(
      'user_dealership_role_chk',
      sql`${t.role} IN ('ADMIN','MANAGER','VIEWER')`,
    ),
  ],
);

export const vehicle = pgTable(
  'vehicle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealershipId: uuid('dealership_id')
      .notNull()
      .references(() => dealership.id),
    vin: text('vin').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    modelYear: smallint('model_year').notNull(),
    mileage: integer('mileage').notNull(),
    // NULL = no price yet
    listPrice: numeric('list_price', { precision: 12, scale: 2 }),
    status: text('status', { enum: ['IN_STOCK', 'RESERVED', 'SOLD'] })
      .notNull()
      .default('IN_STOCK'),
    // Age source (D1): age = today_local - stocked_on, computed in SQL, never stored.
    stockedOn: date('stocked_on').notNull(),
    soldAt: timestamp('sold_at', { withTimezone: true }),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      // No $onUpdate: each update sets updatedAt from the injected Clock so tests can pin it.
      .defaultNow(),
  },
  (t) => [
    // Target of vehicle_action's composite FK, so an action cannot point at another dealership's vehicle.
    unique('vehicle_id_dealership_uq').on(t.id, t.dealershipId),
    uniqueIndex('vehicle_dealership_vin_open_uq')
      .on(t.dealershipId, t.vin)
      .where(sql`${t.status} <> 'SOLD'`),
    index('vehicle_dealership_status_stocked_idx').on(
      t.dealershipId,
      t.status,
      t.stockedOn,
    ),
    index('vehicle_dealership_make_model_idx').on(
      t.dealershipId,
      sql`lower(${t.make})`,
      sql`lower(${t.model})`,
    ),
    check('vehicle_vin_chk', sql`${t.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
    check('vehicle_mileage_chk', sql`${t.mileage} >= 0`),
    check(
      'vehicle_price_chk',
      sql`${t.listPrice} IS NULL OR ${t.listPrice} >= 0`,
    ),
    check(
      'vehicle_status_chk',
      sql`${t.status} IN ('IN_STOCK','RESERVED','SOLD')`,
    ),
    check(
      'vehicle_sold_at_chk',
      sql`(${t.status} = 'SOLD') = (${t.soldAt} IS NOT NULL)`,
    ),
  ],
);

// Append-only (D19): rows are never updated or deleted; the newest by id is the current action.
export const vehicleAction = pgTable(
  'vehicle_action',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    vehicleId: uuid('vehicle_id').notNull(),
    dealershipId: uuid('dealership_id')
      .notNull()
      .references(() => dealership.id),
    actionType: text('action_type', {
      enum: [
        'PRICE_REDUCTION_PLANNED',
        'TRANSFER',
        'AUCTION',
        'PROMOTION',
        'MONITOR',
        'OTHER',
      ],
    }).notNull(),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'vehicle_action_vehicle_dealership_fk',
      columns: [t.vehicleId, t.dealershipId],
      foreignColumns: [vehicle.id, vehicle.dealershipId],
    }),
    // DESC NULLS FIRST is plain DESC, so `ORDER BY id DESC` matches it exactly (drizzle defaults to NULLS LAST).
    index('vehicle_action_vehicle_id_idx').on(
      t.vehicleId,
      t.id.desc().nullsFirst(),
    ),
    check(
      'vehicle_action_type_chk',
      sql`${t.actionType} IN ('PRICE_REDUCTION_PLANNED','TRANSFER','AUCTION','PROMOTION','MONITOR','OTHER')`,
    ),
    check(
      'vehicle_action_note_chk',
      sql`${t.note} IS NULL OR char_length(${t.note}) <= 1000`,
    ),
  ],
);
