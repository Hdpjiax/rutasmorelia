create extension if not exists postgis;
create extension if not exists pg_trgm;

create table cities (
  id bigint generated always as identity primary key,
  name text not null,
  state text not null,
  country_code text not null check (char_length(country_code) = 2),
  timezone text not null default 'America/Mexico_City',
  boundary geometry(multipolygon, 4326),
  created_at timestamptz not null default now(),
  unique (name, state, country_code)
);

create table routes (
  id bigint generated always as identity primary key,
  city_id bigint not null references cities(id) on delete cascade,
  code text not null unique,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  geometry geometry(linestring, 4326),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stops (
  id bigint generated always as identity primary key,
  city_id bigint not null references cities(id) on delete cascade,
  code text,
  name text not null,
  reference text,
  location geometry(point, 4326) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, code)
);

create table route_segments (
  id bigint generated always as identity primary key,
  route_id bigint not null references routes(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  geometry geometry(linestring, 4326) not null,
  distance_meters integer check (distance_meters >= 0),
  expected_seconds integer check (expected_seconds >= 0),
  unique (route_id, sequence)
);

create table route_stops (
  route_id bigint not null references routes(id) on delete cascade,
  stop_id bigint not null references stops(id) on delete cascade,
  direction smallint not null default 0 check (direction in (0, 1)),
  sequence integer not null check (sequence >= 0),
  expected_offset_seconds integer check (expected_offset_seconds >= 0),
  primary key (route_id, direction, sequence),
  unique (route_id, stop_id, direction)
);

create table neighborhoods (
  id bigint generated always as identity primary key,
  city_id bigint not null references cities(id) on delete cascade,
  name text not null,
  boundary geometry(multipolygon, 4326) not null,
  unique (city_id, name)
);

create table places (
  id bigint generated always as identity primary key,
  city_id bigint not null references cities(id) on delete cascade,
  neighborhood_id bigint references neighborhoods(id) on delete set null,
  name text not null,
  category text not null,
  address text,
  location geometry(point, 4326) not null,
  search_document tsvector generated always as (
    to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(address, ''))
  ) stored,
  created_at timestamptz not null default now()
);

create table app_users (
  id bigint generated always as identity primary key,
  email text not null unique,
  display_name text,
  oauth_provider text,
  oauth_subject text,
  password_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (password_hash is not null or (oauth_provider is not null and oauth_subject is not null)),
  unique (oauth_provider, oauth_subject)
);

create table favorites (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  route_id bigint references routes(id) on delete cascade,
  stop_id bigint references stops(id) on delete cascade,
  place_id bigint references places(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(route_id, stop_id, place_id) = 1)
);

create table search_history (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  origin geometry(point, 4326),
  destination geometry(point, 4326) not null,
  destination_label text,
  searched_at timestamptz not null default now()
);

create table vehicles (
  id bigint generated always as identity primary key,
  route_id bigint references routes(id) on delete set null,
  public_code text not null unique,
  operational_status text not null default 'offline'
    check (operational_status in ('active', 'delayed', 'offline', 'maintenance')),
  updated_at timestamptz not null default now()
);

create table vehicle_positions (
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  recorded_at timestamptz not null,
  location geometry(point, 4326) not null,
  heading smallint check (heading between 0 and 359),
  speed_kmh numeric(5, 2) check (speed_kmh >= 0),
  delay_seconds integer,
  primary key (vehicle_id, recorded_at)
);

create index cities_boundary_gix on cities using gist (boundary);
create index routes_city_active_idx on routes (city_id, is_active);
create index routes_geometry_gix on routes using gist (geometry);
create index routes_name_trgm_idx on routes using gin (name gin_trgm_ops);
create index stops_city_active_idx on stops (city_id, is_active);
create index stops_location_gix on stops using gist (location);
create index stops_name_trgm_idx on stops using gin (name gin_trgm_ops);
create index route_segments_route_id_idx on route_segments (route_id);
create index route_segments_geometry_gix on route_segments using gist (geometry);
create index route_stops_stop_id_idx on route_stops (stop_id);
create index neighborhoods_city_id_idx on neighborhoods (city_id);
create index neighborhoods_boundary_gix on neighborhoods using gist (boundary);
create index places_city_id_idx on places (city_id);
create index places_neighborhood_id_idx on places (neighborhood_id);
create index places_location_gix on places using gist (location);
create index places_search_document_idx on places using gin (search_document);
create index favorites_user_id_idx on favorites (user_id);
create unique index favorites_user_route_unique on favorites (user_id, route_id) where route_id is not null;
create unique index favorites_user_stop_unique on favorites (user_id, stop_id) where stop_id is not null;
create unique index favorites_user_place_unique on favorites (user_id, place_id) where place_id is not null;
create index search_history_user_time_idx on search_history (user_id, searched_at desc);
create index vehicles_route_id_idx on vehicles (route_id);
create index vehicle_positions_recorded_brin on vehicle_positions using brin (recorded_at);
create index vehicle_positions_location_gix on vehicle_positions using gist (location);

insert into cities (name, state, country_code)
values ('Morelia', 'Michoacán', 'MX')
on conflict (name, state, country_code) do nothing;
