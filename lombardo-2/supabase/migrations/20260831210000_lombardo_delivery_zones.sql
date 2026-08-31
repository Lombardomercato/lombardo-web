alter table public.commerce_orders
  drop constraint commerce_orders_delivery_address_check,
  drop constraint commerce_orders_delivery_method_check;

alter table public.commerce_orders
  add constraint commerce_orders_delivery_method_check
  check (
    delivery_method = any (
      array[
        'PICKUP'::text,
        'DELIVERY'::text,
        'DELIVERY_ROSARIO'::text,
        'DELIVERY_SOUTH'::text
      ]
    )
  ),
  add constraint commerce_orders_delivery_address_check
  check (
    (delivery_method = 'PICKUP'::text and delivery_address is null)
    or (
      delivery_method <> 'PICKUP'::text
      and jsonb_typeof(delivery_address) = 'object'::text
    )
  );
