import React from 'react';
import { ScrollView, View, Text, Image, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme/colors';
import type { MatchDealProfile } from '@/types/database';

/**
 * O perfil vê-se por scroll vertical antes do swipe (várias cards com a
 * informação), não só um resumo de uma linha — conforme pedido.
 */
export function ProfileCardScroll({ profile }: { profile: MatchDealProfile }) {
  const isStartup = profile.kind === 'startup';

  return (
    <ScrollView style={styles.wrap} showsVerticalScrollIndicator={false}>
      <Image
        source={{ uri: (isStartup ? profile.photo_url : profile.entity_logo_url) ?? undefined }}
        style={styles.hero}
      />

      <View style={styles.section}>
        <Text style={styles.name}>{isStartup ? profile.website : profile.entity_name}</Text>
        <Text style={styles.tagline}>{profile.country}</Text>
      </View>

      {profile.description ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Sobre</Text>
          <Text style={styles.cardBody}>{profile.description}</Text>
        </View>
      ) : null}

      {isStartup ? (
        <>
          <InfoCard label="Estágio de investimento" value={profile.investment_stage_sought} />
          <InfoCard label="Fase atual" value={profile.company_phase} />
          <InfoCard
            label="Valor pretendido para a ronda"
            value={profile.target_round_amount ? `€${profile.target_round_amount.toLocaleString()}` : null}
          />
          <InfoCard label="Setores" value={profile.sectors?.join(', ')} />
          <InfoCard label="Ano de fundação" value={profile.founded_year?.toString()} />
          <InfoCard label="Revenue" value={profile.revenue} />
          <InfoCard label="Propriedade intelectual" value={profile.intellectual_property} />
          <InfoCard label="Equipa" value={profile.team_summary} />
        </>
      ) : (
        <>
          <InfoCard label="Representante" value={profile.representative_name} />
          <InfoCard label="Tipo de entidade" value={profile.entity_type} />
          <InfoCard label="Setores de interesse" value={profile.sectors?.join(', ')} />
          <InfoCard label="Estágios de investimento" value={profile.stages_invested?.join(', ')} />
          <InfoCard label="Fases aceites" value={profile.phases_accepted?.join(', ')} />
          <InfoCard label="Geografias" value={profile.geographies?.join(', ')} />
          <InfoCard label="Tipos de empresa" value={profile.company_types?.join(', ')} />
          <InfoCard
            label="Ticket"
            value={
              profile.ticket_min || profile.ticket_max
                ? `€${profile.ticket_min ?? '?'} – €${profile.ticket_max ?? '?'}`
                : null
            }
          />
          <InfoCard label="Investe como" value={profile.lead_or_colead} />
          <InfoCard label="Instrumentos" value={profile.instruments?.join(', ')} />
          <InfoCard label="Portefólio" value={profile.portfolio_companies} />
          {/* preferred_contact_channel nunca aparece aqui — dado interno */}
        </>
      )}
    </ScrollView>
  );
}

function InfoCard({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardBody}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.white },
  hero: { width: '100%', height: 320, backgroundColor: colors.cardLight },
  section: { padding: spacing.lg },
  name: { ...typography.title, color: colors.textOnLight },
  tagline: { ...typography.body, color: colors.textOnLightMuted },
  card: {
    backgroundColor: colors.cardLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardLabel: { ...typography.caption, color: colors.textOnLightMuted, marginBottom: 2 },
  cardBody: { ...typography.body, color: colors.textOnLight },
});
