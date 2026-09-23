# انیمیشن‌ها برای اپ پخش موزیک Nocturne

جمع‌شده در ۲۰۲۶-۰۹-۲۲ — بهترین انیمیشن‌ها برای پلیر دسکتاپ تیره‌ی Nocturne (جزیره‌های شیشه‌ای `#121419`، لهجه‌ی کهربایی `#EAB308`)، از تب «انیمیشن‌ها»ی vibefarsi و سایت‌های پیشنهادی قبلی.

---

## ۱. انیمیشن‌های vibefarsi (انتخاب از ۴۵ انیمیشن)

منبع: https://vibefarsi.ir/animations — همه با CSS و React خالص ساخته شدن، **بدون هیچ کتابخانه‌ی اضافه‌ای**، راست‌چین، و اگه کاربر «کاهش حرکت» رو فعال کرده باشه خودشون خاموش میشن. الگوی نصب همه:

```bash
npx vibefarsi add <slug>
```

صفحه‌ی هر کدوم: `https://vibefarsi.ir/animations/<slug>`

| # | انیمیشن (slug) | چیه به زبان ساده | کاربرد در Nocturne |
|---|---|---|---|
| ۱ | حاشیه‌ی نورانی `border-beam` | یه پرتو نور که دور کارت می‌چرخه | دور کارت «آهنگ در حال پخش» توی استیج — حس زنده و سینمایی |
| ۲ | نوار متحرک `marquee` | نوار متحرک پیوسته در جهت طبیعی فارسی | عنوان/خواننده‌های طولانی که توی کادر جا نمیشن — می‌لغزن و کامل دیده میشن |
| ۳ | دکمه‌ی درخشان `shine-button` | نوار نوری که از روی دکمه رد میشه | دکمه‌ی Play اصلی پلیر |
| ۴ | بارش شهاب `meteors` | رگه‌های نوری که از بالا-راست می‌ریزن | پس‌زمینه‌ی محیطی استیج سینمایی (حالت «فضایی» پروژه) |
| ۵ | کارت نورانی `spotlight-card` | هاله‌ی نرمی که دنبال ماوس روی کارت حرکت می‌کنه | هاور روی کارت‌های کاور آلبوم |
| ۶ | کارت سه‌بعدی `tilt-card` | کارت با حرکت ماوس کج میشه | هاور سه‌بعدی روی کاور آلبوم بزرگ استیج |
| ۷ | دکمه‌ی سه‌حالته `morph-button` | سه حالت عادی/در حال انجام/انجام‌شد که درجا محو میشن | دکمه‌ی پخش: عادی → در حال لود → در حال پخش |
| ۸ | دکمه‌ی ضربان‌دار `pulse-button` | دو حلقه که پشت دکمه باز میشن | جلب توجه به دکمه‌ی Play وقتی اپ تازه باز شده |
| ۹ | فهرست متحرک `animated-list` | آیتم‌ها یکی‌یکی از راست وارد میشن | انیمیشن ورود آهنگ‌ها توی صف پخش (Queue) |
| ۱۰ | متن درخشان `text-shimmer` | نوری که از روی متن می‌گذره | عنوان آهنگ در حال پخش — حس «زنده» بودن |
| ۱۱ | حلقه‌ی پیشرفت `progress-ring` | حلقه‌ی SVG که پر میشه و درصد فارسی وسطش می‌نشینه | پیشرفت پخش به‌صورت دایره‌ای (کنار وینیل) یا نمایش ولوم |
| ۱۲ | حلقه‌ی متن `text-loop` | متن روی مسیر دایره‌ای SVG می‌چرخه | اسم آهنگ/خواننده که دور دیسک وینیل در حال چرخش می‌گرده |

**ذخیره برای بعد (اگه لازم شد):** `ripple-button` (موج لمسی دکمه‌ها)، `magnetic-button` (کشش مغناطیسی دکمه‌ها به سمت ماوس)، `blur-text` (ظهور نرم اسم آهنگ جدید از تاری)، `counter` / `odometer` (شمارنده‌ی متحرک تعداد پخش)، `sparkles` (جرقه برای بج «جدید»)، `flip-card` (برگردوندن کارت آلبوم برای دیدن جزئیات)، `gradient-text` (تیتر گرادیانی متحرک)، `orbit` (چرخش تزئینی دور مرکز)، `reveal` (ظهور آیتم‌ها هنگام اسکرول لیست).

**نصب یکجای ۱۲ تای منتخب:**

```bash
npx vibefarsi add border-beam marquee shine-button meteors spotlight-card tilt-card morph-button pulse-button animated-list text-shimmer progress-ring text-loop
```

---

## ۲. Magic UI (کامپوننت‌های انیمیشنی، کنار shadcn)

منبع: https://magicui.design/docs/components — رایگان، نصب با CLI شادcn. الگوی نصب:

```bash
npx shadcn@latest add @magicui/<name>
```

| # | کامپوننت | صفحه | چیه | کاربرد در Nocturne |
|---|---|---|---|---|
| ۱ | Marquee | https://magicui.design/docs/components/marquee | نوار لغزان بی‌نهایت (بدون وابستگی) | تیتر متحرک عنوان‌ها (جایگزین انگلیسی marquee وایب‌فارسی) |
| ۲ | Number Ticker | https://magicui.design/docs/components/number-ticker | شمارنده‌ی متحرک (وابستگی: `motion`) | تعداد پخش، مدت‌زمان کل کتابخانه |
| ۳ | Shine Border | https://magicui.design/docs/components/shine-border | حاشیه‌ی نورانی متحرک دور کارت | هاله‌ی کهربایی دور کارت «در حال پخش» |
| ۴ | Ripple Button | https://magicui.design/docs/components/ripple-button | موج از نقطه‌ی کلیک | بازخورد لمسی دکمه‌های کنترل |
| ۵ | Meteors | https://magicui.design/docs/components/meteors | بارش شهاب | پس‌زمینه‌ی استیج |
| ۶ | Particles | https://magicui.design/docs/components/particles | ذرات شناور | غبار نرم پشت جزیره‌ی وسط |
| ۷ | Aurora Text | https://magicui.design/docs/components/aurora-text | متن با گرادیان متحرک شفقی | اسم اپ «Nocturne» توی هدر |
| ۸ | Blur Fade | https://magicui.design/docs/components/blur-fade | ظهور نرم با تاری هنگام ورود به دید | تعویض نرم آهنگ توی استیج |
| ۹ | Typing Animation | https://magicui.design/docs/components/typing-animation | تایپ حرف‌به‌حرف | نمایش تدریجی متن ترانه یا بیو خواننده |
| ۱۰ | Shimmer Button | https://magicui.design/docs/components/shimmer-button | دکمه با درخشش دور محیط | دکمه‌ی CTA (مثلاً «افزودن پوشه») |
| ۱۱ | Magic Card | https://magicui.design/docs/components/magic-card | کارت با برق دنبال‌کننده‌ی ماوس | کارت‌های آلبوم کتابخانه |
| ۱۲ | Dock | https://magicui.design/docs/components/dock | داک آیکونی با بزرگ‌نمایی ماوس | الهام برای MicroDock پروژه (آیکون‌هایی که با نزدیک شدن ماوس بزرگ میشن) |

نکته: فقط `Number Ticker` وابستگی `motion` می‌خواد (توی کدش از `motion/react` ایمپورت می‌کنه)؛ بقیه رو CLI خودش مدیریت می‌کنه.

**نکته برای مشاور/OpenCode:** انیمیشن‌های Magic UI انگلیسی و چپ‌چینن — جهت و فونت رو باید به راست‌چین برگردونن. وایب‌فارسی‌ها از قبل راست‌چینن.

---

## ۳. uiverse.io (عناصر CSS آماده، لایسنس MIT)

روش استفاده: روی لینک هر عنصر بزن، کد CSS/HTML رو کپی کن و توی کامپوننت React بذار (کلاس‌ها رو به `className` تبدیل کن). چون CSS خالصن، با Tauri و تم دارک مشکلی ندارن.

**یافته‌ی مهم:** سرچ `vinyl record` توی uiverse وینیل چرخان واقعی نداد — نتایجش دکمه‌ی ضبط (record) و کارت پیام صوتی‌ان، نه دیسک وینیل. برای وینیل واقعی باید سرچ‌های `vinyl disc` یا `turntable` رو امتحان کنی.

| عنصر | لینک | چیه | کاربرد |
|---|---|---|---|
| مدیاپلیر تیره | https://uiverse.io/ahmed150up/funny-rabbit-10 | کارت پیام صوتی تیره با ردیف‌های موج‌مانند و دکمه پخش (CSS خالص) | الهام برای کارت «در حال پخش» با ویوفرم |
| دکمه Record | https://uiverse.io/andrew-demchenk0/yellow-otter-87 | دکمه‌ی دایره‌ای میکروفون با نقطه‌ی قرمز ضربان‌دار (CSS خالص) | افکت ضربان برای دکمه‌ی ضبط/پخش |
| دکمه‌های EP-133 | https://uiverse.io/Praashoo7/average-swan-99 | دکمه‌های الهام‌گرفته از Teenage Engineering EP-133 | استایل دکمه‌های کنترل پلیر |
| Rec | https://uiverse.io/dexter-st/little-emu-23 | عنصر دکمه‌ی ضبط | جایگزین دکمه‌ی ضبط |
| REC | https://uiverse.io/SelfMadeSystem/silent-cougar-84 | عنصر دکمه‌ی ضبط | جایگزین دکمه‌ی ضبط |
| ❤ | https://uiverse.io/dvirpro/stupid-impala-26 | دکمه‌ی قلب/تاگل | دکمه‌ی «علاقه‌مندی» آهنگ |

**سرچ‌های پیشنهادی بعدی توی خود سایت** (برای اکولایزر و لودر موجی که هنوز بررسی نشدن): `equalizer` ،`audio loader` ،`waveform` ،`play pause button` ،`music loader` ،`glow button`.

---

## پیشنهاد ترتیب برای مشاور

1. **اول وایب‌فارسی‌ها** — راست‌چین، بدون وابستگی، دقیقاً همون سبکی که قبلاً تأیید کرد.
2. **بعد Magic UI** — برای افکت‌های محیطی (Meteors/Particles) و Dock که توی وایب‌فارسی معادل قوی ندارن.
3. **آخر uiverse** — برای جزئیات خاص مثل وینیل CSS و اکولایزر که هیچ‌کدوم از دو تای بالا ندارن.

این فایل رو می‌تونی بدی به مدل مشاورت برای تأیید، بعد OpenCode.
