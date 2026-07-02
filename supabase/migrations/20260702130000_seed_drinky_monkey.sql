-- Retrieve city ID and seed Drinky Monkey into public.places
do $$
declare
  v_city_id bigint;
begin
  select id into v_city_id from public.cities where name = 'Morelia' limit 1;

  if v_city_id is not null then
    if not exists (select 1 from public.places where city_id = v_city_id and name = 'Drinky Monkey') then
      insert into public.places (city_id, name, category, address, location)
      values (v_city_id, 'Drinky Monkey', 'Bar / Club', 'Blvd. García de León 1187, Chapultepec Sur, Morelia', extensions.st_geogfromtext('SRID=4326;POINT(-101.1658258 19.6889855)'));
    end if;
  end if;
end $$;
