-- =============================================================================
-- Seven Stay · Fotos de los platos del menú
--
-- Bucket PÚBLICO "imagenes-menu" (≤ 2 MB, solo imágenes): las fotos del menú
-- se muestran a cualquier huésped, así que se leen por URL pública.
-- Solo el personal del hotel sube, cambia o borra, y únicamente dentro de la
-- carpeta de su hotel: {hotel_id}/{archivo}.jpg
--
-- Ejecutar después de 20261120000000_silencio_y_personal.sql.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes-menu', 'imagenes-menu', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists menu_imagenes_subir on storage.objects;
drop policy if exists menu_imagenes_cambiar on storage.objects;
drop policy if exists menu_imagenes_borrar on storage.objects;

create policy menu_imagenes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes-menu' and (storage.foldername(name))[1] = public.mi_hotel_id()::text);

create policy menu_imagenes_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'imagenes-menu' and (storage.foldername(name))[1] = public.mi_hotel_id()::text)
  with check (bucket_id = 'imagenes-menu' and (storage.foldername(name))[1] = public.mi_hotel_id()::text);

-- Para borrar, Storage necesita poder "ver" el archivo con la sesión del personal.
create policy menu_imagenes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'imagenes-menu' and (storage.foldername(name))[1] = public.mi_hotel_id()::text);

drop policy if exists menu_imagenes_ver_personal on storage.objects;
create policy menu_imagenes_ver_personal on storage.objects for select to authenticated
  using (bucket_id = 'imagenes-menu' and (storage.foldername(name))[1] = public.mi_hotel_id()::text);
