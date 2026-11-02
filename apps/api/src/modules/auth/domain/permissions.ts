export const PERMISSIONS = [
  'vehicle:read',
  'dashboard:read',
  'vehicle_action:read',
  'settings:read',
  'vehicle:create',
  'vehicle:change_status',
  'vehicle_action:create',
  'settings:update',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'ADMIN' | 'MANAGER' | 'VIEWER';

const READ = PERMISSIONS.slice(0, 4);
const WRITE = PERMISSIONS.slice(4, 7);

/** Role -> permissions (§4.6). Guards check permissions, never role names. */
const MAP: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  ADMIN: Object.freeze([...PERMISSIONS]),
  MANAGER: Object.freeze([...READ, ...WRITE]),
  VIEWER: Object.freeze([...READ]),
});

export function permissionsFor(role: Role): readonly Permission[] {
  return MAP[role];
}
