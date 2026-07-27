import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthSession } from '@/hooks/useAuthSession';
import { QRPairingScreen } from '@/screens/pairing/QRPairingScreen';
import { ProfileSetupScreen } from '@/screens/onboarding/ProfileSetupScreen';
import { TabNavigator } from '@/navigation/TabNavigator';
import { MatchDetailScreen } from '@/screens/matches/MatchDetailScreen';
import { ChatScreen } from '@/screens/messages/ChatScreen';

export type RootStackParamList = {
  Pairing: undefined;
  ProfileSetup: undefined;
  Tabs: undefined;
  MatchDetail: { matchId: string };
  Chat: { matchId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, loading, profile } = useAuthSession();

  if (loading) return null; // TODO: splash screen

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Pairing" component={QRPairingScreen} />
      ) : !profile?.is_complete ? (
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen
            name="MatchDetail"
            component={MatchDetailScreen}
            options={{ headerShown: true, title: 'Match' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ headerShown: true, title: 'Mensagens' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
