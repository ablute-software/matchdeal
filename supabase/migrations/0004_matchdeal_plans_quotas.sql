-- MatchDeal — migração 0004: planos, quotas semanais, reconsideração (undo)
-- e super like/boost.
--
-- Este é o 0004 REAL entregue pelo Motor B, com DUAS classes de alteração
-- aplicadas por cima, ambas mecânicas e já acordadas:
--
-- a) `investor_entity_membership_id` → `investor_catalog_entity_id`, e a
--    resolução pessoa→entidade passa a ir por matchdeal_investor_members
--    (0001) em vez de comparar membership_id diretamente. Isto afeta só o
--    bloco de cooldown de matchdeal_eligible_deck, e é a mesma correção já
--    aplicada ao 0001/0002: matchdeal_matches nunca aponta para `entities`
--    (pipeline privado de cada org founder) — a âncora é `catalog_entities`.
--
-- b) matchdeal_eligible_deck aqui SUBSTITUI a versão de 0002 (é um
--    `create or replace`), acrescentando-lhe o teto semanal por tier. Como o
--    0002 já corre antes, a versão final em base é esta. O mesmo vale para
--    matchdeal_record_swipe, que ganha a quota de likes.
--
-- Nota sobre plan_tier: o 0001 NÃO o declara — é aqui que nasce, com os
-- valores reais tier_a/tier_b/tier_c.

alter table public.matchdeal_profiles
  add column if not exists plan_tier text not null default 'tier_a'
    check (plan_tier in ('tier_a', 'tier_b', 'tier_c'));

comment on column public.matchdeal_profiles.plan_tier is
  'tier_a = Elementary my dear / Boy Scout; tier_b = List of Suspects / Pro Spotter; tier_c = Its the Butler / Ace Sleuth. Ver claude/matchdeal_spec_v1_20260727.md §13.';

create table if not exists public.matchdeal_weekly_activity (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references public.matchdeal_profiles(id) on delete cascade,
  week_start            date not null,
  shown_count           int not null default 0,
  like_count            int not null default 0,
  undo_count            int not null default 0,
  super_like_used_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (profile_id, week_start)
);

create table if not exists public.matchdeal_boosts (
  id                     uuid primary key default gen_random_uuid(),
  boosted_profile_id     uuid not null references public.matchdeal_profiles(id) on delete cascade,
  investor_profile_id    uuid not null references public.matchdeal_profiles(id) on delete cascade,
  week_start             date not null,
  created_at             timestamptz not null default now(),
  unique (boosted_profile_id, investor_profile_id, week_start)
);
create index if not exists matchdeal_boosts_investor_idx on public.matchdeal_boosts (investor_profile_id, week_start);

alter table public.matchdeal_weekly_activity enable row level security;
alter table public.matchdeal_boosts enable row level security;

drop policy if exists matchdeal_weekly_activity_own on public.matchdeal_weekly_activity;
create policy matchdeal_weekly_activity_own on public.matchdeal_weekly_activity
  for select using (profile_id in (select public.matchdeal_current_profile_ids()));

drop policy if exists matchdeal_boosts_participants on public.matchdeal_boosts;
create policy matchdeal_boosts_participants on public.matchdeal_boosts
  for select using (
    investor_profile_id in (select public.matchdeal_current_profile_ids())
    or boosted_profile_id in (select public.matchdeal_current_profile_ids())
  );

create or replace function public.matchdeal_tier_limits(p_tier text)
returns table (deck_size int, like_limit int, undo_limit int)
language sql immutable as $$
  select
    case p_tier when 'tier_a' then 3 when 'tier_b' then 10 when 'tier_c' then 20 else 3 end,
    case p_tier when 'tier_a' then 1 when 'tier_b' then 5 when 'tier_c' then 10 else 1 end,
    case p_tier when 'tier_a' then 0 when 'tier_b' then 2 when 'tier_c' then null else 0 end;
$$;

create or replace function public.matchdeal_current_week_start()
returns date language sql stable as $$
  select date_trunc('week', now())::date;
$$;

create or replace function public.matchdeal_get_or_create_weekly_activity(p_profile_id uuid)
returns public.matchdeal_weekly_activity
language plpgsql security definer as $$
declare
  v_row public.matchdeal_weekly_activity;
  v_week date := public.matchdeal_current_week_start();
begin
  select * into v_row from public.matchdeal_weekly_activity
  where profile_id = p_profile_id and week_start = v_week for update;
  if v_row.id is null then
    insert into public.matchdeal_weekly_activity (profile_id, week_start)
    values (p_profile_id, v_week) returning * into v_row;
  end if;
  return v_row;
end; $$;

create or replace function public.matchdeal_eligible_deck(
  p_viewer_profile_id uuid, p_limit int default 20
) returns setof public.matchdeal_profiles
language plpgsql security definer as $$
declare
  v_viewer public.matchdeal_profiles;
  v_weekly public.matchdeal_weekly_activity;
  v_limits record;
  v_remaining int;
begin
  select * into v_viewer from public.matchdeal_profiles where id = p_viewer_profile_id;
  v_weekly := public.matchdeal_get_or_create_weekly_activity(p_viewer_profile_id);
  select * into v_limits from public.matchdeal_tier_limits(v_viewer.plan_tier);
  v_remaining := greatest(v_limits.deck_size - v_weekly.shown_count, 0);
  if v_remaining = 0 then return; end if;
  return query
  select p.* from public.matchdeal_profiles p
  where p.is_visible = true
    and p.kind <> v_viewer.kind
    and p.id not in (
      select target_profile_id from public.matchdeal_swipes where actor_profile_id = p_viewer_profile_id
    )
    and (v_viewer.kind <> 'investor' or v_viewer.sectors = '{}' or p.sectors && v_viewer.sectors)
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.stages_invested,1) is null or p.investment_stage_sought = any(v_viewer.stages_invested))
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.geographies,1) is null or p.country = any(v_viewer.geographies))
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.phases_accepted,1) is null or p.company_phase = any(v_viewer.phases_accepted))
    and (v_viewer.kind <> 'startup' or array_length(p.stages_invested,1) is null or v_viewer.investment_stage_sought = any(p.stages_invested))
    and (v_viewer.kind <> 'startup' or array_length(p.geographies,1) is null or v_viewer.country = any(p.geographies))
    and (v_viewer.kind <> 'startup' or array_length(p.phases_accepted,1) is null or v_viewer.company_phase = any(p.phases_accepted))
    -- Bloqueio de cooldown. O cooldown é ao nível da ENTIDADE investidora,
    -- não da pessoa, por isso resolve-se o catalog_entity_id de cada lado
    -- via matchdeal_investor_members (0001) — ver alteração (a) no topo.
    and not exists (
      select 1 from public.matchdeal_matches m
      where m.cooldown_until is not null and m.cooldown_until > now()
        and (
          (v_viewer.kind = 'startup' and m.startup_profile_id = p_viewer_profile_id
            and m.investor_catalog_entity_id = (
              select im.catalog_entity_id from public.matchdeal_investor_members im where im.id = p.membership_id))
          or
          (v_viewer.kind = 'investor' and p.id = m.startup_profile_id
            and m.investor_catalog_entity_id = (
              select im.catalog_entity_id from public.matchdeal_investor_members im where im.id = v_viewer.membership_id))
        )
    )
  order by
    (not exists (
      select 1 from public.matchdeal_exposures e
      where e.viewer_profile_id = p_viewer_profile_id
        and e.shown_profile_id = p.id
        and e.shown_at > now() - interval '7 days'
    )) desc,
    random()
  limit least(p_limit, v_remaining);
end; $$;

create or replace function public.matchdeal_record_exposure(
  p_viewer_profile_id uuid, p_shown_profile_id uuid
) returns void language plpgsql security definer as $$
begin
  insert into public.matchdeal_exposures (viewer_profile_id, shown_profile_id)
  values (p_viewer_profile_id, p_shown_profile_id);
  perform public.matchdeal_get_or_create_weekly_activity(p_viewer_profile_id);
  update public.matchdeal_weekly_activity
    set shown_count = shown_count + 1, updated_at = now()
    where profile_id = p_viewer_profile_id and week_start = public.matchdeal_current_week_start();
end; $$;

create or replace function public.matchdeal_record_swipe(
  p_actor_profile_id uuid, p_target_profile_id uuid, p_direction text
) returns uuid language plpgsql security definer as $$
declare
  v_reverse_like_exists boolean;
  v_actor_kind text;
  v_target_kind text;
  v_startup_profile_id uuid;
  v_investor_profile_id uuid;
  v_match_id uuid;
  v_actor public.matchdeal_profiles;
  v_weekly public.matchdeal_weekly_activity;
  v_limits record;
begin
  if p_direction not in ('like','pass') then
    raise exception 'direction inválida: %', p_direction;
  end if;
  select * into v_actor from public.matchdeal_profiles where id = p_actor_profile_id;
  if p_direction = 'like' then
    v_weekly := public.matchdeal_get_or_create_weekly_activity(p_actor_profile_id);
    select * into v_limits from public.matchdeal_tier_limits(v_actor.plan_tier);
    if v_weekly.like_count >= v_limits.like_limit then
      raise exception 'MATCHDEAL_LIKE_LIMIT_REACHED';
    end if;
  end if;
  insert into public.matchdeal_swipes (actor_profile_id, target_profile_id, direction)
  values (p_actor_profile_id, p_target_profile_id, p_direction)
  on conflict (actor_profile_id, target_profile_id) do update set direction = excluded.direction;
  if p_direction = 'pass' then return null; end if;
  update public.matchdeal_weekly_activity
    set like_count = like_count + 1, updated_at = now()
    where profile_id = p_actor_profile_id and week_start = public.matchdeal_current_week_start();
  v_actor_kind := v_actor.kind;
  select kind into v_target_kind from public.matchdeal_profiles where id = p_target_profile_id;
  if v_actor_kind = v_target_kind then
    raise exception 'swipe entre dois perfis do mesmo tipo não é suportado';
  end if;
  select exists (
    select 1 from public.matchdeal_swipes
    where actor_profile_id = p_target_profile_id
      and target_profile_id = p_actor_profile_id and direction = 'like'
  ) into v_reverse_like_exists;
  if not v_reverse_like_exists then return null; end if;
  if v_actor_kind = 'startup' then
    v_startup_profile_id := p_actor_profile_id;
    v_investor_profile_id := p_target_profile_id;
  else
    v_startup_profile_id := p_target_profile_id;
    v_investor_profile_id := p_actor_profile_id;
  end if;
  v_match_id := public.matchdeal_handle_mutual_match(v_startup_profile_id, v_investor_profile_id);
  return v_match_id;
end; $$;

create or replace function public.matchdeal_undo_swipe(
  p_actor_profile_id uuid, p_target_profile_id uuid
) returns uuid language plpgsql security definer as $$
declare
  v_actor public.matchdeal_profiles;
  v_weekly public.matchdeal_weekly_activity;
  v_limits record;
  v_current_direction text;
begin
  select * into v_actor from public.matchdeal_profiles where id = p_actor_profile_id;
  select * into v_limits from public.matchdeal_tier_limits(v_actor.plan_tier);
  select direction into v_current_direction
  from public.matchdeal_swipes
  where actor_profile_id = p_actor_profile_id and target_profile_id = p_target_profile_id;
  if v_current_direction is distinct from 'pass' then
    raise exception 'Só é possível reconsiderar perfis rejeitados.';
  end if;
  v_weekly := public.matchdeal_get_or_create_weekly_activity(p_actor_profile_id);
  if v_limits.undo_limit is not null and v_weekly.undo_count >= v_limits.undo_limit then
    raise exception 'MATCHDEAL_UNDO_LIMIT_REACHED';
  end if;
  if v_weekly.like_count >= v_limits.like_limit then
    raise exception 'MATCHDEAL_LIKE_LIMIT_REACHED';
  end if;
  update public.matchdeal_weekly_activity
    set undo_count = undo_count + 1, updated_at = now()
    where profile_id = p_actor_profile_id and week_start = public.matchdeal_current_week_start();
  return public.matchdeal_record_swipe(p_actor_profile_id, p_target_profile_id, 'like');
end; $$;

create or replace function public.matchdeal_activate_super_like(
  p_actor_profile_id uuid, p_target_profile_id uuid
) returns void language plpgsql security definer as $$
declare
  v_actor public.matchdeal_profiles;
  v_target public.matchdeal_profiles;
  v_weekly public.matchdeal_weekly_activity;
  v_week date := public.matchdeal_current_week_start();
begin
  select * into v_actor from public.matchdeal_profiles where id = p_actor_profile_id;
  if v_actor.plan_tier <> 'tier_b' then
    raise exception 'MATCHDEAL_SUPER_LIKE_NOT_AVAILABLE';
  end if;
  v_weekly := public.matchdeal_get_or_create_weekly_activity(p_actor_profile_id);
  if v_weekly.super_like_used_at is not null then
    raise exception 'MATCHDEAL_SUPER_LIKE_ALREADY_USED';
  end if;
  select * into v_target from public.matchdeal_profiles where id = p_target_profile_id;
  update public.matchdeal_weekly_activity
    set super_like_used_at = now(), updated_at = now()
    where profile_id = p_actor_profile_id and week_start = v_week;
  if v_actor.kind = 'investor' and v_target.kind = 'startup' then
    insert into public.matchdeal_boosts (boosted_profile_id, investor_profile_id, week_start)
    values (p_target_profile_id, p_actor_profile_id, v_week)
    on conflict do nothing;
  end if;
  perform public.matchdeal_record_swipe(p_actor_profile_id, p_target_profile_id, 'like');
end; $$;
