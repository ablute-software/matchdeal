-- MatchDeal — migração 0002: funções de negócio
--
-- Implementa: (a) completude/visibilidade de perfil, (b) registo de swipe e
-- criação de match mútuo com fila de responsabilidade por entidade,
-- (c) consentimento de partilha do data room, (d) SLA de acompanhamento
-- (7 dias automático + 48h para a startup reportar falta de resposta),
-- (e) reatribuição em cascata, (f) baralho de swipe elegível com filtro
-- automático + exposição mínima garantida.
--
-- Todas as funções são SECURITY DEFINER para poderem escrever em tabelas
-- protegidas por RLS a partir de chamadas RPC controladas — a validação de
-- "quem pode chamar isto" fica nas policies de RLS (0003) mais nos
-- próprios `where` das funções, não na ausência de RLS.

-- =======================================================================
-- (a) completude/visibilidade
-- =======================================================================
create or replace function public.matchdeal_recompute_profile_completeness()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'startup' then
    new.is_complete := (
      new.photo_url is not null and
      new.website is not null and
      array_length(new.sectors, 1) > 0 and
      new.description is not null and
      new.country is not null and
      new.investment_stage_sought is not null and
      new.company_phase is not null
    );
  elsif new.kind = 'investor' then
    new.is_complete := (
      new.representative_name is not null and
      new.entity_name is not null and
      array_length(new.stages_invested, 1) > 0 and
      array_length(new.geographies, 1) > 0 and
      new.country is not null and
      new.website is not null
    );
  end if;

  -- Na v1 visibilidade = completude. Mantido como coluna separada para
  -- permitir no futuro suspensão manual (abuso, disputa) sem mexer no
  -- cálculo de completude.
  new.is_visible := new.is_complete;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_matchdeal_profile_completeness on public.matchdeal_profiles;
create trigger trg_matchdeal_profile_completeness
  before insert or update on public.matchdeal_profiles
  for each row execute function public.matchdeal_recompute_profile_completeness();


-- =======================================================================
-- (b) registo de swipe + criação de match mútuo + fila de responsabilidade
-- =======================================================================
create or replace function public.matchdeal_record_swipe(
  p_actor_profile_id  uuid,
  p_target_profile_id uuid,
  p_direction         text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_reverse_like_exists boolean;
  v_actor_kind text;
  v_target_kind text;
  v_startup_profile_id uuid;
  v_investor_profile_id uuid;
  v_match_id uuid;
begin
  if p_direction not in ('like','pass') then
    raise exception 'direction inválida: %', p_direction;
  end if;

  insert into public.matchdeal_swipes (actor_profile_id, target_profile_id, direction)
  values (p_actor_profile_id, p_target_profile_id, p_direction)
  on conflict (actor_profile_id, target_profile_id) do update set direction = excluded.direction;

  if p_direction = 'pass' then
    return null;
  end if;

  select kind into v_actor_kind from public.matchdeal_profiles where id = p_actor_profile_id;
  select kind into v_target_kind from public.matchdeal_profiles where id = p_target_profile_id;

  if v_actor_kind = v_target_kind then
    raise exception 'swipe entre dois perfis do mesmo tipo não é suportado';
  end if;

  select exists (
    select 1 from public.matchdeal_swipes
    where actor_profile_id = p_target_profile_id
      and target_profile_id = p_actor_profile_id
      and direction = 'like'
  ) into v_reverse_like_exists;

  if not v_reverse_like_exists then
    return null; -- ainda não há match mútuo
  end if;

  if v_actor_kind = 'startup' then
    v_startup_profile_id := p_actor_profile_id;
    v_investor_profile_id := p_target_profile_id;
  else
    v_startup_profile_id := p_target_profile_id;
    v_investor_profile_id := p_actor_profile_id;
  end if;

  v_match_id := public.matchdeal_handle_mutual_match(v_startup_profile_id, v_investor_profile_id);
  return v_match_id;
end;
$$;


create or replace function public.matchdeal_handle_mutual_match(
  p_startup_profile_id  uuid,
  p_investor_profile_id uuid
) returns uuid
language plpgsql
security definer
as $$
declare
  v_entity_id uuid;
  v_match_id uuid;
  v_next_position int;
begin
  -- Resolve a entidade investidora (VC/FO) a partir do vínculo provisório
  -- pessoa→entidade (0004), para agrupar vários investidores da mesma
  -- entidade no mesmo match. matchdeal_profiles.membership_id aponta para
  -- matchdeal_investor_members.id quando kind='investor'.
  select im.catalog_entity_id into v_entity_id
  from public.matchdeal_profiles p
  join public.matchdeal_investor_members im on im.id = p.membership_id
  where p.id = p_investor_profile_id;

  if v_entity_id is null then
    raise exception 'Perfil de investidor % não está vinculado a nenhuma entidade do catálogo.', p_investor_profile_id;
  end if;

  -- Tranca a linha do par (startup, entidade) se já existir, para evitar
  -- condição de corrida quando dois investidores da mesma entidade dão
  -- swipe em simultâneo.
  select id into v_match_id
  from public.matchdeal_matches
  where startup_profile_id = p_startup_profile_id
    and investor_catalog_entity_id = v_entity_id
    and status in ('pending_consent', 'active')
  for update;

  if v_match_id is null then
    -- Primeiro investidor desta entidade a fazer match com esta startup.
    insert into public.matchdeal_matches (startup_profile_id, investor_catalog_entity_id, status, active_investor_profile_id)
    values (p_startup_profile_id, v_entity_id, 'pending_consent', p_investor_profile_id)
    returning id into v_match_id;

    insert into public.matchdeal_responsibility_queue (match_id, investor_profile_id, position, status, became_active_at)
    values (v_match_id, p_investor_profile_id, 1, 'active', now());

    insert into public.matchdeal_match_events (match_id, event_type, payload)
    values (v_match_id, 'created', jsonb_build_object('active_investor_profile_id', p_investor_profile_id));

    insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
    values (v_match_id, null, 'system',
      'É um match! A pedir autorização à startup para partilhar o data room.');

    return v_match_id;
  end if;

  -- Já existe processo aberto com outro investidor desta entidade — este
  -- investidor entra na fila por ordem de chegada.
  if exists (
    select 1 from public.matchdeal_responsibility_queue
    where match_id = v_match_id and investor_profile_id = p_investor_profile_id
  ) then
    return v_match_id; -- já estava na fila (chamada repetida)
  end if;

  select coalesce(max(position), 0) + 1 into v_next_position
  from public.matchdeal_responsibility_queue
  where match_id = v_match_id;

  insert into public.matchdeal_responsibility_queue (match_id, investor_profile_id, position, status)
  values (v_match_id, p_investor_profile_id, v_next_position, 'waiting');

  insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
  values (v_match_id, null, 'system',
    'Esta startup já está em contacto com um colega da tua equipa através do MatchDeal. Se o processo não avançar, a pasta passa automaticamente para ti.');

  return v_match_id;
end;
$$;


-- =======================================================================
-- (c) consentimento de partilha do data room
-- =======================================================================
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
end;
$$;


-- =======================================================================
-- (d) SLA — ações que mantêm/renovam o relógio
-- =======================================================================

-- Chamar sempre que o investidor responsável ativo envia mensagem ou
-- propõe reunião — conta como "ação mensurável" e pode renovar o relógio
-- quantas vezes for preciso, ao contrário do botão "continuo interessado".
create or replace function public.matchdeal_record_investor_action(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.matchdeal_responsibility_queue
    set sla_deadline = now() + interval '7 days'
    where match_id = p_match_id and status = 'active';
end;
$$;

-- Botão "continuo interessado" — só pode ser usado UMA vez por match, para
-- não permitir reset indefinido do relógio sem progresso real.
create or replace function public.matchdeal_investor_still_interested(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_already_used boolean;
begin
  select used_still_interested_reset into v_already_used
  from public.matchdeal_responsibility_queue
  where match_id = p_match_id and status = 'active';

  if v_already_used then
    raise exception 'Este botão só pode ser usado uma vez por match — envia uma mensagem ou propõe uma reunião em vez disso.';
  end if;

  update public.matchdeal_responsibility_queue
    set sla_deadline = now() + interval '7 days', used_still_interested_reset = true
    where match_id = p_match_id and status = 'active';
end;
$$;

-- Botão da startup "este investidor não me respondeu" — só disponível
-- 48h depois da concessão de acesso ao data room.
create or replace function public.matchdeal_startup_report_no_response(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_granted_at timestamptz;
begin
  select dataroom_granted_at into v_granted_at
  from public.matchdeal_matches
  where id = p_match_id;

  if v_granted_at is null then
    raise exception 'Ainda não há acesso ao data room concedido neste match.';
  end if;

  if now() < v_granted_at + interval '48 hours' then
    raise exception 'Só é possível reportar falta de resposta 48h depois da concessão de acesso.';
  end if;

  perform public.matchdeal_reassign_next(p_match_id);
end;
$$;


-- =======================================================================
-- (e) reatribuição em cascata
-- =======================================================================
create or replace function public.matchdeal_reassign_next(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_next record;
begin
  update public.matchdeal_responsibility_queue
    set status = 'expired'
    where match_id = p_match_id and status = 'active';

  select * into v_next
  from public.matchdeal_responsibility_queue
  where match_id = p_match_id and status = 'waiting'
  order by position asc
  limit 1;

  if v_next.id is null then
    -- Fila esgotada — nenhum investidor desta entidade acompanhou a tempo.
    update public.matchdeal_matches
      set status = 'expired_no_followup', cooldown_until = now() + interval '90 days', updated_at = now()
      where id = p_match_id;

    insert into public.matchdeal_match_events (match_id, event_type)
    values (p_match_id, 'expired');

    insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
    values (p_match_id, null, 'system',
      'Nenhum investidor desta equipa deu seguimento a tempo. O processo foi encerrado.');
    return;
  end if;

  update public.matchdeal_responsibility_queue
    set status = 'active', became_active_at = now(), sla_deadline = now() + interval '7 days'
    where id = v_next.id;

  update public.matchdeal_matches
    set active_investor_profile_id = v_next.investor_profile_id, updated_at = now()
    where id = p_match_id;

  insert into public.matchdeal_match_events (match_id, event_type, payload)
  values (p_match_id, 'reassigned', jsonb_build_object('new_active_investor_profile_id', v_next.investor_profile_id));

  insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
  values (p_match_id, null, 'system',
    'O acompanhamento deste processo passou para um novo investidor da equipa.');
end;
$$;

-- Varrimento periódico — chamar a partir de um cron (pg_cron ou Edge
-- Function agendada) a cada, por exemplo, 15 minutos.
create or replace function public.matchdeal_sweep_sla_timeouts()
returns int
language plpgsql
security definer
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select match_id from public.matchdeal_responsibility_queue
    where status = 'active' and sla_deadline is not null and sla_deadline < now()
  loop
    perform public.matchdeal_reassign_next(v_row.match_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


-- =======================================================================
-- (f) baralho de swipe elegível — filtro automático + exposição mínima
-- =======================================================================
-- Devolve até p_limit perfis elegíveis para o viewer, aplicando hard
-- filters (setor, estágio, país, fase, valor de ronda — conforme os
-- critérios do próprio perfil investidor, ou os do perfil startup no
-- sentido inverso), excluindo já vistos, e priorizando quem ainda não foi
-- mostrado esta semana (exposição mínima garantida) antes de ordenar pelo
-- resto de forma aleatória controlada.
create or replace function public.matchdeal_eligible_deck(
  p_viewer_profile_id uuid,
  p_limit int default 20
) returns setof public.matchdeal_profiles
language plpgsql
security definer
as $$
declare
  v_viewer public.matchdeal_profiles;
begin
  select * into v_viewer from public.matchdeal_profiles where id = p_viewer_profile_id;

  return query
  select p.*
  from public.matchdeal_profiles p
  where p.is_visible = true
    and p.kind <> v_viewer.kind
    and p.id not in (
      select target_profile_id from public.matchdeal_swipes where actor_profile_id = p_viewer_profile_id
    )
    and (
      v_viewer.kind = 'investor'
      or p.investment_stage_sought is null -- fallback se o filtro do investidor ainda não estiver preenchido
    )
    -- Hard filters aplicados quando o viewer é investidor (critérios do
    -- investidor vs. perfil da startup):
    and (v_viewer.kind <> 'investor' or v_viewer.sectors = '{}' or p.sectors && v_viewer.sectors)
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.stages_invested,1) is null or p.investment_stage_sought = any(v_viewer.stages_invested))
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.geographies,1) is null or p.country = any(v_viewer.geographies))
    and (v_viewer.kind <> 'investor' or array_length(v_viewer.phases_accepted,1) is null or p.company_phase = any(v_viewer.phases_accepted))
    -- Quando o viewer é startup, o filtro é o inverso: os critérios do
    -- investidor têm de aceitar o perfil da própria startup.
    and (v_viewer.kind <> 'startup' or array_length(p.stages_invested,1) is null or v_viewer.investment_stage_sought = any(p.stages_invested))
    and (v_viewer.kind <> 'startup' or array_length(p.geographies,1) is null or v_viewer.country = any(p.geographies))
    and (v_viewer.kind <> 'startup' or array_length(p.phases_accepted,1) is null or v_viewer.company_phase = any(p.phases_accepted))
    -- Bloqueio de cooldown: não mostrar entidades/startups com match
    -- recusado ou expirado ainda dentro do período de pausa. O cooldown é
    -- ao nível da ENTIDADE, não da pessoa — por isso resolve-se o
    -- catalog_entity_id do perfil investidor de cada lado (via o vínculo
    -- provisório de 0001) em vez de comparar membership_id diretamente.
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
    )) desc, -- não mostrados esta semana entram primeiro (exposição mínima garantida)
    random()
  limit p_limit;
end;
$$;

comment on function public.matchdeal_eligible_deck is
  'Filtro automático (hard filters) + exposição mínima garantida (secção 2 da spec). Registar cada card devolvida em matchdeal_exposures a partir do cliente, para o cálculo de "não mostrado esta semana" funcionar corretamente.';
