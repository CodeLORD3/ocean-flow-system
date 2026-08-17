update public.customer_orders
set status = 'avbruten',
    cancelled_at = now(),
    cancelled_reason = 'Dubblett av identisk förbokning',
    cancelled_source = 'system',
    deleted_reason = 'Dubblett av identisk förbokning'
where id in ('c3b2b1dd-8e06-4b48-bff5-45ae028e345c','b298aa5e-2e33-40d1-9395-9e0058ca136a');