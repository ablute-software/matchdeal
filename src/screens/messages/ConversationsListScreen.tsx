import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMatches } from '@/hooks/useMatches';
import { colors, spacing, typography, radii } from '@/theme/colors';

/** Lista de conversas = matches em estado 'active' (chat desbloqueado ou com histórico de sistema). */
export function ConversationsListScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuthSession();
  const { matches, loading } = useMatches(profile?.id, profile?.kind);
  const conversations = matches.filter((m) => m.status !== 'declined_by_startup');

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.mintAccent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={<Text style={styles.empty}>Ainda sem conversas.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Chat', { matchId: item.id })}>
            <Text style={styles.title}>Match {item.id.slice(0, 8)}</Text>
            <Text style={styles.subtitle}>{item.status}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDark },
  center: { flex: 1, backgroundColor: colors.backgroundDark, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.body, color: colors.textOnDarkMuted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { ...typography.subtitle, color: colors.textOnDark },
  subtitle: { ...typography.caption, color: colors.textOnDarkMuted },
});
