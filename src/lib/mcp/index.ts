import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStoresTool from "./tools/list-stores";
import searchProductsTool from "./tools/search-products";
import listCustomerOrdersTool from "./tools/list-customer-orders";
import getLotTool from "./tools/get-lot";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "makrill-erp",
  title: "Makrill ERP",
  version: "0.1.0",
  instructions:
    "Verktyg för Makrill ERP. Läsande verktyg som körs som den inloggade användaren: list_stores för butiker och driftställen, search_products för varor och priser, list_customer_orders för kundbeställningar och get_lot för partispårbarhet.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStoresTool, searchProductsTool, listCustomerOrdersTool, getLotTool],
});
