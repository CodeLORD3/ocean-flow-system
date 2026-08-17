update mail_intake_messages set status='paminnelse'
where status='okand_avsandare'
  and (subject ilike '%påminnelse%' or subject ilike '%paminnelse%' or subject ilike '%inkasso%' or subject ilike '%kravbrev%');