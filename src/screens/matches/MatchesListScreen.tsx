import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMatches } from '@/hooks/useMatches';
import { colors, spacing, typography, radii } from '@/theme/colors';
import type { MatchStatus } from '@/types/database';

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending_consent: 'A aguardar autorização do data room',
  declined_by_startup: 'Recusado',
  active: 'Em acompanhamento',
  expired_no_followup: 'Encerrado — sem seguimento',
  closed_by_startup: 'Encerrado pela startup',
};

export function MatchesListScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuthSession();
  const { matches, loading } = useMatches(profile?.id, profile?.kind);

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
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={
          <Text style={styles.empty}>Ainda não tens matches. Vai ao ícone central para começar.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
          >
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
              <Text style={styles.date}>
                Atualizado {new Date(item.updated_at).toLocaleDateString('pt-PT')}
              </Text>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mintAccent, marginRight: spacing.md },
  status: { ...typography.subtitle, color: colors.textOnDark },
  date: { ...typography.caption, color: colors.textOnDarkMuted },
});
