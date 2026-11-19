-- 考研英语工作台 · 可选云同步（Supabase）
-- 在 Supabase Dashboard → SQL Editor 中整段执行一次。
-- 同步码相当于密码：客户端只通过 RPC 读写，直接访问表会被 RLS 拒绝。

create table if not exists public.kaoyan_sync (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kaoyan_sync enable row level security;

-- 不开放直接表访问，只允许下面两个 security definer 函数访问。
revoke all on table public.kaoyan_sync from anon, authenticated;

create or replace function public.kaoyan_sync_get(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('payload', payload, 'updated_at', updated_at)
  from public.kaoyan_sync
  where id = p_code;
$$;

create or replace function public.kaoyan_sync_put(p_code text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_code, '')) < 16 then
    raise exception 'sync code too short';
  end if;
  insert into public.kaoyan_sync(id, payload, updated_at)
  values (p_code, p_payload, now())
  on conflict (id) do update
    set payload = excluded.payload,
        updated_at = now();
  return jsonb_build_object('payload', p_payload, 'updated_at', now());
end;
$$;

revoke all on function public.kaoyan_sync_get(text) from public;
revoke all on function public.kaoyan_sync_put(text, jsonb) from public;
grant execute on function public.kaoyan_sync_get(text) to anon;
grant execute on function public.kaoyan_sync_put(text, jsonb) to anon;
