-- 1. Tenants: absolut gräns mellan plattformskunder
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'saas_customer' CHECK (type IN ('owner_group','saas_customer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Bolag kopplas till tenant + region
ALTER TABLE public.legal_entities
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS country_tag text,
  ADD COLUMN IF NOT EXISTS vat_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_legal_entities_tenant ON public.legal_entities(tenant_id);

-- 3. Nya roller (enum-värden måste läggas i egen migration innan de används)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'wholesale_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'region_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'group_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';