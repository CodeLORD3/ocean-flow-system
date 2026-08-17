/**
 * Företagsregister för förifyllning av nya leverantörer.
 *
 * Uppgifterna kommer från officiella registeruppgifter och företagens egna
 * sidor och används bara som förslag — allt kan redigeras innan leverantören
 * sparas.
 */
export type RegistryEntry = {
  domain: string;
  name: string;
  org_nr?: string;
  country?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  supplier_type?: string;
  currency?: string;
  note?: string;
};

export const SUPPLIER_REGISTRY: RegistryEntry[] = [
  {
    domain: "scanfjord.se",
    name: "Scanfjord Mollösund AB",
    org_nr: "556661-1926",
    country: "Sverige",
    website: "https://www.scanfjord.se",
    email: "order@scanfjord.se",
    phone: "+46 705-92 15 95",
    address: "Gamla Vägen 17, 474 70 Mollösund",
    supplier_type: "Skaldjur",
    currency: "SEK",
  },
  {
    domain: "absjomat.se",
    name: "Sjömat Group Sweden AB",
    org_nr: "559094-8807",
    country: "Sverige",
    website: "https://www.absjomat.se",
    phone: "031-797 05 00",
    address: "Fiskhamnsgatan 31, 414 51 Göteborg",
    supplier_type: "Färsk fisk",
    currency: "SEK",
  },
  {
    domain: "gamvikseafood.com",
    name: "Gamvik Seafood Sweden AB",
    org_nr: "559080-6500",
    country: "Sverige",
    website: "https://gamvikseafood.com",
    email: "order@gamvikseafood.com",
    phone: "+47 78 49 70 20",
    address: "Strandveien 63, 9775 Gamvik (moderbolag Gamvik Seafood AS, org.nr 920 952 089)",
    supplier_type: "Färsk fisk",
    currency: "SEK",
    note: ".com-domänen tillhör det svenska systerbolaget; norska AS använder gamvikseafood.no",
  },
  {
    domain: "tingstad.se",
    name: "Aktiebolaget Tingstad Papper",
    org_nr: "556117-1199",
    country: "Sverige",
    website: "https://www.tingstad.com",
    email: "kontakt@tingstad.se",
    phone: "031-707 20 00",
    address: "Marieholmsgatan 1-3, 415 02 Göteborg",
    supplier_type: "Emballage",
    currency: "SEK",
  },
  {
    domain: "hugoericsonost.se",
    name: "Hugo Ericson Ost i Saluhallen AB",
    org_nr: "556388-4542",
    country: "Sverige",
    website: "https://hugoericsonost.se",
    email: "martin@hugoericsonost.se",
    phone: "0730-93 15 38",
    address: "Stora Saluhallen 99, 411 17 Göteborg",
    supplier_type: "Kryddor & Tillbehör",
    currency: "SEK",
  },
  {
    domain: "sandstensfiskhandel.se",
    name: "Sandstens Fiskhandel Aktiebolag",
    org_nr: "556313-4567",
    country: "Sverige",
    website: "https://sandstensfiskhandel.se",
    email: "ekonomi@sandstensfiskhandel.se",
    phone: "031-42 73 65",
    address: "Fiskhamnsgatan 17, 414 58 Göteborg",
    supplier_type: "Färsk fisk",
    currency: "SEK",
  },
  {
    domain: "pac.se",
    name: "Pac-Production Sweden Aktiebolag",
    org_nr: "556300-8712",
    country: "Sverige",
    website: "https://www.pac.se",
    email: "kontakt@pac.se",
    phone: "019-17 57 00",
    address: "Berglundavägen 5-7, Box 409, 701 48 Örebro",
    supplier_type: "Emballage",
    currency: "SEK",
  },
  {
    domain: "gfa.se",
    name: "Göteborgs Fiskauktionsförening, Ek. För.",
    org_nr: "757202-7287",
    country: "Sverige",
    website: "https://www.gfa.se",
    email: "info@gfa.se",
    phone: "031-42 00 85",
    address: "Fiskhamnsgatan 13, 414 51 Göteborg",
    supplier_type: "Färsk fisk",
    currency: "SEK",
  },
  {
    domain: "fortnox.se",
    name: "Fortnox (portalavsändare)",
    country: "Sverige",
    website: "https://www.fortnox.se",
    supplier_type: "Övrigt",
    currency: "SEK",
    note: "Fakturaportal — verklig leverantör avgörs per dokument",
  },
];
