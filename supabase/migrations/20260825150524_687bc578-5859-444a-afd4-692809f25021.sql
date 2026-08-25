-- RLS-uttryck utvärderas med den frågande rollens rättigheter, därför måste
-- hjälpfunktionerna vara körbara för authenticated. De läcker ingen data:
-- de returnerar endast true/false för en given person.
GRANT EXECUTE ON FUNCTION public.employee_is_self(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_employee(uuid) TO authenticated;
