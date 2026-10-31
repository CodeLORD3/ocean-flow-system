import { useEffect } from "react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { normalizeLang } from "@/lib/staffI18n";
import { createPageTranslationSession } from "@/lib/pageTranslationSession";

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
    const session = createPageTranslationSession(lang);
    document.documentElement.lang = lang;
    session.translate(root);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") session.translate(m.target);
        else if (m.type === "attributes") session.translate(m.target);
        else m.addedNodes.forEach(session.translate);
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...session.attributes] });
    return () => {
      obs.disconnect();
      session.restore();
      document.documentElement.lang = "sv";
    };
  }, [lang]);

  return null;
}
