
-- Sessions table: one row per login session
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  duration_seconds integer,
  user_agent text,
  portal text
);

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_staff_id ON public.user_sessions(staff_id);
CREATE INDEX idx_user_sessions_login_at ON public.user_sessions(login_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert own session"
  ON public.user_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update own session"
  ON public.user_sessions FOR UPDATE
  USING (true);

CREATE POLICY "Public read user_sessions"
  ON public.user_sessions FOR SELECT
  USING (true);

-- Page visits table
CREATE TABLE public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  path text NOT NULL,
  page_title text,
  visited_at timestamptz NOT NULL DEFAULT now(),
  portal text
);

CREATE INDEX idx_page_visits_user_id ON public.page_visits(user_id);
CREATE INDEX idx_page_visits_staff_id ON public.page_visits(staff_id);
CREATE INDEX idx_page_visits_visited_at ON public.page_visits(visited_at DESC);

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page_visits"
  ON public.page_visits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public read page_visits"
  ON public.page_visits FOR SELECT
  USING (true);

-- Auto-link existing staff with matching auth users by email
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL
  AND s.email IS NOT NULL
  AND lower(s.email) = lower(u.email);
