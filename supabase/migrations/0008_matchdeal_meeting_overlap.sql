-- MatchDeal — migração 0008: deteção de sobreposição de disponibilidade.
--
-- ARCHITECTURE.md, ponto 8: "a v1 só regista proposed_slots, sem função de
-- comparação/confirmação". Esta migração acrescenta essa função.
--
-- Desenho: quando alguém propõe disponibilidade (insere uma linha em
-- matchdeal_meeting_proposals com uma lista de slots ISO), compara-se essa
-- lista com a de todas as OUTRAS propostas já feitas nesse match por
-- alguém diferente. O primeiro slot em comum confirma a reunião nas DUAS
-- linhas envolvidas, e uma mensagem de sistema avisa o chat. Timestamps são
-- comparados ao segundo — a UI (MeetingProposalCard) já sugere sempre
-- horas fixas geradas por `new Date(...).toISOString()`, por isso não há
-- necessidade de arredondar para um intervalo (ex.: hora certa) nesta v1.

create or replace function public.matchdeal_confirm_meeting_overlap()
returns trigger
language plpgsql security definer as $$
declare
  v_other record;
  v_common timestamptz;
begin
  -- Só faz sentido comparar propostas ainda por confirmar.
  if new.confirmed_slot is not null then
    return new;
  end if;

  for v_other in
    select id, proposed_slots
    from public.matchdeal_meeting_proposals
    where match_id = new.match_id
      and proposed_by_profile_id <> new.proposed_by_profile_id
      and confirmed_slot is null
    order by created_at asc
  loop
    select slot into v_common
    from unnest(new.proposed_slots) as slot
    where slot = any(v_other.proposed_slots)
    limit 1;

    if v_common is not null then
      update public.matchdeal_meeting_proposals
        set confirmed_slot = v_common
        where id = new.id;
      update public.matchdeal_meeting_proposals
        set confirmed_slot = v_common
        where id = v_other.id;

      insert into public.matchdeal_messages (match_id, sender_profile_id, kind, body)
      values (new.match_id, null, 'system',
        'Reunião confirmada para ' || to_char(v_common at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC — ambos os lados propuseram essa disponibilidade.');

      exit;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_matchdeal_confirm_meeting_overlap on public.matchdeal_meeting_proposals;
create trigger trg_matchdeal_confirm_meeting_overlap
  after insert on public.matchdeal_meeting_proposals
  for each row execute function public.matchdeal_confirm_meeting_overlap();

comment on function public.matchdeal_confirm_meeting_overlap is
  'Ao inserir uma proposta de disponibilidade, confirma automaticamente a reunião se algum slot coincidir com uma proposta anterior de outro participante no mesmo match. Escreve confirmed_slot nas duas linhas e posta uma mensagem de sistema.';
