import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography, radii } from '@/theme/colors';

/**
 * Fixado no topo do chat assim que este desbloqueia. Cada lado propõe
 * disponibilidade (lista simples de slots ISO); a deteção de sobreposição
 * é um trigger no backend (matchdeal_confirm_meeting_overlap, migração
 * 0008) — ao inserir uma proposta, compara-a com as das outras partes no
 * mesmo match e, ao encontrar um slot em comum, escreve confirmed_slot nas
 * duas linhas e posta a mensagem de sistema que já aparece no chat. Este
 * componente só precisa de saber se já há uma confirmação para deixar de
 * convidar a novas propostas.
 */
export function MeetingProposalCard({
  matchId,
  proposerProfileId,
}: {
  matchId: string;
  proposerProfileId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmedSlot, setConfirmedSlot] = useState<string | null>(null);

  const checkConfirmed = useCallback(async () => {
    const { data } = await supabase
      .from('matchdeal_meeting_proposals')
      .select('confirmed_slot')
      .eq('match_id', matchId)
      .not('confirmed_slot', 'is', null)
      .limit(1)
      .maybeSingle();
    setConfirmedSlot(data?.confirmed_slot ?? null);
  }, [matchId]);

  useEffect(() => {
    checkConfirmed();
  }, [checkConfirmed]);

  async function proposeNextAvailableSlots() {
    setBusy(true);
    const now = Date.now();
    const slots = [1, 2, 3].map((d) => new Date(now + d * 24 * 60 * 60 * 1000).toISOString());
    await supabase.from('matchdeal_meeting_proposals').insert({
      match_id: matchId,
      proposed_by_profile_id: proposerProfileId,
      proposed_slots: slots,
    });
    await supabase.rpc('matchdeal_record_investor_action', { p_match_id: matchId });
    setBusy(false);
    await checkConfirmed();
  }

  if (confirmedSlot) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Reunião confirmada</Text>
        <Text style={styles.subtitle}>
          {new Date(confirmedSlot).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sugerir reunião</Text>
      <Text style={styles.subtitle}>
        Indica a tua disponibilidade — quando os dois lados tiverem uma data/hora em comum, ela
        aparece automaticamente aqui.
      </Text>
      <Pressable style={styles.button} onPress={proposeNextAvailableSlots} disabled={busy}>
        <Text style={styles.buttonText}>Propor disponibilidade</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardLight,
    borderRadius: radii.md,
    padding: spacing.md,
    margin: spacing.md,
  },
  title: { ...typography.subtitle, color: colors.textOnLight },
  subtitle: { ...typography.caption, color: colors.textOnLightMuted, marginVertical: spacing.xs },
  button: {
    backgroundColor: colors.backgroundDark,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonText: { color: colors.mintAccent, ...typography.body },
});
