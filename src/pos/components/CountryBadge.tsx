// Tiny country-flag helper using Unicode regional indicator chars.
// Not emoji per se — treated as text in our font-fallback chain (and gracefully
// invisible when font lacks them, in which case the ISO code is shown instead).

const ISO_TO_NAME: Record<string, string> = {
  SE: "Sverige",
  NO: "Norge",
  DK: "Danmark",
  IS: "Island",
  FO: "Färöarna",
  GB: "Storbritannien",
  IE: "Irland",
  NL: "Nederländerna",
  ES: "Spanien",
  PT: "Portugal",
  FR: "Frankrike",
  DE: "Tyskland",
  IT: "Italien",
  GR: "Grekland",
  PL: "Polen",
  FI: "Finland",
  CA: "Kanada",
  US: "USA",
};

function isoToFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "";
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => c.charCodeAt(0) + base));
}

interface CountryFlagProps {
  iso: string | null | undefined;
  showCode?: boolean;
  className?: string;
}

export function CountryFlag({ iso, showCode = false, className }: CountryFlagProps) {
  if (!iso) return null;
  const code = iso.toUpperCase();
  const name = ISO_TO_NAME[code] ?? code;
  return (
    <span
      title={name}
      className={className}
      aria-label={name}
      style={{ fontFamily: "'Twemoji Country Flags','Apple Color Emoji','Segoe UI Emoji', system-ui" }}
    >
      <span aria-hidden>{isoToFlag(code)}</span>
      {showCode && <span className="ml-0.5 text-[10px] font-medium tracking-wide">{code}</span>}
    </span>
  );
}

export function countryName(iso: string | null | undefined): string {
  if (!iso) return "";
  return ISO_TO_NAME[iso.toUpperCase()] ?? iso.toUpperCase();
}
