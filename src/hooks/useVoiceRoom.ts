import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  orderBy,
  query,
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { nanoid } from 'nanoid';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import { COL_TEST_CHATS } from '../constants';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function signalsCol(roomDocId: string) {
  const db = getFirestore();
  return collection(db, COL_TEST_CHATS, roomDocId, 'signals');
}

async function sendSignal(
  roomDocId: string,
  voiceSessionId: string,
  payload: {
    fromUid: string;
    toUid: string;
    signalType: 'offer' | 'answer' | 'candidate';
    sdp?: string;
    candidateJson?: string;
  },
) {
  await addDoc(signalsCol(roomDocId), {
    ...payload,
    sessionId: voiceSessionId,
    t: Date.now(),
    createdAt: serverTimestamp(),
  });
}

export function useVoiceRoom(
  roomDocId: string | null,
  myUid: string | null,
  otherUid: string | null,
  enabled: boolean,
) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'acquiring' | 'signaling' | 'connected' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lastAudioBytesRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const pendingRemoteIce = useRef<RTCIceCandidate[]>([]);
  const unsubSignalsRef = useRef<(() => void) | null>(null);
  const offerSentRef = useRef(false);
  const sessionCreatingRef = useRef(false);
  const voiceSessionIdRef = useRef<string | null>(null);

  voiceSessionIdRef.current = voiceSessionId;

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      return;
    }
    const list = pendingRemoteIce.current.splice(
      0,
      pendingRemoteIce.current.length,
    );
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn('addIceCandidate', e);
      }
    }
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    setPhase('acquiring');
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const teardownMedia = useCallback(() => {
    unsubSignalsRef.current?.();
    unsubSignalsRef.current = null;
    processedIds.current.clear();
    offerSentRef.current = false;
    pendingRemoteIce.current = [];

    if (pcRef.current) {
      const pc = pcRef.current;
      // Nullify listeners to prevent close() from triggering error states
      (pc as any).onconnectionstatechange = null;
      (pc as any).onicecandidate = null;
      (pc as any).ontrack = null;
      pc.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    setErrorMessage(null);
    setPhase('idle');
    setAudioLevel(0);
    smoothedLevelRef.current = 0;
    lastAudioBytesRef.current = 0;
  }, []);

  useEffect(() => {
    if (!roomDocId || !enabled) {
      setVoiceSessionId(null);
      return;
    }
    const db = getFirestore();
    const docRef = doc(db, COL_TEST_CHATS, roomDocId);
    const unsub = onSnapshot(docRef, snap => {
      if (!snap.exists) {
        setVoiceSessionId(null);
        return;
      }
      const sid = snap.data()?.voiceCallSessionId;
      setVoiceSessionId(
        typeof sid === 'string' && sid.length > 0 ? sid : null,
      );
    });
    return unsub;
  }, [roomDocId, enabled]);

  useEffect(() => {
    if (!enabled || !roomDocId || !myUid || !otherUid) {
      return;
    }
    const sorted = [myUid, otherUid].sort();
    if (sorted[0] !== myUid) {
      return;
    }
    if (voiceSessionId) {
      sessionCreatingRef.current = false;
      return;
    }
    if (sessionCreatingRef.current) {
      return;
    }
    sessionCreatingRef.current = true;
    const db = getFirestore();
    const roomRef = doc(db, COL_TEST_CHATS, roomDocId);
    runTransaction(db, async t => {
      const snap = await t.get(roomRef);
      if (!snap.exists) {
        return;
      }
      const existing = snap.data()?.voiceCallSessionId;
      if (typeof existing === 'string' && existing.length > 0) {
        return;
      }
      t.update(roomRef, { voiceCallSessionId: nanoid(16) });
    })
      .catch(err => console.warn('voice session transaction', err))
      .finally(() => {
        sessionCreatingRef.current = false;
      });
  }, [enabled, roomDocId, myUid, otherUid, voiceSessionId]);

  const setupPeer = useCallback(
    async (stream: MediaStream) => {
      if (pcRef.current) {
        return pcRef.current;
      }
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      (pc as unknown as { ontrack?: (e: { streams: MediaStream[] }) => void }).ontrack = e => {
        const rs = e.streams[0];
        if (rs) {
          setRemoteStream(rs);
        }
      };

      const pcAny = pc as RTCPeerConnection & {
        onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null;
        onconnectionstatechange: (() => void) | null;
      };

      pcAny.onicecandidate = ev => {
        const sid = voiceSessionIdRef.current;
        if (!roomDocId || !myUid || !otherUid || !sid) {
          return;
        }
        if (ev.candidate) {
          sendSignal(roomDocId, sid, {
            fromUid: myUid,
            toUid: otherUid,
            signalType: 'candidate',
            candidateJson: JSON.stringify(ev.candidate.toJSON()),
          }).catch(err => console.warn('send ice', err));
        }
      };

      pcAny.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          setPhase('connected');
        }
        if (st === 'failed' || st === 'closed') {
          setErrorMessage(prev => prev ?? 'Connection failed');
          setPhase('error');
        }
      };

      return pc;
    },
    [myUid, otherUid, roomDocId],
  );

  const processDoc = useCallback(
    async (
      id: string,
      raw: FirebaseFirestoreTypes.DocumentData,
      activeSessionId: string,
    ) => {
      if (!roomDocId || !myUid || !otherUid) {
        return;
      }
      if (raw.sessionId !== activeSessionId) {
        return;
      }
      if (processedIds.current.has(id)) {
        return;
      }

      const fromUid = raw.fromUid as string;
      const toUid = raw.toUid as string;
      if (toUid !== myUid || fromUid !== otherUid) {
        return;
      }

      const signalType = raw.signalType as 'offer' | 'answer' | 'candidate';

      const stream = localStreamRef.current;
      if (!stream) {
        return;
      }

      processedIds.current.add(id);

      const pc = await setupPeer(stream);

      if (signalType === 'offer' && raw.sdp) {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: raw.sdp }),
        );
        await flushPendingIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(roomDocId, activeSessionId, {
          fromUid: myUid,
          toUid: otherUid,
          signalType: 'answer',
          sdp: answer.sdp ?? '',
        });
        return;
      }

      if (signalType === 'answer' && raw.sdp) {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: raw.sdp }),
        );
        await flushPendingIce();
        return;
      }

      if (signalType === 'candidate' && raw.candidateJson) {
        const init = JSON.parse(raw.candidateJson);
        const candidate = new RTCIceCandidate(init);
        try {
          if (!pc.remoteDescription) {
            pendingRemoteIce.current.push(candidate);
          } else {
            await pc.addIceCandidate(candidate);
          }
        } catch {
          pendingRemoteIce.current.push(candidate);
        }
      }
    },
    [flushPendingIce, myUid, otherUid, roomDocId, setupPeer],
  );

  useEffect(() => {
    if (!enabled || !roomDocId || !myUid || !otherUid || !voiceSessionId) {
      teardownMedia();
      return;
    }

    const sid = voiceSessionId;
    let cancelled = false;

    (async () => {
      try {
        setErrorMessage(null);
        processedIds.current.clear();
        offerSentRef.current = false;
        const stream = await ensureLocalStream();
        if (cancelled) {
          return;
        }

        await setupPeer(stream);
        if (cancelled) {
          return;
        }

        setPhase('signaling');

        const amCaller = myUid < otherUid;

        if (cancelled) {
          return;
        }

        unsubSignalsRef.current = onSnapshot(
          query(signalsCol(roomDocId), orderBy('t', 'asc')),
          snapshot => {
            snapshot.docChanges().forEach(ch => {
              if (ch.type === 'added') {
                processDoc(ch.doc.id, ch.doc.data(), sid).catch(e =>
                  console.warn('processDoc', e),
                );
              }
            });
          },
        );

        if (cancelled) {
          return;
        }

        if (amCaller && !offerSentRef.current) {
          const pc = pcRef.current;
          if (!pc) {
            return;
          }
          offerSentRef.current = true;
          const offer = await pc.createOffer({ voiceActivityDetection: true });
          if (cancelled) {
            return;
          }
          await pc.setLocalDescription(offer);
          await sendSignal(roomDocId, sid, {
            fromUid: myUid,
            toUid: otherUid,
            signalType: 'offer',
            sdp: offer.sdp ?? '',
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(msg);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      teardownMedia();
    };
  }, [
    enabled,
    ensureLocalStream,
    myUid,
    otherUid,
    processDoc,
    roomDocId,
    setupPeer,
    teardownMedia,
    voiceSessionId,
  ]);

  useEffect(() => {
    if (phase !== 'connected') {
      setAudioLevel(0);
      smoothedLevelRef.current = 0;
      lastAudioBytesRef.current = 0;
      return;
    }
    const id = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) {
        return;
      }
      try {
        const stats = await pc.getStats();
        let maxBytes = 0;
        const visit = (r: Record<string, unknown>) => {
          if (
            r.type === 'outbound-rtp' &&
            r.kind === 'audio' &&
            typeof r.bytesSent === 'number'
          ) {
            maxBytes = Math.max(maxBytes, r.bytesSent);
          }
        };
        if (stats && typeof (stats as Map<string, unknown>).forEach === 'function') {
          (stats as Map<string, Record<string, unknown>>).forEach(r => visit(r));
        } else if (stats && typeof stats === 'object') {
          Object.values(stats as Record<string, unknown>).forEach(r =>
            visit(r as Record<string, unknown>),
          );
        }
        const prev = lastAudioBytesRef.current;
        const delta = maxBytes - prev;
        lastAudioBytesRef.current = maxBytes;
        const raw = Math.min(1, Math.max(0, delta / 420));
        smoothedLevelRef.current =
          smoothedLevelRef.current * 0.62 + raw * 0.38;
        setAudioLevel(smoothedLevelRef.current);
      } catch {
        setAudioLevel(0);
      }
    }, 180);
    return () => clearInterval(id);
  }, [phase]);

  const localSpeaking = audioLevel > 0.14;

  return {
    remoteStream,
    phase,
    errorMessage,
    teardown: teardownMedia,
    audioLevel,
    localSpeaking,
    voiceSessionReady: !!voiceSessionId,
  };
}
