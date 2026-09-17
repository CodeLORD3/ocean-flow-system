/** Rensar en webbadress till ren domän, t.ex. "https://www.coop.ch/sv" -> "coop.ch". */
export function cleanDomain(website?: string | null): string | null {
  const raw = (website ?? "").trim().toLowerCase();
  if (!raw) return null;
  const withoutScheme = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const domain = withoutScheme.split(/[/?#\s]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

/** Logotyp/ikon för företaget utifrån webbadressen. Null om vi inte har någon domän. */
export function companyLogoUrl(website?: string | null): string | null {
  const domain = cleanDomain(website);
  return domain ? `https://www.google.com/s2/favicons?sz=128&domain=${domain}` : null;
}
