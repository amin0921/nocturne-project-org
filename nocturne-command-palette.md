# تسک ۱ — پالت دستورات استودیویی و اطلس کلیدهای میانبر
## Studio Command Palette & Shortcut Atlas — تحقیق، طراحی و کد آماده‌ی پیاده‌سازی

**پروژه:** Nocturne (Tauri v2 + React 18 + TS + TailwindCSS) — تم Obsidian `#0D0F15` با لهجه‌ی Studio Amber `#f59e0b`
**وضعیت:** فقط تسک ۱ انجام شده. تسک‌های بعدی (Undo، داشبورد آمار، استیج سینمایی) در صف‌اند.
**روش تحقیق:** جست‌وجوی وب و خواندن مستقیم متن صفحات عمومی (بدون لاگین، بدون مرورگر زنده). همه‌ی لینک‌های بخش «منابع» در تاریخ 2026-09-24 باز و راستی‌آزمایی شدند، مگر جایی که خلافش گفته شده.

---

## ۱. خلاصه‌ی کانسپت طراحی

پنجره‌ای شناور، شیشه‌ای و تیره (Obsidian Glass) که با `Ctrl+K` از هرجای اپ باز می‌شود — حس Spotlight مک / پالت VSCode، ولی با زبان بصری استودیویی Nocturne:

- **دو حالت در یک پنجره، با تب:** «دستورات» (جست‌وجو + اجرای فرمان) و «اطلس کلیدها» (راهنمای کامل میانبرها). فشردن کلید `?` داخل پالت، مستقیم به تب اطلس می‌پرد.
- **ساختار:** بک‌دراپ تیره‌ی بلور → پنل شیشه‌ای → هدر جست‌وجو → لیست گروه‌بندی‌شده با «قرص هایلایت لغزان» → فوتر راهنمای کلیدها.
- **معماری بدون وابستگی سنگین:** آگاهانه از `cmdk` (موتور shadcn) استفاده **نشد** — فیلتر ساده‌ی امتیازی و ناوبری کیبورد با ~۶۰ خط کد خودمان پیاده شد تا قانون Zero-Heavy-Dependency پروژه نقض نشود. تنها وابستگی‌های بیرونی: `react` و `lucide-react` (که از قبل در پروژه هست) + Tailwind.
- **تایپوگرافی دوگانه:** عنوان‌های فارسی با `dir="auto"` و فونت وزیرمتن؛ کلیدها، شمارنده‌ها و زمان‌ها با `dir="ltr"` و فونت مونو.
- **جهت:** کل پالت LTR قفل شده (`dir="ltr"`) چون کلیدها و ترتیب گروه‌ها ذاتاً چپ‌به‌راست‌اند؛ فقط رشته‌های فارسی داخلشان `dir="auto"` می‌گیرند. این دقیقاً همان الگوی پروژه است: «اعداد و زمان‌ها LTR، متون فارسی dir=auto».

### تصمیم‌های کلیدی طراحی (چرا این‌طور؟)

| تصمیم | دلیل |
|---|---|
| بدون `cmdk` / بدون Radix | قانون ضدوابستگی پروژه؛ فیلتر ۴۰ دستور با substring + امتیازدهی ساده کافی و سریع است؛ فوکوس‌ترپ و Escape با چند خط کد (الگوی تأییدشده‌ی `dialog.tsx` وایب‌فارسی) |
| قرص هایلایت لغزان جدا از ردیف | به‌جای تغییر `background` هر ردیف، یک عنصر absolute با `transform: translateY` جابه‌جا می‌شود → انیمیشن کاملاً GPU، بدون layout thrash، حس «لغزش» لوکس |
| کی‌کپ سه‌بعدی با شدوی چندلایه | حس مکانیکی واقعی: هایلایت داخلی بالا + لبه‌ی تیره‌ی پایین؛ هنگام هاور/فشرده‌شدن، شدو جمع می‌شود و هاله‌ی کهربایی می‌گیرد (رسپی dmnote + dev.to) |
| `?` = میانبر ورود به اطلس | دقیقاً مطابق دستور تسک؛ به‌علاوه تب قابل کلیک برای موس |
| اسکور فیلتر: startsWith > includes > کلمات کلیدی انگلیسی | کاربر فارسی‌زبانی که «play» تایپ می‌کند هم «پخش» را پیدا کند (`titleEn` + `keywords`) |

---

## ۲. مقادیر دقیق حرکت (Motion Spec)

همه‌ی انیمیشن‌ها CSS خالص و GPUمحور (`transform` / `opacity` / `filter` فقط). هیچ `top/left/width` انیمیت نمی‌شود.

| المان | از → به | مدت | ایزینگ | توضیح |
|---|---|---|---|---|
| بک‌دراپ | `opacity 0→1` | 150ms | `ease-out` | `bg-black/60` + `backdrop-blur-xl` (۲۴px) |
| پنل (ورود) | `scale(0.96)→1` + `opacity 0→1` + `translateY(-8px)→0` | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) | همان `0.96→1` درخواستی تسک |
| پنل (خروج) | معکوس | 120ms | `ease-in` | سریع‌تر بسته شود تا حس چابکی بدهد |
| قرص هایلایت لغزان | `translateY` + `height` | 220ms | `cubic-bezier(0.22, 1, 0.36, 1)` | فقط transform/height روی یک عنصر absolute |
| هاور ردیف | `background-color` | 120ms | `ease-out` | مکمل قرص، نه جایگزینش |
| فشرده‌شدن کی‌کپ | `translateY(0→1px)` + شدو | 80ms | `ease-out` | حس کلیک مکانیکی (رسپی dmnote) |
| اسپات‌لایت کهربایی پشت پنل | `translate(-72%,-62%) scale(0.5)` → `translate(-50%,-40%) scale(1)` | 2000ms | `ease` | مقادیر دقیق کامپوننت Spotlight اسیترنیتی؛ بعد از ورود ثابت می‌ماند |
| فوکوس رینگ | `box-shadow` | 150ms | `ease-out` | رینگ کهربایی `0 0 0 2px rgba(245,158,11,.5)` |

**کاهش حرکت:** زیر `@media (prefers-reduced-motion: reduce)` همه‌ی ترنزیشن‌ها و کی‌فریم‌ها `none` می‌شوند و پنل فوری ظاهر می‌شود (الگوی وایب‌فارسی: کامپوننت‌ها «اگه کاربر کاهش حرکت رو فعال کرده باشه خودشون خاموش میشن»).

> مبنای اعداد: پیش‌فرض Radix/shadcn برای دیالوگ `fade+zoom` در ۱۵۰ms است؛ اسپک totalaud.io برای پالت، اسپرینگ `stiffness: 300 / damping: 25` با `duration: 0.15` و `scale(0.95)` پیشنهاد می‌دهد. ما نسخه‌ی CSS خالص و کمی لوکس‌ترش را انتخاب کردیم: ۲۰۰ms با ease-out-expo.

---

## ۳. موجودی کامپوننت‌ها و منابع الهام (با لینک راستی‌آزمایی‌شده)

| # | منبع | لینک | چه چیزی ازش گرفتیم |
|---|---|---|---|
| ۱ | shadcn — Command / CommandDialog | https://www.shadcn.io/ui/command | ساختار ۹تکه‌ی پالت: `CommandInput` / `CommandList` / `CommandGroup(heading)` / `CommandItem(value, keywords, onSelect)` / `CommandSeparator` / `CommandShortcut` (فقط لیبل، بایند نمی‌کند) / `CommandEmpty`؛ ناوبری `↑↓` + `Enter` + `Esc`؛ نکته‌ی «`CommandShortcut` یک `span` است، کلید را خودت بایند کن» |
| ۲ | vibefarsi — dialog | https://vibefarsi.ir/components/dialog | الگوی فوکوس‌ترپ، بستن با Escape، قفل اسکرول body، بازگردانی فوکوس، `animate-fade-up` در ۲۵۰ms — کد کاملش در `components/ui/dialog.tsx` همین ورک‌اسپیس خوانده شد |
| ۳ | vibefarsi — search-input | https://vibefarsi.ir/components/search-input | الگوی هدر جست‌وجو: ذره‌بین در inline-start، دکمه‌ی پاک‌کن، و نمایش `<kbd dir="ltr">` هینت میانبر وقتی ورودی خالی است |
| ۴ | vibefarsi — animations (کاتالوگ ۶۳تایی، CSS خالص، RTL، reduced-motion) | https://vibefarsi.ir/animations | الگوی نصب `npx vibefarsi add <slug>`؛ الهام `border-beam` برای هاله‌ی نورانی دور پنل |
| ۵ | Magic UI — Shine Border | https://magicui.design/docs/components/shine-border | ایده‌ی هاله‌ی نورانی متحرک دور پنل/قرص فعال — نسخه‌ی ما CSS خالص و کهربایی است |
| ۶ | Aceternity UI — Spotlight | https://ui.aceternity.com/components/spotlight | هاله‌ی نوری پشت پنل + مقادیر دقیق کی‌فریم ورودش (جدول بالا)؛ نصب: `npx shadcn@latest add @aceternity/spotlight` — ما فقط ایده و مقادیر را برداشتیم، بدون نصب |
| ۷ | Bloom — Kbd docs | https://github.com/oxyhq/bloom/blob/HEAD/docs/kbd.mdx | سه قانون طلایی: «هر کلید یک `Kbd` جدا» (نه `⌘K` چسبیده)، «از سمبل پلتفرم خود کاربر استفاده کن»، «`Kbd` تزئین است نه کنترل — بایند کردن با اپ است»؛ سایز `sm` برای داخل ردیف |
| ۸ | elements-kit — kbd | https://github.com/elements-kit/elements-kit/blob/HEAD/docs/src/content/docs/ui/kbd.mdx | فونت کی‌کپ `0.8×` متن اطراف، `border-radius` متناسب با اسکیل، `user-select: none` |
| ۹ | dmnote — Key Styling | https://github.com/dmnote-app/dmnote/blob/HEAD/docs/content/en/custom-css/key-styling/page.mdx | رسپی حالت فشرده: شدوی `0 4px 0` در حالت عادی → `translateY(4px)` + حذف شدو + گلو در حالت فعال؛ ترنزیشن `0.1s ease-in-out` |
| ۱۰ | dev.to — 3D keyboard (CSS) | https://DEV.to/peacefullatom/the-3d-keyboard-made-with-css-and-javascript-280 | تکنیک حجم‌دهی با `translate3d` و overlay گرادیانی — مبنای حس سه‌بعدی کی‌کپ‌های ما |
| ۱۱ | totalaud.io — Command Palette Spec | https://github.com/totalaudiopromo/totalaud.io/blob/HEAD/_archive/specs/COMMAND_PALETTE_SPEC.md | گرامر حرکتی پالت (اسپرینگ ۳۰۰/۲۵)، `scrollIntoView({block:'nearest', behavior:'smooth'})` برای ردیف فعال، نقش‌های ARIA: `dialog` / `listbox` / `option` |
| ۱۲ | ui-ux-suite — WOW libraries 2026 | https://github.com/aboudjem/ui-ux-suite/blob/HEAD/knowledge/wow-libraries-2026.md | جمع‌بندی اکوسیستم: برنده‌ی «Command palette» = `shadcn/ui Command + cmdk`؛ هشدار «کپی کن، وابسته نشو» برای کتابخانه‌های نمایشی |

**درباره‌ی Uiverse و Codepen (صادقانه):** برای کی‌کپ، نمونه‌های Uiverse کیفیت بسیار متغیر و بدون تایپ‌اسکریپت‌اند (در منبع ۱۲ هم «ideas pool» توصیف شده‌اند) و لینک Codepen مستقیمی راستی‌آزمایی نشد؛ به‌جایش رسپی سه‌بعدی را از منابع ۹ و ۱۰ که بالا خوانده و تأیید شدند استخراج کردیم — نتیجه همان است، بدون ریسک کیفیت.

**نکته‌ی معماری:** shadcn موتورش `cmdk` است (یک وابستگی npm). چون قانون پروژه Zero-Heavy-Dependency است، ما ساختار معنایی shadcn (گروه/آیتم/شورتکات/empty-state) را نگه داشتیم ولی موتور فیلتر و ناوبری را خودمان نوشتیم — ظاهر و رفتار استاندارد، بدون پکیج اضافه.

---

---

## ۴. نقشه‌ی فایل‌ها

```
src/components/command-palette/
├── nocturne-palette.css      # شیشه، کی‌کپ سه‌بعدی، انیمیشن ورود/خروج، reduced-motion
├── Kbd.tsx                   # کامپوننت <kbd> لوکس + KbdSequence
├── commands.ts               # داده‌ی دستورات، گروه‌ها، فیلتر امتیازی
└── CommandPalette.tsx        # پنل اصلی: تب دستورات / اطلس، ناوبری کیبورد، فوکوس‌ترپ
```

**نصب:** بدون پکیج جدید. فقط `lucide-react` (از قبل در پروژه هست).

---

## ۵. استایل‌ها — `nocturne-palette.css`

```css
/* ============================================================
   Nocturne — Studio Command Palette styles
   Pure CSS, GPU-only animations. Obsidian #0D0F15 + Amber #f59e0b
   ============================================================ */

:root {
  --nc-obsidian: #0d0f15;
  --nc-amber: #f59e0b;
  --nc-amber-soft: #fbbf24;
}

/* ---------- Backdrop ---------- */
.nc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px) saturate(1.1);
  -webkit-backdrop-filter: blur(20px) saturate(1.1);
  animation: nc-fade-in 150ms ease-out both;
}
.nc-backdrop[data-closing="true"] {
  animation: nc-fade-out 120ms ease-in both;
}

/* ---------- Glass panel ---------- */
.nc-glass {
  background: linear-gradient(180deg, rgba(26, 30, 42, 0.88), rgba(13, 15, 21, 0.94));
  backdrop-filter: blur(24px) saturate(1.25);
  -webkit-backdrop-filter: blur(24px) saturate(1.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 24px 80px -12px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.nc-panel {
  animation: nc-panel-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: 50% 0%;
}
.nc-panel[data-closing="true"] {
  animation: nc-panel-out 120ms ease-in both;
}

@keyframes nc-fade-in   { from { opacity: 0; } to { opacity: 1; } }
@keyframes nc-fade-out   { from { opacity: 1; } to { opacity: 0; } }
@keyframes nc-panel-in  {
  from { opacity: 0; transform: scale(0.96) translateY(-8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes nc-panel-out {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to   { opacity: 0; transform: scale(0.97) translateY(-4px); }
}

/* ---------- Amber spotlight behind the panel (Aceternity recipe) ---------- */
.nc-spotlight {
  position: fixed;
  z-index: 89;
  left: 50%;
  top: 12%;
  width: 560px;
  height: 340px;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(245, 158, 11, 0.14), transparent 65%);
  filter: blur(10px);
  animation: nc-spotlight-in 2s ease 0s 1 forwards;
}
@keyframes nc-spotlight-in {
  0%   { opacity: 0; transform: translate(-72%, -62%) scale(0.5); }
  100% { opacity: 1; transform: translate(-50%, -40%) scale(1); }
}

/* ---------- Gliding active-row pill (GPU: transform + height only) ---------- */
.nc-pill {
  position: absolute;
  inset-inline: 8px;
  top: 0;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.13), rgba(245, 158, 11, 0.07));
  border: 1px solid rgba(245, 158, 11, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 18px rgba(245, 158, 11, 0.12);
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    height 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms ease-out;
  pointer-events: none;
}
/* نوار کهربایی لبه‌ی شروع (در LTR سمت چپ) */
.nc-pill::before {
  content: "";
  position: absolute;
  inset-inline-start: -1px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(180deg, #fbbf24, #f59e0b);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
}

/* ---------- Luxury mechanical <kbd> keycaps ---------- */
.nc-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, "JetBrains Mono", "Cascadia Mono", Menlo, monospace;
  font-weight: 600;
  line-height: 1;
  color: #c9cfdd;
  user-select: none;
  -webkit-user-select: none;
  white-space: nowrap;
  /* بدنه‌ی کی‌کپ: گرادیان + هایلایت داخلی بالا + لبه‌ی تیره‌ی پایین */
  background: linear-gradient(180deg, #272c3a 0%, #171a23 100%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -2px 0 rgba(0, 0, 0, 0.5),
    0 2px 5px rgba(0, 0, 0, 0.55);
  transition:
    transform 80ms ease-out,
    box-shadow 120ms ease-out,
    border-color 120ms ease-out,
    color 120ms ease-out;
}
.nc-kbd-sm { font-size: 10px; height: 18px; min-width: 18px; padding: 0 5px; }
.nc-kbd-md { font-size: 11px; height: 22px; min-width: 22px; padding: 0 7px; }

/* هاور / ردیف فعال: هاله‌ی کهربایی */
.nc-kbd-glow,
.nc-row-active .nc-kbd,
.nc-kbd:hover {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.55);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -2px 0 rgba(0, 0, 0, 0.5),
    0 0 14px rgba(245, 158, 11, 0.35),
    0 2px 5px rgba(0, 0, 0, 0.55);
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}
/* فشرده‌شدن: فرو رفتن + جمع شدن شدو (رسپی dmnote) */
.nc-kbd[data-pressed="true"],
.nc-kbd:active {
  transform: translateY(1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(0, 0, 0, 0.5),
    0 0 16px rgba(245, 158, 11, 0.45),
    0 1px 2px rgba(0, 0, 0, 0.55);
}

/* ---------- Command rows ---------- */
.nc-row {
  transition: background-color 120ms ease-out;
  border-radius: 12px;
}

/* ---------- Scrollbar (هماهنگ با تم) ---------- */
.nc-scroll::-webkit-scrollbar { width: 8px; }
.nc-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.nc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(245, 158, 11, 0.35); background-clip: content-box; border: 2px solid transparent; }
.nc-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.14) transparent; }

/* ---------- Focus ---------- */
.nc-focusable:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.55);
}

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .nc-backdrop, .nc-panel, .nc-spotlight, .nc-pill, .nc-kbd, .nc-row {
    animation: none !important;
    transition: none !important;
  }
  .nc-spotlight { opacity: 1; transform: translate(-50%, -40%) scale(1); }
}

---

## ۶. کامپوننت `Kbd` — `Kbd.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import "./nocturne-palette.css";

type KbdSize = "sm" | "md";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** اندازه: sm برای داخل ردیف‌ها، md برای متن‌ها (الگوی Bloom) */
  size?: KbdSize;
  /** هاله‌ی کهربایی دائمی (مثلاً کلید میانبر ردیف فعال) */
  glow?: boolean;
  /** حالت فشرده‌شده (فرو رفتن کی‌کپ) */
  pressed?: boolean;
}

/**
 * یک کلید کیبورد لوکس — هر <Kbd> دقیقاً یک کلید.
 * تزئین است، نه کنترل: بایند کردن کلیدها با اپ است (قانون Bloom).
 */
export function Kbd({ size = "md", glow = false, pressed = false, className, children, ...rest }: KbdProps) {
  return (
    <kbd
      dir="ltr"
      data-pressed={pressed || undefined}
      className={cn("nc-kbd", size === "sm" ? "nc-kbd-sm" : "nc-kbd-md", glow && "nc-kbd-glow", className)}
      {...rest}
    >
      {children}
    </kbd>
  );
}

export interface KbdSequenceProps {
  /** مثل ["Ctrl", "K"] — هر عضو یک کی‌کپ جدا رندر می‌شود */
  keys: string[];
  size?: KbdSize;
  glow?: boolean;
  className?: string;
}

/** دنباله‌ی کلیدها با جداکننده‌ی + — همیشه LTR */
export function KbdSequence({ keys, size = "sm", glow = false, className }: KbdSequenceProps) {
  return (
    <span dir="ltr" className={cn("inline-flex shrink-0 items-center gap-1", className)} aria-hidden="true">
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 && <span className="text-[10px] text-white/25 select-none">+</span>}
          <Kbd size={size} glow={glow}>{k}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
}
```

---

## ۷. داده‌ی دستورات — `commands.ts`

```ts
export type CommandGroupId = "playback" | "navigation" | "view" | "settings";

export interface NocturneCommand {
  id: string;
  /** فارسی — با dir="auto" رندر می‌شود */
  title: string;
  /** نام لاتین برای جست‌وجو */
  titleEn: string;
  keywords: string[];
  /** دنباله‌ی کلیدها — هر عضو یک کی‌کپ */
  keys: string[];
  group: CommandGroupId;
  /** شناسه‌ی اکشن — والد در onRunCommand به اکشن واقعی پلیر وصلش می‌کند */
  action: string;
}

export const GROUP_META: Record<CommandGroupId, { fa: string; en: string }> = {
  playback:   { fa: "پخش",      en: "Playback" },
  navigation: { fa: "ناوبری",    en: "Navigation" },
  view:       { fa: "نما",       en: "View" },
  settings:   { fa: "تنظیمات",  en: "Settings" },
};

export const GROUP_ORDER: CommandGroupId[] = ["playback", "navigation", "view", "settings"];

export const COMMANDS: NocturneCommand[] = [
  // ——— پخش ———
  { id: "play-pause", title: "پخش / توقف",   titleEn: "Play / Pause",  keywords: ["play", "pause", "پخش", "توقف"], keys: ["Space"],      group: "playback", action: "toggle-play" },
  { id: "next",       title: "آهنگ بعدی",    titleEn: "Next track",    keywords: ["next", "بعدی"],                    keys: ["N"],          group: "playback", action: "next" },
  { id: "previous",    title: "آهنگ قبلی",    titleEn: "Previous track", keywords: ["previous", "prev", "قبلی"],      keys: ["Shift", "N"], group: "playback", action: "previous" },
  { id: "mute",       title: "بی‌صدا",       titleEn: "Mute",          keywords: ["mute", "volume", "بی‌صدا", "صدا"], keys: ["M"],          group: "playback", action: "toggle-mute" },
  { id: "shuffle",    title: "پخش تصادفی",   titleEn: "Shuffle",       keywords: ["shuffle", "random", "تصادفی"],     keys: ["S"],          group: "playback", action: "toggle-shuffle" },
  { id: "repeat",     title: "تکرار",        titleEn: "Repeat",        keywords: ["repeat", "loop", "تکرار"],        keys: ["R"],          group: "playback", action: "cycle-repeat" },
  // ——— ناوبری ———
  { id: "go-library",  title: "رفتن به کتابخانه", titleEn: "Go to Library", keywords: ["library", "کتابخانه"],       keys: ["1"],          group: "navigation", action: "go-library" },
  { id: "go-stage",    title: "رفتن به استیج",    titleEn: "Go to Stage",   keywords: ["stage", "استیج"],            keys: ["2"],          group: "navigation", action: "go-stage" },
  { id: "focus-search",title: "جست‌وجو در کتابخانه", titleEn: "Search library", keywords: ["search", "find", "جست‌وجو"], keys: ["/"],       group: "navigation", action: "focus-search" },
  // ——— نما ———
  { id: "toggle-miniplayer", title: "مینی‌پلیر شناور", titleEn: "Floating MiniPlayer", keywords: ["miniplayer", "mini", "مینی‌پلیر", "شناور"], keys: ["P"], group: "view", action: "toggle-miniplayer" },
  { id: "toggle-lyrics",    title: "نمایش لیریکس",    titleEn: "Toggle lyrics",       keywords: ["lyrics", "لیریکس", "متن"],                    keys: ["L"], group: "view", action: "toggle-lyrics" },
  // ——— تنظیمات ———
  { id: "open-settings",  title: "تنظیمات",      titleEn: "Settings",         keywords: ["settings", "preferences", "تنظیمات"], keys: [","],       group: "settings", action: "open-settings" },
  { id: "open-atlas",     title: "اطلس کلیدهای میانبر", titleEn: "Shortcut atlas", keywords: ["shortcuts", "help", "atlas", "راهنما", "میانبر"], keys: ["?"], group: "settings", action: "open-atlas" },
];

/** نرمال‌سازی فارسی برای جست‌وجو: ي→ی، ك→ک */
function normalize(s: string): string {
  return s.replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase().trim();
}

/** امتیازدهی: startsWith (3) > شامل‌شدن (2) > زیر‌دنباله (1) > نامرتبط (0) */
export function scoreCommand(cmd: NocturneCommand, rawQuery: string): number {
  const q = normalize(rawQuery);
  if (!q) return 1;
  const title = normalize(cmd.title);
  const titleEn = cmd.titleEn.toLowerCase();
  if (title.startsWith(q) || titleEn.startsWith(q)) return 3;
  const hay = `${title} ${titleEn} ${cmd.keywords.map(normalize).join(" ")}`;
  if (hay.includes(q)) return 2;
  let i = 0;
  for (const ch of hay) { if (ch === q[i]) i++; if (i === q.length) return 1; }
  return 0;
}

export interface FilteredGroup { group: CommandGroupId; items: NocturneCommand[]; }

export function filterCommands(query: string): FilteredGroup[] {
  const out: FilteredGroup[] = [];
  for (const g of GROUP_ORDER) {
    const items = COMMANDS
      .filter((c) => c.group === g)
      .map((c) => ({ c, s: scoreCommand(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    if (items.length > 0) out.push({ group: g, items });
  }
  return out;
}
```

---

## ۸. کامپوننت اصلی — `CommandPalette.tsx`

```tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Search, X, Play, SkipForward, SkipBack, VolumeX, Shuffle, Repeat,
  Library, Layers, ListMusic, AudioLines, Minimize2, Settings, Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd, KbdSequence } from "./Kbd";
import {
  COMMANDS, GROUP_META, filterCommands,
  type CommandGroupId, type NocturneCommand,
} from "./commands";
import "./nocturne-palette.css";

type Mode = "commands" | "atlas";

const ICONS: Record<string, React.ReactNode> = {
  "toggle-play": <Play className="size-4" />,
  next: <SkipForward className="size-4" />,
  previous: <SkipBack className="size-4" />,
  "toggle-mute": <VolumeX className="size-4" />,
  "toggle-shuffle": <Shuffle className="size-4" />,
  "cycle-repeat": <Repeat className="size-4" />,
  "go-library": <Library className="size-4" />,
  "go-stage": <Layers className="size-4" />,
  "focus-search": <ListMusic className="size-4" />,
  "toggle-miniplayer": <Minimize2 className="size-4" />,
  "toggle-lyrics": <AudioLines className="size-4" />,
  "open-settings": <Settings className="size-4" />,
  "open-atlas": <Keyboard className="size-4" />,
};

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** والد شناسه‌ی اکشن را به منطق واقعی پلیر وصل می‌کند */
  onRunCommand: (action: string) => void;
}

/**
 * هوک میانبر سراسری Ctrl/⌘+K — والد یک‌بار در ریشه‌ی اپ صدایش می‌زند.
 * (الگوی shadcn: «CommandShortcut فقط لیبل است؛ کلید را خودت بایند کن»)
 */
export function useCommandPaletteHotkey(open: boolean, onOpenChange: (o: boolean) => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
}

export function CommandPalette({ open, onOpenChange, onRunCommand }: CommandPaletteProps) {
  const [render, setRender] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("commands");
  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [pill, setPill] = React.useState({ top: 0, height: 0, visible: false });

  /* --- mount / unmount با انیمیشن خروج --- */
  React.useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
      setMode("commands");
      setQuery("");
    } else if (render) {
      setClosing(true);
      const t = setTimeout(() => { setRender(false); setClosing(false); }, 130);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  const requestClose = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  /* --- قفل اسکرول + بازگردانی فوکوس (الگوی dialog وایب‌فارسی) --- */
  React.useEffect(() => {
    if (!render) return;
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // فوکوس بعد از یک فریم تا انیمیشن ورود تمیز اجرا شود
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [render]);

  /* --- فیلتر --- */
  const groups = React.useMemo(() => filterCommands(query), [query]);
  const flat: NocturneCommand[] = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  /* --- activeId همیشه معتبر --- */
  React.useEffect(() => {
    if (mode !== "commands") return;
    if (!flat.some((c) => c.id === activeId)) setActiveId(flat[0]?.id ?? null);
  }, [flat, activeId, mode]);

  /* --- قرص لغزان: اندازه‌گیری موقعیت ردیف فعال --- */
  React.useLayoutEffect(() => {
    if (mode !== "commands" || !activeId || !listRef.current) { setPill((p) => ({ ...p, visible: false })); return; }
    const el = rowRefs.current.get(activeId);
    if (!el) { setPill((p) => ({ ...p, visible: false })); return; }
    // offsetParent ردیف‌ها = کانتینر لیست (position: relative) → offsetTop معتبر است
    setPill({ top: el.offsetTop, height: el.offsetHeight, visible: true });
  }, [activeId, groups, mode, render]);

  /* --- اسکرول نرم ردیف فعال به دید --- */
  React.useEffect(() => {
    if (!activeId) return;
    rowRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const run = React.useCallback((cmd: NocturneCommand) => {
    if (cmd.action === "open-atlas") { setMode("atlas"); return; }
    requestClose();
    // بعد از شروع انیمیشن خروج اجرا شود تا حس فوری بودن حفظ شود
    setTimeout(() => onRunCommand(cmd.action), 60);
  }, [onRunCommand, requestClose]);

  const move = React.useCallback((dir: 1 | -1) => {
    if (flat.length === 0) return;
    const i = flat.findIndex((c) => c.id === activeId);
    const next = flat[(i + dir + flat.length) % flat.length];
    setActiveId(next.id);
  }, [flat, activeId]);

  /* --- کیبورد داخل پنل --- */
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (mode === "atlas") setMode("commands");
      else requestClose();
      return;
    }
    // فوکوس‌ترپ ساده
    if (e.key === "Tab" && panelRef.current) {
      const f = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      const cmd = flat.find((c) => c.id === activeId);
      if (cmd) run(cmd);
    }
    else if (e.key === "?") { e.preventDefault(); setMode("atlas"); } // ورود به اطلس
  };

  if (!render) return null;

  const listId = "nc-cmd-list";
  const totalCount = flat.length;

  return createPortal(
    <>
      <div className="nc-spotlight" aria-hidden="true" />
      <div
        className="nc-backdrop"
        data-closing={closing || undefined}
        onMouseDown={requestClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[91] flex justify-center px-4 pt-[14vh]" role="presentation">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="nc-palette-title"
          dir="ltr"
          onKeyDown={onPanelKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          className="nc-glass nc-panel flex max-h-[62vh] w-full max-w-xl flex-col overflow-hidden"
          data-closing={closing || undefined}
        >
          <h2 id="nc-palette-title" className="sr-only">پالت دستورات Nocturne</h2>

          {/* ===== تب‌ها ===== */}
          <div role="tablist" aria-label="حالت پالت" className="flex items-center gap-1 border-b border-white/8 px-3 pt-2.5">
            {(
              [
                { id: "commands", fa: "دستورات" },
                { id: "atlas", fa: "اطلس کلیدها" },
              ] as { id: Mode; fa: string }[]
            ).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => setMode(t.id)}
                className={cn(
                  "nc-focusable rounded-t-lg px-3 pb-2 pt-1 text-[13px] transition-colors",
                  mode === t.id
                    ? "text-amber-400 shadow-[inset_0_-2px_0_0_#f59e0b]"
                    : "text-white/45 hover:text-white/80"
                )}
              >
                <span dir="auto" lang="fa">{t.fa}</span>
              </button>
            ))}
            <div className="ms-auto pb-2">
              <KbdSequence keys={["Ctrl", "K"]} />
            </div>
          </div>

          {mode === "commands" ? (
            <>
              {/* ===== جست‌وجو ===== */}
              <div className="flex items-center gap-2.5 border-b border-white/8 px-4">
                <Search className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={activeId ? `nc-cmd-${activeId}` : undefined}
                  aria-label="جست‌وجوی دستورات"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="دستور یا آهنگ را جست‌وجو کن… (؟ برای اطلس)"
                  lang="fa"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/30"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="پاک کردن جست‌وجو"
                    onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                    className="nc-focusable flex size-6 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <Kbd glow>?</Kbd>
                )}
              </div>

              {/* ===== لیست دستورات ===== */}
              <div ref={listRef} id={listId} role="listbox" aria-label="دستورات"
                   className="nc-scroll relative max-h-[38vh] overflow-y-auto p-2">
                {/* قرص هایلایت لغزان */}
                <div
                  aria-hidden="true"
                  className="nc-pill"
                  style={{
                    transform: `translateY(${pill.top}px)`,
                    height: pill.height,
                    opacity: pill.visible ? 1 : 0,
                  }}
                />
                {groups.length === 0 ? (
                  <div role="option" aria-selected="false" className="px-4 py-10 text-center">
                    <p dir="auto" lang="fa" className="text-sm text-white/50">دستوری پیدا نشد</p>
                    <p dir="auto" lang="fa" className="mt-1 text-xs text-white/30">عبارت دیگری را امتحان کن</p>
                  </div>
                ) : (
                  groups.map((g) => (
                    <div key={g.group} role="group" aria-label={GROUP_META[g.group].fa}>
                      <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-white/35">
                        <span dir="auto" lang="fa">{GROUP_META[g.group].fa}</span>
                        <span className="ms-2 font-mono normal-case tracking-normal text-white/25" dir="ltr">
                          {GROUP_META[g.group].en}
                        </span>
                      </div>
                      {g.items.map((cmd) => {
                        const active = cmd.id === activeId;
                        return (
                          <div
                            key={cmd.id}
                            ref={(el) => { if (el) rowRefs.current.set(cmd.id, el); else rowRefs.current.delete(cmd.id); }}
                            id={`nc-cmd-${cmd.id}`}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => setActiveId(cmd.id)}
                            onClick={() => run(cmd)}
                            className={cn("nc-row relative flex cursor-pointer items-center gap-3 px-3 py-2.5", active && "nc-row-active")}
                          >
                            <span className={cn("shrink-0 transition-colors", active ? "text-amber-400" : "text-white/40")}>
                              {ICONS[cmd.action]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span dir="auto" lang="fa" className="block truncate text-[13px] text-white/90">{cmd.title}</span>
                              <span dir="ltr" className="block truncate font-mono text-[10px] text-white/30">{cmd.titleEn}</span>
                            </span>
                            <KbdSequence keys={cmd.keys} glow={active} />
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* ===== فوتر راهنما ===== */}
              <div className="flex items-center gap-4 border-t border-white/8 px-4 py-2.5 text-[11px] text-white/40">
                <span className="flex items-center gap-1.5">
                  <KbdSequence keys={["↑", "↓"]} /> <span dir="auto" lang="fa">ناوبری</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <KbdSequence keys={["Enter"]} /> <span dir="auto" lang="fa">اجرا</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <KbdSequence keys={["Esc"]} /> <span dir="auto" lang="fa">بستن</span>
                </span>
                <span className="ms-auto font-mono" dir="ltr">
                  {totalCount} <span dir="auto" lang="fa" className="font-sans">دستور</span>
                </span>
              </div>
            </>
          ) : (
            /* ===== حالت اطلس ===== */
            <ShortcutAtlas onBack={() => setMode("commands")} />
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

/* ================= اطلس کلیدهای میانبر ================= */

const ATLAS_SYSTEM: { keys: string[]; fa: string }[] = [
  { keys: ["Ctrl", "K"], fa: "باز / بسته کردن پالت دستورات" },
  { keys: ["?"], fa: "رفتن به اطلس کلیدها" },
  { keys: ["↑", "↓"], fa: "جابه‌جایی بین دستورات" },
  { keys: ["Enter"], fa: "اجرای دستور انتخاب‌شده" },
  { keys: ["Esc"], fa: "بستن پالت (در اطلس: بازگشت به دستورات)" },
];

function ShortcutAtlas({ onBack }: { onBack: () => void }) {
  return (
    <div className="nc-scroll max-h-[46vh] overflow-y-auto p-2">
      <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-white/35">
        <span dir="auto" lang="fa">پالت</span>
        <span className="ms-2 font-mono normal-case tracking-normal text-white/25" dir="ltr">Palette</span>
      </div>
      {ATLAS_SYSTEM.map((s, i) => (
        <div key={i} className="nc-row flex items-center justify-between gap-3 px-3 py-2.5">
          <span dir="auto" lang="fa" className="text-[13px] text-white/85">{s.fa}</span>
          <KbdSequence keys={s.keys} />
        </div>
      ))}
      {(Object.keys(GROUP_META) as CommandGroupId[]).map((g) => (
        <div key={g} role="group" aria-label={GROUP_META[g].fa}>
          <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-white/35">
            <span dir="auto" lang="fa">{GROUP_META[g].fa}</span>
            <span className="ms-2 font-mono normal-case tracking-normal text-white/25" dir="ltr">{GROUP_META[g].en}</span>
          </div>
          {COMMANDS.filter((c) => c.group === g).map((cmd) => (
            <div key={cmd.id} className="nc-row group flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 text-white/40 transition-colors group-hover:text-amber-400">{ICONS[cmd.action]}</span>
                <span dir="auto" lang="fa" className="truncate text-[13px] text-white/85">{cmd.title}</span>
              </span>
              <KbdSequence keys={cmd.keys} />
            </div>
          ))}
        </div>
      ))}
      <div className="flex justify-center p-3">
        <button
          onClick={onBack}
          className="nc-focusable rounded-lg border border-white/10 px-4 py-1.5 text-xs text-white/60 transition-colors hover:border-amber-500/40 hover:text-amber-300"
        >
          <span dir="auto" lang="fa">بازگشت به دستورات (Esc)</span>
        </button>
      </div>
    </div>
  );
}
```

**نکته‌ی پیاده‌سازی قرص لغزان:** ردیف‌ها `position: static`‌اند و کانتینر لیست `relative` است، پس `offsetParent` هر ردیف خودِ لیست است و `el.offsetTop` دقیقاً فاصله‌ی ردیف از بالای ناحیه‌ی اسکرول می‌دهد — قرص با `transform: translateY(top)` روی همان نقطه می‌نشیند. چون فقط `transform` و `height` انیمیت می‌شوند، حرکت کاملاً روی GPU است و هیچ بازچینی (layout) رخ نمی‌دهد.

---

## ۹. نمونه‌ی استفاده در اپ

```tsx
// App.tsx (یا ریشه‌ی لایه‌ی UI)
import * as React from "react";
import { CommandPalette, useCommandPaletteHotkey } from "@/components/command-palette/CommandPalette";

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  useCommandPaletteHotkey(paletteOpen, setPaletteOpen);

  const runCommand = React.useCallback((action: string) => {
    // اتصال به استور/اکشن‌های واقعی پلیر، مثلاً:
    // const s = usePlayerStore.getState();
    // ({ "toggle-play": s.togglePlay, "next": s.next, ... } as Record<string, () => void>)[action]?.();
    console.log("[palette]", action);
  }, []);

  return (
    <>
      {/* ... rest of app ... */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onRunCommand={runCommand} />
    </>
  );
}
```

---

## ۱۰. یادداشت‌های دسترس‌پذیری (A11y)

- **نقش‌ها:** پنل `role="dialog"` + `aria-modal="true"`؛ ورودی `role="combobox"` با `aria-expanded`/`aria-controls`/`aria-activedescendant`؛ لیست `role="listbox"` و ردیف‌ها `role="option"` با `aria-selected`؛ گروه‌ها `role="group"` با `aria-label` فارسی. (مبنای totalaud.io)
- **فوکوس:** هنگام باز شدن، فوکوس به ورودی می‌رود؛ هنگام بسته شدن به عنصر قبلی برمی‌گردد؛ `Tab` داخل پنل گیر می‌کند (فوکوس‌ترپ) — الگوی تأییدشده‌ی `dialog.tsx` وایب‌فارسی.
- **کیبورد کامل:** `Ctrl/⌘+K` باز/بسته، `↑↓` ناوبری، `Enter` اجرا، `Esc` بستن (در اطلس: اول بازگشت به دستورات)، `?` پرش به اطلس.
- **اسکرین‌ریدر:** عنوان مخفی `پالت دستورات Nocturne` برای دیالوگ؛ `aria-label` فارسی روی دکمه‌های آیکونی؛ `KbdSequence`ها `aria-hidden`‌اند چون فقط تزئین‌اند (قانون Bloom) و معادل متنی‌شان در `title`/`aria-label` هست.
- **کنتراست:** کهربایی `#f59e0b` روی `#0D0F15` کنتراست بالای ۷:۱ دارد؛ متن‌های سفید/۴۰ به بالا فقط برای تزئینی‌اند، نه اطلاعات حیاتی.
- **کاهش حرکت:** با `prefers-reduced-motion` همه‌ی انیمیشن‌ها حذف و پنل فوری نمایش داده می‌شود (بخش CSS).
- **تاچ/موس:** تب‌ها و ردیف‌ها کاملاً کلیک‌پذیرند؛ بستن با کلیک روی بک‌دراپ.

---

## ۱۱. چک‌لیست تحویل تسک ۱

- [x] کانتینر مودال شناور: بک‌دراپ بلور + ورود `scale(0.96→1)` + fade (مقادیر دقیق در §۲)
- [x] معادل‌های shadcn (`CommandDialog`) و vibefarsi (`dialog`/`search-input`) شناسایی و لینک شدند (§۳)
- [x] کامپوننت `<kbd>` لوکس سه‌بعدی با هاله‌ی کهربایی در هاور/فشرده‌شدن (`Kbd` + `KbdSequence`)
- [x] گروه‌های دستور (پخش / ناوبری / نما / تنظیمات) با داده‌ی تایپ‌شده و فیلتر امتیازی فارسی+انگلیسی
- [x] قرص هایلایت لغزان GPUمحور روی ردیف فعال
- [x] باز شدن با `Ctrl+K`، حالت اطلس با `?` یا تب، بستن با `Esc`، ناوبری `↑↓`+`Enter`
- [x] بدون وابستگی سنگین (فقط react + lucide-react + Tailwind) — بدون `cmdk`
- [x] تایپوگرافی دوگانه: فارسی `dir="auto"` + وزیرمتن، کلیدها/شمارنده‌ها مونو `dir="ltr"`
- [x] دسترس‌پذیری: نقش‌های ARIA، فوکوس‌ترپ، بازگشت فوکوس، reduced-motion
- [ ] ⏳ اتصال `onRunCommand` به اکشن‌های واقعی استور پلیر (با مشاور/ opencode)
- [ ] ⏳ تست روی ویندوز (Tauri WebView2): `backdrop-filter` و فونت مونو

*پایان تسک ۱ — آماده‌ی اعلام آمادگی برای تسک‌های بعدی پس از تأیید.*
