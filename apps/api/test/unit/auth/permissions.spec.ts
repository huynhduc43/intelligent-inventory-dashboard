import {
  PERMISSIONS,
  permissionsFor,
  type Role,
} from '../../../src/modules/auth/domain/permissions.js';

const READ = PERMISSIONS.slice(0, 4);
const EXPECTED: Record<Role, readonly string[]> = {
  ADMIN: [...PERMISSIONS],
  MANAGER: PERMISSIONS.filter((p) => p !== 'settings:update'),
  VIEWER: READ,
};

describe('permissionsFor', () => {
  it('lists the eight permissions in the documented order', () => {
    expect(PERMISSIONS).toEqual([
      'vehicle:read',
      'dashboard:read',
      'vehicle_action:read',
      'settings:read',
      'vehicle:create',
      'vehicle:change_status',
      'vehicle_action:create',
      'settings:update',
    ]);
  });

  it.each(['ADMIN', 'MANAGER', 'VIEWER'] as const)(
    '%s matches §4.6',
    (role) => {
      expect(permissionsFor(role)).toEqual(EXPECTED[role]);
    },
  );

  it('is frozen', () => {
    expect(Object.isFrozen(permissionsFor('ADMIN'))).toBe(true);
    expect(Object.isFrozen(permissionsFor('MANAGER'))).toBe(true);
    expect(Object.isFrozen(permissionsFor('VIEWER'))).toBe(true);
  });
});
