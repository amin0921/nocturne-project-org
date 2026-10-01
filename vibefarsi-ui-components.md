# کامپوننت‌های vibefarsi برای اپ پخش موزیک (PC)

جمع‌شده از vibefarsi.ir در ۲۰۲۶-۰۹-۲۱ — کامپوننت‌های راست‌چین React/Next.js با فونت و اعداد فارسی، انتخاب‌شده متناسب با پروژه‌ی اپ پخش موزیک دسکتاپ.

## نصب سریع (پیشنهادی)

توی ترمینال پروژه:

```bash
npx vibefarsi add slider button data-table search-input sidebar context-menu dropdown-menu card alert-dialog dialog tooltip skeleton spinner
```

وابستگی‌های داخلی با همین دستور خودکار نصب می‌شن:
- `data-table` ← table، pagination، skeleton، empty-state، input
- `alert-dialog` ← dialog، button
- `context-menu` ← dropdown-menu و `@/lib/float`

## نصب دستی

فایل‌های پوشه‌ی `components/ui` رو توی `components/ui` پروژه‌ت کپی کن. هلپرهای مشترکی که چند کامپوننت لازم دارن:
- `@/lib/utils`: تابع‌های `cn`، `fa` (اعداد فارسی)، `en` (اعداد لاتین)، `formatToman`
- `@/lib/float`: `FloatPortal`، `themeOf`، `eventInside`، `useFloat`

اینا با دستور CLI بالا میان؛ اگه دستی نصب می‌کنی از سایت بگیرشون.

تنها وابستگی npm همه‌ی کامپوننت‌ها: `lucide-react`

## لیست کامپوننت‌ها

| دسته (نظر مشاور) | کامپوننت | فایل | صفحه سایت | کاربرد در پروژه |
|---|---|---|---|---|
| Slider / Range | اسلایدر (slider) | slider.tsx | https://vibefarsi.ir/components/slider | نوار پیشرفت آهنگ (Seek Bar) و اسلایدر ولوم |
| Button / IconButton | دکمه (button) | button.tsx | https://vibefarsi.ir/components/button | دکمه‌های Play/Pause، قبلی/بعدی، Shuffle، Repeat (سایز `icon`) |
| Table / List | جدول داده (data-table) | data-table.tsx | https://vibefarsi.ir/components/data-table | لیست قطعات: عنوان، خواننده، آلبوم، مدت‌زمان — با مرتب‌سازی، جستجو و صفحه‌بندی فارسی |
| Input / SearchInput | جست‌وجو (search-input) | search-input.tsx | https://vibefarsi.ir/components/search-input | جستجوی آهنگ/خواننده/آلبوم با debounce و دکمه‌ی پاک‌کن |
| Sidebar / NavMenu | نوار کناری (sidebar) | sidebar.tsx | https://vibefarsi.ir/components/sidebar | منوی بخش‌ها، پوشه‌ها و پلی‌لیست‌ها (گروه‌بندی + نشان شمارنده) |
| Dropdown / ContextMenu | منوی راست‌کلیک (context-menu) + منوی کشویی (dropdown-menu) | context-menu.tsx، dropdown-menu.tsx | https://vibefarsi.ir/components/context-menu | منوی هر ترک: حذف، اطلاعات آهنگ، ساخت پلی‌لیست |
| Card | کارت (card) | card.tsx | https://vibefarsi.ir/components/card | کاور آلبوم‌ها و کارت آهنگ در حال پخش |
| Modal / Dialog | تأیید عمل (alert-dialog) + پنجره (dialog) | alert-dialog.tsx، dialog.tsx | https://vibefarsi.ir/components/alert-dialog | تأیید حذف پوشه / پاک‌سازی کتابخانه / پنجره‌ی تنظیمات |
| Tooltip | راهنمای ابزار (tooltip) | tooltip.tsx | https://vibefarsi.ir/components/tooltip | لیبل راهنما روی آیکون‌های کنترل (فقط با CSS، بدون JS) |
| Skeleton / Spinner | اسکلت (skeleton) + بارگذاری (spinner) | skeleton.tsx، spinner.tsx | https://vibefarsi.ir/components/skeleton | لودینگ هنگام اسکن پوشه‌ها و بارگذاری فایل‌های سنگین |

## پیدا نشد

- **ScrollArea**: توی کل کاتالوگ ۶۷تایی سایت کامپوننت اسکرول‌بار سفارشی نیست. نزدیک‌ترین مورد `scroll-progress`ـه که نوار پیشرفت اسکرول صفحه‌ست، نه ناحیه‌ی اسکرول.

## پرامپت‌های آماده برای AI

متن کامل پرامپت هر کامپوننت (برای دادن به Cursor / Claude / Codex) توی فایل `vibefarsi-ui-components-prompts.md` هست.
