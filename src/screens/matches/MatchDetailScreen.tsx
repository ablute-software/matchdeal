import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthSession } from '@/hooks/useAuthSession';
import { colors, spacing, typography, radii } from '@/theme/colors';
import type { MatchDealMatch } from '@/types/database';

/**
 * Ecrã de detalhe do match — mostra o estado, e as ações disponíveis
 * consoante o lado (startup decide o consentimento do data room;
 * investidor vê se é o responsável ativo ou está em fila, e tem o botão
 * "continuo interessado"). O botão "este investidor não me respondeu" da
 * startup fica disponível 48h depois da concessão (validado no servidor
 * pela função matchdeal_startup_report_no_response).
 */
export function MatchDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { profile } = useAuthSession();
  const matchId = route.params.matchId as string;

  const [match, setMatch] = useState<MatchDealMatch | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [matchId]);

  async function load() {
    const { data } = await supabase.from('matchdeal_matches').select('*').eq('id', matchId).maybeSingle();
    setMatch(data as unknown as MatchDealMatch);
  }

  async function decide(granted: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc('matchdeal_decide_dataroom_consent', {
      p_match_id: matchId,
      p_granted: granted,
      p_decline_reason: granted ? null : declineReason || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Não foi possível registar a decisão', error.message);
      return;
    }
    load();
  }

  async function stillInterested() {
    setBusy(true);
    const { error } = await supabase.rpc('matchdeal_investor_still_interested', { p_match_id: matchId });
    setBusy(false);
    if (error) Alert.alert('Não disponível', error.message);
    else load();
  }

  async function reportNoResponse() {
    setBusy(true);
    const { error } = await supabase.rpc('matchdeal_startup_report_no_response', { p_match_id: matchId });
    setBusy(false);
    if (error) Alert.alert('Ainda não disponível', error.message);
    else load();
  }

  if (!match) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.mintAccent} />
      </View>
    );
  }

  const isStartupSide = profile?.kind === 'startup';

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{match.status}</Text>

      {isStartupSide && match.status === 'pending_consent' && (
        <View style={styles.actionCard}>
          <Text style={styles.prompt}>
            Este investidor quer avançar. Autorizas a partilha do data room via Sherlock Deal?
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => decide(true)} disabled={busy}>
            <Text style={styles.primaryButtonText}>Autorizar partilha</Text>
          </Pressable>
          <TextInput
            style={styles.reasonInput}
            placeholder="Se preferires não partilhar agora, podes explicar porquê (opcional)"
            placeholderTextColor={colors.textOnDarkMuted}
            value={declineReason}
            onChangeText={setDeclineReason}
            multiline
          />
          <Pressable style={styles.secondaryButton} onPress={() => decide(false)} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Não partilhar agora</Text>
          </Pressable>
        </View>
      )}

      {isStartupSide && match.status === 'active' && (
        <Pressable style={styles.secondaryButton} onPress={reportNoResponse} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Este investidor não me respondeu</Text>
        </Pressable>
      )}

      {!isStartupSide && match.status === 'active' && match.active_investor_profile_id === profile?.id && (
        <Pressable style={styles.secondaryButton} onPress={stillInterested} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Continuo interessado (renova o prazo uma vez)</Text>
        </Pressable>
      )}

      {match.status === 'active' && (
        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Chat', { matchId })}
        >
          <Text style={styles.primaryButtonText}>Abrir mensagens</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDark, padding: spacing.lg },
  center: { flex: 1, backgroundColor: colors.backgroundDark, alignItems: 'center', justifyContent: 'center' },
  status: { ...typography.title, color: colors.textOnDark, marginBottom: spacing.lg },
  actionCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radii.md, padding: spacing.md },
  prompt: { ...typography.body, color: colors.textOnDark, marginBottom: spacing.md },
  reasonInput: {
    backgroundColor: colors.cardLight,
    borderRadius: radii.sm,
    padding: spacing.md,
    color: colors.textOnLight,
    marginVertical: spacing.md,
    minHeight: 60,
  },
  primaryButton: {
    backgroundColor: colors.mintAccent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryButtonText: { color: colors.backgroundDark, ...typography.subtitle },
  secondaryButton: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { color: colors.textOnDark, ...typography.subtitle },
});
