import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { MatchDealProfile, ProfileKind } from '@/types/database';

interface AuthSessionValue {
  session: Session | null;
  loading: boolean;
  profile: MatchDealProfile | null;
  refreshProfile: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionValue>({
  session: null,
  loading: true,
  profile: null,
  refreshProfile: async () => {},
});

/**
 * A sessão nunca é criada por email/password dentro da app — chega
 * sempre por troca do pareamento QR (ver screens/pairing/QRPairingScreen),
 * que devolve um Supabase session token já emitido para a conta
 * SherlockDeal existente. Ver docs/ARCHITECTURE.md §"Ligação de conta".
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MatchDealProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }
    // NOTA: a resolução membership_id -> profile assume que o cliente já
    // conhece o membership_id do utilizador (guardado no momento do
    // pareamento QR). Ajustar conforme o schema real for confirmado.
    const membershipId = session.user.user_metadata?.membership_id as string | undefined;
    if (!membershipId) return;
    const { data } = await supabase
      .from('matchdeal_profiles')
      .select('*')
      .eq('membership_id', membershipId)
      .maybeSingle();
    setProfile((data as unknown as MatchDealProfile) ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [session?.user?.id]);

  return (
    <AuthSessionContext.Provider value={{ session, loading, profile, refreshProfile }}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

export function profileKindOf(session: Session | null): ProfileKind | null {
  return (session?.user?.user_metadata?.kind as ProfileKind) ?? null;
}
