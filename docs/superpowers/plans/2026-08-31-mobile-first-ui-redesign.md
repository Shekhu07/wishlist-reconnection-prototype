# Mobile-First Application UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the user interface from a wide-screen web layout to a compact, mobile-first application container and viewport architecture, optimizing layout scaling, spacing, and mobile containment without modifying any existing features, logic, or test gates.

**Architecture:** Encapsulate the entire user interface — including TopBar, Screen Body, Bottom Navigation, Modal Bottom Sheets, and State Switcher Pill — into a unified standard mobile container (`maxWidth: 420px`) inside `AppShell`. On desktop browsers, center the mobile container on a sleek neutral canvas ground with smartphone frame styling and elevation; on mobile devices, display edge-to-edge full bleed.

**Tech Stack:** React Native, Expo, React Native Web, TypeScript, Jest

## Global Constraints

- **C-1**: No monetary incentives, strike-throughs, discounts, or sale urgency copy.
- **C-7**: All touch targets $\ge 44 \times 44\text{ pt}$. Contrast ratios $\ge 4.5:1$.
- **Zero Feature Regressions**: All 10 prototype states, Decision Confidence signals, Comparison Re-entry, Outfit Pairing, and Experiment Harness controls must function identically.
- **Test Integrity**: All 546 tests and 10 acceptance gates in `npm test` must pass.

---

### Task 1: Update Design Tokens for Mobile Frame & Backdrop

**Files:**
- Modify: `app/src/design/tokens.ts:150-168`
- Test: `app/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `FRAME_MAX_WIDTH` from `tokens.ts`
- Produces: `FRAME_MAX_WIDTH = 420`, `spec.canvasGround = "#ECECED"`

- [ ] **Step 1: Update tokens in `tokens.ts`**

Adjust `FRAME_MAX_WIDTH` to `420` and add web canvas background and device frame radius tokens.

- [ ] **Step 2: Run unit tests to verify no token breakages**

Run: `cd app && npm test __tests__/shell.test.tsx`
Expected: PASS

---

### Task 2: Refactor `AppShell` for Full Mobile Viewport Containment

**Files:**
- Modify: `app/src/shell/AppShell.tsx:1-68`
- Modify: `app/App.tsx:880-920`
- Test: `app/__tests__/shell.test.tsx`
- Test: `app/__tests__/shellIntegration.test.tsx`

**Interfaces:**
- Consumes: `TopBar`, `BottomNav`, `Sheet`, `HarnessPill`, `FRAME_MAX_WIDTH`
- Produces: Contained `phoneFrame` housing all navigation, screens, sheets, and harness controls.

- [ ] **Step 1: Refactor `AppShell.tsx`**

Update `AppShell` so that on desktop web it centers a `phoneFrame` (`maxWidth: 420`, `height: 100%`, `backgroundColor: color.surface`, `overflow: hidden`, `elevation.float` shadow, and subtle border radius on large viewports). The `TopBar`, screen `body`, `harness`, `sheet`, and `BottomNav` are all rendered inside `phoneFrame`.

- [ ] **Step 2: Clean up redundant `styles.frame` in `App.tsx`**

Remove the inner `View style={styles.frame}` in `App.tsx` that previously wrapped only `screen.name` components, allowing screens to naturally fill the 100% width of `AppShell`'s `phoneFrame`.

- [ ] **Step 3: Run shell tests to verify containment and rendering**

Run: `cd app && npm test __tests__/shell.test.tsx __tests__/shellIntegration.test.tsx`
Expected: PASS

---

### Task 3: Align Bottom Sheet and Overlay Modals to Mobile Frame

**Files:**
- Modify: `app/src/components/Sheet.tsx:130-160`
- Test: `app/__tests__/whySheet.test.tsx`
- Test: `app/__tests__/module.test.tsx`

**Interfaces:**
- Consumes: `FRAME_MAX_WIDTH = 420`
- Produces: Correctly docked modal sheets aligning with the mobile phone viewport.

- [ ] **Step 1: Update `styles.sheet` in `Sheet.tsx`**

Ensure `styles.sheet` has `maxWidth: FRAME_MAX_WIDTH` and `borderTopLeftRadius: radius.sheet`, `borderTopRightRadius: radius.sheet`, with scrim backdrop properly covering the frame.

- [ ] **Step 2: Run sheet tests to verify modal interactions**

Run: `cd app && npm test __tests__/whySheet.test.tsx`
Expected: PASS

---

### Task 4: Full Suite Verification & Visual Check

**Files:**
- Test: Full test suite `npm test`
- Test: Acceptance gates `npm run gates`

- [ ] **Step 1: Run complete unit test suite**

Run: `cd app && npm test`
Expected: PASS (all 546+ tests passing)

- [ ] **Step 2: Run acceptance gates**

Run: `cd app && npm run gates`
Expected: PASS (all gates green)

- [ ] **Step 3: Verify live preview**

Verify at `http://localhost:8081` that the interface renders as a sleek, centered mobile application frame on desktop web, with TopBar, BottomNav, screens, and modals perfectly contained.
