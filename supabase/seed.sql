-- Datos exclusivamente locales para desarrollo. No representan el padrón oficial.
update public.data_sources
set validation_status = 'validated'
where name = 'OpenStreetMap Morelia';

with morelia as (
  select id from public.cities where name = 'Morelia' and state = 'Michoacán' limit 1
), osm as (
  select id from public.data_sources where name = 'OpenStreetMap Morelia' limit 1
)
insert into public.routes (city_id, source_id, code, name, public_name, color, transport_type, validation_status)
select morelia.id, osm.id, seed.code, seed.name, seed.name, seed.color, seed.transport_type, 'validated'
from morelia cross join osm cross join (
  values
    ('DEV-1', 'Centro · Tarímbaro', '#6F7E24', 'combi'),
    ('DEV-2', 'CU · Las Américas', '#C9542D', 'bus'),
    ('DEV-3', 'Villas · Centro', '#347B8F', 'combi')
) as seed(code, name, color, transport_type)
on conflict (city_id, code) do nothing;

with morelia as (
  select id from public.cities where name = 'Morelia' and state = 'Michoacán' limit 1
), osm as (
  select id from public.data_sources where name = 'OpenStreetMap Morelia' limit 1
)
insert into public.stops (city_id, source_id, code, name, reference, location, validation_status)
select morelia.id, osm.id, seed.code, seed.name, seed.reference,
  extensions.st_point(seed.longitude, seed.latitude, 4326)::extensions.geography,
  'validated'
from morelia cross join osm cross join (
  values
    ('DEV-CAT', 'Catedral', 'Centro Histórico', -101.1925, 19.7027),
    ('DEV-MER', 'Mercado Independencia', 'Av. Lázaro Cárdenas', -101.2014, 19.7002),
    ('DEV-TAR', 'Las Tarascas', 'Acueducto', -101.1854, 19.7054),
    ('DEV-CU', 'Ciudad Universitaria', 'Universidad Michoacana', -101.2250, 19.6920)
) as seed(code, name, reference, longitude, latitude)
on conflict (city_id, code) do nothing;

insert into public.route_variants (route_id, name, direction, geometry, is_primary)
select r.id, 'Principal', 0,
  case r.code
    when 'DEV-1' then extensions.st_geomfromtext('LINESTRING(-101.215 19.704,-101.207 19.701,-101.198 19.700,-101.191 19.703,-101.183 19.708,-101.176 19.713)', 4326)
    when 'DEV-2' then extensions.st_geomfromtext('LINESTRING(-101.205 19.718,-101.201 19.711,-101.198 19.703,-101.194 19.695,-101.189 19.688)', 4326)
    else extensions.st_geomfromtext('LINESTRING(-101.225 19.692,-101.214 19.695,-101.202 19.699,-101.191 19.703,-101.181 19.698)', 4326)
  end,
  true
from public.routes r
where r.code in ('DEV-1', 'DEV-2', 'DEV-3')
on conflict (route_id, name, direction) do nothing;

insert into public.variant_stops (variant_id, stop_id, sequence)
select v.id, s.id, ordering.sequence
from (
  values
    ('DEV-1', 'DEV-MER', 1), ('DEV-1', 'DEV-CAT', 2), ('DEV-1', 'DEV-TAR', 3),
    ('DEV-2', 'DEV-CU', 1), ('DEV-2', 'DEV-MER', 2), ('DEV-2', 'DEV-TAR', 3),
    ('DEV-3', 'DEV-CU', 1), ('DEV-3', 'DEV-MER', 2), ('DEV-3', 'DEV-CAT', 3)
) as ordering(route_code, stop_code, sequence)
join public.routes r on r.code = ordering.route_code
join public.route_variants v on v.route_id = r.id and v.name = 'Principal' and v.direction = 0
join public.stops s on s.code = ordering.stop_code
on conflict (variant_id, sequence) do nothing;

insert into public.fares (route_id, passenger_type, amount, source_id)
select r.id, 'general', 11.00, r.source_id
from public.routes r
where r.code in ('DEV-1', 'DEV-2', 'DEV-3')
  and not exists (select 1 from public.fares f where f.route_id = r.id and f.passenger_type = 'general');
