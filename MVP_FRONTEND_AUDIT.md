# DermAtlas Frontend Audit Report
**Date:** 2026-04-02  
**Scope:** `client/` — all app routes, services, components, hooks, and state  
**Reference docs:** `docs/ENDPOINTS.md`, `docs/ENVIRONMENTS.md`, `client/derm_atlas_coding_style.md`

---

## Executive Summary

The UI is well-structured and visually polished, but several **critical security and HIPAA gaps** must be closed before an MVP demo to clinical stakeholders. The most urgent problems are the complete absence of route-level authentication guards and role-based access control, PHI leaking into URL query parameters, and a JWT role fallback that defaults to the most-privileged role. These are fixable in a focused sprint.

---

## Severity Legend

| Severity | Meaning |
|---|---|
| 🔴 CRITICAL | Demo-blocking; exploitable by any end user with a URL |
| 🟠 HIGH | Significant HIPAA / security concern or functional breakage |
| 🟡 MEDIUM | Important to address before production; acceptable for a controlled demo |
| 🔵 LOW | Polish, dead code, style violations |

---

## Checklist

### 🔴 CRITICAL

- [ ] **C-1 — No route guards in `_layout.tsx`**  
  `app/_layout.tsx` contains **zero authentication logic**. Any user who navigates directly to `/upload`, `/compare`, `/admin/users`, or `/admin/audit-logs` (e.g. by typing the URL or using browser back/forward) can access those screens without logging in. Expo Router's recommended pattern (`useSegments` + `useRootNavigationState` redirect) is entirely absent. A protected `<Stack>` or a root redirect effect keyed on `useAuthStore` token is required.

- [ ] **C-2 — Admin routes have no role guard**  
  `app/admin/users.tsx` and `app/admin/audit-logs.tsx` perform **no check** on whether the current user holds the `PCP` role. The only gating is that the navigation buttons are hidden on `profile.tsx` — but a `PATIENT` user who types `/admin/users` directly sees the full user-management UI. The API will (hopefully) return 403, but the page shell renders and shows the loading spinner first. Each admin screen must check `user?.role` on mount and redirect non-PCP users.

- [ ] **C-3 — JWT role fallback defaults to most-privileged role**  
  In `services/auth-service.ts:46`:
  ```ts
  role: ((payload.role as UserRole) ?? "PCP"),
  ```
  If the JWT contains no `role` claim, the user is silently elevated to `PCP` (which also grants access to "Administrator Controls" on the Profile screen). The fallback must be `"PATIENT"` (least-privileged) or throw a hard error requiring re-authentication.

- [ ] **C-4 — PHI transmitted via URL query parameters**  
  `upload.tsx:52` and `compare.tsx:139` pass **patient name, MRN, diagnosis labels, and image URIs** as URL search parameters:
  ```
  /compare?patientId=…&patientMrn=MRN-001&patientName=Alice+Johnson&…
  /feedback?diagnosis=Basal+cell+carcinoma&referenceImageUri=https://storage.googleapis.com/…
  ```
  These values appear in:
  - browser/device history
  - server access logs
  - analytics and crash-reporting tools
  
  Under HIPAA, names and MRNs are direct identifiers (45 CFR §164.514(b)(2)). Passing them in URLs violates the minimum-necessary and de-identification standards. Pass only opaque IDs (e.g. `queryId`, `patientId`) and look up display values on the destination screen from the store or a service call.

---

### 🟠 HIGH

- [ ] **H-1 — No automatic session timeout (HIPAA §164.312(a)(2)(iii))**  
  There is no idle timer, no token-expiry countdown, and no automatic logout after inactivity. HIPAA's Technical Safeguards require an "automatic logoff" mechanism for workstations. A configurable inactivity timer (commonly 15–30 minutes for clinical tools) that calls `clearAuth()` and redirects to `/` is required for any deployment in a clinical environment.

- [ ] **H-2 — 401 responses do not trigger re-authentication**  
  `services/http.ts:20` throws a generic `Error` on any non-OK response, including `401`. No screen catches `401` to call `clearAuth()` and redirect to login. When a JWT expires mid-session, users see a raw error banner ("Request failed (401)") rather than being sent back to the login screen. A global 401 handler in `apiFetch` should call `clearAuth()` and `router.replace("/")`.

- [ ] **H-3 — Auth state is not persisted across web refreshes**  
  `state/auth-store.ts` uses plain Zustand with **no persistence adapter**. On web, a page refresh silently destroys the token. If the user was on `/upload` and refreshes, there is no auth guard to redirect them (see C-1), so they see authenticated UI with no credentials — every API call will 401. Even without a full persistence solution, the missing guard makes this actively broken.

- [ ] **H-4 — Upload and My-Cases screens have no role guard**  
  `app/upload.tsx` has no check that `user?.role === "PCP"`. A patient navigating to `/upload` sees the full clinician upload form. Conversely, `app/my-cases.tsx` has no check that `user?.role === "PATIENT"` — a PCP navigating there would see the patient view. Each screen should redirect to the appropriate home route if the role is wrong.

---

### 🟡 MEDIUM

- [ ] **M-1 — Role display in `profile.tsx` conflates PCP with Admin**  
  `app/profile.tsx:25`:
  ```ts
  const displayRole = user?.role === "PCP" ? "PCP, Admin" : user?.role ?? "—";
  ```
  All PCPs are labeled "PCP, Admin" in the profile card. This is inaccurate if not all PCPs are intended to be system administrators. It also leaks the internal privilege model to users. Either introduce a distinct `ADMIN` role or display it as "PCP" and separately indicate admin access where relevant.

- [ ] **M-2 — Patient list fetched entirely to client in `PatientSelector`**  
  `components/patient-selector.tsx` calls `getPatients()` which retrieves **all patients** from the API (including name, MRN, DOB, gender) into client memory, then filters locally. For a small MVP demo this is fine, but it violates HIPAA's minimum-necessary principle: a clinician looking to attach one patient record receives every patient's PHI. The endpoint should accept a search query parameter so only matching results are returned.

- [ ] **M-3 — GCS image URIs are passed and loaded directly without signed-URL validation**  
  `gcs_uri` values from the API are passed directly to `<Image source={{ uri: gcs_uri }} />`. If these are publicly accessible GCS URLs (not signed), they can be shared, bookmarked, and accessed indefinitely by anyone with the link — bypassing any access control. The backend should return short-lived signed URLs, or images should be proxied through the authenticated API.

- [ ] **M-4 — `showMobileActions` builds an unused `options` array**  
  `app/admin/users.tsx:106–110`:
  ```ts
  const options: string[] = ["Edit"];
  if (user.is_active) options.push("Deactivate");
  options.push("Cancel");
  // `options` is never referenced below — Alert.alert is hardcoded
  ```
  Dead code that will cause a lint warning. Remove the `options` variable.

- [ ] **M-5 — Error status detection via string-matching in `audit-service.ts`**  
  `services/audit-service.ts:208–213` checks `message.includes("401")` and `message.includes("403")` to detect HTTP statuses. This is fragile: it depends on the exact error string format from `http.ts` ("Request failed (401)"). A dedicated error type or numeric status code on the thrown error is cleaner and more reliable.

- [ ] **M-6 — `use-image-capture.web.ts` leaks object URLs**  
  `hooks/use-image-capture.web.ts:13,22` calls `URL.createObjectURL(file)` and never calls `URL.revokeObjectURL`. Each time the user picks an image on web, a blob URL is retained in memory for the lifetime of the page. Long clinical sessions with multiple image selections will accumulate leaks.

---

### 🔵 LOW / Style

- [ ] **L-1 — "Forgot Password?" button is a no-op**  
  `app/index.tsx:158`:
  ```tsx
  <Pressable onPress={() => {}} style={styles.forgotWrap}>
  ```
  Visible, tappable UI element that does nothing. Either implement a password-reset flow or remove the button before the demo to avoid confusion and questions.

- [ ] **L-2 — Thumb-vote buttons on Compare screen are no-ops**  
  `app/compare.tsx:201–211` renders thumb-up/thumb-down buttons inside each `MatchCard` with `onPress={() => {}}`. These look interactive but silently do nothing. The real feedback is on the `/feedback` route. These stub buttons should be removed or wired up.

- [ ] **L-3 — `CaseCard` `Pressable` has no `onPress`**  
  `app/my-cases.tsx:171`:
  ```tsx
  <Pressable style={...}>
  ```
  The pressable renders with a visual press-state but no handler. Patients see a list of cases with no way to interact with them. Either add navigation to a case-detail screen or render a `View` instead of `Pressable` to avoid false affordance.

- [ ] **L-4 — `app/modal.tsx` is an unimplemented scaffold**  
  The file contains the default Expo "This is a modal" boilerplate. It is registered as a route and accessible. It should be removed from the router or replaced with a real implementation.

- [ ] **L-5 — Route files contain large sub-components (style guide §4, §14.3)**  
  Per `derm_atlas_coding_style.md` §4, route files should "orchestrate components/hooks, not contain heavy business logic." Currently:
  - `app/compare.tsx` defines `MatchCard`, `SimilarityBar`, `SimilarityBadge` inline.
  - `app/profile.tsx` defines `MenuRow` and `SectionHeader` inline.
  
  These should be extracted to `components/` before the codebase grows further.

- [ ] **L-6 — `constants/demo-images.ts` not listed in documented directory structure**  
  The coding style guide's directory structure (§3) lists only `theme.ts` under `constants/`. `demo-images.ts` is an undocumented addition. Not a functional issue, but worth noting in the style guide for consistency.

- [ ] **L-7 — `auth-service.ts` mock mode uses email heuristic for role assignment**  
  `services/auth-service.ts:21`:
  ```ts
  const mockRole: UserRole = email.toLowerCase().includes("patient") ? "PATIENT" : "PCP";
  ```
  This works for demos but is easy to forget. The mock token string `"mock-token"` is also treated as valid by any part of the app that reads the token — ensure nothing is checking token format in places that would fail with a mock.

---

## Summary Table

| ID | File(s) | Description | Severity |
|---|---|---|---|
| C-1 | `app/_layout.tsx` | No auth guard — all routes accessible without login | 🔴 CRITICAL |
| C-2 | `app/admin/users.tsx`, `app/admin/audit-logs.tsx` | Admin routes have no role check | 🔴 CRITICAL |
| C-3 | `services/auth-service.ts:46` | JWT role defaults to `"PCP"` (most-privileged) | 🔴 CRITICAL |
| C-4 | `app/upload.tsx:52`, `app/compare.tsx:139` | PHI (name, MRN, diagnosis) in URL query params | 🔴 CRITICAL |
| H-1 | `state/auth-store.ts` | No automatic session timeout / idle logout | 🟠 HIGH |
| H-2 | `services/http.ts:20` | 401 responses do not trigger re-login | 🟠 HIGH |
| H-3 | `state/auth-store.ts` | Auth state lost on web page refresh, no guard catches it | 🟠 HIGH |
| H-4 | `app/upload.tsx`, `app/my-cases.tsx` | No role guard on role-specific screens | 🟠 HIGH |
| M-1 | `app/profile.tsx:25` | All PCPs display as "PCP, Admin" incorrectly | 🟡 MEDIUM |
| M-2 | `components/patient-selector.tsx` | All patients' PHI fetched to client; no server-side search | 🟡 MEDIUM |
| M-3 | `services/patient-service.ts`, `app/my-cases.tsx` | GCS URIs loaded directly without signed-URL access control | 🟡 MEDIUM |
| M-4 | `app/admin/users.tsx:106` | Dead `options` array never used | 🟡 MEDIUM |
| M-5 | `services/audit-service.ts:208` | HTTP status detected via fragile string-matching | 🟡 MEDIUM |
| M-6 | `hooks/use-image-capture.web.ts:13,22` | `URL.createObjectURL` never revoked — memory leak | 🟡 MEDIUM |
| L-1 | `app/index.tsx:158` | "Forgot Password?" is a no-op button | 🔵 LOW |
| L-2 | `app/compare.tsx:201–211` | Thumb-vote buttons are no-ops | 🔵 LOW |
| L-3 | `app/my-cases.tsx:171` | `CaseCard` `Pressable` has no `onPress` | 🔵 LOW |
| L-4 | `app/modal.tsx` | Unimplemented scaffold route still present | 🔵 LOW |
| L-5 | `app/compare.tsx`, `app/profile.tsx` | Large sub-components defined inside route files | 🔵 LOW |
| L-6 | `constants/demo-images.ts` | Not documented in coding style directory structure | 🔵 LOW |
| L-7 | `services/auth-service.ts:21` | Mock mode derives role from email heuristic | 🔵 LOW |

---

## MVP Demo Priority

To be safe for a **controlled clinical demo** (internal, to authorized stakeholders), the absolute minimum fixes are:

1. **C-1** — Add an auth guard so unauthenticated URL access redirects to login.
2. **C-2** — Add role checks to admin routes (redirect PATIENT users away).
3. **C-3** — Change JWT role fallback from `"PCP"` to `"PATIENT"`.
4. **C-4** — Strip PHI from URL parameters (pass only IDs; resolve display values on destination screen).
5. **H-4** — Add role guards to `/upload` and `/my-cases`.
6. **L-1, L-2, L-3** — Remove non-functional interactive elements before demo to avoid questions.

Issues H-1 through H-3 and M-1 through M-6 should be addressed before any demo that involves real patient data or clinical staff outside a controlled setting.
