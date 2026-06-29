create or replace function public.get_route_geometry(
  p_route_id bigint,
  p_tolerance double precision default 0.00002
)
returns table (
  route_id bigint,
  variant_name text,
  color text,
  geometry jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    rv.route_id,
    rv.name as variant_name,
    r.color,
    extensions.st_asgeojson(
      extensions.st_simplifypreservetopology(
        rv.geometry,
        greatest(p_tolerance, 0::double precision)
      )
    )::jsonb as geometry
  from public.route_variants rv
  join public.routes r on r.id = rv.route_id
  where rv.route_id = p_route_id
    and rv.is_active
    and r.is_active
    and r.validation_status = 'validated'
  order by rv.is_primary desc, rv.id
  limit 1;
$$;

revoke all on function public.get_route_geometry(bigint, double precision) from public;
grant execute on function public.get_route_geometry(bigint, double precision) to anon, authenticated;
