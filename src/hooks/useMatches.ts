import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MatchDealMatch } from '@/types/database';

export function useMatches(profileId: string | undefined, kind: 'startup' | 'investor' | undefined) {
  const [matches, setMatches] = useState<MatchDealMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const query =
      kind === 'startup'
        ? supabase.from('matchdeal_matches').select('*').eq('startup_profile_id', profileId)
        : supabase
            .from('matchdeal_matches')
            .select('*, matchdeal_responsibility_queue!inner(investor_profile_id)')
            .eq('matchdeal_responsibility_queue.investor_profile_id', profileId);

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (!error && data) setMatches(data as unknown as MatchDealMatch[]);
    setLoading(false);
  }, [profileId, kind]);

  useEffect(() => {
    load();
    if (!profileId) return;
    const channel = supabase
      .channel(`matchdeal-matches-${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matchdeal_matches' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, profileId]);

  return { matches, loading, reload: load };
}
