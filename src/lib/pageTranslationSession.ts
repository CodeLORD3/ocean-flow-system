import { translateUiText } from "@/lib/staffPageTranslate";
import type { StaffLang } from "@/lib/staffI18n";

const ATTRS = ["placeholder", "aria-label", "title"] as const;
const SKIP = "script,style,textarea,input,[contenteditable],[data-no-translate],code,pre";

/** A session owns only its own DOM changes; React's later changes take priority. */
export function createPageTranslationSession(lang: StaffLang) {
  const texts = new Map<Node, { original: string; translated: string }>();
  const attrs = new Map<Element, Map<string, { original: string; translated: string }>>();
  function translate(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(SKIP)) return;
      const cur = node.nodeValue ?? "";
      const saved = texts.get(node);
      const base = saved?.translated === cur ? saved.original : cur;
      const next = translateUiText(base, lang);
      if (next !== cur) {
        texts.set(node, { original: base, translated: next });
        node.nodeValue = next;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.closest(SKIP) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    for (const attr of ATTRS) {
      const cur = el.getAttribute(attr);
      if (!cur) continue;
      const saved = attrs.get(el)?.get(attr);
      const base = saved?.translated === cur ? saved.original : cur;
      const next = translateUiText(base, lang);
      if (next !== cur) {
        const entries = attrs.get(el) ?? new Map();
        entries.set(attr, { original: base, translated: next });
        attrs.set(el, entries);
        el.setAttribute(attr, next);
      }
    }
    el.childNodes.forEach(translate);
  }
  function restore() {
    for (const [node, value] of texts) {
      if (node.nodeValue === value.translated) node.nodeValue = value.original;
    }
    for (const [el, entries] of attrs) for (const [attr, value] of entries) {
      if (el.getAttribute(attr) === value.translated) el.setAttribute(attr, value.original);
    }
    texts.clear();
    attrs.clear();
  }
  return { translate, restore, attributes: ATTRS };
}