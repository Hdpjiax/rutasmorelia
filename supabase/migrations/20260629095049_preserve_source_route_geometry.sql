alter table public.route_variants
  add column if not exists source_geometry geometry(Geometry, 4326),
  add column if not exists alignment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists alignment_updated_at timestamptz;

comment on column public.route_variants.source_geometry is
  'Immutable geometry imported from the official KML/SHP before road-network alignment.';

update public.route_variants
set source_geometry = geometry
where source_geometry is null;
