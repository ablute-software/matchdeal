import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme/colors';

interface Props extends TextInputProps {
  label: string;
  required?: boolean;
}

export function FormField({ label, required, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        placeholderTextColor={colors.textOnLightMuted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

/** Seletor simples de chips para campos multi-valor (setores, estágios, etc.) */
export function ChipSelector({
  label,
  options,
  selected,
  onToggle,
  required,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  required?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <Text
              key={opt.value}
              onPress={() => onToggle(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              {opt.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.subtitle, color: colors.textOnLight, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.cardLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textOnLight,
    ...typography.body,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    backgroundColor: colors.cardLight,
    color: colors.textOnLightMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    overflow: 'hidden',
    ...typography.caption,
  },
  chipActive: {
    backgroundColor: colors.mintAccent,
    color: colors.backgroundDark,
    fontWeight: '700',
  },
});
