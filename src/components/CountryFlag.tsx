const COUNTRY_CODE_MAP: Record<string, string> = {
  "sweden": "se", "se": "se",
  "norway": "no", "no": "no",
  "denmark": "dk", "dk": "dk",
  "finland": "fi", "fi": "fi",
  "iceland": "is", "is": "is",
  "switzerland": "ch", "ch": "ch",
  "united kingdom": "gb", "gb": "gb",
  "germany": "de", "de": "de",
  "netherlands": "nl", "nl": "nl",
  "france": "fr", "fr": "fr",
  "spain": "es", "es": "es",
  "italy": "it", "it": "it",
  "portugal": "pt", "pt": "pt",
  "united states": "us", "us": "us",
  "canada": "ca", "ca": "ca",
  "japan": "jp", "jp": "jp",
  "china": "cn", "cn": "cn",
  "south korea": "kr", "kr": "kr",
  "australia": "au", "au": "au",
  "brazil": "br", "br": "br",
  "india": "in", "in": "in",
};

function getCode(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CODE_MAP[country.toLowerCase()] || null;
}

interface CountryFlagProps {
  country: string | null | undefined;
  size?: number;
  className?: string;
}

export default function CountryFlag({ country, size = 16, className = "" }: CountryFlagProps) {
  const code = getCode(country);
  if (!code) return null;

  return (
    <img
      src={`https://flagcdn.com/w80/${code}.png`}
      alt={country || ""}
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
