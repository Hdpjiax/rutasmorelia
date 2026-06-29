alter table public.saved_places
  add column if not exists address text;

create unique index if not exists favorites_user_route_unique
  on public.favorites (user_id, route_id)
  where route_id is not null;

create index if not exists saved_places_user_created_idx
  on public.saved_places (user_id, created_at desc);

grant select, insert, update, delete on table public.favorites to authenticated;
grant select, insert, update, delete on table public.saved_places to authenticated;
grant usage, select on sequence public.favorites_id_seq to authenticated;
grant usage, select on sequence public.saved_places_id_seq to authenticated;
