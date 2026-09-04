create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create or replace function public.lombardo_normalize_product_search(p_value text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(extensions.unaccent(coalesce(p_value, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.lombardo_normalize_product_search(text)
  from public, anon, authenticated;
grant execute on function public.lombardo_normalize_product_search(text)
  to service_role;

alter table public.supplier_products
  add column search_document text not null default '';

comment on column public.supplier_products.search_document is
  'Server-maintained normalized SKU, name, presentation and Lombardo editorial brand/name used by fuzzy search.';

create or replace function public.supplier_prepare_product_search_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand text;
  v_name_override text;
begin
  select editorial.brand_name, editorial.name_override
  into v_brand, v_name_override
  from public.supplier_product_editorial editorial
  where editorial.supplier_product_id = new.id;

  new.search_document := public.lombardo_normalize_product_search(
    concat_ws(
      ' ',
      new.supplier_sku,
      new.normalized_name,
      new.name_raw,
      new.normalized_presentation,
      new.presentation_raw,
      v_brand,
      v_name_override
    )
  );
  return new;
end;
$$;

revoke all on function public.supplier_prepare_product_search_document()
  from public, anon, authenticated;

create trigger supplier_products_prepare_search_document
before insert or update of
  supplier_sku,
  normalized_name,
  name_raw,
  normalized_presentation,
  presentation_raw
on public.supplier_products
for each row execute function public.supplier_prepare_product_search_document();

create or replace function public.supplier_refresh_product_search_from_editorial()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_brand text;
  v_name_override text;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.supplier_product_id;
  else
    v_product_id := new.supplier_product_id;
    v_brand := new.brand_name;
    v_name_override := new.name_override;
  end if;

  update public.supplier_products product
  set search_document = public.lombardo_normalize_product_search(
    concat_ws(
      ' ',
      product.supplier_sku,
      product.normalized_name,
      product.name_raw,
      product.normalized_presentation,
      product.presentation_raw,
      v_brand,
      v_name_override
    )
  )
  where product.id = v_product_id;
  return null;
end;
$$;

revoke all on function public.supplier_refresh_product_search_from_editorial()
  from public, anon, authenticated;

create trigger supplier_product_editorial_refresh_search_document
after insert or update of brand_name, name_override
on public.supplier_product_editorial
for each row execute function public.supplier_refresh_product_search_from_editorial();

create trigger supplier_product_editorial_delete_search_document
after delete
on public.supplier_product_editorial
for each row execute function public.supplier_refresh_product_search_from_editorial();

update public.supplier_products product
set search_document = public.lombardo_normalize_product_search(
  concat_ws(
    ' ',
    product.supplier_sku,
    product.normalized_name,
    product.name_raw,
    product.normalized_presentation,
    product.presentation_raw,
    editorial.brand_name,
    editorial.name_override
  )
)
from public.supplier_product_editorial editorial
where editorial.supplier_product_id = product.id;

update public.supplier_products product
set search_document = public.lombardo_normalize_product_search(
  concat_ws(
    ' ',
    product.supplier_sku,
    product.normalized_name,
    product.name_raw,
    product.normalized_presentation,
    product.presentation_raw
  )
)
where product.search_document = '';

create index supplier_products_search_document_trgm_idx
  on public.supplier_products
  using gin (search_document extensions.gin_trgm_ops);

create or replace function public.supplier_search_product_ids(
  p_supplier_id uuid,
  p_query text,
  p_offset integer default 0,
  p_limit integer default 50,
  p_eligibility text default null,
  p_active_only boolean default false,
  p_price_type text default null,
  p_require_image boolean default false,
  p_prioritize_images boolean default false,
  p_category_prefixes text[] default null,
  p_excluded_category_prefixes text[] default null
)
returns table (
  product_id uuid,
  search_rank double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.lombardo_normalize_product_search(left(p_query, 80)) as query
  ),
  tokens as (
    select token, ordinality
    from input,
      lateral regexp_split_to_table(input.query, '\s+') with ordinality as split(token, ordinality)
    where char_length(token) >= 2
    order by ordinality
    limit 6
  ),
  token_count as (
    select count(*)::integer as value from tokens
  ),
  matches as (
    select
      product.id,
      product.normalized_name,
      product.has_public_media,
      sum(
        case
          when matched.exact_word then 4.0
          when matched.prefix_word then 3.0
          when matched.edit_distance = 1 then 2.0
          when matched.edit_distance = 2 then 1.0
          else matched.word_score
        end
      ) + case
        when product.search_document like '%' || input.query || '%' then 5.0
        else 0.0
      end as rank
    from public.supplier_products product
    cross join input
    cross join token_count
    cross join tokens token
    cross join lateral (
      select
        bool_or(word = token.token) as exact_word,
        bool_or(word like token.token || '%') as prefix_word,
        min(
          extensions.levenshtein_less_equal(
            token.token,
            left(word, 80),
            case
              when char_length(token.token) <= 3 then 0
              when char_length(token.token) = 4 then 1
              else 2
            end
          )
        ) as edit_distance,
        max(extensions.word_similarity(token.token, word)) as word_score
      from regexp_split_to_table(product.search_document, '\s+') as words(word)
      where word <> ''
    ) matched
    where token_count.value > 0
      and product.supplier_id = p_supplier_id
      and (p_eligibility is null or product.eligibility_status = p_eligibility)
      and (not p_active_only or product.active)
      and (not p_require_image or product.has_public_media)
      and (
        p_price_type is null
        or exists (
          select 1
          from public.supplier_prices price
          where price.supplier_product_id = product.id
            and price.price_type = p_price_type
            and price.current_price > 0
        )
      )
      and (
        p_category_prefixes is null
        or upper(substring(product.supplier_sku from '^[A-Za-z]+')) = any(p_category_prefixes)
      )
      and (
        p_excluded_category_prefixes is null
        or not (
          upper(substring(product.supplier_sku from '^[A-Za-z]+')) = any(p_excluded_category_prefixes)
        )
      )
      and (
        matched.exact_word
        or matched.prefix_word
        or (
          char_length(token.token) >= 4
          and matched.edit_distance <= case
            when char_length(token.token) = 4 then 1
            else 2
          end
          and (
            matched.edit_distance <= 1
            or matched.word_score >= 0.25
          )
        )
      )
    group by
      product.id,
      product.normalized_name,
      product.has_public_media,
      input.query,
      token_count.value
    having count(*) = token_count.value
  ),
  ranked as (
    select
      matches.*,
      count(*) over () as total
    from matches
  )
  select ranked.id, ranked.rank, ranked.total
  from ranked
  order by
    case when p_prioritize_images then ranked.has_public_media else false end desc,
    ranked.rank desc,
    ranked.normalized_name,
    ranked.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.supplier_search_product_ids(
  uuid,
  text,
  integer,
  integer,
  text,
  boolean,
  text,
  boolean,
  boolean,
  text[],
  text[]
) from public, anon, authenticated;

grant execute on function public.supplier_search_product_ids(
  uuid,
  text,
  integer,
  integer,
  text,
  boolean,
  text,
  boolean,
  boolean,
  text[],
  text[]
) to service_role;
