-- Allow authenticated users to permanently delete their own account (B09).
-- App/clients should call: select public.delete_own_account();

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

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user profile, related data, and auth.users row.';
