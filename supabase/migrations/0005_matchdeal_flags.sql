-- MatchDeal — migração 0005: feature flags + agendamento do sweep de SLA.
--
-- (Era 0004 numa versão anterior deste ficheiro, escrita antes de eu ter o
-- 0004 real de planos/quotas. Renumerada para 0005 — corre DEPOIS do 0004.)
--
-- Duas peças que fecham o schema:
--
-- 1. Feature flags. A adenda decidiu que o lado INVESTIDOR fica completo em
--    código e schema mas desligado, até a Fase 0 do Investor Workspace criar
--    o vínculo real pessoa→entidade (hoje suprido pela tabela provisória
--    matchdeal_investor_members, ver 0001). A flag vive na base, não no
--    bundle da app, para poder ser ligada sem publicar uma build nova nas
--    lojas — que é precisamente o problema de ter flags em código no mobile.
--
-- 2. Agendamento do sweep de SLA (matchdeal_sweep_sla_timeouts, 0002). Ver
--    a nota no fim do ficheiro: o resultado do bloco condicional diz-nos se
--    o pg_cron está disponível neste plano ou se é preciso a alternativa.

create table if not exists public.matchdeal_flags (
  key         text primary key,
  enabled     boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.matchdeal_flags enable row level security;

-- Leitura pública para qualquer sessão autenticada (a app precisa de saber
-- o que mostrar); escrita só por service role / platform admin.
drop policy if exists matchdeal_flags_read on public.matchdeal_flags;
create policy matchdeal_flags_read on public.matchdeal_flags
  for select using (auth.uid() is not null);
drop policy if exists matchdeal_flags_admin_write on public.matchdeal_flags;
create policy matchdeal_flags_admin_write on public.matchdeal_flags
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

insert into public.matchdeal_flags (key, enabled, note) values
  ('investor_side', false,
   'Lado investidor da app. Off até a Fase 0 do Investor Workspace criar o vínculo verificado pessoa→entidade. Ligar SÓ depois disso.'),
  ('startup_side', true,
   'Lado startup. Ativo: as orgs founder já existem e o perfil Company alimenta o auto-import no pareamento.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Sweep de SLA a cada 15 min. Agenda-se por pg_cron SE a extensão estiver
-- disponível neste plano; o bloco não falha a migração se não estiver —
-- limita-se a avisar, e nesse caso o agendamento faz-se por Edge Function
-- agendada (Supabase cron) em vez disto.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'matchdeal_sla_sweep',
      '*/15 * * * *',
      $cron$select public.matchdeal_sweep_sla_timeouts();$cron$
    );
    raise notice 'MatchDeal: sweep de SLA agendado via pg_cron (*/15 * * * *).';
  else
    raise notice 'MatchDeal: pg_cron INDISPONÍVEL neste projeto — agendar o sweep por Edge Function agendada.';
  end if;
end $$;
