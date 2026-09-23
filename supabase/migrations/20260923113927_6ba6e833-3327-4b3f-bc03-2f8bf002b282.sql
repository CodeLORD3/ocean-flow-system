-- ============================================================
-- Makrilltrade POS, etapp P1: fundament
-- Journalminnet är append only. Enda skrivvägen är pos_journal_append.
--
-- Händelsetyper i payload-konventionen:
--   session_open, session_close, receipt_finalized, receipt_return,
--   receipt_copy, training_on, training_off, drawer_open_no_sale,
--   x_report, z_report, config_changed, journal_export
-- Övningsläge markeras alltid med payload-fältet training: true och får
-- aldrig påverka pos_grand_totals.gt_sales.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL UNIQUE,
  name text NOT NULL,
  currency_code char(3) NOT NULL,
  locale text NOT NULL,
  timezone text NOT NULL,
  cash_rounding numeric(6,2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pos_regions TO authenticated;
GRANT ALL ON public.pos_regions TO service_role;
ALTER TABLE public.pos_regions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_regions' AND policyname='Personal läser regioner') THEN
    CREATE POLICY "Personal läser regioner" ON public.pos_regions FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS region_country char(2);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_code text;
CREATE UNIQUE INDEX IF NOT EXISTS stores_store_code_key ON public.stores (store_code) WHERE store_code IS NOT NULL;

-- ---------- Register ----------
CREATE TABLE IF NOT EXISTS public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id),
  register_number text NOT NULL UNIQUE,
  name text,
  software_version text NOT NULL DEFAULT 'p1.0.0',
  journal_writer text NOT NULL DEFAULT 'cloud' CHECK (journal_writer IN ('cloud','edge_gateway')),
  worldline_terminal_id text,
  fiscal_device_ref text,
  journal_seq bigint NOT NULL DEFAULT 0,
  journal_last_hash text,
  register_token_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pos_registers TO authenticated;
GRANT ALL ON public.pos_registers TO service_role;
ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_registers' AND policyname='Personal läser register') THEN
    CREATE POLICY "Personal läser register" ON public.pos_registers FOR SELECT TO authenticated
      USING (public.is_staff() AND public.can_see_store(store_id));
  END IF;
END $$;

-- ---------- Kassapass ----------
CREATE TABLE IF NOT EXISTS public.pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.pos_registers(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_staff_id uuid,
  opening_float numeric(12,2) NOT NULL DEFAULT 0,
  closed_at timestamptz,
  closed_by_staff_id uuid,
  training boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_sessions_one_open_per_register
  ON public.pos_sessions (register_id) WHERE status = 'open';

GRANT SELECT ON public.pos_sessions TO authenticated;
GRANT ALL ON public.pos_sessions TO service_role;
ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_sessions' AND policyname='Personal läser kassapass') THEN
    CREATE POLICY "Personal läser kassapass" ON public.pos_sessions FOR SELECT TO authenticated
      USING (public.is_staff() AND public.can_see_store(store_id));
  END IF;
END $$;

-- ---------- Journalminne ----------
CREATE TABLE IF NOT EXISTS public.pos_journal (
  register_id uuid NOT NULL REFERENCES public.pos_registers(id),
  sequence_no bigint NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id),
  event_type text NOT NULL,
  staff_id uuid,
  session_id uuid,
  receipt_id uuid,
  payload jsonb NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  software_version text NOT NULL,
  origin text NOT NULL DEFAULT 'cloud',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (register_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS pos_journal_store_time_idx ON public.pos_journal (store_id, event_time DESC);

GRANT SELECT ON public.pos_journal TO authenticated;
GRANT ALL ON public.pos_journal TO service_role;
ALTER TABLE public.pos_journal ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_journal' AND policyname='Personal läser journalen') THEN
    CREATE POLICY "Personal läser journalen" ON public.pos_journal FOR SELECT TO authenticated
      USING (public.is_staff() AND public.can_see_store(store_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pos_journal_no_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Journalminnet är låst. Journalposter kan varken ändras eller tas bort.';
END;
$$;

DROP TRIGGER IF EXISTS pos_journal_block_update ON public.pos_journal;
CREATE TRIGGER pos_journal_block_update BEFORE UPDATE ON public.pos_journal
  FOR EACH ROW EXECUTE FUNCTION public.pos_journal_no_change();

DROP TRIGGER IF EXISTS pos_journal_block_delete ON public.pos_journal;
CREATE TRIGGER pos_journal_block_delete BEFORE DELETE ON public.pos_journal
  FOR EACH ROW EXECUTE FUNCTION public.pos_journal_no_change();

-- ---------- Kontrollsumma ----------
CREATE OR REPLACE FUNCTION public.pos_journal_hash(
  prev text, seq bigint, etype text, etime timestamptz, payload jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(
      coalesce(prev,'') || '|' || seq::text || '|' || coalesce(etype,'') || '|' ||
      to_char(etime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || payload::text,
      'sha256'
    ), 'hex');
$$;

-- ---------- Enda skrivvägen ----------
CREATE OR REPLACE FUNCTION public.pos_journal_append(
  p_register_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_staff_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_receipt_id uuid DEFAULT NULL
) RETURNS public.pos_journal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r public.pos_registers;
  v_seq bigint;
  v_prev text;
  v_time timestamptz := now();
  v_hash text;
  v_row public.pos_journal;
BEGIN
  SELECT * INTO r FROM public.pos_registers WHERE id = p_register_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Kassaregistret finns inte.';
  END IF;

  v_seq := r.journal_seq + 1;
  v_prev := coalesce(r.journal_last_hash, repeat('0', 64));
  v_hash := public.pos_journal_hash(v_prev, v_seq, p_event_type, v_time, p_payload);

  INSERT INTO public.pos_journal (
    register_id, sequence_no, event_time, store_id, legal_entity_id, event_type,
    staff_id, session_id, receipt_id, payload, prev_hash, hash, software_version, origin
  ) VALUES (
    r.id, v_seq, v_time, r.store_id, r.legal_entity_id, p_event_type,
    p_staff_id, p_session_id, p_receipt_id, p_payload, v_prev, v_hash, r.software_version,
    CASE WHEN r.journal_writer = 'edge_gateway' THEN 'edge_gateway' ELSE 'cloud' END
  ) RETURNING * INTO v_row;

  UPDATE public.pos_registers
     SET journal_seq = v_seq, journal_last_hash = v_hash, updated_at = now()
   WHERE id = r.id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_journal_append(uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_journal_append(uuid, text, jsonb, uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pos_journal_append(uuid, text, jsonb, uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pos_journal_append(uuid, text, jsonb, uuid, uuid, uuid) TO service_role;

-- ---------- Verifiering av kedjan ----------
CREATE OR REPLACE FUNCTION public.pos_journal_verify(p_register_id uuid)
RETURNS TABLE(ok boolean, first_bad_seq bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  j record;
  v_prev text := repeat('0', 64);
BEGIN
  FOR j IN
    SELECT * FROM public.pos_journal
     WHERE register_id = p_register_id
     ORDER BY sequence_no
  LOOP
    IF j.prev_hash <> v_prev
       OR j.hash <> public.pos_journal_hash(j.prev_hash, j.sequence_no, j.event_type, j.event_time, j.payload) THEN
      RETURN QUERY SELECT false, j.sequence_no;
      RETURN;
    END IF;
    v_prev := j.hash;
  END LOOP;
  RETURN QUERY SELECT true, NULL::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_journal_verify(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_journal_verify(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_journal_verify(uuid) TO authenticated, service_role;

-- ---------- Ackumulerade summor ----------
CREATE TABLE IF NOT EXISTS public.pos_grand_totals (
  register_id uuid PRIMARY KEY REFERENCES public.pos_registers(id),
  gt_sales numeric(14,2) NOT NULL DEFAULT 0,
  gt_returns numeric(14,2) NOT NULL DEFAULT 0,
  gt_net numeric(14,2) GENERATED ALWAYS AS (gt_sales - gt_returns) STORED,
  receipt_count bigint NOT NULL DEFAULT 0,
  training_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pos_grand_totals TO authenticated;
GRANT ALL ON public.pos_grand_totals TO service_role;
ALTER TABLE public.pos_grand_totals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_grand_totals' AND policyname='Personal läser kassasummor') THEN
    CREATE POLICY "Personal läser kassasummor" ON public.pos_grand_totals FOR SELECT TO authenticated
      USING (public.is_staff() AND EXISTS (
        SELECT 1 FROM public.pos_registers r
         WHERE r.id = register_id AND public.can_see_store(r.store_id)
      ));
  END IF;
END $$;