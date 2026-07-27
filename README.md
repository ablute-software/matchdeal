# MatchDeal

App móvel (React Native + Expo) — feature extra do Sherlock Deal. Swipe entre
startups e investidores, associada à conta Sherlock Deal existente.

- Spec de produto completa: Project "Investors Relations" →
  `claude/matchdeal_spec_v1_20260727.md`.
- Arquitetura técnica e pontos por confirmar contra o schema real: ver
  `docs/ARCHITECTURE.md`.
- Prompt de integração (para colar na conversa com acesso real a
  GitHub/Vercel/Supabase): ver `docs/INTEGRATION_PROMPT.md`.

## Estado

Scaffold funcional construído fora de produção (sessão Cowork sem acesso a
GitHub/Vercel/Supabase reais). Falta: aplicar as migrações ao Supabase real
depois de confirmar o schema, criar o repositório, configurar variáveis de
ambiente, implementar a Edge Function de pareamento QR, upload de imagens,
push notifications e deploy.

## Desenvolvimento local

```
npm install
npx expo start
```

Antes de correr, preencher `app.json` > `expo.extra.supabaseUrl` /
`supabaseAnonKey` com as credenciais reais (nunca commitar as reais no
histórico — usar `app.config.ts` com variáveis de ambiente em vez do
`app.json` estático assim que a integração avançar).
