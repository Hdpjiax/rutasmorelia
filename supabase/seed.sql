-- Datos exclusivamente locales para desarrollo.
-- Las rutas se construyen únicamente desde fuentes oficiales validadas.
update public.data_sources
set validation_status = 'validated'
where name = 'OpenStreetMap Morelia';

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
