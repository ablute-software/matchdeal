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
    // Resolvido via matchdeal_my_profile() (migração 0007) — NÃO via
    // session.user.user_metadata.membership_id, que era a suposição
    // original do scaffold e nunca teria valor real: nada escreve esse
    // metadata numa conta de founder que já existia antes do MatchDeal. A
    // RPC usa o mesmo caminho de resolução do RLS (matchdeal_current_profile_ids),
    // por isso funciona tanto para o lado startup (org_members) como,
    // quando a Fase 0 ligar a flag, para o lado investidor.
    // A função devolve `public.matchdeal_profiles` (linha única, não
    // setof), por isso o PostgREST já devolve um objeto — sem `.single()`,
    // que é só para quando se restringe um SELECT normal a uma linha.
    const { data, error } = await supabase.rpc('matchdeal_my_profile');
    if (error) { setProfile(null); return; }
    const row = data as unknown as MatchDealProfile | null;
    setProfile(row?.id ? row : null);
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
