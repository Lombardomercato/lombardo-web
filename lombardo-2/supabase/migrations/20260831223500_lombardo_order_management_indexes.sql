create index if not exists commerce_order_management_events_order_fk_idx
  on public.commerce_order_management_events (order_id);

create index if not exists commerce_order_management_events_operator_fk_idx
  on public.commerce_order_management_events (operator_user_id);

create index if not exists commerce_orders_management_updated_by_idx
  on public.commerce_orders (management_updated_by);
