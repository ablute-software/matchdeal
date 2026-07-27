import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { FormField, ChipSelector } from '@/components/FormField';
import { colors, spacing, typography, radii } from '@/theme/colors';
import {
  SECTOR_OPTIONS,
  INVESTMENT_STAGE_OPTIONS,
  COMPANY_PHASE_OPTIONS,
  DESCRIPTION_MAX_LENGTH,
} from '@/lib/options';
import type { MatchDealProfile } from '@/types/database';

interface Props {
  initial: Partial<MatchDealProfile>;
  onSave: (patch: Partial<MatchDealProfile>) => Promise<void>;
  saving: boolean;
}

/**
 * Campos mínimos para "visível e completo" (recalculados também no
 * servidor via trigger — ver 0002_matchdeal_functions.sql): foto,
 * website, setor, estágio, descrição, país. O resto pode ser preenchido
 * depois, em pedidos contextuais — mas mostramos tudo já aqui na v1 para
 * simplicidade de build; o faseamento de UX fica para v1.1.
 */
export function StartupProfileForm({ initial, onSave, saving }: Props) {
  const [website, setWebsite] = useState(initial.website ?? '');
  const [sectors, setSectors] = useState<string[]>(initial.sectors ?? []);
  const [description, setDescription] = useState(initial.description ?? '');
  const [stage, setStage] = useState(initial.investment_stage_sought ?? '');
  const [country, setCountry] = useState(initial.country ?? '');
  const [roundAmount, setRoundAmount] = useState(
    initial.target_round_amount ? String(initial.target_round_amount) : ''
  );
  const [phase, setPhase] = useState(initial.company_phase ?? '');
  const [foundedYear, setFoundedYear] = useState(
    initial.founded_year ? String(initial.founded_year) : ''
  );
  const [ip, setIp] = useState(initial.intellectual_property ?? '');
  const [revenue, setRevenue] = useState(initial.revenue ?? '');
  const [team, setTeam] = useState(initial.team_summary ?? '');
  const [contact, setContact] = useState(initial.contact ?? '');

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const handleSave = () =>
    onSave({
      website,
      sectors,
      description,
      investment_stage_sought: (stage || null) as MatchDealProfile['investment_stage_sought'],
      country,
      target_round_amount: roundAmount ? Number(roundAmount) : null,
      company_phase: (phase || null) as MatchDealProfile['company_phase'],
      founded_year: foundedYear ? Number(foundedYear) : null,
      intellectual_property: ip,
      revenue,
      team_summary: team,
      contact,
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Perfil da startup</Text>
      <Text style={styles.note}>
        Foto, website, setor, estágio, descrição e país são obrigatórios para o teu perfil ficar
        visível a investidores.
      </Text>

      {/* Foto de perfil e pitch deck: upload tratado em componente próprio
          (ImagePicker) — omitido aqui por brevidade, ver TODO no ARCHITECTURE.md */}

      <FormField label="Website" required value={website} onChangeText={setWebsite} autoCapitalize="none" />
      <ChipSelector label="Setores" required options={SECTOR_OPTIONS} selected={sectors} onToggle={(v) => toggle(sectors, setSectors, v)} />
      <FormField
        label={`Descrição curta (máx. ${DESCRIPTION_MAX_LENGTH} caracteres)`}
        required
        value={description}
        onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX_LENGTH))}
        multiline
        numberOfLines={3}
      />
      <ChipSelector
        label="Estágio de investimento"
        required
        options={INVESTMENT_STAGE_OPTIONS}
        selected={stage ? [stage] : []}
        onToggle={(v) => setStage(v)}
      />
      <FormField label="País" required value={country} onChangeText={setCountry} />
      <FormField
        label="Valor pretendido para a ronda (€)"
        value={roundAmount}
        onChangeText={setRoundAmount}
        keyboardType="numeric"
      />
      <ChipSelector
        label="Fase atual"
        required
        options={COMPANY_PHASE_OPTIONS}
        selected={phase ? [phase] : []}
        onToggle={(v) => setPhase(v)}
      />
      <FormField label="Ano de fundação" value={foundedYear} onChangeText={setFoundedYear} keyboardType="numeric" />
      <FormField label="Propriedade intelectual" value={ip} onChangeText={setIp} multiline />
      <FormField label="Revenue" value={revenue} onChangeText={setRevenue} />
      <FormField label="Equipa (descrição curta)" value={team} onChangeText={setTeam} multiline />
      <FormField label="Contacto" value={contact} onChangeText={setContact} />

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
