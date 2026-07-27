import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '@/theme/colors';
import { SwipeDeckScreen } from '@/screens/swipe/SwipeDeckScreen';
import { MatchesListScreen } from '@/screens/matches/MatchesListScreen';
import { ConversationsListScreen } from '@/screens/messages/ConversationsListScreen';

export type TabParamList = {
  Swipe: undefined;
  Matches: undefined;
  Conversations: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, string> = {
  Swipe: '◎',
  Matches: '♥',
  Conversations: '✉',
};

/**
 * Três ícones no fundo, conforme a spec: Matches, Mensagens, e o ícone
 * central (Swipe) para descobrir novos matches.
 */
export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.mintAccent,
        tabBarInactiveTintColor: colors.textOnDarkMuted,
        tabBarStyle: { backgroundColor: colors.backgroundDark, borderTopColor: colors.border },
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>{ICONS[route.name]}</Text>,
      })}
    >
      <Tab.Screen name="Matches" component={MatchesListScreen} options={{ title: 'Matches' }} />
      <Tab.Screen name="Swipe" component={SwipeDeckScreen} options={{ title: 'Descobrir' }} />
      <Tab.Screen
        name="Conversations"
        component={ConversationsListScreen}
        options={{ title: 'Mensagens' }}
      />
    </Tab.Navigator>
  );
}
