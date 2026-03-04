# React Native + Web Hybrid (Expo) Coding Style & Project Structure

This guide defines a **consistent, predictable** coding style for the DermAtlas `client/` app using Expo for **iOS, Android, and Web**.

---

## 1. Core Principles

1. **Single Expo codebase**
   - One app must run on iOS, Android, and Web.
   - Use platform-specific files only when necessary (`.ios`, `.android`, `.web`).

2. **Thin routing, reusable UI**
   - Keep `app/` route files focused on routing/screen composition.
   - Move reusable UI into `components/` and `components/ui/`.

3. **Separation of concerns**
   - UI components should not contain backend/network logic.
   - Hooks hold reusable logic.
   - Services (when added) handle API/storage access.

4. **Predictable file placement**
   - Do not create ad-hoc top-level folders.
   - Follow the directory rules below so AI-generated code lands in expected places.

5. **TypeScript-first**
   - Use TypeScript for all new app code.
   - Avoid `any`; if needed, add a short justification comment.

---

## 2. Technology Stack (Current)

- Expo (managed workflow)
- React Native
- React Native Web
- Expo Router
- TypeScript
- ESLint

Optional additions (only if introduced intentionally):
- TanStack Query
- Zustand
- React Hook Form
- Zod

---

## 3. Project Directory Structure (Current + Allowed)

Use this structure under `client/`:

```text
client/
├── app/                      # Expo Router routes/screens
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── upload.tsx
│   ├── compare.tsx
│   ├── feedback.tsx
│   ├── profile.tsx
│   └── modal.tsx
├── assets/
│   └── images/
├── components/               # Shared components
│   ├── ui/                   # Low-level UI primitives
│   └── *.tsx
├── constants/
│   └── theme.ts              # Theme tokens/constants
├── hooks/                    # Shared hooks
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
├── scripts/
├── types/                    # (Add as needed) shared TS types
├── services/                 # (Add as needed) API/storage logic
├── state/                    # (Add as needed) global state stores
└── utils/                    # (Add as needed) pure helpers
```

Rules:
- Keep existing top-level structure intact.
- New shared code should go into `components`, `hooks`, `services`, `state`, `types`, or `utils`.
- Do **not** introduce `src/` for this project.

---

## 4. Routing Conventions (Expo Router)

`app/` files define route paths. Keep them small.

- Route filenames: lowercase or kebab-case based on URL intent.
- `_layout.tsx` manages shared navigation/layout.
- Route modules should orchestrate components/hooks, not contain heavy business logic.

Example:
```tsx
import UploadScreen from "@/components/upload-screen"

export default function UploadRoute() {
  return <UploadScreen />
}
```

---

## 5. Component Layers

### A) `components/ui/` (primitive UI)
Reusable, feature-agnostic building blocks.

Examples:
- `icon-symbol.tsx`
- `collapsible.tsx`

### B) `components/` (shared composed components)
Reusable components composed from UI primitives.

Examples:
- `parallax-scroll-view.tsx`
- `themed-text.tsx`
- `themed-view.tsx`

### C) Route-local UI
If only one route uses it, keep it close to that route until reuse appears.

---

## 6. Naming Conventions

Match current repository style:

- **Files:** kebab-case for most files (`parallax-scroll-view.tsx`, `use-theme-color.ts`)
- **React component names:** PascalCase exports (`ParallaxScrollView`)
- **Hooks:** must start with `use` (`use-theme-color.ts`)
- **Platform files:** allowed where needed
  - `*.ios.tsx`
  - `*.android.tsx`
  - `*.web.ts` / `*.web.tsx`

---

## 7. Import Rules

- Prefer configured alias imports (e.g. `@/`) where available.
- Otherwise use short relative imports.
- Avoid very deep relative chains when an alias exists.

Good:
```ts
import { ThemedView } from "@/components/themed-view"
```

Avoid:
```ts
import { ThemedView } from "../../../components/themed-view"
```

---

## 8. Component File Structure

Use this order:

1. Imports
2. Types/Props
3. Component
4. Styles
5. Export

Example:
```tsx
import { StyleSheet, Text, View } from "react-native"

type Props = {
  title: string
}

export function Header({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
})
```

---

## 9. Styling Rules

Preferred approach:
- `StyleSheet.create(...)`
- Theme-aware wrappers/hooks (`themed-*`, `use-theme-color`)
- Tokens from `constants/theme.ts`

Rules:
- Avoid large inline style objects.
- Use consistent spacing and color tokens.
- Keep styles in the same file unless shared by multiple components.

---

## 10. Theme & Color Usage

Theme source:
- `constants/theme.ts`
- `hooks/use-theme-color.ts`
- `components/themed-text.tsx`
- `components/themed-view.tsx`

Guidelines:
- Reuse existing theme utilities first.
- Do not hardcode colors when theme tokens already exist.
- Ensure dark/light behavior remains consistent on mobile and web.

---

## 11. Logic, Services, and State

- Shared logic belongs in hooks (`hooks/`) or utilities (`utils/`).
- Backend/API access should go in `services/` once introduced.
- Global state (if needed) should go in `state/` and remain minimal.

---

## 12. Testing

When tests are added:
- Co-locate small tests next to files or use a dedicated test folder.
- Prefer React Native Testing Library patterns for UI behavior.
- Test behavior and rendering, not implementation details.

---

## 13. AI Agent Rules (Mandatory)

AI-generated code must:

1. Respect the existing `client/` folder structure.
2. Keep route files in `app/` concise.
3. Place reusable UI in `components/` or `components/ui/`.
4. Put shared logic in `hooks/` (or `utils/` for pure functions).
5. Use TypeScript and avoid `any` unless justified.
6. Follow existing file naming style (kebab-case + platform suffixes).
7. Use theme utilities/tokens instead of hardcoded styling.
8. Avoid creating new root-level architecture patterns without explicit request.

---

## 14. Summary

This style guide keeps DermAtlas consistent across Expo mobile + web by:

- preserving current project conventions,
- enforcing predictable file placement,
- separating routing, UI, and logic,
- and ensuring AI-generated code matches the existing codebase.
