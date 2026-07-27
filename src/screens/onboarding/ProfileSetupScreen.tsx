import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthSession, profileKindOf } from '@/hooks/useAuthSession';
import { StartupProfileForm } from '@/screens/onboarding/StartupProfileForm';
import { InvestorProfileForm } from '@/screens/onboarding/InvestorProfileForm';
import { colors } from '@/theme/colors';
import type { MatchDealProfile } from '@/types/database';

/**
 * A app importa automaticamente os dados já existentes da empresa/
 * entidade a partir do SherlockDeal no momento do pareamento (esse
 * import populamento fica do lado do backend/Edge Function que confirma
 * o pareamento QR — ver docs/ARCHITECTURE.md). Aqui já assumimos que
 * `profile` (via useAuthSession) tem, no mínimo, o `kind` definido e
 * possivelmente alguns campos pré-preenchidos; o utilizador completa o
 * resto antes de o botão "Guardar perfil" desbloquear o acesso ao swipe.
 */
export function ProfileSetupScreen() {
  const { session, profile, refreshProfile } = useAuthSession();
  const [saving, setSaving] = useState(false);
  const kind = profile?.kind ?? profileKindOf(session);

  async function handleSave(patch: Partial<MatchDealProfile>) {
    // membership_id vem do próprio `profile` (resolvido por
    // matchdeal_my_profile(), migração 0007) — nunca de user_metadata, que
    // nenhuma conta de founder preenche. Para o lado startup, o `profile`
    // já existe sempre aqui: a Edge Function de pareamento cria-o
    // sincronamente, antes de a app alguma vez chegar a este ecrã.
    if (!profile?.membership_id) return;
    setSaving(true);
    await supabase.from('matchdeal_profiles').upsert(
      {
        membership_id: profile.membership_id,
        kind,
        ...patch,
      },
      { onConflict: 'membership_id,kind' }
    );
    await refreshProfile();
    setSaving(false);
  }

  if (!kind) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundDark, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.mintAccent} />
      </View>
    );
  }

  // Os pickers de foto/logo/galeria precisam de um id para o caminho no
  // bucket `matchdeal`. Usa-se profile.id quando já existe (sempre o caso
  // no lado startup, criado pelo pareamento); antes disso, o utilizador
  // simplesmente ainda não vê os campos de imagem.
  return kind === 'startup' ? (
    <StartupProfileForm initial={profile ?? {}} profileId={profile?.id ?? null} onSave={handleSave} saving={saving} />
  ) : (
    <InvestorProfileForm initial={profile ?? {}} profileId={profile?.id ?? null} onSave={handleSave} saving={saving} />
  );
}
