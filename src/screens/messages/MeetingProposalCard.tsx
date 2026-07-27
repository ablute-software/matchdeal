import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography, radii } from '@/theme/colors';

/**
 * Fixado no topo do chat assim que este desbloqueia. Cada lado propõe
 * disponibilidade (lista simples de slots ISO); quando há sobreposição, a
 * confirmação é escrita em `confirmed_slot` e aparece automaticamente como
 * mensagem de sistema — a deteção de sobreposição fica do lado do backend
 * (Edge Function ou trigger a acrescentar depois de validar o formato de
 * disponibilidade preferido pelo Nuno; aqui a v1 assume que o utilizador
 * escolhe entre um conjunto pequeno de slots sugeridos pela outra parte).
 */
export function MeetingProposalCard({
  matchId,
  proposerProfileId,
}: {
  matchId: string;
  proposerProfileId: string;
}) {
  const [busy, setBusy] = useState(false);

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
