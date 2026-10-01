# تحقیق فنی Dynamic Island برای لیریکس Nocturne

**پروژه:** Nocturne — Tauri v2 + React 18 + TypeScript + Tailwind CSS روی WebView2  
**ظاهر:** پنجره‌ی شفاف و بدون قاب، جزیره‌های شیشه‌ای `#121419` و رنگ تأکیدی `#EAB308`  
**محدودیت:** بدون کتابخانه‌ی سنگین انیمیشن؛ هدف نهایی 60fps روی لپ‌تاپ معمولی

## حکم نهایی

برای نسخه‌ی اول، پوسته‌ی کپسول را به‌صورت یک overlay مستقل و `position: absolute` بسازید. بازشدن با CSS Transition خالص روی `width`، `height` و `border-radius` انجام شود؛ محتوای داخل فقط با `opacity`، `transform` و blur کوتاه جابه‌جا شود.

- **بازشدن پوسته:** `420ms cubic-bezier(0.32, 0.72, 0, 1)`
- **بسته‌شدن پوسته:** `240ms` با همان easing
- **ورود محتوای کامل:** تأخیر `150ms` و مدت `200ms`
- **خروج محتوا:** `80ms` و بدون تأخیر
- **فنر مرجع کدباز:** `stiffness: 400`، `damping: 30`، `mass: 1`
- **Scale در مورف اصلی:** همیشه `1`؛ فقط برای hover و press استفاده شود
- **Backdrop filter:** ثابت بماند و مقدار blur آن انیمیت نشود

اگر بعداً reverse یا retarget کردن انیمیشن در میانه‌ی حرکت لازم شد، فقط پوسته با WAAPI یا یک spring کوچک و بدون وابستگی ارتقا پیدا کند.

---

## 1. الگوهای کدباز ارزشمند

### oksr/react-dynamic-island — مرجع اصلی معماری

ساختار آن از سه بخش جدا تشکیل شده است:

- **Root:** نگهداری state و context
- **Shell:** تغییر اندازه و فرم کپسول
- **Content/Scene:** تعویض صحنه‌ی جمع‌شده و بازشده

فنر پوسته از `400/30/1` استفاده می‌کند. محتوای جدید پس از `150ms` با `opacity` و `blur(4px → 0)` وارد می‌شود و محتوای قبلی در `80ms` خارج می‌شود.

### nanxiaobei/react-live-island — ساده‌ترین الگوی تک‌عنصری

یک boolean حالت کوچک و بزرگ را عوض می‌کند. preset پیش‌فرض از `96×30` به `400×180` می‌رود. این روش برای نسخه‌ی بدون وابستگی مناسب است، ولی انیمیشن `width/height` در هر فریم layout و paint ایجاد می‌کند.

### fluid-design-io — مرجع حالت Full و مورف ارگانیک

حالت‌های `None`، `Pill`، `Capsule`، `Split` و `Full` دارد. در حالت Full، محیط اطراف کم‌رنگ می‌شود و محتوای اصلی با blur وارد می‌شود. springهای نمونه نرم‌ترند: `stiffness: 120/180`، `damping: 30/50` و `mass: 2`. معماری مفید است، اما وابستگی Motion با قانون Nocturne جور نیست.

### eisland و آموزش CSS-only

در eisland، زمان و easing با tokenهای CSS مانند `--morph-duration` و `--morph-ease` کنترل می‌شوند. آموزش CSS-only نیز نشان می‌دهد مورف چندمرحله‌ای یک پلیر بدون کتابخانه شدنی است.

**نتیجه‌ی جست‌وجوی CodePen و Uiverse:** نمونه‌ی مستقل و قابل‌تأییدی از Uiverse ثبت نشد. برای CodePen نیز لینک کامل نمونه در دسترس نبود؛ بنابراین snippet حدسی از این دو منبع وارد پیشنهاد نشده است.

---

## 2. فرمول دقیق حرکت

```css
.stage {
  position: relative;
}

.capsule-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  contain: layout style paint;
  isolation: isolate;
}

.lyrics-capsule {
  pointer-events: auto;
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%) scale(1);
  width: 148px;
  height: 40px;
  border-radius: 999px;
  overflow: hidden;
  contain: layout style paint;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 20, 25, 0.72);
  backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  transition:
    width 420ms cubic-bezier(0.32, 0.72, 0, 1),
    height 420ms cubic-bezier(0.32, 0.72, 0, 1),
    border-radius 420ms cubic-bezier(0.32, 0.72, 0, 1),
    top 420ms cubic-bezier(0.32, 0.72, 0, 1);
}

.lyrics-capsule[data-state="expanded"] {
  top: 8px;
  width: min(560px, 92%);
  height: 420px;
  border-radius: 28px;
}

.lyrics-capsule[data-state="collapsed"] {
  width: 148px;
  height: 40px;
  border-radius: 999px;
  transition-duration: 240ms;
}

.capsule-full {
  opacity: 0;
  filter: blur(4px);
  transition: opacity 80ms, filter 80ms;
}

.lyrics-capsule[data-state="expanded"] .capsule-full {
  opacity: 1;
  filter: blur(0);
  transition: opacity 200ms 150ms, filter 200ms 150ms;
}
```

`cubic-bezier(0.32, 0.72, 0, 1)` حس حرکت iOS را تقریب می‌زند، ولی فنر فیزیکی واقعی نیست و overshoot ندارد. برای جهش محسوس می‌توان `cubic-bezier(0.34, 1.56, 0.64, 1)` را آزمایش کرد، اما برای کپسول بزرگ باید با احتیاط استفاده شود.

---

## 3. چیدمان بدون Layout Shift

اصل مهم این است که کپسول عضو جریان عادی CenterIsland نباشد. با این کار، بازشدن آن اندازه یا موقعیت کاور و عنوان‌های زیر استیج را تغییر نمی‌دهد.

1. **Overlay مستقل:** روی CenterIsland از `position: relative` و روی لایه‌ی کپسول از `position: absolute; inset: 0` استفاده شود.
2. **مرکز ثابت:** ترکیب `left: 50%` و `translateX(-50%)` باعث رشد متقارن از مرکز می‌شود. ثابت‌ماندن `top` رشد را رو به پایین هدایت می‌کند.
3. **Containment:** عبارت `contain: layout style paint` اثر layout و paint را به همان ناحیه محدود می‌کند.
4. **دو لایه‌ی محتوایی:** حالت mini و full هر دو `absolute` باشند؛ تعویضشان با opacity، transform و blur انجام شود.
5. **will-change موقت:** فقط قبل از مورف اضافه و پس از `transitionend` حذف شود. تعریف دائمی آن حافظه و منابع compositor را بی‌دلیل رزرو می‌کند.
6. **Scrim جداگانه:** اگر پس‌زمینه باید تیره شود، یک لایه‌ی جدا پشت کپسول با انیمیشن opacity استفاده شود.

### اسکلت React/TypeScript

```tsx
import { useEffect, useRef, useState } from "react";

type Line = { time: number; text: string };

type LyricsCapsuleProps = {
  currentTime: number;
  lines: Line[];
  isPlaying: boolean;
};

export function LyricsCapsule({
  currentTime,
  lines,
  isPlaying,
}: LyricsCapsuleProps) {
  const [expanded, setExpanded] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const hasLyrics = lines.length > 0;
  const visible = isPlaying || hasLyrics;

  if (!visible) return null;

  function setOpen(next: boolean) {
    shellRef.current?.classList.add("is-morphing");
    setExpanded(next);
  }

  function finishMorph(event: React.TransitionEvent<HTMLDivElement>) {
    if (
      event.target === shellRef.current &&
      event.propertyName === "width"
    ) {
      shellRef.current.classList.remove("is-morphing");
    }
  }

  return (
    <div className="capsule-layer">
      <div
        ref={shellRef}
        className="lyrics-capsule"
        data-state={expanded ? "expanded" : "collapsed"}
        data-lyrics={hasLyrics ? "available" : "missing"}
        onTransitionEnd={finishMorph}
      >
        <button
          className="capsule-mini"
          aria-expanded={expanded}
          aria-controls="lyrics-panel"
          disabled={expanded || !hasLyrics}
          onClick={() => setOpen(true)}
        >
          {isPlaying && (
            <span className="eq" aria-hidden="true">
              <span /><span /><span /><span />
            </span>
          )}
          {hasLyrics ? "Lyrics" : "No synced lyrics"}
        </button>

        <section
          id="lyrics-panel"
          className="capsule-full"
          aria-hidden={!expanded}
        >
          <button
            className="lyrics-close"
            aria-label="Close lyrics"
            tabIndex={expanded ? 0 : -1}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <LyricsCanvas currentTime={currentTime} lines={lines} />
        </section>
      </div>
    </div>
  );
}

function LyricsCanvas({ currentTime, lines }: Pick<LyricsCapsuleProps, "currentTime" | "lines">) {
  const refs = useRef<(HTMLParagraphElement | null)[]>([]);
  const active = lines.findLastIndex((line) => line.time <= currentTime);

  useEffect(() => {
    if (active < 0) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    refs.current[active]?.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <div className="lyrics-scroll" aria-live="off">
      {lines.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          ref={(node) => { refs.current[index] = node; }}
          className="lyric-line"
          data-active={index === active}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
```

### CSS تکمیلی پوسته و لیریکس

```css
.lyrics-capsule.is-morphing {
  will-change: width, height, border-radius, top;
}

.capsule-mini,
.capsule-full {
  position: absolute;
  inset: 0;
}

.capsule-full {
  visibility: hidden;
  pointer-events: none;
}

.lyrics-capsule[data-state="expanded"] .capsule-full {
  visibility: visible;
  pointer-events: auto;
}

.lyrics-capsule[data-state="expanded"] .capsule-mini {
  visibility: hidden;
  pointer-events: none;
}

.lyrics-close {
  position: absolute;
  top: 12px;
  inset-inline-end: 12px;
  z-index: 2;
}

.lyrics-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.lyric-line {
  opacity: 0.38;
  filter: blur(1.5px);
  transform: translateY(6px) scale(0.98);
  transition:
    opacity 300ms ease,
    filter 300ms ease,
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lyric-line[data-active="true"] {
  opacity: 1;
  filter: blur(0);
  transform: none;
  color: #fff;
  text-shadow: 0 0 24px rgba(234, 179, 8, 0.45);
}
```

---

## 4. مقایسه‌ی روش‌های پیاده‌سازی

### CSS Transition — انتخاب نسخه‌ی اول

- بدون وابستگی و کم‌پیچیدگی است.
- `width` و `height` در هر فریم layout و paint می‌سازند، اما روی یک سطح کوچک و contained در نسخه‌ی دسکتاپ انتخاب قابل‌قبولی است.
- محتوای داخلی باید با خواص ارزان‌تر مانند `transform` و `opacity` حرکت کند.

### FLIP — برای این مورف توصیه نمی‌شود

مزیت FLIP برای اندازه‌ها و موقعیت‌های ناشناخته است؛ اینجا ابتدا و انتهای مورف از قبل معلوم‌اند. scale غیریکنواخت ممکن است متن و گوشه‌های گرد را کج کند و به counter-scale نیاز پیدا کند.

### Web Animations API — ارتقای مرحله‌ی بعد

بدون وابستگی است و برای `reverse()`، pause، seek و تغییر جهت در میانه‌ی انیمیشن کنترل بیشتری می‌دهد. نوع property همچنان تعیین می‌کند اجرای انیمیشن composite-only باشد یا layout/paint ایجاد کند.

### Tiny helper — فقط در صورت نیاز واقعی

اگر spring فیزیکی واقعی و orchestration پیچیده ضروری شد، helper کوچک قابل بررسی است. پژوهش فعلی اندازه و نسخه‌ی معتبر یک گزینه‌ی مشخص را تأیید نکرده؛ پس برای نسخه‌ی اول هیچ helper اضافه نشود.

### هزینه‌ی propertyها در Chromium/WebView2

- **معمولاً compositor-only:** `transform` و `opacity` روی یک لایه‌ی مناسب
- **Layout و سپس paint:** `width`، `height`، `top`، `left`
- **Paint:** `border-radius` و `box-shadow`
- **وابسته به شرایط rasterization:** `filter`
- **پرهزینه:** انیمیت‌کردن مقدار `backdrop-filter`

**نکات اجرایی:**

- `box-shadow` و مقدار `backdrop-filter` هنگام مورف ثابت بمانند.
- blur کوتاه و محدود باشد؛ blur بزرگ یا پیوسته فقط پس از benchmark واقعی پذیرفته شود.
- از `translateZ(0)` به‌عنوان هک عمومی استفاده نشود.
- `content-visibility: auto` برای خود کپسول بالای صفحه مناسب نیست؛ فقط برای فهرست بسیار بلند لیریکس بررسی شود.
- ادعای 60fps باید با Chrome Performance panel در WebView2 واقعی Nocturne، روی سخت‌افزار هدف و با لیریکس واقعی سنجیده شود.

---

## 5. میکرواینترکشن‌های لوکس

هر افکت باید معنای مشخص داشته باشد: equalizer برای پخش، beam برای موجودبودن لیریکس و press feedback برای تعامل. همه‌ی آن‌ها در حالت reduced motion خاموش شوند.

```css
@property --beam-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes beam-spin {
  to { --beam-angle: 360deg; }
}

.lyrics-capsule[data-lyrics="available"] {
  border: 1px solid transparent;
  background:
    linear-gradient(#121419, #121419) padding-box,
    conic-gradient(
      from var(--beam-angle),
      transparent 0deg,
      rgba(234, 179, 8, 0.9) 40deg,
      transparent 90deg,
      rgba(255, 255, 255, 0.14) 360deg
    ) border-box;
  animation: beam-spin 2.8s linear infinite;
}

@keyframes capsule-breathe {
  0%, 100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translateX(-50%) scale(1.025);
    opacity: 0.92;
  }
}

.lyrics-capsule[data-state="collapsed"][data-idle="true"] {
  animation: capsule-breathe 3.2s ease-in-out infinite;
}

.eq {
  display: flex;
  align-items: flex-end;
  gap: 2.5px;
  height: 16px;
}

.eq > span {
  width: 3px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(to top, #eab308, #fde68a);
  transform-origin: bottom;
  animation: eq-bounce 0.9s ease-in-out infinite;
}

.eq > span:nth-child(1) { height: 60%; animation-delay: -0.2s; }
.eq > span:nth-child(2) { height: 100%; animation-delay: -0.55s; }
.eq > span:nth-child(3) { height: 45%; animation-delay: -0.35s; }
.eq > span:nth-child(4) { height: 80%; animation-delay: -0.7s; }

@keyframes eq-bounce {
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}

.lyrics-capsule::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 40%,
    rgba(255, 255, 255, 0.14) 50%,
    transparent 60%
  );
  transform: translateX(-120%);
}

.lyrics-capsule:hover::after {
  animation: shimmer-sweep 1.1s ease-in-out;
}

@keyframes shimmer-sweep {
  to { transform: translateX(120%); }
}

.lyrics-capsule[data-state="collapsed"]:hover {
  transform: translateX(-50%) translateY(-1px) scale(1.02);
}

.lyrics-capsule[data-state="collapsed"]:active {
  transform: translateX(-50%) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .lyrics-capsule,
  .eq > span {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
```

**ترتیب پیشنهادی استفاده:**

- equalizer فقط وقتی موسیقی در حال پخش است.
- edge beam فقط وقتی لیریکس قابل‌استفاده است؛ برای مصرف کمتر می‌توان آن را به hover محدود کرد.
- breathing pulse فقط در حالت idle و جمع‌شده، با دامنه‌ی حداکثر 2.5 درصد.
- shimmer فقط یک‌بار هنگام hover اجرا شود.
- hover در `160ms` و press بین `100–160ms` بماند.

---

## 6. ترتیب پیشنهادی پیاده‌سازی

1. کپسول را داخل CenterIsland و در یک `.capsule-layer` خارج از جریان عادی قرار دهید.
2. ابتدا فقط دو state ثابت `collapsed` و `expanded` را با ابعاد نهایی بسازید.
3. transition پوسته و crossfade محتوا را اضافه کنید.
4. `will-change` را در لحظه‌ی کلیک فعال و روی `transitionend` حذف کنید.
5. اسکرول خودکار خط فعال را با `scrollIntoView({ block: "center" })` وصل کنید.
6. reduced motion، دسترسی‌پذیری دکمه‌ها و مدیریت focus را تکمیل کنید.
7. فقط یک یا دو micro-interaction را فعال کنید؛ همه‌ی افکت‌ها هم‌زمان اجرا نشوند.
8. در پایان با Chrome Performance panel، باز و بسته‌شدن را روی WebView2 واقعی بررسی کنید.

---

## 7. منابع

- [oksr/react-dynamic-island](https://github.com/oksr/react-dynamic-island) — معماری، physics و content variants
- [nanxiaobei/react-live-island](https://github.com/nanxiaobei/react-live-island) — الگوی تک‌عنصری و API عمومی
- [fluid-design-io: Building an iOS Dynamic Island Clone](https://github.com/fluid-design-io/portfolio-v2/blob/HEAD/content/blog/building-ios-dynamic-island.mdx) — SVG morph و stateهای چندگانه
- [eisland frontend stack](https://github.com/jntmtmtm/eisland/blob/HEAD/web/eisland-web-docs/src/introduction/tech-stack/frontend-tech-stack.md) — tokenهای CSS برای morph
- [CSS-only Dynamic Island tutorial](https://www.youtube.com/watch?v=pwPp6l0g21A) — اثبات الگوی بدون کتابخانه
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide) — pipeline و خواص مناسب انیمیشن
- [web.dev: Compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count) — transform، opacity و مدیریت layer
- [MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) — کاربرد و هزینه‌ی منابع
- [Google Chrome performance guidance](https://github.com/googlechrome/modern-web-guidance-src/blob/HEAD/guides/performance/performance/guide.md) — containment برای widget مستقل
- [GitLens modern CSS performance](https://github.com/gitkraken/vscode-gitlens/blob/HEAD/.claude/skills/modern-css/references/performance.md) — انضباط will-change و stacking context
- [Chrome: Re-rastering composited layers](https://developer.chrome.com/blog/re-rastering-composite) — نکته‌ی scale و rasterization
- [Animated gradient border](https://dev.to/ibelick/creating-an-animated-gradient-border-with-css-33ni) — الگوی edge beam با conic-gradient
- [CSS-Tricks: Single-element loaders](https://css-tricks.com/single-element-loaders-the-bars/) — الگوی bar/equalizer
- [Apple WWDC26 Session 226](https://developer.apple.com/videos/play/wwdc2026/226/) — راهنمای تجربه‌های Dynamic Island، نه ثابت‌های داخلی حرکت

## حدود اطمینان

- هیچ منبع عمومی stiffness و damping واقعی Dynamic Island اپل را منتشر نکرده است. اعداد `400/30/1` از پیاده‌سازی کدباز oksr و اعداد دیگر از presetهای جامعه می‌آیند.
- نام «Apple signature spring curve» برای `cubic-bezier(0.32, 0.72, 0, 1)` مورد اختلاف است. این منحنی فنر فیزیکی نیست.
- CSS داخلی react-live-island در پژوهش مستقیم خوانده نشد؛ توضیح آن بر اساس قرارداد عمومی props است.
- URL کامل CodePen آموزش barmajli تأیید نشد؛ به همین دلیل فقط ویدئوی تأییدشده لینک شده است.
- نتیجه‌ی قابل‌استناد مستقلی از Uiverse ثبت نشد.
- نرخ 60fps در WebView2 واقعی Nocturne اندازه‌گیری نشده و باید روی سخت‌افزار هدف benchmark شود.
