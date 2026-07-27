import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Application from 'expo-application';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography, radii } from '@/theme/colors';

/**
 * Pareamento estilo "WhatsApp Web ao contrário": o browser já tem a sessão
 * SherlockDeal autenticada; o telemóvel gera o token e mostra o QR, o
 * browser lê-o (scan ou digita) e chama a Edge Function `matchdeal-pair`
 * com esse token + a sua própria sessão. O ecrã do browser (botão
 * "MatchDeal" -> landing -> QR) é um prompt connectB futuro, à parte —
 * aqui só se assume que ALGUÉM autenticado como founder vai chamar essa
 * função com o token abaixo, dentro dos 90s de validade.
 *
 * Troca do token por sessão real: a Edge Function nunca devolve uma sessão
 * diretamente ao browser para o telemóvel "receber" por deep link — isso
 * provou-se frágil (navegação para um action_link não sincroniza sessão de
 * forma fiável). Em vez disso, ela deixa email + um código OTP de uso único
 * na própria linha de matchdeal_device_links (ver migração 0007), que o
 * telemóvel troca diretamente por uma sessão chamando `auth.verifyOtp`.
 * Chamada direta ao SDK, sem navegação de URL nenhuma.
 *
 * Migração 0009 (hardening): o telemóvel já NÃO lê/escreve
 * matchdeal_device_links diretamente — a policy que permitia isso a
 * qualquer cliente anónimo (`membership_id is null`) deixava QUALQUER
 * pessoa com a anon key fazer polling e roubar o email+OTP de pareamentos
 * alheios antes do telemóvel legítimo os resgatar (account takeover real,
 * fechado em produção). O acesso passa a ir por dois RPCs SECURITY DEFINER
 * keyed pelo próprio pairing_token — a mesma ideia de sempre ("o token é
 * que garante segurança"), só que aplicada no sítio que a consegue
 * exprimir: `matchdeal_pairing_poll` (devolve o OTP uma única vez, limpa-o
 * na mesma transação) e `matchdeal_pairing_seal` (com sessão real, sela a
 * linha — substitui o update direto que havia aqui antes).
 */
export function QRPairingScreen() {
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'pairing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    const { data, error } = await supabase.rpc('matchdeal_pairing_poll', { p_pairing_token: token });
    // A RPC devolve `setof` (uma linha), por isso vem como array — nunca um
    // objeto único, ao contrário de matchdeal_my_profile() (linha).
    const row = (Array.isArray(data) ? data[0] : data) as unknown as
      { status: string; session_email: string | null; session_email_otp: string | null } | undefined;
    if (error || !row) return;

    if (row.status === 'sealed' || row.status === 'expired' || row.status === 'not_found') {
      if (pollRef.current) clearInterval(pollRef.current);
      setStatus('error');
      setErrorMessage(
        row.status === 'expired' ? 'O código expirou. Gera um novo.' : 'Este código já não é válido. Gera um novo.'
      );
      return;
    }
    if (row.status === 'ready' && row.session_email && row.session_email_otp) {
      if (pollRef.current) clearInterval(pollRef.current);
      await redeemSession(token, row.session_email, row.session_email_otp);
    }
    // 'pending' — continua a fazer poll, nada a fazer aqui.
  }

  async function redeemSession(token: string, email: string, otp: string) {
    setStatus('pairing');
    const { error: otpErr } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (otpErr) {
      setStatus('error');
      setErrorMessage('Não foi possível completar a associação. Tenta gerar um novo código.');
      return;
    }

    // Sessão real estabelecida — useAuthSession.onAuthStateChange já vai
    // apanhar isto e correr refreshProfile() sozinho. Aqui só se sela a
    // linha de pareamento (matchdeal_pairing_seal, migração 0009 — o
    // update direto que havia aqui deixou de ser possível de propósito).
    const { data: sealed, error: sealErr } = await supabase.rpc('matchdeal_pairing_seal', { p_pairing_token: token });
    if (sealErr || !sealed) {
      setStatus('error');
      setErrorMessage('A sessão foi criada, mas não foi possível confirmar o pareamento. Tenta novamente.');
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
        {pairingToken && status !== 'pairing' ? (
          <QRCode value={`matchdeal://pair/${pairingToken}`} size={220} />
        ) : (
          <ActivityIndicator color={colors.mintAccent} />
        )}
      </View>

      {status === 'waiting' && (
        <Text style={styles.hint}>A aguardar confirmação no browser…</Text>
      )}
      {status === 'pairing' && (
        <Text style={styles.hint}>A associar a tua conta…</Text>
      )}
      {status === 'error' && (
        <Text style={[styles.hint, { color: colors.danger }]}>
          {errorMessage ?? 'Não foi possível gerar o código. Tenta novamente.'}
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
