# Field Daily Reports - Design Guidelines

## Design Approach

**Selected System:** Material Design 3 (mobile-first, form-optimized)
**Justification:** Construction field app requiring durability, clear hierarchy, and exceptional form usability on mobile devices in challenging outdoor conditions.

**Core Principles:**
- Touch-first: Minimum 44px tap targets for gloved hands
- High contrast: Readable in direct sunlight
- Efficiency: Minimize input friction for daily use
- Professional: Clean, trustworthy aesthetic for client-facing PDFs

---

## Typography

**Font Family:** Roboto (Google Fonts)
- Headers: Roboto Medium (500)
- Body: Roboto Regular (400)
- Labels: Roboto Medium (500)

**Scale:**
- Page titles: text-2xl (24px)
- Section headers: text-lg (18px)
- Form labels: text-sm font-medium (14px, uppercase tracking)
- Body text: text-base (16px)
- Helper text: text-sm text-gray-600 (14px)

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 or p-6
- Section spacing: mb-6 or mb-8
- Form field gaps: gap-4
- Card padding: p-6

**Mobile Containers:**
- Full-width forms with px-4 edge padding
- Max-width for content: max-w-4xl mx-auto
- Cards: rounded-lg with shadow-sm elevation

---

## Component Library

### Forms (Primary Focus)

**Input Fields:**
- Height: h-12 (large touch target)
- Border: border-2 border-gray-300, focus:border-blue-600
- Rounded: rounded-lg
- Label above input, text-sm font-medium mb-2
- Helper text below, text-sm text-gray-600 mt-1

**Text Areas:**
- Min height: rows={4}
- Same border/focus styling as inputs
- Resize-y for desktop

**Dropdowns/Selects:**
- Height: h-12 with appearance-none custom arrow
- Clear visual indicator of selection state

**Repeatable Row Sections** (Trades, Manpower, Visitors):
- Light gray background (bg-gray-50) with border-l-4 border-blue-500
- Add/Remove buttons: Icon-only, h-10 w-10, rounded-full
- Compact spacing between rows: gap-3

**Radio/Checkbox Groups:**
- Horizontal layout for 2-3 options (Weather dropdown exception)
- Large touch targets: p-3 clickable area
- Visual selection state with border-2 border-blue-600

### Navigation

**Inspector Mobile Nav:**
- Bottom tab bar: fixed bottom-0, h-16
- Icons with labels (Home, New Report, Reports)
- Active state: text-blue-600 with underline indicator

**Admin Desktop Nav:**
- Left sidebar: w-64, bg-gray-900 text-white
- Collapsed on mobile to hamburger menu
- Menu items: py-3 px-4 hover:bg-gray-800

### Cards

**Report Cards (Dashboard):**
- White background, rounded-lg, shadow-sm
- Border-l-4 with status color (green: submitted, orange: draft)
- p-4 with clear hierarchy: Project name → Date → Status badge

**Project Cards (Admin):**
- Grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Hover elevation: hover:shadow-md transition

### Buttons

**Primary CTA:** 
- bg-blue-600 text-white, h-12, rounded-lg, font-medium
- w-full on mobile, min-w-32 on desktop
- Hover: bg-blue-700

**Secondary:**
- border-2 border-gray-300 bg-white, h-12, rounded-lg

**Destructive:**
- bg-red-600 text-white for delete actions

### Photo Management

**Upload Zone:**
- Dashed border-2 border-dashed border-gray-300
- p-8 with upload icon and "Tap to upload" text
- Accepts multiple files, shows thumbnail grid below

**Photo Gallery:**
- Grid: grid-cols-2 md:grid-cols-3 gap-3
- Thumbnails: aspect-square, rounded-lg, object-cover
- Caption input below each: text-sm border-b

### Signature Pad

**Canvas Area:**
- Border-2 border-gray-300, rounded-lg
- Aspect ratio 2:1 (landscape orientation)
- Clear button in top-right: text-sm text-blue-600
- Instruction text above: "Sign with finger or stylus"

### Status Indicators

**Badges:**
- Pill shape: px-3 py-1 rounded-full text-xs font-medium
- Draft: bg-orange-100 text-orange-800
- Submitted: bg-green-100 text-green-800
- Error: bg-red-100 text-red-800

### Data Display

**Detail Sections (Report View):**
- Section header: text-lg font-medium mb-3 pb-2 border-b
- Key-value pairs: grid grid-cols-3, label in gray-600, value in gray-900
- Nested lists with pl-4 indentation

**Tables (Admin Dashboard):**
- Full-width with responsive scroll
- Striped rows: odd:bg-gray-50
- Header: bg-gray-100 font-medium text-sm
- Row height: h-12 for touch-friendly interaction

### PDF-Specific Styling

**Print Layout:**
- Fixed header with logo (max-h-12) and report title
- Body: max-w-prose with generous line-height (1.6)
- Photos: max-w-md, centered with captions below
- Signature block: border-t pt-6, signature image max-h-24

---

## Images

**Company Logo:**
- Admin upload to /public/assets/logo.png
- Display: max-h-10 in app header, max-h-12 in PDF header
- Format: PNG with transparency preferred

**Report Photos:**
- Field photos uploaded by inspectors
- Display in gallery grid (2-3 columns)
- PDF embed: centered, max-width with caption

**No hero images** - This is a utility application focused on form completion and data management.

---

## Key UX Patterns

**Form Auto-Save:** Visual indicator (timestamp: "Saved 2 minutes ago")
**Loading States:** Spinner with text for photo uploads and PDF generation
**Error States:** Inline validation with red text-sm below fields
**Empty States:** Centered icon + text for no reports/projects
**Confirmation Modals:** For destructive actions (delete report/user)