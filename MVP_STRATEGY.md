# DermAtlas MVP Gap Analysis & Strategy

> Generated 2026-03-31 after full codebase audit of `client/`.
> Scope: React Native / Expo frontend only. Backend endpoints assumed functional where services already call them.

---

## Part 1: What Actually Works (Baseline)

Before listing gaps, here is what is end-to-end functional with the real API today:

| Flow | Status |
|------|--------|
| Login with username/password → JWT stored in Zustand | ✓ Working |
| Camera permission + `launchCameraAsync` → image preview | ✓ Working (native only — see §2.1) |
| Photo library picker → image preview | ✓ Working |
| Blob conversion + multipart POST /upload/image | ✓ Working |
| POST /lesion/analyze → similarity match grid | ✓ Working |
| Click match card → feedback screen with comparison modal | ✓ Working |
| Synchronized pan/zoom comparison modal | ✓ Working |
| Feedback vote (helpful/not helpful) → POST /feedback | ✓ Working |
| Logout → clears auth store → back to login | ✓ Working |
| Profile page loads user info from store | ✓ Working (display only) |

**Core clinical workflow is functional.** Everything else described below is broken, stubbed, or missing.

---

## Part 2: Blockers to MVP Status

### 2.1 Camera Doesn't Work on Web

**Problem:** `expo-image-picker`'s `launchCameraAsync` on web does not open a live camera view — it falls back silently to the file picker or does nothing, depending on the browser. The app targets web as a delivery platform (app.json: `"output": "static"`), so PCPs using a browser can never use the camera button.

**Root cause:** `pickFromCamera` in `upload.tsx:34–47` calls `ImagePicker.launchCameraAsync` without a platform guard. Web camera capture requires either `<input capture="environment">` HTML or the `MediaDevices.getUserMedia` API — neither of which expo-image-picker wires up on web automatically.

**Fix strategy:**
- Add a web-specific implementation using `<input type="file" accept="image/*" capture="environment" />` wrapped in a hidden ref — trigger it programmatically on the Camera button press.
- Gate with `Platform.OS === 'web'` to keep native path intact.
- File: `upload.tsx` or extract a `hooks/use-image-capture.ts` that returns the right handler per platform.

---

### 2.2 No PCP Patient List / Patient Dropdown

**Problem:** The upload screen has a free-text numeric "Patient ID" field. There is no way to browse or select a patient from the PCP's care list. The `patient-service.ts` file is defined (`getPatient`) but is **never imported or called anywhere in the app.**

**Root cause:** The patient management layer was never connected to the UI.

**Additional bug in existing code:** `parseInt(patientId) || 0` in `upload.tsx:73` sends `0` to the backend when the field is blank. This is a silent data integrity issue — uploads get orphaned to patient 0.

**Fix strategy:**
- Add a `GET /patients` (list) endpoint call or use repeated `getPatient` calls with known IDs (backend-dependent).
- Build a patient selector: either a `SearchableDropdown` component triggered by the Patient ID field (autocomplete) or a dedicated `/patients` route listing the PCP's patients.
- Wire the selected patient's `patient_id` (integer) directly into the upload call, removing the free-text field.
- Validate that patientId is non-empty before enabling the Submit button.

---

### 2.3 All Profile Page Actions Are No-Ops

**Problem:** All three action rows in `profile.tsx` call `Alert.alert("...not yet available in this version.")`. There is no navigation, no API call, and no UI flow behind any of them.

| Button | Handler | Real behavior |
|--------|---------|---------------|
| Change Password | `handleChangePassword` | Alert only |
| Manage Users | `handleManageUsers` | Alert only |
| View Audit Logs | `handleAuditLogs` | Alert only |

**Fix strategy per item:**
- **Change Password:** Navigate to a new `app/change-password.tsx` screen with current password + new password fields → `PATCH /auth/password` or similar.
- **Manage Users:** Navigate to `app/admin/users.tsx` — a list of users with Add/Edit/Deactivate actions. Requires a `GET /users` + `POST /users` + `DELETE /users/{id}` API surface. If the backend doesn't expose this yet, stub a read-only list first.
- **View Audit Logs:** Navigate to `app/admin/audit-logs.tsx` — paginated list from `GET /audit-logs`. If backend doesn't expose this, defer but remove the menu row rather than leave a dead tap target.

---

### 2.4 No User Selector / Role Switching

**Problem:** The login page accepts any username/password but there is no dropdown to select from known users. In a demo or multi-user context, every session requires typing credentials from scratch. More critically, `auth-service.ts:41` hardcodes the role as `"PCP"` for all real API logins regardless of what the backend returns — there is no patient role path.

```ts
// auth-service.ts line ~41 (real API path)
const user: UserInfo = {
  userId: ...,
  email: ...,
  fullName: ...,
  role: "PCP",  // ← hardcoded; backend role ignored
};
```

**Fix strategy:**
- Add a "Quick Login" or "Select User" dropdown on the login screen populated from a hardcoded list of demo accounts (or fetched from `GET /users`). This is valuable for demos and testing.
- Fix `auth-service.ts` to read the role from the API response (requires the backend to return it in the token response or a `/auth/me` endpoint).
- Implement the `PATIENT` role path: the `UserRole` type already defines it, but no UI differentiation exists.

---

### 2.5 Auth State Is Not Persisted

**Problem:** `state/auth-store.ts` uses a plain Zustand store with no persistence. Reloading the web app or backgrounding the native app clears the token and redirects to login.

**Fix strategy:**
- Add `zustand/middleware` `persist` with `AsyncStorage` (native) and `localStorage` (web) as the storage adapter.
- Wrap the `auth-store` with `persist(...)` — this is a 5-line change.
- On app startup (`_layout.tsx`), check for a persisted token before rendering routes, and validate it against the backend (or just accept it optimistically).

---

### 2.6 Patient ID Shown as "______" on Compare Screen

**Problem:** `compare.tsx` hardcodes the patient ID display as the string `"______"`. The patient ID is passed as a query parameter (it's in the URL) but it is never read or displayed. A clinician looking at the results has no confirmation of which patient they're analyzing.

**Fix strategy:**
- Pass `patientId` as a query param when navigating from `upload.tsx` to `/compare`.
- Read it from `useLocalSearchParams()` in `compare.tsx` and display it in the header strip.

---

### 2.7 Quick-Vote Buttons on Compare Cards Are Stubbed

**Problem:** The thumbs-up / thumbs-down buttons on each match card in `compare.tsx` have `onPress={() => {}}`. These look interactive but do nothing.

**Options:**
- Wire them to `submitFeedback()` (the same service `feedback.tsx` uses) — makes the quick-vote path functional without navigating away.
- Or remove the buttons entirely from the card if deep-linking to `feedback.tsx` is the intended primary path.
- Do not leave silent no-op buttons in a clinical tool.

---

### 2.8 Lesion Location Hardcoded as "unspecified"

**Problem:** `upload.tsx:73` calls `uploadImage(blob, parseInt(patientId) || 0, "unspecified")`. The `lesion_location` field is permanently hardcoded. This is a clinically relevant data field.

**Fix strategy:**
- Add a location picker to the upload form — a segmented control or dropdown with anatomical regions (face, trunk, limb, etc.).
- Pass the selected value to `uploadImage`.

---

### 2.9 No Case / Visit History

**Problem:** There is no screen to view a patient's previous submissions. Each session starts at the upload screen with no historical context. The `PatientResponse` type includes a `clinical_images: ClinicalImageSummary[]` array, which implies the backend can return past cases — but nothing in the UI retrieves or displays it.

**Fix strategy:**
- On the patient selection screen (§2.2), after a patient is selected, fetch `getPatient(id)` and show their past cases below the new-upload form.
- Or navigate to a patient detail screen `/patients/[id]` that lists prior images + diagnoses with timestamps.

---

### 2.10 No Navigation Guard / Protected Routes

**Problem:** There is no route protection. Navigating directly to `/upload`, `/compare`, or `/profile` without being logged in will crash or render broken UI (user is null, no token).

**Fix strategy:**
- In `_layout.tsx`, check `useAuthStore` for a token. If absent, redirect to `/` (login).
- This is a single `useEffect` or conditional render in the layout.

---

## Part 3: Secondary Issues (Below MVP Threshold)

These won't block an MVP demo but would be embarrassing or confusing in front of stakeholders.

| Issue | Location | Notes |
|-------|----------|-------|
| `modal.tsx` is a leftover Expo template stub | `app/modal.tsx` | Not linked anywhere; delete or repurpose |
| `hello-wave.tsx` and `parallax-scroll-view.tsx` unused | `components/` | Template artifacts; no harm but dead weight |
| Forgot password button is a silent no-op | `index.tsx:158` | Either implement or remove the link |
| Camera button shows on web with no functional fallback | `upload.tsx` | See §2.1 |
| `USE_MOCK` toggle requires code change | `services/config.ts` | Not ergonomic for demo switching; add env var or settings UI |
| No error boundary | `app/_layout.tsx` | A single thrown error crashes the entire app with a white screen |
| Role always "PCP" even for non-PCP logins | `auth-service.ts` | Backend role ignored |
| No image size/quality validation before upload | `upload.tsx` | Large or blurry images succeed silently |
| `patient_id: 0` sent when field is empty | `upload.tsx:73` | Silent data integrity issue |
| No loading state on compare screen if `queryId` missing | `compare.tsx` | Would crash if navigated to directly |

---

## Part 4: Strategy of Attack (Prioritized)

### Phase 1 — Demo Stability (Before Any External Demo)
These are the minimum fixes to avoid embarrassing moments or broken-looking flows.

1. **Fix patient ID display on compare screen** — read and show the patient ID from URL params.
2. **Guard protected routes** — redirect to login if no token.
3. **Remove or fix the quick-vote stubs on compare cards** — either wire to API or hide.
4. **Fix patient_id defaulting to 0** — require the field or validate before submit.
5. **Persist auth state** — use Zustand `persist` so refresh doesn't log users out.

### Phase 2 — Core Missing Features (MVP)
These are the features the user explicitly called out as missing.

6. **Patient dropdown / selector on upload screen** — wire `patient-service.getPatient` or a list endpoint; replace free-text input.
7. **Camera on web** — add `Platform.OS === 'web'` branch using `<input capture="environment" />`.
8. **Lesion location picker** — add anatomical region selector to the upload form.
9. **User dropdown on login** — quick-select from known demo accounts or fix role from API response.
10. **Patient history** — after patient selection, show prior cases from `clinical_images[]`.

### Phase 3 — Profile Page Functionality
These make the profile page not an embarrassment.

11. **Change Password** — new screen + API call.
12. **Manage Users** — at minimum a read-only list; CRUD if API supports it.
13. **Audit Logs** — read-only paginated list; defer if backend doesn't expose it yet (but remove the menu row).

### Phase 4 — Quality & Robustness (Post-MVP)
14. Error boundary in `_layout.tsx`.
15. Delete template artifacts (`modal.tsx`, `hello-wave.tsx`, `parallax-scroll-view.tsx`).
16. Implement forgot-password flow or remove the link.
17. Image size/format validation before upload.
18. Token expiry detection and automatic re-login prompt.

---

## Part 5: File Change Map

| Feature | Files to touch |
|---------|----------------|
| Camera on web (§2.1) | `app/upload.tsx` or new `hooks/use-image-capture.ts` |
| Patient dropdown (§2.2) | `services/patient-service.ts` (add list fn), new `components/patient-selector.tsx`, `app/upload.tsx` |
| Profile actions (§2.3) | `app/profile.tsx`, new `app/change-password.tsx`, new `app/admin/users.tsx`, new `app/admin/audit-logs.tsx` |
| User selector / role fix (§2.4) | `app/index.tsx`, `services/auth-service.ts` |
| Auth persistence (§2.5) | `state/auth-store.ts` |
| Patient ID on compare (§2.6) | `app/upload.tsx` (pass param), `app/compare.tsx` (read param) |
| Quick-vote stubs (§2.7) | `app/compare.tsx` |
| Lesion location picker (§2.8) | `app/upload.tsx`, `services/upload-service.ts` (already accepts param) |
| Case history (§2.9) | `services/patient-service.ts`, `app/upload.tsx` or new `app/patients/[id].tsx` |
| Route protection (§2.10) | `app/_layout.tsx` |
