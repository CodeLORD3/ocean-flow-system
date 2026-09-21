import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Allt en person har gjort i systemet, samlat från de ställen där handlingen
 * faktiskt sparas. Ingen ny logg skapas — vi läser befintliga spår.
 */
export interface MyActivityItem {
  id: string;
  at: string;
  kind: string;
  text: string;
  detail?: string | null;
  route?: string | null;
}

const sortDesc = (a: MyActivityItem, b: MyActivityItem) => (a.at < b.at ? 1 : -1);

function routeForEntity(entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null;
  const id = entityId ?? "";
  switch (entityType) {
    case "shop_order":
    case "shop_order_line":
    case "change_request":
      return "/orders";
    case "customer_order":
    case "customer_order_line":
      return id ? `/customer-orders?markera=${id}` : "/customer-orders";
    case "product":
      return id ? `/products?markera=${id}` : "/products";
    case "stock":
    case "stock_movement":
    case "stock_count":
      return "/inventory";
    case "entity_image":
    case "image":
      return id ? `/image-feed?bild=${id}` : "/image-feed";
    case "checklist_item":
    case "task":
      return id ? `/uppgifter?markera=${id}` : "/uppgifter";
    case "daily_report":
      return "/reports";
    case "auction_purchase":
      return "/auktion";
    default:
      return null;
  }
}

export function useMyActivity(
  staffId: string | null | undefined,
  userId: string | null | undefined,
  fullName: string | null | undefined,
) {
  return useQuery({
    queryKey: ["my-activity", staffId, userId, fullName],
    enabled: !!(staffId || userId),
    queryFn: async () => {
      const out: MyActivityItem[] = [];
      const jobs: Promise<void>[] = [];

      if (fullName) {
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("activity_logs")
              .select("id, created_at, action_type, description, entity_type, entity_id")
              .eq("performed_by", fullName)
              .order("created_at", { ascending: false })
              .limit(150);
            for (const r of data ?? []) {
              out.push({
                id: `log-${r.id}`,
                at: r.created_at,
                kind: "Händelse",
                text: r.description,
                route: routeForEntity(r.entity_type, r.entity_id),
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("shop_orders")
              .select("id, created_at, order_week, desired_delivery_date, status")
              .eq("created_by", fullName)
              .order("created_at", { ascending: false })
              .limit(50);
            for (const r of data ?? []) {
              out.push({
                id: `so-${r.id}`,
                at: r.created_at ?? "",
                kind: "Beställning till grossist",
                text: `Beställning ${r.order_week ?? ""}`.trim(),
                detail: [r.desired_delivery_date, r.status].filter(Boolean).join(" · "),
                route: "/orders",
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("daily_reports")
              .select("id, created_at, report_date")
              .eq("created_by", fullName)
              .order("created_at", { ascending: false })
              .limit(50);
            for (const r of data ?? []) {
              out.push({
                id: `dr-${r.id}`,
                at: r.created_at,
                kind: "Dagsrapport",
                text: `Dagsrapport ${r.report_date}`,
                route: "/reports",
              });
            }
          })(),
        );
      }

      if (staffId) {
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("entity_images")
              .select("id, created_at, title, entity_type")
              .eq("uploaded_by", staffId)
              .order("created_at", { ascending: false })
              .limit(100);
            for (const r of data ?? []) {
              out.push({
                id: `img-${r.id}`,
                at: r.created_at,
                kind: "Bild",
                text: r.title || "Bild lagd i biblioteket",
                route: `/image-feed?bild=${r.id}`,
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("checklist_items")
              .select("id, done_at, section, note, category")
              .eq("completed_by_staff_id", staffId)
              .not("done_at", "is", null)
              .order("done_at", { ascending: false })
              .limit(100);
            for (const r of data ?? []) {
              out.push({
                id: `task-${r.id}`,
                at: r.done_at as string,
                kind: "Uppgift",
                text: r.section || r.note || "Uppgift klar",
                detail: r.category,
                route: `/uppgifter?markera=${r.id}`,
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("customer_orders")
              .select("id, created_at, order_number, customer_name_snapshot, wanted_date")
              .eq("booked_by_staff_id", staffId)
              .order("created_at", { ascending: false })
              .limit(50);
            for (const r of data ?? []) {
              out.push({
                id: `cob-${r.id}`,
                at: r.created_at,
                kind: "Kundbeställning",
                text: `${r.order_number ?? "Kundbeställning"} · ${r.customer_name_snapshot ?? ""}`.trim(),
                detail: r.wanted_date,
                route: `/customer-orders?markera=${r.id}`,
              });
            }
          })(),
        );
      }

      if (userId) {
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("customer_orders")
              .select("id, created_at, order_number, customer_name_snapshot, wanted_date")
              .eq("created_by", userId)
              .order("created_at", { ascending: false })
              .limit(50);
            for (const r of data ?? []) {
              out.push({
                id: `co-${r.id}`,
                at: r.created_at,
                kind: "Kundbeställning",
                text: `${r.order_number ?? "Kundbeställning"} · ${r.customer_name_snapshot ?? ""}`.trim(),
                detail: r.wanted_date,
                route: `/customer-orders?markera=${r.id}`,
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("entity_image_comments")
              .select("id, created_at, body, image_id")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(100);
            for (const r of data ?? []) {
              out.push({
                id: `cmt-${r.id}`,
                at: r.created_at,
                kind: "Kommentar",
                text: r.body,
                route: `/image-feed?bild=${r.image_id}`,
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("stock_movements")
              .select("id, created_at, movement_type, quantity_kg, note")
              .eq("created_by", userId)
              .order("created_at", { ascending: false })
              .limit(100);
            for (const r of data ?? []) {
              out.push({
                id: `sm-${r.id}`,
                at: r.created_at,
                kind: "Lagerrörelse",
                text: `${r.movement_type} ${Number(r.quantity_kg ?? 0).toFixed(1)} kg`,
                detail: r.note,
                route: "/inventory",
              });
            }
          })(),
        );
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from("auction_purchases")
              .select("id, created_at, note, colli, purchase_date")
              .eq("created_by", userId)
              .order("created_at", { ascending: false })
              .limit(50);
            for (const r of data ?? []) {
              out.push({
                id: `auk-${r.id}`,
                at: r.created_at,
                kind: "Auktionsinköp",
                text: `${r.note ?? "Inköp"} · ${r.colli ?? 0} kolli`,
                detail: r.purchase_date,
                route: "/auktion",
              });
            }
          })(),
        );
      }

      await Promise.allSettled(jobs);
      return out.filter((i) => !!i.at).sort(sortDesc).slice(0, 400);
    },
  });
}
