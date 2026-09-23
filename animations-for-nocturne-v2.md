# کاتالوگ انیمیشن‌ها نسخه دوم برای Nocturne

جمع‌شده در ۲۰۲۶-۰۹-۲۲ — مکمل فایل `animations-for-nocturne.md`. انیمیشن‌های جدید برای پنج دسته‌ی فاز جدید Nocturne (جزیره‌های شیشه‌ای `#121419`، لهجه‌ی کهربایی `#EAB308`)، از تب «انیمیشن‌ها»ی vibefarsi، سایت‌های Magic UI و Aceternity UI، و اسنیپت‌های CSS خالص uiverse.io و Codepen.

---

## اصول مهندسی (برای همه‌ی موارد زیر)

- **سبک و بدون وابستگی سنگین:** همه با CSS 3D Transforms، SVG و ترنزیشن‌های شتاب‌یافته با GPU (فقط `transform` و `opacity`). هیچ Three.js، GSAP یا پکیج حجیمی نیست.
- **هماهنگ با تم:** رنگ پایه‌ی دارک `#121419`، لهجه‌ی امبر `#EAB308`، شفافیت شیشه‌ای با `backdrop-blur`.
- **کاهش حرکت:** انیمیشن‌های وایب‌فارسی خودشون با `prefers-reduced-motion` خاموش میشن؛ برای بقیه OpenCode باید همین media query رو اضافه کنه.
- **فارسی:** عناوین با `dir="auto"`؛ موارد LTR (Magic UI / Aceternity / uiverse) رو باید آینه کرد (`scaleX(-1)` یا پراپرتی‌های logical).
- **نحوه‌ی نصب:**
  - وایب‌فارسی: `npx vibefarsi add <slug>` — صفحه: `https://vibefarsi.ir/animations/<slug>`
  - Magic UI: `npx shadcn@latest add @magicui/<name>` — صفحه: `https://magicui.design/docs/components/<name>`
  - Aceternity: `npx shadcn@latest add @aceternity/<name>` — صفحه: `https://ui.aceternity.com/components/<name>` (نیازمند پکیج `motion`)
  - uiverse/Codepen: کپی کد CSS/HTML و تبدیل کلاس‌ها به `className` در کامپوننت React.

---

## دسته ۱ — کنترل ترنسپورت و دکمه‌ها (Transport & Interaction)

| نام انیمیشن | لینک صفحه مرجع / اسلاگ | توضیح خیلی ساده | کاربرد دقیق در Nocturne | نحوه استفاده |
|---|---|---|---|---|
| مورف Play به Pause — تکنیک CSS-Tricks | https://css-tricks.com/making-pure-css-playpause-button/ | دکمه‌ای که آیکون Play با یه حرکت نرم به Pause تبدیل میشه، فقط با CSS | دکمه‌ی Play/Pause اصلی پلیر — مورف نرم به‌جای تعویض خشک آیکون | مرجع تکنیک؛ پیاده‌سازی با دو SVG و transition روی `d` یا تعویض stroke |
| گالری دکمه‌های Play/Pause — codewithrandom | https://www.codewithrandom.com/2023/09/07/35-css-play-pause-buttons-examples/ | ۳۵ نمونه دکمه‌ی Play/Pause با CSS خالص (مورد ۶: مورف HTML/CSS خالص) | انتخاب استایل نهایی دکمه‌ی پخش | مرجع بصری؛ کد نمونه‌ی دلخواه کپی و به React منتقل شود |
| پنل Play/Pause ریتمیک — icochran10 | https://uiverse.io/icochran10/warm-wombat-89 | تاگل PLAY/PAUSE با چند خط ping ریتمیک شبیه اکولایزر | دکمه‌ی پخش با حس «زنده بودن» موزیک | Tailwind + checkbox؛ CSS خالص |
| کارت پلیر با وینیل چرخان — hoshikawamaki | https://uiverse.io/hoshikawamaki/pretty-panther-5 | دیسک وینیل SVG که با `animate-[spin_3s_linear_infinite]` واقعاً می‌چرخه | وینیل چرخان استیج — همون چیزی که توی نسخه اول پیدا نشده بود | Tailwind خالص؛ کد کپی و کلاس‌ها به `className` تبدیل شود |
| انفجار قلب — freefrontend | https://freefrontend.com/css-button-click-effects/ | قلب با scale الاستیک پر میشه و ذرات جرقه شعاعی پخش و محو میشن | میکرواینترکشن دکمه‌ی لایک/علاقه‌مندی آهنگ | الگوی checkbox مخفی + SVG؛ CSS خالص |
| دکمه‌ی لایک قلبی — codewithrandom | https://www.codewithrandom.com/2023/02/14/like-button-html-css-button/ | دکمه‌ی لایک قلبی با checkbox مخفی و انیمیشن HTML/CSS (ریسپانسیو) | جایگزین تأییدشده برای میکرواینترکشن لایک | HTML/CSS خالص؛ کد مقاله کپی شود |
| سوییچ flicker — WriestTavo | https://uiverse.io/WriestTavo/silly-goose-47 | سوییچ CSS که knobـش در حالت checked انیمیشن flicker می‌گیره | نشانگر فعال Shuffle/Repeat با افکت چشمک‌زن ظریف | CSS خالص؛ قابل اقتباس برای تاگل‌ها |
| `confetti` — کاغذ رنگی (وایب‌فارسی) | `https://vibefarsi.ir/animations/confetti` — اسلاگ: `confetti` | با هر تریگر، تکه‌های رنگی از یه نقطه به بالا می‌پاشن | انفجار ذرات موقع لایک کردن آهنگ | `npx vibefarsi add confetti`؛ تعداد ذرات کم و رنگ‌ها امبر `#EAB308` شود؛ تریگر مجدد با عوض کردن `key` |
| `animated-tabs` — تب‌های لغزان (وایب‌فارسی) | `https://vibefarsi.ir/animations/animated-tabs` — اسلاگ: `animated-tabs` | یه قرص نورانی نرم سر می‌خوره روی تب فعال | کنترل سگمنتی Shuffle/Repeat: قرص کهربایی لغزان به‌جای هایلایت خشک | `npx vibefarsi add animated-tabs`؛ بدون وابستگی |
| `dock` — داک (وایب‌فارسی) | `https://vibefarsi.ir/animations/dock` — اسلاگ: `dock` | آیکون‌ها مثل داک macOS با نزدیک شدن ماوس بزرگ میشن | بزرگ‌نمایی لمسی دکمه‌های prev/play/next موقع هاور | `npx vibefarsi add dock`؛ راست‌چین و آماده |
| Cool Mode — مود خنک (Magic UI) | https://magicui.design/docs/components/cool-mode | انفجار ذرات کانوسی از نقطه‌ی دقیق کلیک روی هر دکمه | جایگزین قوی‌تر برای burst دکمه‌ی لایک (ذره‌ی سفارشی هم می‌گیره) | `npx shadcn@latest add @magicui/cool-mode`؛ کانوس، بدون motion |
| Pulsating Button — دکمه‌ی ضربان‌دار (Magic UI) | https://magicui.design/docs/components/pulsating-button | حلقه‌های ضربانی/موجی از دور دکمه باز میشن (پراپ‌های `pulseColor`، `duration`) | پالس دور دکمه‌ی Play؛ یا هاله‌ی فعال Shuffle/Repeat | `npx shadcn@latest add @magicui/pulsating-button`؛ CSS خالص |
| Stateful Button — دکمه‌ی حالت‌دار (Aceternity) | https://ui.aceternity.com/components/stateful-button | با کلیک اول لودینگ نشون میده بعد حالت موفق — `onClick` می‌تونه async باشه | دکمه‌ی «اسکن پوشه» یا افزودن موزیک با فیدبک لودینگ→موفق | `npx shadcn@latest add @aceternity/stateful-button`؛ نیازمند پکیج `motion` |
| Interactive Hover Button — دکمه‌ی هاور تعاملی (Magic UI) | https://magicui.design/docs/components/interactive-hover-button | با هاور، نقطه بزرگ میشه، متن سر می‌خوره بیرون و فلش وارد میشه | افکت هاور دکمه‌های ترنسپورت و CTAها | `npx shadcn@latest add @magicui/interactive-hover-button`؛ CSS/Tailwind خالص؛ برای RTL جهت‌ها آینه شود |

---

## دسته ۲ — اکولایزرهای زنده و انیمیشن‌های صوتی (Audio & Equalizer)

| نام انیمیشن | لینک صفحه مرجع / اسلاگ | توضیح خیلی ساده | کاربرد دقیق در Nocturne | نحوه استفاده |
|---|---|---|---|---|
| میله‌های CSS خالص — rgg (CodePen) | https://codepen.io/rgg/pen/rVgBEL | میله‌هایی که با کی‌فریم CSS بالا-پایین می‌پرن | پایه‌ی اکولایزر میله‌ای پلیر (حالت تزئینی/لودینگ) | CSS خالص (SCSSـه؛ به CSS معمولی تبدیل شود) |
| لودر نت‌های موسیقی — Zadquiel Lezama | https://DEV.to/zadquieljlp/codevember-06-music-notes-loading-animated-3fp3 | مقاله‌ی معرفی لودر انیمیشنی با نت‌های موسیقی | ایده‌ی لودر موزیکال برای اسکن فایل‌های صوتی | مرجع ایده؛ پیاده‌سازی با CSS |
| `radial-intro` — معرفی شعاعی (وایب‌فارسی) | `https://vibefarsi.ir/animations/radial-intro` — اسلاگ: `radial-intro` | آیتم‌ها از مرکز باز میشن، روی یه مدار می‌شینن و دورش می‌چرخن | رقص فرکانسی دور کاور دایره‌ای/وینیل: میله‌ها یا نقطه‌ها روی مدار دور دیسک | `npx vibefarsi add radial-intro`؛ پراپ‌های `stageSize`، `imageSize`، `duration` |
| `animated-beam` — پرتو اتصال (وایب‌فارسی) | `https://vibefarsi.ir/animations/animated-beam` — اسلاگ: `animated-beam` | پالس نور روی یه مسیر خمیده‌ی SVG حرکت می‌کنه | موج صوتی شعاعی: مسیر رو دایره‌ای کن دور وینیل | `npx vibefarsi add animated-beam`؛ پراپ‌های `curvature`، `duration`، `reverse` |
| `loading-dots` — نقاط بارگذاری (وایب‌فارسی) | `https://vibefarsi.ir/animations/loading-dots` — اسلاگ: `loading-dots` | سه نقطه با ریتم پلکانی ضربان می‌زنن | لودر ریتمیک «در حال اسکن فایل‌ها» — نقطه‌ها به میله‌ی امبر تبدیل بشن | `npx vibefarsi add loading-dots`؛ کی‌فریم‌ها توی `globals.css` |
| Ripple — موج (Magic UI) | https://magicui.design/docs/components/ripple | حلقه‌های متحدالمرکز از پشت یه عنصر باز میشن | امواج صوتی که از دیسک وینیل ساطع میشن | `npx shadcn@latest add @magicui/ripple`؛ CSS خالص؛ پراپ‌های `numCircles`، `mainCircleSize` |
| Loaders — لودرها (Aceternity) | https://ui.aceternity.com/components/loader | مجموعه لودرهای ساده، شیمر، کامپکت، SVG و گلیچ برای صفحه‌های لودینگ | لودر موزیکال اسکن فایل‌ها (نسخه‌ی SVG/گلیچ با تم دارک) | `npx shadcn@latest add @aceternity/loader`؛ نیازمند پکیج `motion` |
| Background Lines — خطوط پس‌زمینه (Aceternity) | https://ui.aceternity.com/components/background-lines | مسیرهای SVG که به شکل موج انیمیت میشن (پراپ `svgOptions.duration` برای سرعت) | ویژوال موج دامنه‌ی صدا پشت جزیره‌ی استیج | `npx shadcn@latest add @aceternity/background-lines`؛ نیازمند پکیج `motion` |

**نکته‌ی صادقانه:** هیچ‌کدوم از موارد بالا «واقعاً زنده» نیستن (به صدای در حال پخش وصل نیستن). اکولایزر واقعی باید از Web Audio AnalyserNode تغذیه بشه — OpenCode می‌تونه مقیاس میله‌ها یا حلقه‌های Ripple رو با CSS variables از آنالایزر صدا درایو کنه (خط لوله‌ی waveform توی اسپک نسخه اول هست).

## دسته ۳ — انیمیشن‌های لیریکس و متن ترانه (Lyrics & Text Motion)

| نام انیمیشن | لینک صفحه مرجع / اسلاگ | توضیح خیلی ساده | کاربرد دقیق در Nocturne | نحوه استفاده |
|---|---|---|---|---|
| `highlight-text` — هایلایت متن (وایب‌فارسی) | `https://vibefarsi.ir/animations/highlight-text` — اسلاگ: `highlight-text` | خط ماژیک از راست به چپ زیر عبارت کشیده میشه وقتی وارد دید میشه | هایلایت کلمه‌به‌کلمه‌ی کارائوکه: با timestamp هر کلمه/خط، `delay` رو درایو کن | `npx vibefarsi add highlight-text`؛ قوی‌ترین گزینه‌ی این دسته؛ بدون وابستگی |
| Highlighter — هایلایتر (Magic UI) | https://magicui.design/docs/components/highlighter | با انیمیشن stroke روی SVG، هایلایت/آندرلاین/دایره دور متن کشیده میشه | هایلایت خط فعلی لیریکس به رنگ امبر | `npx shadcn@latest add @magicui/highlighter`؛ SVG+CSS خالص؛ برای RTL با `scaleX(-1)` آینه شود |
| Progressive Blur — تاری پیشرونده (Magic UI) | https://magicui.design/docs/components/progressive-blur | لایه‌های تاری (۰.۵ تا ۶۴ پیکسل) به لبه‌ی بالا/پایین کانتینر اسکرول‌دار می‌چسبن | فید محو بالا و پایین پنل لیریکس هنگام اسکرول اتوماتیک | `npx shadcn@latest add @magicui/progressive-blur`؛ CSS خالص (`backdrop-filter`) |
| Text Generate Effect — تولید تدریجی متن (Aceternity) | https://aceternity.com/components/text-generate-effect | متن کلمه‌به‌کلمه با تاری/شفافیت پلکانی ظاهر میشه | ظاهر شدن تدریجی هر خط لیریکس | نیازمند پکیج `motion` — قبل از تأیید، مشاور وابستگی رو بررسی کنه؛ جداسازی با فاصله برای فارسی اوکیه |
| افکت karaoke با clip-path — jh3y (CodePen) | https://codepen.io/jh3y/pen/gOeGmRN | هایلایت کارائوکه‌ی خالص CSS با `clip-path` و متغیر `--reveal` روی هر کاراکتر | هایلایت کلمه‌به‌کلمه که با متغیر CSS به ساعت پخش وصل میشه | CSS خالص برای افکت + JS سبک برای همگام‌سازی با پخش |
| Karaoke Text — longto (CodePen) | https://codepen.io/longto/pen/GqNPJP | کارائوکه‌ی کلاسیک با توپ جهنده روی کلمات (قدیمی) | فقط مرجع بصری ایده‌ی کارائوکه | نیازمند JS (`requestAnimationFrame`) — فقط برای الهام |

**نکته‌ی صادقانه:** اسکرول اتوماتیک نرم لیریکس با فید محو، اسنیپت آماده‌ی مستقیمی نداره — ترکیب `Progressive Blur` (فید لبه‌ها) با `scrollIntoView({behavior:'smooth'})` و ماسک گرادیانی `mask-image` کافیه و OpenCode از صفر می‌سازتش. همگام‌سازی هایلایت با آهنگ از timestampهای فایل لیریکس (LRC) تغذیه میشه.

---

## دسته ۴ — تعاملات کپسول صدا و اسلایدرها (Volume & Sliders)

| نام انیمیشن | لینک صفحه مرجع / اسلاگ | توضیح خیلی ساده | کاربرد دقیق در Nocturne | نحوه استفاده |
|---|---|---|---|---|
| Animated Circular Progress Bar — حلقه‌ی پیشرفت دایره‌ای (Magic UI) | https://magicui.design/docs/components/animated-circular-progress-bar | حلقه‌ی SVG که نرم به سمت یه مقدار انیمیت میشه | حلقه‌ی سطح ولوم دور دکمه‌ی صدا / حلقه‌ی پیشرفت پخش دور Play | `npx shadcn@latest add @magicui/animated-circular-progress-bar`؛ قبل از استفاده وابستگی `motion` بررسی شود |
| `dock` — داک (وایب‌فارسی) | `https://vibefarsi.ir/animations/dock` — اسلاگ: `dock` | آیکون‌ها با نزدیک شدن ماوس بزرگ میشن | نیمه‌ی اول کپسول ولوم: بزرگ/کش‌آمدن نرم کپسول موقع هاور یا اسکرول | `npx vibefarsi add dock`؛ بدون وابستگی |
| مجموعه‌ی اسلایدرهای Uiverse | https://uiverse.io/tags/slider?orderBy=favorites&theme=all | گالری اسلایدرهای CSS آماده | الهام بصری برای استایل کپسول ولوم | مرجع ایده؛ اسنیپت «کپسول مورف‌شونده»ی آماده پیدا نشد |

**نکته‌ی صادقانه:** «کپسول شناور ولوم که با اسکرول/هاور تغییر شکل نرم میده» و «فیدبک موجی دامنه‌ی صدا» نمونه‌ی آماده‌ی دقیقی ندارن — OpenCode این دو رو دستی می‌سازه: مورف شکل با transition روی `border-radius`/`width`، و نوار میله‌ای کوچیک که از مقدار ولوم درایو میشه (پایه‌ش همون میله‌های rgg دسته‌ی ۲).

---

## دسته ۵ — جلوه‌های ویژه بصری و اتمسفریک (Atmospheric & Cover Motion)

| نام انیمیشن | لینک صفحه مرجع / اسلاگ | توضیح خیلی ساده | کاربرد دقیق در Nocturne | نحوه استفاده |
|---|---|---|---|---|
| گرامافون سه‌بعدی CSS — keyframers (CodePen) | https://codepen.io/team/keyframers/pen/YjMwqX | گرامافون کامل با صفحه‌ی چرخان و بازوی متحرک، فقط با CSS سه‌بعدی | **قرار گرفتن سوزن گرامافون:** بازو (tonearm) با rotate دور نقطه‌ی اتکا موقع شروع پخش روی دیسک می‌شینه | CSS خالص (بدون Three.js)؛ تکنیک تکمیلی: https://www.creativebloq.com/features/create-cool-ui-animations-with-css/5 |
| 3D Flip Card — کارت پشت‌ورو — IWhat1 (Uiverse) | https://Uiverse.io/IWhat1/loud-frog-61 | کارت با `perspective` و `rotateY(180deg)` پشت‌ورو میشه | پشت‌ورو شدن کاور آلبوم برای نمایش متادیتا و ترک‌لیست | CSS خالص (تأییدشده)؛ `backface-visibility: hidden` |
| Orbiting Circles — دایره‌های مداری (Magic UI) | https://magicui.design/docs/components/orbiting-circles | آیکون‌ها روی مسیرهای دایره‌ای متحدالمرکز می‌چرخن | حلقه‌های مداری تزئینی دور دیسک وینیل / هاله‌ی شعاعی | `npx shadcn@latest add @magicui/orbiting-circles`؛ CSS خالص؛ پراپ‌های `radius`، `speed`، `reverse` |
| Spinning Text — متن چرخان (Magic UI) | https://magicui.design/docs/components/spinning-text | متن روی مسیر دایره‌ای SVG دور مرکز می‌چرخه | اسم آهنگ/خواننده که دور وینیل در حال چرخش می‌گرده | ⚠️ پراپ‌ها با تایپ‌های `motion` نوشته شدن — احتمالاً نیازمند پکیج `motion`؛ مشاور بررسی کنه؛ گلیف فارسی روی textPath باید تست بشه |
| `curved-loop` — متن خمیده (وایب‌فارسی) | `https://vibefarsi.ir/animations/curved-loop` — اسلاگ: `curved-loop` | نوار متحرک روی یه قوس SVG؛ جهت با سرعت فلیک عوض میشه | جایگزین فارسی و بدون‌وابستگیِ متن چرخان دور وینیل | `npx vibefarsi add curved-loop`؛ CLI پیش‌نیاز `svg-text-path-rtl` رو خودش نصب می‌کنه |

**نکته‌ی صادقانه:** «نور محیطی واکنش‌گرا به بیت» نمونه‌ی آماده‌ی واقعی نداره — الگوی درستش اینه که OpenCode همون `AmbientGlow` اسپک نسخه اول رو با CSS variables از Web Audio AnalyserNode درایو کنه (opacity/scale با بیت). سوزن گرامافون هم customـه: یه `rotate` ساده روی بازو که به `isPlaying` استور وصل میشه.

---

## شکاف‌های صادقانه → ساخت دستی توسط OpenCode (نه شکار کتابخانه)

| مورد | چرا آماده‌ش نیست | مسیر ساخت |
|---|---|---|
| مورف SVG آیکون Play به Pause | نه وایب‌فارسی (`morph-button` فقط ۳ حالت دکمه‌ست نه مورف آیکون) نه Magic UI/Aceternity مورف آیکون ندارن | دو path و interpolation روی `d` یا تعویض stroke-draw؛ مراجع تکنیک: CSS-Tricks و codewithrandom بالا |
| سوزن گرامافون (needle drop) | هیچ‌جا کامپوننت tonearm نیست | `rotate` روی بازو دور نقطه‌ی اتکا، وصل به `isPlaying`؛ مرجع: keyframers + creativebloq |
| glow واکنش‌گرا به بیت | نمونه‌های آماده فقط تزئینی/لوپ‌ان | درایو `AmbientGlow` با CSS variables از AnalyserNode (خط لوله توی اسپک v1 هست) |
| اسکرول اتوماتیک لیریکس با فید محو | اسنیپت اختصاصی نیست | `Progressive Blur` + `mask-image` گرادیانی + `scrollIntoView({behavior:'smooth'})` |
| کپسول ولوم مورف‌شونده + فیدبک موجی | نمونه‌ی دقیق نیست | transition روی `border-radius`/`width` + نوار میله‌ای درایو‌شده از مقدار ولوم |
| موج شعاعی صوتی واقعی | Pen تأییدشده‌ای نیست | میله‌های SVG دور دیسک که از AnalyserNode تغذیه میشن؛ `radial-intro` فقط نسخه‌ی تزئینیشه |

---

## موارد نیازمند بازبینی دستی (قبل از تحویل به OpenCode)

- سه کاندیدای قلب Uiverse (LilaRest/lazy-lionfish-12، elijahgummer/bad-baboon-59، LilaRest/chilly-moth-52) قابل تأیید نبودن — صفحه‌های uiverse با JS رندر میشن و کدشون توی خزش دیده نشد؛ از جدول حذف و با دکمه‌ی لایک تأییدشده‌ی codewithrandom جایگزین شدن.
- توجه: دامنه‌ی Aceternity به `ui.aceternity.com` منتقل شده (لینک‌های جدول به‌روز شدن).
- موارد دارای وابستگی `motion` (Spinning Text، Text Generate Effect، Animated Circular Progress Bar، Loaders، Background Lines، Stateful Button): مشاور باید تأیید کنه آیا پکیج `motion` به پروژه اضافه بشه یا نسخه‌ی CSS خالصش ساخته بشه.

---

## پیشنهاد ترتیب برای مشاور

1. **اول وایب‌فارسی‌های این نسخه** (`highlight-text`، `confetti`، `animated-tabs`، `radial-intro`، `animated-beam`، `loading-dots`، `dock`، `curved-loop`) — راست‌چین، بدون وابستگی، `prefers-reduced-motion` داخلی.
2. **بعد Magic UIهای CSS خالص** (Cool Mode، Pulsating Button، Progressive Blur، Orbiting Circles، Ripple، Highlighter) — فقط آینه‌سازی RTL لازمه.
3. **بعد اسنیپت‌های uiverse/Codepen** — برای جزئیات خاص (مورف play/pause، فلیپ‌کارت، گرامافون) با اقتباس CSS.
4. **آخر موارد custom** جدول «شکاف‌های صادقانه» — OpenCode از صفر می‌سازه؛ مراجع تکنیک کنار هر کدوم هست.
5. **موارد motionـدار** فقط با چراغ سبز مشاور.

این فایل رو می‌تونی بدی به مدل مشاورت برای تأیید، بعد OpenCode.
