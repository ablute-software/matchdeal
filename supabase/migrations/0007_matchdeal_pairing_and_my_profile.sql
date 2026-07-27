-- MatchDeal — migração 0007: colunas de handoff para o pareamento QR + RPC
-- matchdeal_my_profile() para o cliente resolver o seu próprio perfil sem
-- depender de user_metadata (aditivo apenas, só toca em tabelas do próprio
-- MatchDeal).
--
-- Porquê estas colunas. O telemóvel não tem sessão nenhuma até o pareamento
-- terminar — só conhece o pairing_token que ele próprio gerou. A Edge
-- Function de pareamento corre do lado do browser (já autenticado como
-- founder) e precisa de entregar de volta ao telemóvel, ainda anónimo, o
-- suficiente para ele próprio estabelecer uma sessão real. Em vez de um
-- deep link (frágil — ver nota de metodologia sobre generateLink/navegação
-- direta não sincronizar cookies de forma fiável), o handoff passa por esta
-- própria linha, que o telemóvel já sabe consultar (polling existente em
-- QRPairingScreen): a Edge Function guarda ali um email + um OTP de uso
-- único (Supabase `generateLink` tipo magiclink), e o telemóvel troca-o por
-- uma sessão real com `auth.verifyOtp` — chamada direta ao SDK, não
-- navegação de URL.
--
-- Porque é que isto NÃO abre uma falha de RLS: a policy de select já
-- existente (`membership_id is null or membership_id in (...)`) continua a
-- ser o único portão. A Edge Function propositadamente NÃO define
-- membership_id (deixa-o null) — é o PRÓPRIO telemóvel, depois de já ter
-- sessão real, que o define a si mesmo via `matchdeal_device_links_update_own`
-- (também já existente). Nenhuma policy nova, nenhum alargamento de acesso:
-- o mesmo "o token é que garante segurança, não a policy" já documentado em
-- 0003 para o insert, agora aplicado ao select do handoff.

alter table public.matchdeal_device_links
  add column if not exists session_email text,
  add column if not exists session_email_otp text;

comment on column public.matchdeal_device_links.session_email_otp is
  'OTP de uso único (Supabase generateLink) para o telemóvel trocar por uma sessão real via auth.verifyOtp. O próprio telemóvel deve limpar esta coluna (set null) depois de a usar, como defesa em profundidade — o OTP já é de uso único do lado do Supabase Auth, isto é só para não deixar o valor parado na tabela.';

-- ---------------------------------------------------------------------
-- matchdeal_my_profile() — substitui a leitura de
-- session.user.user_metadata.membership_id que o scaffold assumia (marcada
-- como TODO em useAuthSession.tsx: "ajustar conforme o schema real for
-- confirmado"). Esse metadata nunca é escrito em lado nenhum para uma conta
-- de founder que já existe desde antes do MatchDeal — dependia de um passo
-- que nunca acontece. Resolve-se em vez disso pelo mesmo caminho que já
-- serve todo o RLS: matchdeal_current_profile_ids().
-- ---------------------------------------------------------------------
create or replace function public.matchdeal_my_profile()
returns public.matchdeal_profiles
language sql stable security definer as $$
  select * from public.matchdeal_profiles
  where id in (select public.matchdeal_current_profile_ids())
  limit 1;
$$;
