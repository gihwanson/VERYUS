import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AppWindow, ChevronLeft, Bell, BellOff, Menu, Trash2, Users } from 'lucide-react';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  deleteField,
  where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import {
  NERAE_NICKNAME,
  MAX_NERAE_SUB_ACCOUNTS,
  canUseNeraeSubAccounts,
  createSubAccountId,
  getActiveParticipantDocId,
  getActivePersonaKey,
  getOwnedSubDocIds,
  getSubParticipantDocId,
  isLegacySubParticipantDocId,
  isMessageSentByActivePersona,
  isMessageSentByOwnedAccount,
  isOwnedByUser,
  isRoomNicknameTaken,
  listOwnedSubParticipantDuplicates,
  isMemberDocActivePersona,
  resolvePersonaKeyFromMemberDocId,
  resolveMessageSenderParticipantDocId,
  parseParticipantDocId,
  resolvePersonaDisplayForKey,
  resolvePersonaDisplayForRoom,
  getRoomPersonaNickname,
  hasRoomPersonaNickname,
  buildNextNicknamesByRoom,
  type NeraePersonaProfile,
  type RoomPresenceByRoom
} from '../utils/anonymousChatNeraePersona';
import './AnonymousChatRoom.css';

type AnonymousProfile = NeraePersonaProfile & {
  uid: string;
  nicknameChangedOnce?: boolean;
  createdAt?: any;
};

type AnonymousMessage = {
  id: string;
  uid: string;
  /** 발신 시 사용한 participant 문서 ID (부계정 구분) */
  senderParticipantDocId?: string;
  senderLabel: string;
  profileNickname?: string;
  content: string;
  systemText?: string;
  replyToId?: string;
  replyPreviewSender?: string;
  replyPreviewContent?: string;
  createdAt: any;
  createdAtClient?: number;
};

type ChatTimelineItem =
  | { type: 'message'; sortSec: number; sortNano: number; message: AnonymousMessage }
  | { type: 'joinNotice'; key: string; sortSec: number; sortNano: number; text: string };

type AnonymousRoom = {
  id: string;
  title: string;
  createdByUid: string;
  createdByNickname: string;
  coHostUids?: string[];
  coHostParticipantIds?: string[];
  notificationMutedUids?: string[];
  isFrozen?: boolean;
  lastCleanupAt?: any;
  requiredActiveDays?: number;
  entryCode?: string;
  bannedUids?: string[];
  banUntilByUid?: Record<string, any>;
  bannedParticipantIds?: string[];
  banUntilByParticipantId?: Record<string, any>;
  createdAt: any;
};

type RoomParticipant = {
  uid: string;
  ownerUid?: string;
  isSubAccount?: boolean;
  subAccountId?: string | null;
  nickname: string;
  profileNickname?: string;
  joinedAt?: any;
  lastMessageAt?: any;
  lastReadAt?: any;
  chatMutedUntil?: any;
};

type ReplyTarget = {
  id: string;
  senderLabel: string;
  content: string;
};

const parseKoreanDateString = (raw: string) => {
  const normalized = raw
    .trim()
    .replace(/년|월/g, '-')
    .replace(/일/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return 0;
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
};

const toUnixSeconds = (value: any) => {
  if (!value) return 0;
  if (typeof value?.seconds === 'number') return value.seconds;
  if (typeof value?._seconds === 'number') return value._seconds;
  if (typeof value?.toDate === 'function') {
    const dateValue = value.toDate();
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
      return Math.floor(dateValue.getTime() / 1000);
    }
  }
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') {
    if (value > 1_000_000_000_000) return Math.floor(value / 1000);
    if (value > 1_000_000_000) return Math.floor(value);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    const ms = parsed.getTime();
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
    if (typeof value === 'string') {
      return parseKoreanDateString(value);
    }
  }
  return 0;
};

const isSystemChatMessage = (message: AnonymousMessage) =>
  message.uid === '__system__' ||
  message.uid === 'system' ||
  (message.senderLabel || '').toLowerCase() === 'system';

/** 타임라인 정렬용 ms — 서버 시각만 쓰면 지연 반영 시 말풍선이 위로 튀는 경우가 있어 client/server 중 큰 값 사용 */
const getMessageSortMs = (message: AnonymousMessage) => {
  if (isSystemChatMessage(message) && typeof message.createdAtClient === 'number') {
    return message.createdAtClient;
  }
  const clientMs = typeof message.createdAtClient === 'number' ? message.createdAtClient : 0;
  const serverMs = toUnixMillis(message.createdAt);
  if (clientMs > 0 && serverMs > 0) return Math.max(clientMs, serverMs);
  return clientMs || serverMs;
};

const getMessageSortSeconds = (message: AnonymousMessage) => {
  const ms = getMessageSortMs(message);
  return ms > 0 ? Math.floor(ms / 1000) : 0;
};

const getMessageSortNanos = (message: AnonymousMessage) => {
  const ms = getMessageSortMs(message);
  return ms > 0 ? (ms % 1000) * 1_000_000 : 0;
};

const toUnixMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    const dateValue = value.toDate();
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) return dateValue.getTime();
  }
  if (typeof value?.seconds === 'number') {
    const nanos = typeof value?.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
  }
  if (typeof value === 'number') return value > 1_000_000_000_000 ? value : value * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** 읽음 표시(숫자) 비교용 — 발송 시각 기준 */
const getMessageReceiptMs = (message: AnonymousMessage) => {
  const clientMs = typeof message.createdAtClient === 'number' ? message.createdAtClient : 0;
  const serverMs = toUnixMillis(message.createdAt);
  if (clientMs > 0 && serverMs > 0) return Math.max(clientMs, serverMs);
  return clientMs || serverMs;
};

/** 상대가 메시지 이후에 읽었는지 (동일 시각은 미읽음으로 간주) */
const hasParticipantReadMessage = (readMs: number, messageMs: number) => {
  if (!messageMs || !readMs) return false;
  return readMs > messageMs;
};

const getActiveRoomBanUntilMs = (room: AnonymousRoom | undefined, participantDocId: string) => {
  if (!room || !participantDocId) return 0;
  const fromParticipantMap = toUnixMillis(room.banUntilByParticipantId?.[participantDocId]);
  if (fromParticipantMap > Date.now()) return fromParticipantMap;
  if ((room.bannedParticipantIds || []).includes(participantDocId) && !fromParticipantMap) {
    return Number.POSITIVE_INFINITY;
  }
  // 구형: Firebase UID 기준 밴 (본계정 participant만)
  if (!isLegacySubParticipantDocId(participantDocId)) {
    const fromUidMap = toUnixMillis(room.banUntilByUid?.[participantDocId]);
    if (fromUidMap > Date.now()) return fromUidMap;
    if ((room.bannedUids || []).includes(participantDocId) && !fromUidMap) {
      return Number.POSITIVE_INFINITY;
    }
  }
  return 0;
};

const getRoomCoHostParticipantIds = (room?: AnonymousRoom) => {
  if (!room) return [];
  const explicit = (room.coHostParticipantIds || []).filter(Boolean);
  if (explicit.length > 0) return explicit;
  return (room.coHostUids || []).filter(Boolean);
};

const isChatPushMutedForUid = (room: AnonymousRoom | undefined, uid: string) =>
  Boolean(uid && (room?.notificationMutedUids || []).includes(uid));

const resolveMemberOwnerUid = (member: RoomParticipant) => {
  const fromField = (member.ownerUid || '').trim();
  if (fromField) return fromField;
  if (isLegacySubParticipantDocId(member.uid)) {
    return parseParticipantDocId(member.uid).ownerUid;
  }
  if (member.uid.startsWith('sub_')) return '';
  return member.uid;
};

const getRoomIdFromSearch = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('roomId') || '';
};

const getPendingPushRoomId = () => {
  const fromUrl = getRoomIdFromSearch();
  if (fromUrl) {
    try {
      sessionStorage.setItem(PENDING_PUSH_ROOM_STORAGE_KEY, fromUrl);
    } catch {
      // ignore
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(PENDING_PUSH_ROOM_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const clearPendingPushRoomId = () => {
  try {
    sessionStorage.removeItem(PENDING_PUSH_ROOM_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const CHAT_THEME_STORAGE_KEY = 'veryus_anonymous_chat_theme';
const ROOM_TITLE_OVERRIDE_STORAGE_KEY_PREFIX = 'veryus_anonymous_room_title_override';
const PENDING_PUSH_ROOM_STORAGE_KEY = 'veryus_anonymous_chat_pending_room';

const AnonymousChatRoom: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  /** Firestore 반영 전에도 즉시 본·부 UI 전환 */
  const [localActivePersonaKey, setLocalActivePersonaKey] = useState<string>('main');
  const [rooms, setRooms] = useState<AnonymousRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AnonymousMessage[]>([]);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [roomJoinedAt, setRoomJoinedAt] = useState<any>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [expandedMemberUid, setExpandedMemberUid] = useState<string | null>(null);
  const [showNeraeSubCreate, setShowNeraeSubCreate] = useState(false);
  const [neraeSubNicknameInput, setNeraeSubNicknameInput] = useState('');
  const [personaBusy, setPersonaBusy] = useState(false);
  const [input, setInput] = useState('');
  const [roomTitleInput, setRoomTitleInput] = useState('');
  const [userActiveDays, setUserActiveDays] = useState(0);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [isKakaoTheme, setIsKakaoTheme] = useState(true);
  const [roomRequirementInput, setRoomRequirementInput] = useState(0);
  const [savingRoomRequirement, setSavingRoomRequirement] = useState(false);
  const [roomEntryCodeInput, setRoomEntryCodeInput] = useState('');
  const [savingRoomEntryCode, setSavingRoomEntryCode] = useState(false);
  const [pendingEntryCodeRoom, setPendingEntryCodeRoom] = useState<{ room: AnonymousRoom; fromPushLink?: boolean } | null>(null);
  const [entryCodeInput, setEntryCodeInput] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<AnonymousRoom | null>(null);
  const [pendingRoomNickname, setPendingRoomNickname] = useState<{
    room: AnonymousRoom;
    fromPushLink?: boolean;
    isNewRoom?: boolean;
    personaKey?: string;
  } | null>(null);
  const [roomNicknameInput, setRoomNicknameInput] = useState('');
  const [savingRoomNickname, setSavingRoomNickname] = useState(false);
  const [roomNicknameChangeInput, setRoomNicknameChangeInput] = useState('');
  const [updatingRoomNickname, setUpdatingRoomNickname] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<{ message: AnonymousMessage; x: number; y: number } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [enteredByPushLink, setEnteredByPushLink] = useState(false);
  const [roomTitleOverrides, setRoomTitleOverrides] = useState<Record<string, string>>({});
  const [editingRoomTitle, setEditingRoomTitle] = useState(false);
  const [roomTitleDraft, setRoomTitleDraft] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const inputValueRef = useRef('');
  const messageItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRetryTimeoutRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const userPinnedScrollRef = useRef(false);
  const prevTimelineTokenRef = useRef('');
  const participantDuplicateCleanupRef = useRef('');
  const lastReadMarkAtRef = useRef(0);
  const wasRoomMemberRef = useRef(false);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  /** 모바일: 전송·자동 스크롤 후에도 입력 포커스를 유지해 키보드가 접히지 않게 함 */
  const refocusComposerInput = useCallback(() => {
    const el = messageInputRef.current;
    if (!el || el.disabled) return;
    const run = () => {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    };
    queueMicrotask(run);
    requestAnimationFrame(run);
    window.setTimeout(run, 0);
    window.setTimeout(run, 80);
  }, []);

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
  }, []);

  const forceScrollToLatest = useCallback(() => {
    if (scrollRetryTimeoutRef.current) {
      window.clearTimeout(scrollRetryTimeoutRef.current);
    }
    const run = () => scrollToLatestMessage();
    requestAnimationFrame(run);
    scrollRetryTimeoutRef.current = window.setTimeout(run, 50);
    window.setTimeout(run, 150);
  }, [scrollToLatestMessage]);

  const clearDeepLinkRoomIdFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('roomId')) return;
    url.searchParams.delete('roomId');
    const nextQuery = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}${url.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, []);

  useEffect(() => {
    setIsTouchDevice(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem(CHAT_THEME_STORAGE_KEY);
    if (storedTheme === 'classic') {
      setIsKakaoTheme(false);
      return;
    }
    setIsKakaoTheme(true);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setRoomTitleOverrides({});
      return;
    }
    const storageKey = `${ROOM_TITLE_OVERRIDE_STORAGE_KEY_PREFIX}_${user.uid}`;
    try {
      const stored = localStorage.getItem(storageKey);
      setRoomTitleOverrides(stored ? JSON.parse(stored) : {});
    } catch {
      setRoomTitleOverrides({});
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const storageKey = `${ROOM_TITLE_OVERRIDE_STORAGE_KEY_PREFIX}_${user.uid}`;
    localStorage.setItem(storageKey, JSON.stringify(roomTitleOverrides));
  }, [user?.uid, roomTitleOverrides]);

  useEffect(() => {
    const userRaw = localStorage.getItem('veryus_user');
    if (!userRaw) {
      setLoading(false);
      return;
    }

    try {
      setUser(JSON.parse(userRaw));
    } catch (error) {
      console.error('사용자 정보 파싱 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const profileRef = doc(db, 'anonymousChatProfiles', user.uid);

    const unsubProfile = onSnapshot(profileRef, (snapshot) => {
      if (!snapshot.exists()) {
        setProfile(null);
        return;
      }
      const data = snapshot.data() as AnonymousProfile;
      setProfile(data);
      if (canUseNeraeSubAccounts(user)) {
        setLocalActivePersonaKey(getActivePersonaKey(data));
      }
    });

    return () => unsubProfile();
  }, [user?.uid, user?.nickname]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const ensureProfile = async () => {
      try {
        const profileRef = doc(db, 'anonymousChatProfiles', user.uid);
        const snap = await getDoc(profileRef);
        if (cancelled || snap.exists()) return;
        await setDoc(profileRef, {
          uid: user.uid,
          customNickname: '',
          profileNickname: user.nickname || '',
          nicknamesByRoom: {},
          createdAt: serverTimestamp()
        });
      } catch (error) {
        console.error('익명 채팅 프로필 초기화 실패:', error);
      }
    };
    void ensureProfile();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.nickname]);

  useEffect(() => {
    if (!user?.uid) return;
    const loadUserActiveDays = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const createdAt = userSnap.exists() ? userSnap.data().createdAt : null;
        const createdSec = toUnixSeconds(createdAt) || toUnixSeconds(user?.createdAt);
        if (!createdSec) {
          setUserActiveDays(0);
          return;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const days = Math.max(0, Math.floor((nowSec - createdSec) / 86400));
        setUserActiveDays(days);
      } catch (error) {
        console.error('활동일자 계산 실패:', error);
        setUserActiveDays(0);
      }
    };
    void loadUserActiveDays();
  }, [user?.uid]);

  useEffect(() => {
    const roomsQuery = query(collection(db, 'anonymousChatRooms'), orderBy('createdAt', 'desc'));
    const unsubRooms = onSnapshot(roomsQuery, (snapshot) => {
      const nextRooms = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AnonymousRoom, 'id'>)
      }));
      setRooms(nextRooms);
      // 첫 스냅샷이 빈 배열이면(캐시/네트워크 지연) 딥링크로 잡힌 방이 잘못 지워지는 것을 막는다
      setSelectedRoomId((prev) => {
        if (!prev) return null;
        if (nextRooms.some((room) => room.id === prev)) return prev;
        if (nextRooms.length === 0) return prev;
        return null;
      });
    });

    return () => unsubRooms();
  }, []);

  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([]);
      setRoomParticipants([]);
      setRoomJoinedAt(null);
      return;
    }

    const isNeraeUser = canUseNeraeSubAccounts(user);
    const activeDocId = isNeraeUser
      ? localActivePersonaKey === 'main'
        ? user.uid
        : getSubParticipantDocId(localActivePersonaKey)
      : user.uid;
    const participantRef = doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', activeDocId);
    const participantsCollectionRef = collection(db, 'anonymousChatRooms', selectedRoomId, 'participants');

    const ensureRoomParticipant = async () => {
      if (!profile || !user?.uid || !selectedRoomId) return;
      const personaKey = isNeraeUser ? localActivePersonaKey : 'main';
      if (!hasRoomPersonaNickname(profile, selectedRoomId, personaKey)) return;

      const persona = resolvePersonaDisplayForRoom(profile, selectedRoomId, personaKey);
      const roomPresence = profile.presenceByRoom?.[selectedRoomId];
      const restoredJoinedAtMs =
        persona.personaKey === 'main'
          ? roomPresence?.mainJoinedAtMs
          : roomPresence?.subs?.[persona.personaKey];

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(participantRef);
        if (snap.exists()) {
          const existing = snap.data() as RoomParticipant;
          const roomNick = getRoomPersonaNickname(profile, selectedRoomId, personaKey);
          const effectiveNickname =
            roomNick || (existing.nickname || '').trim() || persona.nickname;
          const effectiveProfileNickname = persona.profileNickname;

          if (!roomNick && (existing.nickname || '').trim()) {
            const backfill = buildNextNicknamesByRoom(
              profile.nicknamesByRoom,
              selectedRoomId,
              personaKey,
              existing.nickname
            );
            void updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
              nicknamesByRoom: backfill
            }).catch(() => undefined);
            setProfile((prev) => (prev ? { ...prev, nicknamesByRoom: backfill } : prev));
          }

          if (
            existing.nickname !== effectiveNickname ||
            (existing.profileNickname || '') !== effectiveProfileNickname
          ) {
            transaction.update(participantRef, {
              nickname: effectiveNickname,
              profileNickname: effectiveProfileNickname
            });
          }
          return;
        }
        const participantPayload: Record<string, unknown> = {
          uid: activeDocId,
          nickname: persona.nickname,
          profileNickname: persona.profileNickname,
          joinedAt:
            typeof restoredJoinedAtMs === 'number' && restoredJoinedAtMs > 0
              ? Timestamp.fromMillis(restoredJoinedAtMs)
              : serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          lastReadAt: serverTimestamp()
        };
        if (!persona.isSub) {
          participantPayload.ownerUid = user.uid;
        }
        transaction.set(participantRef, participantPayload);
      });
    };

    ensureRoomParticipant().catch((error) => {
      console.error('채팅방 입장 기록 실패:', error);
    });

    const unsubMyParticipant = onSnapshot(participantRef, (snap) => {
      if (!snap.exists()) return;
      setRoomJoinedAt(snap.data().joinedAt || null);
    });

    const unsubParticipants = onSnapshot(participantsCollectionRef, (snapshot) => {
      const nextParticipants = snapshot.docs.map((item) => ({
        ...(item.data() as Omit<RoomParticipant, 'uid'>),
        uid: item.id
      }));
      setRoomParticipants(nextParticipants);
    });

    const messagesQuery = query(
      collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const nextMessages = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AnonymousMessage, 'id'>)
      }));
      setMessages(nextMessages);
    });

    return () => {
      unsubMessages();
      unsubParticipants();
      unsubMyParticipant();
    };
  }, [selectedRoomId, profile, user?.uid, user?.nickname, localActivePersonaKey]);

  const ownedSubDocIds = useMemo(() => getOwnedSubDocIds(profile), [profile]);

  const myActiveParticipantDocId = useMemo(() => {
    if (!user?.uid) return '';
    if (!canUseNeraeSubAccounts(user)) return user.uid;
    if (localActivePersonaKey === 'main') return user.uid;
    return getSubParticipantDocId(localActivePersonaKey);
  }, [user, localActivePersonaKey]);

  const isMessageFromActivePersona = useCallback(
    (message: AnonymousMessage) => {
      const ownerUid = user?.uid || '';
      if (!ownerUid) return false;
      if (!canUseNeraeSubAccounts(user)) return message.uid === ownerUid;
      const personaKey = canUseNeraeSubAccounts(user) ? localActivePersonaKey : 'main';
      return isMessageSentByActivePersona(
        message,
        myActiveParticipantDocId,
        personaKey,
        ownerUid,
        roomParticipants,
        profile,
        ownedSubDocIds
      );
    },
    [user, myActiveParticipantDocId, localActivePersonaKey, roomParticipants, profile, ownedSubDocIds]
  );

  const markRoomAsRead = useCallback(async () => {
    if (!selectedRoomId || !myActiveParticipantDocId) return;
    try {
      await updateDoc(
        doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', myActiveParticipantDocId),
        {
          lastReadAt: serverTimestamp()
        }
      );
    } catch (error) {
      // ignore
    }
  }, [selectedRoomId, myActiveParticipantDocId]);

  const markRoomAsReadThrottled = useCallback(
    (force = false) => {
      const now = Date.now();
      const THROTTLE_MS = 6000;
      if (!force && now - lastReadMarkAtRef.current < THROTTLE_MS) return;
      lastReadMarkAtRef.current = now;
      void markRoomAsRead();
    },
    [markRoomAsRead]
  );

  const roomById = useMemo(() => {
    const map = new Map<string, AnonymousRoom>();
    rooms.forEach((room) => {
      map.set(room.id, room);
    });
    return map;
  }, [rooms]);

  const timelineBaselineSec = useMemo(() => {
    if (enteredByPushLink) return 0;
    const joinedAtSec = roomJoinedAt?.seconds || 0;
    const cleanupSec = selectedRoomId ? toUnixSeconds(roomById.get(selectedRoomId)?.lastCleanupAt) : 0;
    return Math.max(joinedAtSec, cleanupSec);
  }, [enteredByPushLink, roomJoinedAt?.seconds, selectedRoomId, roomById]);

  const sortedMessages = useMemo(() => {
    if (enteredByPushLink) {
      return messages;
    }
    return messages.filter((msg) => {
      if (isSystemChatMessage(msg)) return true;
      const sec = getMessageSortSeconds(msg);
      if (msg.uid === user?.uid && sec <= 0) {
        return true;
      }
      return sec >= timelineBaselineSec;
    });
  }, [messages, user?.uid, enteredByPushLink, timelineBaselineSec]);

  const isNerae = canUseNeraeSubAccounts(user);

  const ownedSubDuplicateDocIds = useMemo(() => {
    if (!isNerae || !user?.uid || !profile) return [] as string[];
    return listOwnedSubParticipantDuplicates(roomParticipants, user.uid, profile);
  }, [isNerae, user?.uid, profile, roomParticipants]);

  const sortedParticipants = useMemo(() => {
    const duplicateSet = new Set(ownedSubDuplicateDocIds);
    return [...roomParticipants]
      .filter((member) => !duplicateSet.has(member.uid))
      .sort((a, b) => {
        const aSec = a.joinedAt?.seconds || 0;
        const bSec = b.joinedAt?.seconds || 0;
        return aSec - bSec;
      });
  }, [roomParticipants, ownedSubDuplicateDocIds]);
  const getDisplayName = (
    baseNickname?: string,
    profileNickname?: string,
    member?: Pick<RoomParticipant, 'isSubAccount'>
  ) => {
    const nick = (baseNickname || '').trim();
    if (!nick) return '익명';
    if (member?.isSubAccount) {
      return nick;
    }
    if (isNerae && profileNickname) {
      return `${nick}(${profileNickname.trim()})`;
    }
    return nick;
  };

  const getMemberLabel = (member: RoomParticipant) =>
    getDisplayName(member.nickname, member.profileNickname, member);

  const getMemberInitial = (label: string) => {
    const trimmed = label.trim();
    return trimmed ? trimmed.charAt(0) : '?';
  };

  /** 채팅·푸시에 쓸 발신 닉네임 — participant(실시간) 우선, profile은 보조 */
  const resolveSenderNickname = useCallback((): string => {
    const myParticipant = roomParticipants.find((member) => member.uid === myActiveParticipantDocId);
    const fromParticipant = (myParticipant?.nickname || '').trim();
    if (fromParticipant) return fromParticipant;
    if (profile && selectedRoomId) {
      const fromRoom = getRoomPersonaNickname(profile, selectedRoomId, localActivePersonaKey);
      if (fromRoom) return fromRoom;
      if (canUseNeraeSubAccounts(user)) {
        return resolvePersonaDisplayForRoom(profile, selectedRoomId, localActivePersonaKey).nickname || '익명';
      }
    }
    return '익명';
  }, [roomParticipants, myActiveParticipantDocId, profile, selectedRoomId, localActivePersonaKey, user]);

  const resolveSenderProfileNickname = useCallback((): string => {
    if (profile && selectedRoomId && canUseNeraeSubAccounts(user)) {
      const persona = resolvePersonaDisplayForRoom(profile, selectedRoomId, localActivePersonaKey);
      if (persona.isSub) return '';
      return persona.profileNickname;
    }
    const myParticipant = roomParticipants.find((member) => member.uid === myActiveParticipantDocId);
    return (
      (myParticipant?.profileNickname || '').trim() ||
      (profile?.profileNickname || '').trim() ||
      (user?.nickname || '').trim()
    );
  }, [roomParticipants, myActiveParticipantDocId, profile, user?.nickname, localActivePersonaKey]);

  const chatTimeline = useMemo<ChatTimelineItem[]>(() => {
    const messageItems: ChatTimelineItem[] = sortedMessages.map((message) => ({
      type: 'message',
      sortSec: getMessageSortSeconds(message),
      sortNano: getMessageSortNanos(message),
      message
    }));

    const joinNoticeItems: ChatTimelineItem[] = roomParticipants
      .filter((member) => {
        const memberJoinedSec = member.joinedAt?.seconds || 0;
        if (memberJoinedSec < timelineBaselineSec) return false;
        if (isOwnedByUser(member, user?.uid || '', ownedSubDocIds)) return false;
        return true;
      })
      .map((member) => {
        const sortSec = member.joinedAt?.seconds || 0;
        const sortNano = member.joinedAt?.nanoseconds || 0;
        const displayName = getDisplayName(member.nickname, member.profileNickname, member);
        return {
          type: 'joinNotice',
          key: `${member.uid}-${sortSec}-${sortNano}`,
          sortSec,
          sortNano,
          text: `${displayName}님이 입장하셨습니다.`
        };
      });

    const timelineSortKey = (item: ChatTimelineItem) =>
      item.type === 'message' ? item.message.id : item.key;

    return [...messageItems, ...joinNoticeItems].sort((a, b) => {
      if (a.sortSec !== b.sortSec) return a.sortSec - b.sortSec;
      if (a.sortNano !== b.sortNano) return a.sortNano - b.sortNano;
      return timelineSortKey(a).localeCompare(timelineSortKey(b));
    });
  }, [sortedMessages, roomParticipants, timelineBaselineSec, user?.uid, ownedSubDocIds]);

  const latestTimelineToken = useMemo(() => {
    const last = chatTimeline[chatTimeline.length - 1];
    if (!last) return 'empty';
    if (last.type === 'joinNotice') {
      return `j-${last.key}-${last.sortSec}-${last.sortNano}`;
    }
    return `m-${last.message.id}-${last.sortSec}-${last.sortNano}`;
  }, [chatTimeline]);

  const timelineMessageById = useMemo(() => {
    const map = new Map<string, AnonymousMessage>();
    chatTimeline.forEach((item) => {
      if (item.type === 'message') {
        map.set(item.message.id, item.message);
      }
    });
    return map;
  }, [chatTimeline]);

  const participantReadAtByUid = useMemo(() => {
    const map = new Map<string, number>();
    roomParticipants.forEach((member) => {
      map.set(member.uid, toUnixMillis(member.lastReadAt));
    });
    return map;
  }, [roomParticipants]);

  const isMessageSenderPersona = useCallback(
    (member: RoomParticipant, message: AnonymousMessage) => {
      const ownerUid = user?.uid || '';
      if (!ownerUid) return member.uid === message.uid;
      const senderDocId = resolveMessageSenderParticipantDocId(
        message,
        ownerUid,
        roomParticipants,
        ownedSubDocIds
      );
      return member.uid === senderDocId;
    },
    [user?.uid, roomParticipants, ownedSubDocIds]
  );

  const lastTimelineMessage = useMemo(() => {
    for (let i = chatTimeline.length - 1; i >= 0; i -= 1) {
      const item = chatTimeline[i];
      if (item.type === 'message') return item.message;
    }
    return null;
  }, [chatTimeline]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const room = roomById.get(selectedRoomId);
    setRoomRequirementInput(room?.requiredActiveDays || 0);
    setRoomEntryCodeInput(room?.entryCode || '');
  }, [selectedRoomId, roomById]);

  useEffect(() => {
    setEditingRoomTitle(false);
    setRoomTitleDraft('');
  }, [selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId) return;
    const tokenChanged = prevTimelineTokenRef.current !== latestTimelineToken;
    if (!tokenChanged) return;
    prevTimelineTokenRef.current = latestTimelineToken;

    if (userPinnedScrollRef.current) return;
    if (shouldAutoScrollRef.current || isNearBottom()) {
      const composer = messageInputRef.current;
      const keepKeyboardOpen =
        isTouchDevice && !!composer && document.activeElement === composer;

      shouldAutoScrollRef.current = false;
      // 활성 페르소나가 보낸 직후에는 읽음 처리하지 않음
      if (!lastTimelineMessage || !isMessageFromActivePersona(lastTimelineMessage)) {
        markRoomAsReadThrottled();
      }

      if (keepKeyboardOpen) {
        requestAnimationFrame(() => {
          scrollToLatestMessage();
          refocusComposerInput();
        });
      } else {
        forceScrollToLatest();
      }
    }
  }, [
    latestTimelineToken,
    selectedRoomId,
    forceScrollToLatest,
    scrollToLatestMessage,
    refocusComposerInput,
    isNearBottom,
    markRoomAsReadThrottled,
    isTouchDevice,
    lastTimelineMessage,
    isMessageFromActivePersona
  ]);

  useEffect(() => {
    if (!selectedRoomId) return;
    prevTimelineTokenRef.current = '';
    userPinnedScrollRef.current = false;
    shouldAutoScrollRef.current = true;
    participantDuplicateCleanupRef.current = '';
    forceScrollToLatest();
  }, [selectedRoomId, forceScrollToLatest]);

  /** 구형/중복 부계정 participant 자동 정리 (동일 닉네임 2명 표시 방지) */
  useEffect(() => {
    if (!selectedRoomId || !user?.uid || !profile || !isNerae) return;
    if (ownedSubDuplicateDocIds.length === 0) return;

    const cleanupKey = `${selectedRoomId}:${ownedSubDuplicateDocIds.join(',')}`;
    if (participantDuplicateCleanupRef.current === cleanupKey) return;

    participantDuplicateCleanupRef.current = cleanupKey;
    void Promise.all(
      ownedSubDuplicateDocIds.map((docId) =>
        deleteDoc(doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', docId))
      )
    ).catch((error) => {
      console.error('중복 부계정 participant 정리 실패:', error);
      participantDuplicateCleanupRef.current = '';
    });
  }, [selectedRoomId, user?.uid, profile, isNerae, ownedSubDuplicateDocIds]);

  /** 마지막 메시지가 상대(내 활성 페르소나 외)일 때만 읽음 처리 — 예전처럼 히스토리만 있어도 매 스냅샷마다 쓰기 호출하지 않음 */
  useEffect(() => {
    if (!selectedRoomId) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last?.uid || last.uid === '__system__' || last.uid === 'system') return;
    if (isSystemChatMessage(last)) return;
    if (isMessageFromActivePersona(last)) return;
    markRoomAsReadThrottled(true);
  }, [selectedRoomId, messages, isMessageFromActivePersona, markRoomAsReadThrottled]);

  // 방에서 내보내졌을 때 채팅방 화면에서 나가기
  useEffect(() => {
    if (!selectedRoomId || !user?.uid) {
      wasRoomMemberRef.current = false;
      return;
    }
    const isMember = roomParticipants.some((member) =>
      isOwnedByUser(member, user.uid, ownedSubDocIds)
    );
    if (isMember) {
      wasRoomMemberRef.current = true;
      return;
    }
    if (wasRoomMemberRef.current && roomParticipants.length > 0) {
      wasRoomMemberRef.current = false;
      alert('방에서 내보내졌습니다.');
      setSelectedRoomId(null);
      setEnteredByPushLink(false);
    }
  }, [roomParticipants, selectedRoomId, user?.uid]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      userPinnedScrollRef.current = !isNearBottom();
      if (isNearBottom()) {
        userPinnedScrollRef.current = false;
        markRoomAsReadThrottled();
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [selectedRoomId, isNearBottom, markRoomAsReadThrottled]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const onFocus = () => markRoomAsReadThrottled(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') markRoomAsReadThrottled(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedRoomId, markRoomAsReadThrottled]);

  useEffect(() => {
    return () => {
      if (scrollRetryTimeoutRef.current) {
        window.clearTimeout(scrollRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!messageActionMenu) return;
    const close = () => setMessageActionMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('touchstart', close);
      window.removeEventListener('scroll', close);
    };
  }, [messageActionMenu]);

  const myDisplayNameInRoom = useMemo(() => {
    if (!profile || !selectedRoomId) return '';
    const persona = resolvePersonaDisplayForRoom(profile, selectedRoomId, localActivePersonaKey);
    return getDisplayName(persona.nickname, persona.profileNickname, {
      isSubAccount: persona.isSub
    });
  }, [profile, selectedRoomId, localActivePersonaKey]);

  const getRoomRestrictionLabel = useCallback((room?: AnonymousRoom) => {
    const required = room?.requiredActiveDays || 0;
    if (required <= 0) return '누구나 입장 가능';
    return `활동 ${required}일 이후 입장가능`;
  }, []);

  const canEnterRoom = useCallback((room: AnonymousRoom) => {
    const required = room.requiredActiveDays || 0;
    return userActiveDays >= required;
  }, [userActiveDays]);

  const finalizeEnterRoom = useCallback((room: AnonymousRoom, fromPushLink?: boolean) => {
    setEnteredByPushLink(Boolean(fromPushLink));
    setSelectedRoomId(room.id);
    clearDeepLinkRoomIdFromUrl();
    clearPendingPushRoomId();
  }, [clearDeepLinkRoomIdFromUrl]);

  const getEntryPersonaKey = useCallback(() => {
    if (canUseNeraeSubAccounts(user) && profile) return getActivePersonaKey(profile);
    return 'main';
  }, [user, profile]);

  const needsRoomNicknameSetup = useCallback(
    async (room: AnonymousRoom, personaKey: string) => {
      if (!user?.uid || !profile) return true;
      if (hasRoomPersonaNickname(profile, room.id, personaKey)) return false;

      const activeDocId =
        personaKey === 'main' ? user.uid : getSubParticipantDocId(personaKey);
      const partSnap = await getDoc(
        doc(db, 'anonymousChatRooms', room.id, 'participants', activeDocId)
      );
      if (partSnap.exists() && (partSnap.data()?.nickname || '').trim()) {
        return false;
      }
      return true;
    },
    [user?.uid, profile]
  );

  const openRoomNicknameModal = useCallback(
    (
      room: AnonymousRoom,
      options?: { fromPushLink?: boolean; isNewRoom?: boolean; personaKey?: string }
    ) => {
      const personaKey = options?.personaKey || getEntryPersonaKey();
      const suggestion =
        getRoomPersonaNickname(profile, room.id, personaKey) ||
        (profile?.customNickname || '').trim();
      setRoomNicknameInput(suggestion);
      setPendingRoomNickname({
        room,
        fromPushLink: options?.fromPushLink,
        isNewRoom: options?.isNewRoom,
        personaKey
      });
    },
    [profile, getEntryPersonaKey]
  );

  const handleEnterRoom = useCallback(async (
    room: AnonymousRoom,
    options?: { fromPushLink?: boolean; skipEntryCodeCheck?: boolean }
  ) => {
    if (!user?.uid || !profile) return;
    const participantsSnap = await getDocs(
      collection(db, 'anonymousChatRooms', room.id, 'participants')
    );
    const ownedSubs = getOwnedSubDocIds(profile);
    const entryParticipantDocId =
      canUseNeraeSubAccounts(user) && profile
        ? getActiveParticipantDocId(user.uid, profile)
        : user.uid;
    const isExistingMember = participantsSnap.docs.some((item) =>
      isOwnedByUser({ uid: item.id }, user.uid, ownedSubs)
    );

    if (!isExistingMember && !canEnterRoom(room)) {
      alert(`${getRoomRestrictionLabel(room)}\n현재 내 활동일: ${userActiveDays}일`);
      return;
    }

    const banUntilMs = getActiveRoomBanUntilMs(room, entryParticipantDocId);
    if (banUntilMs > Date.now()) {
      if (!Number.isFinite(banUntilMs)) {
        alert('이 방에서보내져 다시 입장할 수 없습니다.');
        return;
      }
      const banUntilText = new Date(banUntilMs).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      alert(`이 방에서보내져 ${banUntilText}까지 입장할 수 없습니다.`);
      return;
    }

    const expectedCode = (room.entryCode || '').trim();
    if (expectedCode && !options?.skipEntryCodeCheck) {
      setPendingEntryCodeRoom({ room, fromPushLink: options?.fromPushLink });
      setEntryCodeInput('');
      return;
    }

    const personaKey = getEntryPersonaKey();
    if (await needsRoomNicknameSetup(room, personaKey)) {
      openRoomNicknameModal(room, { fromPushLink: options?.fromPushLink, personaKey });
      return;
    }

    finalizeEnterRoom(room, options?.fromPushLink);
  }, [
    user,
    profile,
    canEnterRoom,
    userActiveDays,
    finalizeEnterRoom,
    getRoomRestrictionLabel,
    getEntryPersonaKey,
    needsRoomNicknameSetup,
    openRoomNicknameModal
  ]);

  useEffect(() => {
    if (!selectedRoomId || !profile) {
      setRoomNicknameChangeInput('');
      return;
    }
    const nick = getRoomPersonaNickname(profile, selectedRoomId, localActivePersonaKey);
    setRoomNicknameChangeInput(nick);
  }, [selectedRoomId, profile, localActivePersonaKey]);

  useEffect(() => {
    if (!user?.uid || !profile || selectedRoomId) return;
    const deepLinkRoomId = getPendingPushRoomId();
    if (!deepLinkRoomId) return;
    const room = roomById.get(deepLinkRoomId);
    if (!room) return;
    void handleEnterRoom(room, { fromPushLink: true });
  }, [user?.uid, profile, selectedRoomId, roomById, handleEnterRoom]);

  const selectedRoom = useMemo(
    () => (selectedRoomId ? roomById.get(selectedRoomId) : undefined),
    [selectedRoomId, roomById]
  );
  const selectedRoomDisplayTitle = useMemo(() => {
    if (!selectedRoom) return '익명 채팅방';
    const overrideTitle = (roomTitleOverrides[selectedRoom.id] || '').trim();
    return overrideTitle || selectedRoom.title || '익명 채팅방';
  }, [selectedRoom, roomTitleOverrides]);
  const myUid = user?.uid || '';
  const coHostParticipantIds = useMemo(
    () => getRoomCoHostParticipantIds(selectedRoom),
    [selectedRoom]
  );
  const canModerateChat = Boolean(
    myActiveParticipantDocId &&
      (myActiveParticipantDocId === selectedRoom?.createdByUid ||
        coHostParticipantIds.includes(myActiveParticipantDocId))
  );
  const canManageCoHost = Boolean(
    selectedRoom?.createdByUid && myActiveParticipantDocId === selectedRoom.createdByUid
  );
  const isMemberCoHost = useCallback(
    (participantDocId: string) =>
      Boolean(participantDocId && coHostParticipantIds.includes(participantDocId)),
    [coHostParticipantIds]
  );
  const getMemberManagePermissions = useCallback(
    (memberDocId: string) => {
      if (!memberDocId || memberDocId === myActiveParticipantDocId) {
        return { canToggleCoHost: false, canKick: false };
      }
      if (memberDocId === selectedRoom?.createdByUid) {
        return { canToggleCoHost: false, canKick: false };
      }
      if (isOwnedByUser({ uid: memberDocId }, myUid, ownedSubDocIds)) {
        return { canToggleCoHost: false, canKick: false };
      }
      const ownerCanAct = canManageCoHost;
      const coHostCanKickMember =
        canModerateChat && !canManageCoHost && !isMemberCoHost(memberDocId);
      return {
        canToggleCoHost: ownerCanAct,
        canKick: ownerCanAct || coHostCanKickMember
      };
    },
    [
      myActiveParticipantDocId,
      myUid,
      ownedSubDocIds,
      selectedRoom?.createdByUid,
      canManageCoHost,
      canModerateChat,
      isMemberCoHost
    ]
  );
  const isRoomNotificationMuted = Boolean(
    myUid && (selectedRoom?.notificationMutedUids || []).includes(myUid)
  );
  const myParticipant = useMemo(
    () => roomParticipants.find((member) => member.uid === myActiveParticipantDocId),
    [roomParticipants, myActiveParticipantDocId]
  );
  const myMuteUntilMs = useMemo(() => {
    const active = roomParticipants.find((member) => member.uid === myActiveParticipantDocId);
    return active ? toUnixMillis(active.chatMutedUntil) : 0;
  }, [roomParticipants, myActiveParticipantDocId]);
  const isMyChatMuted = myMuteUntilMs > Date.now();
  const isRoomFrozen = Boolean(selectedRoom?.isFrozen);

  const confirmRoomNickname = useCallback(async () => {
    if (!pendingRoomNickname || !user?.uid || !profile) return;
    const trimmed = roomNicknameInput.trim();
    if (!trimmed) {
      alert('닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 15) {
      alert('닉네임은 15자 이하로 입력해주세요.');
      return;
    }

    const { room, fromPushLink, isNewRoom, personaKey = 'main' } = pendingRoomNickname;
    const activeDocId = personaKey === 'main' ? user.uid : getSubParticipantDocId(personaKey);

    setSavingRoomNickname(true);
    try {
      const participantsSnap = await getDocs(
        collection(db, 'anonymousChatRooms', room.id, 'participants')
      );
      const participantsForNickCheck = participantsSnap.docs
        .map((item) => ({ uid: item.id, nickname: item.data().nickname as string | undefined }))
        .filter((member) => member.uid !== activeDocId);
      if (isRoomNicknameTaken(participantsForNickCheck, trimmed)) {
        alert('이 방에서 이미 사용 중인 닉네임입니다.');
        return;
      }

      const nextNicknamesByRoom = buildNextNicknamesByRoom(
        profile.nicknamesByRoom,
        room.id,
        personaKey,
        trimmed
      );
      const nextProfile: AnonymousProfile = { ...profile, nicknamesByRoom: nextNicknamesByRoom };

      await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
        nicknamesByRoom: nextNicknamesByRoom
      });

      if (isNewRoom) {
        await updateDoc(doc(db, 'anonymousChatRooms', room.id), {
          createdByNickname: trimmed
        });
      }

      const persona = resolvePersonaDisplayForRoom(nextProfile, room.id, personaKey);
      const participantRef = doc(db, 'anonymousChatRooms', room.id, 'participants', activeDocId);
      const partSnap = await getDoc(participantRef);
      if (partSnap.exists()) {
        await updateDoc(participantRef, {
          nickname: persona.nickname,
          profileNickname: persona.profileNickname
        });
      }

      setProfile(nextProfile);
      setPendingRoomNickname(null);
      setRoomNicknameInput('');

      if (isNewRoom) {
        finalizeEnterRoom(room);
      } else {
        finalizeEnterRoom(room, fromPushLink);
      }
    } catch (error) {
      console.error('방 닉네임 설정 실패:', error);
      alert('닉네임 설정 중 오류가 발생했습니다.');
    } finally {
      setSavingRoomNickname(false);
    }
  }, [
    pendingRoomNickname,
    user?.uid,
    profile,
    roomNicknameInput,
    finalizeEnterRoom
  ]);

  const handleChangeRoomNickname = useCallback(async () => {
    if (!user?.uid || !profile || !selectedRoomId) return;

    const trimmed = roomNicknameChangeInput.trim();
    if (!trimmed) {
      alert('변경할 닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 15) {
      alert('닉네임은 15자 이하로 입력해주세요.');
      return;
    }

    const personaKey = isNerae ? localActivePersonaKey : 'main';
    const currentNick = getRoomPersonaNickname(profile, selectedRoomId, personaKey);
    if (trimmed === currentNick) {
      alert('현재 닉네임과 동일합니다.');
      return;
    }

    const duplicateDocIds = listOwnedSubParticipantDuplicates(roomParticipants, user.uid, profile);
    const participantsForNickCheck = roomParticipants.filter(
      (member) =>
        member.uid !== myActiveParticipantDocId && !duplicateDocIds.includes(member.uid)
    );
    if (isRoomNicknameTaken(participantsForNickCheck, trimmed, myActiveParticipantDocId)) {
      alert('이 방에서 이미 사용 중인 닉네임입니다.');
      return;
    }

    setUpdatingRoomNickname(true);
    try {
      const nextNicknamesByRoom = buildNextNicknamesByRoom(
        profile.nicknamesByRoom,
        selectedRoomId,
        personaKey,
        trimmed
      );
      const persona = resolvePersonaDisplayForRoom(
        { ...profile, nicknamesByRoom: nextNicknamesByRoom },
        selectedRoomId,
        personaKey
      );

      await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
        nicknamesByRoom: nextNicknamesByRoom
      });
      await updateDoc(
        doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', myActiveParticipantDocId),
        {
          nickname: persona.nickname,
          profileNickname: persona.profileNickname
        }
      );

      if (personaKey === 'main' && selectedRoom?.createdByUid === user.uid) {
        await updateDoc(doc(db, 'anonymousChatRooms', selectedRoomId), {
          createdByNickname: trimmed
        });
      }

      setProfile((prev) => (prev ? { ...prev, nicknamesByRoom: nextNicknamesByRoom } : prev));
      alert('이 채팅방의 닉네임이 변경되었습니다.');
    } catch (error) {
      console.error('방 닉네임 변경 실패:', error);
      alert('닉네임 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingRoomNickname(false);
    }
  }, [
    user?.uid,
    profile,
    selectedRoomId,
    selectedRoom,
    roomNicknameChangeInput,
    isNerae,
    localActivePersonaKey,
    roomParticipants,
    myActiveParticipantDocId
  ]);

  const handleCreateRoom = useCallback(async () => {
    if (!user?.uid || !profile) return;
    const trimmed = roomTitleInput.trim();
    if (!trimmed) {
      alert('방 제목을 입력해주세요.');
      return;
    }
    if (trimmed.length > 30) {
      alert('방 제목은 30자 이하로 입력해주세요.');
      return;
    }

    setCreatingRoom(true);
    try {
      const roomRef = await addDoc(collection(db, 'anonymousChatRooms'), {
        title: trimmed,
        createdByUid: user.uid,
        createdByNickname: '',
        coHostUids: [],
        coHostParticipantIds: [],
        notificationMutedUids: [],
        isFrozen: false,
        requiredActiveDays: 0,
        entryCode: '',
        createdAt: serverTimestamp()
      });
      const createdRoom: AnonymousRoom = {
        id: roomRef.id,
        title: trimmed,
        createdByUid: user.uid,
        createdByNickname: '',
        createdAt: null
      };
      setRoomTitleInput('');
      openRoomNicknameModal(createdRoom, { isNewRoom: true, personaKey: 'main' });
    } catch (error) {
      console.error('채팅방 생성 실패:', error);
      alert('채팅방 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingRoom(false);
    }
  }, [user?.uid, profile, roomTitleInput, openRoomNicknameModal]);

  const handleDeleteRoom = useCallback(async (room: AnonymousRoom) => {
    if (!user?.uid || room.createdByUid !== user.uid) return;
    setPendingDeleteRoom(room);
  }, [user?.uid]);

  const confirmDeleteRoom = useCallback(async () => {
    const room = pendingDeleteRoom;
    if (!room || !user?.uid || room.createdByUid !== user.uid) return;

    setDeletingRoomId(room.id);
    try {
      const deleteRoomFn = httpsCallable<{ roomId: string }, { ok: boolean }>(
        functions,
        'deleteAnonymousChatRoom',
        { timeout: 300_000 }
      );
      await deleteRoomFn({ roomId: room.id });
      if (selectedRoomId === room.id) {
        setSelectedRoomId(null);
      }
    } catch (error) {
      console.error('채팅방 삭제 실패:', error);
      let message = '채팅방 삭제 중 오류가 발생했습니다.';
      if (error && typeof error === 'object') {
        const anyErr = error as { code?: string; message?: string };
        if (anyErr.code === 'functions/permission-denied') {
          message = '방장만 채팅방을 삭제할 수 있습니다.';
        } else if (typeof anyErr.message === 'string' && anyErr.message.trim().length > 0) {
          message = anyErr.message;
        }
      }
      alert(message);
    } finally {
      setDeletingRoomId(null);
      setPendingDeleteRoom(null);
    }
  }, [pendingDeleteRoom, user?.uid, selectedRoomId]);

  const handleSetRoomRequirement = useCallback(async (selectedRoom: AnonymousRoom) => {
    if (!selectedRoomId) return;
    if (selectedRoom.createdByUid !== user?.uid) return;

    const nextValue = Math.max(0, Math.min(9999, Number(roomRequirementInput) || 0));
    setSavingRoomRequirement(true);
    try {
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
        transaction.update(roomRef, { requiredActiveDays: nextValue });
      });
      setShowRoomMenu(false);
    } catch (error) {
      console.error('입장 제한 설정 실패:', error);
      alert('입장 제한 설정 중 오류가 발생했습니다.');
    } finally {
      setSavingRoomRequirement(false);
    }
  }, [selectedRoomId, user?.uid, roomRequirementInput]);

  const handleSetRoomEntryCode = useCallback(async (selectedRoom: AnonymousRoom) => {
    if (!selectedRoomId) return;
    if (selectedRoom.createdByUid !== user?.uid) return;
    const trimmedCode = roomEntryCodeInput.trim();
    if (trimmedCode.length > 20) {
      alert('입장 코드는 20자 이하로 입력해주세요.');
      return;
    }
    setSavingRoomEntryCode(true);
    try {
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
        transaction.update(roomRef, { entryCode: trimmedCode });
      });
      alert(trimmedCode ? '입장 코드가 설정되었습니다.' : '입장 코드가 해제되었습니다.');
      setShowRoomMenu(false);
    } catch (error) {
      console.error('입장 코드 설정 실패:', error);
      alert('입장 코드 설정 중 오류가 발생했습니다.');
    } finally {
      setSavingRoomEntryCode(false);
    }
  }, [selectedRoomId, user?.uid, roomEntryCodeInput]);

  const handleConfirmEntryCode = useCallback(async () => {
    if (!pendingEntryCodeRoom) return;
    const expectedCode = (pendingEntryCodeRoom.room.entryCode || '').trim();
    if (!expectedCode) {
      setPendingEntryCodeRoom(null);
      return;
    }
    if (entryCodeInput.trim() !== expectedCode) {
      alert('입장 코드가 올바르지 않습니다.');
      return;
    }
    const roomToEnter = pendingEntryCodeRoom.room;
    const fromPushLink = Boolean(pendingEntryCodeRoom.fromPushLink);
    setPendingEntryCodeRoom(null);
    setEntryCodeInput('');
    await handleEnterRoom(roomToEnter, { fromPushLink, skipEntryCodeCheck: true });
  }, [pendingEntryCodeRoom, entryCodeInput, handleEnterRoom]);

  const handleToggleRoomNotifications = useCallback(async () => {
    if (!selectedRoomId || !selectedRoom || !user?.uid) return;
    const muted = selectedRoom.notificationMutedUids || [];
    const isMuted = muted.includes(user.uid);
    const nextMuted = isMuted ? muted.filter((uid) => uid !== user.uid) : [...muted, user.uid];
    try {
      await updateDoc(doc(db, 'anonymousChatRooms', selectedRoomId), {
        notificationMutedUids: nextMuted
      });
    } catch (error) {
      console.error('채팅 알림 설정 변경 실패:', error);
      alert('채팅 알림 설정 변경에 실패했습니다.');
    }
  }, [selectedRoomId, selectedRoom, user?.uid]);

  const handleToggleCoHost = useCallback(async (memberDocId: string) => {
    if (!selectedRoomId || !selectedRoom || !user?.uid) return;
    if (selectedRoom.createdByUid !== user.uid) return;
    const selectedMember = roomParticipants.find((member) => member.uid === memberDocId);
    if (memberDocId === selectedRoom.createdByUid) return;

    const currentCoHosts = getRoomCoHostParticipantIds(selectedRoom);
    const alreadyAssigned = currentCoHosts.includes(memberDocId);
    const selectedMemberName = selectedMember?.nickname || '익명';

    try {
      const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
      await updateDoc(roomRef, {
        coHostParticipantIds: alreadyAssigned
          ? currentCoHosts.filter((id) => id !== memberDocId)
          : [...currentCoHosts, memberDocId]
      });

      await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
        uid: '__system__',
        senderLabel: 'system',
        content: alreadyAssigned
          ? `"${selectedMemberName}"님이 권력을 잃으셨습니다`
          : `"${selectedMemberName}"님이 권력을 얻으셨습니다`,
        systemText: alreadyAssigned
          ? `"${selectedMemberName}"님이 권력을 잃으셨습니다`
          : `"${selectedMemberName}"님이 권력을 얻으셨습니다`,
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('부방장 설정 실패:', error);
      alert('부방장 설정 중 오류가 발생했습니다.');
    }
  }, [selectedRoomId, selectedRoom, user?.uid, roomParticipants]);

  const handleKickParticipant = useCallback(async (memberDocId: string) => {
    if (!selectedRoomId || !selectedRoom || !user?.uid) return;
    const { canKick } = getMemberManagePermissions(memberDocId);
    if (!canKick) return;

    const selectedMember = roomParticipants.find((member) => member.uid === memberDocId);
    const selectedMemberName = selectedMember?.nickname || '익명';
    if (!window.confirm(`"${selectedMemberName}"님을 내보내시겠습니까?\n내보낸 멤버는 바로 다시 입장할 수 있습니다.`)) {
      return;
    }

    try {
      const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
      const participantRef = doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', memberDocId);
      const currentBanned = selectedRoom.bannedParticipantIds || [];
      const currentBannedUids = selectedRoom.bannedUids || [];
      const currentCoHosts = getRoomCoHostParticipantIds(selectedRoom);
      const roomTitle = selectedRoom.title || '채팅방';
      const kickNotifyMessage = `"${roomTitle}" 채팅방에서 내보내졌습니다. 언제든지 다시 입장할 수 있습니다.`;
      const noticeText = `"${selectedMemberName}"님이 내보내졌습니다`;

      let notifyUid = memberDocId;
      if (isLegacySubParticipantDocId(memberDocId)) {
        notifyUid = parseParticipantDocId(memberDocId).ownerUid;
      } else if (memberDocId.startsWith('sub_')) {
        const recentMsgSnap = await getDocs(
          query(
            collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'),
            where('senderParticipantDocId', '==', memberDocId)
          )
        );
        notifyUid = recentMsgSnap.docs.find((item) => item.data()?.uid)?.data()?.uid || '';
      }

      const kickedMember = selectedMember || roomParticipants.find((m) => m.uid === memberDocId);
      const kickedOwnerUid = kickedMember ? resolveMemberOwnerUid(kickedMember) : notifyUid;
      const otherPersonaRemains = roomParticipants.some((member) => {
        if (member.uid === memberDocId) return false;
        const ownerUid = resolveMemberOwnerUid(member);
        if (kickedOwnerUid && ownerUid === kickedOwnerUid) return true;
        return Boolean(notifyUid && (member.uid === notifyUid || ownerUid === notifyUid));
      });

      await runTransaction(db, async (transaction) => {
        transaction.update(roomRef, {
          /** 방장 내보내기는 재입장 제한 없음 — 기존 밴 표시도 제거 */
          bannedParticipantIds: currentBanned.filter((id) => id !== memberDocId),
          bannedUids: currentBannedUids.filter((id) => id !== memberDocId),
          [`banUntilByParticipantId.${memberDocId}`]: deleteField(),
          [`banUntilByUid.${memberDocId}`]: deleteField(),
          coHostParticipantIds: currentCoHosts.filter((id) => id !== memberDocId)
        });
        transaction.delete(participantRef);
      });

      if (notifyUid && !isChatPushMutedForUid(selectedRoom, notifyUid)) {
        await addDoc(collection(db, 'notifications'), {
          toUid: notifyUid,
          type: 'anonymous_chat_kick',
          postType: 'anonymous_chat',
          postId: selectedRoomId,
          roomId: selectedRoomId,
          postTitle: `익명채팅 - ${roomTitle}`,
          fromNickname: '익명채팅',
          message: otherPersonaRemains
            ? `"${roomTitle}" 방의 "${selectedMemberName}" 계정이보내졌습니다. 다른 익명 계정은 방에 남아 있습니다.`
            : kickNotifyMessage,
          route: `/anonymous-chat?roomId=${encodeURIComponent(selectedRoomId)}`,
          isRead: false,
          hiddenFromInbox: false,
          createdAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
        uid: '__system__',
        senderLabel: 'system',
        content: noticeText,
        systemText: noticeText,
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });

      setExpandedMemberUid((prev) => (prev === memberDocId ? null : prev));
    } catch (error) {
      console.error('멤버 내보내기 실패:', error);
      alert('멤버 내보내기 중 오류가 발생했습니다.');
    }
  }, [selectedRoomId, selectedRoom, user?.uid, roomParticipants, getMemberManagePermissions, ownedSubDocIds]);

  const openMessageActionMenu = useCallback((message: AnonymousMessage, x: number, y: number) => {
    setMessageActionMenu({ message, x, y });
  }, []);

  const scrollToMessageById = useCallback((messageId?: string) => {
    if (!messageId) return;
    const target = messageItemRefs.current[messageId];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((prev) => (prev === messageId ? null : prev)), 1400);
  }, []);

  const handleMuteParticipant = useCallback(async (targetMessage: AnonymousMessage) => {
    if (!selectedRoomId || !selectedRoom || !user?.uid) return;
    if (!canModerateChat) return;
    const targetUid = targetMessage.uid;
    if (!targetUid || targetUid === '__system__' || targetUid === user.uid) return;
    const targetName = targetMessage.senderLabel || '익명';
    try {
      const participantRef = doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', targetUid);
      const noticeRef = doc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'));
      const noticeText = `"${targetName}"님이 채팅정지(30초간) 되었습니다`;
      await runTransaction(db, async (transaction) => {
        transaction.set(participantRef, { chatMutedUntil: Timestamp.fromMillis(Date.now() + 30_000) }, { merge: true });
        transaction.set(noticeRef, {
          uid: '__system__',
          senderLabel: 'system',
          content: noticeText,
          systemText: noticeText,
          createdAtClient: Date.now(),
          createdAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('채팅정지 설정 실패:', error);
      alert('채팅정지 처리 중 오류가 발생했습니다.');
    }
  }, [selectedRoomId, selectedRoom, user?.uid, canModerateChat]);

  const clearComposerInput = useCallback(() => {
    inputValueRef.current = '';
    setInput('');
  }, []);

  const handleSendMessage = useCallback(async (textOverride?: string) => {
    if (sending) return;
    /* 버튼은 controlled input 기준 문자열을 넘김(ref 동기화 타이밍 이슈 방지) */
    const trimmedRaw = typeof textOverride === 'string'
      ? textOverride
      : `${inputValueRef.current ?? ''}`;
    const trimmed = trimmedRaw.trim();
    if (!trimmed) return;
    if (!user?.uid) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (!selectedRoomId) {
      alert('채팅방을 선택해주세요.');
      return;
    }
    if (!profile) {
      alert('익명 프로필을 불러오는 중입니다. 잠시 후 다시 전송해 주세요.');
      return;
    }
    const nowMs = Date.now();
    if (myMuteUntilMs > nowMs) {
      const remainSec = Math.max(1, Math.ceil((myMuteUntilMs - nowMs) / 1000));
      alert(`채팅정지 상태입니다. ${remainSec}초 후 다시 시도해주세요.`);
      return;
    }

    if (trimmed === '/청소') {
      if (!canModerateChat) {
        alert('방장/부방장만 사용할 수 있습니다.');
        return;
      }
      const hostUid = selectedRoom?.createdByUid;
      const isRoomOwner = Boolean(
        user?.uid &&
          hostUid &&
          (hostUid === user.uid || hostUid === myActiveParticipantDocId)
      );
      const lastCleanupMs = toUnixMillis(selectedRoom?.lastCleanupAt);
      if (
        !isRoomOwner &&
        lastCleanupMs > 0 &&
        nowMs - lastCleanupMs < 24 * 60 * 60 * 1000
      ) {
        alert('청소도우미는 하루에 한 번만 사용할 수 있습니다. (방장 제외)');
        return;
      }

      setSending(true);
      try {
        const cleanupRoom = httpsCallable<
          { roomId: string; requesterParticipantDocId?: string },
          { ok: boolean }
        >(functions, 'cleanupAnonymousChatRoom', { timeout: 300_000 });
        await cleanupRoom({ roomId: selectedRoomId, requesterParticipantDocId: myActiveParticipantDocId });
        clearComposerInput();
      } catch (error: unknown) {
        console.error('채팅방 청소 실패:', error);
        let message = '청소 중 오류가 발생했습니다.';
        if (error && typeof error === 'object') {
          const anyErr = error as { code?: string; message?: string };
          const code = String(anyErr.code || '');
          if (code === 'functions/deadline-exceeded') {
            message = '청소 처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
          } else if (code === 'functions/failed-precondition') {
            message = '청소도우미는 하루에 한 번만 사용할 수 있습니다. (방장 제외)';
          } else if (code === 'functions/permission-denied') {
            message = '방장/부방장만 청소할 수 있습니다.';
          } else if (typeof anyErr.message === 'string' && anyErr.message.trim().length > 0) {
            message = anyErr.message;
          }
        }
        alert(message);
      } finally {
        setSending(false);
        requestAnimationFrame(() => {
          forceScrollToLatest();
          refocusComposerInput();
        });
      }
      return;
    }

    if (isRoomFrozen) {
      alert('현재 채팅방 청소 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const messageToSend = trimmed;
    clearComposerInput();
    setReplyTarget(null);

    setSending(true);
    try {
      shouldAutoScrollRef.current = true;
      const senderNickname = resolveSenderNickname();
      const senderProfileNickname = resolveSenderProfileNickname();
      const chatMessagePreview = messageToSend.slice(0, 80);

      await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
        uid: user.uid,
        senderParticipantDocId: myActiveParticipantDocId,
        senderLabel: senderNickname,
        profileNickname: senderProfileNickname,
        content: messageToSend,
        replyToId: replyTarget?.id || null,
        replyPreviewSender: replyTarget?.senderLabel || '',
        replyPreviewContent: (replyTarget?.content || '').trim().slice(0, 80),
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });

      await updateDoc(
        doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', myActiveParticipantDocId),
        {
          lastMessageAt: serverTimestamp()
        }
      );

      const participantToFirebaseUid = new Map<string, string>();
      messages.forEach((m) => {
        const docId = (m.senderParticipantDocId || '').trim() || m.uid;
        if (docId && m.uid) participantToFirebaseUid.set(docId, m.uid);
      });
      const targetUidSet = new Set<string>();
      roomParticipants.forEach((member) => {
        if (member.uid === myActiveParticipantDocId) return;
        let target = (member.ownerUid || '').trim();
        if (!target) {
          if (!member.uid.startsWith('sub_') && !isLegacySubParticipantDocId(member.uid)) {
            target = member.uid;
          } else {
            target = participantToFirebaseUid.get(member.uid) || '';
          }
        }
        if (target && target !== user.uid) targetUidSet.add(target);
      });
      const targetUids = [...targetUidSet].filter(
        (targetUid) => !isChatPushMutedForUid(selectedRoom, targetUid)
      );

      if (targetUids.length > 0) {
        const notificationPayloads = targetUids.map((targetUid) => ({
          toUid: targetUid,
          type: 'anonymous_chat',
          postType: 'anonymous_chat',
          postId: selectedRoomId,
          postTitle: `익명채팅 - ${selectedRoom?.title || '채팅방'}`,
          message: `${senderNickname}: ${chatMessagePreview}`,
          chatMessagePreview,
          route: `/anonymous-chat?roomId=${encodeURIComponent(selectedRoomId)}`,
          roomId: selectedRoomId,
          fromUid: user.uid,
          fromParticipantDocId: myActiveParticipantDocId,
          fromNickname: senderNickname,
          hiddenFromInbox: true,
          // 푸시 트리거(구버전 함수 포함) 호환을 위해 unread 상태로 생성
          // hiddenFromInbox=true 이므로 알림함/배지에는 노출되지 않음
          isRead: false,
          createdAt: serverTimestamp()
        }));

        // 알림 저장은 UI 반응성과 분리해 백그라운드로 처리
        void Promise.all(
          notificationPayloads.map((payload) => addDoc(collection(db, 'notifications'), payload))
        ).catch((error) => {
          console.error('채팅 알림 생성 실패:', error);
        });
      }
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
      inputValueRef.current = messageToSend;
      setInput(messageToSend);
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        forceScrollToLatest();
        refocusComposerInput();
      });
    }
  }, [
    sending,
    clearComposerInput,
    profile,
    user?.uid,
    user?.nickname,
    selectedRoomId,
    selectedRoom,
    selectedRoom?.createdByUid,
    selectedRoom?.lastCleanupAt,
    selectedRoom?.title,
    myActiveParticipantDocId,
    myMuteUntilMs,
    canModerateChat,
    isRoomFrozen,
    replyTarget,
    roomParticipants,
    resolveSenderNickname,
    resolveSenderProfileNickname,
    forceScrollToLatest,
    refocusComposerInput
  ]);

  const handleBackToRoomList = useCallback(() => {
    setSelectedRoomId(null);
    setEnteredByPushLink(false);
    setEditingRoomTitle(false);
    setRoomTitleDraft('');
  }, []);

  const startRoomTitleEdit = useCallback(() => {
    if (!selectedRoom) return;
    setRoomTitleDraft(selectedRoomDisplayTitle);
    setEditingRoomTitle(true);
  }, [selectedRoom, selectedRoomDisplayTitle]);

  const cancelRoomTitleEdit = useCallback(() => {
    setEditingRoomTitle(false);
    setRoomTitleDraft('');
  }, []);

  const saveRoomTitleOverride = useCallback(() => {
    if (!selectedRoom) return;
    const trimmed = roomTitleDraft.trim().slice(0, 30);
    setRoomTitleOverrides((prev) => {
      const next = { ...prev };
      if (!trimmed || trimmed === selectedRoom.title) {
        delete next[selectedRoom.id];
      } else {
        next[selectedRoom.id] = trimmed;
      }
      return next;
    });
    setEditingRoomTitle(false);
  }, [selectedRoom, roomTitleDraft]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage(e.currentTarget.value);
    }
  }, [handleSendMessage]);

  const closePendingDeleteRoomModal = useCallback(() => {
    setPendingDeleteRoom(null);
  }, []);

  const handleConfirmDeleteRoomClick = useCallback(() => {
    void confirmDeleteRoom();
  }, [confirmDeleteRoom]);

  const activePersonaKey = isNerae ? localActivePersonaKey : 'main';
  const neraeSubAccounts = profile?.subAccounts || [];

  /** 타임라인 메시지 행 메타를 한 번에 계산해 렌더당 O(메시지×참가자) 반복을 피함 */
  const timelineMessageRowById = useMemo(() => {
    type RowModel = {
      displayName: string;
      isMine: boolean;
      unreadCount: number;
      showReceipt: boolean;
      createdAtText: string;
    };
    const map = new Map<string, RowModel>();
    const participants = roomParticipants;
    const readAt = participantReadAtByUid;
    const participantByUid = new Map(participants.map((m) => [m.uid, m]));

    const displayNameForSender = (message: AnonymousMessage, senderDocId: string): string => {
      const senderMember = participantByUid.get(senderDocId);
      const label = (message.senderLabel || '').trim();
      const nickname = (senderMember?.nickname || '').trim() || label || '';
      const profileNickname = message.profileNickname || senderMember?.profileNickname;
      const isSubSender = Boolean(
        ownedSubDocIds.includes(senderDocId) ||
          senderMember?.isSubAccount ||
          isLegacySubParticipantDocId(senderDocId)
      );
      const nick = nickname.trim();
      if (!nick) return '익명';
      if (isSubSender) return nick;
      if (isNerae && profileNickname) {
        return `${nick}(${profileNickname.trim()})`;
      }
      return nick;
    };

    for (const item of chatTimeline) {
      if (item.type !== 'message') continue;
      const message = item.message;
      if (isSystemChatMessage(message)) {
        const notice = (message.systemText || message.content || '').trim();
        if (notice) continue;
      }

      const senderDocId = isNerae
        ? resolveMessageSenderParticipantDocId(message, myUid, participants, ownedSubDocIds)
        : message.uid;

      const isMine = isNerae
        ? isMessageSentByActivePersona(
            message,
            myActiveParticipantDocId,
            activePersonaKey,
            myUid,
            participants,
            profile,
            ownedSubDocIds
          )
        : message.uid === myUid;

      const isSentByOwnedPersona = isMessageSentByOwnedAccount(message, myUid);
      const messageMs = getMessageReceiptMs(message);
      let eligibleCount = 0;
      let readCount = 0;
      if (messageMs > 0) {
        for (const member of participants) {
          if (member.uid === senderDocId) continue;
          if (isSentByOwnedPersona && isOwnedByUser(member, myUid, ownedSubDocIds)) continue;
          eligibleCount += 1;
          const readMs = readAt.get(member.uid) || 0;
          if (hasParticipantReadMessage(readMs, messageMs)) {
            readCount += 1;
          }
        }
      }
      const unreadCount = messageMs > 0 ? Math.max(0, eligibleCount - readCount) : 0;
      const showReceipt = messageMs > 0 && eligibleCount > 0;
      const messageSortSec = getMessageSortSeconds(message);
      const createdAtText = messageSortSec
        ? new Date(messageSortSec * 1000).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          })
        : '';

      map.set(message.id, {
        displayName: displayNameForSender(message, senderDocId),
        isMine,
        unreadCount,
        showReceipt,
        createdAtText
      });
    }
    return map;
  }, [
    chatTimeline,
    roomParticipants,
    participantReadAtByUid,
    isNerae,
    myUid,
    myActiveParticipantDocId,
    activePersonaKey,
    profile,
    ownedSubDocIds
  ]);

  const upsertParticipantPersonaInRoom = useCallback(
    async (
      roomId: string,
      ownerUid: string,
      personaKey: 'main' | string,
      nickname: string,
      joinedAtMs: number
    ) => {
      const isSub = personaKey !== 'main';
      const docId = isSub ? getSubParticipantDocId(personaKey) : ownerUid;
      const participantRef = doc(db, 'anonymousChatRooms', roomId, 'participants', docId);
      const snap = await getDoc(participantRef);
      const nextNick = nickname.trim() || '익명';
      if (snap.exists()) {
        const existing = snap.data() as RoomParticipant;
        if ((existing.nickname || '').trim() !== nextNick) {
          await updateDoc(participantRef, { nickname: nextNick, profileNickname: '' });
        }
        return false;
      }

      const payload: Record<string, unknown> = {
        uid: docId,
        nickname: nextNick,
        profileNickname: '',
        joinedAt: Timestamp.fromMillis(joinedAtMs),
        lastMessageAt: serverTimestamp(),
        lastReadAt: serverTimestamp()
      };
      if (!isSub) payload.ownerUid = ownerUid;
      await setDoc(participantRef, payload);
      return true;
    },
    []
  );

  const postParticipantJoinMessage = useCallback(async (roomId: string, nickname: string) => {
    const displayNick = nickname.trim() || '익명';
    const text = `${displayNick}님이 입장하셨습니다.`;
    await addDoc(collection(db, 'anonymousChatRooms', roomId, 'messages'), {
      uid: '__system__',
      senderLabel: 'system',
      content: text,
      systemText: text,
      createdAtClient: Date.now(),
      createdAt: serverTimestamp()
    });
  }, []);

  const postParticipantLeaveMessage = useCallback(async (roomId: string, nickname: string) => {
    const displayNick = nickname.trim() || '익명';
    const text = `${displayNick}님이 나가셨습니다.`;
    await addDoc(collection(db, 'anonymousChatRooms', roomId, 'messages'), {
      uid: '__system__',
      senderLabel: 'system',
      content: text,
      systemText: text,
      createdAtClient: Date.now(),
      createdAt: serverTimestamp()
    });
  }, []);

  const savePersonaPresence = useCallback(
    async (roomId: string, profileData: AnonymousProfile, personaKey: string, joinedAtMs: number) => {
      if (!user?.uid) return;
      const prevRoomPresence = profileData.presenceByRoom?.[roomId] || {};
      const nextRoomPresence =
        personaKey === 'main'
          ? { ...prevRoomPresence, mainJoinedAtMs: joinedAtMs }
          : {
              ...prevRoomPresence,
              subs: { ...(prevRoomPresence.subs || {}), [personaKey]: joinedAtMs }
            };
      const nextPresenceByRoom: RoomPresenceByRoom = {
        ...(profileData.presenceByRoom || {}),
        [roomId]: nextRoomPresence
      };
      await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
        presenceByRoom: nextPresenceByRoom
      });
    },
    [user?.uid]
  );

  const switchNeraePersona = useCallback(
    async (targetPersona: 'main' | string) => {
      if (!isNerae || !profile || !user?.uid || !selectedRoomId || personaBusy) return;
      const nextKey = targetPersona === 'main' ? 'main' : targetPersona.trim();
      if (!nextKey || nextKey === activePersonaKey) return;
      if (nextKey !== 'main' && !neraeSubAccounts.some((item) => item.id === nextKey)) return;

      const targetDocId = nextKey === 'main' ? user.uid : getSubParticipantDocId(nextKey);
      const targetExists = roomParticipants.some((member) => member.uid === targetDocId);
      if (!targetExists) {
        alert('아직 이 방에 입장하지 않은 계정입니다. + 버튼으로 추가해주세요.');
        return;
      }

      setPersonaBusy(true);
      try {
        const currentJoinedAtMs = toUnixMillis(myParticipant?.joinedAt) || Date.now();
        await savePersonaPresence(selectedRoomId, profile, activePersonaKey, currentJoinedAtMs);

        setLocalActivePersonaKey(nextKey);
        const nextProfile: AnonymousProfile = { ...profile, activePersona: nextKey };
        await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
          activePersona: nextKey
        });
        setProfile(nextProfile);
        setExpandedMemberUid(null);
      } catch (error) {
        console.error('계정 전환 실패:', error);
        alert('계정 전환 중 오류가 발생했습니다.');
      } finally {
        setPersonaBusy(false);
      }
    },
    [
      isNerae,
      profile,
      user?.uid,
      selectedRoomId,
      personaBusy,
      activePersonaKey,
      neraeSubAccounts,
      myParticipant?.joinedAt,
      roomParticipants,
      savePersonaPresence
    ]
  );

  const createNeraeSubAccount = useCallback(async () => {
    if (!isNerae || !profile || !user?.uid || !selectedRoomId || personaBusy) return;
    const trimmed = neraeSubNicknameInput.trim();
    if (!trimmed) {
      alert('부계정 닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 15) {
      alert('닉네임은 15자 이하로 입력해주세요.');
      return;
    }
    if (neraeSubAccounts.length >= MAX_NERAE_SUB_ACCOUNTS) {
      alert(`부계정은 최대 ${MAX_NERAE_SUB_ACCOUNTS}개까지 생성할 수 있습니다.`);
      return;
    }
    if (neraeSubAccounts.some((item) => item.customNickname === trimmed)) {
      alert('이미 같은 닉네임의 부계정이 있습니다.');
      return;
    }
    const duplicateDocIds = listOwnedSubParticipantDuplicates(roomParticipants, user.uid, profile);
    const participantsForNickCheck = roomParticipants.filter(
      (member) => !duplicateDocIds.includes(member.uid)
    );
    if (isRoomNicknameTaken(participantsForNickCheck, trimmed)) {
      alert('이 방에서 이미 사용 중인 닉네임입니다.');
      return;
    }

    setPersonaBusy(true);
    try {
      if (duplicateDocIds.length > 0) {
        await Promise.all(
          duplicateDocIds.map((docId) =>
            deleteDoc(doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', docId))
          )
        );
      }

      const subId = createSubAccountId();
      const currentJoinedAtMs = toUnixMillis(myParticipant?.joinedAt) || Date.now();
      await savePersonaPresence(selectedRoomId, profile, activePersonaKey, currentJoinedAtMs);

      const nextSubAccounts = [...neraeSubAccounts, { id: subId, customNickname: trimmed }];
      const joinedAtMs = Date.now();
      const nextNicknamesByRoom = buildNextNicknamesByRoom(
        profile.nicknamesByRoom,
        selectedRoomId,
        subId,
        trimmed
      );
      const nextProfile: AnonymousProfile = {
        ...profile,
        subAccounts: nextSubAccounts,
        activePersona: subId,
        nicknamesByRoom: nextNicknamesByRoom,
        presenceByRoom: {
          ...(profile.presenceByRoom || {}),
          [selectedRoomId]: {
            ...(profile.presenceByRoom?.[selectedRoomId] || {}),
            subs: {
              ...(profile.presenceByRoom?.[selectedRoomId]?.subs || {}),
              [subId]: joinedAtMs
            }
          }
        }
      };

      setLocalActivePersonaKey(subId);
      setProfile(nextProfile);

      const created = await upsertParticipantPersonaInRoom(
        selectedRoomId,
        user.uid,
        subId,
        trimmed,
        joinedAtMs
      );
      if (created) {
        await postParticipantJoinMessage(selectedRoomId, trimmed);
      }

      await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
        subAccounts: nextSubAccounts,
        activePersona: subId,
        nicknamesByRoom: nextNicknamesByRoom,
        presenceByRoom: nextProfile.presenceByRoom
      });

      setNeraeSubNicknameInput('');
      setShowNeraeSubCreate(false);
    } catch (error) {
      console.error('부계정 생성 실패:', error);
      alert('부계정 생성 중 오류가 발생했습니다.');
    } finally {
      setPersonaBusy(false);
    }
  }, [
    isNerae,
    profile,
    user?.uid,
    selectedRoomId,
    personaBusy,
    neraeSubNicknameInput,
    neraeSubAccounts,
    myParticipant?.joinedAt,
    activePersonaKey,
    savePersonaPresence,
    upsertParticipantPersonaInRoom,
    postParticipantJoinMessage
  ]);

  const deleteNeraeSubAccount = useCallback(
    async (subId: string, nickname: string) => {
      if (!isNerae || !profile || !user?.uid || personaBusy) return;
      const trimmedSubId = subId.trim();
      if (!trimmedSubId) return;

      const targetSub = neraeSubAccounts.find((item) => item.id === trimmedSubId);
      if (!targetSub) return;

      const displayNick = (nickname || targetSub.customNickname).trim() || '익명';
      if (
        !window.confirm(
          `"${displayNick}" 멤버를 삭제하시겠습니까?\n채팅방에서 나간 것으로 표시됩니다.`
        )
      ) {
        return;
      }

      setPersonaBusy(true);
      try {
        const participantSnap = await getDocs(collectionGroup(db, 'participants'));
        const subParticipantDocs = participantSnap.docs.filter(
          (participantDoc) => participantDoc.id === trimmedSubId
        );

        for (const participantDoc of subParticipantDocs) {
          const roomId = participantDoc.ref.parent.parent?.id;
          if (!roomId) continue;
          await postParticipantLeaveMessage(roomId, displayNick);
          await deleteDoc(participantDoc.ref);
        }

        const nextSubAccounts = neraeSubAccounts.filter((item) => item.id !== trimmedSubId);
        const nextPresenceByRoom: RoomPresenceByRoom = {};
        Object.entries(profile.presenceByRoom || {}).forEach(([roomId, presence]) => {
          if (!presence.subs?.[trimmedSubId]) {
            nextPresenceByRoom[roomId] = presence;
            return;
          }
          const { [trimmedSubId]: _removed, ...restSubs } = presence.subs;
          nextPresenceByRoom[roomId] = {
            ...presence,
            ...(Object.keys(restSubs).length > 0 ? { subs: restSubs } : {})
          };
        });

        const switchingToMain = activePersonaKey === trimmedSubId;
        const nextProfile: AnonymousProfile = {
          ...profile,
          subAccounts: nextSubAccounts,
          presenceByRoom: nextPresenceByRoom,
          ...(switchingToMain ? { activePersona: 'main' } : {})
        };

        await updateDoc(doc(db, 'anonymousChatProfiles', user.uid), {
          subAccounts: nextSubAccounts,
          presenceByRoom: nextPresenceByRoom,
          ...(switchingToMain ? { activePersona: 'main' } : {})
        });
        if (switchingToMain) setLocalActivePersonaKey('main');
        setProfile(nextProfile);
        setExpandedMemberUid(null);
      } catch (error) {
        console.error('부계정 삭제 실패:', error);
        alert('멤버 삭제 중 오류가 발생했습니다.');
      } finally {
        setPersonaBusy(false);
      }
    },
    [
      isNerae,
      profile,
      user?.uid,
      personaBusy,
      neraeSubAccounts,
      activePersonaKey,
      postParticipantLeaveMessage
    ]
  );

  const openMembersModal = useCallback(() => {
    setExpandedMemberUid(null);
    setShowNeraeSubCreate(false);
    setNeraeSubNicknameInput('');
    setShowMembersModal(true);
  }, []);

  const closeMembersModal = useCallback(() => {
    setExpandedMemberUid(null);
    setShowNeraeSubCreate(false);
    setNeraeSubNicknameInput('');
    setShowMembersModal(false);
  }, []);

  const handleMemberRowClick = useCallback(
    (memberDocId: string) => {
      const member = roomParticipants.find((item) => item.uid === memberDocId);
      if (isNerae && member && isOwnedByUser(member, myUid, ownedSubDocIds)) {
        const targetKey = resolvePersonaKeyFromMemberDocId(member.uid, myUid, ownedSubDocIds);
        if (!targetKey) return;
        if (targetKey !== activePersonaKey) {
          setLocalActivePersonaKey(targetKey);
          void switchNeraePersona(targetKey === 'main' ? 'main' : targetKey);
        }
        return;
      }
      const { canToggleCoHost, canKick } = getMemberManagePermissions(memberDocId);
      if (!canToggleCoHost && !canKick) return;
      setExpandedMemberUid((prev) => (prev === memberDocId ? null : memberDocId));
    },
    [
      getMemberManagePermissions,
      isNerae,
      myUid,
      roomParticipants,
      activePersonaKey,
      ownedSubDocIds,
      switchNeraePersona
    ]
  );

  const toggleRoomMenu = useCallback(() => {
    setShowRoomMenu((prev) => !prev);
  }, []);

  const handleThemeToggle = useCallback(() => {
    setIsKakaoTheme((prev) => {
      const next = !prev;
      localStorage.setItem(CHAT_THEME_STORAGE_KEY, next ? 'kakao' : 'classic');
      return next;
    });
  }, []);

  const closeMessageActionMenu = useCallback(() => {
    setMessageActionMenu(null);
  }, []);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const messageId = e.currentTarget.dataset.messageId;
    if (!messageId) return;
    const message = timelineMessageById.get(messageId);
    if (!message) return;
    openMessageActionMenu(message, e.clientX, e.clientY);
  }, [timelineMessageById, openMessageActionMenu]);

  const handleMessageTouchMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isTouchDevice) return;
    const messageId = e.currentTarget.dataset.messageId;
    if (!messageId) return;
    const message = timelineMessageById.get(messageId);
    if (!message) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openMessageActionMenu(message, rect.left + rect.width * 0.7, rect.top + rect.height * 0.5);
  }, [isTouchDevice, timelineMessageById, openMessageActionMenu]);

  const handleReplyBlockClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const replyToId = e.currentTarget.dataset.replyId;
    if (!replyToId) return;
    scrollToMessageById(replyToId);
  }, [scrollToMessageById]);

  const handleSelectReplyFromMenu = useCallback(() => {
    if (!messageActionMenu) return;
    setReplyTarget({
      id: messageActionMenu.message.id,
      senderLabel: messageActionMenu.message.senderLabel || '익명',
      content: messageActionMenu.message.content || ''
    });
    setMessageActionMenu(null);
  }, [messageActionMenu]);

  const handleMuteFromMenu = useCallback(() => {
    if (!messageActionMenu) return;
    void handleMuteParticipant(messageActionMenu.message);
    setMessageActionMenu(null);
  }, [messageActionMenu, handleMuteParticipant]);

  const handleReplyPreviewClick = useCallback(() => {
    if (!replyTarget?.id) return;
    scrollToMessageById(replyTarget.id);
  }, [replyTarget?.id, scrollToMessageById]);

  const handleClearReplyTarget = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    setReplyTarget(null);
  }, []);

  const openChatInNewWindow = useCallback(() => {
    const path = selectedRoomId
      ? `/anonymous-chat?roomId=${encodeURIComponent(selectedRoomId)}`
      : '/anonymous-chat';
    const url = `${window.location.origin}${path}`;
    const features = [
      'width=420',
      'height=760',
      'left=60',
      'top=40',
      'menubar=no',
      'toolbar=no',
      'location=yes',
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');
    window.open(url, 'veryus-anonymous-chat', `${features},noopener,noreferrer`);
  }, [selectedRoomId]);

  if (loading) {
    return <div className="anonymous-chat-page">로딩 중...</div>;
  }

  if (!user?.uid) {
    return <div className="anonymous-chat-page">로그인 후 이용 가능합니다.</div>;
  }

  if (!profile) {
    return <div className="anonymous-chat-page">로딩 중...</div>;
  }

  const roomNicknameModal = pendingRoomNickname ? (
    <div
      className="anonymous-chat-members-overlay"
      onClick={() => {
        if (!savingRoomNickname) setPendingRoomNickname(null);
      }}
    >
      <div className="anonymous-chat-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="anonymous-chat-members-title">
          {pendingRoomNickname.isNewRoom ? '채팅방 만들기' : '채팅방 입장'}
        </div>
        <div className="anonymous-chat-members-empty">
          "{pendingRoomNickname.room.title}"에서 사용할 익명 닉네임을 입력해주세요.
          <br />
          방마다 다른 닉네임을 사용할 수 있습니다.
        </div>
        <div className="anonymous-chat-room-menu-row">
          <input
            type="text"
            maxLength={15}
            autoFocus
            value={roomNicknameInput}
            placeholder="닉네임 (최대 15자)"
            onChange={(e) => setRoomNicknameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmRoomNickname();
              }
            }}
          />
        </div>
        <div className="anonymous-chat-room-menu-actions">
          <button
            type="button"
            className="anonymous-chat-members-close"
            onClick={() => void confirmRoomNickname()}
            disabled={savingRoomNickname || !roomNicknameInput.trim()}
          >
            {savingRoomNickname ? '설정 중...' : pendingRoomNickname.isNewRoom ? '만들고 입장' : '입장하기'}
          </button>
          <button
            type="button"
            className="anonymous-chat-members-close secondary"
            onClick={() => setPendingRoomNickname(null)}
            disabled={savingRoomNickname}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!selectedRoomId) {
    return (
      <div className="anonymous-chat-page anonymous-chat-list-page">
        <header className="anonymous-chat-list-header">
          <div className="anonymous-chat-header-title-row">
            <button
              type="button"
              className="anonymous-chat-back-to-home-btn"
              aria-label="메인보드로 돌아가기"
              title="메인보드로 돌아가기"
              onClick={() => navigate('/')}
            >
              <ChevronLeft size={22} />
            </button>
            <h2>익명 채팅방 목록</h2>
            <button
              type="button"
              className="anonymous-chat-open-window-btn"
              aria-label="익명채팅을 별도 창으로"
              title="별도 창에서 열기 (PC 권장)"
              onClick={openChatInNewWindow}
            >
              <AppWindow size={20} />
            </button>
          </div>
          <p className="anonymous-chat-setup-note anonymous-chat-setup-note-tight">
            채팅방마다 서로 다른 익명 닉네임으로 입장할 수 있습니다.
          </p>
        </header>
        <section className="anonymous-chat-list-section" aria-label="새 채팅방 만들기">
          <h3 className="anonymous-chat-list-section__title">새 채팅방</h3>
          <div className="anonymous-chat-room-create anonymous-chat-room-create--stack">
            <input
              type="text"
              value={roomTitleInput}
              onChange={(e) => setRoomTitleInput(e.target.value)}
              maxLength={30}
              placeholder="채팅방 제목 (최대 30자)"
            />
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={creatingRoom || !roomTitleInput.trim()}
            >
              {creatingRoom ? '생성 중...' : '채팅방 만들기'}
            </button>
          </div>
        </section>
        <section className="anonymous-chat-list-section anonymous-chat-list-section--rooms" aria-label="채팅방 목록">
          <div className="anonymous-chat-list-section__head">
            <h3 className="anonymous-chat-list-section__title">채팅방</h3>
            <span className="anonymous-chat-list-section__count">{rooms.length}개</span>
          </div>
          <ul className="anonymous-chat-room-list">
            {rooms.length === 0 && (
              <li className="anonymous-chat-empty">아직 생성된 채팅방이 없습니다.</li>
            )}
            {rooms.map((room) => {
              const canDeleteRoom = room.createdByUid === user.uid;
              return (
            <li key={room.id} className="anonymous-chat-room-item">
              <button
                className="anonymous-chat-room-enter"
                onClick={() => {
                  void handleEnterRoom(room, { fromPushLink: false });
                }}
                type="button"
              >
                <span className="anonymous-chat-room-title">{room.title}</span>
                <span className="anonymous-chat-room-sub">
                  방장 · {getDisplayName(room.createdByNickname, '')}
                </span>
                <div className="anonymous-chat-room-tags">
                  <span className="anonymous-chat-room-rule">{getRoomRestrictionLabel(room)}</span>
                  {(room.entryCode || '').trim() && (
                    <span className="anonymous-chat-room-tag">입장코드</span>
                  )}
                </div>
              </button>
              {canDeleteRoom && (
                <button
                  className="anonymous-chat-room-delete"
                  onClick={() => handleDeleteRoom(room)}
                  disabled={deletingRoomId === room.id}
                  type="button"
                  aria-label={`${room.title} 삭제`}
                  title="채팅방 삭제"
                >
                  {deletingRoomId === room.id ? (
                    <span className="anonymous-chat-room-delete__label">…</span>
                  ) : (
                    <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </button>
              )}
            </li>
              );
            })}
          </ul>
        </section>
        {pendingDeleteRoom && (
          <div className="anonymous-chat-members-overlay" onClick={closePendingDeleteRoomModal}>
            <div className="anonymous-chat-members-modal" onClick={(e) => e.stopPropagation()}>
              <div className="anonymous-chat-members-title">채팅방 삭제</div>
              <div className="anonymous-chat-members-empty">"{pendingDeleteRoom.title}" 채팅방을 삭제하시겠습니까?</div>
              <button
                type="button"
                className="anonymous-chat-members-close"
                onClick={handleConfirmDeleteRoomClick}
                disabled={deletingRoomId === pendingDeleteRoom.id}
              >
                {deletingRoomId === pendingDeleteRoom.id ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        )}
        {roomNicknameModal}
      </div>
    );
  }

  return (
    <div className={`anonymous-chat-room-screen ${isKakaoTheme ? 'theme-kakao' : 'theme-classic'}`}>
      <header className="anonymous-chat-topbar">
        <button
          className="anonymous-chat-topbar-back"
          onClick={handleBackToRoomList}
          type="button"
          aria-label="채팅방 목록으로"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="anonymous-chat-topbar-center">
          <div className="anonymous-chat-topbar-title-row">
            {editingRoomTitle ? (
              <input
                type="text"
                value={roomTitleDraft}
                maxLength={30}
                className="anonymous-chat-room-title-edit-input"
                onChange={(e) => setRoomTitleDraft(e.target.value)}
                onBlur={saveRoomTitleOverride}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveRoomTitleOverride();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRoomTitleEdit();
                  }
                }}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="anonymous-chat-room-title-edit-trigger"
                title="방제 별칭 수정"
                onClick={startRoomTitleEdit}
              >
                {selectedRoomDisplayTitle}
              </button>
            )}
            <button
              type="button"
              className="anonymous-chat-members-btn"
              onClick={openMembersModal}
              aria-label={`입장 멤버 ${sortedParticipants.length}명`}
            >
              <Users size={14} aria-hidden="true" />
              <span>{sortedParticipants.length}</span>
            </button>
          </div>
        </div>
        <div className="anonymous-chat-topbar-actions">
          <div className="anonymous-chat-topbar-actions__secondary">
            <button
              type="button"
              aria-label="익명채팅을 별도 창으로"
              title="별도 창에서 열기 (PC 권장)"
              onClick={openChatInNewWindow}
            >
              <AppWindow size={19} />
            </button>
          </div>
          <button
            type="button"
            className={`anonymous-chat-topbar-icon-btn ${isRoomNotificationMuted ? 'is-muted' : ''}`}
            aria-label={isRoomNotificationMuted ? '채팅 푸시 켜기' : '채팅 푸시 끄기'}
            title={isRoomNotificationMuted ? '채팅 푸시 켜기' : '채팅 푸시 끄기'}
            onClick={handleToggleRoomNotifications}
          >
            {isRoomNotificationMuted ? <BellOff size={20} /> : <Bell size={20} />}
          </button>
          <button
            type="button"
            className={`anonymous-chat-topbar-icon-btn ${showRoomMenu ? 'is-active' : ''}`}
            aria-label="채팅방 메뉴"
            aria-expanded={showRoomMenu}
            onClick={toggleRoomMenu}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      {(getRoomRestrictionLabel(selectedRoom) || isRoomFrozen || isMyChatMuted) && (
        <div className="anonymous-chat-room-status-bar">
          {getRoomRestrictionLabel(selectedRoom) && (
            <span className="anonymous-chat-room-status-chip">{getRoomRestrictionLabel(selectedRoom)}</span>
          )}
          {isRoomFrozen && (
            <span className="anonymous-chat-room-status-chip anonymous-chat-room-status-chip--warn">청소 중</span>
          )}
          {isMyChatMuted && (
            <span className="anonymous-chat-room-status-chip anonymous-chat-room-status-chip--danger">채팅정지</span>
          )}
        </div>
      )}

      {showRoomMenu && (
        <div className="anonymous-chat-room-menu">
          <div className="anonymous-chat-room-menu-title">테마</div>
          <label className="anonymous-chat-theme-toggle">
            <span>카톡 테마</span>
            <input
              type="checkbox"
              checked={isKakaoTheme}
              onChange={handleThemeToggle}
            />
          </label>
          <div className="anonymous-chat-room-menu-divider" />
          <div className="anonymous-chat-room-menu-title">이 방 닉네임</div>
          {myDisplayNameInRoom && (
            <p className="anonymous-chat-setup-note anonymous-chat-setup-note-tight">
              현재: {myDisplayNameInRoom}
            </p>
          )}
          <div className="anonymous-chat-room-menu-row">
            <input
              type="text"
              maxLength={15}
              placeholder="닉네임 (최대 15자)"
              value={roomNicknameChangeInput}
              onChange={(e) => setRoomNicknameChangeInput(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="anonymous-chat-room-menu-save"
            onClick={() => void handleChangeRoomNickname()}
            disabled={updatingRoomNickname || !roomNicknameChangeInput.trim()}
          >
            {updatingRoomNickname ? '변경 중...' : '닉네임 변경'}
          </button>
          <div className="anonymous-chat-room-menu-divider" />
          {selectedRoom?.createdByUid === user?.uid ? (
            <>
              <div className="anonymous-chat-room-menu-title">입장 코드 설정</div>
              <div className="anonymous-chat-room-menu-row">
                <input
                  type="text"
                  maxLength={20}
                  placeholder="코드 입력 (최대 20자)"
                  value={roomEntryCodeInput}
                  onChange={(e) => setRoomEntryCodeInput(e.target.value)}
                />
              </div>
              <div className="anonymous-chat-room-menu-actions">
                <button
                  type="button"
                  className="anonymous-chat-room-menu-save"
                  onClick={() => selectedRoom && handleSetRoomEntryCode(selectedRoom)}
                  disabled={savingRoomEntryCode}
                >
                  {savingRoomEntryCode ? '저장 중...' : '코드 저장'}
                </button>
                <button
                  type="button"
                  className="anonymous-chat-room-menu-save secondary"
                  onClick={() => setRoomEntryCodeInput('')}
                  disabled={savingRoomEntryCode}
                >
                  코드 해제
                </button>
              </div>
              <div className="anonymous-chat-room-menu-divider" />
              <div className="anonymous-chat-room-menu-title">입장 제한 설정</div>
              <div className="anonymous-chat-room-menu-row">
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={roomRequirementInput}
                  onChange={(e) => setRoomRequirementInput(Number(e.target.value))}
                />
                <span>일</span>
              </div>
              <button
                type="button"
                className="anonymous-chat-room-menu-save"
                onClick={() => selectedRoom && handleSetRoomRequirement(selectedRoom)}
                disabled={savingRoomRequirement}
              >
                {savingRoomRequirement ? '저장 중...' : '저장'}
              </button>
            </>
          ) : (
            <div className="anonymous-chat-room-menu-readonly">방장만 입장 제한을 변경할 수 있습니다.</div>
          )}
        </div>
      )}

      <div className={`anonymous-chat-messages ${isKakaoTheme ? 'kakao-style' : 'classic-style'}`} ref={messagesContainerRef}>
        {chatTimeline.length === 0 && (
          <div className="anonymous-chat-empty">첫 메시지를 남겨보세요.</div>
        )}
        {chatTimeline.map((item) => {
          if (item.type === 'joinNotice') {
            return (
              <div key={item.key} className="anonymous-chat-system-notice">
                {item.text}
              </div>
            );
          }

          const message = item.message;
          const isSystemMessage = isSystemChatMessage(message);
          const systemNoticeText = isSystemMessage
            ? (message.systemText || message.content || '').trim()
            : '';
          if (systemNoticeText) {
            return (
              <div key={message.id} className="anonymous-chat-system-notice">
                {systemNoticeText}
              </div>
            );
          }
          const row = timelineMessageRowById.get(message.id);
          if (!row) {
            return (
              <div key={message.id} data-message-id={message.id} className="anonymous-chat-message-row other">
                <div className="anonymous-chat-bubble other">{message.content}</div>
              </div>
            );
          }
          const { displayName, isMine, unreadCount, showReceipt, createdAtText } = row;

          return (
            <div
              key={message.id}
              data-message-id={message.id}
              ref={(el) => {
                messageItemRefs.current[message.id] = el;
              }}
              onContextMenu={handleMessageContextMenu}
              onClick={handleMessageTouchMenu}
              className={`anonymous-chat-message-row ${isMine ? 'mine' : 'other'}`}
            >
              {!isMine && (
                <div className="anonymous-chat-avatar">{displayName.slice(0, 1)}</div>
              )}
              <div className="anonymous-chat-content">
                {!isMine && (
                  <div className="anonymous-chat-message-meta">
                    <span>{displayName}</span>
                  </div>
                )}
                <div
                  className={`anonymous-chat-bubble-row ${showReceipt ? 'has-receipt' : ''}`}
                >
                  <div className={`anonymous-chat-bubble ${isMine ? 'mine' : 'other'} ${highlightedMessageId === message.id ? 'target-highlight' : ''}`}>
                    {message.replyToId && (
                      <button
                        type="button"
                        className="anonymous-chat-replied-block"
                        data-reply-id={message.replyToId}
                        onClick={handleReplyBlockClick}
                      >
                        <strong>{message.replyPreviewSender || '익명'}</strong>
                        <span>{message.replyPreviewContent || '원본 메시지'}</span>
                      </button>
                    )}
                    {message.content}
                  </div>
                  <div className="anonymous-chat-meta-stack">
                    {showReceipt && unreadCount > 0 && (
                      <span className="anonymous-chat-unread-count">{unreadCount}</span>
                    )}
                    <span className="anonymous-chat-time">{createdAtText}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {messageActionMenu && (
        <div
          className="anonymous-chat-message-menu"
          style={{ left: `${messageActionMenu.x}px`, top: `${messageActionMenu.y}px` }}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleSelectReplyFromMenu}
          >
            답장
          </button>
          {canModerateChat && messageActionMenu.message.uid !== myUid && (
            <button
              type="button"
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleMuteFromMenu}
            >
              채팅정지(30초)
            </button>
          )}
          <button
            type="button"
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={closeMessageActionMenu}
          >
            닫기
          </button>
        </div>
      )}

      {pendingEntryCodeRoom && (
        <div className="anonymous-chat-members-overlay" onClick={() => setPendingEntryCodeRoom(null)}>
          <div className="anonymous-chat-members-modal" onClick={(e) => e.stopPropagation()}>
            <div className="anonymous-chat-members-title">입장 코드 입력</div>
            <div className="anonymous-chat-members-empty">"{pendingEntryCodeRoom.room.title}" 방 입장을 위해 코드가 필요합니다.</div>
            <div className="anonymous-chat-room-menu-row">
              <input
                type="password"
                maxLength={20}
                autoFocus
                value={entryCodeInput}
                placeholder="입장 코드 입력"
                onChange={(e) => setEntryCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleConfirmEntryCode();
                  }
                }}
              />
            </div>
            <div className="anonymous-chat-room-menu-actions">
              <button type="button" className="anonymous-chat-members-close" onClick={() => void handleConfirmEntryCode()}>
                입장하기
              </button>
              <button type="button" className="anonymous-chat-members-close secondary" onClick={() => setPendingEntryCodeRoom(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`anonymous-chat-input ${isKakaoTheme ? 'kakao-style' : 'classic-style'}`}>
        {replyTarget && (
          <button
            type="button"
            className="anonymous-chat-reply-preview"
            onClick={handleReplyPreviewClick}
          >
            <div className="anonymous-chat-reply-preview-text">
              <strong>{replyTarget.senderLabel}</strong>
              <span>{replyTarget.content || '메시지'}</span>
            </div>
            <span
              className="anonymous-chat-reply-preview-close"
              onClick={handleClearReplyTarget}
            >
              ×
            </span>
          </button>
        )}
        <div className="anonymous-chat-input-row">
          <input
            ref={messageInputRef}
            type="text"
            enterKeyHint="send"
            value={input}
            onChange={(e) => {
              const next = e.target.value;
              inputValueRef.current = next;
              setInput(next);
            }}
            onKeyDown={handleInputKeyDown}
            maxLength={300}
            placeholder={isRoomFrozen ? '채팅방 청소 중입니다' : isMyChatMuted ? '채팅정지 상태입니다' : '메시지 입력'}
            disabled={isMyChatMuted || isRoomFrozen}
          />
          <button
            type="button"
            className="anonymous-chat-send-btn"
            disabled={
              sending || !input.trim() || !profile || isMyChatMuted || isRoomFrozen
            }
            /* mousedown preventDefault 일부 모바일/웹뷰에서 click이 막히는 사례가 있어 두지 않음 */
            onClick={() => void handleSendMessage(input)}
          >
            전송
          </button>
        </div>
      </div>

      {showMembersModal &&
        createPortal(
          <div className="ac-member-overlay" onClick={closeMembersModal}>
            <div
              className="ac-member-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ac-member-panel-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ac-member-panel__title-row">
                <h3 id="ac-member-panel-title" className="ac-member-panel__title">
                  입장 멤버
                </h3>
                {isNerae && (
                  <button
                    type="button"
                    className="ac-member-panel__add"
                    aria-label="부계정 추가"
                    disabled={personaBusy}
                    onClick={() => setShowNeraeSubCreate((prev) => !prev)}
                  >
                    +
                  </button>
                )}
              </div>
              {isNerae && showNeraeSubCreate && (
                <div className="ac-member-panel__sub-create">
                  <input
                    type="text"
                    value={neraeSubNicknameInput}
                    onChange={(e) => setNeraeSubNicknameInput(e.target.value)}
                    maxLength={15}
                    placeholder="부계정 닉네임"
                    disabled={personaBusy}
                  />
                  <button
                    type="button"
                    disabled={personaBusy || !neraeSubNicknameInput.trim()}
                    onClick={() => void createNeraeSubAccount()}
                  >
                    생성
                  </button>
                </div>
              )}
              {(canManageCoHost || canModerateChat || isNerae) && (
                <p className="ac-member-panel__hint">
                  {isNerae
                    ? '내 카드를 눌러 채팅할 계정을 바꿀 수 있습니다. 선택한 카드에 「채팅 중」이 표시됩니다.'
                    : canManageCoHost
                      ? '멤버를 눌러 부방장 지정 또는보내기를 선택하세요.'
                      : '멤버를 눌러보내기를 선택할 수 있습니다.'}
                </p>
              )}
              <ul className="ac-member-panel__list">
                {sortedParticipants.length === 0 && (
                  <li className="ac-member-panel__empty">현재 입장 멤버가 없습니다.</li>
                )}
                {sortedParticipants.map((member) => {
                  const memberLabel = getMemberLabel(member);
                  const isOwnMember = isNerae && isOwnedByUser(member, myUid, ownedSubDocIds);
                  const isActivePersona = isMemberDocActivePersona(
                    member.uid,
                    myActiveParticipantDocId,
                    activePersonaKey,
                    myUid,
                    ownedSubDocIds,
                    { memberNickname: member.nickname, profile }
                  );
                  const { canToggleCoHost, canKick } = getMemberManagePermissions(member.uid);
                  const canManageMember = canToggleCoHost || canKick;
                  const canExpandRow = canManageMember;
                  const isExpanded = expandedMemberUid === member.uid;
                  const isCoHost = isMemberCoHost(member.uid);
                  const isHost = member.uid === selectedRoom?.createdByUid;
                  const joinedAtLabel = member.joinedAt?.seconds
                    ? new Date(member.joinedAt.seconds * 1000).toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '-';

                  return (
                    <li
                      key={member.uid}
                      className={`ac-member-row ${canExpandRow || isOwnMember ? 'is-clickable' : ''} ${isExpanded ? 'is-expanded' : ''} ${isActivePersona ? 'is-active-persona' : ''}`}
                    >
                      <div
                        role={canExpandRow || isOwnMember ? 'button' : undefined}
                        tabIndex={canExpandRow || isOwnMember ? 0 : undefined}
                        className="ac-member-row__header"
                        onClick={() => handleMemberRowClick(member.uid)}
                        onKeyDown={(e) => {
                          if (!canExpandRow && !isOwnMember) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleMemberRowClick(member.uid);
                          }
                        }}
                      >
                        <span className="ac-member-row__avatar" aria-hidden="true">
                          {getMemberInitial(memberLabel)}
                        </span>
                        <div className="ac-member-row__text">
                          <span className="ac-member-row__label">{memberLabel}</span>
                          {isOwnMember && isActivePersona ? (
                            <span className="ac-member-row__status">채팅 중 · 이 계정으로 대화 중</span>
                          ) : (
                            <span className="ac-member-row__time">입장 {joinedAtLabel}</span>
                          )}
                        </div>
                        <div className="ac-member-row__tags">
                          {isHost && (
                            <span className="ac-member-row__tag ac-member-row__tag--host">방장</span>
                          )}
                          {!isHost && isCoHost && (
                            <span className="ac-member-row__tag ac-member-row__tag--cohost">부방장</span>
                          )}
                          {isOwnMember && isActivePersona && (
                            <span className="ac-member-row__tag ac-member-row__tag--active">채팅 중</span>
                          )}
                          {isOwnMember && member.uid !== myUid && (
                            <button
                              type="button"
                              className="ac-member-row__delete"
                              aria-label={`${memberLabel} 삭제`}
                              title="멤버 삭제"
                              disabled={personaBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteNeraeSubAccount(member.uid, member.nickname);
                              }}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}
                          {canExpandRow && (
                            <span className="ac-member-row__chevron" aria-hidden="true">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded && canManageMember && !isOwnMember && (
                        <div className="ac-member-row__actions">
                          {canToggleCoHost && (
                            <button
                              type="button"
                              className="ac-member-row__action ac-member-row__action--cohost"
                              onClick={() => void handleToggleCoHost(member.uid)}
                            >
                              {isCoHost ? '부방장 해제' : '부방장 지정'}
                            </button>
                          )}
                          {canKick && (
                            <button
                              type="button"
                              className="ac-member-row__action ac-member-row__action--kick"
                              onClick={() => void handleKickParticipant(member.uid)}
                            >
                             보내기
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="ac-member-panel__close" onClick={closeMembersModal}>
                닫기
              </button>
            </div>
          </div>,
          document.body
        )}

      {roomNicknameModal}
    </div>
  );
};

export default AnonymousChatRoom;
