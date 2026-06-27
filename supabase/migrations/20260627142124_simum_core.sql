create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_path text,
  role text not null default 'citizen'
    check (role in ('citizen', 'moderator', 'editor', 'administrator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cities (
  id bigint generated always as identity primary key,
  name text not null,
  state text not null,
  country_code text not null check (char_length(country_code) = 2),
  timezone text not null default 'America/Mexico_City',
  boundary extensions.geometry(multipolygon, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, state, country_code)
);

create table public.data_sources (
  id bigint generated always as identity primary key,
  name text not null,
  source_url text,
  source_type text not null check (source_type in ('official_study', 'official_map', 'open_data', 'openstreetmap', 'community_reference', 'field_validation')),
  publisher text,
  published_at date,
  license text,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'in_review', 'validated', 'rejected')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.import_batches (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.data_sources(id) on delete restrict,
  storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  records_total integer not null default 0 check (records_total >= 0),
  records_accepted integer not null default 0 check (records_accepted >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  validation_log jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.routes (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  source_id bigint references public.data_sources(id) on delete set null,
  code text not null,
  name text not null,
  public_name text,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  transport_type text not null check (transport_type in ('combi', 'bus', 'other')),
  description text,
  is_active boolean not null default true,
  validation_status text not null default 'draft'
    check (validation_status in ('draft', 'in_review', 'validated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  search_document tsvector generated always as (
    to_tsvector('spanish', coalesce(code, '') || ' ' || coalesce(name, '') || ' ' || coalesce(public_name, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, code)
);

create table public.route_variants (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes(id) on delete cascade,
  name text not null,
  direction smallint not null default 0 check (direction in (0, 1)),
  branch_code text,
  geometry extensions.geometry(linestring, 4326) not null,
  distance_meters integer check (distance_meters >= 0),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (route_id, name, direction)
);

create table public.route_segments (
  id bigint generated always as identity primary key,
  variant_id bigint not null references public.route_variants(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  geometry extensions.geometry(linestring, 4326) not null,
  distance_meters integer check (distance_meters >= 0),
  expected_seconds integer check (expected_seconds >= 0),
  unique (variant_id, sequence)
);

create table public.stops (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  source_id bigint references public.data_sources(id) on delete set null,
  code text,
  name text not null,
  reference text,
  location extensions.geography(point, 4326) not null,
  accessibility jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  validation_status text not null default 'draft'
    check (validation_status in ('draft', 'in_review', 'validated', 'archived')),
  search_document tsvector generated always as (
    to_tsvector('spanish', coalesce(code, '') || ' ' || coalesce(name, '') || ' ' || coalesce(reference, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, code)
);

create table public.variant_stops (
  variant_id bigint not null references public.route_variants(id) on delete cascade,
  stop_id bigint not null references public.stops(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  expected_offset_seconds integer check (expected_offset_seconds >= 0),
  primary key (variant_id, sequence),
  unique (variant_id, stop_id)
);

create table public.neighborhoods (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  source_id bigint references public.data_sources(id) on delete set null,
  name text not null,
  boundary extensions.geometry(multipolygon, 4326) not null,
  search_document tsvector generated always as (to_tsvector('spanish', name)) stored,
  unique (city_id, name)
);

create table public.places (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  neighborhood_id bigint references public.neighborhoods(id) on delete set null,
  source_id bigint references public.data_sources(id) on delete set null,
  osm_id bigint,
  name text not null,
  category text not null,
  address text,
  location extensions.geography(point, 4326) not null,
  metadata jsonb not null default '{}'::jsonb,
  search_document tsvector generated always as (
    to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(address, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (city_id, osm_id)
);

create table public.transfers (
  id bigint generated always as identity primary key,
  from_stop_id bigint not null references public.stops(id) on delete cascade,
  to_stop_id bigint not null references public.stops(id) on delete cascade,
  walking_distance_meters integer not null check (walking_distance_meters >= 0),
  minimum_transfer_seconds integer not null default 180 check (minimum_transfer_seconds >= 0),
  is_accessible boolean not null default false,
  unique (from_stop_id, to_stop_id),
  check (from_stop_id <> to_stop_id)
);

create table public.fares (
  id bigint generated always as identity primary key,
  route_id bigint references public.routes(id) on delete cascade,
  passenger_type text not null default 'general',
  amount numeric(8, 2) not null check (amount >= 0),
  currency text not null default 'MXN' check (char_length(currency) = 3),
  valid_from date not null default current_date,
  valid_until date,
  source_id bigint references public.data_sources(id) on delete set null,
  check (valid_until is null or valid_until >= valid_from)
);

create table public.service_hours (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  first_departure time,
  last_departure time,
  headway_minutes integer check (headway_minutes > 0),
  notes text,
  unique (route_id, weekday)
);

create table public.saved_places (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  kind text not null default 'other' check (kind in ('home', 'work', 'school', 'other')),
  place_id bigint references public.places(id) on delete set null,
  location extensions.geography(point, 4326),
  created_at timestamptz not null default now(),
  check (place_id is not null or location is not null)
);

create table public.favorites (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id bigint references public.routes(id) on delete cascade,
  stop_id bigint references public.stops(id) on delete cascade,
  place_id bigint references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(route_id, stop_id, place_id) = 1)
);

create table public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  origin extensions.geography(point, 4326),
  origin_label text,
  destination extensions.geography(point, 4326) not null,
  destination_label text,
  selected_route_id bigint references public.routes(id) on delete set null,
  searched_at timestamptz not null default now()
);

create table public.reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('incorrect_route', 'incorrect_fare', 'incorrect_path', 'incorrect_stop', 'outdated_information', 'other')),
  route_id bigint references public.routes(id) on delete set null,
  stop_id bigint references public.stops(id) on delete set null,
  place_id bigint references public.places(id) on delete set null,
  description text not null check (char_length(description) between 10 and 2000),
  attachment_path text,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  resolution_notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id bigint generated always as identity primary key,
  route_id bigint references public.routes(id) on delete set null,
  public_code text not null unique,
  operational_status text not null default 'offline'
    check (operational_status in ('active', 'delayed', 'offline', 'maintenance')),
  updated_at timestamptz not null default now()
);

create table public.vehicle_positions (
  vehicle_id bigint not null references public.vehicles(id) on delete cascade,
  recorded_at timestamptz not null,
  location extensions.geography(point, 4326) not null,
  heading smallint check (heading between 0 and 359),
  speed_kmh numeric(5, 2) check (speed_kmh >= 0),
  delay_seconds integer,
  primary key (vehicle_id, recorded_at)
);

create index routes_city_active_idx on public.routes (city_id, is_active);
create index routes_source_id_idx on public.routes (source_id);
create index routes_search_idx on public.routes using gin (search_document);
create index routes_name_trgm_idx on public.routes using gin (name extensions.gin_trgm_ops);
create index route_variants_route_id_idx on public.route_variants (route_id);
create index route_variants_geometry_idx on public.route_variants using gist (geometry);
create index route_segments_variant_id_idx on public.route_segments (variant_id);
create index route_segments_geometry_idx on public.route_segments using gist (geometry);
create index stops_city_active_idx on public.stops (city_id, is_active);
create index stops_source_id_idx on public.stops (source_id);
create index stops_location_idx on public.stops using gist (location);
create index stops_search_idx on public.stops using gin (search_document);
create index stops_name_trgm_idx on public.stops using gin (name extensions.gin_trgm_ops);
create index variant_stops_stop_id_idx on public.variant_stops (stop_id);
create index neighborhoods_city_id_idx on public.neighborhoods (city_id);
create index neighborhoods_source_id_idx on public.neighborhoods (source_id);
create index neighborhoods_boundary_idx on public.neighborhoods using gist (boundary);
create index places_city_id_idx on public.places (city_id);
create index places_neighborhood_id_idx on public.places (neighborhood_id);
create index places_source_id_idx on public.places (source_id);
create index places_location_idx on public.places using gist (location);
create index places_search_idx on public.places using gin (search_document);
create index places_name_trgm_idx on public.places using gin (name extensions.gin_trgm_ops);
create index transfers_to_stop_id_idx on public.transfers (to_stop_id);
create index fares_route_id_idx on public.fares (route_id);
create index service_hours_route_id_idx on public.service_hours (route_id);
create index saved_places_user_id_idx on public.saved_places (user_id);
create index saved_places_place_id_idx on public.saved_places (place_id);
create index favorites_user_id_idx on public.favorites (user_id);
create unique index favorites_user_route_unique on public.favorites (user_id, route_id) where route_id is not null;
create unique index favorites_user_stop_unique on public.favorites (user_id, stop_id) where stop_id is not null;
create unique index favorites_user_place_unique on public.favorites (user_id, place_id) where place_id is not null;
create index search_history_user_time_idx on public.search_history (user_id, searched_at desc);
create index search_history_route_id_idx on public.search_history (selected_route_id);
create index reports_user_id_idx on public.reports (user_id);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_route_id_idx on public.reports (route_id);
create index reports_stop_id_idx on public.reports (stop_id);
create index reports_place_id_idx on public.reports (place_id);
create index reports_assigned_to_idx on public.reports (assigned_to);
create index vehicles_route_id_idx on public.vehicles (route_id);
create index vehicle_positions_recorded_idx on public.vehicle_positions using brin (recorded_at);
create index vehicle_positions_location_idx on public.vehicle_positions using gist (location);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger routes_set_updated_at before update on public.routes
for each row execute function private.set_updated_at();
create trigger stops_set_updated_at before update on public.stops
for each row execute function private.set_updated_at();
create trigger reports_set_updated_at before update on public.reports
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.nearby_stops(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 1000,
  p_limit integer default 50
)
returns table (
  id bigint,
  name text,
  reference text,
  latitude double precision,
  longitude double precision,
  distance_meters double precision
)
language sql
stable
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.reference,
    extensions.st_y(s.location::extensions.geometry),
    extensions.st_x(s.location::extensions.geometry),
    extensions.st_distance(
      s.location,
      extensions.st_point(p_longitude, p_latitude, 4326)::extensions.geography
    )
  from public.stops s
  where s.is_active
    and extensions.st_dwithin(
      s.location,
      extensions.st_point(p_longitude, p_latitude, 4326)::extensions.geography,
      least(greatest(p_radius_meters, 50), 5000)
    )
  order by s.location operator(extensions.<->)
    extensions.st_point(p_longitude, p_latitude, 4326)::extensions.geography
  limit least(greatest(p_limit, 1), 100);
$$;

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
      greatest(extensions.similarity(pg_catalog.lower(r.name), n.q), extensions.similarity(pg_catalog.lower(r.code), n.q))::real as score
    from public.routes r cross join normalized n
    where r.is_active and r.validation_status = 'validated'
      and (p_city_id is null or r.city_id = p_city_id)
      and (r.search_document @@ websearch_to_tsquery('spanish', n.q) or pg_catalog.lower(r.name) operator(extensions.%) n.q or pg_catalog.lower(r.code) operator(extensions.%) n.q)
    union all
    select
      'stop', s.id, s.name, s.reference,
      extensions.st_y(s.location::extensions.geometry),
      extensions.st_x(s.location::extensions.geometry),
      extensions.similarity(pg_catalog.lower(s.name), n.q)::real
    from public.stops s cross join normalized n
    where s.is_active and s.validation_status = 'validated'
      and (p_city_id is null or s.city_id = p_city_id)
      and (s.search_document @@ websearch_to_tsquery('spanish', n.q) or pg_catalog.lower(s.name) operator(extensions.%) n.q)
    union all
    select
      'place', p.id, p.name, concat_ws(' · ', p.category, p.address),
      extensions.st_y(p.location::extensions.geometry),
      extensions.st_x(p.location::extensions.geometry),
      extensions.similarity(pg_catalog.lower(p.name), n.q)::real
    from public.places p cross join normalized n
    where (p_city_id is null or p.city_id = p_city_id)
      and (p.search_document @@ websearch_to_tsquery('spanish', n.q) or pg_catalog.lower(p.name) operator(extensions.%) n.q)
  )
  select * from candidates
  order by score desc, label asc
  limit least(greatest(p_limit, 1), 50);
$$;

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
set search_path = ''
as $$
  with origin_stops as (
    select s.id, s.name,
      extensions.st_distance(s.location, extensions.st_point(p_origin_longitude, p_origin_latitude, 4326)::extensions.geography)::integer as walk_meters
    from public.stops s
    where s.is_active and extensions.st_dwithin(s.location, extensions.st_point(p_origin_longitude, p_origin_latitude, 4326)::extensions.geography, least(p_max_walk_meters, 3000))
  ), destination_stops as (
    select s.id, s.name,
      extensions.st_distance(s.location, extensions.st_point(p_destination_longitude, p_destination_latitude, 4326)::extensions.geography)::integer as walk_meters
    from public.stops s
    where s.is_active and extensions.st_dwithin(s.location, extensions.st_point(p_destination_longitude, p_destination_latitude, 4326)::extensions.geography, least(p_max_walk_meters, 3000))
  )
  select distinct on (r.id)
    r.id, coalesce(r.public_name, r.name), r.code, r.color, v.id,
    os.id, os.name, ds.id, ds.name,
    os.walk_meters, ds.walk_meters,
    (vs_destination.sequence - vs_origin.sequence),
    (select f.amount from public.fares f where f.route_id = r.id and f.valid_from <= current_date and (f.valid_until is null or f.valid_until >= current_date) order by f.valid_from desc limit 1)
  from origin_stops os
  join public.variant_stops vs_origin on vs_origin.stop_id = os.id
  join public.route_variants v on v.id = vs_origin.variant_id and v.is_active
  join public.variant_stops vs_destination on vs_destination.variant_id = v.id and vs_destination.sequence > vs_origin.sequence
  join destination_stops ds on ds.id = vs_destination.stop_id
  join public.routes r on r.id = v.route_id and r.is_active and r.validation_status = 'validated'
  order by r.id, (os.walk_meters + ds.walk_meters), (vs_destination.sequence - vs_origin.sequence)
  limit 10;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.cities, public.data_sources, public.routes, public.route_variants,
  public.route_segments, public.stops, public.variant_stops, public.neighborhoods,
  public.places, public.transfers, public.fares, public.service_hours,
  public.vehicles, public.vehicle_positions to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_path, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.saved_places,
  public.favorites, public.search_history, public.reports to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.nearby_stops(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.search_transit(text, bigint, integer) to anon, authenticated;
grant execute on function public.direct_journey_options(double precision, double precision, double precision, double precision, integer) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.data_sources enable row level security;
alter table public.import_batches enable row level security;
alter table public.routes enable row level security;
alter table public.route_variants enable row level security;
alter table public.route_segments enable row level security;
alter table public.stops enable row level security;
alter table public.variant_stops enable row level security;
alter table public.neighborhoods enable row level security;
alter table public.places enable row level security;
alter table public.transfers enable row level security;
alter table public.fares enable row level security;
alter table public.service_hours enable row level security;
alter table public.saved_places enable row level security;
alter table public.favorites enable row level security;
alter table public.search_history enable row level security;
alter table public.reports enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_positions enable row level security;

create policy public_read_cities on public.cities for select to anon, authenticated using (is_active);
create policy public_read_sources on public.data_sources for select to anon, authenticated using (validation_status = 'validated');
create policy public_read_routes on public.routes for select to anon, authenticated using (is_active and validation_status = 'validated');
create policy public_read_variants on public.route_variants for select to anon, authenticated
using (is_active and exists (select 1 from public.routes r where r.id = route_id and r.is_active and r.validation_status = 'validated'));
create policy public_read_segments on public.route_segments for select to anon, authenticated
using (exists (select 1 from public.route_variants v join public.routes r on r.id = v.route_id where v.id = variant_id and v.is_active and r.is_active and r.validation_status = 'validated'));
create policy public_read_stops on public.stops for select to anon, authenticated using (is_active and validation_status = 'validated');
create policy public_read_variant_stops on public.variant_stops for select to anon, authenticated
using (exists (select 1 from public.route_variants v join public.routes r on r.id = v.route_id where v.id = variant_id and v.is_active and r.is_active and r.validation_status = 'validated'));
create policy public_read_neighborhoods on public.neighborhoods for select to anon, authenticated using (true);
create policy public_read_places on public.places for select to anon, authenticated using (true);
create policy public_read_transfers on public.transfers for select to anon, authenticated using (true);
create policy public_read_fares on public.fares for select to anon, authenticated using (valid_from <= current_date and (valid_until is null or valid_until >= current_date));
create policy public_read_service_hours on public.service_hours for select to anon, authenticated using (true);
create policy public_read_vehicles on public.vehicles for select to anon, authenticated using (operational_status <> 'maintenance');
create policy public_read_vehicle_positions on public.vehicle_positions for select to anon, authenticated using (recorded_at > now() - interval '30 minutes');

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy saved_places_owner_all on public.saved_places for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy favorites_owner_all on public.favorites for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy search_history_owner_all on public.search_history for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy reports_owner_select on public.reports for select to authenticated using ((select auth.uid()) = user_id);
create policy reports_owner_insert on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-attachments', 'report-attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy report_attachments_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'report-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy report_attachments_owner_select on storage.objects for select to authenticated
using (bucket_id = 'report-attachments' and owner_id = (select auth.uid())::text);
create policy report_attachments_owner_update on storage.objects for update to authenticated
using (bucket_id = 'report-attachments' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'report-attachments' and owner_id = (select auth.uid())::text);
create policy report_attachments_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'report-attachments' and owner_id = (select auth.uid())::text);

insert into public.cities (name, state, country_code)
values ('Morelia', 'Michoacán', 'MX')
on conflict (name, state, country_code) do nothing;

insert into public.data_sources (name, source_url, source_type, publisher, validation_status)
values
  ('Estudio de movilidad de Morelia', 'https://morelos.morelia.gob.mx/ArchivosTranspMorelia/Art3520/MetObj/FraccXL/estudio_movilidad.pdf', 'official_study', 'Municipio de Morelia', 'pending'),
  ('Mapa de transporte de Morelia 2025', 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Mapa_de_transporte_de_Morelia_2025.pdf', 'official_map', 'Documentación pública', 'pending'),
  ('OpenStreetMap Morelia', 'https://www.openstreetmap.org/relation/294750', 'openstreetmap', 'OpenStreetMap contributors', 'pending'),
  ('El Rutero Morelia', 'https://elrutero.com.mx/Morelia', 'community_reference', 'El Rutero', 'pending'),
  ('Ruta Directa Morelia', 'https://rutadirecta.com/city/morelia.michoaca', 'community_reference', 'Ruta Directa', 'pending');
