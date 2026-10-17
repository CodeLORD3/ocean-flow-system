import { useEffect } from "react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { normalizeLang, type StaffLang } from "@/lib/staffI18n";
import { translateUiText } from "@/lib/staffPageTranslate";

const ATTRS = ["placeholder", "aria-label", "title"] as const;
const SKIP = "script,style,textarea,input,[contenteditable],[data-no-translate],code,pre";
const original = new WeakMap<Node, string>();

function translateNode(node: Node, lang: StaffLang) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const cur = node.nodeValue ?? "";
    const orig = original.get(node);
    // React kan ha skrivit ny svensk text — utgå alltid från det som står nu om det inte är vår översättning.
    const base = orig !== undefined && translateUiText(orig, lang) === cur ? orig : cur;
    const next = translateUiText(base, lang);
    if (next !== cur) {
      original.set(node, base);
      node.nodeValue = next;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.closest(SKIP) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const t = translateUiText(v, lang);
      if (t !== v) el.setAttribute(a, t);
    }
  }
  el.childNodes.forEach((c) => translateNode(c, lang));
}

/**
 * Översätter hela gränssnittet till den inloggade personens språk.
 * Bara texter som finns i ordlistan byts — produktnamn och inmatad data finns
 * inte där och visas därför alltid som de är.
 */
export function StaffPageTranslator() {
  const { staff } = useStaffAuth();
  const lang = normalizeLang(staff?.preferred_lang);

  useEffect(() => {
    if (lang === "sv") return;
    const root = document.body;
    document.documentElement.lang = lang;
    translateNode(root, lang);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") translateNode(m.target, lang);
        else if (m.type === "attributes") translateNode(m.target, lang);
        else m.addedNodes.forEach((n) => translateNode(n, lang));
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      obs.disconnect();
      document.documentElement.lang = "sv";
    };
  }, [lang]);

  return null;
}
