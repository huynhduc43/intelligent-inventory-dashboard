# Intelligent Inventory Dashboard

The backend that shows each dealership how long its vehicles have been in stock and what is being done about the aging ones.

## Access

**Dealership**:
One car lot with its own stock, time zone and aging thresholds. Every other record belongs to exactly one.
_Avoid_: Tenant, store, branch

**User**:
A person who logs in with an email and password. A user exists independently of any dealership.
_Avoid_: Account, member

**Membership**:
A user's access to one dealership, with exactly one role there. A user with no membership in a dealership cannot tell that it exists.
_Avoid_: Assignment, access grant

**Role**:
The named bundle of permissions a membership carries: Admin, Manager or Viewer. Roles differ per dealership for the same user.
_Avoid_: Group, user type

**Permission**:
One thing a member may do in a dealership, such as reading vehicles or logging an action. Access is decided by permission, never by role name.
_Avoid_: Right, scope, privilege

**Disabled user**:
A user who can no longer log in or use any dealership, while their history stays attributed to them.
_Avoid_: Deleted user, inactive user
