# Nocturne — Queue Undo & History Tab
**تسک ۲ از نقشه‌ی مشاور — شبکه‌ی ایمنی و تاریخچه‌ی صف پخش**

> روش تحقیق: مرورگر زنده روی صفحات عمومی (بدون لاگین) — صفحات Tabs و Toast وایب‌فارسی را Echo هم مستقیم باز و راستی‌آزمایی کرد؛ بقیه‌ی منابع از همان مرور زنده‌ی تسک آمده‌اند.
> محدودیت‌های ثابت: Tauri v2 · React 18 · TypeScript · TailwindCSS · پس‌زمینه‌ی Obsidian `#0D0F15` · کهربایی `#f59e0b` · بدون وابستگی سنگین (CSS خالص، ترنزیشن‌های GPU، بدون Framer Motion)

---

## ۱. کانسپت نهایی

پنل «Up Next» به دو تب لغزان ارتقا پیدا می‌کند:

- **صف پخش** — آهنگ‌های بعدی، با درگ‌وهندل برای بازچینی ترتیب
- **تاریخچه** — آخرین آهنگ‌های پخش‌شده (مثل تب‌های Queue/Recents اسپاتیفای و Up Next/History اپل‌موزیک)، با کلیک برای پخش مجدد

بعد از هر درگ و بازچینی صف، یک **توست شناور ظریف** پایین پنل ظاهر می‌شود: «ترتیب صف تغییر کرد» + دکمه‌ی **Undo** + حلقه‌ی شمارش معکوس. با یک کلیک (یا `Ctrl+Z`) ترتیب قبلی برمی‌گردد. توست با هاور/فوکوس مکث می‌کند و بعد از ۵ ثانیه محو می‌شود.

### چرا این ترکیب؟

| پترن | منبع زنده | نکته‌ی قابل استفاده |
|---|---|---|
| تب‌های Queue / Recents | مستندات پشتیبانی اسپاتیفای | تاریخچه ۵۰ آهنگ اخیر، کلیک = پخش مجدد |
| تب‌های Up Next / History / Lyrics | پلیر مک اپل‌موزیک | سه‌تبی، دقیقاً الگوی ماست |
| توست Undo با شمارش معکوس | Paragon UI undo-toast | مدل commit + حلقه‌ی SVG + مکث با هاور |
| اعلان با اسلات action | کامپوننت toast وایب‌فارسی | `action: { label, onClick }` دقیقاً برای Undo ساخته شده |
| قرص لغزان تب | کامپوننت tabs وایب‌فارسی | `translateX` اندازه‌گیری‌شده + ResizeObserver، بدون وابستگی |
| FLIP برای بازچینی | مقاله‌ی Interaction Layer | ردیف‌ها ۲۶۰ms فقط با transform می‌لغزند |

---

## ۲. استخراج کامپوننت‌ها

### وایب‌فارسی — تأییدشده با بازدید مستقیم

**Tabs** — https://vibefarsi.ir/components/tabs
- نصب: `npx vibefarsi add tabs` (+ `npm i lucide-react`)
- دو واریانت: `segmented` (قرص لغزان) و `underline`
- پراپ‌ها: `value? / defaultValue / onValueChange?` و `variant?: "segmented" | "underline"`
- انیمیشن: قرص مطلق با `transition-[transform,width]`، موقعیت از `offsetLeft`/`offsetWidth` تب فعال (با `useLayoutEffect` + `ResizeObserver`)، ۱۵۰ تا ۳۰۰ میلی‌ثانیه
- کیبورد: `role=tablist/tab/tabpanel`، فقط تب فعال `tabIndex=0`، در RTL کلید ArrowLeft یعنی «بعدی»

**Toast** — https://vibefarsi.ir/components/toast
- نصب: `npx vibefarsi add toast`
- الگو: `ToastProvider` + هوک `useToast`
- API: `toast({ title, description?, variant?: "default"|"success"|"error", action?: { label, onClick }, duration? })` → برمی‌گرداند `id`؛ `dismiss(id)` و `dismissAll()`
- پراپ‌های Provider: `max` (پیش‌فرض ۳) و `position` (پیش‌فرض `bottom-start` — در RTL یعنی پایین‌راست)
- مدت پیش‌فرض: ۴۰۰۰ میلی‌ثانیه؛ انیمیشن ورود CSS خالص؛ `aria-live="polite"`؛ ظاهر شیشه‌ای با backdrop-filter

### shadcn — از مرور زنده

**Tabs** — https://ui.shadcn.com/docs/components/base/tabs (نسخه‌ی قدیمی Radix: https://ui.shadcn.com/docs/components/radix/tabs)
- پریمیتیو پیش‌فرض حالا Base UI است (نسخه‌های React Aria و Radix هم مستند شده‌اند)
- نصب: `pnpm dlx shadcn@latest add tabs`
- نکته‌ی مهم: **تب‌های آماده‌ی shadcn ایندیکیتور لغزان ندارند** — حالت فعال فقط با کلاس‌های state (`data-[state=active]`) مشخص می‌شود. قرص لغزان را باید جدا ساخت (بخش ۶).

**Sonner / Toast** — قدیمی: https://ui.shadcn.com/docs/components/radix/sonner · جدید: https://ui.shadcn.com/docs/components/base/toast · مستندات کتابخانه: https://sonner.emilkowal.ski
- نسخه‌ی قدیمی روی پکیج `sonner` امیل کوالسکی سوار است (انیمیشن‌های CSS خالص، بدون کتابخانه‌ی انیمیشن) با API آشنای `toast("...", { action: { label: "Undo", onClick } })`
- نسخه‌ی جدید Base UI Toast با `toast.add({ title, description })` و `actionProps`
- برای سقف صفر‌وابستگی ما، الگوی Provider وایب‌فارسی نزدیک‌تر است؛ sonner مرجع خوبی برای رفتار است نه برای نصب

### Magic UI

در مرور زنده، Magic UI الگوی اختصاصی برای undo-toast یا تب لغزان نداشت؛ همان منابع بالا کافی‌اند.

---

## ۳. پترن تاریخچه در پلیرهای واقعی

- **اسپاتیفای** (دسکتاپ): دکمه‌ی Play Queue در نوار پایین → سایدبار راست با تب‌های **Queue | Recents**؛ Recents یعنی ۵۰ آهنگ آخر، کلیک = پخش مجدد. (https://support.spotify.com/us/article/recent-activity/)
- **اپل‌موزیک** (مک): تب‌های صریح **Up Next | History | Lyrics**؛ در iOS با اسکرول به بالای Up Next بخش History ظاهر می‌شود با دکمه‌ی Clear. (ios.gadgethacks.com و تاپیک Apple Community)
- **یوتیوب‌موزیک**: Up Next پنل جداگانه دارد با هندل درگ (آیکون سه‌خط) برای بازچینی؛ تاریخچه جدا در پروفایل → Manage watch history. (https://support.google.com/youtubemusic/answer/6364666)
- **نزدیک‌ترین سابقه‌ی Undo در پلیر موزیک**: پلیر اوپن‌سورس **Namida** در چنج‌لاگش دکمه‌ی undo برای تغییرات پلی‌لیست دارد (github.com/namidaco/namida). «Undo reorder» به‌صورت توستِ گذرا در طبیعت کمیاب است — بیشتر اپ‌ها (مثل Illustrator با «Undo Reorder Layers») بازچینی را داخل استک undo سراسری می‌برند. الگوی OpsBrain هم خوب است: دکمه‌ی Undo که **نام عمل** را می‌گوید، مثلاً «Undo: Reorder steps» با `⌘+Z`. (https://opsbrain.io/help/capturing-workflows)

**تصمیم طراحی برای Nocturne:** تب‌های «صف پخش / تاریخچه» (مدل اپل‌موزیک مک) + توست Undo گذرا بعد از بازچینی (چون بازچینی صف عملِ کم‌ریسک و برگشت‌پذیری است، نیازی به نگه‌داشتن دائمی در استک undo نیست).

---

## ۴. مشخصات حرکتی (مقادیر دقیق)

همه‌ی مقادیر از منابع زنده استخراج شده‌اند:

| عنصر | ورود | خروج | منحنی / توضیح |
|---|---|---|---|
| توست Undo | بالا آمدن ۱۲px + محو + بلور ۴→۰، ۲۵۰ms | محو + ۸px به پایین، ۱۶۰ms | ورود `cubic-bezier(.2,0,0,1)` (decelerate)؛ خروج `cubic-bezier(.4,0,1,1)` (ease-in) — قانون نامتقارن Interaction Layer |
| حلقه‌ی شمارش معکوس | — | — | خطی (linear) روی کل مدت؛ `stroke-dashoffset` دایره‌ی SVG با شعاع ۹ |
| مدت نمایش توست | ۵۰۰۰ms (پیش‌فرض Paragon؛ وایب‌فارسی ۴۰۰۰ms) | — | با هاور/فوکوس/مخفی‌شدن تب مکث می‌شود؛ جی‌میل تا ۳۰ ثانیه قابل تنظیم است |
| قرص لغزان تب | `transform` (+ `width`)، ۲۵۰ms | — | `cubic-bezier(0.4,0,0.2,1)`؛ فقط transform → کامپوزیت GPU |
| بازچینی ردیف‌ها (FLIP) | لغزش به جای جدید ۲۶۰ms | ردیفِ در حال خروج: محو ۱۶۰ms | فقط transform، بدون layout thrash |

قانون طلایی: ورود همیشه کمی کندتر و نرم‌تر از خروج است (۲۵۰ در برابر ۱۶۰).

---

## ۵. معماری state

### Undo مبتنی بر اسنپ‌شات (نه استک عمل)

قبل از هر بازچینی، ترتیب فعلی صف (آرایه‌ی idها) در یک اسنپ‌شات ذخیره می‌شود. Undo یعنی برگرداندن همان آرایه — ساده، قابل پیش‌بینی، بدون نیاز به معکوس‌کردن عمل‌ها.

```ts
// useQueueUndo.ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface QueueSnapshot {
  order: string[];      // آرایه‌ی id آهنگ‌ها به ترتیب قبل از تغییر
  label: string;        // توضیح برای نمایش، مثلاً «ترتیب صف»
  at: number;
}

const UNDO_WINDOW_MS = 5000;

export function useQueueUndo(onRestore: (order: string[]) => void) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    setSnapshot(null);
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);

  // قبل از اعمال بازچینی صدا بزن؛ برمی‌گرداند تابعی برای ثبت نهایی
  const beginReorder = useCallback((currentOrder: string[], label = "ترتیب صف") => {
    setSnapshot({ order: [...currentOrder], label, at: Date.now() });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(clear, UNDO_WINDOW_MS);
  }, [clear]);

  const undo = useCallback(() => {
    if (!snapshot) return;
    onRestore(snapshot.order);
    clear();
  }, [snapshot, onRestore, clear]);

  // Ctrl+Z سراسری برای برگرداندن بازچینی
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && snapshot) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snapshot, undo]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return { snapshot, beginReorder, undo, dismiss: clear, windowMs: UNDO_WINDOW_MS };
}
```

### تاریخچه‌ی پخش

- سقف ۵۰ آهنگ (عدد اسپاتیفای)، جدیدترین اول
- آهنگ تکراریِ پشت‌سرهم ثبت نمی‌شود (dedupe)
- کلیک روی آهنگ تاریخی = پخش همان آهنگ؛ صف فعلی دست‌نخورده می‌ماند (قابل پیش‌بینی‌ترین رفتار؛ اگر مشاور خواست «صف از آن نقطه ادامه یابد»، یک خط کد است)

```ts
// usePlaybackHistory.ts
import { useCallback, useState } from "react";

export interface HistoryEntry { id: string; playedAt: number; }
const MAX_HISTORY = 50;

export function usePlaybackHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const push = useCallback((id: string) => {
    setHistory(prev => {
      if (prev[0]?.id === id) return prev;              // تکراری پشت‌سرهم نه
      return [{ id, playedAt: Date.now() }, ...prev].slice(0, MAX_HISTORY);
    });
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);
  return { history, push, clearHistory };
}
```

---

## ۶. قرص لغزان تب‌ها (رسپی CSS خالص)

دو رسپی هم‌راستا از مرور زنده:

1. **وایب‌فارسی** (https://vibefarsi.ir/r/components/tabs.json): موقعیت قرص از `offsetLeft`/`offsetWidth` تب فعال اندازه‌گیری می‌شود (`useLayoutEffect` + `ResizeObserver` برای ریسپانسیو) و روی یک `<span>` مطلق با `transition-[transform,width]` اعمال می‌شود. برای تب‌های با عرض متغیر (مثل «صف پخش» و «تاریخچه») همین روش درست است.
2. **CodeShack** (https://codeshack.io/sliding-tab-indicator-css/): نسخه‌ی بدون جاوااسکریپت با رادیوباتن و سلکتور `:checked ~ .glider` و `transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)` — فقط وقتی تب‌ها هم‌عرض‌اند جواب می‌دهد.

برای Nocturne رسپی اول (اندازه‌گیری‌شده) را می‌بریم چون لیبل‌های فارسی عرض متفاوت دارند.

---

## ۷. CSS کامل

```css
/* ===== Queue Undo & History — Nocturne ===== */
:root {
  --nq-bg: #0D0F15;
  --nq-amber: #f59e0b;
  --nq-amber-soft: rgba(245, 158, 11, 0.14);
  --nq-glass: rgba(18, 20, 25, 0.72);
  --nq-border: rgba(255, 255, 255, 0.08);
  --nq-text: #e8eaf0;
  --nq-muted: #9aa0ae;
  --nq-ease-out: cubic-bezier(.2, 0, 0, 1);
  --nq-ease-in: cubic-bezier(.4, 0, 1, 1);
  --nq-ease-pill: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---------- تب‌ها ---------- */
.nq-tabs { position: relative; display: flex; gap: 4px; padding: 4px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--nq-border);
  border-radius: 12px; }
.nq-tab {
  position: relative; z-index: 1; flex: 1; padding: 8px 12px;
  font-size: 13px; color: var(--nq-muted); background: transparent; border: 0;
  border-radius: 9px; cursor: pointer; white-space: nowrap;
  transition: color .18s var(--nq-ease-out);
}
.nq-tab:hover { color: var(--nq-text); }
.nq-tab[data-active="true"] { color: var(--nq-text); font-weight: 600; }
.nq-tab:focus-visible { outline: 2px solid var(--nq-amber); outline-offset: 2px; }
.nq-pill {
  position: absolute; top: 4px; bottom: 4px; left: 0; z-index: 0;
  background: rgba(255,255,255,0.07);
  border: 1px solid var(--nq-border); border-radius: 9px;
  box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06);
  transition: transform .25s var(--nq-ease-pill), width .25s var(--nq-ease-pill);
  will-change: transform, width;
}
/* زیرخط کهربایی زیر تب فعال */
.nq-tab[data-active="true"]::after {
  content: ""; position: absolute; inset-inline: 0; bottom: -1px; height: 2px;
  background: var(--nq-amber); border-radius: 2px;
  box-shadow: 0 0 8px rgba(245,158,11,.7);
}

/* ---------- توست Undo ---------- */
.nq-toast-zone {
  position: absolute; inset-inline: 0; bottom: 12px; z-index: 30;
  display: flex; justify-content: center; pointer-events: none;
}
.nq-toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 8px 10px 14px;
  background: var(--nq-glass);
  -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3);
  border: 1px solid var(--nq-border); border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07);
  color: var(--nq-text); font-size: 13px;
  animation: nq-toast-in .25s var(--nq-ease-out) both;
}
.nq-toast[data-leaving="true"] { animation: nq-toast-out .16s var(--nq-ease-in) both; }
@keyframes nq-toast-in {
  from { opacity: 0; transform: translateY(12px); filter: blur(4px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
@keyframes nq-toast-out {
  to { opacity: 0; transform: translateY(8px); filter: blur(2px); }
}
.nq-toast-undo {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; border-radius: 10px; border: 1px solid transparent;
  background: var(--nq-amber-soft); color: var(--nq-amber);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .15s var(--nq-ease-out), transform .15s var(--nq-ease-out);
}
.nq-toast-undo:hover { background: rgba(245,158,11,.22); transform: translateY(-1px); }
.nq-toast-undo:active { transform: translateY(0) scale(.97); }
.nq-toast-undo:focus-visible { outline: 2px solid var(--nq-amber); outline-offset: 2px; }
.nq-toast kbd {
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11px; direction: ltr;
  padding: 2px 6px; border-radius: 6px; border: 1px solid var(--nq-border);
  background: rgba(255,255,255,.05); color: var(--nq-muted);
}
/* حلقه‌ی شمارش معکوس */
.nq-ring { transform: rotate(-90deg); }
.nq-ring .bg { stroke: rgba(255,255,255,.1); }
.nq-ring .fg { stroke: var(--nq-amber); stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(245,158,11,.8)); }

/* ---------- ردیف‌های صف و تاریخچه ---------- */
.nq-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: 10px; background: transparent; border: 0;
  color: var(--nq-text); text-align: start; cursor: pointer;
  transition: background .15s var(--nq-ease-out), transform .26s var(--nq-ease-out);
}
.nq-row:hover { background: rgba(255,255,255,.05); }
.nq-row[data-current="true"] { background: var(--nq-amber-soft); }
.nq-row .idx {
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11px; direction: ltr;
  color: var(--nq-muted); min-width: 22px; text-align: center;
}
.nq-row .meta { flex: 1; min-width: 0; }
.nq-row .title { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nq-row .sub { font-size: 11px; color: var(--nq-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nq-row .drag {
  opacity: 0; cursor: grab; color: var(--nq-muted); padding: 4px;
  transition: opacity .15s var(--nq-ease-out);
}
.nq-row:hover .drag, .nq-row:focus-within .drag { opacity: .8; }
.nq-row .time {
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11px; direction: ltr;
  color: var(--nq-muted);
}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .nq-pill, .nq-toast, .nq-row, .nq-toast-undo { transition: none !important; animation: none !important; }
  .nq-toast { opacity: 1 !important; transform: none !important; filter: none !important; }
}
```

---

## ۸. کامپوننت‌ها (TSX)

### ۸.۱ تب‌های لغزان — `QueueTabs.tsx`

```tsx
import { useLayoutEffect, useRef, useState, useCallback } from "react";

export type QueueTabId = "queue" | "history";

const TABS: { id: QueueTabId; label: string }[] = [
  { id: "queue", label: "صف پخش" },
  { id: "history", label: "تاریخچه" },
];

export function QueueTabs({
  active, onChange, queueCount, historyCount,
}: {
  active: QueueTabId;
  onChange: (t: QueueTabId) => void;
  queueCount: number;
  historyCount: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const btn = list.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
    if (!btn) return;
    // offsetLeft فیزیکی است و در RTL هم درست کار می‌کند
    setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [active]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // در RTL: ArrowLeft یعنی تب بعدی، ArrowRight یعنی قبلی (مثل وایب‌فارسی)
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.findIndex(t => t.id === active);
    const next = e.key === "ArrowLeft" ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
    onChange(TABS[next].id);
  };

  return (
    <div ref={listRef} className="nq-tabs" role="tablist" aria-label="نمای صف"
         dir="auto" onKeyDown={onKeyDown}>
      <span className="nq-pill" aria-hidden="true"
            style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />
      {TABS.map(t => {
        const isActive = t.id === active;
        const count = t.id === "queue" ? queueCount : historyCount;
        return (
          <button key={t.id} role="tab" data-tab={t.id} data-active={isActive}
                  aria-selected={isActive} tabIndex={isActive ? 0 : -1}
                  className="nq-tab" dir="auto"
                  onClick={() => onChange(t.id)}>
            {t.label}
            <span className="idx" style={{ marginInlineStart: 6 }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
```

### ۸.۲ توست Undo — `UndoToast.tsx`

شمارش معکوس با `requestAnimationFrame` دقیق و قابل‌مکث است؛ حلقه‌ی SVG با همان پیشرفت به‌روز می‌شود (جایگزین CSS خالص برای `animationend` در مدل Paragon — بدون هیچ وابستگی).

```tsx
import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";

const R = 9;
const CIRC = 2 * Math.PI * R;

function useCountdown(durationMs: number, paused: boolean, onDone: () => void) {
  const [progress, setProgress] = useState(0); // 0 → 1
  const state = useRef({ start: 0, acc: 0, raf: 0 });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const s = state.current;
    const tick = (now: number) => {
      if (!s.start) s.start = now;
      if (!paused) s.acc += now - s.start;
      s.start = now;
      const p = Math.min(1, s.acc / durationMs);
      setProgress(p);
      if (p >= 1) { doneRef.current(); return; }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(s.raf); s.start = 0; };
  }, [durationMs, paused]);

  return progress;
}

export function UndoToast({
  message, windowMs, onUndo, onDismiss,
}: {
  message: string;
  windowMs: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(fn, 160); // هم‌زمان با انیمیشن خروج
  };

  const progress = useCountdown(windowMs, paused || leaving, () => finish(onDismiss));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(onDismiss); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // وقتی تب مرورگر مخفی است، rAF متوقف می‌شود → تایمر خودکار مکث می‌شود

  return (
    <div className="nq-toast-zone">
      <div className="nq-toast" data-leaving={leaving} role="status" aria-live="polite"
           dir="auto"
           onMouseEnter={() => setPaused(true)}
           onMouseLeave={() => setPaused(false)}
           onFocus={() => setPaused(true)}
           onBlur={() => setPaused(false)}>
        <svg className="nq-ring" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="bg" cx="12" cy="12" r={R} fill="none" strokeWidth="2.5" />
          <circle className="fg" cx="12" cy="12" r={R} fill="none" strokeWidth="2.5"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * progress} />
        </svg>
        <span>{message}</span>
        <button className="nq-toast-undo" onClick={() => finish(onUndo)} autoFocus>
          <Undo2 size={15} strokeWidth={2.2} />
          <span>Undo</span>
          <kbd>Ctrl+Z</kbd>
        </button>
        <button className="nq-toast-undo" style={{ background: "transparent", color: "var(--nq-muted)" }}
                onClick={() => finish(onDismiss)} aria-label="بستن">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
```

### ۸.۳ پنل صف + تاریخچه — `QueuePanel.tsx`

```tsx
import { useCallback, useMemo, useState } from "react";
import { GripVertical, History, ListMusic, Trash2 } from "lucide-react";
import { QueueTabs, QueueTabId } from "./QueueTabs";
import { UndoToast } from "./UndoToast";
import { useQueueUndo } from "./useQueueUndo";
import { usePlaybackHistory } from "./usePlaybackHistory";

export interface Track { id: string; title: string; artist: string; duration: string; }

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function QueuePanel({
  tracks, currentId, onReorder, onPlay, onClearHistory,
}: {
  tracks: Track[];                 // ترتیب فعلی صف
  currentId: string | null;
  onReorder: (order: string[]) => void;   // اعمال ترتیب جدید در استور
  onPlay: (id: string) => void;
  onClearHistory: () => void;
}) {
  const [tab, setTab] = useState<QueueTabId>("queue");
  const { history, push, clearHistory } = usePlaybackHistory();
  const { snapshot, beginReorder, undo, dismiss, windowMs } =
    useQueueUndo(useCallback((order: string[]) => onReorder(order), [onReorder]));

  // --- درگ ساده‌ی HTML5 (جایگزین سبک برای dnd-kit) ---
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const commitDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const order = tracks.map(t => t.id);
    beginReorder(order, "ترتیب صف");          // اسنپ‌شات قبل از تغییر
    const from = order.indexOf(dragId);
    order.splice(from, 1);
    order.splice(order.indexOf(targetId), 0, dragId);
    onReorder(order);
    setDragId(null); setOverId(null);
  };

  const historyTracks = useMemo(() => {
    const map = new Map(tracks.map(t => [t.id, t]));
    return history.map(h => ({ ...h, track: map.get(h.id) })).filter(h => h.track);
  }, [history, tracks]);

  return (
    <section className="nq-panel" aria-label="صف پخش" dir="auto"
             style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
      <QueueTabs active={tab} onChange={setTab}
                 queueCount={tracks.length} historyCount={history.length} />

      <div role="tabpanel" style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
        {tab === "queue" ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {tracks.map((t, i) => (
              <li key={t.id}>
                <div className="nq-row" data-current={t.id === currentId}
                     draggable
                     onDragStart={() => setDragId(t.id)}
                     onDragOver={e => { e.preventDefault(); setOverId(t.id); }}
                     onDragEnd={() => { setDragId(null); setOverId(null); }}
                     onDrop={() => commitDrop(t.id)}
                     onClick={() => onPlay(t.id)}
                     style={overId === t.id && dragId ? { transform: "translateY(2px)" } : undefined}>
                  <span className="drag" aria-hidden="true"><GripVertical size={14} /></span>
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <div className="meta">
                    <div className="title" dir="auto">{t.title}</div>
                    <div className="sub" dir="auto">{t.artist}</div>
                  </div>
                  <span className="time">{t.duration}</span>
                </div>
              </li>
            ))}
            {tracks.length === 0 && (
              <EmptyState icon={<ListMusic size={22} />} text="صف خالی است" />
            )}
          </ul>
        ) : (
          <>
            {historyTracks.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 8px 4px" }}>
                <button className="nq-toast-undo"
                        style={{ background: "transparent", color: "var(--nq-muted)" }}
                        onClick={() => { clearHistory(); onClearHistory(); }}>
                  <Trash2 size={14} /><span>پاک‌کردن تاریخچه</span>
                </button>
              </div>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {historyTracks.map(h => (
                <li key={`${h.id}-${h.playedAt}`}>
                  <button className="nq-row" onClick={() => onPlay(h.id!)}>
                    <span className="idx"><History size={13} /></span>
                    <div className="meta">
                      <div className="title" dir="auto">{h.track!.title}</div>
                      <div className="sub" dir="auto">{h.track!.artist}</div>
                    </div>
                    <span className="time">{fmtTime(Date.now() - h.playedAt)} پیش</span>
                  </button>
                </li>
              ))}
              {historyTracks.length === 0 && (
                <EmptyState icon={<History size={22} />} text="هنوز چیزی پخش نشده" />
              )}
            </ul>
          </>
        )}
      </div>

      {snapshot && (
        <UndoToast message="ترتیب صف تغییر کرد" windowMs={windowMs}
                   onUndo={undo} onDismiss={dismiss} />
      )}
    </section>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--nq-muted)", fontSize: 13 }}
         dir="auto">
      <div style={{ marginBottom: 8, opacity: .6 }}>{icon}</div>{text}
    </div>
  );
}

// برای اتصال به پخش‌کننده: هر بار آهنگ عوض شد push(currentId) را صدا بزن
export { usePlaybackHistory };
```

### ۸.۴ نمونه‌ی اتصال به استور

```tsx
// در کامپوننت والد (مثلاً StageView)
const queue = usePlayerStore(s => s.queue);            // Track[]
const setQueueOrder = usePlayerStore(s => s.setQueueOrder);
const playTrack = usePlayerStore(s => s.playTrack);
const currentId = usePlayerStore(s => s.currentId);

<QueuePanel
  tracks={queue}
  currentId={currentId}
  onReorder={(order) => setQueueOrder(order)}  // مرتب‌سازی آرایه بر اساس idها
  onPlay={(id) => playTrack(id)}
  onClearHistory={() => {/* در صورت ذخیره‌سازی دائمی */}}
/>
```

نکته برای OpenCode: `setQueueOrder` باید آرایه‌ی موجود را بر اساس `order: string[]` مرتب کند (نه اینکه جایگزین کند) تا آبجکت‌های آهنگ و متادیتا حفظ شوند. `push` تاریخچه را در اکشنِ «آهنگ بعدی/قبلی/انتخاب» صدا بزنید، نه در رندر.

---

## ۹. FLIP برای لغزش ردیف‌ها هنگام بازچینی

الگوی استاندارد (از مقاله‌ی Interaction Layer): قبل از تغییر DOM موقعیت هر ردیف را بخوان (`getBoundingClientRect`)، بعد از تغییر، اختلاف را با `transform: translateY(dy)` جبران کن و در یک فریم بعد transform را صفر کن تا ردیف ۲۶۰ms به جای جدید بلغزد:

```ts
export function flipList(container: HTMLElement, mutate: () => void) {
  const rows = [...container.querySelectorAll<HTMLElement>("[data-flip]")];
  const first = new Map(rows.map(r => [r.dataset.flip!, r.getBoundingClientRect().top]));
  mutate();
  rows.forEach(r => {
    const dy = (first.get(r.dataset.flip!) ?? 0) - r.getBoundingClientRect().top;
    if (!dy) return;
    r.style.transition = "none";
    r.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      r.style.transition = "transform .26s cubic-bezier(.2,0,0,1)";
      r.style.transform = "";
    });
  });
}
```

روی `.nq-row` اتریبیوت `data-flip={t.id}` بگذارید و `commitDrop` را داخل `flipList` صدا بزنید.

---

## ۱۰. دسترس‌پذیری و کیبورد

- تب‌ها: `role=tablist/tab/tabpanel`، `aria-selected`، فقط تب فعال در ترتیب تب؛ جهت‌دار بودن کلیدها در RTL (ArrowLeft = بعدی) مثل وایب‌فارسی
- توست: `role="status"` + `aria-live="polite"`؛ `Escape` می‌بندد؛ فوکوس خودکار روی دکمه‌ی Undo
- بازچینی بدون ماوس: هر ردیف با `Alt+ArrowUp/ArrowDown` هم جابه‌جا شود (در پیاده‌سازی OpenCode) و همان توست Undo ظاهر شود
- `Ctrl+Z` / `⌘+Z` ترتیب را برمی‌گرداند؛ دوباره زدن آن در همان پنجره‌ی ۵ ثانیه‌ای بی‌اثر است (اسنپ‌شات پاک شده)
- `prefers-reduced-motion`: همه‌ی ترنزیشن‌ها و انیمیشن‌ها خاموش، توست فقط ظاهر/محو می‌شود (بخش ۷)
- اعداد، شمارنده‌ها و `Ctrl+Z`: فونت مونو، `dir="ltr"`؛ متن فارسی `dir="auto"`

---

## ۱۱. چه چیزی از کامپوننت‌های آماده می‌آید و چه چیزی سفارشی است

| بخش | وضعیت |
|---|---|
| قرص لغزان تب | رسپی وایب‌فارسی قابل کپی است؛ نسخه‌ی این فایل همان منطق را با استایل Nocturne دارد |
| توست پایه (Provider) | `npx vibefarsi add toast` برای اعلان‌های عمومی اپ؛ توست Undo این فایل مستقل و تخصصی است |
| حلقه‌ی شمارش + مکث با هاور/فوکوس | سفارشی (ایده از Paragon، پیاده‌سازی با rAF بدون وابستگی) |
| اسنپ‌شات Undo + `Ctrl+Z` | سفارشی، هوک `useQueueUndo` |
| تاریخچه‌ی ۵۰تایی | سفارشی، هوک `usePlaybackHistory` |
| FLIP بازچینی | رسپی استاندارد، تابع کمکی بخش ۹ |

---

## ۱۲. منابع (همه در مرور زنده باز شده‌اند)

- Tabs وایب‌فارسی — https://vibefarsi.ir/components/tabs (نصب: `npx vibefarsi add tabs`) ✅ بازدید مستقیم Echo
- Toast وایب‌فارسی — https://vibefarsi.ir/components/toast (نصب: `npx vibefarsi add toast`) ✅ بازدید مستقیم Echo
- سورس tabs — https://vibefarsi.ir/r/components/tabs.json
- سورس toast — https://vibefarsi.ir/r/components/toast.json
- shadcn Tabs (Base UI) — https://ui.shadcn.com/docs/components/base/tabs
- shadcn Toast (Base UI) — https://ui.shadcn.com/docs/components/base/toast
- shadcn Sonner (قدیمی) — https://ui.shadcn.com/docs/components/radix/sonner
- مستندات sonner — https://sonner.emilkowal.ski
- Paragon Undo Toast (مقادیر حرکتی دقیق + مدل commit-on-timeout) — https://www.paragon-ui.com/docs/undo-toast
- راهنمای UX توست (مکث با هاور، undo به‌مثابه‌ی تراکنش) — https://codinglaboratory.com/guides/toast-notification-ux
- مقاله‌ی Gmail undo-send (مدت‌های ۵/۱۰/۲۰/۳۰ ثانیه) — https://uxdesign.cc/an-underrated-ux-gmails-undo-send
- مقاله‌ی Interaction Layer (مقادیر اسنک‌بار و FLIP) — https://www.davidpaterni.com/portfolio/case-studies/interaction-design-masterclass/
- ایندیکیتور لغزان با CSS خالص — https://codeshack.io/sliding-tab-indicator-css/
- تاریخچه‌ی اسپاتیفای — https://support.spotify.com/us/article/recent-activity/
- تاریخچه‌ی یوتیوب‌موزیک — https://support.google.com/youtubemusic/answer/6364666
- Undo در OpsBrain (نام‌گذاری عمل) — https://opsbrain.io/help/capturing-workflows
- Namida (undo برای تغییرات پلی‌لیست) — https://github.com/namidaco/namida

---

## ۱۳. چک‌لیست تحویل به مشاور / OpenCode

- [ ] تب‌های «صف پخش / تاریخچه» با قرص لغزان (transform خالص، ۲۵۰ms)
- [ ] شمارنده‌ی تعداد روی هر تب (مونو، LTR)
- [ ] درگ‌وهندل بازچینی با FLIP (۲۶۰ms)
- [ ] توست Undo: ۵ ثانیه، حلقه‌ی شمارش کهربایی، مکث با هاور/فوکوس/تب مخفی
- [ ] `Ctrl+Z` برای Undo؛ `Escape` برای بستن توست
- [ ] تاریخچه‌ی ۵۰تایی با dedupe و «پاک‌کردن تاریخچه» (مدل اپل‌موزیک)
- [ ] کلیک روی آهنگ تاریخی = پخش، بدون به‌هم‌ریختن صف
- [ ] `prefers-reduced-motion` در همه‌ی انیمیشن‌ها
- [ ] اتصال به Zustand: `setQueueOrder` (مرتب‌سازی بر اساس id) + `push` تاریخچه در اکشن تعویض آهنگ
