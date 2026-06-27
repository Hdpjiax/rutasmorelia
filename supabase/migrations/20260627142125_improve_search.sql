-- Upgrade search_transit RPC to support prefix, word-boundary, and substring autocompletion
create or replace function public.search_transit(
  p_query text,
  p_city_id bigint default null,
  p_limit integer default 20
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
    select
      'route'::text as entity_type,
      r.id as entity_id,
      coalesce(r.public_name, r.name) as label,
      concat_ws(' · ', r.code, r.transport_type) as subtitle,
      null::double precision as latitude,
      null::double precision as longitude,
      (
        case
          -- Exact match
          when pg_catalog.lower(r.name) = n.q or pg_catalog.lower(r.code) = n.q then 2.0
          -- Starts with (prefix)
          when pg_catalog.lower(r.name) like (n.q || '%') or pg_catalog.lower(r.code) like (n.q || '%') then 1.5
          -- Word prefix (starts with a word inside the name)
          when pg_catalog.lower(r.name) like ('% ' || n.q || '%') or pg_catalog.lower(r.code) like ('% ' || n.q || '%') then 1.2
          -- Contains the text
          when pg_catalog.lower(r.name) like ('%' || n.q || '%') or pg_catalog.lower(r.code) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(extensions.similarity(pg_catalog.lower(r.name), n.q), extensions.similarity(pg_catalog.lower(r.code), n.q))::real
        end
      )::real as score
    from public.routes r cross join normalized n
    where r.is_active and r.validation_status = 'validated'
      and (p_city_id is null or r.city_id = p_city_id)
      and (
        r.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(r.name) operator(extensions.%) n.q
        or pg_catalog.lower(r.code) operator(extensions.%) n.q
        or pg_catalog.lower(r.name) like ('%' || n.q || '%')
        or pg_catalog.lower(r.code) like ('%' || n.q || '%')
      )
    union all
    select
      'stop'::text as entity_type,
      s.id as entity_id,
      s.name as label,
      s.reference as subtitle,
      extensions.st_y(s.location::extensions.geometry) as latitude,
      extensions.st_x(s.location::extensions.geometry) as longitude,
      (
        case
          -- Exact match on name or reference
          when pg_catalog.lower(s.name) = n.q or pg_catalog.lower(s.reference) = n.q then 2.0
          -- Starts with (prefix) on name or reference
          when pg_catalog.lower(s.name) like (n.q || '%') or pg_catalog.lower(s.reference) like (n.q || '%') then 1.5
          -- Word prefix on name or reference
          when pg_catalog.lower(s.name) like ('% ' || n.q || '%') or pg_catalog.lower(s.reference) like ('% ' || n.q || '%') then 1.2
          -- Contains text in name or reference
          when pg_catalog.lower(s.name) like ('%' || n.q || '%') or pg_catalog.lower(s.reference) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(extensions.similarity(pg_catalog.lower(s.name), n.q), extensions.similarity(pg_catalog.lower(s.reference), n.q))::real
        end
      )::real as score
    from public.stops s cross join normalized n
    where s.is_active and s.validation_status = 'validated'
      and (p_city_id is null or s.city_id = p_city_id)
      and (
        s.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(s.name) operator(extensions.%) n.q
        or pg_catalog.lower(s.name) like ('%' || n.q || '%')
        or pg_catalog.lower(s.reference) like ('%' || n.q || '%')
      )
    union all
    select
      'place'::text as entity_type,
      p.id as entity_id,
      p.name as label,
      concat_ws(' · ', p.category, p.address) as subtitle,
      extensions.st_y(p.location::extensions.geometry) as latitude,
      extensions.st_x(p.location::extensions.geometry) as longitude,
      (
        case
          -- Exact match on name, address or category
          when pg_catalog.lower(p.name) = n.q or pg_catalog.lower(p.address) = n.q or pg_catalog.lower(p.category) = n.q then 2.0
          -- Starts with (prefix) on name, address or category
          when pg_catalog.lower(p.name) like (n.q || '%') or pg_catalog.lower(p.address) like (n.q || '%') or pg_catalog.lower(p.category) like (n.q || '%') then 1.5
          -- Word prefix on name, address or category
          when pg_catalog.lower(p.name) like ('% ' || n.q || '%') or pg_catalog.lower(p.address) like ('% ' || n.q || '%') or pg_catalog.lower(p.category) like ('% ' || n.q || '%') then 1.2
          -- Contains text in name, address or category
          when pg_catalog.lower(p.name) like ('%' || n.q || '%') or pg_catalog.lower(p.address) like ('%' || n.q || '%') or pg_catalog.lower(p.category) like ('%' || n.q || '%') then 1.0
          -- Fallback to trigram similarity
          else greatest(
            extensions.similarity(pg_catalog.lower(p.name), n.q),
            extensions.similarity(pg_catalog.lower(p.address), n.q),
            extensions.similarity(pg_catalog.lower(p.category), n.q)
          )::real
        end
      )::real as score
    from public.places p cross join normalized n
    where (p_city_id is null or p.city_id = p_city_id)
      and (
        p.search_document @@ pg_catalog.websearch_to_tsquery('spanish', n.q)
        or pg_catalog.lower(p.name) operator(extensions.%) n.q
        or pg_catalog.lower(p.name) like ('%' || n.q || '%')
        or pg_catalog.lower(p.address) like ('%' || n.q || '%')
        or pg_catalog.lower(p.category) like ('%' || n.q || '%')
      )
  )
  select * from candidates
  order by score desc, label asc
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.search_transit(text, bigint, integer) to anon, authenticated;
