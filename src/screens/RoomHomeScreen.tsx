import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import { COL_TEST_CHATS } from '../constants';
import { createRoom, joinRoom } from '../services/rooms';
import {
  RoomRecentDoc,
  subscribeRoomRecents,
} from '../services/roomRecents';
import { ScreenSafeArea } from '../components/ScreenSafeArea';
import { colors, font, layout } from '../theme/tokens';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '../utils/roomCode';
import { toastError, toastSuccess } from '../utils/toast';

type Props = {
  /** Firestore document id for the room */
  onOpenRoom: (roomDocId: string) => void;
  onLogout: () => void;
};

const NAME_MAX = 40;
const SPACER_H = 20;

export function RoomHomeScreen({ onOpenRoom, onLogout }: Props) {
  const uid = auth().currentUser?.uid;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('Demo room');
  const [joinId, setJoinId] = useState('');
  const [rooms, setRooms] = useState<{ id: string; data: RoomRecentDoc }[]>([]);
  const [liveParticipantCount, setLiveParticipantCount] = useState<
    Record<string, number>
  >({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) {
      setRooms([]);
      return;
    }
    const unsub = subscribeRoomRecents(uid, setRooms);
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid || rooms.length === 0) {
      setLiveParticipantCount({});
      return;
    }
    const unsubs = rooms.map(({ id }) =>
      firestore()
        .collection(COL_TEST_CHATS)
        .doc(id)
        .onSnapshot(
          snap => {
            if (!snap.exists()) {
              setLiveParticipantCount(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
              return;
            }
            const raw = snap.data();
            const ids = Array.isArray(raw?.participantIds)
              ? raw.participantIds
              : [];
            setLiveParticipantCount(prev => ({
              ...prev,
              [id]: ids.length,
            }));
          },
          err => console.warn('live room snapshot', id, err),
        ),
    );
    return () => unsubs.forEach(u => u());
  }, [uid, rooms]);

  const onCreate = async () => {
    if (!uid) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toastError('Room name', 'Enter a name for the room.');
      return;
    }
    if (trimmed.length > NAME_MAX) {
      toastError('Room name', `Use at most ${NAME_MAX} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { roomDocId, joinCode } = await createRoom(trimmed, uid);
      toastSuccess('Room created', `Join code: ${joinCode}`);
      onOpenRoom(roomDocId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toastError('Could not create room', msg);
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!uid) {
      return;
    }
    const normalized = normalizeRoomCode(joinId);
    if (normalized.length !== ROOM_CODE_LENGTH) {
      toastError(
        'Room code',
        `Enter the ${ROOM_CODE_LENGTH}-character code.`,
      );
      return;
    }
    setBusy(true);
    try {
      const roomDocId = await joinRoom(normalized, uid);
      toastSuccess('Joined', `Room code ${normalized}`);
      onOpenRoom(roomDocId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toastError('Could not join', msg);
    } finally {
      setBusy(false);
    }
  };

  const onShareCode = useCallback(async (joinCode: string) => {
    try {
      await Share.share({
        message: `Join my voice room on TestApp. Join code: ${joinCode}`,
        title: 'Voice room',
      });
    } catch {
      /* user dismissed */
    }
  }, []);

  const header = (
    <View>
      <View style={styles.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Voice rooms</Text>
          <Text style={styles.subtitle}>
            Use a 6-character join code. Recent list updates live (rooms you
            created or joined).
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={onLogout}
          accessibilityRole="button"
          accessibilityLabel="Logout">
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create room</Text>
        <Text style={styles.label}>Room name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={t => setName(t.slice(0, NAME_MAX))}
          placeholder="e.g. Team standup"
          placeholderTextColor={colors.textDim}
          maxLength={NAME_MAX}
          accessibilityLabel="Room name"
        />
        <Text style={styles.counter}>
          {name.trim().length}/{NAME_MAX}
        </Text>

        <TouchableOpacity
          style={[styles.primary, busy && styles.disabled]}
          onPress={onCreate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Create room and enter">
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Create & enter room</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join room</Text>
        <Text style={styles.label}>Room code</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={joinId}
          onChangeText={t =>
            setJoinId(normalizeRoomCode(t).slice(0, ROOM_CODE_LENGTH))
          }
          placeholder="e.g. K7P2M9"
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={ROOM_CODE_LENGTH}
          accessibilityLabel="Room code to join"
        />

        <TouchableOpacity
          style={[styles.secondary, busy && styles.disabled]}
          onPress={onJoin}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Join room with code">
          <Text style={styles.secondaryText}>Join room</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: SPACER_H }} />
      <Text style={styles.recentLabel}>Recent rooms</Text>
    </View>
  );

  return (
    <ScreenSafeArea edges={['left', 'right', 'bottom']}>
      <FlatList
        data={rooms}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: layout.horizontalPad,
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 8) + 16,
            maxWidth: layout.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        ListEmptyComponent={
          <Text style={styles.empty}>No rooms yet. Create one above.</Text>
        }
        renderItem={({ item }) => {
          const code =
            item.data.joinCode.length > 0
              ? item.data.joinCode
              : item.data.roomDocId.slice(0, 6);
          const live = liveParticipantCount[item.id];
          const countLabel =
            typeof live === 'number' ? `${live} / 2 live` : '…';
          return (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => onOpenRoom(item.data.roomDocId)}
                accessibilityRole="button"
                accessibilityLabel={`Open room ${item.data.name}`}>
                <Text style={styles.rowTitle}>{item.data.name}</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeBadge}>{code}</Text>
                </View>
                <Text style={styles.rowMeta}>{countLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => onShareCode(code)}
                accessibilityRole="button"
                accessibilityLabel="Share join code">
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        scrollIndicatorInsets={{ right: 1 }}
      />
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
    gap: 12,
  },
  title: {
    fontSize: font.title + 4,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: font.small,
    color: colors.textMuted,
    lineHeight: 20,
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: font.small,
  },
  section: {
    marginBottom: SPACER_H,
  },
  sectionTitle: {
    fontSize: font.headline,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  label: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: font.body,
    backgroundColor: colors.surface2,
    marginBottom: 6,
  },
  codeInput: {
    letterSpacing: 4,
    fontWeight: '700',
    textAlign: 'center',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.textDim,
    fontSize: font.caption,
    marginBottom: 14,
  },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: font.body },
  secondary: {
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: font.body },
  disabled: { opacity: 0.55 },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginBottom: SPACER_H,
  },
  recentLabel: {
    fontSize: font.headline,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  empty: { color: colors.textDim, paddingVertical: 2, fontSize: font.small },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, padding: 14 },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: font.headline },
  codeRow: { marginTop: 8 },
  codeBadge: {
    color: colors.accentMuted,
    fontWeight: '800',
    letterSpacing: 3,
    fontSize: font.headline,
  },
  rowMeta: { color: colors.textMuted, fontSize: font.caption, marginTop: 6 },
  shareBtn: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.surface2,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderMuted,
  },
  shareBtnText: {
    color: colors.accentMuted,
    fontWeight: '700',
    fontSize: font.small,
  },
});
