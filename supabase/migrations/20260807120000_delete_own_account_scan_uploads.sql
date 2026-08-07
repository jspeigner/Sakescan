-- Account deletion must also purge public scan-upload photos.
-- Previously only avatars were removed; scan-uploads/<uid>/... stayed world-readable.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Drop public scan photos before anonymizing scan rows (FK SET NULL on user delete).
  delete from storage.objects
  where bucket_id = 'sake-images'
    and name like 'scan-uploads/' || uid::text || '/%';

  update public.scans
  set scanned_image_url = null
  where user_id = uid
    and scanned_image_url is not null;

  -- Remove avatar objects for this user (best-effort).
  delete from storage.objects
  where bucket_id = 'avatars'
    and (name = uid::text or name like uid::text || '/%');

  -- Cascades ratings/follows/etc. Scans keep anonymized history (FK SET NULL).
  delete from public.users where id = uid;

  -- Remove auth identity so the email can be reused.
  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_own_account() is
  'Deletes the calling user profile, scan-upload/avatar storage, related data, and auth.users row.';
