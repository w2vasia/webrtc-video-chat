# UI Redesign — Light Mode with Dark Chat Area

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign all Whisper UI to a clean, minimal light theme with dark message area for contrast.

**Architecture:** CSS-first redesign — new design tokens, rewritten styles, minimal markup changes. Inter font via Google Fonts. Light surfaces with one violet accent. Dark-themed chat message area creates visual depth and makes the chat the focal point.

**Tech Stack:** CSS custom properties, Google Fonts (Inter), existing SolidJS components

---

### Design System

**Colors:**
- `--bg`: `#f5f6fa` — page bg (warm light gray)
- `--surface`: `#ffffff` — cards/panels (white)
- `--surface-2`: `#eef0f6` — input bg, hover states
- `--surface-3`: `#e2e5ee` — pressed states
- `--chat-bg`: `#141422` — dark message area
- `--chat-surface`: `#1e1e35` — received bubble bg
- `--primary`: `#6366f1` — accent violet (indigo-500)
- `--primary-hover`: `#4f46e5` — accent hover
- `--primary-soft`: `rgba(99,102,241,0.08)` — subtle primary bg
- `--text`: `#111827` — primary text
- `--text-secondary`: `#6b7280` — secondary text
- `--text-muted`: `#9ca3af` — disabled/hint text
- `--danger`: `#ef4444`
- `--danger-soft`: `rgba(239,68,68,0.08)`
- `--success`: `#22c55e`
- `--success-soft`: `rgba(34,197,94,0.08)`
- `--border`: `#e5e7eb`
- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.05)`
- `--shadow-md`: `0 4px 12px rgba(0,0,0,0.08)`
- `--shadow-lg`: `0 8px 24px rgba(0,0,0,0.12)`
- `--radius`: `10px`
- `--radius-lg`: `16px`
- `--radius-full`: `9999px`

**Typography:** Inter, 400/500/600 weights. Body 0.9375rem/1.5, headings 1.2lh.

**Spacing:** 4px base unit — 4, 8, 12, 16, 20, 24, 32, 40, 48.

**Touch targets:** Min 44px height on all interactive elements.

---

### Task 1: Add Inter Font + Meta

**Files:**
- Modify: `client/index.html`

**Step 1: Update index.html**

Add Inter font preconnect + stylesheet in `<head>`, update theme-color meta:

```html
<meta name="theme-color" content="#f5f6fa" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

**Step 2: Verify** — `bun run dev` (client), check font loads in browser.

---

### Task 2: Rewrite Design Tokens + Global Styles

**Files:**
- Rewrite: `client/src/styles/global.css`

**Step 1: Replace entire global.css**

Full replacement with new design system. Key sections:
- CSS reset + custom properties
- Body styles (Inter, light bg)
- Auth pages (light card, soft shadow, no border)
- Chat layout (light sidebar, dark message area)
- All component classes

See implementation for complete CSS.

**Step 2: Verify** — run dev, check all pages render with new theme.

---

### Task 3: Update Auth Pages Markup

**Files:**
- Modify: `client/src/pages/Login.tsx`
- Modify: `client/src/pages/Register.tsx`

Minor markup changes:
- Add label-like structure for inputs (wrap in div with label)
- Add `autocomplete` attributes for accessibility
- No functional changes

---

### Task 4: Update Chat Page + Sidebar Markup

**Files:**
- Modify: `client/src/pages/Chat.tsx`

Changes:
- Add section dividers/labels in sidebar
- Improve sidebar header layout (user info + logout)
- No functional changes

---

### Task 5: Update ChatWindow Markup

**Files:**
- Modify: `client/src/components/ChatWindow.tsx`

Changes:
- Show friend name in header (already passed or can derive)
- Add SVG icons for back, call, send buttons
- Improve empty state
- No functional changes

---

### Task 6: Update FriendList + AddFriend + PendingRequests

**Files:**
- Modify: `client/src/components/FriendList.tsx`
- Modify: `client/src/components/AddFriend.tsx`
- Modify: `client/src/components/PendingRequests.tsx`

Changes:
- Better empty state for friend list
- Inline SVG icons for add/accept/reject buttons
- Improved spacing and hierarchy
- No functional changes

---

### Task 7: Update VideoCall + IncomingCall

**Files:**
- Modify: `client/src/components/VideoCall.tsx`
- Modify: `client/src/components/IncomingCall.tsx`

Changes:
- SVG icons for cam/mic/end controls instead of text
- Frosted glass effect on controls bar
- Improved incoming call dialog
- No functional changes
