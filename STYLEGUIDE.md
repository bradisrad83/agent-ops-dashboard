# Agent Ops Dashboard — Style Guide

## Design Principles

1. **No heavy shadows or gradients** — Keep visual weight light and functional
2. **Consistent spacing** — Use multiples of 4px (4, 8, 12, 16, 24, 32)
3. **Accessible contrast** — All text meets WCAG AA standards (4.5:1 minimum)
4. **Semantic colors** — Colors convey meaning (event types, states, severity)

---

## Color Palette

### Neutral Light Theme

```css
--bg: #fafafa;           /* Main background */
--surface: #ffffff;      /* Panel/card background */
--border: #e0e0e0;       /* Primary borders */
--text: #1a1a1a;         /* Primary text (AAA contrast) */
--text-secondary: #525252; /* Secondary text (AA contrast) */
--muted: #737373;        /* Disabled/muted text */
```

### Accent Color

```css
--accent: #2563eb;       /* Primary interactive color (blue-600) */
--accent-hover: #1d4ed8; /* Hover state (blue-700) */
--accent-light: #dbeafe; /* Light tint for backgrounds (blue-50) */
--accent-medium: #93c5fd; /* Medium tint for borders (blue-300) */
```

### Badge Colors (Event Types)

Subtle tints with good contrast. Each type uses a background + text color pair:

```css
/* run.* events — Blue tones */
--badge-run-bg: #dbeafe;    /* blue-50 */
--badge-run-text: #1e40af;  /* blue-800 */

/* task.* events — Purple tones */
--badge-task-bg: #f3e8ff;   /* purple-50 */
--badge-task-text: #6b21a8; /* purple-800 */

/* tool.* events — Green tones */
--badge-tool-bg: #dcfce7;   /* green-50 */
--badge-tool-text: #166534; /* green-800 */

/* artifact.* events — Amber tones */
--badge-artifact-bg: #fef3c7; /* amber-50 */
--badge-artifact-text: #92400e; /* amber-800 */

/* error events — Red tones */
--badge-error-bg: #fee2e2;  /* red-50 */
--badge-error-text: #991b1b; /* red-800 */

/* unknown/other — Gray tones */
--badge-unknown-bg: #f5f5f5; /* gray-100 */
--badge-unknown-text: #404040; /* gray-700 */
```

---

## Typography

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'SF Mono', Monaco, 'Courier New', monospace;

--text-xs: 11px;   /* Tiny labels */
--text-sm: 12px;   /* Secondary info */
--text-base: 13px; /* Body text */
--text-md: 14px;   /* Base UI text */
--text-lg: 16px;   /* Section titles */
--text-xl: 18px;   /* Page titles */
```

---

## Spacing Scale

Use consistent spacing for padding, margins, and gaps:

```
4px  — Tight (chip padding, small gaps)
8px  — Compact (input padding, row padding)
12px — Default (panel padding, button padding)
16px — Comfortable (section padding)
24px — Spacious (header padding)
32px — Loose (major section gaps)
```

---

## Component Guidelines

### Chips (Filter Buttons)

- **Height**: 28px (fixed)
- **Padding**: 6px 12px
- **Border**: 1px solid var(--border)
- **Border radius**: 14px (half of height for pill shape)
- **Font size**: var(--text-sm)
- **Active state**:
  - Background: var(--accent-light)
  - Border: var(--accent)
  - Text: var(--accent-hover)

### Badges (Event Type Labels)

- **Padding**: 3px 8px
- **Border radius**: 4px
- **Font size**: var(--text-xs)
- **Font weight**: 500
- **Use data-type attribute selectors**:
  ```css
  [data-type^="run."] { /* run.* events */ }
  [data-type^="task."] { /* task.* events */ }
  [data-type^="tool."] { /* tool.* events */ }
  [data-type^="artifact."] { /* artifact.* events */ }
  [data-type="error"] { /* error events */ }
  ```

### Input Fields

- **Height**: 32px
- **Padding**: 8px 12px
- **Border**: 1px solid var(--border)
- **Border radius**: 6px
- **Focus state**:
  - Border: var(--accent)
  - Outline: none

### Event Rows

- **Padding**: 8px 16px
- **Border bottom**: 1px solid #f5f5f5 (lighter than main border)
- **Hover**: Background var(--bg)
- **Selected**:
  - Background: var(--accent-light)
  - Border left: 3px solid var(--accent)
  - Adjust left padding: -3px

### Panels

- **Background**: var(--surface)
- **Border**: 1px solid var(--border)
- **No box-shadow**: Keep flat and clean

---

## Accessibility

- **All text contrast**: Minimum 4.5:1 against background (WCAG AA)
- **Interactive elements**: Minimum 24px touch target (mobile-friendly)
- **Focus indicators**: Visible border/outline on keyboard focus
- **Color is not the only indicator**: Use text, icons, or patterns alongside color

---

## Usage Example

```vue
<style scoped>
:root {
  /* Neutral palette */
  --bg: #fafafa;
  --surface: #ffffff;
  --border: #e0e0e0;
  --text: #1a1a1a;
  --text-secondary: #525252;
  --muted: #737373;

  /* Accent */
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-light: #dbeafe;

  /* Badge colors */
  --badge-run-bg: #dbeafe;
  --badge-run-text: #1e40af;
  /* ... etc */
}

.container {
  background: var(--bg);
  color: var(--text);
}

[data-type^="run."] {
  background: var(--badge-run-bg);
  color: var(--badge-run-text);
}
</style>
```
