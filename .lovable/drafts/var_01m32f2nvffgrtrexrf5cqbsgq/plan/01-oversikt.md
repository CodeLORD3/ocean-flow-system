# Egen sida för varje anställd

Varje person i personalen får en egen sida med enkel information om sig själv och ett flöde med sina händelser — uppgifter man gjort, uppgifter man blivit tilldelad, bilder man lagt ut och ändringar man gjort.

## Så kommer man dit

Man klickar på en persons namn eller profilbild (i Personal, På plats nu, schema, bilder, kommentarer) och landar på personens sida. Adressen blir `/person/<id>`, så den kan delas och bokmärkas. Alla i personalen får se varandras sidor; känslig information (personnummer, lön, anställning) visas inte här utan ligger kvar i Personalregistret för admin.

## Sidans innehåll

**Topp — vem är det här**
Profilbild, hela namnet, roll/arbetsplats, butik, telefon och e-post, samt om personen är instämplad just nu (butik och sedan när).

**Sifferrad — den senaste tiden**
Utförda uppgifter (30 dagar), uppgifter som ligger på personen just nu, bilder personen lagt ut, senast aktiv i systemet.

**Händelseflöde — det man gjort**
En tidslinje grupperad per dag (Idag, Igår, datum) i samma språk som bildflödet: en rad per händelse med ikon, kort text och klockslag, och man kan trycka på raden för att komma till uppgiften, bilden eller området.

Händelser som samlas in:
- Uppgift utförd (och med vilken anteckning/tid)
- Uppgift tilldelad personen (även framåt i tiden)
- Bild lagd ut, bild kategoriserad, utsnitt skapat
- Kommentar på en bild
- Iakttagelse rapporterad
- In- och utstämpling
- Ändringar som redan loggas i systemet (skapat, ändrat, godkänt, packat)

**Flikar**
`Händelser` (allt), `Uppgifter` (tilldelade och utförda), `Bilder` (rutnät av personens bilder), `Inloggningar` (bara för admin — sessioner och besökta sidor, det som redan finns idag).

## Tomma lägen

Saknas händelser står det "Inget registrerat ännu" — aldrig påhittad exempeltext. Historik före de funktioner som började logga visas inte, precis som med visningar på bilder.
