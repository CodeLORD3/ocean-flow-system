import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/**
 * Driftguider för stämpelklockan. Skrivskyddad sida under Administration.
 * Tre delar: aktivera station (butikschef), så funkar klockan (personal),
 * och morgonkollen första veckan.
 */

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="space-y-1">
        <p className="font-medium leading-tight">{title}</p>
        {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
      </div>
    </li>
  );
}

export default function ClockGuides() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Stämpelklockan — driftguider</h1>
        <p className="text-sm text-muted-foreground">
          Från 16 september 2026 är den här klockan enda tidskällan för de svenska enheterna.
          Skriv ut de två första guiderna och sätt upp dem i butiken.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">1. Aktivera klockstation</CardTitle>
          <Badge variant="outline">Butikschef · en sida</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            <Step n={1} title="Kontoret skapar stationen och ger dig en aktiveringskod på åtta siffror.">
              Koden gäller för en enda enhet.
            </Step>
            <Step n={2} title="Öppna klockans adress i webbläsaren på surfplattan eller kassadatorn.">
              Adressen slutar på /clock. Lägg den som bokmärke på startskärmen.
            </Step>
            <Step n={3} title="Skriv aktiveringskoden på sifferknappsatsen och tryck AKTIVERA.">
              Fel kod ger ett tydligt felmeddelande — inget händer med klockan.
            </Step>
            <Step n={4} title="Kontrollera längst ned på skärmen att rätt butik står där.">
              Står fel butik: ring kontoret. Stationen flyttas där och du får en ny kod.
            </Step>
            <Step n={5} title="Starta helskärm och stäng av skärmsläckaren på enheten.">
              Klockan har ingen väg ut till resten av systemet, så plattan kan stå framme.
            </Step>
            <Step n={6} title="Testa själv: stämpla in och ut en gång.">
              Enheten är nu aktiverad tills kontoret återkallar den. Omladdning, omstart och
              utloggad webbläsare kräver ingen ny kod.
            </Step>
          </ol>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Om samma kod används på en andra enhet avvisas den. Kontoret roterar då koden i
            Administration → Klockstationer.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">2. Stämpelklockan: så funkar den</CardTitle>
          <Badge variant="outline">All personal · en sida</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            <Step n={1} title="Stämpla in: slå ditt personnummer på knappsatsen och tryck FORTSÄTT.">
              Ditt namn visas. Tryck IN. Skärmen kvitterar tiden och butiken.
            </Step>
            <Step n={2} title="Stämpla ut: samma sak, tryck UT.">
              Kvittensen visar din arbetade tid för dagen.
            </Step>
            <Step n={3} title="Rast stämplas inte.">
              Din chef lägger in rasten när passet godkänns.
            </Step>
            <Step n={4} title="Glömt stämpla?">
              Säg till din butikschef samma eller nästa dag. Chefen lägger in tiden med en
              anteckning — den syns i loggen.
            </Step>
            <Step n={5} title="Slutar du dagen i en annan butik?">
              Stämpla ut på den klocka som finns där. Det fungerar.
            </Step>
            <Step n={6} title="Går nätet ner?">
              Stämpla som vanligt. Klockan sparar trycket och skickar det när nätet är tillbaka.
            </Step>
          </ol>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Ditt personnummer visas alltid maskerat på skärmen. Ingen annan kan se det.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">3. Första veckan: butikschefens morgonkoll</CardTitle>
          <Badge variant="outline">Varje morgon</Badge>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Öppna driftkortet på startsidan: stämplade i går, antal personer, varningar.</li>
            <li>Oattesterade pass: godkänn gårdagens tider och lägg in rastavdrag.</li>
            <li>Varning "fel system": någon har stämplat i Personalkollen — påminn personen.</li>
            <li>Schemalagd men noll stämplingar: lägg in tiden manuellt med anteckning.</li>
            <li>Klockan svart eller avstängd? Starta plattan — ingen ny kod behövs.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
