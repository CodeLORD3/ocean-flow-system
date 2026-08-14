/**
 * Innehållet i butiksmanualen.
 *
 * Håll texten i klarspråk – manualen läses av all butikspersonal, inte av
 * utvecklare. Varje kapitel har: syfte, steg-för-steg och vanliga problem.
 * Bilderna ligger i /public/manual och är riktiga skärmdumpar ur systemet.
 */

export type ManualChapter = {
  id: string;
  title: string;
  route?: string;
  image?: string;
  purpose: string;
  steps: string[];
  tips?: string[];
  problems: { q: string; a: string }[];
};

export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    id: "kom-igang",
    title: "1. Kom igång – logga in och välj portal",
    purpose:
      "Alla anställda har ett eget konto. Kontot styr vilka butiker och vilka sidor du kommer åt. Du loggar in med din jobbmejl och ditt lösenord.",
    steps: [
      "Gå till systemets adress i webbläsaren och klicka på Logga in.",
      "Skriv din mejladress och ditt lösenord. Första gången du loggar in måste du byta lösenord – välj ett du kommer ihåg och som ingen annan känner till.",
      "Har du tillgång till flera portaler visas en valsida: klicka på Butik.",
      "Har du tillgång till flera butiker väljer du butik i nästa steg. Du hamnar alltid på Översikt.",
      "Vill du byta butik under dagen: logga ut och logga in igen, eller använd butiksväljaren uppe till höger.",
    ],
    tips: [
      "Lägg till sidan som genväg på mobilens hemskärm – då fungerar den som en app.",
      "Dela aldrig ditt konto. All aktivitet loggas på den som är inloggad.",
    ],
    problems: [
      {
        q: "Jag har glömt mitt lösenord",
        a: "Klicka på Glömt lösenord på inloggningssidan. Du får ett mejl med en länk där du sätter ett nytt. Kommer inget mejl – kolla skräpposten och att du skrev rätt adress.",
      },
      {
        q: "Det står ”Ingen portal-åtkomst”",
        a: "Ditt konto saknar behörighet. Kontakta din butikschef eller admin så tilldelar de portal och butik på din personalprofil.",
      },
      {
        q: "Jag ser inte alla mina butiker",
        a: "Logga ut och in igen (behörigheter läses in vid inloggning). Kvarstår det: admin behöver lägga till butikerna på ditt konto.",
      },
    ],
  },
  {
    id: "oversikt",
    title: "2. Översikt – butikens startsida",
    route: "/organisation",
    image: "/manual/organisation.png",
    purpose:
      "Översikt är butikens dagliga startsida. Här ser du butikens bild och adress, dagens foton från butiken, vem som jobbar just nu, samt chatten med grossisten.",
    steps: [
      "Stämpla in när du börjar passet med knappen uppe till höger. Knappen växlar sedan till Stämpla ut.",
      "Ladda upp foton från butiken under Bilder från butiken – dra och släpp, eller klicka på Lägg till bild. Bilderna visas för grossist och admin.",
      "Klicka på en bild för att se den i helskärm, kommentera den eller markera som favorit. På mobilen bläddrar du genom att svajpa.",
      "Använd Filter för att växla mellan Idag, Igår och äldre datum. Vid midnatt startar en ny dag och gårdagens bilder flyttas automatiskt till Igår.",
      "Skriv snabbt till grossisten direkt i chattrutan till höger, eller klicka Visa alla för hela chatten.",
    ],
    tips: [
      "Fota disken på morgonen och innan stängning – det är underlaget grossisten använder för att bedöma sortiment och svinn.",
      "Siffran bredvid en menypost är olästa notiser. Området lyser upp kort när något nytt kommer in.",
    ],
    problems: [
      {
        q: "Bilden laddas inte upp",
        a: "Kontrollera nätet. Mycket stora bilder komprimeras automatiskt, men extremt stora filer kan ta tid – vänta tills bilden dyker upp i rutnätet innan du lämnar sidan.",
      },
      {
        q: "Jag glömde stämpla in",
        a: "Stämpla in när du upptäcker det och säg till butikschefen – tiden kan rättas i efterhand på din personalprofil.",
      },
    ],
  },
  {
    id: "chatt",
    title: "3. Chatt",
    route: "/chat",
    image: "/manual/chat.png",
    purpose:
      "Chatten är den officiella kommunikationsvägen mellan butik och grossist. Butiken chattar alltid med Grossist – grossisten i sin tur med admin och övriga butiker.",
    steps: [
      "Öppna Chatt i menyn. Välj mottagare i listan till vänster.",
      "Skriv meddelandet och tryck Enter för att skicka. Bild skickas med bildikonen.",
      "Nya meddelanden ger ett ljud och en siffra i menyn. Siffran försvinner när du öppnat chatten.",
    ],
    tips: [
      "Skriv beställningsändringar i ordern, inte bara i chatten – annars syns de inte i systemet.",
    ],
    problems: [
      {
        q: "Jag hör inget ljud vid nya meddelanden",
        a: "Webbläsaren kräver att du klickat någonstans på sidan innan ljud får spelas. Klicka i fönstret en gång efter inloggning.",
      },
      {
        q: "Jag kan inte chatta med en annan butik",
        a: "Det är avsiktligt. Butik kommunicerar med grossisten, som förmedlar vidare.",
      },
    ],
  },
  {
    id: "checklista",
    title: "4. Checklista",
    route: "/checklist",
    image: "/manual/checklist.png",
    purpose:
      "Dagliga rutiner som ska utföras och signeras – öppning, stängning, temperaturer, städning. Checklistan är butikens bevis på att rutinerna följts.",
    steps: [
      "Öppna Checklista. Välj den checklista du ska köra (t.ex. Dagligt).",
      "Bocka av varje rad när momentet är utfört. Lägg vid behov en kommentar på raden.",
      "Skriv din signatur längst ned. Signaturen kan ändras om du signerat fel.",
      "Tryck Klar. Om rader saknas markeras de rött – bekräfta ändå eller gå tillbaka och komplettera.",
      "Tidigare dagar hittar du under historiken, och du kan skriva ut en färdig checklista som PDF.",
    ],
    problems: [
      {
        q: "Jag tryckte Klar för tidigt",
        a: "Öppna dagens checklista igen och komplettera raderna – ändringen loggas med tid och person.",
      },
      {
        q: "Vi behöver en ny punkt i listan",
        a: "Butikschef eller admin lägger till punkten i mallen; den slår igenom nästa dag.",
      },
    ],
  },
  {
    id: "egenkontroll",
    title: "5. Egenkontroll",
    route: "/food-safety",
    image: "/manual/food-safety.png",
    purpose:
      "Livsmedelssäkerhet: temperaturer, mottagningskontroll, hållbarhet och avvikelser. Detta är underlaget vid kommunens kontrollbesök.",
    steps: [
      "Registrera temperaturer i kyl och frys enligt rutin, en gång per pass.",
      "Vid avvikelse: skriv vad som hände och vilken åtgärd som vidtogs.",
      "Kontrollera hållbarhetsdatum – systemet varnar för partier som närmar sig utgång.",
    ],
    problems: [
      {
        q: "Temperaturen är för hög",
        a: "Registrera värdet ändå, flytta varan till fungerande kyla, skriv åtgärd och meddela butikschef och grossist i chatten.",
      },
    ],
  },
  {
    id: "kundbestallningar",
    title: "6. Kundbeställningar",
    route: "/customer-orders",
    image: "/manual/customer-orders.png",
    purpose:
      "Alla kundordrar samlade: beställningar i butik, per telefon, från webben och förbokningar från bokningssidan. Här packar och lämnar du ut.",
    steps: [
      "Klicka Ny beställning för att lägga in en order: välj kund (eller skapa ny), lägg till produkter med mängd, sätt hämtdatum och tid.",
      "Ordrarna listas per hämtdag och vecka. Bokade webbordrar hamnar automatiskt på rätt hämtdatum.",
      "Vid packning: öppna ordern, väg varje rad och fyll i faktisk vikt. Raden får status Packad och rullgardinen stängs.",
      "Skriv ut packlista eller etikett från orderns meny.",
      "Vid utlämning: markera ordern som Utlämnad. Hämtar kunden inte ut – tryck Uteblev (går att ångra).",
      "Vyn Dagens hämtningar visar dagens bokningar sorterade på tidsfönster.",
      "Klara ordrar kan arkiveras så listan hålls ren.",
    ],
    tips: [
      "Ordrar märkta ”Bokad per telefon” är inlagda av personal, inte verifierade med SMS-kod.",
    ],
    problems: [
      {
        q: "Kunden vill ändra sin order",
        a: "Öppna ordern och ändra raderna. Är varan redan packad – ändra vikten och skriv en notering.",
      },
      {
        q: "En webborder ligger på fel datum",
        a: "Öppna ordern och rätta hämtdatumet, samt meddela admin så vi kan kontrollera importen.",
      },
      {
        q: "Kunden finns dubbelt",
        a: "Säg till admin – kundposter slås ihop centralt, radera inte manuellt.",
      },
    ],
  },
  {
    id: "ordrar",
    title: "7. Ordrar – beställ från grossisten",
    route: "/orders",
    image: "/manual/orders.png",
    purpose:
      "Butikens inköp från grossisten. Här lägger du veckans eller dagens beställning och följer vad som händer med varje rad.",
    steps: [
      "Klicka Ny beställning och välj leveransdag.",
      "Sök produkt, välj den och ange mängd direkt – produktkortet visar bild och enhet.",
      "Skicka beställningen. Grossisten ser den direkt.",
      "Följ statusen per rad: Ny, Beställd (varan är beställd i hamnen och inväntar upphämtning), Packad, Levererad eller Avvisad. Färgen på raden visar statusen.",
      "Vid leverans: stäm av mot följesedeln och registrera i Inleveranser.",
    ],
    problems: [
      {
        q: "Jag behöver ändra en skickad order",
        a: "Öppna ordern och begär ändring, samt skriv till grossisten i chatten. Ändringar efter att raden är packad kan inte alltid tas emot.",
      },
      {
        q: "En rad blev avvisad",
        a: "Varan fanns inte att få. Lägg ett önskemål eller beställ ett alternativ.",
      },
    ],
  },
  {
    id: "kunder",
    title: "8. Kunder",
    route: "/customers",
    image: "/manual/customers.png",
    purpose:
      "Butikens kundregister: privatkunder och företagskunder med kontaktuppgifter och orderhistorik.",
    steps: [
      "Sök på namn eller telefonnummer innan du skapar en ny kund – annars blir det dubbletter.",
      "Klicka Lägg till kund och fyll i förnamn, efternamn, telefon och eventuell mejl.",
      "Öppna en kund för att se tidigare beställningar och antal uteblivna hämtningar.",
    ],
    problems: [
      {
        q: "Kunden vill bli raderad (GDPR)",
        a: "Skicka begäran till admin. Kunduppgifterna avidentifieras då, medan orderstatistiken behålls anonymt.",
      },
    ],
  },
  {
    id: "onskemal",
    title: "9. Önskemål",
    route: "/wishes",
    image: "/manual/wishes.png",
    purpose:
      "Här säger butiken vad ni vill ha in men som inte finns i sortimentet. Grossisten ser alla butikers önskemål och tar med dem i inköpet.",
    steps: [
      "Klicka Lägg till önskemål, skriv vara, önskad mängd och när ni behöver den.",
      "Följ status: grossisten markerar önskemålet som hanterat eller kommenterar.",
    ],
    problems: [
      {
        q: "Mitt önskemål blev inte inköpt",
        a: "Varan gick inte att få eller var för dyr. Grossisten kommenterar orsaken – fråga i chatten om det är oklart.",
      },
    ],
  },
  {
    id: "lager",
    title: "10. Lager",
    route: "/inventory",
    image: "/manual/inventory.png",
    purpose:
      "Butikens lagersaldo, uppdelat i lagerplatser och underlager per produktkategori (Försäljningslager, kyl, frys). Saldot byggs alltid av registrerade lagerrörelser – därför måste allt som händer med varan registreras.",
    steps: [
      "Öppna Lager och bläddra i lagerträdet: lagerplats → underlager → produkt → parti.",
      "Klicka på en produkt för att se partier, hållbarhet och spårbarhet.",
      "Överföring: flytta varor mellan lagerplatser eller till annan butik under Överföringar. Mottagande butik bekräftar.",
      "Svinn: registrera kasserad vara med orsak – det är enda sättet saldot blir rätt.",
      "Inventering: räkna och justera saldot, skriv orsak. Justeringen loggas.",
    ],
    tips: [
      "Är saldot fel beror det nästan alltid på en oregistrerad händelse – svinn, uttag eller en inleverans som inte bokats.",
    ],
    problems: [
      {
        q: "Saldot stämmer inte med disken",
        a: "Kontrollera att dagens inleveranser är registrerade och att svinn är bokat. Justera sedan via inventering med kommentar.",
      },
      {
        q: "Ett parti har passerat hållbarhet",
        a: "Partiet spärras för försäljning. Registrera det som svinn så försvinner det ur saldot.",
      },
    ],
  },
  {
    id: "inleveranser",
    title: "11. Inleveranser",
    route: "/receiving",
    image: "/manual/receiving.png",
    purpose:
      "Registrering av varor som kommer in till butiken. Det är här varan får sitt parti, sin hållbarhet och kommer in i lagret.",
    steps: [
      "Öppna Inleveranser när leveransen kommer.",
      "Välj den väntande leveransen från grossisten, eller skapa en manuell inleverans.",
      "Kontrollera temperatur på varan och registrera värdet.",
      "Stäm av mängd och vikt mot följesedeln, rätta avvikelser och ange bäst före-datum.",
      "Godkänn inleveransen – först då syns varorna i lagret.",
    ],
    problems: [
      {
        q: "Det kom mindre än beställt",
        a: "Registrera det som faktiskt kom och skriv en avvikelsekommentar. Meddela grossisten i chatten.",
      },
      {
        q: "Varan saknar bäst före-datum",
        a: "Sätt datum enligt hållbarhetsregeln för varugruppen och notera det i kommentaren.",
      },
    ],
  },
  {
    id: "personal",
    title: "12. Personal och din profil",
    route: "/staff",
    image: "/manual/staff.png",
    purpose:
      "Personalregister för butiken med kontaktuppgifter, roller och behörigheter. Varje anställd har en profilsida med stämplingar och pass.",
    steps: [
      "Öppna Personal för att se vilka som tillhör butiken.",
      "Klicka på en person för profilen: kontaktuppgifter, stämplingar, pass och historik.",
      "Butikschef kan redigera uppgifter samt ge tillgång till fler butiker och portaler.",
    ],
    problems: [
      {
        q: "En stämpling saknas eller är fel",
        a: "Butikschef rättar tiden på personalprofilen. Rättelsen loggas i aktivitetsloggen.",
      },
    ],
  },
  {
    id: "schema",
    title: "13. Schema",
    route: "/staff-schedule",
    image: "/manual/staff-schedule.png",
    purpose:
      "Planerade pass per vecka och person, med jämförelse mot faktiska stämplingar och lönesumma.",
    steps: [
      "Välj vecka högst upp och lägg in pass per person.",
      "Jämför planerat mot stämplat – avvikelser markeras.",
      "Publicera schemat så personalen ser sina pass.",
    ],
    problems: [
      {
        q: "Mitt pass syns inte",
        a: "Schemat är kanske inte publicerat ännu, eller så är du inte kopplad till butiken. Fråga butikschefen.",
      },
    ],
  },
  {
    id: "rapporter",
    title: "14. Rapporter",
    route: "/reports",
    image: "/manual/reports.png",
    purpose:
      "Butikens rapporter, bland annat lagerrapport med ingående lager (gårdagens utgående), inleveranser, försäljning och utgående lager.",
    steps: [
      "Öppna Rapporter och välj period.",
      "Starta en ny rapport, fyll i värdena och spara.",
      "Skriv ut eller ladda ned som PDF vid behov.",
    ],
    problems: [
      {
        q: "Ingående lager stämmer inte",
        a: "Ingående lager är gårdagens utgående. Skiljer det sig saknas en registrering – kontrollera lager och inleveranser för gårdagen.",
      },
    ],
  },
  {
    id: "dagsrapport",
    title: "15. Dagsrapport",
    route: "/dagsrapport",
    image: "/manual/dagsrapport.png",
    purpose:
      "Kort sammanfattning av dagen: försäljning, händelser, bemanning och noteringar till nästa pass.",
    steps: [
      "Öppna Dagsrapport i slutet av dagen – dagens datum är förifyllt.",
      "Fyll i siffror och skriv en kort kommentar om dagen.",
      "Spara. Rapporten blir läsbar för butikschef, grossist och admin.",
    ],
    problems: [
      {
        q: "Jag hann inte skriva rapporten igår",
        a: "Öppna gårdagens datum och fyll i i efterhand – det syns att den skrevs senare.",
      },
    ],
  },
  {
    id: "kalender",
    title: "16. Kalender, Mötesprotokoll och Uppgifter",
    route: "/schedule",
    image: "/manual/schedule.png",
    purpose:
      "Gemensam kalender för leveranser och händelser, protokoll från möten samt uppgifter som ska göras.",
    steps: [
      "Kalender: se leveransdagar, helgdagar och planerade händelser.",
      "Mötesprotokoll: skapa protokoll, bocka av punkter och skriv en notering i notiskolumnen när punkten är klar.",
      "Uppgifter: lägg upp att-göra med ansvarig och datum, bocka av när det är gjort.",
    ],
    problems: [
      {
        q: "En punkt är avbockad men inget hände",
        a: "Skriv i notiskolumnen vad som faktiskt gjordes – det är där uppföljningen sker.",
      },
    ],
  },
  {
    id: "bokning",
    title: "17. Bokningsinställningar och Helgdagskalender",
    route: "/booking-settings",
    image: "/manual/booking-settings.png",
    purpose:
      "Styr butikens förbokningssida (bokafiskskaldjur.se): om butiken tar emot bokningar, meddelande när ni är stängda och avvikande dagar.",
    steps: [
      "Bokningsinställningar: slå av eller på Öppen för bokningar och skriv meddelandet kunden ser när ni är stängda.",
      "Skriv en informationstext om något gäller särskilt för er försäljningsplats.",
      "Helgdagskalender: lägg in datum ni har stängt eller avvikande öppettider – dagen går då inte att välja i bokningsflödet.",
    ],
    problems: [
      {
        q: "Kunder kan boka en dag vi har stängt",
        a: "Lägg in dagen i Helgdagskalendern. Ändringen slår igenom direkt på bokningssidan.",
      },
    ],
  },
  {
    id: "meny",
    title: "18. Anpassa meny och notiser",
    image: "/manual/booking-holidays.png",
    purpose:
      "Varje butik kan gömma menyposter ni inte använder och byta ordning, så sidomenyn bara visar det som är relevant.",
    steps: [
      "Klicka Anpassa meny längst ned i sidomenyn.",
      "Kryssa av det ni inte använder och dra för att ändra ordning. Översikt går inte att gömma.",
      "Spara – inställningen gäller hela butiken.",
    ],
    problems: [
      {
        q: "En sida jag behöver saknas i menyn",
        a: "Den är antingen gömd (öppna Anpassa meny) eller inte tillgänglig för butiksportalen. Fråga admin.",
      },
    ],
  },
  {
    id: "logg",
    title: "19. Aktivitetslogg",
    route: "/audit",
    image: "/manual/audit.png",
    purpose:
      "Allt som görs i systemet loggas: vem, vad och när. Loggen används för att reda ut vad som hänt – inte för att övervaka.",
    steps: [
      "Öppna Aktivitetslogg och filtrera på datum eller typ av händelse.",
      "Klicka på en rad för detaljer.",
    ],
    problems: [
      {
        q: "Vem ändrade saldot?",
        a: "Sök i loggen på lagerhändelser för dagen – ändringen står med person och tidpunkt.",
      },
    ],
  },
  {
    id: "felsokning",
    title: "20. Om något strular – felsökning",
    purpose:
      "De flesta problem löses på under en minut. Gå igenom listan i ordning innan du kontaktar support.",
    steps: [
      "Ladda om sidan (Ctrl+R, eller dra nedåt på mobilen).",
      "Kontrollera nätverket – statusen längst ned till höger visar om databasen är ansluten.",
      "Logga ut och in igen. Det löser nästan alla behörighets- och menyproblem.",
      "Töm cachen med en hård omladdning (Ctrl+Shift+R) om sidan ser gammal ut.",
      "Kvarstår felet: klicka Rapportera fel nere till höger, beskriv vad du gjorde och vad som hände. Felrapporten går direkt till admin.",
    ],
    tips: [
      "Skriv alltid vilken sida, vilken butik och vilken tid felet inträffade – det halverar tiden att lösa det.",
    ],
    problems: [
      {
        q: "Sidan är vit eller snurrar",
        a: "Ladda om. Händer det igen på samma sida – rapportera fel med sidans namn.",
      },
      {
        q: "Jag ser inte data för min butik",
        a: "Kontrollera butiksnamnet uppe till vänster – du kan vara inloggad i fel butik.",
      },
      {
        q: "En knapp gör ingenting",
        a: "Oftast saknas behörighet eller ett obligatoriskt fält. Kolla efter rött fält i formuläret, annars rapportera fel.",
      },
      {
        q: "Allt är långsamt",
        a: "Stäng flikar du inte använder och kontrollera wifi. Systemet håller flera sidor öppna samtidigt för snabb växling.",
      },
    ],
  },
];
