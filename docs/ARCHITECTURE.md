# MatchDeal — Arquitetura (v1)

Ver a spec de produto completa em `claude/matchdeal_spec_v1_20260727.md` no
Project "Investors Relations" (Claude). Este documento cobre só as decisões
técnicas de implementação.

## Stack

React Native + Expo (TypeScript). Ligação direta ao **mesmo** projeto
Supabase do Sherlock Deal (`wkjcaoqdvhykrfacsylr`) — nunca um projeto novo.
Ver `claude/matchdeal_spec_v1_20260727.md` §9 para a justificação.

## Estrutura

```
matchdeal/
  App.tsx
  src/
    lib/supabase.ts        cliente Supabase (URL/anon key vêm de app.json > expo.extra)
    lib/options.ts          listas de opções partilhadas pelos formulários
    theme/colors.ts         paleta teal/mint reaproveitada do Sherlock Deal
    types/database.ts       tipos TS alinhados com as migrações SQL
    navigation/             stack raiz + tabs (Matches / Swipe / Mensagens)
    hooks/                  useAuthSession, useSwipeDeck, useMatches, useChat
    screens/
      pairing/              QR pairing (associação à conta SherlockDeal)
      onboarding/            formulários de perfil startup/investidor
      swipe/                 baralho de swipe + card de perfil por scroll
      matches/               lista de matches + detalhe (consentimento, fila)
      messages/              lista de conversas + chat + proposta de reunião
  supabase/migrations/
    0001_matchdeal_core.sql       tabelas (todas com prefixo matchdeal_)
    0002_matchdeal_functions.sql  lógica de negócio (swipe, match, fila, SLA)
    0003_matchdeal_rls.sql        RLS
```

## Pontos que PRECISAM de confirmação contra o schema real antes do deploy

Esta sessão (Cowork, cloud) não tem acesso de leitura ao Supabase real do
Sherlock Deal — o schema abaixo foi inferido da documentação de produto, não
verificado com `information_schema`. Antes de aplicar as migrações em
produção, confirmar e ajustar:

1. **`matchdeal_current_membership_ids()`** (0003) assume
   `public.memberships(id, user_id)`. Ajustar para os nomes reais.
2. **`matchdeal_profiles.membership_id`** e
   **`matchdeal_matches.investor_entity_membership_id`** assumem que existe
   uma forma de ir de uma membership individual (pessoa) até à entidade/VC
   "mãe" que agrupa vários investidores. Se o schema já tiver esse conceito
   (ex.: `entities.id` como FK a partir de `memberships.entity_id`), a
   função `matchdeal_handle_mutual_match` em 0002 tem de ler esse campo em
   vez de usar `membership_id` diretamente (está comentado no código onde
   mudar).
3. **Emissão de sessão Supabase Auth no pareamento QR** — a troca do
   `pairing_token` por uma sessão real (magic link / custom token) requer a
   service role key, que nunca deve estar no cliente mobile. Isto tem de
   ser uma Edge Function ou endpoint no Next.js do Sherlock Deal chamado
   pelo browser quando confirma o pareamento — **não implementado neste
   scaffold**, ver TODO em `QRPairingScreen.tsx`.
4. **Importação automática de dados da empresa/entidade no pareamento** —
   também fica do lado dessa mesma Edge Function/endpoint (preenche a
   primeira versão de `matchdeal_profiles` a partir dos dados já existentes
   do Sherlock Deal).
5. **Upload de foto de perfil, logótipo, pitch deck e até 5 imagens** — os
   formulários (`StartupProfileForm`, `InvestorProfileForm`) têm campos
   para os URLs mas não incluem ainda o componente de upload
   (`expo-image-picker` + Supabase Storage) — ficheiro pequeno de adicionar,
   omitido para não sobrecarregar o scaffold inicial.
6. **`matchdeal_sweep_sla_timeouts()`** precisa de ser chamada
   periodicamente (pg_cron a cada ~15 min, ou uma Edge Function agendada) —
   não está agendada automaticamente por esta migração.
7. **Notificações push** (Expo push) para "é um match!", pedido de
   consentimento, reatribuição, etc. — não implementadas neste scaffold;
   pontos de disparo (`insert` em `matchdeal_messages` de tipo `system`)
   já existem no lado do banco, falta a função que os transforma em push.
8. **Deteção de sobreposição de disponibilidade** na proposta de reunião —
   a v1 do scaffold só regista `proposed_slots`; falta a função que compara
   as propostas dos dois lados e escreve `confirmed_slot` quando há
   coincidência.

## Segurança e guardrails

- Todas as tabelas novas usam o prefixo `matchdeal_` — nunca colidem com o
  schema existente.
- Todas as migrações são aditivas — nenhuma altera, remove ou faz drop de
  tabelas/colunas existentes do Sherlock Deal.
- `preferred_contact_channel` (investidor) nunca é lido pelos ecrãs
  virados para a startup — só usado internamente.
- RLS ativo em todas as tabelas novas desde a primeira migração.
