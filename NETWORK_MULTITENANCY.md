# Network-Scoped Multi-Tenancy

This document describes the multi-tenancy change that introduces **Networks**
(one per hospital/clinic) and **network admins**. It covers the database
changes, how to apply them to Cloud SQL, the new API surface, and how each
role uses the system.

---

## 1. Why this change exists

Before this change the backend treated every user as a single global
population. Any PCP could list every other user, access every other PCP's
patients through user-management endpoints, and — critically — change any
user's role via `PATCH /users/{id}`. That was both a privacy/HIPAA concern
and a hard blocker for onboarding more than one hospital.

After this change:

- Every `User` belongs to a `Network`.
- Users only see people in their own network.
- Only **network admins** (PCPs with `is_admin=true`) can create, edit, or
  delete users — and only within their own network.
- A new public signup flow lets a hospital create its own network plus the
  first admin in one shot.

---

## 2. Database schema changes

### 2.1 New table: `networks`

| Column       | Type                      | Notes                           |
|--------------|---------------------------|---------------------------------|
| network_id   | `INT` (PK, autoincrement) |                                 |
| name         | `VARCHAR(255)` NOT NULL   | Hospital/clinic display name    |
| slug         | `VARCHAR(100)` UNIQUE NOT NULL | Lower-kebab-case, used to dedupe networks |
| created_at   | `TIMESTAMPTZ` NOT NULL    | UTC                             |

Index: `ix_networks_slug` (unique) on `slug`.

### 2.2 Modified table: `users`

Two new columns were added:

| Column       | Type                      | Notes                                         |
|--------------|---------------------------|-----------------------------------------------|
| network_id   | `INT` NOT NULL, FK → `networks.network_id` | Tenant boundary |
| is_admin     | `BOOLEAN` NOT NULL, default `FALSE`        | Only meaningful when `role='PCP'` |

Indexes added:
- `ix_users_network_id` on `network_id`
- FK constraint `fk_users_network_id` on `network_id` → `networks.network_id`

### 2.3 What the migration does to existing data (Cloud SQL)

The migration file is
[server/alembic/versions/c4d8a7e91b02_add_networks_and_user_scoping.py](server/alembic/versions/c4d8a7e91b02_add_networks_and_user_scoping.py).

When you run `alembic upgrade head` against Cloud SQL, the following happens
**atomically in one migration**:

1. `networks` table is created.
2. A single row is inserted: `('Default Network', 'default')`.
3. `network_id` column is added to `users` (nullable initially).
4. **Every existing user is backfilled** with `network_id = <default_id>`.
5. `is_admin` column is added (default `FALSE`).
6. **One existing PCP is promoted to `is_admin = TRUE`.** Which one:
   - If env var `DEFAULT_NETWORK_ADMIN_EMAIL` is set and matches an existing
     PCP, that user is promoted.
   - Otherwise the PCP with the lowest `user_id` (i.e. the first registered)
     is promoted.
7. `users.network_id` is flipped to `NOT NULL` and the FK + index are added.

The net effect on Cloud SQL: all existing users end up in "Default Network,"
exactly one of them becomes admin, and no data is lost. `patients`,
`clinical_images`, `audit_logs`, `reference_atlas`, and
`recommendation_feedback` are untouched — those tables inherit their tenant
via the PCP's `network_id`.

### 2.4 Applying the migration

Prerequisite: your `DATABASE_URL` (or the Cloud SQL Connector env vars used
by `alembic/env.py`) must point at the target database.

```bash
cd server
source venv/bin/activate

# Optional: pre-select which PCP becomes the first admin.
export DEFAULT_NETWORK_ADMIN_EMAIL="your.admin@hospital.org"

# Apply.
alembic upgrade head

# Rollback (if needed).
alembic downgrade -1
```

Downgrade fully reverses all of section 2.3 — drops the FK/index, the two
new columns, then the `networks` table.

---

## 3. API changes

### 3.1 New endpoint — self-serve network registration

**`POST /api/v1/auth/register-network`** (public, no auth required)

Creates a Network plus its first admin PCP and returns a working JWT.

Request body (JSON):
```json
{
  "network_name": "Rice General Hospital",
  "admin_email": "founder@rice-general.org",
  "admin_password": "AtLeast8Chars!",
  "admin_full_name": "Dr. Jane Founder",
  "admin_npi": "1234567890"
}
```

Constraints:
- `network_name`: 2–255 chars. Slugified automatically (e.g. `Rice General Hospital` → `rice-general-hospital`). Duplicate slugs are rejected with **409**.
- `admin_email`: simple email regex; must be unique across `users`. **409** on duplicate.
- `admin_password`: 8–128 chars. Hashed with bcrypt.
- `admin_npi`: exactly 10 digits.

Success response (**201**):
```json
{ "access_token": "eyJhbGci...", "token_type": "bearer" }
```

The returned JWT already has `network_id` and `is_admin=true` claims, so
the client can be redirected straight to the admin panel.

### 3.2 Changed behavior — user management (`/api/v1/users`)

All four endpoints still exist, but with stricter auth and strict network
scoping:

| Endpoint | Who can call | Scope |
|---|---|---|
| `GET /users` | Any PCP (`require_pcp`) | Lists only users with `network_id == caller.network_id` |
| `POST /users` | **Network admin only** (`require_network_admin`) | New user is forced into caller's network; `is_admin` cannot be set via this endpoint |
| `PATCH /users/{id}` | **Network admin only** | Target must be in caller's network (else 404); sole-admin demotion is blocked (400); admin cannot change their own role (400); granting `is_admin` to a PATIENT is blocked (400) |
| `DELETE /users/{id}` | **Network admin only** | Target must be in caller's network (else 404); cannot delete self (400); cannot delete the sole admin (400) |

Out-of-network targets return **404** (not 403) on purpose: this prevents
admins from discovering user IDs in other networks through probing.

`UserOut` now also includes `is_admin: bool` and `network_id: int` so the
frontend can render admin UI correctly.

### 3.3 JWT payload

`POST /auth/token` and `POST /auth/register-network` now include two extra
claims:

```json
{
  "sub": "42",
  "role": "PCP",
  "email": "...",
  "full_name": "...",
  "network_id": 7,
  "is_admin": true,
  "exp": 1744...
}
```

The backend still re-fetches the `User` row from the DB in
`get_current_user` and trusts that as the source of truth — the extra
claims are for the frontend only. **Do not trust JWT claims for
authorization on the server.**

### 3.4 Patient endpoints

`/api/v1/patients`, `/api/v1/patients/{id}`, and `/api/v1/patients/me` are
**unchanged**. They already filter by `primary_physician_id = caller.user_id`,
which is implicitly network-scoped (a PCP only exists in one network). No
new checks were needed.

---

## 4. Frontend changes

### 4.1 New screen: register a hospital

[client/app/register.tsx](client/app/register.tsx). A form collecting
hospital name, admin full name, email, NPI, and password. Calls
`POST /auth/register-network`, stores the returned JWT, and redirects to
`/upload`.

A "Register a new hospital" link was added to the login screen
([client/app/index.tsx](client/app/index.tsx)).

### 4.2 Admin-only gating

`useRequireRole` now accepts either a role string (legacy) or an options
object:

```ts
const authorized = useRequireRole({ role: "PCP", adminOnly: true });
```

Used in:
- [client/app/admin/users.tsx](client/app/admin/users.tsx) — Manage Users
- [client/app/admin/audit-logs.tsx](client/app/admin/audit-logs.tsx) — Audit Logs

[client/app/profile.tsx](client/app/profile.tsx) only renders the
"Administrator Controls" section when the current user is both a PCP
**and** `isAdmin === true`.

[client/hooks/use-protected-route.ts](client/hooks/use-protected-route.ts)
redirects non-admin PCPs away from any `/admin/**` route.

### 4.3 Type changes

[client/types/api.ts](client/types/api.ts):

```ts
interface UserInfo {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  networkId: number | null;    // new
  isAdmin: boolean;             // new
}

interface Network { network_id, name, slug, created_at }
interface RegisterNetworkPayload { network_name, admin_email, admin_password, admin_full_name, admin_npi }
```

Existing users in `sessionStorage` (with no `isAdmin` / `networkId`) will
need to re-log in once — the old cached `UserInfo` will not satisfy the new
shape and `isAdmin` will be `undefined` (falsy), which locks them out of
the admin UI until they authenticate again.

---

## 5. Who does what, and how

### 5.1 Existing hospital that was already using DermAtlas

After `alembic upgrade head` on Cloud SQL:

1. Your users are all in **"Default Network"**.
2. One PCP is now the network admin (either the email you passed via
   `DEFAULT_NETWORK_ADMIN_EMAIL`, or the earliest-registered PCP).
3. Log out and log back in so the new JWT has `is_admin` and `network_id`
   claims.
4. If you want to add/remove users, only the admin can — others will see
   403 on the admin panel.

### 5.2 A brand-new hospital

1. Go to the login screen → click **"Register a new hospital"**.
2. Fill in the form. You are now the admin of your network.
3. Open the Manage Users screen → create PCPs and patient accounts.
4. Every user you create is automatically in your network.

### 5.3 Promoting a second admin in your network

Currently one admin per network is the supported configuration, but the
backend allows multiple: `PATCH /users/{id}` with `{"is_admin": true}`
targeting another PCP in your network works. The only admin cannot be
demoted until a second admin is appointed — so promote first, then demote
if you want to hand off the seat.

### 5.4 Regular PCPs (non-admin)

- Still have full access to their own patients, image upload, analyze,
  feedback, audit view of their own actions, etc.
- `GET /users` works and lists everyone in their network (so they can
  locate colleagues or patient accounts by name).
- They cannot create, edit, or delete users — those endpoints return 403.

### 5.5 Patients

No user-facing change. They still log in, view their own cases at
`/my-cases`, and have no admin surface.

---

## 6. Seed data

[server/scripts/seed_test_data.py](server/scripts/seed_test_data.py) was
updated to exercise multi-tenancy in dev:

- **Rice General Hospital** (`rice-general`): Dr. Sarah Chen (admin),
  Dr. James Patel, plus patient users Alice/Bob/Carol/Eva.
- **Baylor Clinic** (`baylor-clinic`): Dr. Maria Garcia (admin),
  Dr. Robert Kim.

All passwords are `TestPass123!`.

Run:
```bash
cd server
python scripts/seed_test_data.py --dry-run   # preview
DATABASE_URL=... python scripts/seed_test_data.py  # execute
```

Seeding is idempotent via `ON CONFLICT DO NOTHING`.

---

## 7. Testing

[server/tests/integration/test_networks.py](server/tests/integration/test_networks.py)
adds 17 tests covering:

- Registration endpoint (success, duplicate name, duplicate email, usable token).
- Cross-network isolation on `GET /users`, `PATCH`, and `DELETE`.
- Non-admin PCP gets 403 on POST/PATCH/DELETE; 200 on GET.
- Sole-admin cannot self-demote, change own role, or self-delete.
- Cannot grant `is_admin` to a PATIENT.
- Admin can promote another in-network PCP.
- Newly created users inherit the admin's `network_id`.

Run the full integration suite:
```bash
cd server
source venv/bin/activate
ENV=testing pytest --no-cov tests/integration/ --ignore=tests/integration/test_analyze.py
```

(`test_analyze.py` is skipped because it makes live Vertex AI calls —
unrelated to this change.)

---

## 8. Explicit non-goals

The following are intentionally out of scope for this change:

- **Super-admin / platform-admin role.** No one can administer across
  networks today.
- **Moving a user between networks.** Would require additional audit and
  data-migration thinking.
- **Multiple admins per network as a first-class concept.** The DB allows
  it but the UI doesn't yet expose it.
- **Linking patient user accounts to patient medical records.** These remain
  separate tables — medical records are keyed off `primary_physician_id`.
- **Invitation / email flows.** Admins still set passwords directly when
  creating users.

---

## 9. Files changed

Backend:
- [server/app/models/network.py](server/app/models/network.py) (new)
- [server/app/models/user.py](server/app/models/user.py) — +network_id, +is_admin
- [server/app/models/__init__.py](server/app/models/__init__.py) — register Network
- [server/alembic/versions/c4d8a7e91b02_add_networks_and_user_scoping.py](server/alembic/versions/c4d8a7e91b02_add_networks_and_user_scoping.py) (new)
- [server/app/core/deps.py](server/app/core/deps.py) — +`require_network_admin`
- [server/app/api/api_v1/endpoints/auth.py](server/app/api/api_v1/endpoints/auth.py) — +register-network, +JWT claims
- [server/app/api/api_v1/endpoints/users.py](server/app/api/api_v1/endpoints/users.py) — scope + admin gate + sole-admin protection
- [server/scripts/seed_test_data.py](server/scripts/seed_test_data.py) — networks + admin flags
- [server/tests/conftest.py](server/tests/conftest.py) — network fixtures
- [server/tests/integration/test_networks.py](server/tests/integration/test_networks.py) (new)

Frontend:
- [client/types/api.ts](client/types/api.ts)
- [client/services/auth-service.ts](client/services/auth-service.ts) — +`registerNetwork`, JWT decoding
- [client/hooks/use-require-role.ts](client/hooks/use-require-role.ts) — adminOnly option
- [client/hooks/use-protected-route.ts](client/hooks/use-protected-route.ts) — `/admin/**` is admin-only; `/register` is public
- [client/app/register.tsx](client/app/register.tsx) (new)
- [client/app/index.tsx](client/app/index.tsx) — link to register
- [client/app/profile.tsx](client/app/profile.tsx) — hide admin menu for non-admins
- [client/app/admin/users.tsx](client/app/admin/users.tsx), [client/app/admin/audit-logs.tsx](client/app/admin/audit-logs.tsx) — admin gate
