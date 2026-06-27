-- Drop the old search_transit function signature to avoid conflict
drop function if exists public.search_transit(text, bigint, integer, uuid);

-- Recreate search_transit as a highly predictive PL/pgSQL function
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
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cleaned_query text;
  v_tsquery_string text;
  v_tsquery tsquery;
  v_norm_query text;
begin
  -- 1. Normalize query to lowercase and trim
  v_norm_query := pg_catalog.lower(pg_catalog.btrim(p_query));
  
  -- 2. Strip punctuation and special characters for clean word matching
  v_cleaned_query := regexp_replace(v_norm_query, '[^\w\s]', '', 'g');

  -- 3. Split by whitespace and construct an OR-based prefix tsquery (e.g. 'plaza:* | americas:*')
  select string_agg(w || ':*', ' | ')
  into v_tsquery_string
  from unnest(regexp_split_to_array(v_cleaned_query, '\s+')) as w
  where w <> '';

  -- Fallback if the query resolved to nothing
  if v_tsquery_string is null or v_tsquery_string = '' then
    v_tsquery := to_tsquery('spanish', 'empty');
  else
    v_tsquery := to_tsquery('spanish', v_tsquery_string);
  end if;

  return query
  with normalized as (
    select v_norm_query as q
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
          -- Exact match gets top tier
          when pg_catalog.lower(r.name) = n.q or pg_catalog.lower(r.code) = n.q or pg_catalog.lower(f.custom_name) = n.q then 5.0
          -- Starts with (prefix) gets second tier
          when pg_catalog.lower(r.name) like (n.q || '%') or pg_catalog.lower(r.code) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 3.0
          else 0.0
        end
      )::real +
      -- Full-text rank reward (ranks higher when more words match)
      (ts_rank_cd(r.search_document, v_tsquery) * 4.0)::real +
      -- Trigram similarity reward (handles typos)
      (greatest(
        extensions.similarity(pg_catalog.lower(r.name), n.q),
        extensions.similarity(pg_catalog.lower(r.code), n.q),
        coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
      ) * 2.0)::real +
      -- Favorite boost
      (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.routes r
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.route_id = r.id)
    where r.is_active and r.validation_status = 'validated'
      and (p_city_id is null or r.city_id = p_city_id)
      and (
        r.search_document @@ v_tsquery
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
          -- Exact match
          when pg_catalog.lower(s.name) = n.q or pg_catalog.lower(s.reference) = n.q or pg_catalog.lower(f.custom_name) = n.q then 5.0
          -- Starts with
          when pg_catalog.lower(s.name) like (n.q || '%') or pg_catalog.lower(s.reference) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 3.0
          else 0.0
        end
      )::real +
      (ts_rank_cd(s.search_document, v_tsquery) * 4.0)::real +
      (greatest(
        extensions.similarity(pg_catalog.lower(s.name), n.q),
        extensions.similarity(pg_catalog.lower(s.reference), n.q),
        coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
      ) * 2.0)::real +
      (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.stops s
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.stop_id = s.id)
    where s.is_active and s.validation_status = 'validated'
      and (p_city_id is null or s.city_id = p_city_id)
      and (
        s.search_document @@ v_tsquery
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
          -- Exact match
          when pg_catalog.lower(p.name) = n.q or pg_catalog.lower(p.address) = n.q or pg_catalog.lower(p.category) = n.q or pg_catalog.lower(f.custom_name) = n.q then 5.0
          -- Starts with
          when pg_catalog.lower(p.name) like (n.q || '%') or pg_catalog.lower(p.address) like (n.q || '%') or pg_catalog.lower(p.category) like (n.q || '%') or pg_catalog.lower(f.custom_name) like (n.q || '%') then 3.0
          else 0.0
        end
      )::real +
      (ts_rank_cd(p.search_document, v_tsquery) * 4.0)::real +
      (greatest(
        extensions.similarity(pg_catalog.lower(p.name), n.q),
        extensions.similarity(pg_catalog.lower(p.address), n.q),
        extensions.similarity(pg_catalog.lower(p.category), n.q),
        coalesce(extensions.similarity(pg_catalog.lower(f.custom_name), n.q), 0.0)
      ) * 2.0)::real +
      (case when f.id is not null then 10.0::real else 0.0::real end) as score
    from public.places p
    cross join normalized n
    left join public.favorites f on (f.user_id = p_user_id and f.place_id = p.id)
    where (p_city_id is null or p.city_id = p_city_id)
      and (
        p.search_document @@ v_tsquery
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
end $$;

-- Grant execution permissions
grant execute on function public.search_transit(text, bigint, integer, uuid) to anon, authenticated;

-- Seed additional central landmarks to public.places
do $$
declare
  v_city_id bigint;
begin
  select id into v_city_id from public.cities where name = 'Morelia' limit 1;

  insert into public.places (city_id, name, category, address, location)
  values
    (v_city_id, 'Centro Histórico de Morelia (Plaza de Armas)', 'Centro de la Ciudad', 'Av. Madero Poniente S/N, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.19275 19.70278)')),
    (v_city_id, 'Las Tarascas (Monumento)', 'Monumento Histórico', 'Av. Acueducto S/N, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.18573 19.70200)')),
    (v_city_id, 'Mercado Independencia', 'Mercado Público', 'Av. Lázaro Cárdenas, Centro, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.19260 19.69670)')),
    (v_city_id, 'Rancho Charro (Lienzo Charro)', 'Centro Cultural / Recreativo', 'Av. Solidaridad, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.21200 19.69700)'))
  on conflict do nothing;
end $$;
