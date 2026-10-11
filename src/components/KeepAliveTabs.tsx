import { RetailCustomerProfile } from "@/components/orders/RetailCustomerProfile";
import React, { ComponentType, Suspense, lazy, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageState } from "@/components/PageState";
import { useTabs } from "@/contexts/TabsContext";

// Eagerly import all page components so they stay mounted
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const InventoryRouter = lazy(() => import("@/pages/InventoryRouter"));
const AuctionMobile = lazy(() => import("@/pages/AuctionMobile"));
const ProductionRouter = lazy(() => import("@/pages/ProductionRouter"));
const OrdersRouter = lazy(() => import("@/pages/OrdersRouter"));
const Receiving = lazy(() => import("@/pages/Receiving"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const Customers = lazy(() => import("@/pages/Customers"));
const Stores = lazy(() => import("@/pages/Stores"));
const Staff = lazy(() => import("@/pages/Staff"));
const PersonalHub = lazy(() => import("@/pages/PersonalHub"));
import { WithStaffNav } from "@/components/staff/StaffModuleNav";
import { STAFF_MODULE_PATHS } from "@/lib/staffModuleNav";
const Employees = lazy(() => import("@/pages/Employees"));
const StaffProfile = lazy(() => import("@/pages/StaffProfile"));
const Barcodes = lazy(() => import("@/pages/Barcodes"));
const Products = lazy(() => import("@/pages/Products"));
const OrganisationOverview = lazy(() => import("@/pages/OrganisationOverview"));
const PlaceholderPage = lazy(() => import("@/pages/PlaceholderPage"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const SizeGrades = lazy(() => import("@/pages/SizeGrades"));
const TransformationRecipes = lazy(() => import("@/pages/TransformationRecipes"));
const ProductionRecipes = lazy(() => import("@/pages/ProductionRecipes"));
const PurchaseReporting = lazy(() => import("@/pages/PurchaseReporting"));
const PurchaseReconciliation = lazy(() => import("@/pages/PurchaseReconciliation"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const ShopReports = lazy(() => import("@/pages/ShopReports"));
const PurchaseSchedule = lazy(() => import("@/pages/PurchaseSchedule"));
const ProductionSchedule = lazy(() => import("@/pages/ProductionSchedule"));
const ProductionReporting = lazy(() => import("@/pages/ProductionReporting"));
const ReportsRouter = lazy(() => import("@/pages/ReportsRouter"));
const AuditRouter = lazy(() => import("@/pages/AuditRouter"));
const BugReports = lazy(() => import("@/pages/BugReports"));
const LiveStaff = lazy(() => import("@/pages/LiveStaff"));
const Personalkollen = lazy(() => import("@/pages/Integrations/Personalkollen"));
const IntegrationLog = lazy(() => import("@/pages/IntegrationLog"));
const NegativeFlags = lazy(() => import("@/pages/NegativeFlags"));
const Rostrapporter = lazy(() => import("@/pages/Rostrapporter"));
const LotPage = lazy(() => import("@/pages/LotPage"));
const ClockStations = lazy(() => import("@/pages/ClockStations"));
const TimeEntriesPage = lazy(() => import("@/pages/TimeEntriesPage"));
const MyTime = lazy(() => import("@/pages/MyTime"));
const StaffRules = lazy(() => import("@/pages/StaffRules"));
const HRControlCenter = lazy(() => import("@/pages/HRControlCenter"));
const PayrollExports = lazy(() => import("@/pages/PayrollExports"));
const PayrollReview = lazy(() => import("@/pages/PayrollReview"));
const PayrollBasisPeriod = lazy(() => import("@/pages/PayrollBasisPeriod"));
const ClockVsPk = lazy(() => import("@/pages/ClockVsPk"));
const FortnoxSettings = lazy(() => import("@/pages/FortnoxSettings"));

const StaffSchedule = lazy(() => import("@/pages/StaffSchedule"));
const SchedulePlanner = lazy(() => import("@/pages/SchedulePlanner"));
const MyShifts = lazy(() => import("@/pages/MyShifts"));
const Attestations = lazy(() => import("@/pages/Attestations"));

const TradeOffers = lazy(() => import("@/pages/TradeOffers"));
const TradeHistory = lazy(() => import("@/pages/TradeHistory"));
const InvestorPortal = lazy(() => import("@/pages/InvestorPortal"));
const InvestorList = lazy(() => import("@/pages/InvestorList"));
const InvestmentLog = lazy(() => import("@/pages/InvestmentLog"));
const ScheduleCalendar = lazy(() => import("@/pages/ScheduleCalendar"));
const Companies = lazy(() => import("@/pages/Companies"));
const ContactSettings = lazy(() => import("@/pages/ContactSettings"));
const AboutSettings = lazy(() => import("@/pages/AboutSettings"));
const Payouts = lazy(() => import("@/pages/Payouts"));
const AdminPayments = lazy(() => import("@/pages/AdminPayments"));
const MapSettings = lazy(() => import("@/pages/MapSettings"));
const ShopWishes = lazy(() => import("@/pages/ShopWishes"));
const WholesaleWishes = lazy(() => import("@/pages/WholesaleWishes"));
const MeetingProtocols = lazy(() => import("@/pages/MeetingProtocols"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const ResourceRegister = lazy(() => import("@/pages/ResourceRegister"));
const LandingSettings = lazy(() => import("@/pages/LandingSettings"));
const Vehicles = lazy(() => import("@/pages/Vehicles"));
const Establishments = lazy(() => import("@/pages/Establishments"));
const LegalEntitiesPage = lazy(() => import("@/pages/LegalEntitiesPage"));
const FoodSafety = lazy(() => import("@/pages/FoodSafety"));
const Chat = lazy(() => import("@/pages/Chat"));
const ImageFeed = lazy(() => import("@/pages/ImageFeed"));

const Checklist = lazy(() => import("@/pages/Checklist"));
const Uppgifter = lazy(() => import("@/pages/Uppgifter"));
const Attestera = lazy(() => import("@/pages/Attestera"));
const Tavlan = lazy(() => import("@/pages/Tavlan"));
const Samtal = lazy(() => import("@/pages/Samtal"));
const Meddelanden = lazy(() => import("@/pages/Meddelanden"));
const Systemkontroll = lazy(() => import("@/pages/Systemkontroll"));
const VdOversikt = lazy(() => import("@/pages/VdOversikt"));
const Flow = lazy(() => import("@/pages/Flow"));
const Kunder = lazy(() => import("@/pages/Kunder"));
const Resultat = lazy(() => import("@/pages/Resultat"));
const Likviditet = lazy(() => import("@/pages/Likviditet"));
const NyButik = lazy(() => import("@/pages/NyButik"));
const Myndighetsarenden = lazy(() => import("@/pages/Myndighetsarenden"));
const Veckomal = lazy(() => import("@/pages/Veckomal"));
const TaskDetail = lazy(() => import("@/pages/TaskDetail"));
const StoreMap = lazy(() => import("@/pages/StoreMap"));
const Manual = lazy(() => import("@/pages/Manual"));
const DailyReport = lazy(() => import("@/pages/DailyReport"));
const StoreOrderToday = lazy(() => import("@/pages/StoreOrderToday"));
const IncomingStoreOrders = lazy(() => import("@/pages/IncomingStoreOrders"));
const CountMobile = lazy(() => import("@/pages/CountMobile"));
const ImportantPapersPage = lazy(() => import("@/pages/ImportantPapersPage"));
const Production = lazy(() => import("@/pages/Production"));
const DataCoverage = lazy(() => import("@/pages/DataCoverage"));
const SystemStatus = lazy(() => import("@/pages/SystemStatus"));
const LagerBlueprint = lazy(() => import("@/pages/LagerBlueprint"));
const PosFoundation = lazy(() => import("@/pages/PosFoundation"));
const PosPrices = lazy(() => import("@/pages/PosPrices"));
const ClockGuides = lazy(() => import("@/pages/ClockGuides"));
const StockDisappearance = lazy(() => import("@/pages/StockDisappearance"));
const PosLive = lazy(() => import("@/pages/PosLive"));
const ShopifyWebOrders = lazy(() => import("@/pages/ShopifyWebOrders"));
const StockMovementsPage = lazy(() => import("@/pages/StockMovementsPage"));
const StockTransfers = lazy(() => import("@/pages/StockTransfers"));
const Arrivals = lazy(() => import("@/pages/Arrivals"));
const ExternalProduction = lazy(() => import("@/pages/ExternalProduction"));

const WasteReports = lazy(() => import("@/pages/WasteReports"));
const CustomerOrders = lazy(() => import("@/pages/CustomerOrders"));
const TraceabilityPage = lazy(() => import("@/pages/TraceabilityPage"));
const BookingAssortment = lazy(() => import("@/pages/BookingAssortment"));
const BookingSettings = lazy(() => import("@/pages/BookingSettings"));
const BookingBlocklist = lazy(() => import("@/pages/BookingBlocklist"));
const BookingHolidays = lazy(() => import("@/pages/BookingHolidays"));
import { NoAccessView } from "@/components/NoAccessView";
import { useSite } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";
import { canOpenStaffPage, staffLevelOf } from "@/lib/staffModuleAccess";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import ReturnToImageBar from "@/components/images/ReturnToImageBar";
const PersonPage = lazy(() => import("@/pages/PersonPage"));

interface RouteEntry {
  component: React.ReactNode;
}

const ROUTE_MAP: Record<string, RouteEntry> = {
  "/": { component: <Dashboard /> },
  "/inventory": { component: <InventoryRouter /> },
  "/rakna": { component: <CountMobile /> },
  "/auktion": { component: <AuctionMobile /> },
  "/m/inventering": { component: <CountMobile /> },
  "/dagens-bestallning": { component: <StoreOrderToday /> },
  "/inkomna-bestallningar": { component: <IncomingStoreOrders /> },
  "/orders": { component: <OrdersRouter /> },
  "/customer-orders": { component: <CustomerOrders /> },
  "/suppliers": { component: <Suppliers /> },
  "/customers": { component: <Customers /> },
  "/stores": { component: <Stores /> },
  "/organisation": { component: <OrganisationOverview /> },
  "/personal": { component: <PersonalHub /> },
  "/staff": { component: <Staff /> },
  "/employees": { component: <Employees /> },
  "/profile": { component: <StaffProfile /> },
  "/reports": { component: <ReportsRouter /> },
  "/finance": { component: <PlaceholderPage title="Ekonomi" /> },
  "/forecasts": { component: <PlaceholderPage title="Prognoser" /> },
  "/invoices": { component: <Invoices /> },
  "/purchase-reporting": { component: <PurchaseReporting /> },
  "/purchase-reconciliation": { component: <PurchaseReconciliation /> },
  "/size-grades": { component: <SizeGrades /> },
  "/transformation-recipes": { component: <TransformationRecipes /> },
  "/produktion-recept": { component: <ProductionRecipes /> },
  "/receiving": { component: <Receiving /> },
  "/products": { component: <Products /> },
  "/barcodes": { component: <Barcodes /> },
  "/pricing": { component: <Pricing /> },
  "/purchase-schedule": { component: <PurchaseSchedule /> },
  "/production-schedule": { component: <ProductionSchedule /> },
  "/production-reporting": { component: <ProductionReporting /> },
  "/audit": { component: <AuditRouter /> },
  "/bug-reports": { component: <BugReports /> },
  "/live-staff": { component: <LiveStaff /> },
  "/personalkollen": { component: <Personalkollen /> },
  "/clock-stations": { component: <ClockStations /> },
  "/time-entries": { component: <TimeEntriesPage /> },
  "/my-time": { component: <MyTime /> },
  "/staff-rules": { component: <StaffRules /> },
  "/hr-control": { component: <HRControlCenter /> },
  "/payroll-exports": { component: <PayrollExports /> },
  "/payroll-review": { component: <PayrollReview /> },
  "/payroll-basis": { component: <PayrollBasisPeriod /> },
  "/clock-vs-pk": { component: <ClockVsPk /> },
  "/on-site-now": { component: <LiveStaff /> },
  "/staff-schedule": { component: <StaffSchedule /> },
  "/schedule-planner": { component: <SchedulePlanner /> },
  "/my-shifts": { component: <MyShifts /> },
  "/attestations": { component: <Attestations /> },

  "/fortnox": { component: <FortnoxSettings /> },
  "/integration-log": { component: <IntegrationLog /> },
  "/negativa-saldon": { component: <NegativeFlags /> },
  "/rostrapporter": { component: <Rostrapporter /> },
  "/settings": { component: <PlaceholderPage title="Systeminställningar" /> },
  "/trade-offers": { component: <TradeOffers /> },
  "/trade-history": { component: <TradeHistory /> },
  "/investment-log": { component: <InvestmentLog /> },
  "/payouts": { component: <Payouts /> },
  "/investor-portal": { component: <InvestorPortal /> },
  "/investor-list": { component: <InvestorList /> },
  "/schedule": { component: <ScheduleCalendar /> },
  "/companies": { component: <Companies /> },
  "/contact-settings": { component: <ContactSettings /> },
  "/about-settings": { component: <AboutSettings /> },
  "/admin-payments": { component: <AdminPayments /> },
  "/map-settings": { component: <MapSettings /> },
  "/wishes": { component: <ShopWishes /> },
  "/store-wishes": { component: <WholesaleWishes /> },
  "/meetings": { component: <MeetingProtocols /> },
  "/tasks": { component: <Tasks /> },
  "/utrustning": { component: <ResourceRegister /> },
  "/landing-settings": { component: <LandingSettings /> },
  "/vehicles": { component: <Vehicles /> },
  "/establishments": { component: <Establishments /> },
  "/legal-entities": { component: <LegalEntitiesPage /> },
  "/food-safety": { component: <FoodSafety /> },
  "/chat": { component: <Chat /> },
  "/image-feed": { component: <ImageFeed /> },
  "/checklist": { component: <Checklist /> },
  "/uppgifter": { component: <Uppgifter /> },
  "/attestera": { component: <Attestera /> },
  "/tavlan": { component: <Tavlan /> },
  "/samtal": { component: <Samtal /> },
  "/meddelanden": { component: <Meddelanden /> },
  "/systemkontroll": { component: <Systemkontroll /> },
  "/vd": { component: <VdOversikt /> },
  "/flow": { component: <Flow /> },
  "/kunder": { component: <Kunder /> },
  "/resultat": { component: <Resultat /> },
  "/likviditet": { component: <Likviditet /> },
  "/ny-butik": { component: <NyButik /> },
  "/myndighetsarenden": { component: <Myndighetsarenden /> },
  "/veckomal": { component: <Veckomal /> },
  "/store-map": { component: <StoreMap /> },
  "/butikskarta": { component: <StoreMap mapOnly /> },

  "/manual": { component: <Manual /> },
  "/dagsrapport": { component: <DailyReport /> },
  "/viktiga-papper": { component: <ImportantPapersPage /> },
  "/production": { component: <ProductionRouter /> },
  "/coverage": { component: <DataCoverage /> },
  "/system-status": { component: <SystemStatus /> },
  "/lager-blueprint": { component: <LagerBlueprint /> },
  "/clock-guides": { component: <ClockGuides /> },
  "/pos-live": { component: <PosLive /> },
  "/pos-fundament": { component: <PosFoundation /> },
  "/pos-priser": { component: <PosPrices /> },
  "/shopify": { component: <ShopifyWebOrders /> },
  "/stock-movements": { component: <StockMovementsPage /> },
  "/stock-disappearance": { component: <StockDisappearance /> },
  "/stock-transfers": { component: <StockTransfers /> },
  "/waste": { component: <WasteReports /> },
  "/arrivals": { component: <Arrivals /> },
  "/external-production": { component: <ExternalProduction /> },

  "/traceability": { component: <TraceabilityPage /> },
  "/booking-assortment": { component: <BookingAssortment /> },
  "/booking-settings": { component: <BookingSettings /> },
  "/booking-blocklist": { component: <BookingBlocklist /> },
  "/booking-holidays": { component: <BookingHolidays /> },
};

/**
 * Renders all opened tabs simultaneously, hiding inactive ones with CSS.
 * This preserves component state (open dialogs, scroll position, form data)
 * when switching between tabs.
 */
export function KeepAliveTabs() {
  const { tabs, activeTab } = useTabs();
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const staffLevel = staffLevelOf(staff);
  const isMobile = useIsMobile();

  // Telefon: högst 3 flikar hålls monterade (senast använda), övriga avmonteras.
  const recent = useRef<string[]>([]);
  if (activeTab) {
    recent.current = [activeTab, ...recent.current.filter((p) => p !== activeTab)].slice(0, 10);
  }
  const keep = isMobile ? new Set(recent.current.slice(0, 3)) : null;

  return (
    <>
      {tabs.map((tab) => {
        if (keep && !keep.has(tab.path)) return null;
        const kund = tab.path.match(/^\/customer-orders\/kund\/([^/]+)$/);
        const uppgift = tab.path.match(/^\/uppgift\/([^/]+)$/);
        const person = tab.path.match(/^\/person\/([^/]+)$/);
        const lotM = tab.path.match(/^\/lot\/([^/]+)$/);
        const route: RouteEntry | undefined = kund
          ? { component: <RetailCustomerProfile customerId={kund[1]} /> }
          : uppgift
            ? { component: <TaskDetail taskId={uppgift[1]} /> }
            : person
              ? { component: <PersonPage staffId={person[1]} /> }
              : lotM
                ? { component: <LotPage lotId={lotM[1]} /> }
                : ROUTE_MAP[tab.path];
        if (!route) return null;

        const isActive = tab.path === activeTab;
        const isStaffRoute = STAFF_MODULE_PATHS.includes(tab.path);
        const content = isStaffRoute
          ? <WithStaffNav>{route.component}</WithStaffNav>
          : route.component;
        const allowed = canAccessRoute(site, tab.path) && (!isStaffRoute || canOpenStaffPage(staffLevel, tab.path));
        return (
          <div
            key={tab.path}
            className="h-full w-full"
            style={{ display: isActive ? "block" : "none" }}
          >
            {isActive && <ReturnToImageBar />}
            <Suspense fallback={<PageState state="loading" />}>
              {allowed ? content : <NoAccessView site={site} path={tab.path} />}
            </Suspense>
          </div>
        );
      })}
    </>
  );
}
