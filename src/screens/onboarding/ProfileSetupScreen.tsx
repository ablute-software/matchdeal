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
    if (!session?.user?.user_metadata?.membership_id) return;
    setSaving(true);
    await supabase.from('matchdeal_profiles').upsert(
      {
        membership_id: session.user.user_metadata.membership_id,
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

  return kind === 'startup' ? (
    <StartupProfileForm initial={profile ?? {}} onSave={handleSave} saving={saving} />
  ) : (
    <InvestorProfileForm initial={profile ?? {}} onSave={handleSave} saving={saving} />
  );
}
