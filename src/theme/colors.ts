/**
 * Paleta reaproveitada do material de parceiros do Sherlock Deal (teal/mint
 * sobre fundo escuro) — ver claude/ablute_context.md §15 no Project
 * "Investors Relations". Não inventar paleta nova: a intenção é associação
 * de marca imediata entre MatchDeal e Sherlock Deal.
 */
export const colors = {
  backgroundDark: '#0E3A3F',
  backgroundDarkGradientEnd: '#0A2A2E',
  mintAccent: '#3FDBA0',
  cardLight: '#E7F0F1',
  white: '#FFFFFF',
  textOnDark: '#F2F8F7',
  textOnDarkMuted: '#AFC9C7',
  textOnLight: '#0E3A3F',
  textOnLightMuted: '#5B7A78',
  danger: '#E2574C',
  warning: '#E2A83F',
  border: 'rgba(255,255,255,0.12)',
  swipeLike: '#3FDBA0',
  swipePass: '#E2574C',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radii = { sm: 8, md: 16, lg: 24, pill: 999 };

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  subtitle: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};
