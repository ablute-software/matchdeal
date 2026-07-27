import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Application from 'expo-application';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography, radii } from '@/theme/colors';

/**
 * Pareamento estilo "WhatsApp Web ao contrário": o browser já tem a
 * sessão SherlockDeal autenticada e mostra um QR gerado a partir de um
 * `pairing_token` criado em matchdeal_device_links (ver Web:
 * botão "MatchDeal" -> landing -> QR). Aqui a app:
 *  1. Gera/recebe esse token (via deep link matchdeal://pair/<token> ao
 *     abrir a app pela primeira vez, OU pede para digitalizar o QR do
 *     browser — a implementação de câmara fica no ecrã ScanQRScreen,
 *     omitido aqui por brevidade; ambos os caminhos acabam na mesma
 *     função `completePairing`).
 *  2. Troca o token por uma sessão Supabase válida via RPC
 *     `matchdeal_complete_device_pairing` (a implementar no lado do
 *     backend/Edge Function — não em SQL puro, porque a emissão de uma
 *     sessão Supabase Auth requer a service role key, que nunca deve
 *     viver no cliente mobile).
 *
 * Esta implementação mostra o ecrã de espera com polling — o cenário mais
 * simples de validar primeiro é o QR ser gerado NO BROWSER (SherlockDeal
 * web) e a APP fazer o scan, porque assim o segredo nunca passa pela app
 * antes de ser confirmado pelo dono da sessão já autenticada.
 */
export function QRPairingScreen() {
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    createPairingRequest();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function createPairingRequest() {
    setStatus('waiting');
    const deviceId = Application.getAndroidId?.() ?? Application.applicationId ?? 'unknown-device';
    const token = generateToken();

    const { error } = await supabase.from('matchdeal_device_links').insert({
      pairing_token: token,
      device_id: deviceId,
      expires_at: new Date(Date.now() + 90_000).toISOString(),
    });

    if (error) {
      setStatus('error');
      return;
    }

    setPairingToken(token);
    pollRef.current = setInterval(() => checkPairingStatus(token), 2000);
  }

  async function checkPairingStatus(token: string) {
    const { data } = await supabase
      .from('matchdeal_device_links')
      .select('membership_id, used_at')
      .eq('pairing_token', token)
      .maybeSingle();

    if (data?.used_at && data?.membership_id) {
      if (pollRef.current) clearInterval(pollRef.current);
      // A troca por uma sessão Supabase Auth real acontece do lado do
      // browser/Edge Function que confirmou o pareamento (magic link ou
      // custom token) — aqui só confirmamos que passou, e o listener de
      // auth state (useAuthSession) trata do resto quando a sessão chegar
      // por deep link.
    }
  }

  function generateToken() {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Associar ao SherlockDeal</Text>
      <Text style={styles.subtitle}>
        Abre o SherlockDeal no browser, carrega em "MatchDeal" e digitaliza este código para
        associares a tua conta.
      </Text>

      <View style={styles.qrWrap}>
        {pairingToken ? (
          <QRCode value={`matchdeal://pair/${pairingToken}`} size={220} />
        ) : (
          <ActivityIndicator color={colors.mintAccent} />
        )}
      </View>

      {status === 'waiting' && (
        <Text style={styles.hint}>A aguardar confirmação no browser…</Text>
      )}
      {status === 'error' && (
        <Text style={[styles.hint, { color: colors.danger }]}>
          Não foi possível gerar o código. Tenta novamente.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: { ...typography.title, color: colors.textOnDark, marginBottom: spacing.sm },
  subtitle: {
    ...typography.body,
    color: colors.textOnDarkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  qrWrap: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  hint: { ...typography.caption, color: colors.textOnDarkMuted, marginTop: spacing.lg },
});
