-- Add custom_name to public.favorites to allow custom names like "Home" or "Work"
alter table public.favorites add column if not exists custom_name text;

-- Drop the old search_transit function signature
drop function if exists public.search_transit(text, bigint, integer);

-- Create updated search_transit function with p_user_id parameter to prioritize and rename favorites
create or replace function public.search_transit(
  p_query text,
  p_city_id bigint default null,
  p_limit integer default 20,
  p_user_id uuid default null
)
returns table (
  entity_type text,
  entity_id bigint,
  label text,
  subtitle text,
  latitude double precision,
  longitude double precision,
  score real
)
language sql
stable
set search_path = ''
as $$
  with normalized as (
    select pg_catalog.lower(pg_catalog.btrim(p_query)) as q
  ), candidates as (
    -- 1. Route search
    select
      'route'::text as entity_type,
      r.id as entity_id,
      coalesce(f.custom_name, r.public_name, r.name) as label,
      concat_ws(' · ', r.code, r.transport_type) as subtitle,
      null::double precision as latitude,
      null::double precision as longitude,
      (
        case
          -- Exact match
          when pg_catalog.lower(r.name) = n.q or pg_catalog.lower(r.code) = n.q or pg_catalog.lower(f.custom_name) = n.q then 2.0
          -- Starts with (prefix)
          when pg_catalog.lower(r.name) like (n.q || '%') or pg_catalog.lower(r.code) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 1.5
          -- Word prefix (starts with a word inside the name)
          when pg_catalog.lower(r.name) like ('% ' || n.q || '%') or pg_catalog.lower(r.code) like ('% ' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('% ' || n.q || '%') then 1.2
          -- Contains the text
          when pg_catalog.lower(r.name) like ('%' || n.q || '%') or pg_catalog.lower(r.code) like ('%' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(
            extensions.similarity(pg_catalog.lower(r.name), n.q),
            extensions.similarity(pg_catalog.lower(r.code), n.q),
            coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
          )::real
        end
      )::real + (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.routes r
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.route_id = r.id)
    where r.is_active and r.validation_status = 'validated'
      and (p_city_id is null or r.city_id = p_city_id)
      and (
        r.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(r.name) operator(extensions.%) n.q
        or pg_catalog.lower(r.code) operator(extensions.%) n.q
        or pg_catalog.lower(r.name) like ('%' || n.q || '%')
        or pg_catalog.lower(r.code) like ('%' || n.q || '%')
        or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%')
      )

    union all

    -- 2. Stop search
    select
      'stop'::text as entity_type,
      s.id as entity_id,
      coalesce(f.custom_name, s.name) as label,
      s.reference as subtitle,
      extensions.st_y(s.location::extensions.geometry) as latitude,
      extensions.st_x(s.location::extensions.geometry) as longitude,
      (
        case
          -- Exact match on name, reference or custom name
          when pg_catalog.lower(s.name) = n.q or pg_catalog.lower(s.reference) = n.q or pg_catalog.lower(f.custom_name) = n.q then 2.0
          -- Starts with (prefix) on name, reference or custom name
          when pg_catalog.lower(s.name) like (n.q || '%') or pg_catalog.lower(s.reference) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 1.5
          -- Word prefix on name, reference or custom name
          when pg_catalog.lower(s.name) like ('% ' || n.q || '%') or pg_catalog.lower(s.reference) like ('% ' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('% ' || n.q || '%') then 1.2
          -- Contains text in name, reference or custom name
          when pg_catalog.lower(s.name) like ('%' || n.q || '%') or pg_catalog.lower(s.reference) like ('%' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(
            extensions.similarity(pg_catalog.lower(s.name), n.q),
            extensions.similarity(pg_catalog.lower(s.reference), n.q),
            coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
          )::real
        end
      )::real + (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.stops s
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.stop_id = s.id)
    where s.is_active and s.validation_status = 'validated'
      and (p_city_id is null or s.city_id = p_city_id)
      and (
        s.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(s.name) operator(extensions.%) n.q
        or pg_catalog.lower(s.name) like ('%' || n.q || '%')
        or pg_catalog.lower(s.reference) like ('%' || n.q || '%')
        or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%')
      )

    union all

    -- 3. Place search
    select
      'place'::text as entity_type,
      p.id as entity_id,
      coalesce(f.custom_name, p.name) as label,
      concat_ws(' · ', p.category, p.address) as subtitle,
      extensions.st_y(p.location::extensions.geometry) as latitude,
      extensions.st_x(p.location::extensions.geometry) as longitude,
      (
        case
          -- Exact match on name, address, category or custom name
          when pg_catalog.lower(p.name) = n.q or pg_catalog.lower(p.address) = n.q or pg_catalog.lower(p.category) = n.q or pg_catalog.lower(f.custom_name) = n.q then 2.0
          -- Starts with (prefix) on name, address, category or custom name
          when pg_catalog.lower(p.name) like (n.q || '%') or pg_catalog.lower(p.address) like (n.q || '%') or pg_catalog.lower(p.category) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 1.5
          -- Word prefix on name, address, category or custom name
          when pg_catalog.lower(p.name) like ('% ' || n.q || '%') or pg_catalog.lower(p.address) like ('% ' || n.q || '%') or pg_catalog.lower(p.category) like ('% ' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('% ' || n.q || '%') then 1.2
          -- Contains text in name, address, category or custom name
          when pg_catalog.lower(p.name) like ('%' || n.q || '%') or pg_catalog.lower(p.address) like ('%' || n.q || '%') or pg_catalog.lower(p.category) like ('%' || n.q || '%') or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(
            extensions.similarity(pg_catalog.lower(p.name), n.q),
            extensions.similarity(pg_catalog.lower(p.address), n.q),
            extensions.similarity(pg_catalog.lower(p.category), n.q),
            coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
          )::real
        end
      )::real + (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.places p
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.place_id = p.id)
    where (p_city_id is null or p.city_id = p_city_id)
      and (
        p.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(p.name) operator(extensions.%) n.q
        or pg_catalog.lower(p.name) like ('%' || n.q || '%')
        or pg_catalog.lower(p.address) like ('%' || n.q || '%')
        or pg_catalog.lower(p.category) like ('%' || n.q || '%')
        or pg_catalog.lower(f.custom_name) like ('%' || n.q || '%')
      )
  )
  select * from candidates
  order by score desc, label asc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Grant execute permissions to API keys
grant execute on function public.search_transit(text, bigint, integer, uuid) to anon, authenticated;
