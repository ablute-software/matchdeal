-- MatchDeal — migração 0003: RLS
--
-- AJUSTADO CONTRA O SCHEMA REAL: `public.memberships` NÃO EXISTE (404
-- PGRST205 confirmado via REST em 2026-07-27). O real é `org_members`, que
-- não tem PK própria — a chave é o par (org_id, user_id).
--
-- `matchdeal_current_membership_ids()` é o ÚNICO ponto de contacto de
-- leitura com o schema existente. Devolve a UNIÃO das duas âncoras
-- possíveis (ver nota 1 em 0001):
--   - lado startup:    org_members.org_id do utilizador atual
--   - lado investidor: matchdeal_investor_members.id do utilizador atual
-- Assim todo o resto do RLS abaixo fica inalterado.
--
-- Princípio: uma tabela nasce com RLS e sem policy devolve zero linhas,
-- não erro — o mesmo alerta que já está registado em
-- claude/connectB_db_diagnostico_20260726.md para o resto do produto.
-- Todas as tabelas abaixo ficam com RLS ativo e pelo menos uma policy.

create or replace function public.matchdeal_current_membership_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select org_id from public.org_members where user_id = auth.uid()
  union
  -- status='active' é obrigatório: um vínculo revogado não pode continuar a
  -- dar acesso aos perfis/matches da entidade. Como esta função alimenta
  -- TODAS as policies abaixo, o filtro aqui revoga o acesso em todo o
  -- produto de uma vez — e é por isso que a linha se revoga em vez de se
  -- apagar (ver comentário da tabela em 0001).
  select id from public.matchdeal_investor_members
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.matchdeal_current_profile_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select id from public.matchdeal_profiles
  where membership_id in (select public.matchdeal_current_membership_ids());
$$;

alter table public.matchdeal_investor_members enable row level security;
alter table public.matchdeal_profiles enable row level security;
alter table public.matchdeal_exposures enable row level security;
alter table public.matchdeal_swipes enable row level security;
alter table public.matchdeal_matches enable row level security;
alter table public.matchdeal_match_events enable row level security;
alter table public.matchdeal_responsibility_queue enable row level security;
alter table public.matchdeal_dataroom_consent enable row level security;
alter table public.matchdeal_messages enable row level security;
alter table public.matchdeal_meeting_proposals enable row level security;
alter table public.matchdeal_device_links enable row level security;

-- Vínculo de investidor: cada um lê só o(s) seu(s). A ESCRITA não tem
-- policy — o vínculo só se cria por service role (Edge Function), nunca
-- por auto-declaração do cliente, senão qualquer utilizador autenticado
-- podia declarar-se membro de qualquer VC do catálogo. Na Fase 0 isto passa
-- a depender do fluxo real de verificação de afiliação.
drop policy if exists matchdeal_investor_members_select_own on public.matchdeal_investor_members;
create policy matchdeal_investor_members_select_own on public.matchdeal_investor_members
  for select using (user_id = auth.uid());

-- Perfis: qualquer perfil visível pode ser lido (é isso que alimenta o
-- baralho de swipe do lado oposto); só o dono pode escrever no seu.
drop policy if exists matchdeal_profiles_select_visible on public.matchdeal_profiles;
create policy matchdeal_profiles_select_visible on public.matchdeal_profiles
  for select using (is_visible = true or membership_id in (select public.matchdeal_current_membership_ids()));

-- A escrita valida a âncora POR KIND, não apenas a pertença ao conjunto
-- unificado: sem isto, um founder (cujo org_id está no conjunto) podia
-- criar um perfil kind='investor' ancorado ao próprio org e entrar no
-- baralho como investidor.
drop policy if exists matchdeal_profiles_write_own on public.matchdeal_profiles;
create policy matchdeal_profiles_write_own on public.matchdeal_profiles
  for all using (membership_id in (select public.matchdeal_current_membership_ids()))
  with check (
    (kind = 'startup' and membership_id in (
      select org_id from public.org_members where user_id = auth.uid()))
    or
    (kind = 'investor' and membership_id in (
      select id from public.matchdeal_investor_members where user_id = auth.uid()))
  );

-- Exposições: só o próprio viewer lê/escreve o seu registo de exposição.
drop policy if exists matchdeal_exposures_own on public.matchdeal_exposures;
create policy matchdeal_exposures_own on public.matchdeal_exposures
  for all using (viewer_profile_id in (select public.matchdeal_current_profile_ids()))
  with check (viewer_profile_id in (select public.matchdeal_current_profile_ids()));

-- Swipes: só o autor do swipe o lê/escreve.
drop policy if exists matchdeal_swipes_own on public.matchdeal_swipes;
create policy matchdeal_swipes_own on public.matchdeal_swipes
  for all using (actor_profile_id in (select public.matchdeal_current_profile_ids()))
  with check (actor_profile_id in (select public.matchdeal_current_profile_ids()));

-- Matches: visível a quem for a startup ou a qualquer investidor com uma
-- entrada na fila de responsabilidade desse match.
drop policy if exists matchdeal_matches_participants on public.matchdeal_matches;
create policy matchdeal_matches_participants on public.matchdeal_matches
  for select using (
    startup_profile_id in (select public.matchdeal_current_profile_ids())
    or id in (
      select match_id from public.matchdeal_responsibility_queue
      where investor_profile_id in (select public.matchdeal_current_profile_ids())
    )
  );

-- Escrita em matchdeal_matches só através das funções SECURITY DEFINER
-- (0002) — sem policy de insert/update direta para clientes.

drop policy if exists matchdeal_match_events_participants on public.matchdeal_match_events;
create policy matchdeal_match_events_participants on public.matchdeal_match_events
  for select using (
    match_id in (
      select id from public.matchdeal_matches m
      where m.startup_profile_id in (select public.matchdeal_current_profile_ids())
        or m.id in (
          select match_id from public.matchdeal_responsibility_queue
          where investor_profile_id in (select public.matchdeal_current_profile_ids())
        )
    )
  );

drop policy if exists matchdeal_queue_participants on public.matchdeal_responsibility_queue;
create policy matchdeal_queue_participants on public.matchdeal_responsibility_queue
  for select using (
    investor_profile_id in (select public.matchdeal_current_profile_ids())
    or match_id in (
      select id from public.matchdeal_matches
      where startup_profile_id in (select public.matchdeal_current_profile_ids())
    )
  );

drop policy if exists matchdeal_consent_participants on public.matchdeal_dataroom_consent;
create policy matchdeal_consent_participants on public.matchdeal_dataroom_consent
  for select using (
    match_id in (
      select id from public.matchdeal_matches m
      where m.startup_profile_id in (select public.matchdeal_current_profile_ids())
        or m.id in (
          select match_id from public.matchdeal_responsibility_queue
          where investor_profile_id in (select public.matchdeal_current_profile_ids())
        )
    )
  );
-- Só a própria startup decide o consentimento — escrita restringida a
-- membership da startup (validação adicional feita dentro da função RPC).
drop policy if exists matchdeal_consent_startup_writes on public.matchdeal_dataroom_consent;
create policy matchdeal_consent_startup_writes on public.matchdeal_dataroom_consent
  for insert with check (
    match_id in (
      select id from public.matchdeal_matches
      where startup_profile_id in (select public.matchdeal_current_profile_ids())
    )
  );

drop policy if exists matchdeal_messages_participants on public.matchdeal_messages;
create policy matchdeal_messages_participants on public.matchdeal_messages
  for select using (
    match_id in (
      select id from public.matchdeal_matches m
      where m.startup_profile_id in (select public.matchdeal_current_profile_ids())
        or m.active_investor_profile_id in (select public.matchdeal_current_profile_ids())
    )
  );
drop policy if exists matchdeal_messages_insert_active_participants on public.matchdeal_messages;
create policy matchdeal_messages_insert_active_participants on public.matchdeal_messages
  for insert with check (
    -- só pode escrever mensagem livre quem for a startup do match ou o
    -- investidor atualmente ativo; mensagens de sistema (sender null)
    -- inserem-se sempre via função SECURITY DEFINER, não diretamente.
    sender_profile_id in (select public.matchdeal_current_profile_ids())
    and match_id in (
      select id from public.matchdeal_matches m
      where m.status = 'active'
        and (
          m.startup_profile_id in (select public.matchdeal_current_profile_ids())
          or m.active_investor_profile_id in (select public.matchdeal_current_profile_ids())
        )
    )
  );

drop policy if exists matchdeal_meetings_participants on public.matchdeal_meeting_proposals;
create policy matchdeal_meetings_participants on public.matchdeal_meeting_proposals
  for all using (
    match_id in (
      select id from public.matchdeal_matches m
      where m.startup_profile_id in (select public.matchdeal_current_profile_ids())
        or m.active_investor_profile_id in (select public.matchdeal_current_profile_ids())
    )
  )
  with check (
    proposed_by_profile_id in (select public.matchdeal_current_profile_ids())
  );

-- Device links: qualquer sessão autenticada pode criar um pedido de
-- pareamento (o token é que garante segurança, não a policy); só o
-- membership dono pode ler o resultado depois de confirmado.
drop policy if exists matchdeal_device_links_insert on public.matchdeal_device_links;
create policy matchdeal_device_links_insert on public.matchdeal_device_links
  for insert with check (true);
drop policy if exists matchdeal_device_links_select_own on public.matchdeal_device_links;
create policy matchdeal_device_links_select_own on public.matchdeal_device_links
  for select using (membership_id in (select public.matchdeal_current_membership_ids()) or membership_id is null);
drop policy if exists matchdeal_device_links_update_own on public.matchdeal_device_links;
create policy matchdeal_device_links_update_own on public.matchdeal_device_links
  for update using (membership_id in (select public.matchdeal_current_membership_ids()) or membership_id is null);
