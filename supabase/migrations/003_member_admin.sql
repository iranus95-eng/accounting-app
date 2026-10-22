-- Owner-only lookups of login accounts, so members can be added by email from the app
create or replace function acct.signed_up_users()
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = acct, auth as $$
  select u.id, u.email::text, u.created_at
  from auth.users u
  where acct.my_role() = 'owner'
  order by u.created_at desc
$$;
revoke execute on function acct.signed_up_users() from public, anon;
grant execute on function acct.signed_up_users() to authenticated;
