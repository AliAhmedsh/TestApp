import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Easing,
  PermissionsAndroid,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenSafeArea } from '../components/ScreenSafeArea';
import { COL_TEST_CHATS } from '../constants';
import {
  ensureInRoom,
  getDisplayJoinCode,
  leaveRoom,
  TestChatRoom,
} from '../services/rooms';
import { useVoiceRoom } from '../hooks/useVoiceRoom';
import { colors, font, layout, radii } from '../theme/tokens';
import { toastError } from '../utils/toast';

type Props = {
  roomDocId: string;
  onLeave: () => void;
};

async function ensureMic(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

function SpeakingPulse({
  visible,
  energetic,
}: {
  visible: boolean;
  energetic: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pulse.setValue(0);
      return;
    }
    const duration = energetic ? 450 : 900;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, energetic, pulse]);

  if (!visible) {
    return null;
  }

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, energetic ? 1.22 : 1.08],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [energetic ? 0.5 : 0.25, energetic ? 1 : 0.55],
  });

  return (
    <View style={pulseStyles.wrap} accessibilityLabel="Voice activity">
      <Animated.View
        style={[
          pulseStyles.ring,
          {
            opacity,
            transform: [{ scale }],
            borderColor: energetic ? colors.success : colors.accentMuted,
          },
        ]}
      />
      <Animated.View
        style={[
          pulseStyles.ringInner,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <Text style={pulseStyles.label}>
        {energetic ? 'You are speaking' : 'Mic live'}
      </Text>
    </View>
  );
}

const pulseStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    height: 120,
  },
  ring: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
  },
  ringInner: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  label: {
    position: 'absolute',
    bottom: 0,
    fontSize: font.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
});

export function VoiceRoomScreen({ roomDocId, onLeave }: Props) {
  const myUid = auth().currentUser?.uid ?? null;
  const insets = useSafeAreaInsets();
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [roomRow, setRoomRow] = useState<TestChatRoom | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const exitingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureMic();
      if (cancelled) {
        return;
      }
      if (!ok) {
        setPermError('Microphone permission denied.');
        toastError('Microphone', 'Allow the microphone to use voice chat.');
        return;
      }
      setMicReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!myUid) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureInRoom(roomDocId, myUid);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          toastError('Room', msg);
          onLeave();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomDocId, myUid, onLeave]);

  useEffect(() => {
    const unsub = firestore()
      .collection(COL_TEST_CHATS)
      .doc(roomDocId)
      .onSnapshot(
        snap => {
          if (!snap.exists()) {
            setParticipantIds([]);
            setRoomRow(null);
            return;
          }
          const raw = snap.data() ?? {};
          const ids = Array.isArray(raw.participantIds)
            ? raw.participantIds
            : [];
          setParticipantIds(ids);
          setRoomRow({
            joinCode:
              typeof raw.joinCode === 'string' ? raw.joinCode : '',
            name: typeof raw.name === 'string' ? raw.name : 'Room',
            createdBy:
              typeof raw.createdBy === 'string' ? raw.createdBy : '',
            createdAt: raw.createdAt ?? null,
            participantIds: ids,
          });
        },
        err => console.warn('room snapshot', err),
      );
    return unsub;
  }, [roomDocId]);

  const displayJoinCode = useMemo(() => {
    if (roomRow) {
      return getDisplayJoinCode(roomRow, roomDocId);
    }
    return '…';
  }, [roomRow, roomDocId]);

  const otherUid = useMemo(() => {
    if (!myUid) {
      return null;
    }
    return participantIds.find(id => id !== myUid) ?? null;
  }, [myUid, participantIds]);

  const voiceEnabled = micReady && !!otherUid;

  const { remoteStream, phase, errorMessage, localSpeaking } = useVoiceRoom(
    roomDocId,
    myUid,
    otherUid,
    voiceEnabled,
  );

  const onExit = useCallback(async () => {
    if (exitingRef.current) {
      return;
    }
    exitingRef.current = true;
    try {
      if (!myUid) {
        onLeave();
        return;
      }
      try {
        await leaveRoom(roomDocId, myUid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toastError('Leave room', msg);
      }
      onLeave();
    } finally {
      exitingRef.current = false;
    }
  }, [myUid, roomDocId, onLeave]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      // Only background — not "inactive" (keyboard, permission sheet would fire that)
      if (next === 'background') {
        onExit();
      }
    });
    return () => sub.remove();
  }, [onExit]);

  const shareCode = async () => {
    try {
      await Share.share({
        message: `Join my voice room on TestApp. Join code: ${displayJoinCode}`,
        title: 'Voice room',
      });
    } catch {
      /* dismissed */
    }
  };

  const statusLine =
    permError ??
    errorMessage ??
    (otherUid ? `Voice: ${phase}` : 'Waiting for the other participant…');

  const pulseVisible = phase === 'connected' && micReady;
  const pulseEnergetic = localSpeaking && pulseVisible;

  return (
    <ScreenSafeArea edges={['left', 'right', 'bottom']}>
      <View
        style={[
          styles.container,
          {
            paddingHorizontal: layout.horizontalPad,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
            maxWidth: layout.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Voice room</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {roomRow?.name ?? 'Live conversation'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel="Leave room">
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.codeCard}>
          <View style={styles.codeCardContent}>
            <Text style={styles.codeLabel}>Join code (share this)</Text>
            <Text style={styles.codeLarge}>{displayJoinCode}</Text>
          </View>
          <TouchableOpacity
            style={styles.sharePill}
            onPress={shareCode}
            accessibilityRole="button"
            accessibilityLabel="Share join code">
            <Text style={styles.sharePillText}>Share</Text>
          </TouchableOpacity>
        </View>

        <SpeakingPulse visible={pulseVisible} energetic={pulseEnergetic} />

        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <Text style={styles.infoLabel}>Participants</Text>
            <Text style={styles.infoValue}>
              {participantIds.length} / 2
            </Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text
              style={[
                styles.infoValue,
                {
                  color:
                    phase === 'connected'
                      ? colors.success
                      : phase === 'error'
                        ? colors.danger
                        : colors.accentMuted,
                },
              ]}>
              {phase === 'connected'
                ? 'Active'
                : phase === 'error'
                  ? 'Error'
                  : 'Ready'}
            </Text>
          </View>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Call status</Text>
          <Text style={styles.status}>{statusLine}</Text>
        </View>

        {!micReady && !permError && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator
              size="large"
              color={colors.accentMuted}
              style={styles.spinner}
            />
            <Text style={styles.loadingText}>Initializing microphone…</Text>
          </View>
        )}

        {remoteStream && (
          <RTCView
            style={styles.hiddenRtc}
            streamURL={remoteStream.toURL()}
            objectFit="cover"
          />
        )}

        <TouchableOpacity
          style={styles.leave}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Leave room">
          <Text style={styles.leaveText}>Leave room</Text>
        </TouchableOpacity>
      </View>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  title: {
    fontSize: font.title + 2,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: font.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: font.small,
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeCardContent: {
    flex: 1,
    minWidth: 0,
  },
  codeLabel: {
    fontSize: font.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 4,
  },
  codeLarge: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accentMuted,
    letterSpacing: 4,
  },
  sharePill: {
    backgroundColor: colors.surface2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    marginLeft: 12,
  },
  sharePillText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: font.small,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  infoPill: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 12,
  },
  infoLabel: {
    fontSize: font.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: font.headline,
    fontWeight: '800',
    color: colors.accentMuted,
  },
  statusBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: font.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  status: { color: colors.text, fontSize: font.body, lineHeight: 22 },
  spinnerWrap: {
    alignItems: 'center',
    marginVertical: 20,
  },
  spinner: { marginBottom: 12 },
  loadingText: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  hiddenRtc: {
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  leave: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  leaveText: { color: '#fff', fontWeight: '800', fontSize: font.body },
});
