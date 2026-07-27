-- MatchDeal — migração 0009: hardening do handoff de pareamento. (Motor B, 27 Jul 2026.)
--
-- O buraco (account takeover): as policies de SELECT e UPDATE de
-- matchdeal_device_links (0003) incluíam `membership_id is null`, para que
-- o telemóvel — ainda anónimo, antes de ter sessão — pudesse ler/selar a
-- sua própria linha de pareamento. Inócuo enquanto a linha só tinha o
-- pairing_token. A partir da 0007, a Edge Function passa a depositar
-- session_email + session_email_otp NESSA MESMA linha para o handoff — e
-- essa policy deixa QUALQUER cliente com a anon key ler/alterar TODAS as
-- linhas pendentes de pareamento de todos os founders, não só a sua
-- própria: `select * from matchdeal_device_links where membership_id is
-- null` em polling apanhava email+OTP alheios e trocava-os por sessão do
-- founder antes do telemóvel legítimo completar o pareamento.
--
-- Correção: RLS não consegue exigir "conhece o token" numa policy (não há
-- forma de comparar contra um valor que o cliente passa na query, só contra
-- o que já está na sessão/linha). Por isso o acesso direto anónimo à tabela
-- é removido inteiramente, e o telemóvel passa a usar dois RPCs SECURITY
-- DEFINER keyed pelo próprio pairing_token — a mesma ideia de sempre ("o
-- token é que garante segurança"), agora aplicada no sítio certo em vez de
-- numa policy que não a consegue expressar.

-- A coluna user_id já existe na base real (visível via schema OpenAPI do
-- PostgREST) mas nenhuma migração anterior a criou — foi acrescentada à
-- mão antes desta migração ser escrita. Reconstituída aqui, aditiva e
-- idempotente, para que 0001→0009 fiquem replay-áveis do zero numa base
-- nova; sem isto, matchdeal_pairing_seal falharia em runtime ao tentar
-- escrever numa coluna que a migração nunca declarou.
alter table public.matchdeal_device_links
  add column if not exists user_id uuid references auth.users(id);

drop policy if exists matchdeal_device_links_select_own on public.matchdeal_device_links;
create policy matchdeal_device_links_select_own on public.matchdeal_device_links
  for select using (
    membership_id in (select public.matchdeal_current_membership_ids())
  );

drop policy if exists matchdeal_device_links_update_own on public.matchdeal_device_links;
create policy matchdeal_device_links_update_own on public.matchdeal_device_links
  for update using (
    membership_id in (select public.matchdeal_current_membership_ids())
  );

-- Poll: devolve o OTP UMA ÚNICA VEZ e limpa-o na mesma transação (FOR
-- UPDATE + update dentro da própria função) — mesmo que o telemóvel faça
-- poll a mais rápido do que o esperado, ou duas abas/instâncias façam poll
-- em paralelo, só uma recebe o OTP.
create or replace function public.matchdeal_pairing_poll(p_pairing_token text)
returns table(status text, session_email text, session_email_otp text)
language plpgsql security definer set search_path = public as $fn$
declare
  v public.matchdeal_device_links;
begin
  select * into v from public.matchdeal_device_links
   where pairing_token = p_pairing_token
   for update;
  if not found then
    return query select 'not_found'::text, null::text, null::text; return;
  end if;
  if v.membership_id is not null or v.used_at is not null then
    return query select 'sealed'::text, null::text, null::text; return;
  end if;
  if v.expires_at < now() then
    return query select 'expired'::text, null::text, null::text; return;
  end if;
  if v.session_email_otp is not null then
    update public.matchdeal_device_links set session_email_otp = null where id = v.id;
    return query select 'ready'::text, v.session_email, v.session_email_otp; return;
  end if;
  return query select 'pending'::text, null::text, null::text;
end;
$fn$;

-- Seal: só chamável com sessão real (auth.uid() not null — o telemóvel já
-- fez verifyOtp antes disto), e só sela uma linha ainda por selar
-- (`membership_id is null` no WHERE, não numa policy).
create or replace function public.matchdeal_pairing_seal(p_pairing_token text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_membership uuid;
begin
  if auth.uid() is null then return false; end if;
  select ids into v_membership from public.matchdeal_current_membership_ids() as ids limit 1;
  if v_membership is null then return false; end if;
  update public.matchdeal_device_links
     set membership_id = v_membership, user_id = auth.uid(), used_at = now(),
         session_email = null, session_email_otp = null
   where pairing_token = p_pairing_token and membership_id is null;
  return found;
end;
$fn$;

revoke all on function public.matchdeal_pairing_poll(text) from public;
revoke all on function public.matchdeal_pairing_seal(text) from public;
grant execute on function public.matchdeal_pairing_poll(text) to anon, authenticated;
grant execute on function public.matchdeal_pairing_seal(text) to authenticated;
