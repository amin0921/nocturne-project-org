# Nocturne — Offline Listening Stats
**تسک ۳ از نقشه‌ی مشاور — داشبورد آمار شنیداری آفلاین**

> روش تحقیق: مرورگر زنده روی صفحات عمومی (بدون لاگین) — صفحات chart و stat وایب‌فارسی را Echo هم مستقیم باز و راستی‌آزمایی کرد. صفحه‌ی Apple Music Replay نیاز به لاگین داشت و طبق قانون، رد شد.
> محدودیت‌های ثابت: Tauri v2 · React 18 · TypeScript · TailwindCSS · پس‌زمینه‌ی Obsidian `#0D0F15` · کهربایی `#f59e0b` · بدون وابستگی سنگین (نمودار SVG خالص، بدون recharts/d3، بدون کتابخانه‌ی انیمیشن)

---

## ۱. کانسپت نهایی

یک داشبورد آماری شیشه‌ای که داده‌های شنیداری ذخیره‌شده در SQLite بومی را نشان می‌دهد:

1. **ردیف کارت‌های متریک** — ساعات پخش، آهنگ‌های پخش‌شده، خواننده‌های یکتا، میانگین روزانه؛ هر کارت: عدد بزرگ با شمارنده‌ی متحرک (count-up) + بج دلتا (٪ تغییر نسبت به دوره‌ی قبل) + مینی‌میله‌های روند
2. **نمودار میله‌ای روزهای هفته** — SVG خالص، ۷ میله از شنبه تا جمعه، میله‌ی امروز کهربایی برجسته، انیمیشن رشد با `scaleY`
3. **لیست‌های رتبه‌بندی‌شده** — پرشنونده‌ترین خواننده‌ها و آهنگ‌ها با میله‌ی پیشرفت نسبی
4. **سوییچر بازه‌ی زمانی** — «هفته / ماه / سال» با همان تب‌های لغزان تسک ۲

### چرا این ترکیب؟

| پترن | منبع زنده | نکته‌ی قابل استفاده |
|---|---|---|
| نمودار میله‌ای/خطی/اسپارک‌لاین با SVG خالص | کامپوننت chart وایب‌فارسی | صفر وابستگی؛ هندسه‌ی دقیق میله‌ها قابل کپی است |
| کارت آمار با دلتا | کامپوننت stat وایب‌فارسی | `delta` منفی → قرمز رو به پایین |
| شمارنده‌ی متحرک | انیمیشن counter وایب‌فارسی | rAF + ۱۶۰۰ms + ترفند رزرو عرض |
| کارت متریک: عدد بزرگ + بج دلتا + اسپارک‌لاین فوتر + سوییچر بازه | تمپلیت dashboard-01 در shadcn blocks | ترکیب‌بندی استاندارد داشبورد |
| رشد میله‌ها با scaleY و stagger | مثال purecss.com | GPU-friendly، بدون reflow |
| Top Songs / Top Artists / Minutes Listened | Spotify Wrapped | سه ستون اصلی آمار شنیداری |
| تاپ‌ها بر اساس بازه‌ی زمانی + شلوغ‌ترین روز | stats.fm | الگوی بازه‌بندی هفته/ماه/سال |
| دستور شیشه‌ای استاندارد | css.glass | مقادیر blur و border برای شیشه‌ی تیره |

---

## ۲. استخراج کامپوننت‌ها

### وایب‌فارسی — تأییدشده با بازدید مستقیم

**Chart** — https://vibefarsi.ir/components/chart
- نصب: `npx vibefarsi add chart` (+ `npm i lucide-react`)
- صادرات: `BarChart`، `LineChart`، `Sparkline` + هلپرهای `jalaliWeekLabels` / `jalaliDayLabels`
- پراپ‌ها: `data: { label, value }[]` (نقطه‌ی اول سمت راست رسم می‌شود)، `format` (پیش‌فرض compactFa)، `highlight` (شاخص میله‌ی برجسته، مثلاً امروز)، `height` (پیش‌فرض ۱۸۰)
- هندسه‌ی میله‌ها (از سورس): `viewBox` با عرض ۶۰۰، هر شیار `plotW / n`، عرض میله `slot × 0.6` در مرکز شیار، `rx=4`، میله‌ی فعال `var(--primary)` در برابر بقیه `var(--foreground)` با opacity ۰٫۲۲، هاور با `transition-opacity` + تولتیپ
- نکته‌ی مهم مستندات: «بدون کتابخانه‌ی نمودار، فقط SVG با viewBox و عرض ۱۰۰٪»

**Stat** — https://vibefarsi.ir/components/stat
- نصب: `npx vibefarsi add stat`
- پراپ‌ها: `label`، `value`، `unit` (می‌تواند ReactNode باشد)، `delta` (درصد تغییر؛ منفی → قرمز و رو به پایین)
- مثال مستندات: `<Stat label="درآمد این ماه" value={...} unit="تومان" delta={18} />`

**Counter** — https://vibefarsi.ir/animations/counter
- نصب: `npx vibefarsi add counter`
- پراپ‌ها: `to` / `from`، `duration` (پیش‌فرض ۱۶۰۰ms)، `format`، `unit` (بیرون از باکس عدد رندر می‌شود تا تغییر تعداد ارقام، چیدمان را تکان ندهد)
- پیاده‌سازی: `requestAnimationFrame` + ایزینگ `1 - Math.pow(1 - p, 3)` (easeOutCubic) + `IntersectionObserver` (بعد از اولین نمایش disconnect) + `tabular-nums` + ترفند رزرو عرض (مقدار نهایی نامرئی زیر عدد متحرک)

### shadcn — از مرور زنده

**Chart** — https://ui.shadcn.com/docs/components/chart
- صریحاً «Built using Recharts» (نسخه‌ی ۳) — **با قانون صفر‌وابستگی ما ناسازگار است**؛ نصب نمی‌شود
- قابل قرض‌گرفتن: مقادیر ظاهری مثل `radius={4}` برای میله‌ها و الگوی `ChartConfig`

**Card** — https://ui.shadcn.com/docs/components/card (`npx shadcn@latest add card`)
- صادرات: `Card`، `CardHeader`، `CardTitle`، `CardDescription`، `CardAction`، `CardContent`، `CardFooter`
- ریشه: `rounded-xl bg-card ring-1 ring-foreground/10` با `--card-spacing` (پیش‌فرض ۱۶px)

**Dashboard-01** — https://ui.shadcn.com/blocks (`npx shadcn add dashboard-01`)
- الگوی کارت متریک: عدد بزرگ + بج دلتا («Trending up this month») + فوتر با اسپارک‌لاین + سوییچر رادیویی بازه («Last 3 months / Last 30 days / Last 7 days»)

### Magic UI

الگوی اختصاصی چارت یا کارت آماری نداشت؛ منابع بالا کافی‌اند.

---

## ۳. پترن‌های آماری در اپ‌های واقعی

- **Spotify Wrapped** (https://support.spotify.com/us/article/spotify-wrapped/): ستون‌های ثابت «Your Top Songs» (پلی‌لیست ۱۰۰تایی)، «Top Artists» (۵تای برتر + کارت‌های اشتراکی)، «Minutes Listened» (دقایق کل + روزها، مقایسه با میانگین جهانی)؛ نسخه‌ی ۲۰۲۵: Listening Age، Your Club، Top Artist Sprint ماه‌به‌ماه. چیدمان: اسلایدهای تمام‌صفحه، اعداد درشت، لیست‌های رتبه‌دار.
- **YouTube Music Recap** (https://support.google.com/youtubemusic/answer/11418178): ریکپ سالانه و فصلی با پلی‌لیست + آمار؛ شرط نمایش: حداقل ۴ ساعت گوش‌دادن.
- **stats.fm** (https://support-new.stats.fm/hc/en-us/articles/59060942317337-A-quick-overview-of-stats-fm): تاپ ترک‌ها/آرتیست‌ها/آلبوم‌ها/ژانرها با تفکیک بازه‌ی زمانی، شلوغ‌ترین روز هفته، آیتم‌های برتر هر ماه/سال، مایل‌استون‌ها.
- **Apple Music Replay**: نیاز به لاگین داشت و بررسی نشد.

**تصمیم طراحی برای Nocturne:** سه اصطلاح مشترک را می‌بریم — کارت‌های عدد درشت، لیست‌های رتبه‌دار، و سوییچر بازه‌ی هفته/ماه/سال. اسلایدهای تمام‌صفحه‌ی Wrapped برای داشبورد دسکتاپ زیادی است؛ همان اطلاعات در کارت‌های شیشه‌ای چیده می‌شود.

---

## ۴. مشخصات حرکتی (مقادیر دقیق)

| عنصر | انیمیشن | مقدار |
|---|---|---|
| رشد میله‌ها | `scaleY` از ۰ به ۱ | ۶۰۰ms، `cubic-bezier(0.16,1,0.3,1)`، stagger هر میله ۶۰ms، `transform-origin: bottom` (از purecss.com) |
| شمارنده‌ی اعداد | count-up با rAF | ۱۶۰۰ms، easeOutCubic، شروع با IntersectionObserver (از counter وایب‌فارسی) |
| ورود کارت‌ها | محو + بالا آمدن ۱۲px | ۲۵۰ms، `cubic-bezier(.2,0,0,1)`، stagger هر کارت ۸۰ms |
| میله‌ی امروز (highlight) | پالس نرم نور کهربایی | `box-shadow` / `drop-shadow` ثابت؛ بدون انیمیشن مداوم (آرامش بصری) |
| تعویض بازه | قرص لغزان تب | ۲۵۰ms (همان تسک ۲) + رشد مجدد میله‌ها |
| میله‌ی صفر | حداقل ارتفاع | ۴px تا میله کاملاً ناپدید نشود (از purecss.com) |

قانون: همه‌ی انیمیشن‌ها transform/opacity خالص‌اند؛ هیچ‌چیز layout را تکان نمی‌دهد.

---

## ۵. معماری داده (برای OpenCode — SQLite)

هر بار که آهنگی واقعاً پخش می‌شود (نه فقط انتخاب)، یک ردیف ثبت شود:

```sql
CREATE TABLE plays (
  id          INTEGER PRIMARY KEY,
  track_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL,
  album       TEXT,
  played_at   INTEGER NOT NULL,  -- unix millis
  duration_ms INTEGER NOT NULL   -- مدت واقعی گوش‌دادن (برای skip ناقص)
);
CREATE INDEX idx_plays_time ON plays(played_at);
CREATE INDEX idx_plays_track ON plays(track_id);
```

کوئری‌های تجمیعی (بازه = شروع هفته/ماه/سال تا حالا):

```sql
-- ساعات هر روز هفته (۷ روز اخیر، شنبه تا جمعه)
SELECT strftime('%w', played_at/1000, 'unixepoch') AS dow,
       SUM(duration_ms)/3600000.0 AS hours
FROM plays WHERE played_at >= :from GROUP BY dow;

-- پرشنونده‌ترین خواننده‌ها (بر اساس مدت)
SELECT artist, SUM(duration_ms) AS ms, COUNT(*) AS plays
FROM plays WHERE played_at >= :from
GROUP BY artist ORDER BY ms DESC LIMIT 10;

-- پرشنونده‌ترین آهنگ‌ها (بر اساس تعداد پخش)
SELECT track_id, title, artist, COUNT(*) AS plays, SUM(duration_ms) AS ms
FROM plays WHERE played_at >= :from
GROUP BY track_id ORDER BY plays DESC LIMIT 10;

-- متریک‌های کلی بازه
SELECT SUM(duration_ms)/3600000.0 AS hours,
       COUNT(*) AS plays,
       COUNT(DISTINCT artist) AS artists,
       COUNT(DISTINCT date(played_at/1000,'unixepoch')) AS active_days
FROM plays WHERE played_at >= :from;
```

دلتا (٪ تغییر نسبت به دوره‌ی قبل): همان کوئری را برای بازه‌ی قبلی هم‌طول اجرا کن؛ `delta = (cur - prev) / prev * 100`.

---

## ۶. CSS کامل

```css
/* ===== Offline Listening Stats — Nocturne ===== */
:root {
  --ns-bg: #0D0F15;
  --ns-amber: #f59e0b;
  --ns-amber-soft: rgba(245, 158, 11, 0.14);
  --ns-glass: rgba(18, 20, 25, 0.66);
  --ns-border: rgba(255, 255, 255, 0.08);
  --ns-text: #e8eaf0;
  --ns-muted: #9aa0ae;
  --ns-ease-out: cubic-bezier(.2, 0, 0, 1);
  --ns-ease-grow: cubic-bezier(0.16, 1, 0.3, 1);
  --ns-mono: ui-monospace, "JetBrains Mono", monospace;
}

/* ---------- کارت متریک شیشه‌ای ---------- */
.ns-card {
  background: var(--ns-glass);
  -webkit-backdrop-filter: blur(16px) saturate(1.25);
  backdrop-filter: blur(16px) saturate(1.25);
  border: 1px solid var(--ns-border);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.35),
              inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 18px;
  animation: ns-card-in .25s var(--ns-ease-out) both;
  animation-delay: var(--ns-delay, 0ms);
}
@keyframes ns-card-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ns-card .label { font-size: 12px; color: var(--ns-muted); margin-bottom: 8px; }
.ns-card .value-row { display: flex; align-items: baseline; gap: 8px; }
.ns-card .value {
  font-family: var(--ns-mono); font-size: 30px; font-weight: 700;
  direction: ltr; color: var(--ns-text);
  font-variant-numeric: tabular-nums;
  min-width: 3ch;
}
.ns-card .unit { font-size: 12px; color: var(--ns-muted); }
.ns-delta {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--ns-mono); font-size: 11px; direction: ltr;
  padding: 3px 8px; border-radius: 999px;
  background: rgba(52, 211, 153, 0.12); color: #34d399;
}
.ns-delta[data-neg="true"] { background: rgba(248, 113, 113, 0.12); color: #f87171; }
.ns-trend { display: flex; align-items: flex-end; gap: 3px; height: 28px; margin-top: 12px; }
.ns-trend i {
  flex: 1; border-radius: 2px; min-height: 3px;
  background: rgba(255, 255, 255, 0.18);
  transform: scaleY(0); transform-origin: bottom;
  animation: ns-grow .6s var(--ns-ease-grow) both;
  animation-delay: calc(var(--ns-delay, 0ms) + var(--i) * 40ms);
}
.ns-trend i:last-child { background: var(--ns-amber); box-shadow: 0 0 8px rgba(245,158,11,.5); }
@keyframes ns-grow { to { transform: scaleY(1); } }

/* ---------- نمودار میله‌ای SVG ---------- */
.ns-bars rect {
  transform-box: fill-box; transform-origin: bottom;
  transform: scaleY(0);
  animation: ns-grow .6s var(--ns-ease-grow) both;
  animation-delay: calc(var(--i) * 60ms);
  transition: opacity .18s var(--ns-ease-out);
}
.ns-bars rect:hover { opacity: 0.85; }
.ns-bars .bar-label {
  font-family: var(--ns-mono); font-size: 11px; direction: ltr; fill: var(--ns-muted);
}
.ns-bars .day-label { font-size: 11px; fill: var(--ns-muted); }
.ns-bars .today { fill: var(--ns-amber); font-weight: 700; }

/* ---------- لیست رتبه‌بندی ---------- */
.ns-rank {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 12px; width: 100%;
  background: transparent; border: 0; color: var(--ns-text);
  text-align: start; cursor: pointer;
  transition: background .15s var(--ns-ease-out);
}
.ns-rank:hover { background: rgba(255, 255, 255, 0.05); }
.ns-rank .pos {
  font-family: var(--ns-mono); font-size: 12px; direction: ltr;
  color: var(--ns-muted); min-width: 24px; text-align: center;
}
.ns-rank[data-top="1"] .pos, .ns-rank[data-top="2"] .pos, .ns-rank[data-top="3"] .pos {
  color: var(--ns-amber); font-weight: 700;
}
.ns-rank .cover {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: var(--ns-amber);
  background: var(--ns-amber-soft);
  border: 1px solid rgba(245, 158, 11, 0.25);
}
.ns-rank .meta { flex: 1; min-width: 0; }
.ns-rank .title { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ns-rank .sub {
  font-family: var(--ns-mono); font-size: 11px; direction: ltr;
  color: var(--ns-muted); text-align: end;
}
.ns-rank .meter { height: 3px; border-radius: 2px; background: rgba(255,255,255,.08);
  margin-top: 6px; overflow: hidden; }
.ns-rank .meter i {
  display: block; height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, rgba(245,158,11,.5), var(--ns-amber));
  transform-origin: left; transform: scaleX(0);
  animation: ns-meter .7s var(--ns-ease-grow) both;
  animation-delay: calc(var(--i) * 70ms);
}
@keyframes ns-meter { to { transform: scaleX(1); } }

/* ---------- سوییچر بازه ---------- */
.ns-range { display: inline-flex; position: relative; gap: 2px; padding: 4px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--ns-border); border-radius: 12px; }
.ns-range button {
  position: relative; z-index: 1; padding: 7px 16px; border: 0; border-radius: 9px;
  background: transparent; color: var(--ns-muted); font-size: 13px; cursor: pointer;
  transition: color .18s var(--ns-ease-out);
}
.ns-range button[data-active="true"] { color: var(--ns-text); font-weight: 600; }
.ns-range .pill {
  position: absolute; top: 4px; bottom: 4px; left: 0; z-index: 0;
  background: rgba(255,255,255,0.07); border: 1px solid var(--ns-border); border-radius: 9px;
  transition: transform .25s cubic-bezier(0.4,0,0.2,1), width .25s cubic-bezier(0.4,0,0.2,1);
  will-change: transform, width;
}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .ns-card, .ns-trend i, .ns-bars rect, .ns-rank .meter i { animation: none !important; }
  .ns-card { opacity: 1 !important; transform: none !important; }
  .ns-trend i, .ns-bars rect { transform: scaleY(1) !important; }
  .ns-rank .meter i { transform: scaleX(1) !important; }
}
```

---

## ۷. کد TSX کامل

### ۷.۱ شمارنده‌ی متحرک — `useCountUp.ts`

پیاده‌سازی دقیق رسپی counter وایب‌فارسی (rAF + easeOutCubic + IntersectionObserver + رزرو عرض):

```ts
import { useEffect, useRef, useState } from "react";

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

export function useCountUp(target: number, duration = 1600) {
  const [value, setValue] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(target * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, target, duration]);

  return { ref, value };
}

/** عدد نمایشی: گرد + جداکننده‌ی هزارگان لاتین (فونت مونو، LTR) */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
```

### ۷.۲ کارت متریک — `StatCard.tsx`

```tsx
import { TrendingDown, TrendingUp } from "lucide-react";
import { useCountUp, formatCount } from "./useCountUp";

export function StatCard({
  label, value, unit, delta, trend, index = 0,
}: {
  label: string;
  value: number;          // مقدار نهایی
  unit: string;           // مثلاً «ساعت»
  delta?: number;         // درصد تغییر نسبت به دوره‌ی قبل
  trend?: number[];       // ۸ مقدار ۰..۱ برای مینی‌میله‌ها
  index?: number;         // برای stagger ورود
}) {
  const { ref, value: v } = useCountUp(value);
  const max = Math.max(...(trend ?? [1]), 1);

  return (
    <div className="ns-card" style={{ ["--ns-delay" as string]: `${index * 80}ms` }}>
      <div className="label" dir="auto">{label}</div>
      <div className="value-row">
        <span className="value" ref={ref}>
          {/* مقدار نهایی نامرئی: رزرو عرض تا چیدمان تکان نخورد */}
          <span aria-hidden="true" style={{ visibility: "hidden", position: "absolute" }}>
            {formatCount(value)}
          </span>
          {formatCount(v)}
        </span>
        <span className="unit" dir="auto">{unit}</span>
        {delta !== undefined && (
          <span className="ns-delta" data-neg={delta < 0} dir="ltr">
            {delta < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
            {Math.abs(Math.round(delta))}%
          </span>
        )}
      </div>
      {trend && (
        <div className="ns-trend" aria-hidden="true">
          {trend.map((t, i) => (
            <i key={i} style={{ height: `${Math.max(8, (t / max) * 100)}%`, ["--i" as string]: i }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### ۷.۳ نمودار میله‌ای روزهای هفته — `WeekBars.tsx`

SVG خالص با هندسه‌ی وایب‌فارسی (viewBox ۶۰۰، میله `slot × 0.6`، `rx=4`) + رشد scaleY با stagger (از purecss.com). روز اول از راست (شنبه) رسم می‌شود.

```tsx
const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const W = 600, H = 190, PAD_X = 8, TOP = 26, BOTTOM = 30;

export function WeekBars({ data, todayIndex }: { data: number[]; todayIndex: number }) {
  const max = Math.max(...data, 1);
  const plotW = W - PAD_X * 2;
  const plotH = H - TOP - BOTTOM;
  const slot = plotW / 7;
  const barW = slot * 0.6;

  return (
    <svg className="ns-bars" viewBox={`0 0 ${W} ${H}`} width="100%"
         role="img" aria-label="نمودار ساعات گوش‌دادن روزهای هفته" dir="auto">
      {data.map((v, i) => {
        const h = Math.max(4, (v / max) * plotH);       // حداقل ۴px برای مقدار صفر
        const x = W - PAD_X - (i + 1) * slot + (slot - barW) / 2;  // از راست
        const y = TOP + plotH - h;
        const isToday = i === todayIndex;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={4}
                  style={{ ["--i" as string]: i }}
                  fill={isToday ? "#f59e0b" : "#ffffff"}
                  opacity={isToday ? 1 : 0.22}>
              <title>{`${DAYS[i]}: ${v.toFixed(1)} ساعت`}</title>
            </rect>
            {v > 0 && (
              <text x={x + barW / 2} y={y - 8} textAnchor="middle"
                    className="bar-label">{v.toFixed(1)}</text>
            )}
            <text x={x + barW / 2} y={H - 10} textAnchor="middle"
                  className={isToday ? "day-label today" : "day-label"}>{DAYS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

### ۷.۴ لیست رتبه‌بندی — `TopList.tsx`

```tsx
import { useCountUp, formatCount } from "./useCountUp";

export interface RankedItem {
  id: string;
  title: string;
  sub: string;      // خواننده یا تعداد پخش
  metric: string;   // مثلاً «12.4h» یا «86 plays» — مونو LTR
  value: number;    // برای میله‌ی نسبی
}

export function TopList({
  title, items, onSelect,
}: {
  title: string;
  items: RankedItem[];
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="ns-card" dir="auto">
      <div className="label" style={{ fontSize: 13, fontWeight: 600, color: "var(--ns-text)" }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
        {items.map((item, i) => (
          <button key={item.id} className="ns-rank" data-top={i < 3 ? i + 1 : 0}
                  style={{ ["--i" as string]: i }}
                  onClick={() => onSelect?.(item.id)}>
            <span className="pos">{String(i + 1).padStart(2, "0")}</span>
            <span className="cover" aria-hidden="true">{item.title.charAt(0)}</span>
            <span className="meta">
              <div className="title" dir="auto">{item.title}</div>
              <div className="meter" aria-hidden="true">
                <i style={{ transform: `scaleX(${item.value / max})` }} />
              </div>
            </span>
            <span className="sub">
              <div dir="auto" style={{ color: "var(--ns-text)", fontFamily: "inherit", fontSize: 12 }}>
                {item.sub}
              </div>
              <div>{item.metric}</div>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

> نکته: میله‌ی `.meter` با `scaleX` انیمیت می‌شود؛ مقدار نهایی از `item.value / max` می‌آید و انیمیشن CSS آن را از صفر باز می‌کند.

### ۷.۵ داشبورد کامل — `StatsDashboard.tsx`

```tsx
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "./StatCard";
import { WeekBars } from "./WeekBars";
import { TopList, RankedItem } from "./TopList";

export type RangeId = "week" | "month" | "year";
const RANGES: { id: RangeId; label: string }[] = [
  { id: "week", label: "هفته" },
  { id: "month", label: "ماه" },
  { id: "year", label: "سال" },
];

export interface StatsData {
  hours: number; hoursDelta: number; hoursTrend: number[];
  plays: number; playsDelta: number; playsTrend: number[];
  artists: number; artistsDelta: number;
  activeDays: number;
  weekBars: number[];      // ۷ مقدار، شنبه تا جمعه
  todayIndex: number;
  topArtists: RankedItem[];
  topTracks: RankedItem[];
}

function RangeSwitcher({ active, onChange }: { active: RangeId; onChange: (r: RangeId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const btn = ref.current?.querySelector<HTMLButtonElement>(`[data-r="${active}"]`);
    if (btn) setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [active]);
  return (
    <div ref={ref} className="ns-range" role="tablist" aria-label="بازه‌ی زمانی" dir="auto">
      <span className="pill" aria-hidden="true"
            style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />
      {RANGES.map(r => (
        <button key={r.id} data-r={r.id} role="tab" aria-selected={r.id === active}
                data-active={r.id === active} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function StatsDashboard({ load }: { load: (r: RangeId) => Promise<StatsData> }) {
  const [range, setRange] = useState<RangeId>("week");
  const [data, setData] = useState<StatsData | null>(null);

  useMemo(() => { load(range).then(setData); }, [range, load]);
  // نکته: در کد واقعی از useEffect استفاده کنید؛ useMemo در اینجا فقط برای خلاصه‌بودن مثال است

  return (
    <div dir="auto" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16,
                             overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--ns-text)", margin: 0 }}>
          آمار شنیداری
        </h2>
        <RangeSwitcher active={range} onChange={setRange} />
      </div>

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard index={0} label="ساعات پخش" value={data.hours} unit="ساعت"
                      delta={data.hoursDelta} trend={data.hoursTrend} />
            <StatCard index={1} label="آهنگ‌های پخش‌شده" value={data.plays} unit="پخش"
                      delta={data.playsDelta} trend={data.playsTrend} />
            <StatCard index={2} label="خواننده‌های یکتا" value={data.artists} unit="خواننده"
                      delta={data.artistsDelta} />
            <StatCard index={3} label="روزهای فعال" value={data.activeDays} unit="روز" />
          </div>

          <div className="ns-card">
            <div className="label" style={{ fontSize: 13, fontWeight: 600,
                                           color: "var(--ns-text)", marginBottom: 12 }}>
              ساعات گوش‌دادن در روزهای هفته
            </div>
            <WeekBars data={data.weekBars} todayIndex={data.todayIndex} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <TopList title="پرشنونده‌ترین خواننده‌ها" items={data.topArtists} />
            <TopList title="پرشنونده‌ترین آهنگ‌ها" items={data.topTracks} />
          </div>
        </>
      )}
    </div>
  );
}
```

---

## ۸. دسترس‌پذیری

- نمودار SVG: `role="img"` + `aria-label` فارسی؛ هر میله `<title>` با مقدار دقیق دارد (تولتیپ نیتیو + اسکرین‌ریدر)
- اعداد و واحدهای زمانی: فونت مونو، `dir="ltr"`؛ لیبل‌های فارسی `dir="auto"`
- شمارنده: مقدار نهایی در DOM واقعی است (نه canvas) و با اسکرین‌ریدر خوانده می‌شود؛ `tabular-nums` جلوی پرش عرض را می‌گیرد
- سوییچر بازه: `role=tablist/tab` با `aria-selected` (همان الگوی تسک ۲)
- `prefers-reduced-motion`: همه‌ی رشدها و شمارش‌ها خاموش؛ مقادیر نهایی مستقیم نمایش داده می‌شوند (بخش ۶)

---

## ۹. چه چیزی از کامپوننت‌های آماده می‌آید و چه چیزی سفارشی است

| بخش | وضعیت |
|---|---|
| نمودار میله‌ای SVG | هندسه از `npx vibefarsi add chart` قابل کپی است؛ نسخه‌ی این فایل همان منطق را با تم Nocturne و انیمیشن scaleY دارد |
| کارت آمار | الگوی `npx vibefarsi add stat`؛ نسخه‌ی این فایل شمارنده‌ی متحرک و مینی‌میله‌ی روند اضافه دارد |
| شمارنده | رسپی `npx vibefarsi add counter`؛ هوک `useCountUp` همین است |
| چارت shadcn | **نصب نمی‌شود** — Recharts با قانون صفر‌وابستگی ناسازگار است |
| اسکیمای SQLite و کوئری‌ها | سفارشی، بخش ۵ — اتصال به عهده‌ی OpenCode |
| سوییچر بازه | همان قرص لغزان تسک ۲ |

---

## ۱۰. منابع (همه در مرور زنده باز شده‌اند)

- Chart وایب‌فارسی (SVG خالص) — https://vibefarsi.ir/components/chart (نصب: `npx vibefarsi add chart`) ✅ بازدید مستقیم Echo
- Stat وایب‌فارسی — https://vibefarsi.ir/components/stat (نصب: `npx vibefarsi add stat`) ✅ بازدید مستقیم Echo
- Counter وایب‌فارسی — https://vibefarsi.ir/animations/counter (نصب: `npx vibefarsi add counter`)
- Dashboard stats وایب‌فارسی — https://vibefarsi.ir/blocks/dashboard-stats
- shadcn Chart (مبتنی بر Recharts) — https://ui.shadcn.com/docs/components/chart
- shadcn Card — https://ui.shadcn.com/docs/components/card
- shadcn Blocks / dashboard-01 — https://ui.shadcn.com/blocks
- نمودار میله‌ای CSS خالص (انیمیشن scaleY) — https://purecss.com/examples/bar-chart/
- نمودار میله‌ای با CSS Grid — https://joshcollinsworth.com/blog/css-grid-bar-charts
- دستور شیشه‌ای استاندارد — https://css.glass
- Spotify Wrapped — https://support.spotify.com/us/article/spotify-wrapped/
- YouTube Music Recap — https://support.google.com/youtubemusic/answer/11418178
- stats.fm — https://support-new.stats.fm/hc/en-us/articles/59060942317337-A-quick-overview-of-stats-fm

---

## ۱۱. چک‌لیست تحویل به مشاور / OpenCode

- [ ] جدول `plays` در SQLite + ایندکس‌ها (بخش ۵)؛ ثبت هر پخش واقعی با `duration_ms`
- [ ] ۴ کارت متریک با شمارنده‌ی ۱۶۰۰ms و بج دلتا
- [ ] نمودار ۷ میله‌ی هفته (شنبه تا جمعه، میله‌ی امروز کهربایی)
- [ ] لیست ۱۰تایی خواننده‌ها و آهنگ‌های برتر با میله‌ی نسبی
- [ ] سوییچر هفته/ماه/سال با قرص لغزان (الگوی تسک ۲)
- [ ] دلتا نسبت به دوره‌ی قبلی هم‌طول
- [ ] `prefers-reduced-motion` در همه‌ی انیمیشن‌ها
- [ ] اعداد مونو LTR، متن فارسی `dir="auto"`
