-- Ensure Morelia city exists
insert into public.cities (name, state, country)
values ('Morelia', 'Michoacán', 'México')
on conflict (name, state, country) do nothing;

-- Retrieve city ID and seed popular landmarks into public.places
do $$
declare
  v_city_id bigint;
begin
  select id into v_city_id from public.cities where name = 'Morelia' limit 1;

  insert into public.places (city_id, name, category, address, location)
  values
    (v_city_id, 'Plaza Las Américas (Espacio Las Américas)', 'Centro Comercial', 'Av. Enrique Ramírez Miguel 1000, Las Américas, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.16853 19.69174)')),
    (v_city_id, 'Catedral de Morelia', 'Templo Histórico', 'Av. Madero Poniente, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.19222 19.70278)')),
    (v_city_id, 'Paseo Altozano', 'Centro Comercial', 'Av. Montaña Monarca 1000, Altozano, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.18520 19.66440)')),
    (v_city_id, 'Plaza Fiesta Camelinas', 'Centro Comercial', 'Calz. Ventura Puente 1799, Félix Ireta, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.17620 19.68410)')),
    (v_city_id, 'Zoológico Benito Juárez', 'Parque / Recreativo', 'Calz. Juárez S/N, Félix Ireta, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.19520 19.68260)')),
    (v_city_id, 'Acueducto de Morelia', 'Monumento Histórico', 'Av. Acueducto, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.18220 19.70210)')),
    (v_city_id, 'Plaza Morelos (El Caballito)', 'Plaza Pública', 'Av. Madero Oriente, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.18090 19.70250)')),
    (v_city_id, 'Terminal de Autobuses de Morelia (TAM)', 'Terminal de Transporte', 'Perif. Paseo de la República 5555, Sector República, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.23310 19.71540)')),
    (v_city_id, 'Estadio Morelos', 'Estadio de Fútbol', 'Perif. Paseo de la República S/N, Sector República, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.23270 19.72250)')),
    (v_city_id, 'Ciudad Universitaria (UMSNH)', 'Universidad', 'Av. Francisco J. Múgica S/N, Felicitas del Río, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.20230 19.69080)')),
    (v_city_id, 'Bosque Cuauhtémoc', 'Parque Público', 'Av. Acueducto S/N, Centro Histórico, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.18260 19.70060)')),
    (v_city_id, 'Plaza Escala La Huerta', 'Centro Comercial', 'Calz. La Huerta 3000, La Huerta, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.22230 19.67810)'))
  on conflict do nothing;
end $$;
