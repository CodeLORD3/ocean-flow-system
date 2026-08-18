SELECT cron.schedule('personalkollen-logged-times', '*/2 * * * *', $$
select net.http_post(
  url:='https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/personalkollen-sync?resource=logged-times',
  headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
  body:='{}'::jsonb) as request_id;
$$);

SELECT cron.schedule('personalkollen-work-periods', '*/10 * * * *', $$
select net.http_post(
  url:='https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/personalkollen-sync?resource=work-periods',
  headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
  body:='{}'::jsonb) as request_id;
$$);

SELECT cron.schedule('personalkollen-staff-hourly', '7 * * * *', $$
select net.http_post(
  url:='https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/personalkollen-sync?resource=staffs',
  headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
  body:='{}'::jsonb) as request_id;
$$);

SELECT cron.schedule('personalkollen-workplaces-hourly', '12 * * * *', $$
select net.http_post(
  url:='https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/personalkollen-sync?resource=workplaces',
  headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
  body:='{}'::jsonb) as request_id;
$$);