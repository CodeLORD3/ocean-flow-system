ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Existing users (already logged in & happy) shouldn't be forced;
-- but new seeded ones should. We default to true; admins of existing accounts
-- can flip it off manually. To avoid disturbing currently-active sessions,
-- mark accounts that already have a custom user_id as not requiring change
-- only if they've already used the system. Conservative default: prompt all.