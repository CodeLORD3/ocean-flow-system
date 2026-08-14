insert into public.user_scopes (user_id, scope_type, scope_value) values
 ('85b97b15-51d7-4b2d-aa36-f4bc72995370','portal','shop'),
 ('85b97b15-51d7-4b2d-aa36-f4bc72995370','store','eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7')
on conflict do nothing;