CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  new_opportunity boolean NOT NULL DEFAULT true,
  investment_confirmed boolean NOT NULL DEFAULT true,
  funds_received boolean NOT NULL DEFAULT true,
  payout_approaching boolean NOT NULL DEFAULT true,
  payout_completed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prefs" ON public.notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prefs" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prefs" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);