Contexto importante antes de avançarmos: novo projeto, separado do Sherlock Deal
=================================================================================

Vamos integrar em produção um projeto novo chamado **MatchDeal** — uma app
móvel independente, mas associada ao Sherlock Deal (ex-connectB), que já
está **em produção real** em sherlockdeal.com (repo `ablute-software/connectB`,
Supabase `wkjcaoqdvhykrfacsylr`, deploy Vercel `connect-b`).

**Regra mais importante, antes de qualquer coisa técnica**: o MatchDeal é um
projeto novo e separado. Isto significa, especificamente:

- Não alteres, refatores, apagues nem faças novo deploy sobre nada do
  repositório `connectB`. Zero commits nesse repo no âmbito deste trabalho.
- Não toques no projeto Vercel `connect-b` existente nem nas suas variáveis
  de ambiente/configuração de produção.
- O MatchDeal vive num repositório GitHub novo e próprio,
  `ablute-software/matchdeal`.
- O MatchDeal liga-se ao **mesmo projeto Supabase** (`wkjcaoqdvhykrfacsylr`)
  — mas só para **ler** dados já existentes (entidades, contas, membership)
  e para **adicionar tabelas novas**, todas com o prefixo `matchdeal_`.
  Nunca alterar, apagar ou fazer migração destrutiva em tabelas, RLS
  policies ou dados que já existem para o Sherlock Deal.
- Se em qualquer momento achares que precisas de alterar algo que já existe
  no connectB ou no seu schema para o MatchDeal funcionar — **para e
  pergunta primeiro**, não avances sozinho com essa alteração.

O que já está feito (numa sessão Cowork sem acesso a GitHub/Vercel/Supabase
reais — por isso precisa da tua parte agora)
--------------------------------------------

Está construído e entregue em ficheiro (zip) um scaffold completo da app:

- App Expo/React Native TypeScript funcional: navegação (pareamento QR →
  onboarding de perfil → tabs Matches/Swipe/Mensagens → detalhe de match →
  chat), ecrãs de perfil startup e investidor, baralho de swipe com gesto
  de arrastar e scroll do perfil completo antes de decidir, ecrã de match
  com fluxo de consentimento do data room, chat com bloqueio/desbloqueio e
  proposta de reunião.
- Migrações SQL completas (`supabase/migrations/0001` a `0003`): todas as
  tabelas `matchdeal_*`, e a lógica de negócio da fila de responsabilidade
  por VC — primeiro investidor a dar match mútuo fica responsável, os
  colegas seguintes entram em fila por ordem cronológica; SLA de 7 dias
  sem ação mensurável ou botão da startup "não me respondeu" (48h depois
  da concessão) disparam reatribuição em cascata; recusa da startup fecha
  a entidade inteira por 30 dias; fila esgotada fecha por 90 dias; tudo com
  RLS ativo desde a primeira migração.
- `docs/ARCHITECTURE.md` no próprio projeto lista, em detalhe, os pontos
  que foram assumidos sem acesso ao schema real e que **têm de ser
  confirmados/ajustados por ti** antes de aplicar em produção — é a lista
  de trabalho mais importante que vais ter de seguir primeiro.

O que preciso que faças agora (integração)
-------------------------------------------

1. Ler `docs/ARCHITECTURE.md` no projeto entregue — lista 8 pontos que
   dependem do schema real do Supabase (nomes exatos de `memberships`/
   `entities`, o mapeamento pessoa→entidade investidora, emissão de sessão
   no pareamento QR, importação automática de dados no pareamento, upload
   de imagens, agendamento do sweep de SLA, push notifications, deteção de
   sobreposição de disponibilidade). Confirma cada um contra o schema real
   antes de aplicar as migrações.
2. Criar o repositório `ablute-software/matchdeal` e fazer o push deste
   código.
3. Aplicar as três migrações (`0001`, `0002`, `0003`) ao projeto Supabase
   `wkjcaoqdvhykrfacsylr`, depois de ajustares os pontos "CONFIRMAR SCHEMA
   REAL" assinalados nos próprios ficheiros SQL.
4. Configurar um projeto Vercel/EAS próprio (não o `connect-b`) para build
   e distribuição da app — ou apontar-me para o processo correto se
   preferires builds via EAS diretamente.
5. Implementar a peça que falta e está claramente assinalada como TODO: a
   Edge Function (ou endpoint no Next.js do Sherlock Deal) que confirma o
   pareamento QR e emite a sessão Supabase Auth para o dispositivo — isto
   precisa da service role key, que nunca deve estar no cliente mobile.
6. Reportar-me o que encontraste de diferente entre o schema assumido e o
   schema real, antes de avançares com qualquer ajuste que não seja
   puramente mecânico.

Qualquer dúvida sobre intenção de produto (não técnica), a spec completa
está em `claude/matchdeal_spec_v1_20260727.md` no Project "Investors
Relations" — lê-la antes de tomar decisões de UX que não estejam já
implementadas no scaffold.
