import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MatchDealProfile, SwipeDirection } from '@/types/database';

export function useSwipeDeck(viewerProfileId: string | undefined) {
  const [deck, setDeck] = useState<MatchDealProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDeck = useCallback(async () => {
    if (!viewerProfileId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('matchdeal_eligible_deck', {
      p_viewer_profile_id: viewerProfileId,
      p_limit: 20,
    });
    if (!error && data) {
      const profiles = data as unknown as MatchDealProfile[];
      setDeck(profiles);
      // Regista exposição de cada card mostrada, para a exposição mínima
      // garantida (matchdeal_eligible_deck) funcionar corretamente.
      if (profiles.length) {
        await supabase.from('matchdeal_exposures').insert(
          profiles.map((p) => ({ viewer_profile_id: viewerProfileId, shown_profile_id: p.id }))
        );
      }
    }
    setLoading(false);
  }, [viewerProfileId]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  const swipe = useCallback(
    async (targetProfileId: string, direction: SwipeDirection) => {
      if (!viewerProfileId) return null;
      const { data, error } = await supabase.rpc('matchdeal_record_swipe', {
        p_actor_profile_id: viewerProfileId,
        p_target_profile_id: targetProfileId,
        p_direction: direction,
      });
      setDeck((prev) => prev.filter((p) => p.id !== targetProfileId));
      if (error) return null;
      return data as string | null; // match_id se houver match mútuo, senão null
    },
    [viewerProfileId]
  );

  return { deck, loading, swipe, reload: loadDeck };
}
