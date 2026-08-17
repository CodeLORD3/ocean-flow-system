/**
 * Företagsregister för förifyllning av nya leverantörer.
 *
 * Uppgifterna är hämtade från respektive företags egna sidor/officiella
 * registeruppgifter och används bara som förslag — allt kan redigeras innan
 * leverantören sparas.
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
};

export const SUPPLIER_REGISTRY: RegistryEntry[] = [
  {
    domain: "scanfjord.se",
    name: "Scanfjord Mollösund AB",
    country: "Sverige",
    website: "https://www.scanfjord.se",
    supplier_type: "Skaldjur",
    currency: "SEK",
  },
  {
    domain: "absjomat.se",
    name: "Sjömat Group Sweden AB",
    country: "Sverige",
    website: "https://www.absjomat.se",
    supplier_type: "Färsk fisk",
    currency: "SEK",
  },
  {
    domain: "gamvikseafood.com",
    name: "Gamvik Seafood AS",
    country: "Norge",
    website: "https://gamvikseafood.com",
    email: "order@gamvikseafood.com",
    supplier_type: "Färsk fisk",
    currency: "NOK",
  },
  {
    domain: "tingstad.se",
    name: "AB Tingstad Papper",
    country: "Sverige",
    website: "https://www.tingstad.se",
    email: "kontakt@tingstad.se",
    supplier_type: "Emballage",
    currency: "SEK",
  },
  {
    domain: "hugoericsonost.se",
    name: "Hugo Ericson Ost AB",
    country: "Sverige",
    website: "https://hugoericsonost.se",
    email: "info@hugoericsonost.se",
    supplier_type: "Kryddor & Tillbehör",
    currency: "SEK",
  },
  {
    domain: "sandstensfiskhandel.se",
    name: "Sandstens Fiskhandel AB",
    country: "Sverige",
    website: "https://sandstensfiskhandel.se",
    email: "ekonomi@sandstensfiskhandel.se",
    supplier_type: "Färsk fisk",
    currency: "SEK",
  },
  {
    domain: "pac.se",
    name: "Pac AB",
    country: "Sverige",
    website: "https://www.pac.se",
    supplier_type: "Emballage",
    currency: "SEK",
  },
  {
    domain: "gfa.se",
    name: "Göteborgs Fiskauktion",
    country: "Sverige",
    website: "https://www.gfa.se",
    email: "info@gfa.se",
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
  },
];
