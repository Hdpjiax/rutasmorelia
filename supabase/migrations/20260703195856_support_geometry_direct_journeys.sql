-- Direct journeys must work for every validated route with a published
-- geometry, including buses and routes imported without stop sequences.
create or replace function public.direct_journey_options(
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_max_walk_meters integer default 1200
)
returns table (
  route_id bigint,
  route_name text,
  route_code text,
  route_color text,
  variant_id bigint,
  boarding_stop_id bigint,
  boarding_stop_name text,
  alighting_stop_id bigint,
  alighting_stop_name text,
  origin_walk_meters integer,
  destination_walk_meters integer,
  stops_count integer,
  fare numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select
      r.id as route_id,
      coalesce(r.public_name, r.name) as route_name,
      r.code as route_code,
      r.color as route_color,
      rv.id as variant_id,
      extensions.st_distance(
        rv.geometry::extensions.geography,
        extensions.st_point(p_origin_longitude, p_origin_latitude, 4326)::extensions.geography
      )::integer as origin_walk_meters,
      extensions.st_distance(
        rv.geometry::extensions.geography,
        extensions.st_point(p_destination_longitude, p_destination_latitude, 4326)::extensions.geography
      )::integer as destination_walk_meters,
      (select f.amount
       from public.fares f
       where f.route_id = r.id
         and f.valid_from <= current_date
         and (f.valid_until is null or f.valid_until >= current_date)
       order by f.valid_from desc
       limit 1) as fare
    from public.route_variants rv
    join public.routes r on r.id = rv.route_id
    where rv.is_active
      and r.is_active
      and r.validation_status = 'validated'
      and extensions.st_dwithin(
        rv.geometry::extensions.geography,
        extensions.st_point(p_origin_longitude, p_origin_latitude, 4326)::extensions.geography,
        least(p_max_walk_meters, 3000)
      )
      and extensions.st_dwithin(
        rv.geometry::extensions.geography,
        extensions.st_point(p_destination_longitude, p_destination_latitude, 4326)::extensions.geography,
        least(p_max_walk_meters, 3000)
      )
  ), ranked as (
    select distinct on (c.route_id)
      c.*
    from candidates c
    order by c.route_id, c.origin_walk_meters + c.destination_walk_meters
  )
  select
    r.route_id,
    r.route_name,
    r.route_code,
    r.route_color,
    r.variant_id,
    null::bigint as boarding_stop_id,
    'Punto más cercano a tu origen'::text as boarding_stop_name,
    null::bigint as alighting_stop_id,
    'Punto más cercano a tu destino'::text as alighting_stop_name,
    r.origin_walk_meters,
    r.destination_walk_meters,
    0::integer as stops_count,
    r.fare
  from ranked r
  order by r.origin_walk_meters + r.destination_walk_meters
  limit 10;
$$;

revoke all on function public.direct_journey_options(
  double precision, double precision, double precision, double precision, integer
) from public;
grant execute on function public.direct_journey_options(
  double precision, double precision, double precision, double precision, integer
) to anon, authenticated;
