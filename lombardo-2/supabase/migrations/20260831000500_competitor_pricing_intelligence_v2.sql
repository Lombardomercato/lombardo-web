-- Competitor + Pricing Intelligence V2.
-- Commercial observations are advisory-only and have no write path to Lombardo prices.

alter table public.competitors
  add column priority text not null default 'secondary',
  add column price_source text not null default 'secondary',
  add column checkout_type text not null default 'none',
  add column source_reliable boolean not null default false;

alter table public.competitors
  add constraint competitors_priority_check
    check (priority in ('high', 'medium', 'secondary', 'b2b')),
  add constraint competitors_price_source_check
    check (price_source in ('ecommerce', 'tariff', 'whatsapp', 'secondary')),
  add constraint competitors_checkout_type_check
    check (checkout_type in ('full', 'whatsapp', 'none'));

create table public.competitor_market_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  observation_key text not null,
  product_key text not null,
  external_name text not null,
  source_url text,
  list_price numeric(18, 2),
  promotional_price numeric(18, 2),
  transfer_price numeric(18, 2),
  transfer_discount_pct numeric(8, 2),
  unit_price numeric(18, 2),
  bulk_price numeric(18, 2),
  units_per_bulk integer,
  stock_status text not null default 'unknown',
  cart_available boolean,
  pickup_cost numeric(18, 2),
  delivery_cost numeric(18, 2),
  free_delivery_threshold numeric(18, 2),
  other_payment_surcharge_pct numeric(8, 2),
  payment_conditions text,
  availability_terms text,
  price_change_conditional boolean not null default false,
  checkout_confidence numeric(5, 4) not null default 0,
  price_signal text not null,
  executable boolean not null default false,
  observed_at timestamptz not null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitor_market_observations_key unique (competitor_id, observation_key),
  constraint competitor_market_observations_tenant_competitor_key
    unique (tenant_id, competitor_id, observation_key),
  constraint competitor_market_observations_keys_check check (
    btrim(observation_key) <> '' and btrim(product_key) <> '' and btrim(external_name) <> ''
  ),
  constraint competitor_market_observations_url_check check (
    source_url is null or source_url ~ '^https://'
  ),
  constraint competitor_market_observations_prices_check check (
    (list_price is null or list_price > 0)
    and (promotional_price is null or promotional_price > 0)
    and (transfer_price is null or transfer_price > 0)
    and (unit_price is null or unit_price > 0)
    and (bulk_price is null or bulk_price > 0)
  ),
  constraint competitor_market_observations_percentages_check check (
    (transfer_discount_pct is null or transfer_discount_pct between 0 and 100)
    and (other_payment_surcharge_pct is null or other_payment_surcharge_pct between 0 and 100)
  ),
  constraint competitor_market_observations_units_check check (
    units_per_bulk is null or units_per_bulk > 0
  ),
  constraint competitor_market_observations_costs_check check (
    (pickup_cost is null or pickup_cost >= 0)
    and (delivery_cost is null or delivery_cost >= 0)
    and (free_delivery_threshold is null or free_delivery_threshold > 0)
  ),
  constraint competitor_market_observations_stock_check check (
    stock_status in ('in_stock', 'out_of_stock', 'unknown')
  ),
  constraint competitor_market_observations_checkout_confidence_check check (
    checkout_confidence between 0 and 1
  ),
  constraint competitor_market_observations_signal_check check (
    price_signal in ('strong', 'medium', 'weak', 'invalid')
  ),
  constraint competitor_market_observations_raw_check check (jsonb_typeof(raw_data) = 'object')
);

create index competitor_market_observations_dashboard_idx
  on public.competitor_market_observations (tenant_id, product_key, observed_at desc);
create index competitor_market_observations_source_idx
  on public.competitor_market_observations (competitor_id, price_signal, observed_at desc);
create index competitor_market_observations_executable_idx
  on public.competitor_market_observations (tenant_id, product_key, checkout_confidence desc)
  where executable is true and price_signal <> 'invalid';

create trigger competitor_market_observations_set_updated_at
before update on public.competitor_market_observations
for each row execute function lombardo_private.set_updated_at();

insert into public.competitors (
  tenant_id, slug, name, base_url, active, crawl_delay_ms, max_pages, parser_version,
  config, priority, price_source, checkout_type, source_reliable
)
select tenant.id, source.slug, source.name, source.base_url, true, source.crawl_delay_ms,
  source.max_pages, source.parser_version, source.config, source.priority,
  source.price_source, source.checkout_type, true
from public.tenants tenant
cross join (values
  ('positano', 'Positano Vinos', 'https://www.positanovinos.com.ar', 750, 12,
    'positano-tiendanube-v2', '{"robotsRequired":true,"executableRequiresCart":true}'::jsonb,
    'high', 'ecommerce', 'full'),
  ('vinoteca-campos', 'Vinoteca Campos', 'https://vinotecacampos.com.ar', 1000, 40,
    'audit-manual-v1', '{"priceChangeDisclaimerDegradesConfidence":true}'::jsonb,
    'high', 'ecommerce', 'full'),
  ('al-vino-vino', 'Al Vino Vino', 'https://alvinovino.com', 1000, 10,
    'tariff-v1', '{"b2bReady":true,"checkoutClaimAllowed":false}'::jsonb,
    'b2b', 'tariff', 'none'),
  ('vinos-rosario', 'Vinos Rosario', 'https://vinosrosario.com.ar', 1000, 20,
    'audit-manual-v1', '{"cashPrice":true,"otherPaymentsSurchargePct":5,"deliveryCost":5000,"freeDeliveryThreshold":100000}'::jsonb,
    'medium', 'whatsapp', 'whatsapp'),
  ('rosario-vinos-exclusivos', 'Rosario Vinos Exclusivos', 'https://rosariovinosexclusivos.com.ar', 1200, 20,
    'audit-manual-v1', '{"boutiqueCoverage":true}'::jsonb,
    'secondary', 'secondary', 'full')
) as source(slug, name, base_url, crawl_delay_ms, max_pages, parser_version, config, priority, price_source, checkout_type)
where tenant.status = 'active'
on conflict (tenant_id, slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  active = excluded.active,
  parser_version = excluded.parser_version,
  config = public.competitors.config || excluded.config,
  priority = excluded.priority,
  price_source = excluded.price_source,
  checkout_type = excluded.checkout_type,
  source_reliable = excluded.source_reliable;

with audit_rows as (
  select * from (values
    ('positano', 'fernet-branca-750-cart-20260830', 'fernet-branca-750', 'Fernet Branca 750',
      'https://www.positanovinos.com.ar/productos/', 18205.00, 14928.10, null::numeric, 5.00,
      null::numeric, null::numeric, null::integer, 'in_stock', true, 0.00, 29376.92,
      null::numeric, null::numeric, 'Crédito, débito, cuotas y transferencia; 5% informado en ficha.',
      'Precio mantenido en carrito y checkout previo al pago.', false, 0.95, 'strong', true,
      '2026-08-30T20:00:00-03:00'::timestamptz,
      '{"audit":"browser","deliveryPostalCode":"2000","deliveryAlternative":29805,"deliveryBasketSubtotal":24677.90,"paymentCompleted":false}'::jsonb),
    ('positano', 'campari-750-cart-20260830', 'campari-750', 'Campari 750',
      'https://www.positanovinos.com.ar/productos/', 11890.00, 9749.80, null::numeric, 5.00,
      null::numeric, null::numeric, null::integer, 'in_stock', true, 0.00, 29376.92,
      null::numeric, null::numeric, 'Crédito, débito, cuotas y transferencia; 5% informado en ficha.',
      'Precio mantenido en carrito y checkout previo al pago.', false, 0.95, 'strong', true,
      '2026-08-30T20:00:00-03:00'::timestamptz,
      '{"audit":"browser","deliveryPostalCode":"2000","deliveryAlternative":29805,"deliveryBasketSubtotal":24677.90,"paymentCompleted":false}'::jsonb),
    ('vinoteca-campos', 'fernet-branca-750-20260830', 'fernet-branca-750', 'Fernet Branca 750',
      'https://vinotecacampos.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      19000.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Mercado Pago, transferencia y cuotas sin tarjeta.',
      'La fuente puede indicar disponibilidad o cambio de precio.', true, 0.62, 'medium', false,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser"}'::jsonb),
    ('vinoteca-campos', 'campari-750-cart-20260830', 'campari-750', 'Campari 750',
      'https://vinotecacampos.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      13200.00, null::numeric, null::integer, 'in_stock', true, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Mercado Pago, transferencia y cuotas sin tarjeta.',
      'Precio mantenido en carrito; sujeto a condiciones visibles de la fuente.', true, 0.78, 'strong', true,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser","paymentCompleted":false}'::jsonb),
    ('vinoteca-campos', 'chandon-brut-nature-20260830', 'chandon-brut-nature', 'Chandon Brut Nature 750',
      'https://vinotecacampos.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      20500.00, null::numeric, null::integer, 'out_of_stock', false, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Condición no verificable sin stock.',
      'Sin stock; posible cambio de precio.', true, 0.00, 'invalid', false,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser"}'::jsonb),
    ('vinoteca-campos', 'skyy-750-20260830', 'skyy-750', 'Skyy 750',
      'https://vinotecacampos.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      9500.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Mercado Pago, transferencia y cuotas sin tarjeta.',
      'La fuente puede indicar disponibilidad o cambio de precio.', true, 0.62, 'medium', false,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser"}'::jsonb),
    ('vinoteca-campos', 'coquena-malbec-20260830', 'coquena-malbec', 'Coquena Malbec 750',
      'https://vinotecacampos.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      9500.00, null::numeric, null::integer, 'out_of_stock', false, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Condición no verificable sin stock.',
      'Sin stock; posible cambio de precio.', true, 0.00, 'invalid', false,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser"}'::jsonb),
    ('al-vino-vino', 'fernet-branca-750-20260830', 'fernet-branca-750', 'Fernet Branca 750',
      'https://alvinovino.com/search_live.html', null::numeric, null::numeric, null::numeric, null::numeric,
      18100.00, null::numeric, null::integer, 'out_of_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Tarifario IVA incluido; no existe checkout.',
      'Sin stock al activar el filtro.', false, 0.00, 'invalid', false,
      '2026-08-30T17:00:00-03:00'::timestamptz, '{"audit":"browser","priceSource":"TARIFF"}'::jsonb),
    ('al-vino-vino', 'campari-750-20260830', 'campari-750', 'Campari 750',
      'https://alvinovino.com/search_live.html', null::numeric, null::numeric, null::numeric, null::numeric,
      12600.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Tarifario IVA incluido; no existe checkout.',
      'Precio unitario con stock.', false, 0.45, 'weak', false,
      '2026-08-30T17:00:00-03:00'::timestamptz, '{"audit":"browser","priceSource":"TARIFF"}'::jsonb),
    ('al-vino-vino', 'chandon-brut-nature-20260830', 'chandon-brut-nature', 'Chandon Brut Nature 750',
      'https://alvinovino.com/search_live.html', null::numeric, null::numeric, null::numeric, null::numeric,
      20840.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Tarifario IVA incluido; no existe checkout.',
      'Precio unitario con stock.', false, 0.45, 'weak', false,
      '2026-08-30T17:00:00-03:00'::timestamptz, '{"audit":"browser","priceSource":"TARIFF"}'::jsonb),
    ('al-vino-vino', 'skyy-750-20260830', 'skyy-750', 'Skyy 700',
      'https://alvinovino.com/search_live.html', null::numeric, null::numeric, null::numeric, null::numeric,
      9500.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Tarifario IVA incluido; presentación 700 ml, no exacta.',
      'Comparación orientativa por diferencia de presentación.', false, 0.25, 'weak', false,
      '2026-08-30T17:00:00-03:00'::timestamptz, '{"audit":"browser","priceSource":"TARIFF","presentationMismatch":true}'::jsonb),
    ('al-vino-vino', 'coquena-malbec-20260830', 'coquena-malbec', 'Coquena Malbec 750',
      'https://alvinovino.com/search_live.html', null::numeric, null::numeric, null::numeric, null::numeric,
      10900.00, null::numeric, null::integer, 'in_stock', null::boolean, null::numeric, null::numeric,
      null::numeric, null::numeric, 'Tarifario IVA incluido; no existe checkout.',
      'Precio unitario con stock.', false, 0.45, 'weak', false,
      '2026-08-30T17:00:00-03:00'::timestamptz, '{"audit":"browser","priceSource":"TARIFF"}'::jsonb),
    ('vinos-rosario', 'campari-750-cart-20260830', 'campari-750', 'Campari 750',
      'https://vinosrosario.com.ar/', null::numeric, null::numeric, null::numeric, null::numeric,
      9796.88, null::numeric, null::integer, 'in_stock', true, null::numeric, 5000.00,
      100000.00, 5.00, 'Precio contado; otros medios +5%. Cierre por WhatsApp.',
      'Precio mantenido en carrito.', false, 0.75, 'strong', true,
      '2026-08-30T20:00:00-03:00'::timestamptz, '{"audit":"browser","checkout":"WHATSAPP"}'::jsonb)
  ) as row_data(
    competitor_slug, observation_key, product_key, external_name, source_url,
    list_price, promotional_price, transfer_price, transfer_discount_pct,
    unit_price, bulk_price, units_per_bulk, stock_status, cart_available,
    pickup_cost, delivery_cost, free_delivery_threshold, other_payment_surcharge_pct,
    payment_conditions, availability_terms, price_change_conditional,
    checkout_confidence, price_signal, executable, observed_at, raw_data
  )
)
insert into public.competitor_market_observations (
  tenant_id, competitor_id, observation_key, product_key, external_name, source_url,
  list_price, promotional_price, transfer_price, transfer_discount_pct,
  unit_price, bulk_price, units_per_bulk, stock_status, cart_available,
  pickup_cost, delivery_cost, free_delivery_threshold, other_payment_surcharge_pct,
  payment_conditions, availability_terms, price_change_conditional,
  checkout_confidence, price_signal, executable, observed_at, raw_data
)
select competitor.tenant_id, competitor.id, audit.observation_key, audit.product_key,
  audit.external_name, audit.source_url, audit.list_price, audit.promotional_price,
  audit.transfer_price, audit.transfer_discount_pct, audit.unit_price, audit.bulk_price,
  audit.units_per_bulk, audit.stock_status, audit.cart_available, audit.pickup_cost,
  audit.delivery_cost, audit.free_delivery_threshold, audit.other_payment_surcharge_pct,
  audit.payment_conditions, audit.availability_terms, audit.price_change_conditional,
  audit.checkout_confidence, audit.price_signal, audit.executable, audit.observed_at,
  audit.raw_data
from audit_rows audit
join public.competitors competitor on competitor.slug = audit.competitor_slug
join public.tenants tenant on tenant.id = competitor.tenant_id and tenant.status = 'active'
on conflict (competitor_id, observation_key) do update set
  product_key = excluded.product_key,
  external_name = excluded.external_name,
  source_url = excluded.source_url,
  list_price = excluded.list_price,
  promotional_price = excluded.promotional_price,
  transfer_price = excluded.transfer_price,
  transfer_discount_pct = excluded.transfer_discount_pct,
  unit_price = excluded.unit_price,
  bulk_price = excluded.bulk_price,
  units_per_bulk = excluded.units_per_bulk,
  stock_status = excluded.stock_status,
  cart_available = excluded.cart_available,
  pickup_cost = excluded.pickup_cost,
  delivery_cost = excluded.delivery_cost,
  free_delivery_threshold = excluded.free_delivery_threshold,
  other_payment_surcharge_pct = excluded.other_payment_surcharge_pct,
  payment_conditions = excluded.payment_conditions,
  availability_terms = excluded.availability_terms,
  price_change_conditional = excluded.price_change_conditional,
  checkout_confidence = excluded.checkout_confidence,
  price_signal = excluded.price_signal,
  executable = excluded.executable,
  observed_at = excluded.observed_at,
  raw_data = excluded.raw_data;

alter table public.competitor_market_observations enable row level security;
alter table public.competitor_market_observations force row level security;

revoke all on table public.competitor_market_observations from public, anon, authenticated;
grant select, insert, update, delete on table public.competitor_market_observations to service_role;

comment on table public.competitor_market_observations is
  'Advisory competitor price, stock, payment, delivery and checkout evidence. Never mutates supplier_prices.';
comment on column public.competitor_market_observations.executable is
  'For Positano, true only after the product was accepted by the cart.';
