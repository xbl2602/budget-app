-- 云端同步（可选功能）服务端：三张表 + 五个数据库函数。
-- 设计见 docs/superpowers/specs/2026-09-28-cloud-sync-design-v2.md §5。
--
-- 原则：
--   * 表放在不对外暴露的私有 schema `sync`，全部开启 RLS 且不建任何 policy（对 anon 全拒）。
--   * 前端只能通过 public 里的 5 个 security definer 函数读写，函数只授权给 anon。
--   * 服务器只存 SHA-256(authKey)，看不到 encKey，也读不懂 blob（端到端加密）。
--   * 函数参数统一加 p_ 前缀，避免与列名 blob/version 冲突；前端 RPC 的 JSON 键也用 p_ 名。

create schema if not exists sync;
revoke all on schema sync from public, anon, authenticated;

-- ── 表 ──────────────────────────────────────────────────────────────
create table sync.ledgers (
  key_hash   bytea primary key check (octet_length(key_hash) = 32),
  version    integer     not null check (version >= 1),
  blob       text        not null,
  updated_at timestamptz not null default now()
);

-- 被新版本顶替下来的旧版本；created_at = 该版本当初被写入的时间
create table sync.ledger_versions (
  key_hash   bytea       not null references sync.ledgers (key_hash) on delete cascade,
  version    integer     not null,
  blob       text        not null,
  created_at timestamptz not null,
  primary key (key_hash, version)
);

-- 邀请码：只存哈希；由你在后台用 sync.add_invite() 手动添加
create table sync.invites (
  code_hash bytea       primary key check (octet_length(code_hash) = 32),
  used_at   timestamptz,
  used_by   bytea,
  note      text,
  created_at timestamptz not null default now()
);

alter table sync.ledgers         enable row level security;
alter table sync.ledger_versions enable row level security;
alter table sync.invites         enable row level security;
revoke all on all tables in schema sync from public, anon, authenticated;

-- ── 内部工具：邀请码归一化（大写、去掉非字母数字）后取哈希 ─────────────
create function sync.invite_hash(p_code text) returns bytea
language sql immutable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')),
    'UTF8'));
$$;

-- 你在 SQL 编辑器里给朋友加邀请码：select sync.add_invite('明文码', '给谁的');
create function sync.add_invite(p_code text, p_note text default null) returns void
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.length(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) < 16 then
    raise exception 'invite code too short (need >= 16 letters/digits)';
  end if;
  insert into sync.invites (code_hash, note) values (sync.invite_hash(p_code), p_note);
end;
$$;
revoke all on function sync.invite_hash(text)       from public, anon, authenticated;
revoke all on function sync.add_invite(text, text)  from public, anon, authenticated;

-- ── RPC 1：拉取 ─────────────────────────────────────────────────────
create function public.ledger_pull(p_auth_key text, p_known_version integer default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h bytea;
  v integer;
  b text;
  u timestamptz;
begin
  if p_auth_key is null or p_auth_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'bad_request');
  end if;
  h := pg_catalog.sha256(pg_catalog.decode(p_auth_key, 'hex'));
  select l.version, l.blob, l.updated_at into v, b, u from sync.ledgers l where l.key_hash = h;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'none');
  end if;
  if p_known_version is not null and p_known_version = v then
    return pg_catalog.jsonb_build_object('status', 'unchanged', 'version', v);
  end if;
  return pg_catalog.jsonb_build_object('status', 'ok', 'version', v, 'blob', b, 'updated_at', u);
end;
$$;

-- ── RPC 2：推送（原子条件写）──────────────────────────────────────
-- 返回 status：ok / conflict / gone / invite_required / invite_invalid / too_fast / too_large / bad_request
-- 只有 ok 会写入；其余一律不写。行锁（FOR UPDATE）保证「比较版本 + 写入」在同一事务内原子完成。
create function public.ledger_push(
  p_auth_key text, p_expected_version integer, p_blob text, p_invite text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h bytea;
  cur_version integer;
  cur_blob text;
  cur_updated timestamptz;
  ih bytea;
begin
  if p_auth_key is null or p_auth_key !~ '^[0-9a-f]{64}$'
     or p_expected_version is null or p_expected_version < 0
     or p_blob is null or pg_catalog.octet_length(p_blob) = 0 then
    return pg_catalog.jsonb_build_object('status', 'bad_request');
  end if;
  if pg_catalog.octet_length(p_blob) > 4194304 then
    return pg_catalog.jsonb_build_object('status', 'too_large');
  end if;
  h := pg_catalog.sha256(pg_catalog.decode(p_auth_key, 'hex'));

  select l.version, l.blob, l.updated_at into cur_version, cur_blob, cur_updated
    from sync.ledgers l where l.key_hash = h for update;

  if not found then
    -- 行不存在：客户端若以为它存在（expected > 0），说明云端副本已被删除
    if p_expected_version <> 0 then
      return pg_catalog.jsonb_build_object('status', 'gone');
    end if;
    if pg_catalog.length(pg_catalog.regexp_replace(coalesce(p_invite, ''), '[^A-Za-z0-9]', '', 'g')) = 0 then
      return pg_catalog.jsonb_build_object('status', 'invite_required');
    end if;
    ih := sync.invite_hash(p_invite);
    perform 1 from sync.invites i where i.code_hash = ih and i.used_at is null for update;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'invite_invalid');
    end if;
    insert into sync.ledgers (key_hash, version, blob) values (h, 1, p_blob)
      on conflict (key_hash) do nothing;
    if not found then
      -- 并发创建：别人先建成了，本次不消耗邀请码
      return pg_catalog.jsonb_build_object('status', 'conflict');
    end if;
    update sync.invites set used_at = now(), used_by = h where code_hash = ih;
    return pg_catalog.jsonb_build_object('status', 'ok', 'version', 1);
  end if;

  if p_expected_version <> cur_version then
    return pg_catalog.jsonb_build_object('status', 'conflict', 'version', cur_version);
  end if;
  if now() - cur_updated < interval '2 seconds' then
    return pg_catalog.jsonb_build_object('status', 'too_fast', 'version', cur_version);
  end if;

  insert into sync.ledger_versions (key_hash, version, blob, created_at)
    values (h, cur_version, cur_blob, cur_updated);
  update sync.ledgers
     set version = cur_version + 1, blob = p_blob, updated_at = now()
   where key_hash = h;
  -- 只留最近 5 个历史版本
  delete from sync.ledger_versions v
   where v.key_hash = h
     and v.version not in (
       select v2.version from sync.ledger_versions v2
        where v2.key_hash = h order by v2.version desc limit 5);
  return pg_catalog.jsonb_build_object('status', 'ok', 'version', cur_version + 1);
end;
$$;

-- ── RPC 3：列出保留的版本（当前版本 + 最多 5 个历史版本，新的在前）──
create function public.ledger_history(p_auth_key text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h bytea;
  res jsonb;
begin
  if p_auth_key is null or p_auth_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'bad_request');
  end if;
  h := pg_catalog.sha256(pg_catalog.decode(p_auth_key, 'hex'));
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('version', t.version, 'at', t.at)
                                        order by t.version desc), '[]'::jsonb)
    into res
    from (
      select l.version, l.updated_at as at from sync.ledgers l where l.key_hash = h
      union all
      select v.version, v.created_at as at from sync.ledger_versions v where v.key_hash = h
    ) t;
  if res = '[]'::jsonb then
    return pg_catalog.jsonb_build_object('status', 'none');
  end if;
  return pg_catalog.jsonb_build_object('status', 'ok', 'versions', res);
end;
$$;

-- ── RPC 4：取某个版本的密文（供导出）──────────────────────────────
create function public.ledger_fetch(p_auth_key text, p_version integer)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h bytea;
  b text;
  u timestamptz;
begin
  if p_auth_key is null or p_auth_key !~ '^[0-9a-f]{64}$' or p_version is null then
    return pg_catalog.jsonb_build_object('status', 'bad_request');
  end if;
  h := pg_catalog.sha256(pg_catalog.decode(p_auth_key, 'hex'));
  select l.blob, l.updated_at into b, u from sync.ledgers l where l.key_hash = h and l.version = p_version;
  if not found then
    select v.blob, v.created_at into b, u from sync.ledger_versions v
     where v.key_hash = h and v.version = p_version;
  end if;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'none');
  end if;
  return pg_catalog.jsonb_build_object('status', 'ok', 'version', p_version, 'blob', b, 'at', u);
end;
$$;

-- ── RPC 5：用户主动删除云端副本（当前版本 + 全部历史）──────────────
create function public.ledger_delete(p_auth_key text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  h bytea;
begin
  if p_auth_key is null or p_auth_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'bad_request');
  end if;
  h := pg_catalog.sha256(pg_catalog.decode(p_auth_key, 'hex'));
  delete from sync.ledgers where key_hash = h;   -- ledger_versions 随外键级联删除
  if not found then
    return pg_catalog.jsonb_build_object('status', 'none');
  end if;
  return pg_catalog.jsonb_build_object('status', 'ok');
end;
$$;

-- ── 授权：只给 anon 执行这 5 个函数 ─────────────────────────────────
revoke all on function public.ledger_pull(text, integer)                 from public, anon, authenticated;
revoke all on function public.ledger_push(text, integer, text, text)     from public, anon, authenticated;
revoke all on function public.ledger_history(text)                       from public, anon, authenticated;
revoke all on function public.ledger_fetch(text, integer)                from public, anon, authenticated;
revoke all on function public.ledger_delete(text)                        from public, anon, authenticated;
grant execute on function public.ledger_pull(text, integer)              to anon;
grant execute on function public.ledger_push(text, integer, text, text)  to anon;
grant execute on function public.ledger_history(text)                    to anon;
grant execute on function public.ledger_fetch(text, integer)             to anon;
grant execute on function public.ledger_delete(text)                     to anon;
