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

Reconciliado contra o schema real do Sherlock Deal (`wkjcaoqdvhykrfacsylr`) e
aplicado em produção: migrações `0001`–`0008` correram no SQL Editor
(founder/investidor via `org_members`/`matchdeal_investor_members`, matches
ancorados em `catalog_entities`, planos/quotas, Hype List, End contact,
sobreposição de reuniões). Edge Function de pareamento QR (`matchdeal-pair`)
escrita, bucket `matchdeal` criado. Falta: deploy da Edge Function (`eas`/
`supabase functions deploy` — ver abaixo), o botão/landing/QR no
sherlockdeal.com (prompt connectB próprio, à parte), push notifications, e
troca dos placeholders em `assets/` por artwork real.

## Desenvolvimento local

```
npm install
cp .env.example .env
# editar .env: EXPO_PUBLIC_SUPABASE_ANON_KEY = o mesmo valor de
# NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local do connectB (é a mesma chave
# anon, o mesmo projeto Supabase — não é segredo, mas não fica commitada)
npx expo start
```

As credenciais vêm de `app.config.ts` (variáveis de ambiente), não de
`app.json` — não existe `app.json` neste repo, de propósito.

## Testar no telemóvel

**Caminho rápido — Expo Go (sem build):**

```
npx expo start --tunnel
```

Abre a app **Expo Go** (App Store / Play Store) no telemóvel e digitaliza o
QR que aparece no terminal. `--tunnel` é o que importa: sem ele, o telemóvel
só liga se estiver na mesma rede Wi-Fi que o computador.

**Caminho de build — EAS (gera um `.apk`/`.ipa` instalável, fora do Expo Go):**

```
npm install -g eas-cli
eas login
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <a mesma anon key>
eas build --profile development --platform android   # ou ios
```

O `eas.json` já tem os perfis `development`/`preview`/`production`. A
`EXPO_PUBLIC_SUPABASE_URL` já vem definida no próprio `eas.json` (não é
segredo); só a anon key precisa de ser um EAS secret, para não ficar
commitada em texto simples num ficheiro versionado.

No fim, o EAS dá um link/QR para descarregar o `.apk` (Android) diretamente,
ou (iOS) instrução para o TestFlight/instalação ad-hoc.

## Deploy da Edge Function

```
npx supabase login
npx supabase link --project-ref wkjcaoqdvhykrfacsylr
npx supabase functions deploy matchdeal-pair
```

A função lê `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
das variáveis de ambiente que o próprio Supabase já injeta em toda Edge
Function do projeto — não é preciso configurar nada manualmente.
