import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MatchDealMessage } from '@/types/database';

export function useChat(matchId: string, senderProfileId: string | undefined) {
  const [messages, setMessages] = useState<MatchDealMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matchdeal_messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });
    setMessages((data as unknown as MatchDealMessage[]) ?? []);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`matchdeal-chat-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matchdeal_messages', filter: `match_id=eq.${matchId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as unknown as MatchDealMessage])
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, matchId]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!senderProfileId || !body.trim()) return;
      await supabase.from('matchdeal_messages').insert({
        match_id: matchId,
        sender_profile_id: senderProfileId,
        kind: 'user',
        body: body.trim(),
      });
      // Enviar mensagem conta como "ação mensurável" para o SLA do
      // investidor responsável — ver matchdeal_record_investor_action.
      await supabase.rpc('matchdeal_record_investor_action', { p_match_id: matchId });
    },
    [matchId, senderProfileId]
  );

  return { messages, loading, sendMessage, reload: load };
}
