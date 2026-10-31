# Fortnox-import: fortsätt även i undermappar

## Bekräftat fel
Importen läser högst tre mappar per körning. Fem rotmappar ligger alltid före upptäckta undermappar och den återstående kön kastas bort. Därför kommer undermappar aldrig fram till läsning i standardkörningen.

## Föreslagen rättning
- Spara kvarvarande mappkö per bolag mellan körningarna och återuppta den nästa gång.
- Behåll gränsen tre mappar per körning, befintlig tidsbudget, djupgräns och dubblettskydd.
- Spara också ej behandlade filreferenser så filer inte tappas bort vid tids- eller antalstak.
- Starta ett nytt varv från rotmapparna först när det föregående varvet är klart.
- Förhindra att två samtidiga körningar tar samma arbetskö och hantera tillfälliga läsfel med återförsök.
- Bevara befintliga dokument och körningsscheman. Inget bokförs och inga mejl skickas vid test.

## Kontroll
- Test med fem rötter och minst två nivåer av undermappar: samtliga mappar nås över flera körningar.
- Test av avbruten körning, fillimit, tillfälligt läsfel och två samtidiga körningar.
- Test att återupptagen import inte skapar dokumentdubbletter.

## Tekniska detaljer
Beständig arbetskö och körningslås kräver en additiv databasändring med service-only åtkomst. Ändringen begränsas till Fortnox-inkorgens import och dess kö; inga generella behörigheter utökas.

## Separat kvarstående kontroll
Fynd 4:s historiska timeouter kan inte kopplas till en viss fråga med tillgängligt underlag. Den nuvarande kassatransaktionstabellen har cirka 128 rader och ett relevant butik/datum-index. Ingen ändring av kassans beräkningar föreslås utan en aktuell långsam fråga eller reproducerbart fel.