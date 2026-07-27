import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme/colors';
import { pickAndUploadImage, pickAndUploadImages, type UploadKind } from '@/lib/uploads';

/** Single-image picker (profile photo, entity logo). */
export function PhotoPicker({
  ownerId,
  kind,
  label,
  value,
  onChange,
  round,
  required,
}: {
  ownerId: string;
  kind: UploadKind;
  label: string;
  value: string | null;
  onChange: (url: string) => void;
  round?: boolean;
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handlePick() {
    setBusy(true);
    const url = await pickAndUploadImage(ownerId, kind);
    setBusy(false);
    if (url) onChange(url);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <Pressable onPress={handlePick} disabled={busy} style={[styles.thumb, round && styles.thumbRound]}>
        {busy ? (
          <ActivityIndicator color={colors.mintAccent} />
        ) : value ? (
          <Image source={{ uri: value }} style={[styles.thumbImage, round && styles.thumbRound]} />
        ) : (
          <Text style={styles.placeholderText}>+ Adicionar{'\n'}foto</Text>
        )}
      </Pressable>
      {!!value && !busy && (
        <Pressable onPress={handlePick}>
          <Text style={styles.changeText}>Trocar foto</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Multi-image gallery editor (startup gallery_urls, up to `max`). */
export function GalleryPicker({
  ownerId,
  value,
  onChange,
  max = 5,
}: {
  ownerId: string;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}) {
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const remaining = max - value.length;
    if (remaining <= 0) return;
    setBusy(true);
    const urls = await pickAndUploadImages(ownerId, remaining);
    setBusy(false);
    if (urls.length) onChange([...value, ...urls].slice(0, max));
  }

  function handleRemove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Galeria ({value.length}/{max})</Text>
      <View style={styles.galleryRow}>
        {value.map((url) => (
          <Pressable key={url} onPress={() => handleRemove(url)} style={styles.galleryItem}>
            <Image source={{ uri: url }} style={styles.galleryImage} />
            <View style={styles.removeBadge}><Text style={styles.removeBadgeText}>✕</Text></View>
          </Pressable>
        ))}
        {value.length < max && (
          <Pressable onPress={handleAdd} disabled={busy} style={[styles.thumb, styles.galleryItem]}>
            {busy ? <ActivityIndicator color={colors.mintAccent} /> : <Text style={styles.placeholderText}>+ Foto</Text>}
          </Pressable>
        )}
      </View>
      <Text style={styles.hint}>Toca numa foto da galeria para a remover.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.subtitle, color: colors.textOnLight, marginBottom: spacing.xs },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbRound: { borderRadius: 48 },
  thumbImage: { width: '100%', height: '100%' },
  placeholderText: { ...typography.caption, color: colors.textOnLightMuted, textAlign: 'center' },
  changeText: { ...typography.caption, color: colors.backgroundDark, marginTop: spacing.xs, textDecorationLine: 'underline' },
  galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  galleryItem: { width: 88, height: 88, marginRight: spacing.xs, marginBottom: spacing.xs },
  galleryImage: { width: '100%', height: '100%', borderRadius: radii.sm },
  removeBadge: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  removeBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  hint: { ...typography.caption, color: colors.textOnLightMuted, marginTop: spacing.xs },
});
