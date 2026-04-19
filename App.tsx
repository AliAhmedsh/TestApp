import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getAuth, onAuthStateChanged, signOut, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { AppToastRoot } from './src/components/AppToast';
import { LoginScreen } from './src/screens/LoginScreen';
import { RoomHomeScreen } from './src/screens/RoomHomeScreen';
import { VoiceRoomScreen } from './src/screens/VoiceRoomScreen';
import { colors } from './src/theme/tokens';

type Phase =
  | { screen: 'loading' }
  | { screen: 'login' }
  | { screen: 'lobby' }
  | { screen: 'voice'; roomDocId: string };

function App() {
  const [phase, setPhase] = useState<Phase>({ screen: 'loading' });

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (_user: FirebaseAuthTypes.User | null) => {
      setPhase(p => {
        if (p.screen === 'voice') {
          return p;
        }
        return { screen: _user ? 'lobby' : 'login' };
      });
    });
    return unsub;
  }, []);

  const logout = () => {
    signOut(getAuth()).catch(err => console.warn('logout error', err));
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.bg}
        translucent={false}
      />
      <View style={styles.root}>
        {phase.screen === 'loading' && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.accentMuted} />
          </View>
        )}
        {phase.screen === 'login' && (
          <LoginScreen onSignedIn={() => setPhase({ screen: 'lobby' })} />
        )}
        {phase.screen === 'lobby' && (
          <RoomHomeScreen
            onOpenRoom={roomDocId => setPhase({ screen: 'voice', roomDocId })}
            onLogout={logout}
          />
        )}
        {phase.screen === 'voice' && (
          <VoiceRoomScreen
            roomDocId={phase.roomDocId}
            onLeave={() => setPhase({ screen: 'lobby' })}
          />
        )}
      </View>
      <AppToastRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});

export default App;
