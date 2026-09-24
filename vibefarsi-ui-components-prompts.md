# پرامپت‌های آماده‌ی کامپوننت‌ها (برای Cursor / Claude / Codex)

متن کامل تب «پرامپت» هر کامپوننت از vibefarsi.ir — جمع‌شده در ۲۰۲۶-۰۹-۲۱.

---

## Slider (slider)

Build a React + Tailwind CSS component named "Slider" (slider).

This item requires:
• Use a native input[type=range] and fill the track from the right with linear-gradient(to left …).
• Value label uses Persian digits and is swappable via a format prop.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: slider.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Button (button)

Build a React + Tailwind CSS component named "Button" (button).

This item requires:
• Variants default, secondary, outline, ghost, destructive and sizes sm/md/lg/icon.
• Icons sized with [&_svg]:size-4 and gap-2 from the label.
• Disabled: opacity-50 and pointer-events-none; active: scale-[0.98].

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: button.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Data Table (data-table)

Build a React + Tailwind CSS component named "Data Table" (data-table).

This item requires:
• Columns from config (key/header/sortable/numeric/cell); header click cycles asc, desc, unsorted and sets aria-sort.
• Text filter on searchKeys with Persian-digit normalization; loading uses Skeleton, empty uses EmptyState inside a colSpan row.
• Pagination with Persian digits and «صفحه‌ی ۲ از ۵».

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: data-table.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Search Input (search-input)

Build a React + Tailwind CSS component named "Search Input" (search-input).

This item requires:
• type="search" with enterKeyHint="search"; hide the WebKit cancel button and render an own clear (X) button at the inline-end once there is text.
• Magnifier at the inline-start (right in RTL); `loading` swaps it for a spinner.
• onSearch fires after a debounce (default 300ms), immediately on Enter, and with "" when cleared; Escape clears.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: search-input.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Sidebar (sidebar)

Build a React + Tailwind CSS component named "Sidebar" (sidebar).

This item requires:
• aside on the right; active item bg-accent; numeric badge with Persian digits.
• Collapsible group with a chevron that rotates 90deg when closed.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: sidebar.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Context Menu (context-menu)

Build a React + Tailwind CSS component named "Context Menu" (context-menu).

This item requires:
• onContextMenu preventDefault and store relative coords; menu is absolute at that point.
• Close on outside click, Escape, and scroll.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: context-menu.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Dropdown Menu (dropdown-menu)

Build a React + Tailwind CSS component named "Dropdown Menu" (dropdown-menu).

This item requires:
• Menu opens under the button at start-0; outside click and Escape close it.
• role="menu"/"menuitem", up/down navigation, shortcut as kbd on the left.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: dropdown-menu.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Card (card)

Build a React + Tailwind CSS component named "Card" (card).

This item requires:
• 1px border from the border token, card background, radius from --radius; no heavy shadow.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: card.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Alert Dialog (alert-dialog)

Build a React + Tailwind CSS component named "Alert Dialog" (alert-dialog).

This item requires:
• role="alertdialog"; initial focus on cancel, not delete.
• Confirm button disables while a Promise is pending, with waiting copy.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: alert-dialog.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Dialog (dialog)

Build a React + Tailwind CSS component named "Dialog" (dialog).

This item requires:
• Escape and overlay click close it; lock body scroll; move focus inside on open and restore on close.
• On mobile from the bottom (items-end), centered on desktop; close button in the top-left corner.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: dialog.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Tooltip (tooltip)

Build a React + Tailwind CSS component named "Tooltip" (tooltip).

This item requires:
• No JavaScript: show with group-hover and group-focus-within.
• role="tooltip" wired with aria-describedby.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: tooltip.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Skeleton (skeleton)

Build a React + Tailwind CSS component named "Skeleton" (skeleton).

This item requires:
• Two modes: pulse and shimmer (gradient moving right to left); aria-hidden.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: skeleton.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.

---

## Spinner (spinner)

Build a React + Tailwind CSS component named "Spinner" (spinner).

This item requires:
• role=status wrapper; the ring is a border-current circle with border-e-transparent and animate-spin, sized xs/sm/md/lg.
• Color comes from currentColor so text-muted-foreground or text-brand recolors it; sr-only «در حال بارگذاری» when there is no visible label.
• LoadingOverlay: absolute inset-0 bg-background/60 with a centered spinner, inherits the parent's radius.

Persian / RTL rules for all output:
• RTL layout with dir="rtl". Use logical properties (ms/me/ps/pe/start/end), never left/right.
• Font from the project (IRANSans or Vazirmatn). Never apply letter-spacing on Persian text.
• Visible numbers use Persian digits (۰–۹), thousands separator «٬» (U+066C), and the unit «تومان» after the number.
• Colors only from theme tokens: bg-background, text-foreground, bg-primary, text-muted-foreground, border-border, and similar. Do not invent colors.
• Icons from lucide-react. Directional icons (arrows, chevrons) flip in RTL: "next" points left.
• Accessibility: correct ARIA roles, a visible focus ring, and full keyboard support.
• Form controls (input, textarea, select) must compute to at least 16px on iOS, or Safari zooms the page on focus; keep text-sm on desktop and raise it under @supports (-webkit-touch-callout: none).
• Motion is short (150–300ms) and disabled under prefers-reduced-motion.
• All visible UI copy (labels, placeholders, empty states, errors) is Persian (Farsi). Code identifiers stay English.

Output: spinner.tsx in TypeScript, no extra dependencies except lucide-react, plus a short usage example.
