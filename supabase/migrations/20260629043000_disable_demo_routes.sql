-- The DEV routes were straight-line placeholders and must never appear in production.
update public.routes
set is_active = false,
    validation_status = 'draft',
    updated_at = now()
where code in ('DEV-1', 'DEV-2', 'DEV-3');
