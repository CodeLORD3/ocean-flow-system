import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStoresTool from "./tools/list-stores";
import searchProductsTool from "./tools/search-products";
import listCustomerOrdersTool from "./tools/list-customer-orders";
import getLotTool from "./tools/get-lot";
import { listaAiUppgifter, skapaAiUppgift, uppdateraAiUppgift, listaAiUtkast, skapaAiUtkast, uppdateraAiUtkast } from "./tools/ai-team";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "makrill-erp",
  title: "Makrill ERP",
  version: "0.1.0",
  instructions:
    "Verktyg för Makrill ERP. Läsande verktyg som körs som den inloggade användaren: list_stores för butiker och driftställen, search_products för varor och priser, list_customer_orders för kundbeställningar och get_lot för partispårbarhet. AI-teamet: lista_ai_uppgifter, skapa_ai_uppgift, uppdatera_ai_uppgift, lista_ai_utkast, skapa_ai_utkast och uppdatera_ai_utkast (kräver administratörsroll).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listStoresTool,
    searchProductsTool,
    listCustomerOrdersTool,
    getLotTool,
    listaAiUppgifter,
    skapaAiUppgift,
    uppdateraAiUppgift,
    listaAiUtkast,
    skapaAiUtkast,
    uppdateraAiUtkast,
  ],
});
