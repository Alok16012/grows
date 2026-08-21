# Growus Auto ERP — Fix Report
**Date:** 21 August 2026
**Branch:** main
**Commit:** `5cd81cc`

---

## 1. What Was Fixed

### Accessibility (WCAG 2.1 AA)

| # | File | Fix |
|---|------|-----|
| 1 | `app/(dashboard)/error.tsx` | Added `role="alert"` + `aria-live="assertive"` — screen readers announce errors immediately |
| 2 | `app/(dashboard)/error.tsx` | Added `aria-hidden="true"` on decorative icon |
| 3 | `app/(dashboard)/layout.tsx` | Added skip-navigation link (`href="#main-content"`) — keyboard users skip sidebar |
| 4 | `app/(dashboard)/layout.tsx` | Added `id="main-content"` on main container — anchor target for skip link |
| 5 | `app/(dashboard)/layout.tsx` | Added `border-r` on desktop sidebar — visual boundary for screen readers |
| 6 | `app/(dashboard)/loading.tsx` | Added `role="status"` + `aria-busy="true"` — loading state announced |
| 7 | `app/(dashboard)/loading.tsx` | Added `aria-hidden="true"` on all skeleton rows — screen readers skip decoration |
| 8 | `app/(dashboard)/loading.tsx` | Added `<span className="sr-only">Loading…</span>` — announces loading state |
| 9 | `app/login/page.tsx` | Added `role="separator"` on divider — semantic landmark |
| 10 | `app/login/page.tsx` | Added `role="alert"` + `aria-live="polite"` on login error — announced on error |
| 11 | `components/TopNav.tsx` | Added `aria-haspopup`, `aria-expanded`, `aria-controls` on search dropdown |
| 12 | `components/Sidebar.tsx` | Wrapped nav in `<nav>` element with `aria-label="Main navigation"` |
| 13 | `components/EmployeeModal.tsx` | Added `aria-label` on icon-only action buttons |
| 14 | `app/globals.css` | Added `:focus-visible` ring (2px accent outline) — keyboard navigation visible |

### UX Improvements

| # | File | Fix |
|---|------|-----|
| 15 | `app/(dashboard)/error.tsx` | Added "Go to Dashboard" button — users no longer stuck on error screen |
| 16 | `app/(dashboard)/error.tsx` | Structured error display with `error.digest` reference for support |
| 17 | `app/(dashboard)/error.tsx` | Improved error message — "Please try again" guidance |
| 18 | `app/login/page.tsx` | Mobile spacing fix (`p-6` → `p-4`, `max-w-[400px]`, `mx-4`) |
| 19 | `app/login/page.tsx` | Card width responsive instead of fixed `w-[420px]` |

### Dark Mode Support

| # | File | Fix |
|---|------|-----|
| 20 | `app/globals.css` | Added `@media (prefers-color-scheme: dark)` — full dark mode token set |
| 21 | `app/(dashboard)/layout.tsx` | Sidebar now uses CSS variables (`sidebar-dark` class) instead of hardcoded `#0e1c2b` |

### Motion & Animation

| # | File | Fix |
|---|------|-----|
| 22 | `app/globals.css` | Added `@media (prefers-reduced-motion: reduce)` — respects user preference |
| 23 | `app/(dashboard)/loading.tsx` | Moved skeleton animation from inline `<style>` to CSS (`skeleton-pulse` keyframe) |
| 24 | `app/(dashboard)/layout.tsx` | Removed 500ms page-navigation fade-in (was adding perceived latency) |

### Shared Components

| # | File | Fix |
|---|------|-----|
| 25 | `components/Avatar.tsx` | New shared Avatar component — `firstName`/`first`/`name` prop aliases for backward compatibility across all pages |
| 26 | `app/globals.css` | Added `@media print` styles — hides nav/sidebar, clean print output |
| 27 | `app/globals.css` | Added `scrollbar-gutter: stable` on overflow containers — prevents layout shift |
| 28 | `app/globals.css` | Fixed `*` selector to `*, *::before, *::after` — pseudo-elements get border-color |

---

## 2. What Was NOT Changed (Intentionally Preserved)

- All 12 dashboard pages (sites, projects, field, attendance, leaves, payroll, assets, onboarding, exit, lms, employees)
- All 190+ API routes — zero changes
- Prisma schema — zero changes
- Authentication/authorization logic — zero changes
- Business workflows — zero changes
- Database — zero changes
- Inline Avatar implementations in individual pages (working correctly, no need to refactor)

---

## 3. Known Issues (Not Fixed in This Commit)

| Priority | Issue | Action Required |
|----------|-------|-----------------|
| P0 | Android signing key exposed in public repo | Rotate keystore + update `REVIEW.md` |
| P0 | Search API permission check uses wrong function | Audit `checkAccess` vs `can()` usage across all routes |
| P1 | Dashboard cache keyed on permissions (not user) | Per-user cache keys needed |
| P1 | Zero test coverage | Add Jest + React Testing Library |
| P2 | No CI/CD pipeline | Add GitHub Actions / GitLab CI |
| P3 | No error monitoring (Sentry) | Add error tracking service |

---

## 4. Files Modified

```
 app/(dashboard)/error.tsx       — Error boundary improvements
 app/(dashboard)/layout.tsx      — Skip nav, sidebar tokens, main-content anchor
 app/(dashboard)/loading.tsx     — ARIA loading state, skeleton animation
 app/globals.css                 — Dark mode, reduced motion, print, focus ring
 app/login/page.tsx              — Mobile spacing, semantic roles
 components/Avatar.tsx           — NEW: shared Avatar component
 components/EmployeeModal.tsx    — ARIA labels
 components/Sidebar.tsx          — Nav landmark
 components/TopNav.tsx           — Search dropdown ARIA
 REVIEW.md                       — NEW: architecture + security review doc
```

---

## 5. Verification

- TypeScript: `npx tsc --noEmit` → **0 errors**
- Git status: **8 modified files, 2 new files, 141 insertions, 49 deletions**
- Commit: `5cd81cc` on `main`

---

*Report generated: 21 August 2026*
