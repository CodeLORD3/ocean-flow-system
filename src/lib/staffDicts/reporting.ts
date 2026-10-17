import type { Row } from "@/lib/staffI18n";

/** Texter för reporting. Nycklar börjar med "reporting." */
const DICT: Record<string, Row> = {
  "reporting.searchProduct": {
    "sv": "Sök produkt...",
    "ti": "ፍርያት ድለ...",
    "en": "Search product...",
    "ar": "ابحث عن منتج..."
  },
  "reporting.unlinked": {
    "sv": "Ej kopplad",
    "ti": "ዘይተኣሳሰረ",
    "en": "Not linked",
    "ar": "غير مرتبط"
  },
  "reporting.produced": {
    "sv": "Producerad",
    "ti": "ዝተፈረየ",
    "en": "Produced",
    "ar": "تم إنتاجه"
  },
  "reporting.planned": {
    "sv": "Planerad",
    "ti": "ዝተመደበ",
    "en": "Planned",
    "ar": "مخطط"
  },
  "reporting.operator": {
    "sv": "Operatör",
    "ti": "ኦፐሬተር",
    "en": "Operator",
    "ar": "المشغّل"
  },
  "reporting.note": {
    "sv": "Anteckning",
    "ti": "መዘኻኸሪ",
    "en": "Note",
    "ar": "ملاحظة"
  },
  "reporting.deleteLine": {
    "sv": "Ta bort rad",
    "ti": "መስርዕ ሰርዝ",
    "en": "Delete row",
    "ar": "حذف صف"
  },
  "reporting.confirmed": {
    "sv": "Bekräftad",
    "ti": "ዝተረጋገጸ",
    "en": "Confirmed",
    "ar": "مؤكد"
  },
  "reporting.active": {
    "sv": "Aktiv",
    "ti": "ንጡፍ",
    "en": "Active",
    "ar": "نشط"
  },
  "reporting.product": {
    "sv": "Produkt",
    "ti": "ፍርያት",
    "en": "Product",
    "ar": "المنتج"
  },
  "reporting.quantity": {
    "sv": "Antal",
    "ti": "ብዝሒ",
    "en": "Quantity",
    "ar": "الكمية"
  },
  "reporting.unit": {
    "sv": "Enhet",
    "ti": "መለክዒ",
    "en": "Unit",
    "ar": "الوحدة"
  },
  "reporting.status": {
    "sv": "Status",
    "ti": "ኩነታት",
    "en": "Status",
    "ar": "الحالة"
  },
  "reporting.date": {
    "sv": "Datum",
    "ti": "ዕለት",
    "en": "Date",
    "ar": "التاريخ"
  },
  "reporting.confirmProduction": {
    "sv": "Bekräfta produktion",
    "ti": "ምፍራይ ኣረጋግጽ",
    "en": "Confirm production",
    "ar": "تأكيد الإنتاج"
  },
  "reporting.lockedNotice": {
    "sv": "När produktionen är bekräftad kan raderna inte längre redigeras.",
    "ti": "ምፍራይ ምስ ተረጋገጸ መሳርዕ ክእረሙ ኣይክእሉን።",
    "en": "Once production is confirmed, rows can no longer be edited.",
    "ar": "بعد تأكيد الإنتاج، لا يمكن تعديل الصفوف."
  },
  "reporting.cancel": {
    "sv": "Avbryt",
    "ti": "ሰርዝ",
    "en": "Cancel",
    "ar": "إلغاء"
  },
  "reporting.confirm": {
    "sv": "Bekräfta",
    "ti": "ኣረጋግጽ",
    "en": "Confirm",
    "ar": "تأكيد"
  },
  "reporting.nameUpdated": {
    "sv": "Namn uppdaterat",
    "ti": "ስም ተሓዲሱ",
    "en": "Name updated",
    "ar": "تم تحديث الاسم"
  },
  "reporting.alreadyConfirmed": {
    "sv": "Redan bekräftad",
    "ti": "ኣቐዲሙ ተረጋጊጹ",
    "en": "Already confirmed",
    "ar": "مؤكد مسبقًا"
  },
  "reporting.alreadyBooked": {
    "sv": "Rapporten var redan bokad. Inget lades till två gånger.",
    "ti": "እቲ ጸብጻብ ኣቐዲሙ ተመዝጊቡ ነይሩ። ዝተደግመ ነገር የለን።",
    "en": "The report was already posted. Nothing was added twice.",
    "ar": "تم تسجيل التقرير مسبقًا. لم تتم إضافة أي شيء مرتين."
  },
  "reporting.productionConfirmed": {
    "sv": "Produktion bekräftad",
    "ti": "ምፍራይ ተረጋጊጹ",
    "en": "Production confirmed",
    "ar": "تم تأكيد الإنتاج"
  },
  "reporting.stockAdded": {
    "sv": "Producerade varor har lagts till i Grossist Flytande.",
    "ti": "ዝተፈረዩ ኣቑሑት ናብ Grossist Flytande ተወሲኾም።",
    "en": "Produced goods have been added to Grossist Flytande.",
    "ar": "تمت إضافة السلع المنتجة إلى Grossist Flytande."
  },
  "reporting.confirmError": {
    "sv": "Kunde inte bekräfta produktionen",
    "ti": "ምፍራይ ከነረጋግጽ ኣይተኻእለን",
    "en": "Could not confirm production",
    "ar": "تعذر تأكيد الإنتاج"
  },
  "reporting.unknownError": {
    "sv": "Okänt fel",
    "ti": "ዘይፍለጥ ጌጋ",
    "en": "Unknown error",
    "ar": "خطأ غير معروف"
  },
  "reporting.productCreated": {
    "sv": "Ny produkt skapad och tillagd",
    "ti": "ሓድሽ ፍርያት ተፈጢሩን ተወሲኹን",
    "en": "New product created and added",
    "ar": "تم إنشاء منتج جديد وإضافته"
  },
  "reporting.heading": {
    "sv": "Produktionsrapportering",
    "ti": "ጸብጻብ ምፍራይ",
    "en": "Production reporting",
    "ar": "تقارير الإنتاج"
  },
  "reporting.total": {
    "sv": "Totalt:",
    "ti": "ድምር:",
    "en": "Total:",
    "ar": "الإجمالي:"
  },
  "reporting.searchAdd": {
    "sv": "Sök och lägg till producerad produkt...",
    "ti": "ዝተፈረየ ፍርያት ድለን ወስኽን...",
    "en": "Search and add produced product...",
    "ar": "ابحث عن منتج تم إنتاجه وأضفه..."
  },
  "reporting.createProduct": {
    "sv": "Skapa ny produkt",
    "ti": "ሓድሽ ፍርያት ፍጠር",
    "en": "Create new product",
    "ar": "إنشاء منتج جديد"
  },
  "reporting.systemProducts": {
    "sv": "Produkter i systemet",
    "ti": "ፍርያት ኣብ ስርዓት",
    "en": "Products in the system",
    "ar": "المنتجات في النظام"
  },
  "reporting.newProduct": {
    "sv": "Ny produkt",
    "ti": "ሓድሽ ፍርያት",
    "en": "New product",
    "ar": "منتج جديد"
  },
  "reporting.productName": {
    "sv": "Produktnamn *",
    "ti": "ስም ፍርያት *",
    "en": "Product name *",
    "ar": "اسم المنتج *"
  },
  "reporting.sku": {
    "sv": "SKU",
    "ti": "SKU",
    "en": "SKU",
    "ar": "رمز المنتج"
  },
  "reporting.category": {
    "sv": "Kategori",
    "ti": "ምድብ",
    "en": "Category",
    "ar": "الفئة"
  },
  "reporting.auto": {
    "sv": "AUTO",
    "ti": "ባዕላዊ",
    "en": "AUTO",
    "ar": "تلقائي"
  },
  "reporting.purchasePrice": {
    "sv": "Inköpspris",
    "ti": "ዋጋ ዕድጊ",
    "en": "Purchase price",
    "ar": "سعر الشراء"
  },
  "reporting.wholesalePrice": {
    "sv": "Grossistpris",
    "ti": "ዋጋ ጅምላ",
    "en": "Wholesale price",
    "ar": "سعر الجملة"
  },
  "reporting.createAdd": {
    "sv": "Skapa & lägg till",
    "ti": "ፍጠርን ወስኽን",
    "en": "Create & add",
    "ar": "إنشاء وإضافة"
  },
  "reporting.filter": {
    "sv": "Filtrera:",
    "ti": "ኣጻሪ:",
    "en": "Filter:",
    "ar": "تصفية:"
  },
  "reporting.allCategories": {
    "sv": "Alla kategorier",
    "ti": "ኩሎም ምድባት",
    "en": "All categories",
    "ar": "جميع الفئات"
  },
  "reporting.clearFilter": {
    "sv": "Rensa filter",
    "ti": "መጻረዪ ኣጽሪ",
    "en": "Clear filter",
    "ar": "مسح التصفية"
  },
  "reporting.empty": {
    "sv": "Inga produkter ännu. Sök efter produkter ovan för att börja rapportera produktion.",
    "ti": "ገና ፍርያት የለን። ጸብጻብ ምፍራይ ንምጅማር ኣብ ላዕሊ ፍርያት ድለ።",
    "en": "No products yet. Search for products above to start reporting production.",
    "ar": "لا توجد منتجات بعد. ابحث عن المنتجات أعلاه لبدء تسجيل الإنتاج."
  },
  "reporting.confirmedProduction": {
    "sv": "Bekräftad produktion",
    "ti": "ዝተረጋገጸ ምፍራይ",
    "en": "Confirmed production",
    "ar": "الإنتاج المؤكد"
  },
  "reporting.rowUpdated": {
    "sv": "Rad uppdaterad",
    "ti": "መስርዕ ተሓዲሱ",
    "en": "Row updated",
    "ar": "تم تحديث الصف"
  },
  "reporting.rowDeleted": {
    "sv": "Rad borttagen",
    "ti": "መስርዕ ተሰሪዙ",
    "en": "Row deleted",
    "ar": "تم حذف الصف"
  },
  "reporting.rowAdded": {
    "sv": "Rad tillagd",
    "ti": "መስርዕ ተወሲኹ",
    "en": "Row added",
    "ar": "تمت إضافة الصف"
  },
  "reporting.reportNameUpdated": {
    "sv": "Rapportnamn uppdaterat",
    "ti": "ስም ጸብጻብ ተሓዲሱ",
    "en": "Report name updated",
    "ar": "تم تحديث اسم التقرير"
  },
  "reporting.reportDeleted": {
    "sv": "Rapport borttagen",
    "ti": "ጸብጻብ ተሰሪዙ",
    "en": "Report deleted",
    "ar": "تم حذف التقرير"
  },
  "reporting.loadingArchive": {
    "sv": "Laddar arkiverade rapporter...",
    "ti": "ዝተዓቀቡ ጸብጻባት ይጽዕኑ ኣለዉ...",
    "en": "Loading archived reports...",
    "ar": "جارٍ تحميل التقارير المؤرشفة..."
  },
  "reporting.emptyArchive": {
    "sv": "Inga arkiverade produktionsrapporter ännu",
    "ti": "ገና ዝተዓቀቡ ጸብጻባት ምፍራይ የለዉን",
    "en": "No archived production reports yet",
    "ar": "لا توجد تقارير إنتاج مؤرشفة بعد"
  },
  "reporting.archiveSchedule": {
    "sv": "Rapporter arkiveras automatiskt varje natt kl 00:00",
    "ti": "ጸብጻባት ኩሉ ለይቲ ሰዓት 00:00 ብባዕሎም ይዕቀቡ",
    "en": "Reports are archived automatically every night at 00:00",
    "ar": "تتم أرشفة التقارير تلقائيًا كل ليلة الساعة 00:00"
  },
  "reporting.archiveHeading": {
    "sv": "Produktionsrapporter – Arkiv",
    "ti": "ጸብጻባት ምፍራይ – ማህደር",
    "en": "Production reports – Archive",
    "ar": "تقارير الإنتاج – الأرشيف"
  },
  "reporting.archived": {
    "sv": "Arkiverad",
    "ti": "ዝተዓቀበ",
    "en": "Archived",
    "ar": "مؤرشف"
  },
  "reporting.rename": {
    "sv": "Byt namn",
    "ti": "ስም ቀይር",
    "en": "Rename",
    "ar": "إعادة تسمية"
  },
  "reporting.deleteReport": {
    "sv": "Ta bort rapport",
    "ti": "ጸብጻብ ሰርዝ",
    "en": "Delete report",
    "ar": "حذف التقرير"
  },
  "reporting.deleteReportTitle": {
    "sv": "Ta bort rapport?",
    "ti": "ጸብጻብ ይሰረዝ፧",
    "en": "Delete report?",
    "ar": "حذف التقرير؟"
  },
  "reporting.delete": {
    "sv": "Ta bort",
    "ti": "ሰርዝ",
    "en": "Delete",
    "ar": "حذف"
  },
  "reporting.addRow": {
    "sv": "Lägg till rad",
    "ti": "መስርዕ ወስኽ",
    "en": "Add row",
    "ar": "إضافة صف"
  },
  "reporting.reportTab": {
    "sv": "Rapport",
    "ti": "ጸብጻብ",
    "en": "Report",
    "ar": "تقرير"
  },
  "reporting.manufacturingTab": {
    "sv": "Filé/Tillverkning",
    "ti": "ፊለ/ምፍራይ",
    "en": "Filleting/Manufacturing",
    "ar": "تقطيع الفيليه/التصنيع"
  },
  "reporting.filletTab": {
    "sv": "Filé",
    "ti": "ፊለ",
    "en": "Fillet",
    "ar": "فيليه"
  },
  "reporting.deleteLinePrompt": {
    "sv": "Ta bort raden \"{name}\"?",
    "ti": "መስርዕ \"{name}\" ይሰረዝ፧",
    "en": "Delete row \"{name}\"?",
    "ar": "حذف الصف \"{name}\"؟"
  },
  "reporting.rowTotal": {
    "sv": "{n} rader · {total} total",
    "ti": "{n} መሳርዕ · {total} ድምር",
    "en": "{n} rows · {total} total",
    "ar": "{n} صفوف · {total} إجمالي"
  },
  "reporting.lockIntro": {
    "sv": "Du är på väg att låsa ",
    "ti": "ክትዓጽዎ ትቀራረብ ኣለኻ ",
    "en": "You are about to lock ",
    "ar": "أنت على وشك قفل "
  },
  "reporting.lockRows": {
    "sv": " med {n} rader",
    "ti": " ምስ {n} መሳርዕ",
    "en": " with {n} rows",
    "ar": " مع {n} صفوف"
  },
  "reporting.lockTotal": {
    "sv": "och totalt ",
    "ti": "ብድምር ድማ ",
    "en": "and a total of ",
    "ar": "وبإجمالي "
  },
  "reporting.lockUnits": {
    "sv": " enheter.",
    "ti": " ኣሃዱታት።",
    "en": " units.",
    "ar": " وحدات."
  },
  "reporting.stockError": {
    "sv": "{error}. Inget har bokats i lagret — försök igen.",
    "ti": "{error}. ኣብ መኽዘን ዝተመዝገበ የለን — ደጊምካ ፈትን።",
    "en": "{error}. Nothing has been posted to inventory — try again.",
    "ar": "{error}. لم يتم تسجيل أي شيء في المخزون — حاول مجددًا."
  },
  "reporting.productAdded": {
    "sv": "{name} tillagd",
    "ti": "{name} ተወሲኹ",
    "en": "{name} added",
    "ar": "تمت إضافة {name}"
  },
  "reporting.unitsCount": {
    "sv": "{n} enheter",
    "ti": "{n} ኣሃዱታት",
    "en": "{n} units",
    "ar": "{n} وحدات"
  },
  "reporting.rowsCount": {
    "sv": "{n} rader",
    "ti": "{n} መሳርዕ",
    "en": "{n} rows",
    "ar": "{n} صفوف"
  },
  "reporting.confirmedCount": {
    "sv": "{n} bekräftade",
    "ti": "{n} ዝተረጋገጹ",
    "en": "{n} confirmed",
    "ar": "{n} مؤكدة"
  },
  "reporting.noProduct": {
    "sv": "Ingen produkt hittad för \"{n}\"",
    "ti": "ን \"{n}\" ፍርያት ኣይተረኽበን",
    "en": "No product found for \"{n}\"",
    "ar": "لم يتم العثور على منتج لـ \"{n}\""
  },
  "reporting.filteredRows": {
    "sv": "{n} av {total} rader",
    "ti": "{n} ካብ {total} መሳርዕ",
    "en": "{n} of {total} rows",
    "ar": "{n} من {total} صفوف"
  },
  "reporting.archiveSummary": {
    "sv": "Rapporter arkiveras automatiskt varje natt. Totalt {n} rapporter.",
    "ti": "ጸብጻባት ኩሉ ለይቲ ብባዕሎም ይዕቀቡ። ብድምር {n} ጸብጻባት።",
    "en": "Reports are archived automatically every night. {n} reports in total.",
    "ar": "تتم أرشفة التقارير تلقائيًا كل ليلة. الإجمالي {n} تقارير."
  },
  "reporting.reportSingle": {
    "sv": "{n} rapport",
    "ti": "{n} ጸብጻብ",
    "en": "{n} report",
    "ar": "{n} تقرير"
  },
  "reporting.reportPlural": {
    "sv": "{n} rapporter",
    "ti": "{n} ጸብጻባት",
    "en": "{n} reports",
    "ar": "{n} تقارير"
  },
  "reporting.deleteReportPrompt": {
    "sv": "Hela rapporten \"{name}\" och alla {n} rader tas bort permanent.",
    "ti": "ምሉእ ጸብጻብ \"{name}\" ከምኡውን ኩሎም {n} መሳርዕ ንሓዋሩ ይስረዙ።",
    "en": "The entire report \"{name}\" and all {n} rows will be permanently deleted.",
    "ar": "سيتم حذف التقرير \"{name}\" بالكامل وجميع صفوفه البالغ عددها {n} نهائيًا."
  }
};
export default DICT;
