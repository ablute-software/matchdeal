import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet, Pressable } from 'react-native';
import { FormField, ChipSelector } from '@/components/FormField';
import { PhotoPicker } from '@/components/PhotoPicker';
import { colors, spacing, typography, radii } from '@/theme/colors';
import {
  SECTOR_OPTIONS,
  INVESTMENT_STAGE_OPTIONS,
  COMPANY_PHASE_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  INSTRUMENT_OPTIONS,
  CONTACT_CHANNEL_OPTIONS,
} from '@/lib/options';
import type { MatchDealProfile } from '@/types/database';

interface Props {
  initial: Partial<MatchDealProfile>;
  profileId: string | null;
  onSave: (patch: Partial<MatchDealProfile>) => Promise<void>;
  saving: boolean;
}

export function InvestorProfileForm({ initial, profileId, onSave, saving }: Props) {
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url ?? null);
  const [entityLogoUrl, setEntityLogoUrl] = useState(initial.entity_logo_url ?? null);
  const [representativeName, setRepresentativeName] = useState(initial.representative_name ?? '');
  const [entityName, setEntityName] = useState(initial.entity_name ?? '');
  const [entityType, setEntityType] = useState(initial.entity_type ?? '');
  const [country, setCountry] = useState(initial.country ?? '');
  const [website, setWebsite] = useState(initial.website ?? '');
  const [linkedin, setLinkedin] = useState(initial.representative_linkedin ?? '');
  const [sectors, setSectors] = useState<string[]>(initial.sectors ?? []);
  const [stages, setStages] = useState<string[]>(initial.stages_invested ?? []);
  const [phases, setPhases] = useState<string[]>(initial.phases_accepted ?? []);
  const [geographies, setGeographies] = useState<string>((initial.geographies ?? []).join(', '));
  const [companyTypes, setCompanyTypes] = useState<string[]>(initial.company_types ?? []);
  const [criteria, setCriteria] = useState(initial.specific_criteria ?? '');
  const [ticketMin, setTicketMin] = useState(initial.ticket_min ? String(initial.ticket_min) : '');
  const [ticketMax, setTicketMax] = useState(initial.ticket_max ? String(initial.ticket_max) : '');
  const [leadOrCoLead, setLeadOrCoLead] = useState(initial.lead_or_colead ?? '');
  const [instruments, setInstruments] = useState<string[]>(initial.instruments ?? []);
  const [activeFund, setActiveFund] = useState(initial.active_fund ?? '');
  const [portfolio, setPortfolio] = useState(initial.portfolio_companies ?? '');
  const [recentInvestments, setRecentInvestments] = useState(initial.recent_investments ?? '');
  const [contactChannel, setContactChannel] = useState(initial.preferred_contact_channel ?? '');

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const handleSave = () =>
    onSave({
      photo_url: photoUrl,
      entity_logo_url: entityLogoUrl,
      representative_name: representativeName,
      entity_name: entityName,
      entity_type: (entityType || null) as MatchDealProfile['entity_type'],
      country,
      website,
      representative_linkedin: linkedin,
      sectors,
      stages_invested: stages as MatchDealProfile['stages_invested'],
      phases_accepted: phases as MatchDealProfile['phases_accepted'],
      geographies: geographies.split(',').map((g) => g.trim()).filter(Boolean),
      company_types: companyTypes,
      specific_criteria: criteria,
      ticket_min: ticketMin ? Number(ticketMin) : null,
      ticket_max: ticketMax ? Number(ticketMax) : null,
      lead_or_colead: (leadOrCoLead || null) as MatchDealProfile['lead_or_colead'],
      instruments,
      active_fund: activeFund,
      portfolio_companies: portfolio,
      recent_investments: recentInvestments,
      preferred_contact_channel:
        (contactChannel || null) as MatchDealProfile['preferred_contact_channel'],
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Perfil do investidor</Text>
      <Text style={styles.note}>
        Nome do representante, entidade, setores, estágios, geografias e website são obrigatórios.
      </Text>

      {profileId && (
        <>
          <PhotoPicker ownerId={profileId} kind="profile-photo" label="Foto do representante" required value={photoUrl} onChange={setPhotoUrl} round />
          <PhotoPicker ownerId={profileId} kind="entity-logo" label="Logo da entidade" value={entityLogoUrl} onChange={setEntityLogoUrl} />
        </>
      )}

      <FormField label="Nome completo do representante" required value={representativeName} onChangeText={setRepresentativeName} />
      <FormField label="Nome da entidade" required value={entityName} onChangeText={setEntityName} />
      <ChipSelector label="Tipo de entidade" options={ENTITY_TYPE_OPTIONS} selected={entityType ? [entityType] : []} onToggle={setEntityType} />
      <FormField label="País e cidade da sede" required value={country} onChangeText={setCountry} />
      <FormField label="Website oficial" required value={website} onChangeText={setWebsite} autoCapitalize="none" />
      <FormField label="LinkedIn do representante" value={linkedin} onChangeText={setLinkedin} autoCapitalize="none" />

      <ChipSelector label="Setores de interesse" required options={SECTOR_OPTIONS} selected={sectors} onToggle={(v) => toggle(sectors, setSectors, v)} />
      <ChipSelector label="Estágios de investimento" required options={INVESTMENT_STAGE_OPTIONS} selected={stages} onToggle={(v) => toggle(stages, setStages, v)} />
      <ChipSelector label="Fases empresariais aceites" options={COMPANY_PHASE_OPTIONS} selected={phases} onToggle={(v) => toggle(phases, setPhases, v)} />
      <FormField label="Geografias onde investe (separadas por vírgula)" required value={geographies} onChangeText={setGeographies} />
      <ChipSelector label="Tipos de empresa" options={COMPANY_TYPE_OPTIONS} selected={companyTypes} onToggle={(v) => toggle(companyTypes, setCompanyTypes, v)} />
      <FormField label="Critérios específicos" value={criteria} onChangeText={setCriteria} multiline />

      <FormField label="Ticket mínimo (€)" value={ticketMin} onChangeText={setTicketMin} keyboardType="numeric" />
      <FormField label="Ticket máximo (€)" value={ticketMax} onChangeText={setTicketMax} keyboardType="numeric" />
      <ChipSelector
        label="Investe como"
        options={[{ value: 'lead', label: 'Lead' }, { value: 'co_lead', label: 'Co-lead' }]}
        selected={leadOrCoLead ? [leadOrCoLead] : []}
        onToggle={setLeadOrCoLead}
      />
      <ChipSelector label="Instrumentos utilizados" options={INSTRUMENT_OPTIONS} selected={instruments} onToggle={(v) => toggle(instruments, setInstruments, v)} />
      <FormField label="Fundo/veículo atualmente ativo (opcional)" value={activeFund} onChangeText={setActiveFund} />
      <FormField label="Empresas do portefólio" value={portfolio} onChangeText={setPortfolio} multiline />
      <FormField label="Investimentos mais recentes (opcional)" value={recentInvestments} onChangeText={setRecentInvestments} multiline />

      <ChipSelector
        label="Canal de contacto preferido (não visível à startup — uso interno)"
        options={CONTACT_CHANNEL_OPTIONS}
        selected={contactChannel ? [contactChannel] : []}
        onToggle={setContactChannel}
      />

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'A guardar…' : 'Guardar perfil'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.white },
  heading: { ...typography.title, color: colors.textOnLight, marginBottom: spacing.xs },
  note: { ...typography.caption, color: colors.textOnLightMuted, marginBottom: spacing.lg },
  saveButton: {
    backgroundColor: colors.backgroundDark,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  saveButtonText: { color: colors.mintAccent, ...typography.subtitle },
});
