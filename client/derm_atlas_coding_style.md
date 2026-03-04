
# React Native + Web Hybrid (Expo) Coding Style & Project Structure

This document defines a **consistent, predictable** coding style and file/directory structure for an **Expo** app that runs on **iOS, Android, and Web** from the same codebase.

---

# 1. Core Principles

1. **Single Codebase**
   - One Expo project must support **mobile and web**.
   - Avoid platform‑specific forks unless necessary.

2. **Feature-Based Architecture**
   - Business logic should live inside feature modules.
   - Screens orchestrate features rather than implementing logic.

3. **Strict Separation of Concerns**
   - UI components never call APIs directly.
   - Screens coordinate features.
   - Services manage API/storage.

4. **Predictable Code Generation**
   - All code follows the same naming conventions and folder placement.
   - AI agents must not create ad-hoc directories.

5. **TypeScript Everywhere**
   - Use TypeScript for all files.
   - Avoid `any`. If unavoidable, include a comment explaining why.

---

# 2. Technology Stack

Required technologies:

- Expo (Managed Workflow)
- React Native
- React Native Web
- Expo Router
- TypeScript
- ESLint
- Prettier

Recommended technologies:

- TanStack Query (API state management)
- Zustand (lightweight client state)
- React Hook Form (forms)
- Zod (validation)

---

# 3. Project Directory Structure

Top-level structure:

```
project-root/
│
├── app/                    # Expo Router pages (thin routing layer)
│
├── src/
│   ├── features/           # Feature modules
│   ├── components/         # Shared reusable components
│   ├── ui/                 # Design system primitives
│   ├── hooks/              # Shared hooks
│   ├── services/           # API clients & backend interactions
│   ├── state/              # Global state stores
│   ├── theme/              # Design tokens (colors, spacing, fonts)
│   ├── utils/              # Pure utility functions
│   ├── types/              # Shared TypeScript types
│   ├── config/             # Environment configuration
│   └── assets/             # Images, icons, fonts
│
├── tests/                  # Unit and integration tests
├── docs/                   # Internal project documentation
│
├── package.json
├── tsconfig.json
├── babel.config.js
└── app.json
```

---

# 4. Routing Structure (Expo Router)

The `app/` directory contains **only routing logic**.

Example:

```
app/
│
├── _layout.tsx
│
├── (auth)/
│   ├── _layout.tsx
│   └── sign-in.tsx
│
├── (tabs)/
│   ├── _layout.tsx
│   ├── upload.tsx
│   ├── compare.tsx
│   ├── feedback.tsx
│   └── profile.tsx
│
└── +not-found.tsx
```

Rules:

- Route files should remain **very small**
- They should **import a feature screen** and render it

Example:

```
import { UploadScreen } from "@/features/upload/screens/UploadScreen"

export default UploadScreen
```

---

# 5. Feature Module Structure

Each feature lives inside:

```
src/features/<feature-name>/
```

Example:

```
src/features/upload/
│
├── screens/
│   └── UploadScreen.tsx
│
├── components/
│   ├── ImageUploader.tsx
│   └── UploadPreview.tsx
│
├── hooks/
│   └── useUploadImage.ts
│
├── services/
│   └── uploadService.ts
│
├── types.ts
└── index.ts
```

Rules:

- **Screens** compose feature components
- **Components** handle UI only
- **Hooks** contain logic
- **Services** handle API calls

---

# 6. UI Component Layers

Three UI layers exist.

## 1. Design System (src/ui)

Reusable primitives.

Examples:

```
src/ui/
├── Button.tsx
├── Card.tsx
├── TextField.tsx
├── Avatar.tsx
└── Icon.tsx
```

Rules:

- Must be completely **feature-agnostic**
- Must support **web and native**

---

## 2. Shared Components (src/components)

Reusable but higher-level UI.

Example:

```
src/components/
├── Header.tsx
├── PageContainer.tsx
├── ImageGrid.tsx
└── ModalDialog.tsx
```

---

## 3. Feature Components

Located inside features.

Example:

```
features/upload/components/
``

These should only be reused within that feature.

---

# 7. Naming Conventions

## Files

Use **PascalCase** for components.

Examples:

```
UploadScreen.tsx
UserAvatar.tsx
ImageUploader.tsx
```

Hooks must begin with `use`:

```
useAuth.ts
useUploadImage.ts
```

Service files:

```
authService.ts
imageService.ts
```

---

# 8. Import Rules

Use **absolute imports with aliases**.

Example:

```
import { Button } from "@/ui/Button"
import { useAuth } from "@/features/auth/hooks/useAuth"
```

Never use deep relative paths:

```
../../../components/Button
```

---

# 9. Component Structure

Standard component layout:

```
imports

types

component

styles

export
```

Example:

```
import { View, Text } from "react-native"

type Props = {
  title: string
}

export function Header({ title }: Props) {
  return (
    <View>
      <Text>{title}</Text>
    </View>
  )
}
```

---

# 10. Styling Rules

Use React Native StyleSheet or Tailwind (if configured).

Preferred:

```
StyleSheet.create()
```

Example:

```
const styles = StyleSheet.create({
  container: {
    padding: 16
  }
})
```

Rules:

- Avoid inline styles
- Use theme tokens when possible

---

# 11. Theme System

Theme tokens live in:

```
src/theme/
```

Example:

```
src/theme/
├── colors.ts
├── spacing.ts
├── typography.ts
└── index.ts
```

Example usage:

```
import { colors } from "@/theme/colors"
```

---

# 12. Services Layer

All backend communication must go through `services/`.

Example:

```
src/services/
├── apiClient.ts
├── authService.ts
└── imageService.ts
```

Example:

```
export async function uploadImage(file: File) {
  return api.post("/images", file)
}
```

Rules:

- UI must **never call fetch directly**
- All requests go through service functions

---

# 13. Global State

Global state lives in:

```
src/state/
```

Example:

```
authStore.ts
settingsStore.ts
```

Use Zustand or similar minimal state libraries.

---

# 14. Hooks

Shared hooks live in:

```
src/hooks/
```

Examples:

```
useDebounce.ts
useDeviceType.ts
useTheme.ts
```

Feature-specific hooks must live inside their feature.

---

# 15. Type Definitions

Shared types go in:

```
src/types/
```

Example:

```
User.ts
ImageCase.ts
ApiResponse.ts
```

Feature-specific types stay inside the feature.

---

# 16. Testing

Tests live in:

```
tests/
```

Structure:

```
tests/
├── features/
├── components/
└── utils/
```

Testing tools:

- Jest
- React Native Testing Library

---

# 17. AI Agent Rules

AI agents generating code must follow these rules:

1. Do not create new root directories.
2. Always place feature code inside `src/features`.
3. UI primitives must go in `src/ui`.
4. Network calls must go through `services`.
5. Hooks must start with `use`.
6. Route files must stay thin.
7. Prefer composition over large components.

---

# 18. Example End-to-End Flow

User uploads an image.

Flow:

```
Screen
   ↓
Feature Hook
   ↓
Service
   ↓
API
```

Example:

```
UploadScreen
   → useUploadImage
       → uploadService.uploadImage()
           → apiClient.post()
```

---

# 19. Summary

This architecture ensures:

- predictable AI-generated code
- maintainable scaling
- separation of UI, logic, and backend
- consistent developer experience
