import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useChat } from '@/hooks/useChat';
import { MeetingProposalCard } from '@/screens/messages/MeetingProposalCard';
import { colors, spacing, typography, radii } from '@/theme/colors';

/**
 * A caixa de mensagens fica sempre visível, mas SÓ mostra mensagens de
 * sistema até o match ficar `active` (depois do consentimento do data
 * room) — antes disso o input de texto livre está desativado. Ver spec
 * §6. O estado do match é lido separadamente (MatchDetailScreen já trata
 * do consentimento); aqui assumimos que o utilizador só chega a este
 * ecrã depois de o match estar pelo menos em pending_consent, e o input
 * de texto livre só se ativa quando existir pelo menos uma mensagem do
 * tipo 'system' a confirmar a concessão — simplificação da v1, o ideal é
 * ler `match.status === 'active'` diretamente (TODO: passar via params ou
 * subscrever matchdeal_matches aqui também).
 */
export function ChatScreen() {
  const route = useRoute<any>();
  const matchId = route.params.matchId as string;
  const { profile } = useAuthSession();
  const { messages, sendMessage } = useChat(matchId, profile?.id);
  const [draft, setDraft] = useState('');

  const unlocked = messages.some((m) => m.body.includes('Já podes ver os documentos'));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {unlocked && profile?.id && (
        <MeetingProposalCard matchId={matchId} proposerProfileId={profile.id} />
      )}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.kind === 'system'
                ? styles.systemBubble
                : item.sender_profile_id === profile?.id
                ? styles.ownBubble
                : styles.otherBubble,
            ]}
          >
            <Text style={item.kind === 'system' ? styles.systemText : styles.bubbleText}>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          editable={unlocked}
          placeholder={unlocked ? 'Escreve uma mensagem…' : 'Disponível depois da autorização do data room'}
          placeholderTextColor={colors.textOnDarkMuted}
        />
        <Pressable
          style={styles.sendButton}
          disabled={!unlocked || !draft.trim()}
          onPress={() => {
            sendMessage(draft);
            setDraft('');
          }}
        >
          <Text style={styles.sendButtonText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDark },
  bubble: { borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.xs, maxWidth: '85%' },
  systemBubble: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.08)', maxWidth: '95%' },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: colors.mintAccent },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: colors.cardLight },
  bubbleText: { ...typography.body, color: colors.textOnLight },
  systemText: { ...typography.caption, color: colors.textOnDarkMuted, textAlign: 'center' },
  inputRow: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    color: colors.textOnLight,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.mintAccent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  sendButtonText: { color: colors.backgroundDark, fontWeight: '700' },
});
