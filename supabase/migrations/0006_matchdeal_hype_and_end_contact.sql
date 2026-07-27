-- MatchDeal — migração 0006: Hype List (spec §15) e End contact (spec §5.4).
--
-- Implementa as duas decisões que estavam em aberto. Migração separada de
-- propósito: 0001-0005 já foram revistas e vão ser corridas, e alterá-las
-- por baixo criaria divergência entre o que foi revisto e o que correu.
--
-- ÂMBITO — esta é a ÚNICA migração do MatchDeal que toca numa tabela do
-- Sherlock Deal, e fá-lo dentro de três guardas acordadas:
--   a) a única alteração a `access_grants` é uma coluna nova e nullable
--      (`source`). Nada existente muda de forma ou de significado.
--   b) toda a escrita passa por UM par de funções SECURITY DEFINER
--      (matchdeal_grant_dataroom / matchdeal_revoke_dataroom). Nenhuma
--      policy do MatchDeal ganha acesso direto à tabela.
--   c) a revogação só toca em linhas com source='matchdeal'. Um grant criado
--      à mão por um founder é intocável pela app, sempre — está no `where`
--      da função, não só na convenção.
--
-- Nota: revogar é `revoked_at = now()`, nunca DELETE. A tabela já foi
-- desenhada assim e o portal já respeita esse campo.

alter table public.access_grants
  add column if not exists source text;

comment on column public.access_grants.source is
  'Origem do grant. NULL = criado no Sherlock Deal (manual, pelo founder). ''matchdeal'' = criado pela app MatchDeal no consentimento de um match. A app SÓ pode revogar linhas com source=''matchdeal'' — ver matchdeal_revoke_dataroom.';

-- ---------------------------------------------------------------------
-- Bloqueio de longa duração, distinto do cooldown.
--
-- Um cooldown de 30 dias é um prazo que passa sozinho; "não voltar a mostrar
-- esta entidade" é uma preferência da startup, sem prazo, que só ela desfaz.
-- Guardar as duas coisas no mesmo campo (empurrando cooldown_until para uma
-- data absurda) perderia essa diferença e tornaria a reversão impossível de
-- distinguir de um erro. Por isso, tabela própria.
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_entity_blocks (
  id                  uuid primary key default gen_random_uuid(),
  startup_profile_id  uuid not null references public.matchdeal_profiles(id) on delete cascade,
  catalog_entity_id   uuid not null references public.catalog_entities(id),
  created_at          timestamptz not null default now(),
  unique (startup_profile_id, catalog_entity_id)
);
create index if not exists matchdeal_entity_blocks_startup_idx
  on public.matchdeal_entity_blocks (startup_profile_id);

alter table public.matchdeal_entity_blocks enable row level security;

-- A própria startup lê e gere os seus bloqueios (é isso que alimenta o ecrã
-- de definições onde os desfaz).
drop policy if exists matchdeal_entity_blocks_own on public.matchdeal_entity_blocks;
create policy matchdeal_entity_blocks_own on public.matchdeal_entity_blocks
  for all using (startup_profile_id in (select public.matchdeal_current_profile_ids()))
  with check (startup_profile_id in (select public.matchdeal_current_profile_ids()));

-- ---------------------------------------------------------------------
-- Notificações — mínimo necessário para "a startup é notificada de um super
-- like SEM saber de quem veio".
--
-- Não se pode usar matchdeal_messages para isto: as mensagens vivem num
-- match, e um super like acontece ANTES de haver match (pode nunca haver).
-- A ausência de qualquer campo de autor nesta tabela é a garantia estrutural
-- do anonimato — não há identidade para vazar, mesmo por engano numa query
-- futura. É também o ponto de partida para o push (Expo) mais tarde.
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.matchdeal_profiles(id) on delete cascade,
  kind         text not null check (kind in ('super_like_received', 'contact_ended', 'match_created', 'reassigned')),
  body         text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists matchdeal_notifications_profile_idx
  on public.matchdeal_notifications (profile_id, created_at desc);

alter table public.matchdeal_notifications enable row level security;

drop policy if exists matchdeal_notifications_own on public.matchdeal_notifications;
create policy matchdeal_notifications_own on public.matchdeal_notifications
  for select using (profile_id in (select public.matchdeal_current_profile_ids()));
-- Marcar como lida é a única escrita do cliente; a criação é sempre por
-- função SECURITY DEFINER.
drop policy if exists matchdeal_notifications_mark_read on public.matchdeal_notifications;
create policy matchdeal_notifications_mark_read on public.matchdeal_notifications
  for update using (profile_id in (select public.matchdeal_current_profile_ids()))
  with check (profile_id in (select public.matchdeal_current_profile_ids()));

-- =======================================================================
-- §15 — HYPE LIST
-- =======================================================================
-- Pesos num sítio único. Alterar aqui muda o score em todo o produto.
create or replace function public.matchdeal_hype_weights()
returns table (
  w_likes_week      numeric,
  w_growth          numeric,
  w_approval_rate   numeric,
  w_completeness    numeric,
  w_super_likes     numeric,
  completeness_min  numeric,
  hype_threshold    numeric
)
language sql immutable as $$
  select
    1.0::numeric,   -- likes recebidos esta semana (normalizado 0-1 face ao máximo da semana)
    1.5::numeric,   -- ritmo de crescimento face à semana anterior
    2.0::numeric,   -- taxa de aprovação (likes / vezes que foi mostrada)
    0.5::numeric,   -- bónus de completude
    2.5::numeric,   -- super likes recebidos esta semana
    0.90::numeric,  -- completude mínima para o bónus (>=90%)
    0.60::numeric;  -- score normalizado a partir do qual o badge "Hype" aparece
$$;

-- Score composto, SEMPRE calculado em tempo de leitura.
--
-- Deliberadamente uma view e não uma coluna: o score é relativo à população
-- (o crescimento e a normalização dependem de todas as outras startups
-- nessa semana), por isso um valor materializado fica errado assim que
-- qualquer outro perfil se mexe — e ninguém repara, porque continua a
-- parecer um número.
--
-- Honestidade (§15.5): isto é curadoria com critérios documentados, não um
-- ranking factual. Nada aqui é inventado — cada termo vem de contagens
-- reais, e o badge é um booleano, não uma posição.
create or replace view public.matchdeal_startup_hype as
with w as (select * from public.matchdeal_hype_weights()),
week as (select public.matchdeal_current_week_start() as start),
base as (
  select
    p.id as startup_profile_id,
    -- likes recebidos esta semana
    (select count(*) from public.matchdeal_swipes s
      where s.target_profile_id = p.id and s.direction = 'like'
        and s.created_at >= (select start from week))::numeric as likes_week,
    -- likes recebidos na semana anterior (base do ritmo de crescimento)
    (select count(*) from public.matchdeal_swipes s
      where s.target_profile_id = p.id and s.direction = 'like'
        and s.created_at >= (select start from week) - interval '7 days'
        and s.created_at <  (select start from week))::numeric as likes_prev,
    -- vezes que foi mostrada esta semana (denominador da taxa de aprovação)
    (select count(*) from public.matchdeal_exposures e
      where e.shown_profile_id = p.id
        and e.shown_at >= (select start from week))::numeric as shown_week,
    -- super likes recebidos esta semana
    (select count(*) from public.matchdeal_boosts b
      where b.boosted_profile_id = p.id
        and b.week_start = (select start from week))::numeric as super_likes_week,
    -- completude: o trigger de 0002 já mantém is_complete; usa-se como
    -- proxy binário do ">=90%" em vez de inventar uma percentagem que a
    -- base não tem.
    case when p.is_complete then 1.0 else 0.0 end::numeric as completeness
  from public.matchdeal_profiles p
  where p.kind = 'startup' and p.is_visible = true
),
scaled as (
  select
    b.*,
    -- normalização face ao máximo da semana; nullif evita divisão por zero
    -- na primeira semana ou numa semana sem atividade nenhuma.
    b.likes_week / nullif((select max(likes_week) from base), 0) as n_likes,
    b.super_likes_week / nullif((select max(super_likes_week) from base), 0) as n_super,
    case
      when b.likes_prev = 0 and b.likes_week = 0 then 0
      when b.likes_prev = 0 then 1            -- do nada para alguma coisa: crescimento máximo
      else least(b.likes_week / b.likes_prev, 3) / 3   -- teto em 3x, escalado para 0-1
    end as n_growth,
    case when b.shown_week = 0 then 0 else b.likes_week / b.shown_week end as approval_rate
  from base b
),
-- SÓ o booleano sai daqui.
--
-- A versão anterior desta view devolvia também likes_week, super_likes_week
-- e approval_rate. Uma view em Postgres corre com os direitos de quem a
-- criou, não de quem a consulta, por isso o RLS das tabelas de baixo NÃO se
-- aplica — qualquer sessão autenticada leria os números brutos de TODAS as
-- startups. A decisão do §15 é um badge, não um placar: quem consome vê
-- "Hype" ou não vê, e mais nada. Os componentes continuam a existir, mas só
-- por trás de uma query de admin escrita à mão.
scored as (
  select
    s.startup_profile_id,
    (coalesce(s.n_likes, 0)  * (select w_likes_week    from w)
   + coalesce(s.n_growth, 0) * (select w_growth        from w)
   + s.approval_rate         * (select w_approval_rate from w)
   + (case when s.completeness >= (select completeness_min from w)
           then 1 else 0 end) * (select w_completeness from w)
   + coalesce(s.n_super, 0)  * (select w_super_likes   from w)
    ) / ((select w_likes_week from w) + (select w_growth from w)
       + (select w_approval_rate from w) + (select w_completeness from w)
       + (select w_super_likes from w)) as score
  from scaled s
)
select
  sc.startup_profile_id,
  sc.score >= (select hype_threshold from w) as is_hype
from scored sc;

comment on view public.matchdeal_startup_hype is
  'Hype List (spec §15). Score composto calculado em leitura — nunca materializado, porque é relativo à população da semana. Pesos em matchdeal_hype_weights(). O badge is_hype é curadoria com critérios documentados, NÃO um ranking factual, e nunca deve ser apresentado como tal. O investidor não consegue saber se o super like dele contribuiu: o score é global à startup e esta view não expõe autoria.';

-- O super like passa a alimentar o hype GLOBAL (via matchdeal_boosts, que a
-- view acima lê) e a notificar a startup SEM identidade. Para o investidor
-- não muda nada: continua a valer como swipe right, 1/semana, tier B.
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
    -- Registo de quem deu o quê (auditoria + input do hype score global).
    insert into public.matchdeal_boosts (boosted_profile_id, investor_profile_id, week_start)
    values (p_target_profile_id, p_actor_profile_id, v_week)
    on conflict do nothing;

    -- §15.4 — a startup sabe que recebeu, não sabe de quem. A tabela de
    -- notificações não tem coluna de autor, por construção.
    insert into public.matchdeal_notifications (profile_id, kind, body)
    values (p_target_profile_id, 'super_like_received',
      'Recebeste um super like. Vais saber quem foi se houver match.');
  end if;

  perform public.matchdeal_record_swipe(p_actor_profile_id, p_target_profile_id, 'like');
end; $$;

-- =======================================================================
-- §5.4 — END CONTACT + o par de funções que fala com access_grants
-- =======================================================================

-- Concede acesso ao data room da startup ao investidor responsável ativo.
-- Escopo: a pasta raiz de kind='data_room' da org da startup — a tabela
-- exige folder_id ou document_id (constraint grant_has_scope), não existe
-- grant "ao data room inteiro" sem alvo.
create or replace function public.matchdeal_grant_dataroom(p_match_id uuid)
returns uuid
language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_folder_id uuid;
  v_email text;
  v_grant_id uuid;
  v_investor_profile_id uuid;
begin
  select sp.membership_id, m.active_investor_profile_id
    into v_org_id, v_investor_profile_id
  from public.matchdeal_matches m
  join public.matchdeal_profiles sp on sp.id = m.startup_profile_id
  where m.id = p_match_id;

  if v_org_id is null or v_investor_profile_id is null then
    raise exception 'MATCHDEAL_MATCH_INCOMPLETE';
  end if;

  select u.email into v_email
  from public.matchdeal_profiles ip
  join public.matchdeal_investor_members im on im.id = ip.membership_id
  join auth.users u on u.id = im.user_id
  where ip.id = v_investor_profile_id;

  if v_email is null then
    raise exception 'MATCHDEAL_INVESTOR_EMAIL_UNKNOWN';
  end if;

  select f.id into v_folder_id
  from public.folders f
  where f.org_id = v_org_id and f.kind = 'data_room' and f.parent_id is null
  order by f.position asc
  limit 1;

  if v_folder_id is null then
    raise exception 'MATCHDEAL_NO_DATAROOM_FOLDER';
  end if;

  -- Reabre um grant desta app que tenha sido revogado antes, em vez de
  -- empilhar linhas por cada ciclo de match.
  update public.access_grants
    set revoked_at = null, granted_at = now()
    where org_id = v_org_id and grantee_email = v_email
      and folder_id = v_folder_id and source = 'matchdeal'
    returning id into v_grant_id;

  if v_grant_id is null then
    insert into public.access_grants (org_id, grantee_email, folder_id, source, note)
    values (v_org_id, v_email, v_folder_id, 'matchdeal',
            'Concedido automaticamente pelo MatchDeal no consentimento de um match.')
    returning id into v_grant_id;
  end if;

  return v_grant_id;
end; $$;

-- Revoga o acesso concedido por esta app. O `and source = 'matchdeal'` é a
-- guarda (c): um grant criado à mão por um founder nunca é tocado, mesmo que
-- coincida no email e na pasta.
create or replace function public.matchdeal_revoke_dataroom(p_match_id uuid)
returns int
language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_email text;
  v_count int;
begin
  select sp.membership_id into v_org_id
  from public.matchdeal_matches m
  join public.matchdeal_profiles sp on sp.id = m.startup_profile_id
  where m.id = p_match_id;

  select u.email into v_email
  from public.matchdeal_matches m
  join public.matchdeal_profiles ip on ip.id = m.active_investor_profile_id
  join public.matchdeal_investor_members im on im.id = ip.membership_id
  join auth.users u on u.id = im.user_id
  where m.id = p_match_id;

  if v_org_id is null or v_email is null then return 0; end if;

  update public.access_grants
    set revoked_at = now()
    where org_id = v_org_id
      and grantee_email = v_email
      and source = 'matchdeal'
      and revoked_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- O consentimento passa a criar o grant de facto. A decisão em si continua
-- em matchdeal_decide_dataroom_consent (0002); aqui só se acrescenta o
-- efeito real, mantendo a mensagem de sistema que já existia.
create or replace function public.matchdeal_decide_dataroom_consent(
  p_match_id        uuid,
  p_granted         boolean,
  p_decline_reason  text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_active_queue_id uuid;
begin
  insert into public.matchdeal_dataroom_consent (match_id, granted, decline_reason)
  values (p_match_id, p_granted, p_decline_reason)
  on conflict (match_id) do update
    set granted = excluded.granted, decline_reason = excluded.decline_reason, decided_at = now();

  if p_granted then
    update public.matchdeal_matches
      set status = 'active', dataroom_granted_at = now(), updated_at = now()
      where id = p_match_id;

    select id into v_active_queue_id
    from public.matchdeal_responsibility_queue
    where match_id = p_match_id and status = 'active';

    update public.matchdeal_responsibility_queue
      set sla_deadline = now() + interval '7 days'
      where id = v_active_queue_id;

    -- Acesso real ao data room do Sherlock Deal (0006).
    perform public.matchdeal_grant_dataroom(p_match_id);

    insert into public.matchdeal_match_events (match_id, event_type)
    values (p_match_id, 'consent_granted');

    insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
    values (p_match_id, null, 'system',
      'A startup autorizou a partilha do data room. Já podes ver os documentos no Sherlock Deal e conversar livremente aqui.');
  else
    update public.matchdeal_matches
      set status = 'declined_by_startup', cooldown_until = now() + interval '30 days', updated_at = now()
      where id = p_match_id;

    update public.matchdeal_responsibility_queue
      set status = 'declined'
      where match_id = p_match_id;

    insert into public.matchdeal_match_events (match_id, event_type, payload)
    values (p_match_id, 'consent_declined', jsonb_build_object('reason', p_decline_reason));

    insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
    values (p_match_id, null, 'system',
      'A startup optou por não partilhar o data room neste momento. O match fica sem efeito.');
  end if;
end; $$;

-- A startup termina um contacto já ativo (§5.4).
--
-- O ponto que distingue isto de um timeout de SLA: a fila NÃO avança. É uma
-- rejeição à ENTIDADE, não à pessoa — passar a pasta ao colega seguinte seria
-- exatamente o contrário do que a startup pediu.
create or replace function public.matchdeal_startup_end_contact(
  p_match_id      uuid,
  p_reason        text default null,
  p_block_entity  boolean default false
) returns void
language plpgsql security definer as $$
declare
  v_match public.matchdeal_matches;
begin
  select * into v_match from public.matchdeal_matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'MATCHDEAL_MATCH_NOT_FOUND';
  end if;
  if v_match.status <> 'active' then
    raise exception 'MATCHDEAL_MATCH_NOT_ACTIVE';
  end if;

  -- 1. Revogar o data room ANTES de fechar o match: a função de revogação
  --    resolve o investidor por active_investor_profile_id, e esse campo tem
  --    de continuar preenchido enquanto ela corre.
  perform public.matchdeal_revoke_dataroom(p_match_id);

  -- 2. Fechar à entidade inteira, com o cooldown de 30 dias (igual à recusa
  --    inicial; o de 90 dias é outra coisa — é a fila esgotada por SLA).
  update public.matchdeal_matches
    set status = 'closed_by_startup',
        cooldown_until = now() + interval '30 days',
        updated_at = now()
    where id = p_match_id;

  -- 3. A fila inteira encerra. Nenhum 'waiting' passa a 'active'.
  update public.matchdeal_responsibility_queue
    set status = 'declined'
    where match_id = p_match_id and status in ('active', 'waiting');

  -- 4. Razão: registo interno, e só isso. Fica no payload do evento, que é
  --    a trilha de auditoria, e NUNCA é reexibida ao investidor seguinte —
  --    não há nenhum caminho de leitura dela para a UI do investidor.
  insert into public.matchdeal_match_events (match_id, event_type, payload)
  values (p_match_id, 'closed_by_startup',
          jsonb_build_object('reason', p_reason, 'blocked_entity', p_block_entity));

  -- 5. Aviso profissional, sem atribuir culpa.
  insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
  values (p_match_id, null, 'system', 'The startup has ended this contact.');

  if v_match.active_investor_profile_id is not null then
    insert into public.matchdeal_notifications (profile_id, kind, body)
    values (v_match.active_investor_profile_id, 'contact_ended',
            'The startup has ended this contact.');
  end if;

  -- 6. Bloqueio opcional de longa duração, reversível pela startup.
  if p_block_entity then
    insert into public.matchdeal_entity_blocks (startup_profile_id, catalog_entity_id)
    values (v_match.startup_profile_id, v_match.investor_catalog_entity_id)
    on conflict do nothing;
  end if;
end; $$;

-- =======================================================================
-- eligible_deck v3 — acrescenta o join dos bloqueios de longa duração.
-- (v1 em 0002, v2 em 0004 com o teto semanal por tier. Esta versão é a que
-- fica em base; mantém tudo o que as anteriores faziam.)
-- =======================================================================
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
    -- Bloqueio de longa duração (§5.4). Vale nos dois sentidos: a startup
    -- não vê a entidade que bloqueou, e ninguém dessa entidade a vê a ela.
    and not exists (
      select 1 from public.matchdeal_entity_blocks bl
      where (v_viewer.kind = 'startup'
             and bl.startup_profile_id = p_viewer_profile_id
             and bl.catalog_entity_id = (
               select im.catalog_entity_id from public.matchdeal_investor_members im where im.id = p.membership_id))
         or (v_viewer.kind = 'investor'
             and bl.startup_profile_id = p.id
             and bl.catalog_entity_id = (
               select im.catalog_entity_id from public.matchdeal_investor_members im where im.id = v_viewer.membership_id))
    )
    -- Cooldown (30d recusa/fim pela startup, 90d fila esgotada por SLA).
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
