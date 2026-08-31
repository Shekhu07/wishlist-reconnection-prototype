# Design Spec: Mobile-First Application UI Redesign

**Date:** 2026-08-31  
**Project:** Myntra Wishlist Reconnection Prototype (`MVP_OPUS`)  
**Objective:** Transition the prototype from a wide-screen web-stretched layout to a dedicated, compact, mobile-first application UI container, optimizing spacing, scaling, and mobile viewport ergonomics while preserving 100% of the MVP's existing features, logic, and acceptance gates.

---

## 1. Core Principles & Constraints

1. **Feature Preservation**: Preserve all 10 core prototype states, the Decision Confidence Layer (10 signals), Comparison Re-entry (CR-01 to CR-05), Outfit Pairing slot engine, 5-arm experimentation harness, telemetry events, and acceptance gates.
2. **Zero Monetary Incentives (C-1)**: No changes to copy, pricing displays, or discount restrictions.
3. **Accessibility Gate (C-7)**: Ensure all interactive controls retain minimum $44 \times 44\text{ pt}$ touch targets and WCAG AA contrast standards.
4. **Mobile Enclosure**: Encapsulate the entire user interface — TopBar, Screen Body, Bottom Navigation, Modal Bottom Sheets, and State Switcher Pill — inside a standardized mobile application viewport.

---

## 2. Architecture & Viewport Containment

### 2.1 Web Desktop Presentation (`> 480px` viewport)
- Outer page background: Neutral desktop canvas ground (`#ECECED` or `#EFEFEF`) with full viewport coverage.
- Application Shell Container:
  - Fixed standard mobile width: `width: 100%`, `maxWidth: 420px`.
  - Height: `height: 100%`, `maxHeight: 100vh` (or `min(100vh, 920px)` on larger displays with desktop margin/padding).
  - Elevation: Mobile device frame styling with subtle multi-layer drop shadow (`0 20px 40px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)`) and `borderRadius: 24px` on desktop.
  - Centering: Vertically and horizontally centered in the browser window.
  - Overflow: `overflow: hidden` to guarantee internal scrolling and containment.

### 2.2 Mobile Native & Mobile Web Presentation (`≤ 480px` viewport)
- 100% edge-to-edge width and height.
- Zero outer canvas margins, zero artificial border radius.
- Respects device safe areas (`env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`).

---

## 3. Component & Layout Specifications

### 3.1 AppShell Enclosure
- Move the `TopBar`, screen `children`, `BottomNav`, `sheet` slot, and `harness` slot to reside **inside** the unified mobile container frame.
- Eliminates the previous layout bug where `TopBar` and `BottomNav` stretched across the full browser width (`1440px+`) while only the inner screen content was constrained.

### 3.2 Navigation & Chrome Scaling
- **TopBar (`HomeHeader`)**:
  - `deliverRow`: Wordmark, 1px divider, pin icon + address (`Home · 400001`), and floating wallet pill (`₹0`) aligned within 420px.
  - `searchRow`: Full-width mobile search bar with embedded mic & camera glyphs, plus compact 44pt tap targets for Notifications, Wishlist (with live badge), and Profile.
- **TopBar (`BackHeader`)**:
  - 44pt back chevron target and clean route title (`Wishlist`, `Bag`, `Checkout`, `Compare options`, `Account`).
- **BottomNav**:
  - Fixed 52pt mobile tab bar with 5 evenly spaced tabs (`Home`, `Explore`, `MNow`, `Luxe`, `Bag`).

### 3.3 Screen Layouts & Density
- **Search Results & Wishlist Module (DC-01)**:
  - Single-match card: `96×128pt` thumbnail on the left, right details, 44pt co-equal buttons (`Buy from Wishlist` / `Compare options`).
  - Multi-match carousel: `156pt` width cards.
  - 2-Column Product Grid: 50% width tiles with 4px padding and 3:4 image ratio.
- **Saved Product Detail (DC-03)**:
  - Full-width hero image (capped at ~380–420px height) matching the phone container width.
  - Color & size selector rows formatted as horizontal pill lists with 44pt minimum touch targets.
  - Decision Confidence Panel (DC-04) rendered cleanly with expandable "Why" source citations.
- **Comparison Matrix (CR-01)**:
  - Horizontal swipe table with pinned 104px left attribute axis column and 150px option columns.
- **Modal Sheets (WhySheet, ResumeSheet, DecideSheet, StateSwitcher)**:
  - Pinned to the bottom of the 420px mobile frame with `16px` rounded top corners and dark dimmed backdrop.

---

## 4. Verification Plan

1. **Automated Tests**: Run full test suite (`npm test`) to ensure all 546 unit tests and 10 acceptance gates pass with 0 regressions.
2. **Visual Verification**: Check web dev server preview on desktop (`localhost:8081`) to verify centered mobile phone container, and verify responsive behavior on mobile viewports.
3. **Interactive Verification**: Verify navigation flows (Home $\leftrightarrow$ Search $\leftrightarrow$ Saved Product $\leftrightarrow$ Compare $\leftrightarrow$ Bag $\leftrightarrow$ Checkout) and bottom sheets.
