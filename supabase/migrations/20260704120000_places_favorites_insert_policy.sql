-- Allow authenticated users to create personal favorite places (web + mobile sync).
grant insert on table public.places to authenticated;

create policy places_insert_user_favorites on public.places
  for insert to authenticated
  with check (category = 'Favorito');