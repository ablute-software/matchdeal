import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Pressable, ActivityIndicator } from 'react-native';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useSwipeDeck } from '@/hooks/useSwipeDeck';
import { ProfileCardScroll } from '@/screens/swipe/ProfileCardScroll';
import { colors, spacing, typography, radii } from '@/theme/colors';
import type { SwipeDirection } from '@/types/database';

const SWIPE_THRESHOLD = 120;

export function SwipeDeckScreen() {
  const { profile } = useAuthSession();
  const { deck, loading, swipe } = useSwipeDeck(profile?.id);
  const [matchCelebration, setMatchCelebration] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;

  const current = deck[0];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          completeSwipe('like');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          completeSwipe('pass');
        } else {
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  async function completeSwipe(direction: SwipeDirection) {
    if (!current) return;
    const targetId = current.id;
    Animated.timing(position, {
      toValue: { x: direction === 'like' ? 500 : -500, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(async () => {
      position.setValue({ x: 0, y: 0 });
      const matchId = await swipe(targetId, direction);
      if (matchId) {
        setMatchCelebration(true);
        setTimeout(() => setMatchCelebration(false), 1800);
      }
    });
  }

  const rotate = position.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.mintAccent} />
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Sem novos perfis por agora</Text>
        <Text style={styles.emptySubtitle}>
          Ajusta os teus filtros ou volta mais tarde — o baralho renova-se à medida que novas
          startups/investidores ficam elegíveis.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.card,
          {
            transform: [...position.getTranslateTransform(), { rotate }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <ProfileCardScroll profile={current} />
      </Animated.View>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionButton, styles.passButton]} onPress={() => completeSwipe('pass')}>
          <Text style={styles.actionIcon}>✕</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.likeButton]} onPress={() => completeSwipe('like')}>
          <Text style={styles.actionIcon}>♥</Text>
        </Pressable>
      </View>

      {matchCelebration && (
        <View style={styles.matchOverlay}>
          <Text style={styles.matchText}>É um match!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDark },
  center: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: { ...typography.subtitle, color: colors.textOnDark, marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textOnDarkMuted, textAlign: 'center' },
  card: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButton: { backgroundColor: colors.swipePass },
  likeButton: { backgroundColor: colors.swipeLike },
  actionIcon: { fontSize: 28, color: colors.white },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,58,63,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchText: { ...typography.title, color: colors.mintAccent, fontSize: 32 },
});
