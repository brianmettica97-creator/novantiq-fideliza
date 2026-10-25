-- =============================================================================
-- NOVANTIQ Fideliza — Almacenamiento de imágenes (logos, recompensas, promociones)
-- Ruta obligatoria: <merchant_id>/<archivo>. Solo propietarios/administradores escriben.
-- SVG excluido a propósito (puede contener scripts).
-- =============================================================================

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.try_uuid(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy brand_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets'
    and public.has_permission(public.try_uuid((storage.foldername(name))[1]), 'config'));

create policy brand_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets'
    and public.has_permission(public.try_uuid((storage.foldername(name))[1]), 'config'));

create policy brand_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets'
    and public.has_permission(public.try_uuid((storage.foldername(name))[1]), 'config'));
