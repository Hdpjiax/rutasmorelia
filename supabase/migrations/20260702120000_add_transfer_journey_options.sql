create or replace function public.transfer_journey_options(
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_max_walk_meters integer default 1500,
  p_max_transfer_meters integer default 300
)
returns table (
  first_route_id bigint, first_route_name text, first_route_code text, first_route_color text,
  second_route_id bigint, second_route_name text, second_route_code text, second_route_color text,
  origin_walk_meters integer, destination_walk_meters integer, transfer_walk_meters integer
)
language sql stable security definer set search_path = '' as $$
  with origin_candidates as (
    select distinct on (r.id) r.id route_id, coalesce(r.public_name,r.name) route_name,
      r.code route_code, r.color route_color, rv.geometry,
      extensions.st_distance(rv.geometry::extensions.geography,
        extensions.st_point(p_origin_longitude,p_origin_latitude,4326)::extensions.geography)::integer origin_walk
    from public.route_variants rv join public.routes r on r.id=rv.route_id
    where rv.is_active and r.is_active and r.validation_status='validated'
      and extensions.st_dwithin(rv.geometry::extensions.geography,
        extensions.st_point(p_origin_longitude,p_origin_latitude,4326)::extensions.geography,least(p_max_walk_meters,3000))
    order by r.id, origin_walk
  ), destination_candidates as (
    select distinct on (r.id) r.id route_id, coalesce(r.public_name,r.name) route_name,
      r.code route_code, r.color route_color, rv.geometry,
      extensions.st_distance(rv.geometry::extensions.geography,
        extensions.st_point(p_destination_longitude,p_destination_latitude,4326)::extensions.geography)::integer destination_walk
    from public.route_variants rv join public.routes r on r.id=rv.route_id
    where rv.is_active and r.is_active and r.validation_status='validated'
      and extensions.st_dwithin(rv.geometry::extensions.geography,
        extensions.st_point(p_destination_longitude,p_destination_latitude,4326)::extensions.geography,least(p_max_walk_meters,3000))
    order by r.id, destination_walk
  )
  select o.route_id,o.route_name,o.route_code,o.route_color,d.route_id,d.route_name,d.route_code,d.route_color,
    o.origin_walk,d.destination_walk,
    extensions.st_distance(o.geometry::extensions.geography,d.geometry::extensions.geography)::integer
  from origin_candidates o cross join destination_candidates d
  where o.route_id<>d.route_id
    and extensions.st_dwithin(o.geometry::extensions.geography,d.geometry::extensions.geography,least(p_max_transfer_meters,800))
  order by o.origin_walk+d.destination_walk+extensions.st_distance(o.geometry::extensions.geography,d.geometry::extensions.geography)
  limit 12;
$$;

revoke all on function public.transfer_journey_options(double precision,double precision,double precision,double precision,integer,integer) from public;
grant execute on function public.transfer_journey_options(double precision,double precision,double precision,double precision,integer,integer) to anon, authenticated;
