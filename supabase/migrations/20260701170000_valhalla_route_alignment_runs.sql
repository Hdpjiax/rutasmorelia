-- Audited publication gate for geometries produced by the local Valhalla pipeline.
create table if not exists public.route_alignment_runs (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes(id) on delete cascade,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  engine text not null default 'pyvalhalla',
  engine_version text,
  source_pbf_sha256 text check (source_pbf_sha256 is null or source_pbf_sha256 ~ '^[0-9a-f]{64}$'),
  source_metadata jsonb not null default '{}'::jsonb,
  metrics jsonb not null,
  reviewer text not null,
  status text not null check (status in ('validated', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (route_id, artifact_sha256)
);

alter table public.route_alignment_runs enable row level security;
revoke all on public.route_alignment_runs from anon, authenticated;
grant all on public.route_alignment_runs to service_role;

-- Existing data is LineString. Generic geometry permits the new direction-preserving
-- MultiLineString without rewriting coordinates or forcing artificial connectors.
alter table public.route_variants
  alter column geometry type extensions.geometry(Geometry, 4326)
  using geometry::extensions.geometry;

create or replace function public.publish_validated_route_artifact(
  p_route_code text,
  p_artifact_sha256 text,
  p_geometry jsonb,
  p_metrics jsonb,
  p_source_metadata jsonb,
  p_reviewer text
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_route_id bigint;
  v_run_id bigint;
  v_feature jsonb;
  v_direction smallint;
  v_geometry extensions.geometry;
begin
  if coalesce((p_metrics ->> 'quality_pass')::boolean, false) is not true then
    raise exception 'Artifact rejected: automatic quality gate did not pass';
  end if;
  if p_artifact_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid artifact SHA-256';
  end if;
  if jsonb_typeof(p_geometry -> 'features') <> 'array' or jsonb_array_length(p_geometry -> 'features') <> 2 then
    raise exception 'Artifact must contain exactly two direction features';
  end if;

  select id into v_route_id from public.routes where code = p_route_code for update;
  if v_route_id is null then
    raise exception 'Route code % does not exist', p_route_code;
  end if;

  insert into public.route_alignment_runs (
    route_id, artifact_sha256, engine_version, source_pbf_sha256,
    source_metadata, metrics, reviewer, status, published_at
  ) values (
    v_route_id, p_artifact_sha256,
    p_source_metadata ->> 'valhalla_version', p_source_metadata ->> 'source_sha256',
    p_source_metadata, p_metrics, nullif(btrim(p_reviewer), ''), 'published', now()
  )
  on conflict (route_id, artifact_sha256) do update
    set metrics = excluded.metrics,
        source_metadata = excluded.source_metadata,
        reviewer = excluded.reviewer,
        status = 'published',
        published_at = now()
  returning id into v_run_id;

  delete from public.route_variants where route_id = v_route_id;
  for v_feature in select value from jsonb_array_elements(p_geometry -> 'features') loop
    v_direction := coalesce((v_feature -> 'properties' ->> 'directionIndex')::smallint, 1) - 1;
    if v_direction not in (0, 1) then
      raise exception 'Invalid direction index';
    end if;
    v_geometry := extensions.st_setsrid(
      extensions.st_geomfromgeojson((v_feature -> 'geometry')::text), 4326
    );
    if extensions.st_isempty(v_geometry) or not extensions.st_isvalid(v_geometry) then
      raise exception 'Invalid direction geometry';
    end if;
    insert into public.route_variants (
      route_id, name, direction, geometry, is_primary, is_active,
      source_geometry, alignment_metadata, alignment_updated_at
    ) values (
      v_route_id,
      coalesce(v_feature -> 'properties' ->> 'name', format('Dirección %s', v_direction + 1)),
      v_direction, v_geometry, v_direction = 0, true, null,
      p_metrics || jsonb_build_object('artifact_sha256', p_artifact_sha256, 'run_id', v_run_id), now()
    );
  end loop;

  update public.routes
  set validation_status = 'validated', is_active = true, updated_at = now()
  where id = v_route_id;
  return v_run_id;
end;
$$;

revoke all on function public.publish_validated_route_artifact(text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_validated_route_artifact(text, text, jsonb, jsonb, jsonb, text) to service_role;

