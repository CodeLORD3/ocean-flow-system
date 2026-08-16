ALTER TABLE public.user_scopes DROP CONSTRAINT IF EXISTS user_scopes_scope_type_check;
ALTER TABLE public.user_scopes ADD CONSTRAINT user_scopes_scope_type_check
  CHECK (scope_type IN ('portal','store','entity','company','region','tenant','platform'));