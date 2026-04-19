import { useCallback, useEffect, useRef, useState } from 'react';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import { COL_TEST_CHATS } from '../constants';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function signalsCol(roomDocId: string) {
  return firestore()
    .collection(COL_TEST_CHATS)
    .doc(roomDocId)
    .collection('signals');
}

async function sendSignal(
  roomDocId: string,
  payload: {
    fromUid: string;
    toUid: string;
    signalType: 'offer' | 'answer' | 'candidate';
    sdp?: string;
    candidateJson?: string;
  },
) {
  await signalsCol(roomDocId).add({
    ...payload,
    t: Date.now(),
    createdAt: firestore.FieldValue.serverTimestamp(),
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
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lastAudioBytesRef = useRef(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const pendingRemoteIce = useRef<RTCIceCandidate[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);
  const offerSentRef = useRef(false);

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

  const teardown = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    processedIds.current.clear();
    offerSentRef.current = false;
    pendingRemoteIce.current = [];

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    setPhase('idle');
    setLocalSpeaking(false);
    lastAudioBytesRef.current = 0;
  }, []);

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
        if (!roomDocId || !myUid || !otherUid) {
          return;
        }
        if (ev.candidate) {
          sendSignal(roomDocId, {
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
    async (id: string, raw: FirebaseFirestoreTypes.DocumentData) => {
      if (!roomDocId || !myUid || !otherUid) {
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
        await sendSignal(roomDocId, {
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
    if (!enabled || !roomDocId || !myUid || !otherUid) {
      teardown();
      return;
    }

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

        unsubRef.current = signalsCol(roomDocId)
          .orderBy('t', 'asc')
          .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(ch => {
              if (ch.type === 'added') {
                processDoc(ch.doc.id, ch.doc.data()).catch(e =>
                  console.warn('processDoc', e),
                );
              }
            });
          });

        if (amCaller && !offerSentRef.current) {
          const pc = pcRef.current;
          if (!pc) {
            return;
          }
          offerSentRef.current = true;
          const offer = await pc.createOffer({ voiceActivityDetection: true });
          await pc.setLocalDescription(offer);
          await sendSignal(roomDocId, {
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
      teardown();
    };
  }, [
    enabled,
    ensureLocalStream,
    myUid,
    otherUid,
    processDoc,
    roomDocId,
    setupPeer,
    teardown,
  ]);

  useEffect(() => {
    if (phase !== 'connected') {
      setLocalSpeaking(false);
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
        const active = maxBytes > prev + 40;
        lastAudioBytesRef.current = maxBytes;
        setLocalSpeaking(active);
      } catch {
        setLocalSpeaking(false);
      }
    }, 220);
    return () => clearInterval(id);
  }, [phase]);

  return { remoteStream, phase, errorMessage, teardown, localSpeaking };
}
