# Inspector → Design-Tool UX Upgrade Plan

## Overview
Transform the inspector from a DevTools-style panel into a modern design-tool UX (Lovable/Replit-inspired), adding 4 major feature areas.

## Features

### 1. Polish Design-Tool UX — Cleaner Sidebar, Better Visual Feedback
**Priority: HIGH** | Effort: Medium

#### What Changes
- **InspectorPanel.tsx** → Major UI overhaul
  - Replace raw input fields with intuitive design controls (sliders for numeric values, dropdown for font-family, segmented buttons for display/position/text-align/flex-direction)
  - Add visual groupings: Layout, Spacing, Typography, Background, Border, Effects
  - Color swatches instead of tiny picker box
  - Better hover feedback in the iframe (tooltip showing element name + dimensions like Lovable)
  - Smooth transitions and hover states on all controls

- **inspector-core.js** → Visual feedback improvements
  - Add hover tooltip/label showing `tagName.class | WxH` near the cursor (like Chrome DevTools / Lovable)
  - Better highlight: dashed margin guides, padding shading
  - Fix resize handles so they actually commit width/height changes to pendingEdits
  - Improve selection persistence (keep blue outline on selected element)

- **New component: DesignControl.tsx** — Reusable input with label, unit picker, slider hybrid

#### Files to Create/Modify
- `app/components/workbench/InspectorPanel.tsx` – major rewrite
- `app/components/workbench/DesignControl.tsx` – NEW
- `app/components/workbench/DesignColorPicker.tsx` – NEW (better color picker with palette)
- `app/components/workbench/DesignDropdown.tsx` – NEW (styled select with options)
- `public/inspector/inspector-core.js` – hover tooltip, better highlights, resize fix

---

### 2. Image Editing — Swap Images via Upload/URL
**Priority: HIGH** | Effort: Medium

#### What Changes
- Detect when selected element is `<img>` or has `background-image`
- Show image editing panel in the sidebar:
  - Current image preview (thumbnail)
  - URL input field to swap `src`/`background-image`
  - Upload button → convert to data URI or blob URL
  - Fit options: cover, contain, fill, scale-down
- Communicate image changes through the existing message bridge

#### Files to Create/Modify
- `app/components/workbench/ImageEditor.tsx` – NEW
- `app/components/workbench/InspectorPanel.tsx` – integrate ImageEditor
- `app/lib/inspector/types.ts` – add `isImage`, `imageSrc` to ElementInfo
- `app/lib/inspector/protocol.ts` – add `INSPECTOR_EDIT_IMAGE` command
- `app/lib/inspector/message-bridge.ts` – add `editImage()` convenience fn
- `public/inspector/inspector-core.js` – add image detection to createElementInfo, handle INSPECTOR_EDIT_IMAGE

---

### 3. Theme/Global Styles — Edit Color Palette + Typography Globally
**Priority: MEDIUM** | Effort: Large

#### What Changes
- New "Theme" tab in the inspector (or floating panel)
- Scan the preview page for:
  - All CSS custom properties (--variables)
  - Dominant colors used across the page
  - Font families in use
  - Common spacing values
- Allow editing CSS custom properties globally (change `--primary-color` → all elements update)
- Typography panel: global font-family, base font-size, heading scales
- Color palette panel: extract and allow swapping page-wide colors

#### Files to Create/Modify
- `app/components/workbench/ThemeEditor.tsx` – NEW (major)
- `app/lib/inspector/types.ts` – add ThemeData, CSSVariable interfaces
- `app/lib/inspector/protocol.ts` – add INSPECTOR_SCAN_THEME, INSPECTOR_EDIT_CSS_VAR commands
- `app/lib/inspector/message-bridge.ts` – add scanTheme(), editCSSVariable()
- `public/inspector/inspector-core.js` – add theme scanning, CSS variable editing
- `app/lib/stores/inspector.ts` – add themeDataAtom
- `app/lib/hooks/useInspector.ts` – expose theme actions

---

### 4. Source-to-Code Linking — Click Label → Jump to Source
**Priority: MEDIUM** | Effort: Medium

#### What Changes
- When user clicks the element tag label in the panel header, open the source file at the correct line
- Requires source mapping from DOM element → source file/line
- Use React's `__source` prop (available in dev mode) or `data-source` attributes injected by the dev server
- Open file in the editor panel via existing file navigation API

#### Files to Create/Modify
- `public/inspector/inspector-core.js` – extract `__source` / `data-source-file` / `data-source-line` from elements
- `app/lib/inspector/types.ts` – add `sourceFile?`, `sourceLine?` to ElementInfo
- `app/components/workbench/InspectorPanel.tsx` – make tag label clickable → navigate to source
- Integration with the editor panel's file opening mechanism

---

## Implementation Order

### Phase 1: Foundation & Quick Wins
1. Fix resize handles (they change inline CSS but don't update pendingEdits)
2. Add hover tooltip to inspector-core.js
3. Create DesignControl components
4. Refactor InspectorPanel with grouped design controls

### Phase 2: Image Editing
5. Add image detection to inspector-core.js
6. Create ImageEditor component
7. Wire up the message protocol

### Phase 3: Theme System
8. Add theme scanning to inspector-core.js
9. Create ThemeEditor component
10. Wire up CSS variable editing

### Phase 4: Source Linking
11. Detect source info in inspector-core.js
12. Make element label clickable → open source file

---

## Architecture Notes

### Message Flow (unchanged pattern)
```
User action in InspectorPanel
  → useInspector action function
    → message-bridge sendCommand()
      → postMessage to iframe
        → inspector-core.js handles command
          → postMessage response to parent
            → useInspectorMessages handler
              → store atom update
                → React re-render
```

### No Breaking Changes
- UseInspectorReturn interface: ADD new properties, never remove
- All existing consumers continue working unchanged
- New features are additive tabs/sections in the panel
