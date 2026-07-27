-- MatchDeal — migração 0001: tabelas core
--
-- AJUSTADO CONTRA O SCHEMA REAL (wkjcaoqdvhykrfacsylr), confirmado via REST
-- em 2026-07-27 (org_members lido, public.memberships confirmado
-- inexistente — 404 PGRST205). Correções aplicadas, vinculativas por
-- decisão do Motor B (sessão "Investors Relations"):
--
-- 1. `membership_id` (matchdeal_profiles, matchdeal_device_links) é um
--    âncora POLIMÓRFICO, sem FK única possível (Postgres não suporta FK
--    condicional por valor de outra coluna):
--      kind='startup'  → org_members.org_id (o founder controla o perfil
--                         através da sua membership no org — org_members
--                         não tem PK própria, a chave é o par
--                         (org_id, user_id), por isso usa-se org_id).
--      kind='investor' → matchdeal_investor_members.id (tabela provisória
--                         criada NESTE ficheiro, mais abaixo — não há hoje
--                         nenhum vínculo pessoa→entidade investidora no
--                         Sherlock Deal; a Fase 0 do Investor Workspace vai
--                         trazer o modelo definitivo). Sem FK direta pela
--                         mesma razão.
--    A resolução de "que anchor_ids controla o utilizador atual" fica em
--    matchdeal_current_membership_ids() (0003), que faz UNION dos dois
--    lados — mantém o resto do RLS/funções inalterado.
--
-- 2. `investor_entity_membership_id` (matchdeal_matches) nunca deve
--    apontar para `public.entities` — essa tabela é o pipeline PRIVADO de
--    investidores de cada org founder (RLS por org), não a entidade
--    investidora global. A âncora correta é `catalog_entities` (camada
--    global da plataforma) — coluna renomeada para
--    `investor_catalog_entity_id`, agora com FK real (catalog_entities já
--    existe em produção).
--
-- Princípio inegociável, inalterado: esta migração é 100% aditiva. Nunca
-- altera, remove nem faz drop de nada que já exista para o Sherlock Deal.
-- Todas as tabelas novas usam o prefixo matchdeal_ para nunca colidir com o
-- schema existente.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PROVISÓRIA — vínculo pessoa → entidade investidora.
--
-- Hoje o Sherlock Deal não tem contas de investidor: o role `investor`
-- resolve-se em runtime por access_grants (portal de data room), que é uma
-- permissão de leitura escopada ao org de UM founder, não uma identidade
-- autónoma. Não existe, em lado nenhum, um vínculo pessoa→entidade
-- investidora.
--
-- Esta tabela cria esse vínculo de forma mínima para o MatchDeal poder
-- existir em código e schema. O lado investidor da app fica ATRÁS DE
-- FEATURE FLAG (desligado) até a Fase 0 do Investor Workspace (claim +
-- verificação de afiliação) trazer o modelo definitivo — altura em que esta
-- tabela é substituída ou absorvida. Está desenhada para ser descartável:
-- nada no schema existente depende dela.
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_investor_members (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  catalog_entity_id  uuid not null references public.catalog_entities(id),
  -- 'revoked' em vez de apagar a linha: quando a Fase 0 trouxer o fluxo real
  -- de claim/verificação, o histórico de quem esteve associado a que entidade
  -- é exactamente o que se precisa para auditar uma disputa de afiliação.
  status             text not null default 'active' check (status in ('active','revoked')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, catalog_entity_id)
);
create index if not exists matchdeal_investor_members_entity_idx
  on public.matchdeal_investor_members (catalog_entity_id);

-- ---------------------------------------------------------------------
-- Perfis (startup ou investidor), 1:1 com uma membership já existente no
-- Sherlock Deal (startup) ou com um vínculo provisório de investidor (0004).
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_profiles (
  id                        uuid primary key default gen_random_uuid(),
  -- Âncora polimórfica — ver nota 1 no topo. kind='startup' → orgs.id (via
  -- org_members.org_id); kind='investor' → matchdeal_investor_members.id.
  membership_id             uuid not null,
  kind                      text not null check (kind in ('startup', 'investor')),
  -- plan_tier NÃO se declara aqui — é a migração 0004 que o acrescenta, com
  -- os valores reais 'tier_a'/'tier_b'/'tier_c' e o comentário que os liga
  -- aos nomes de plano da spec §13. (Uma versão anterior deste ficheiro
  -- declarava plan_tier ('A'/'B'/'C') por minha conta, antes de eu ter o
  -- 0004 real; ficaria em conflito com o check constraint dele.)
  is_complete               boolean not null default false,
  is_visible                boolean not null default false,

  photo_url                 text,
  website                   text,
  sectors                   text[] not null default '{}',
  country                   text,
  description               text,

  -- campos específicos de startup
  target_round_amount       numeric,
  investment_stage_sought   text check (investment_stage_sought in ('pre_seed','seed','series_a','series_b_plus','growth')),
  company_phase             text check (company_phase in ('concept','prototype','pilot','launch','growth')),
  founded_year              int,
  intellectual_property     text,
  revenue                   text,
  team_summary              text,
  pitch_deck_url            text,
  gallery_urls              text[] not null default '{}',
  contact                   text,

  -- campos específicos de investidor
  representative_name       text,
  entity_name                text,
  entity_logo_url            text,
  entity_type                text check (entity_type in ('vc','corporate_vc','family_office','angel_network','venture_studio','public_institutional')),
  representative_linkedin    text,
  stages_invested             text[] not null default '{}',
  phases_accepted             text[] not null default '{}',
  geographies                 text[] not null default '{}',
  company_types                text[] not null default '{}',
  specific_criteria             text,
  ticket_min                   numeric,
  ticket_max                   numeric,
  lead_or_colead                text check (lead_or_colead in ('lead','co_lead')),
  instruments                    text[] not null default '{}',
  active_fund                    text,
  portfolio_companies            text,
  recent_investments              text,
  -- NUNCA exposto à startup na UI — só uso interno (ver docs/ARCHITECTURE.md)
  preferred_contact_channel        text check (preferred_contact_channel in ('form','email','linkedin','introduction','event')),

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  unique (membership_id, kind)
);

comment on column public.matchdeal_profiles.preferred_contact_channel is
  'Nunca mostrar à startup na UI. Dado interno para otimização do acompanhamento — tem de constar na política de privacidade como finalidade de tratamento, mesmo não sendo visível no ecrã.';

-- ---------------------------------------------------------------------
-- Registo de cada exposição de um candidato no baralho de swipe, usado
-- para garantir exposição mínima (secção 2 da spec) sem repetir sempre os
-- perfis mais "fortes".
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_exposures (
  id                uuid primary key default gen_random_uuid(),
  viewer_profile_id uuid not null references public.matchdeal_profiles(id) on delete cascade,
  shown_profile_id  uuid not null references public.matchdeal_profiles(id) on delete cascade,
  shown_at          timestamptz not null default now()
);
create index if not exists matchdeal_exposures_viewer_idx on public.matchdeal_exposures (viewer_profile_id, shown_at desc);

-- ---------------------------------------------------------------------
-- Swipes
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_swipes (
  id                 uuid primary key default gen_random_uuid(),
  actor_profile_id   uuid not null references public.matchdeal_profiles(id) on delete cascade,
  target_profile_id  uuid not null references public.matchdeal_profiles(id) on delete cascade,
  direction          text not null check (direction in ('like', 'pass')),
  created_at         timestamptz not null default now(),
  unique (actor_profile_id, target_profile_id)
);
create index if not exists matchdeal_swipes_target_idx on public.matchdeal_swipes (target_profile_id, direction);

-- ---------------------------------------------------------------------
-- Matches — Startup × Entidade investidora (não Startup × Pessoa).
-- Um par (startup, entidade) só pode ter UM match "aberto" de cada vez
-- (pending_consent ou active); matches fechados (recusado/expirado) ficam
-- como histórico e um novo swipe, depois do período de pausa, cria uma
-- NOVA linha em vez de reescrever a antiga — preserva histórico completo,
-- na mesma disciplina de "nunca apagar, só suceder" já usada no Company
-- Canon do Sherlock Deal.
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_matches (
  id                              uuid primary key default gen_random_uuid(),
  startup_profile_id              uuid not null references public.matchdeal_profiles(id) on delete cascade,
  -- Âncora da entidade investidora: catalog_entities (camada global), NUNCA
  -- entities (pipeline privado de cada org founder) — ver nota 2 no topo.
  investor_catalog_entity_id      uuid not null references public.catalog_entities(id),
  status                          text not null check (status in ('pending_consent','declined_by_startup','active','expired_no_followup','closed_by_startup')),
  active_investor_profile_id      uuid references public.matchdeal_profiles(id),
  dataroom_granted_at             timestamptz,
  cooldown_until                  timestamptz,
  superseded_from_match_id        uuid references public.matchdeal_matches(id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Só pode existir um match "aberto" por par (startup, entidade) de cada vez.
create unique index if not exists matchdeal_one_open_match_per_pair
  on public.matchdeal_matches (startup_profile_id, investor_catalog_entity_id)
  where status in ('pending_consent', 'active');

create index if not exists matchdeal_matches_startup_idx on public.matchdeal_matches (startup_profile_id);
create index if not exists matchdeal_matches_entity_idx on public.matchdeal_matches (investor_catalog_entity_id);

-- Log de auditoria — cada evento relevante do ciclo de vida do match.
create table if not exists public.matchdeal_match_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matchdeal_matches(id) on delete cascade,
  event_type  text not null, -- 'created' | 'consent_granted' | 'consent_declined' | 'reassigned' | 'expired' | 'closed_by_startup'
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fila de responsabilidade por match (vários investidores da mesma
-- entidade podem estar em fila).
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_responsibility_queue (
  id                            uuid primary key default gen_random_uuid(),
  match_id                      uuid not null references public.matchdeal_matches(id) on delete cascade,
  investor_profile_id           uuid not null references public.matchdeal_profiles(id) on delete cascade,
  position                      int not null,
  status                        text not null check (status in ('waiting','active','expired','declined')),
  joined_at                     timestamptz not null default now(),
  became_active_at              timestamptz,
  sla_deadline                  timestamptz,
  used_still_interested_reset   boolean not null default false,
  unique (match_id, investor_profile_id),
  unique (match_id, position)
);
create index if not exists matchdeal_queue_match_idx on public.matchdeal_responsibility_queue (match_id, position);

-- ---------------------------------------------------------------------
-- Consentimento de partilha do data room (uma decisão por match/ciclo).
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_dataroom_consent (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references public.matchdeal_matches(id) on delete cascade,
  granted          boolean not null,
  decline_reason   text,
  decided_at       timestamptz not null default now(),
  unique (match_id)
);

-- ---------------------------------------------------------------------
-- Mensagens (sistema + livres)
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_messages (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.matchdeal_matches(id) on delete cascade,
  sender_profile_id  uuid references public.matchdeal_profiles(id), -- null = mensagem de sistema
  kind               text not null check (kind in ('system','user','meeting_proposal')),
  body               text not null,
  created_at         timestamptz not null default now()
);
create index if not exists matchdeal_messages_match_idx on public.matchdeal_messages (match_id, created_at);

-- ---------------------------------------------------------------------
-- Propostas de reunião
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_meeting_proposals (
  id                       uuid primary key default gen_random_uuid(),
  match_id                 uuid not null references public.matchdeal_matches(id) on delete cascade,
  proposed_by_profile_id   uuid not null references public.matchdeal_profiles(id),
  proposed_slots           timestamptz[] not null default '{}',
  confirmed_slot           timestamptz,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pareamento de dispositivo via QR (estilo WhatsApp Web, ao contrário: o
-- telemóvel liga-se à sessão já autenticada no browser).
-- ---------------------------------------------------------------------
create table if not exists public.matchdeal_device_links (
  id              uuid primary key default gen_random_uuid(),
  pairing_token   text not null unique,
  -- Preenchido pela Edge Function quando o browser confirma o pareamento.
  -- Mesma âncora polimórfica de matchdeal_profiles.membership_id (nota 1).
  membership_id   uuid,
  -- Guardado para a Edge Function poder emitir a sessão do utilizador certo
  -- sem ter de re-resolver o membership a partir do token.
  user_id         uuid references auth.users(id) on delete cascade,
  device_id       text,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists matchdeal_device_links_token_idx on public.matchdeal_device_links (pairing_token);
