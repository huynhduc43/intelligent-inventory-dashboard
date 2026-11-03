# Intelligent Inventory Dashboard

The backend that shows each dealership how long its vehicles have been in stock and what is being done about the aging ones.

## Access

**Dealership**:
One car lot with its own stock, time zone and aging thresholds. Every other record belongs to exactly one.
_Avoid_: Tenant, store, branch

**Settings**:
A dealership's time zone and its two aging thresholds, watch and aging days. Any member can read them; only an Admin changes them, and a change applies from the next request.
_Avoid_: Preferences, configuration

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

## Inventory

**VIN**:
The 17-character vehicle identification number, in capitals, never containing I, O or Q. It never changes once a vehicle is added. Within a dealership, at most one unsold vehicle carries a given VIN.
_Avoid_: Serial number, chassis number

**Re-acquired vehicle**:
A car the dealership sold and later took back into stock. It becomes a new vehicle with the same VIN, a new stocked-on date and an empty action history; the sold one stays as it was.
_Avoid_: Returned vehicle, restocked vehicle

**Stocked on**:
The date a vehicle arrived in this dealership's stock. A re-acquired car gets a new vehicle with a new stocked-on date.
_Avoid_: Created date, arrival time

**Vehicle status**:
Where a vehicle is in its life at the dealership: in stock, reserved or sold. A vehicle starts in stock, moves between in stock and reserved, and either can become sold. Sold is final. Asking for the status a vehicle already has is refused.
_Avoid_: State, stage, tier

**In stock**:
On the lot and for sale. Only an in-stock vehicle can have actions logged, and only in-stock vehicles are counted on the dashboard.
_Avoid_: Available, active

**Reserved**:
Held for a buyer and off the market, but not yet sold. It can go back to in stock or be sold.
_Avoid_: On hold, pending

**Sold**:
The final status. The sale time is recorded, days in stock stop at its local date, and the VIN is free for a re-acquired vehicle.
_Avoid_: Closed, archived

**Days in stock**:
Today's date in the dealership's time zone minus the stocked-on date, in whole calendar days. For a sold vehicle it stops at the local date of the sale. Derived on every read, never stored.
_Avoid_: Age in hours, vehicle age

**Tier**:
Fresh, Watch or Aging, derived from days in stock and the dealership's thresholds.
_Avoid_: Flag, aging status

**Action**:
A step a manager records for an in-stock vehicle: a planned price reduction, a transfer, an auction, a promotion, monitoring or something else, with an optional note. Once logged it is never changed or removed.
_Avoid_: Task, event, status

**Action history**:
Every action logged on one vehicle, newest first. Anyone who can see the vehicle can read it, notes included.
_Avoid_: Audit log, timeline

**Current action**:
The most recently logged action on a vehicle, or none if no action was ever logged.
_Avoid_: Latest status, active action

## Dashboard

**Age bucket**:
One of four fixed ranges of days in stock: 0–30, 31–60, 61–90 and over 90. Buckets do not move when a dealership changes its thresholds.
_Avoid_: Age band, tier

**Aging without action**:
An in-stock vehicle in the Aging tier that has never had an action logged. Monitoring counts as an action.
_Avoid_: Neglected vehicle, unactioned stock

**KPI population**:
The vehicles the dashboard counts: in-stock only. Reserved and sold vehicles are left out.
_Avoid_: Inventory, all vehicles
