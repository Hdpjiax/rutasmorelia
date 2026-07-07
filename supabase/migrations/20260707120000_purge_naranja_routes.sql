-- Purge Naranja route geometry so Valhalla-aligned rebuilds can be published fresh.
-- Codes: 38-46 (rutasdecombi + Naranja 3 Centro KML).

delete from public.route_alignment_runs
where route_id in (
  select id from public.routes where code in ('38','39','40','41','42','43','44','45','46')
);

delete from public.route_variants
where route_id in (
  select id from public.routes where code in ('38','39','40','41','42','43','44','45','46')
);

delete from public.routes
where code in ('38','39','40','41','42','43','44','45','46');