alter table public.sumup_product_map
  add column if not exists external_sku text,
  add column if not exists not_stocked boolean not null default false,
  add column if not exists pos_category text,
  add column if not exists erp_name text;

create index if not exists sumup_product_map_sku_idx on public.sumup_product_map (external_sku);

create or replace function public.sumup_name_key(_name text)
returns text language sql immutable set search_path = public as $$
  select btrim(lower(regexp_replace(coalesce(_name,''), '\s+', ' ', 'g')))
$$;

with raw as (
  select regexp_split_to_table($t$
Hummer gekocht (kanadisch)|Kokt amerikansk hummer|FS-010-KA|st
Kaltgeräucherter Lachs geschnitten, offen (200 g)|Kallrökt lax skivad 200 g|FS-020|st
Störkaviar Ossietra|Störkaviar Asetra|LK-008|st
Störkaviar Beluga|Störkaviar Beluga|LK-008|st
Kaltgeräucherter Lachs geschnitten, offen (250 g)|Kallrökt lax skivad 250 g|FS-020|st
Lieferung|Leverans||st
Dill|Dill|FS-037-KNIPPA|st
Dorade ganz|Dorade hel|FS-053-HEL|kg
Eingelegter Brathering|Stekt inlagd strömming|KK-018-2HG|st
Fischburger|Fiskbiff|VK-005-VIT|st
Fischgratin|Fiskgratäng|VK-002|st
Forellenkaviar|Forellrom|KK-035|st
Krevetten tiefgekühlt 5 kg|Frysta räkor 5 kg||st
Geräucherte Krevetten|Rökta räkor|FS-001-ROK|kg
Geräucherte Makrele|Rökt makrill|KK-030|kg
Geschenkkarte|Presentkort||st
Glattbutt|Slätvar|FS-028|kg
Graved Lachs geschnitten 150 g|Gravad lax skivad 150 g|KK-022-SKI|st
Graved Lachs geschnitten, offen|Gravad lax skivad lösvikt|KK-022-LOS|kg
Heilbutt|Hälleflundra|FS-021-FIL-BAS|kg
Eingelegter Hering, offen|Inlagd sill lösvikt|KK-013-LOS|kg
Eingelegter Hering klein|Inlagd sill liten burk|KK-013-1HG|st
Eingelegter Hering mittel|Inlagd sill mellan|KK-013-2HG|st
Heringsfilet frisch|Sillfilé färsk|SIL-001-FIL-BAS|kg
Störkaviar Imperial|Störkaviar Imperial|LK-008|st
Jakobsmuscheln|Pilgrimsmusslor|SK-001|kg
Kabeljaufilet|Torskfilé|TOR-001-FIL-BAS|kg
Kabeljaurücken|Torskrygg|TOR-001-RYG|kg
Kalix Löjrom (Maränenrogen), offen|Löjrom Kalix lösvikt|KK-036-KAL|kg
Kalix Löjrom 100 g|Löjrom Kalix 100 g|KK-036-KAL-100G|st
Kalix Löjrom 500 g|Löjrom Kalix 500 g|KK-036-KAL-500G|st
Kalix Löjrom 250 g|Löjrom Kalix 250 g|KK-036-KAL-250G|st
Kaltgeräucherter Lachs geschnitten, offen|Kallrökt lax skivad lösvikt|FS-020|kg
Kaltgeräucherter Lachs geschnitten 150 g|Kallrökt lax skivad 150 g|FS-020-SKI|st
Königskrabbe Beine|Kungskrabba ben|SK-024-BEN-K|kg
Krabbe gekocht|Krabba kokt|FS-008-IRL|kg
Krebsscheren gekocht|Krabbklor kokta|FS-007-K-M|kg
Krevetten gekocht mit Schale|Räkor kokta med skal|FS-001-FR-P|kg
Krustaden (Pastetenschalen)|Krustader||st
Lachsfilet Standard|Laxfilé standard|LAX-001-FIL-BAS|kg
Lachsfilet|Laxfilé|LAX-001-FIL-LYX|kg
Lachsfilet tiefgekühlt|Laxfilé fryst||kg
Langustinen gekocht|Havskräftor kokta|HAVS-001-K-M|kg
Limande (Echte Rotzunge)|Bergtunga|FS-025|kg
Lengfilet|Långafilé|FS-040-FIL-BAS|kg
Makrele ganz|Makrill hel|FS-033|kg
Makrele in Tomatensauce|Makrill i tomatsås||st
Matjesfilets 3 Stück|Matjessillfiléer 3 st|KK-017-2HG|st
Meerrettich|Pepparrot|FG-002-ST|st
Miesmuscheln 1 kg|Blåmusslor 1 kg|FS-012-KG|st
Krevetten Mondi Eimer|Räkor Mondi hink|FS-009-HINK|st
Pastete Klädesholmen|Pastej Klädesholmen|LK-001|st
Fischpastete Lyx 250 g|Fiskpaté|KK-019-LYX-250G|st
Störkaviar Royal|Störkaviar Royal|LK-008|st
Langustinen roh|Havskräftor råa|HAVS-001-R-M|kg
Rotzungenfilet|Rödtungafilé|FS-023-FIL-BAS|kg
Seehecht|Kummel|FS-018|kg
Seeteufelfilet|Marulkstjärt|FS-031-STJ|kg
Seewolffilet|Havskattfilé|FS-039-FIL-BAS|kg
Seezunge ganz|Sjötunga hel|FS-029|kg
Seezungenfilet|Sjötungafilé|FS-029|kg
Krevetten handgeschält, Packung|Handskalade räkor förpackning|FS-009|st
Krevetten handgeschält, offen|Handskalade räkor lösvikt|FS-009-LOS|kg
Signalkrebse gekocht|Signalkräftor kokta|SK-002-K-STD|kg
Skagenröra Classic gross 500 g|Skagenröra 5 hg|KK-003-5HG|st
Skagenröra Classic mittel|Skagenröra mellan|KK-003-2HG|st
Skagenröra Classic klein 200 g|Skagenröra 2 hg|KK-003-2HG|st
Skagenröra, offen|Skagenröra lösvikt|KK-003-LOS|kg
Skagenröra Spezial, offen (gross)|Lyxskagenröra 5 hg|KK-003-LYX|st
Skagenröra Spezial, offen (klein)|Lyxskagenröra 2 hg|KK-003-LYX|st
Tintenfisch|Bläckfisk|FS-041|kg
Steinbutt|Piggvar|FS-027|kg
Surströmming|Surströmming|KT-001|st
Thunfisch Loin|Tonfisk loin|TON-001-LOIN|kg
Rotbarsch|Kungsfisk|FS-049-FIL-BAS|kg
Västerbotten-Wähe|Västerbottenpaj|VK-009-VB-LOS|kg
Warmgeräucherter Lachs, offen|Varmrökt lax lösvikt|KK-032|kg
Warmgeräucherter Lachs 300 g|Varmrökt lax 300 g|KK-032-BIT|st
Wolfsbarsch ganz|Havsabborre hel|FS-054-HEL|kg
Zanderfilet|Gösfilé|FS-026-FIL-BAS|kg
Zitrone|Citron|FS-036-ST|st
Warmgeräucherter Lachs Zitronenpfeffer, offen|Varmrökt lax citronpeppar lösvikt|KK-034|kg
Doppelt geräucherter Lachs Zitronenpfeffer 125 g|Dubbelrökt lax citronpeppar 125 g|KK-034-ST|st
Auster, Stück|Ostron styck|FS-013-FDC|st
Skagenröra Spezial, offen (mittel)|Lyxskagenröra mellan|KK-003-LYX|st
$t$, E'\n') as l
), src as (
  select split_part(l,'|',1) as pos_name,
         split_part(l,'|',2) as erp_name,
         nullif(split_part(l,'|',3),'') as sku,
         nullif(split_part(l,'|',4),'') as unit
  from raw where btrim(l) <> ''
)
insert into public.sumup_product_map
  (merchant_code, external_name, external_sku, erp_name, product_id, unit, not_stocked)
select 'MCNGCU6L', s.pos_name, s.sku, s.erp_name, p.id, s.unit, false
from src s
left join public.products p on p.sku = s.sku
on conflict (coalesce(merchant_code,''), external_name_key) do update
set external_sku = excluded.external_sku,
    erp_name = excluded.erp_name,
    product_id = coalesce(excluded.product_id, public.sumup_product_map.product_id),
    unit = coalesce(excluded.unit, public.sumup_product_map.unit),
    not_stocked = false,
    updated_at = now();

with raw as (
  select regexp_split_to_table($s$
Kvibille Cheddar 2pcs SALE|D//Fleisch\Käse
Sourgood Brot|D// Brot
Tunnbröd|D// Brot
Ahlgrens Bilar|Godis
Aladdin|Z/// JUL
Anna's Pepparkakshus|Z/// JUL
Annas pepparkakor 300g|Godis
Annas pepparkakor burk|Z/// JUL
Apple mos felix|Glas
BOB Blandsaft Jordgubb|E// Shelves
Bag|Z/// JUL
Ballerina|Godis
Bearnaise Jureskog|C// Fridge
Bearnaise Lohmanders|C// Fridge
Blutpudding|C// Fridge
Blåbärssoppa|C// Fridge
Bregott Havssalt|C// Fridge
Brot|D// Brot
Brunost|C// Fridge
Burger Cheddar|D//Fleisch\Käse
Center|Godis
Chipotle mayo|C// Fridge
Chips|Godis
Chorizo|D//Fleisch\Käse
Cinnamon Roll Sourgood|D// Brot
Krustaden mini 24 Stück|E// Knäckebröd
Daddel godis|Godis
Delicatoboll 6|Godis
Drömmar guetzli|Godis
Dumle|Godis
Dumleklubba|Godis
Estrella Dip|E// Shelves
Falu Rågrut Knäckebrot|E// Knäckebröd
Felix Bostongurke|Glas
Felix Salzgurke|Glas
Femte smakens salt|E// Shelves
Ferrari|Godis
Finskorpor|Godis
Fischbouillon|E// Shelves
Fleischbällchen|D//Fleisch\Käse
Fond Touch of Taste|Glas
Funlight|Godis
Färsking|E// Shelves
Gammaldags|E// Knäckebröd
Gelé Himbeere|Godis
Gifflar Saffran|Z/// JUL
Girlang|KRÄFTSKIVA
Godispåse|Godis
Gott & Blandat|Godis
Grillkrydda|E// Shelves
Grilloil|Glas
Gräddfil|C// Fridge
Hallon Lakrits skalle|Godis
Haribo nappar|Godis
Havregryn|E// Shelves
Havsknäcke|E// Knäckebröd
Hexvrål|Godis
Hjotronnsylt Moltebeerenkonfitüre|Glas
Hollandaise Sauce|C// Fridge
Härryda Wurst|D//Fleisch\Käse
Iceblu gift set|Godis
Ischoklad|Z/// JUL
Janssons|Z/// JUL
Johnny´s süss-scharfer Senf|E// Shelves
Juleskum|Godis
Julmust|Z/// JUL
Kaffe|E// Shelves
Kanel|E// Shelves
Kardemumma|E// Shelves
Kartoffelsalat|C// Fridge
Kexchoklad|Godis
Kick Lakritze|Godis
Klassiker Fazer|Z/// JUL
Klädesholmen Kaviar|C// Fridge
Knäckebröd large|E// Knäckebröd
Kräftbägare|KRÄFTSKIVA
Kräftdiadem|KRÄFTSKIVA
Kräftglasögon|KRÄFTSKIVA
Kräfthatt|KRÄFTSKIVA
Kräftservetter|KRÄFTSKIVA
Kräfttallrik|KRÄFTSKIVA
Kung Oscar 300g|Godis
Kung Oscar Pepparkakor burk|Z/// JUL
Kvibille Cheddar SALE|D//Fleisch\Käse
Käse|D//Fleisch\Käse
Leverpastej|C// Fridge
Lingonmarmelade|Glas
Lussekatt|Z/// JUL
Läkerol 2pack|Godis
MER drink|Godis
Malaco|Godis
Mandelbiskvier|Godis
Marabouschokolade|Godis
Marianne|Godis
Messmör|C// Fridge
Mintstång|Godis
NonStop|Godis
Nygårda julmust Glas|Z/// JUL
Nyponsoppa|C// Fridge
Oboj|Godis
Ohoj|Godis
Onsala korv|D//Fleisch\Käse
Pepparkakor Pfefferkuchen|Z/// JUL
Pepparkaksdeg|Z/// JUL
Plopp|Godis
Polarbröd|D// Brot
Polarknäcke|E// Knäckebröd
Polly|Godis
Potatismjöl Kartoffelmehl|E// Shelves
Prinskorv|D//Fleisch\Käse
Prinskorv härryda|D//Fleisch\Käse
Präst Käse|D//Fleisch\Käse
Påskmust 33cl|Godis
Risgröt|Z/// JUL
Rote Beete Salat|C// Fridge
Rote Beete in Scheiben|Glas
Räkost|C// Fridge
Rågrut Chia Havssalt|E// Knäckebröd
S Supersurt|Godis
SVINTO Putzschwamm|E// Shelves
Sarek|D// Brot
Seaweed Powder Delight|E// Shelves
Singoala|Godis
Sirap|E// Shelves
Slott´s Senf original|E// Shelves
Smettana|C// Fridge
Smörgås Gurka|Glas
Smörgåsrån Göteborgs|E// Knäckebröd
Snabbmakaroner|E// Shelves
Start muesli|E// Shelves
Ströbröd Paniermehl|E// Shelves
Surdeg & Korn|E// Knäckebröd
Svartvinbärsaft|Glas
Swedish beer|Godis
Thom Kha Gai|La Zoupa
Tonic Hav|E// Shelves
Tyrkisk Peber|Godis
Vaniljsocker|E// Shelves
Vaniljvisp|C// Fridge
Venusmuschelsuppe|La Zoupa
Västervikssenf|E// Shelves
Vörtkrydda|Z/// JUL
Vörtlimpa|Z/// JUL
Wasa Kanel|E// Knäckebröd
Wasa Knäckebrot|E// Knäckebröd
Wasa krögarens|E// Knäckebröd
Zitronenpfeffer|E// Shelves
Åke's Hönökaka|D// Brot
$s$, E'\n') as l
), spec as (
  select split_part(l,'|',1) as pos_name, split_part(l,'|',2) as cat
  from raw where btrim(l) <> ''
)
insert into public.sumup_product_map
  (merchant_code, external_name, pos_category, not_stocked)
select 'MCNGCU6L', s.pos_name, s.cat, true
from spec s
on conflict (coalesce(merchant_code,''), external_name_key) do update
set pos_category = excluded.pos_category,
    not_stocked = (public.sumup_product_map.product_id is null),
    updated_at = now();