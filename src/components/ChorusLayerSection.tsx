import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  increment,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import {
  startChorusRecording,
  startChorusHarmonyRecording,
  extractAudioDuration,
  formatAudioDuration,
  type ChorusRecorderHandle,
} from '../utils/chorusAudioRecorder';
import {
  uploadChorusAudio,
  recordingBlobFileName,
  waitForFirebaseAuth,
  formatUploadError,
} from '../utils/chorusAudioUpload';
import { ChorusChainPlayer } from '../utils/chorusChainPlayer';
import { ChorusAudioMixer } from '../utils/chorusAudioMixer';
import { Mic, Square, Send, Trash2, Loader, Play, Pause, Layers, Heart, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import '../styles/ChorusLayerSection.css';

export interface ChorusLayer {
  id: string;
  postId: string;
  writerUid: string;
  writerNickname: string;
  writerGrade?: string;
  audioUrl: string;
  duration: number;
  content?: string;
  createdAt: any;
  isAudioLayer: true;
  harmonyParentKey?: string;
  layerMode?: 'chain' | 'harmony';
  parentId?: string | null;
  likedBy?: string[];
  likesCount?: number;
}

interface TextComment {
  id: string;
  postId: string;
  writerUid: string;
  writerNickname: string;
  writerGrade?: string;
  content: string;
  createdAt: any;
  parentId?: string | null;
  likedBy?: string[];
  likesCount?: number;
}

interface User {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
  grade?: string;
}

interface PostInfo {
  id: string;
  title: string;
  writerUid: string;
  writerNickname: string;
}

interface BasePhrase {
  audioUrl: string;
  writerNickname: string;
  writerGrade?: string;
  writerUid: string;
  duration: number;
}

interface ChainItem {
  key: string;
  parentKey: string;
  phraseIndex: number;
  audioUrl: string;
  writerNickname: string;
  writerGrade?: string;
  writerUid: string;
  duration: number;
  memo?: string;
  layerId?: string;
  isBase: boolean;
}

export interface HarmonyTarget {
  parentKey: string;
  audioUrl: string;
  label: string;
}

export interface ChorusLayerSectionHandle {
  startHarmonyOn: (target: HarmonyTarget) => void;
}

const MAX_RECORD_SECONDS = 180;
const BASE_PARENT_KEY = 'base';

function commentTime(createdAt: unknown): number {
  if (!createdAt) return 0;
  const value = createdAt as { toDate?: () => Date };
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (createdAt instanceof Date) return createdAt.getTime();
  const parsed = new Date(createdAt as string | number).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCommentDocs(docs: { id: string; data: () => Record<string, unknown> }[]) {
  const chain: ChorusLayer[] = [];
  const harmonies: ChorusLayer[] = [];
  const text: TextComment[] = [];

  docs.forEach((d) => {
    const data = d.data();
    if (data.parentId) {
      if (typeof data.content === 'string' && data.content.trim()) {
        text.push({ id: d.id, ...data } as TextComment);
      }
      return;
    }
    if (data.isAudioLayer) {
      const item = { id: d.id, ...data } as ChorusLayer;
      if (data.harmonyParentKey) harmonies.push(item);
      else chain.push(item);
    } else if (typeof data.content === 'string' && data.content.trim()) {
      text.push({ id: d.id, ...data } as TextComment);
    }
  });

  const byTime = <T extends { createdAt: unknown }>(list: T[]) =>
    [...list].sort((a, b) => commentTime(a.createdAt) - commentTime(b.createdAt));

  return {
    chain: byTime(chain),
    harmonies: byTime(harmonies),
    text: byTime(text),
  };
}

interface Props {
  postId: string;
  post: PostInfo;
  user: User | null;
  basePhrase: BasePhrase;
  onLayersChange?: (layers: ChorusLayer[]) => void;
  onChainPlayingChange?: (playing: boolean) => void;
}

const ChorusLayerSection = forwardRef<ChorusLayerSectionHandle, Props>(function ChorusLayerSection(
  { postId, post, user, basePhrase, onLayersChange, onChainPlayingChange },
  ref
) {
  const [chainLayers, setChainLayers] = useState<ChorusLayer[]>([]);
  const [harmonyLayers, setHarmonyLayers] = useState<ChorusLayer[]>([]);
  const [textComments, setTextComments] = useState<TextComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [harmonyTarget, setHarmonyTarget] = useState<HarmonyTarget | null>(null);
  const [chainPlaying, setChainPlaying] = useState(false);
  const [activePhraseIndex, setActivePhraseIndex] = useState(-1);
  const [soloPlayingKey, setSoloPlayingKey] = useState<string | null>(null);
  const [mixingKey, setMixingKey] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const recorderRef = useRef<ChorusRecorderHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const chainPlayerRef = useRef<ChorusChainPlayer | null>(null);
  const soloAudioRef = useRef<HTMLAudioElement | null>(null);
  const mixerRef = useRef<ChorusAudioMixer | null>(null);
  const onLayersChangeRef = useRef(onLayersChange);

  useEffect(() => {
    onLayersChangeRef.current = onLayersChange;
  }, [onLayersChange]);

  const chainItems: ChainItem[] = useMemo(() => {
    const base: ChainItem = {
      key: 'base',
      parentKey: BASE_PARENT_KEY,
      phraseIndex: 1,
      audioUrl: basePhrase.audioUrl,
      writerNickname: basePhrase.writerNickname,
      writerGrade: basePhrase.writerGrade,
      writerUid: basePhrase.writerUid,
      duration: basePhrase.duration,
      isBase: true,
    };
    const rest = chainLayers.map((layer, i) => ({
      key: layer.id,
      parentKey: layer.id,
      phraseIndex: i + 2,
      audioUrl: layer.audioUrl,
      writerNickname: layer.writerNickname,
      writerGrade: layer.writerGrade,
      writerUid: layer.writerUid,
      duration: layer.duration,
      memo: layer.content,
      layerId: layer.id,
      isBase: false,
    }));
    return [base, ...rest];
  }, [basePhrase, chainLayers]);

  const harmoniesByParent = useMemo(() => {
    const map: Record<string, ChorusLayer[]> = {};
    for (const h of harmonyLayers) {
      const key = h.harmonyParentKey || '';
      if (!map[key]) map[key] = [];
      map[key].push(h);
    }
    return map;
  }, [harmonyLayers]);

  const resolveAudioUrlForHarmonyKey = useCallback(
    (parentKey: string): string | null => {
      if (parentKey === BASE_PARENT_KEY) return basePhrase.audioUrl;
      let current: string | null | undefined = parentKey;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        const chain = chainLayers.find((l) => l.id === current);
        if (chain) return chain.audioUrl;
        const harmony = harmonyLayers.find((h) => h.id === current);
        if (harmony) return harmony.audioUrl;
        const text = textComments.find((t) => t.id === current);
        current = text?.parentId ?? null;
      }
      return null;
    },
    [chainLayers, harmonyLayers, textComments, basePhrase.audioUrl]
  );

  const chainUrls = useMemo(() => chainItems.map((c) => c.audioUrl), [chainItems]);

  const topLevelTextComments = useMemo(
    () => textComments.filter((c) => !c.parentId),
    [textComments]
  );

  const repliesByParent = useMemo(() => {
    const map: Record<string, TextComment[]> = {};
    for (const c of textComments) {
      if (!c.parentId) continue;
      if (!map[c.parentId]) map[c.parentId] = [];
      map[c.parentId].push(c);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => commentTime(a.createdAt) - commentTime(b.createdAt));
    }
    return map;
  }, [textComments]);

  const topLevelBaseHarmonies = useMemo(
    () => harmonyLayers.filter((h) => h.harmonyParentKey === BASE_PARENT_KEY),
    [harmonyLayers]
  );

  const topLevelFeed = useMemo(() => {
    type FeedItem = (ChorusLayer | TextComment) & { feedKind: 'audio' | 'text' | 'harmony' };
    const items: FeedItem[] = [
      ...chainLayers.map((c) => ({ ...c, feedKind: 'audio' as const })),
      ...topLevelTextComments.map((c) => ({ ...c, feedKind: 'text' as const })),
      ...topLevelBaseHarmonies.map((h) => ({ ...h, feedKind: 'harmony' as const })),
    ];
    return items.sort((a, b) => commentTime(a.createdAt) - commentTime(b.createdAt));
  }, [chainLayers, topLevelTextComments, topLevelBaseHarmonies]);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAudioPreviewUrl(null);
    setAudioBlob(null);
    setDuration(0);
  }, []);

  const stopAllPlayback = useCallback(() => {
    chainPlayerRef.current?.stop();
    setChainPlaying(false);
    setActivePhraseIndex(-1);
    soloAudioRef.current?.pause();
    setSoloPlayingKey(null);
    mixerRef.current?.stopAll();
    setMixingKey(null);
    onChainPlayingChange?.(false);
  }, [onChainPlayingChange]);

  const clearHarmonyTarget = useCallback(() => {
    setHarmonyTarget(null);
    clearPreview();
  }, [clearPreview]);

  const startHarmonyOn = useCallback(
    (target: HarmonyTarget) => {
      if (!user) {
        toast.info('로그인이 필요합니다.');
        return;
      }
      stopAllPlayback();
      clearPreview();
      setDraft('');

      let anchor = target;
      const isDirectHarmonyTarget = harmonyLayers.some((h) => h.id === target.parentKey);
      const shouldAnchorToLatestReply =
        !isDirectHarmonyTarget &&
        (target.parentKey === BASE_PARENT_KEY ||
          chainLayers.some((c) => c.id === target.parentKey));
      const childReplies = repliesByParent[target.parentKey];
      if (shouldAnchorToLatestReply && childReplies?.length) {
        const latest = childReplies[childReplies.length - 1];
        anchor = {
          parentKey: latest.id,
          audioUrl: target.audioUrl,
          label: latest.writerNickname,
        };
      }

      setHarmonyTarget(anchor);
      toast.info(`${anchor.label} — 원곡을 들으며 화음을 녹음해 보세요`);
    },
    [user, stopAllPlayback, clearPreview, repliesByParent, harmonyLayers, chainLayers]
  );

  useImperativeHandle(ref, () => ({ startHarmonyOn }), [startHarmonyOn]);

  useEffect(() => {
    const player = new ChorusChainPlayer();
    player.onIndex((idx) => setActivePhraseIndex(idx));
    player.onPlayingChange((playing) => {
      setChainPlaying(playing);
      onChainPlayingChange?.(playing);
      if (!playing) setActivePhraseIndex(-1);
    });
    chainPlayerRef.current = player;
    mixerRef.current = new ChorusAudioMixer();
    return () => {
      player.dispose();
      chainPlayerRef.current = null;
      mixerRef.current?.dispose();
      mixerRef.current = null;
    };
  }, [onChainPlayingChange]);

  useEffect(() => {
    chainPlayerRef.current?.setUrls(chainUrls);
  }, [chainUrls]);

  useEffect(() => {
    const applySnap = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => {
      const parsed = parseCommentDocs(snap.docs);
      setChainLayers(parsed.chain);
      setHarmonyLayers(parsed.harmonies);
      setTextComments(parsed.text);
      onLayersChangeRef.current?.(parsed.chain);
      setLoading(false);
    };

    const orderedQ = query(
      collection(db, 'comments'),
      where('postId', '==', postId),
      orderBy('createdAt', 'asc')
    );

    let fallbackUnsub: (() => void) | null = null;
    const unsub = onSnapshot(
      orderedQ,
      applySnap,
      () => {
        const fallbackQ = query(collection(db, 'comments'), where('postId', '==', postId));
        fallbackUnsub = onSnapshot(fallbackQ, applySnap);
      }
    );

    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [postId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.cancel();
      clearPreview();
      chainPlayerRef.current?.dispose();
      soloAudioRef.current?.pause();
      mixerRef.current?.dispose();
    };
  }, [clearPreview]);

  const applyBlobPreview = async (blob: Blob) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setAudioBlob(blob);
    setAudioPreviewUrl(url);
    const dur = await extractAudioDuration(url);
    setDuration(dur);
  };

  const stopRecordingAndGetBlob = async (): Promise<Blob | null> => {
    if (!recorderRef.current) return null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      if (!blob || blob.size === 0) {
        toast.warn('녹음된 내용이 없습니다.');
        return null;
      }
      await applyBlobPreview(blob);
      return blob;
    } catch {
      toast.error('녹음 저장에 실패했습니다.');
      return null;
    }
  };

  const handleToggleRecording = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    if (recording) {
      await stopRecordingAndGetBlob();
      return;
    }
    try {
      stopAllPlayback();
      clearPreview();
      const handle = harmonyTarget
        ? await startChorusHarmonyRecording(harmonyTarget.audioUrl)
        : await startChorusRecording();
      recorderRef.current = handle;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            void stopRecordingAndGetBlob();
            return MAX_RECORD_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error(harmonyTarget ? '원곡 재생 또는 마이크 권한을 확인해 주세요.' : '마이크 권한이 필요합니다.');
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }

    const text = draft.trim();
    let blob = audioBlob;
    if (recording) {
      const recorded = await stopRecordingAndGetBlob();
      if (recorded) blob = recorded;
    }

    if (!text && !blob) {
      toast.warn('댓글을 입력하거나 녹음해 주세요.');
      return;
    }

    if (blob && harmonyTarget && !harmonyTarget.parentKey) {
      toast.warn('레이어 대상을 다시 선택해 주세요.');
      return;
    }

    try {
      const uid = await waitForFirebaseAuth();
      if (uid !== user.uid) {
        toast.error('로그인 세션이 만료되었습니다.');
        return;
      }
    } catch {
      toast.error('로그인 세션이 만료되었습니다.');
      return;
    }

    setSubmitting(true);
    const now = new Date();
    try {
      if (blob) {
        let audioUrl = '';
        if (blob instanceof File) {
          audioUrl = await uploadChorusAudio(user.uid, blob, blob.name);
        } else {
          const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
          audioUrl = await uploadChorusAudio(user.uid, blob, recordingBlobFileName(ext));
        }
        const layerDur = duration > 0 ? duration : 1;
        const isHarmony = Boolean(harmonyTarget);

        const docRef = await addDoc(collection(db, 'comments'), {
          postId,
          ...(text ? { content: text } : {}),
          writerUid: user.uid,
          writerNickname: user.nickname,
          writerGrade: user.grade || '🍒',
          createdAt: serverTimestamp(),
          isAudioLayer: true,
          audioUrl,
          duration: layerDur,
          layerMode: isHarmony ? 'harmony' : 'chain',
          ...(isHarmony && harmonyTarget
            ? { harmonyParentKey: harmonyTarget.parentKey }
            : {}),
          parentId: null,
          likedBy: [],
          likesCount: 0,
        });

        const optimistic: ChorusLayer = {
          id: docRef.id,
          postId,
          ...(text ? { content: text } : {}),
          writerUid: user.uid,
          writerNickname: user.nickname,
          writerGrade: user.grade || '🍒',
          createdAt: now,
          isAudioLayer: true,
          audioUrl,
          duration: layerDur,
          layerMode: isHarmony ? 'harmony' : 'chain',
          parentId: null,
          likedBy: [],
          likesCount: 0,
          ...(isHarmony && harmonyTarget ? { harmonyParentKey: harmonyTarget.parentKey } : {}),
        };

        if (isHarmony) {
          setHarmonyLayers((prev) =>
            [...prev.filter((h) => h.id !== docRef.id), optimistic].sort(
              (a, b) => commentTime(a.createdAt) - commentTime(b.createdAt)
            )
          );
        } else {
          setChainLayers((prev) => {
            const next = [...prev.filter((h) => h.id !== docRef.id), optimistic].sort(
              (a, b) => commentTime(a.createdAt) - commentTime(b.createdAt)
            );
            onLayersChangeRef.current?.(next);
            return next;
          });
        }

        void updateDoc(doc(db, 'posts', postId), {
          commentCount: increment(1),
          lastCommentAt: serverTimestamp(),
        });

        if (post.writerUid !== user.uid) {
          void NotificationService.createCommentNotification(
            post.writerUid,
            user.uid,
            user.nickname,
            post.id,
            post.title,
            'chorus',
            {
              commentPreview: isHarmony
                ? `${harmonyTarget?.label}에 화음을 얹었어요`
                : text || '녹음을 이어서 불렀어요',
            }
          );
        }

        clearPreview();
        setDraft('');
        if (isHarmony) {
          clearHarmonyTarget();
          toast.success('화음 레이어가 올라갔어요');
        } else {
          toast.success('녹음 댓글이 등록되었습니다');
        }
      } else {
        const docRef = await addDoc(collection(db, 'comments'), {
          postId,
          content: text,
          writerUid: user.uid,
          writerNickname: user.nickname,
          writerGrade: user.grade || '🍒',
          createdAt: serverTimestamp(),
          parentId: null,
          likedBy: [],
          likesCount: 0,
        });

        const optimistic: TextComment = {
          id: docRef.id,
          postId,
          content: text,
          writerUid: user.uid,
          writerNickname: user.nickname,
          writerGrade: user.grade || '🍒',
          createdAt: now,
          parentId: null,
          likedBy: [],
          likesCount: 0,
        };
        setTextComments((prev) =>
          [...prev.filter((c) => c.id !== docRef.id), optimistic].sort(
            (a, b) => commentTime(a.createdAt) - commentTime(b.createdAt)
          )
        );

        void updateDoc(doc(db, 'posts', postId), {
          commentCount: increment(1),
          lastCommentAt: serverTimestamp(),
        });

        if (post.writerUid !== user.uid) {
          void NotificationService.createCommentNotification(
            post.writerUid,
            user.uid,
            user.nickname,
            post.id,
            post.title,
            'chorus',
            { commentPreview: text }
          );
        }

        setDraft('');
        toast.success('댓글이 등록되었습니다');
      }
    } catch (error) {
      console.error('댓글 등록 오류:', error);
      toast.error(formatUploadError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAudioComment = async (layer: ChorusLayer) => {
    if (!user) return;
    if (user.uid !== layer.writerUid && user.role !== '리더' && user.nickname !== '너래') {
      toast.warn('삭제 권한이 없습니다.');
      return;
    }
    const label = layer.layerMode === 'harmony' || layer.harmonyParentKey ? '화음' : '녹음';
    if (!window.confirm(`이 ${label}을 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'comments', layer.id));
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteTextComment = async (comment: TextComment) => {
    if (!user) return;
    if (user.uid !== comment.writerUid && user.role !== '리더' && user.nickname !== '너래') {
      toast.warn('삭제 권한이 없습니다.');
      return;
    }
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'comments', comment.id));
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const patchCommentLike = (commentId: string, liked: boolean, uid: string) => {
    const patch = <T extends { id: string; likedBy?: string[]; likesCount?: number }>(c: T): T => {
      if (c.id !== commentId) return c;
      const likedBy = c.likedBy || [];
      return {
        ...c,
        likedBy: liked ? likedBy.filter((id) => id !== uid) : [...likedBy, uid],
        likesCount: Math.max(0, (c.likesCount || 0) + (liked ? -1 : 1)),
      };
    };
    setChainLayers((prev) => prev.map(patch));
    setHarmonyLayers((prev) => prev.map(patch));
    setTextComments((prev) => prev.map(patch));
  };

  const findCommentById = (commentId: string) =>
    chainLayers.find((c) => c.id === commentId) ||
    harmonyLayers.find((c) => c.id === commentId) ||
    textComments.find((c) => c.id === commentId);

  const handleLike = async (commentId: string) => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    const comment = findCommentById(commentId);
    if (!comment) return;

    const liked = (comment.likedBy || []).includes(user.uid);
    patchCommentLike(commentId, liked, user.uid);

    try {
      await updateDoc(doc(db, 'comments', commentId), {
        likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: increment(liked ? -1 : 1),
      });
    } catch {
      patchCommentLike(commentId, !liked, user.uid);
      toast.error('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    const text = replyDraft.trim();
    if (!text) {
      toast.warn('답글 내용을 입력해 주세요.');
      return;
    }
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    const now = new Date();
    try {
      const docRef = await addDoc(collection(db, 'comments'), {
        postId,
        content: text,
        writerUid: user.uid,
        writerNickname: user.nickname,
        writerGrade: user.grade || '🍒',
        createdAt: serverTimestamp(),
        parentId,
        likedBy: [],
        likesCount: 0,
      });

      const optimistic: TextComment = {
        id: docRef.id,
        postId,
        content: text,
        writerUid: user.uid,
        writerNickname: user.nickname,
        writerGrade: user.grade || '🍒',
        createdAt: now,
        parentId,
        likedBy: [],
        likesCount: 0,
      };
      setTextComments((prev) =>
        [...prev.filter((c) => c.id !== docRef.id), optimistic].sort(
          (a, b) => commentTime(a.createdAt) - commentTime(b.createdAt)
        )
      );

      void updateDoc(doc(db, 'posts', postId), {
        commentCount: increment(1),
        lastCommentAt: serverTimestamp(),
      });

      const parent = findCommentById(parentId);
      if (parent && parent.writerUid !== user.uid) {
        void NotificationService.createCommentNotification(
          parent.writerUid,
          user.uid,
          user.nickname,
          post.id,
          post.title,
          'chorus',
          { commentPreview: text }
        );
      }

      setReplyingToId(null);
      setReplyDraft('');
      toast.success('답글이 등록되었습니다');
    } catch (error) {
      console.error('답글 등록 오류:', error);
      toast.error('답글 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const canDeleteComment = (writerUid: string) =>
    Boolean(user && (user.uid === writerUid || user.role === '리더' || user.nickname === '너래'));

  const renderCommentActions = (commentId: string, writerUid: string, onDelete?: () => void) => {
    const comment = findCommentById(commentId);
    const likesCount = comment?.likesCount || 0;
    const isLiked = Boolean(user && comment?.likedBy?.includes(user.uid));

    return (
      <div className="chorus-comment-actions">
        <button
          type="button"
          className={`chorus-comment-actions__btn${isLiked ? ' chorus-comment-actions__btn--liked' : ''}`}
          onClick={() => void handleLike(commentId)}
          disabled={!user}
          aria-label="좋아요"
        >
          <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
          <span>{likesCount}</span>
        </button>
        <button
          type="button"
          className="chorus-comment-actions__btn"
          onClick={() => {
            if (!user) {
              toast.info('로그인이 필요합니다.');
              return;
            }
            setReplyingToId((prev) => (prev === commentId ? null : commentId));
            setReplyDraft('');
          }}
          aria-label="답글"
        >
          <MessageCircle size={14} />
          <span>답글</span>
        </button>
        {onDelete && canDeleteComment(writerUid) && (
          <button type="button" className="chorus-comment-actions__btn" onClick={onDelete} aria-label="삭제">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

  const renderReplyForm = (parentId: string) => {
    if (replyingToId !== parentId || !user) return null;
    return (
      <div className="chorus-reply-form">
        <input
          type="text"
          className="chorus-reply-form__input"
          value={replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          placeholder="답글을 입력하세요"
          disabled={submitting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmitReply(parentId);
            }
          }}
        />
        <button
          type="button"
          className="chorus-reply-form__send"
          onClick={() => void handleSubmitReply(parentId)}
          disabled={submitting || !replyDraft.trim()}
        >
          {submitting ? <Loader size={16} className="loading-spinner" /> : <Send size={16} />}
        </button>
        <button
          type="button"
          className="chorus-reply-form__cancel"
          onClick={() => {
            setReplyingToId(null);
            setReplyDraft('');
          }}
        >
          취소
        </button>
      </div>
    );
  };

  const renderReplies = (parentId: string) => {
    const replies = repliesByParent[parentId];
    if (!replies?.length) return null;
    return (
      <ul className="chorus-reply-list">
        {replies.map((reply) => {
          const replyAudioUrl = reply.parentId ? resolveAudioUrlForHarmonyKey(reply.parentId) : null;
          const replyHarmonyCount = harmoniesByParent[reply.id]?.length ?? 0;
          return (
            <li key={reply.id} className="chorus-reply-item">
              <div className="chorus-reply-item__head">
                <div className="chorus-reply-item__meta">
                  <span {...getPostListGradeSpanProps(reply.writerGrade)} />
                  <strong>{reply.writerNickname}</strong>
                </div>
                {replyAudioUrl &&
                  renderLayerButton({
                    parentKey: reply.id,
                    audioUrl: replyAudioUrl,
                    label: reply.writerNickname,
                  })}
              </div>
              <p className="chorus-reply-item__body">{reply.content}</p>
              {renderCommentActions(reply.id, reply.writerUid, () => handleDeleteTextComment(reply))}
              {renderReplyForm(reply.id)}
              {renderReplies(reply.id)}
              {replyHarmonyCount > 0 && renderHarmonyRows(reply.id, replyAudioUrl ?? undefined)}
            </li>
          );
        })}
      </ul>
    );
  };

  const handleChainPlayPause = async () => {
    const player = chainPlayerRef.current;
    if (!player) return;
    if (chainPlaying) {
      player.pause();
      return;
    }
    stopAllPlayback();
    await player.play(0);
  };

  const handlePlaySingle = (item: ChainItem) => {
    if (soloPlayingKey === item.key) {
      soloAudioRef.current?.pause();
      setSoloPlayingKey(null);
      return;
    }
    stopAllPlayback();
    if (!soloAudioRef.current) {
      soloAudioRef.current = new Audio();
      soloAudioRef.current.addEventListener('ended', () => setSoloPlayingKey(null));
    }
    soloAudioRef.current.src = item.audioUrl;
    soloAudioRef.current.currentTime = 0;
    void soloAudioRef.current.play();
    setSoloPlayingKey(item.key);
  };

  const handlePlayHarmonySolo = (harmony: ChorusLayer) => {
    if (soloPlayingKey === harmony.id) {
      soloAudioRef.current?.pause();
      setSoloPlayingKey(null);
      return;
    }
    stopAllPlayback();
    if (!soloAudioRef.current) {
      soloAudioRef.current = new Audio();
      soloAudioRef.current.addEventListener('ended', () => setSoloPlayingKey(null));
    }
    soloAudioRef.current.src = harmony.audioUrl;
    soloAudioRef.current.currentTime = 0;
    void soloAudioRef.current.play();
    setSoloPlayingKey(harmony.id);
  };

  const handlePlayMix = async (parentKey: string, parentUrl: string) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (mixingKey === parentKey) {
      mixer.pauseAll();
      setMixingKey(null);
      return;
    }
    const harmonies = harmoniesByParent[parentKey] || [];
    if (harmonies.length === 0) return;

    stopAllPlayback();
    mixer.setTracks([
      { id: 'parent', url: parentUrl },
      ...harmonies.map((h) => ({ id: h.id, url: h.audioUrl, label: h.writerNickname })),
    ]);
    await mixer.playAll();
    setMixingKey(parentKey);
  };

  const renderHarmonyThreadCard = (h: ChorusLayer) => {
    const memo = h.content?.trim();
    const childHarmonyCount = harmoniesByParent[h.id]?.length ?? 0;
    const isMixing = mixingKey === h.id;
    return (
      <div className="chorus-harmony-item chorus-harmony-item--thread chorus-harmony-item--standalone">
        <div className="chorus-harmony-item__main">
          <button
            type="button"
            className="chorus-harmony-item__play"
            onClick={() => handlePlayHarmonySolo(h)}
            aria-label="화음 듣기"
          >
            {soloPlayingKey === h.id ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <div className="chorus-harmony-item__body">
            <span className="chorus-harmony-item__label">
              <Layers size={12} aria-hidden />
              화음 · <span {...getPostListGradeSpanProps(h.writerGrade)} />
              {h.writerNickname}
            </span>
            {memo ? <p className="chorus-harmony-item__memo">{memo}</p> : null}
          </div>
          {childHarmonyCount > 0 && (
            <button
              type="button"
              className={`chorus-chain-item__mix${isMixing ? ' chorus-chain-item__mix--active' : ''}`}
              onClick={() => void handlePlayMix(h.id, h.audioUrl)}
              title={`화음 ${childHarmonyCount}개와 함께 듣기`}
            >
              {isMixing ? <Pause size={13} /> : <Layers size={13} />}
              {childHarmonyCount}
            </button>
          )}
          {renderLayerButton({
            parentKey: h.id,
            audioUrl: h.audioUrl,
            label: h.writerNickname,
          })}
          {user && (user.uid === h.writerUid || user.role === '리더' || user.nickname === '너래') && (
            <button
              type="button"
              className="chorus-harmony-item__delete"
              onClick={() => handleDeleteAudioComment(h)}
              aria-label="화음 삭제"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {renderCommentActions(h.id, h.writerUid, () => handleDeleteAudioComment(h))}
        {renderReplyForm(h.id)}
        {renderReplies(h.id)}
        {childHarmonyCount > 0 && renderHarmonyRows(h.id, h.audioUrl)}
      </div>
    );
  };

  const renderHarmonyRows = (parentKey: string, parentUrl?: string) => {
    const list = harmoniesByParent[parentKey];
    if (!list?.length) return null;
    const mixUrl = parentUrl ?? resolveAudioUrlForHarmonyKey(parentKey);
    const harmonyCount = list.length;
    const isMixing = mixingKey === parentKey;
    return (
      <div className="chorus-harmony-block">
        {mixUrl && (
          <div className="chorus-harmony-block__head">
            <span className="chorus-harmony-block__label">화음</span>
            <button
              type="button"
              className={`chorus-chain-item__mix${isMixing ? ' chorus-chain-item__mix--active' : ''}`}
              onClick={() => void handlePlayMix(parentKey, mixUrl)}
              title="원곡과 화음 함께 듣기"
            >
              {isMixing ? <Pause size={13} /> : <Layers size={13} />}
              {harmonyCount}
            </button>
          </div>
        )}
        <ul className="chorus-harmony-list">
          {list.map((h) => (
            <li key={h.id}>{renderHarmonyThreadCard(h)}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderLayerButton = (target: HarmonyTarget) =>
    user ? (
      <button
        type="button"
        className="chorus-chain-item__layer"
        onClick={() => startHarmonyOn(target)}
        title="이 녹음에 화음 쌓기"
        aria-label="레이어"
      >
        <Layers size={14} />
      </button>
    ) : null;

  const canSubmit = Boolean(draft.trim() || audioBlob || recording);
  const composePlaceholder = harmonyTarget
    ? '원곡을 들으며 화음을 녹음해 주세요 (메모 선택)'
    : '댓글을 남기거나, 🎤로 이어 불러요';

  return (
    <section className="chorus-layer-section chorus-layer-section--lite">
      <header className="chorus-layer-section__header chorus-layer-section__header--lite">
        <h2>댓글</h2>
        {chainItems.length > 1 && (
          <button type="button" className="chorus-lite-playall" onClick={handleChainPlayPause}>
            {chainPlaying ? <Pause size={14} /> : <Play size={14} />}
            {chainPlaying ? '정지' : '전체 듣기'}
          </button>
        )}
      </header>

      {user && (
        <div className="chorus-compose">
          {harmonyTarget && (
            <div className="chorus-compose__harmony-banner">
              <Layers size={15} aria-hidden />
              <span>{harmonyTarget.label}에 화음 쌓는 중</span>
              <button type="button" className="chorus-compose__harmony-cancel" onClick={clearHarmonyTarget}>
                취소
              </button>
            </div>
          )}
          {(recording || audioPreviewUrl) && (
            <div className="chorus-compose__rec-status">
              {recording ? (
                <span className="chorus-compose__rec-live">
                  <span className="chorus-compose__rec-dot" />
                  {harmonyTarget ? '화음 녹음 중' : '녹음 중'} {formatAudioDuration(recordingSeconds)}
                </span>
              ) : audioPreviewUrl ? (
                <div className="chorus-compose__preview">
                  <audio src={audioPreviewUrl} controls preload="metadata" />
                  <button type="button" className="chorus-compose__preview-clear" onClick={clearPreview}>
                    취소
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <div className="chorus-compose__row">
            <input
              type="text"
              className="chorus-compose__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={composePlaceholder}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <button
              type="button"
              className={`chorus-compose__mic${recording ? ' chorus-compose__mic--active' : ''}${harmonyTarget ? ' chorus-compose__mic--harmony' : ''}`}
              onClick={handleToggleRecording}
              disabled={submitting}
              title={recording ? '녹음 끝내기' : harmonyTarget ? '화음 녹음' : '녹음하기'}
              aria-label={recording ? '녹음 끝내기' : harmonyTarget ? '화음 녹음' : '녹음하기'}
            >
              {recording ? <Square size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              className="chorus-compose__send"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              title="보내기"
              aria-label="보내기"
            >
              {submitting ? <Loader size={18} className="loading-spinner" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}

      {!user && <p className="chorus-layer-section__login">댓글을 남기려면 로그인이 필요합니다.</p>}

      <div className="chorus-feed">
        {loading && (
          <div className="chorus-feed__loading-badge">
            <Loader className="loading-spinner" size={14} />
          </div>
        )}

        {topLevelFeed.map((item) => {
          if (item.feedKind === 'harmony') {
            const harmony = item as ChorusLayer & { feedKind: 'harmony' };
            return (
              <div key={harmony.id} className="chorus-feed-card">
                {renderHarmonyThreadCard(harmony)}
              </div>
            );
          }

          if (item.feedKind === 'audio') {
            const layer = item as ChorusLayer & { feedKind: 'audio' };
            const chainItem = chainItems.find((c) => c.layerId === layer.id);
            if (!chainItem) return null;
            const isChainActive = chainPlaying && activePhraseIndex === chainItem.phraseIndex - 1;
            const isSoloActive = soloPlayingKey === chainItem.key;
            const harmonyCount = harmoniesByParent[chainItem.parentKey]?.length ?? 0;
            const isMixing = mixingKey === chainItem.parentKey;
            const memo = layer.content?.trim();
            return (
              <div key={layer.id} className="chorus-feed-card">
                <div
                  className={`chorus-audio-comment${isChainActive ? ' chorus-audio-comment--active' : ''}`}
                >
                  <div className="chorus-audio-comment__main">
                    <button
                      type="button"
                      className="chorus-chain-item__play chorus-chain-item__play--lite"
                      onClick={() => handlePlaySingle(chainItem)}
                      aria-label="녹음 듣기"
                    >
                      {isSoloActive ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <div className="chorus-chain-item__body">
                      <span className="chorus-chain-item__author">
                        <span {...getPostListGradeSpanProps(layer.writerGrade)} />
                        {layer.writerNickname}
                      </span>
                      {memo ? <p className="chorus-audio-comment__memo">{memo}</p> : null}
                    </div>
                    {harmonyCount > 0 && (
                      <button
                        type="button"
                        className={`chorus-chain-item__mix${isMixing ? ' chorus-chain-item__mix--active' : ''}`}
                        onClick={() => void handlePlayMix(chainItem.parentKey, chainItem.audioUrl)}
                        title={`화음 ${harmonyCount}개와 함께 듣기`}
                      >
                        {isMixing ? <Pause size={13} /> : <Layers size={13} />}
                        {harmonyCount}
                      </button>
                    )}
                    {renderLayerButton({
                      parentKey: chainItem.parentKey,
                      audioUrl: chainItem.audioUrl,
                      label: chainItem.writerNickname,
                    })}
                  </div>
                  {renderCommentActions(layer.id, layer.writerUid, () => handleDeleteAudioComment(layer))}
                </div>
                {renderReplyForm(layer.id)}
                {renderReplies(layer.id)}
                {harmonyCount > 0 && renderHarmonyRows(chainItem.parentKey, chainItem.audioUrl)}
              </div>
            );
          }

          const comment = item as TextComment & { feedKind: 'text' };
          return (
            <div key={comment.id} className="chorus-feed-card">
              <div className="chorus-text-comment">
                <div className="chorus-text-comment__meta">
                  <span {...getPostListGradeSpanProps(comment.writerGrade)} />
                  <strong>{comment.writerNickname}</strong>
                </div>
                <p className="chorus-text-comment__body">{comment.content}</p>
                {renderCommentActions(comment.id, comment.writerUid, () => handleDeleteTextComment(comment))}
              </div>
              {renderReplyForm(comment.id)}
              {renderReplies(comment.id)}
            </div>
          );
        })}

        {topLevelFeed.length === 0 && (
          <p className="chorus-feed__empty">아직 이어진 녹음이나 댓글이 없어요.</p>
        )}
      </div>
    </section>
  );
});

export default ChorusLayerSection;
