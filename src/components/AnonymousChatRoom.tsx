import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, Phone, Bell, BellOff, Menu, Plus, Smile, FileText } from 'lucide-react';
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
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import './AnonymousChatRoom.css';

type AnonymousProfile = {
  uid: string;
  customNickname: string;
  profileNickname?: string;
  nicknameChangedOnce?: boolean;
  createdAt?: any;
};

type AnonymousMessage = {
  id: string;
  uid: string;
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
  notificationMutedUids?: string[];
  isFrozen?: boolean;
  lastCleanupAt?: any;
  requiredActiveDays?: number;
  createdAt: any;
};

type RoomParticipant = {
  uid: string;
  nickname: string;
  profileNickname?: string;
  joinedAt?: any;
  lastReadAt?: any;
  chatMutedUntil?: any;
};

type ReplyTarget = {
  id: string;
  senderLabel: string;
  content: string;
};

const NERAE_NICKNAME = '너래';

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

const getMessageSortSeconds = (message: AnonymousMessage) => {
  if (typeof message?.createdAt?.seconds === 'number') return message.createdAt.seconds;
  if (typeof message?.createdAtClient === 'number') return Math.floor(message.createdAtClient / 1000);
  return 0;
};

const getMessageSortNanos = (message: AnonymousMessage) => {
  if (typeof message?.createdAt?.nanoseconds === 'number') return message.createdAt.nanoseconds;
  if (typeof message?.createdAtClient === 'number') return (message.createdAtClient % 1000) * 1_000_000;
  return 0;
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

const getRoomIdFromSearch = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('roomId') || '';
};

const AnonymousChatRoom: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  const [rooms, setRooms] = useState<AnonymousRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AnonymousMessage[]>([]);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [roomJoinedAt, setRoomJoinedAt] = useState<any>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [input, setInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameChangeInput, setNicknameChangeInput] = useState('');
  const [showNicknameChangePanel, setShowNicknameChangePanel] = useState(false);
  const [updatingNickname, setUpdatingNickname] = useState(false);
  const [roomTitleInput, setRoomTitleInput] = useState('');
  const [userActiveDays, setUserActiveDays] = useState(0);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [roomRequirementInput, setRoomRequirementInput] = useState(0);
  const [savingRoomRequirement, setSavingRoomRequirement] = useState(false);
  const [creatingNickname, setCreatingNickname] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<AnonymousRoom | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<{ message: AnonymousMessage; x: number; y: number } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [enteredByPushLink, setEnteredByPushLink] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messageItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRetryTimeoutRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastReadMarkAtRef = useRef(0);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
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
    requestAnimationFrame(() => {
      scrollToLatestMessage();
    });
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
    });

    return () => unsubProfile();
  }, [user?.uid]);

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
      setSelectedRoomId((prev) =>
        prev && !nextRooms.some((room) => room.id === prev) ? null : prev
      );
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

    const participantRef = doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', user.uid);
    const participantsCollectionRef = collection(db, 'anonymousChatRooms', selectedRoomId, 'participants');

    const ensureRoomParticipant = async () => {
      if (!profile || !user?.uid) return;
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(participantRef);
        if (snap.exists()) return;
        transaction.set(participantRef, {
          uid: user.uid,
          nickname: profile.customNickname,
          profileNickname: profile.profileNickname || '',
          joinedAt: serverTimestamp(),
          lastReadAt: serverTimestamp()
        });
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
      const nextParticipants = snapshot.docs.map((item) => item.data() as RoomParticipant);
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
  }, [selectedRoomId, profile, user?.uid]);

  const markRoomAsRead = useCallback(async () => {
    if (!selectedRoomId || !user?.uid) return;
    try {
      await updateDoc(doc(db, 'anonymousChatRooms', selectedRoomId, 'participants', user.uid), {
        lastReadAt: serverTimestamp()
      });
    } catch (error) {
      // ignore
    }
  }, [selectedRoomId, user?.uid]);

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

  const sortedMessages = useMemo(() => {
    if (enteredByPushLink) {
      return messages;
    }
    const joinedAtSec = roomJoinedAt?.seconds || 0;
    return messages.filter((msg) => {
      const sec = getMessageSortSeconds(msg);
      if (msg.uid === user?.uid && sec <= 0) {
        return true;
      }
      return sec >= joinedAtSec;
    });
  }, [messages, roomJoinedAt?.seconds, user?.uid, enteredByPushLink]);

  const sortedParticipants = useMemo(() => {
    return [...roomParticipants].sort((a, b) => {
      const aSec = a.joinedAt?.seconds || 0;
      const bSec = b.joinedAt?.seconds || 0;
      return aSec - bSec;
    });
  }, [roomParticipants]);

  const roomById = useMemo(() => {
    const map = new Map<string, AnonymousRoom>();
    rooms.forEach((room) => {
      map.set(room.id, room);
    });
    return map;
  }, [rooms]);

  const isNerae = user?.nickname === NERAE_NICKNAME;
  const canChangeNicknameUnlimited = isNerae;

  const getDisplayName = (baseNickname?: string, profileNickname?: string) => {
    if (!baseNickname) return '익명';
    if (isNerae && profileNickname) {
      return `${baseNickname}(${profileNickname})`;
    }
    return baseNickname;
  };

  const chatTimeline = useMemo<ChatTimelineItem[]>(() => {
    const joinedAtSec = roomJoinedAt?.seconds || 0;
    const messageItems: ChatTimelineItem[] = sortedMessages.map((message) => ({
      type: 'message',
      sortSec: getMessageSortSeconds(message),
      sortNano: getMessageSortNanos(message),
      message
    }));

    const joinNoticeItems: ChatTimelineItem[] = roomParticipants
      .filter((member) => {
        const memberJoinedSec = member.joinedAt?.seconds || 0;
        return member.uid !== user?.uid && memberJoinedSec >= joinedAtSec;
      })
      .map((member) => {
        const sortSec = member.joinedAt?.seconds || 0;
        const sortNano = member.joinedAt?.nanoseconds || 0;
        const displayName = getDisplayName(member.nickname, member.profileNickname);
        return {
          type: 'joinNotice',
          key: `${member.uid}-${sortSec}-${sortNano}`,
          sortSec,
          sortNano,
          text: `${displayName}님이 들어왔습니다.`
        };
      });

    return [...messageItems, ...joinNoticeItems].sort((a, b) => {
      if (a.sortSec !== b.sortSec) return a.sortSec - b.sortSec;
      return a.sortNano - b.sortNano;
    });
  }, [sortedMessages, roomParticipants, roomJoinedAt?.seconds, user?.uid]);

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

  useEffect(() => {
    if (!selectedRoomId) return;
    const room = roomById.get(selectedRoomId);
    setRoomRequirementInput(room?.requiredActiveDays || 0);
  }, [selectedRoomId, roomById]);

  useLayoutEffect(() => {
    if (!selectedRoomId) return;
    if (shouldAutoScrollRef.current || isNearBottom()) {
      forceScrollToLatest();
      shouldAutoScrollRef.current = false;
      markRoomAsReadThrottled();
    };
  }, [latestTimelineToken, selectedRoomId, forceScrollToLatest, isNearBottom, markRoomAsReadThrottled]);

  useEffect(() => {
    if (!selectedRoomId) return;
    shouldAutoScrollRef.current = true;
    forceScrollToLatest();
    markRoomAsReadThrottled(true);
  }, [selectedRoomId, forceScrollToLatest, markRoomAsReadThrottled]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (isNearBottom()) markRoomAsReadThrottled();
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

  const myDisplayName = getDisplayName(profile?.customNickname, profile?.profileNickname);

  const canEnterRoom = useCallback((room: AnonymousRoom) => {
    const required = room.requiredActiveDays || 0;
    return userActiveDays >= required;
  }, [userActiveDays]);

  const handleEnterRoom = useCallback(async (room: AnonymousRoom, options?: { fromPushLink?: boolean }) => {
    if (!user?.uid) return;
    const participantRef = doc(db, 'anonymousChatRooms', room.id, 'participants', user.uid);
    const participantSnap = await getDoc(participantRef);
    const isExistingMember = participantSnap.exists();

    if (!isExistingMember && !canEnterRoom(room)) {
      alert(`${getRoomRestrictionLabel(room)}\n현재 내 활동일: ${userActiveDays}일`);
      return;
    }
    setEnteredByPushLink(Boolean(options?.fromPushLink));
    setSelectedRoomId(room.id);
  }, [user?.uid, canEnterRoom, userActiveDays]);

  useEffect(() => {
    if (!user?.uid || !profile || selectedRoomId) return;
    const deepLinkRoomId = getRoomIdFromSearch();
    if (!deepLinkRoomId) return;
    setEnteredByPushLink(true);
    setSelectedRoomId(deepLinkRoomId);
    clearDeepLinkRoomIdFromUrl();
  }, [user?.uid, profile, selectedRoomId, clearDeepLinkRoomIdFromUrl]);

  const getRoomRestrictionLabel = useCallback((room?: AnonymousRoom) => {
    const required = room?.requiredActiveDays || 0;
    if (required <= 0) return '누구나 입장 가능';
    return `활동 ${required}일 이후 입장가능`;
  }, []);

  const selectedRoom = useMemo(
    () => (selectedRoomId ? roomById.get(selectedRoomId) : undefined),
    [selectedRoomId, roomById]
  );
  const myUid = user?.uid || '';
  const roomManagerUids = useMemo(
    () =>
      new Set<string>([
        selectedRoom?.createdByUid || '',
        ...((selectedRoom?.coHostUids || []) as string[])
      ]),
    [selectedRoom?.createdByUid, selectedRoom?.coHostUids]
  );
  const canModerateChat = myUid ? roomManagerUids.has(myUid) : false;
  const canManageCoHost = Boolean(selectedRoom?.createdByUid && selectedRoom.createdByUid === myUid);
  const isRoomNotificationMuted = Boolean(
    myUid && (selectedRoom?.notificationMutedUids || []).includes(myUid)
  );
  const myParticipant = useMemo(
    () => roomParticipants.find((member) => member.uid === myUid),
    [roomParticipants, myUid]
  );
  const myMuteUntilMs = useMemo(
    () => toUnixMillis(myParticipant?.chatMutedUntil),
    [myParticipant?.chatMutedUntil]
  );
  const isMyChatMuted = myMuteUntilMs > Date.now();
  const isRoomFrozen = Boolean(selectedRoom?.isFrozen);

  const handleCreateNickname = useCallback(async () => {
    if (!user?.uid || profile) return;
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      alert('닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 15) {
      alert('닉네임은 15자 이하로 입력해주세요.');
      return;
    }

    setCreatingNickname(true);
    try {
      await runTransaction(db, async (transaction) => {
        const profileRef = doc(db, 'anonymousChatProfiles', user.uid);
        const existing = await transaction.get(profileRef);
        if (existing.exists()) {
          return;
        }

        transaction.set(profileRef, {
          uid: user.uid,
          customNickname: trimmed,
          profileNickname: user.nickname || '',
          nicknameChangedOnce: false,
          createdAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('익명 닉네임 초기 설정 실패:', error);
      alert('닉네임 설정 중 오류가 발생했습니다.');
    } finally {
      setCreatingNickname(false);
    }
  }, [user?.uid, user?.nickname, profile, nicknameInput]);

  const handleChangeNicknameOnce = useCallback(async () => {
    if (!user?.uid || !profile) return;
    if (!canChangeNicknameUnlimited && profile.nicknameChangedOnce) {
      alert('닉네임 변경은 1회만 가능합니다.');
      return;
    }

    const trimmed = nicknameChangeInput.trim();
    if (!trimmed) {
      alert('변경할 닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 15) {
      alert('닉네임은 15자 이하로 입력해주세요.');
      return;
    }
    if (trimmed === profile.customNickname) {
      alert('현재 닉네임과 동일합니다.');
      return;
    }

    setUpdatingNickname(true);
    try {
      const profileRef = doc(db, 'anonymousChatProfiles', user.uid);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(profileRef);
        if (!snapshot.exists()) {
          throw new Error('프로필 정보가 없습니다.');
        }
        const currentProfile = snapshot.data() as AnonymousProfile;
        if (!canChangeNicknameUnlimited && currentProfile.nicknameChangedOnce) {
          throw new Error('닉네임은 이미 변경되었습니다.');
        }
        transaction.update(profileRef, {
          customNickname: trimmed,
          nicknameChangedOnce: canChangeNicknameUnlimited ? false : true
        });
      });

      const participantQuery = query(
        collectionGroup(db, 'participants'),
        where('uid', '==', user.uid)
      );
      const participantSnap = await getDocs(participantQuery);
      if (!participantSnap.empty) {
        const batch = writeBatch(db);
        participantSnap.docs.forEach((participantDoc) => {
          batch.update(participantDoc.ref, { nickname: trimmed });
        });
        await batch.commit();
      }

      setNicknameChangeInput('');
      alert(
        canChangeNicknameUnlimited
          ? '닉네임이 변경되었습니다.'
          : '닉네임이 변경되었습니다. (1회 변경 완료)'
      );
    } catch (error: any) {
      console.error('닉네임 변경 실패:', error);
      alert(error?.message || '닉네임 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingNickname(false);
    }
  }, [
    user?.uid,
    profile,
    canChangeNicknameUnlimited,
    nicknameChangeInput
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
        // 채팅방 목록의 방장 닉네임은 생성 시점 값을 고정한다.
        createdByNickname: profile.customNickname,
        coHostUids: [],
        notificationMutedUids: [],
        isFrozen: false,
        requiredActiveDays: 0,
        createdAt: serverTimestamp()
      });
      setRoomTitleInput('');
      setSelectedRoomId(roomRef.id);
    } catch (error) {
      console.error('채팅방 생성 실패:', error);
      alert('채팅방 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingRoom(false);
    }
  }, [user?.uid, profile, roomTitleInput]);

  const handleDeleteRoom = useCallback(async (room: AnonymousRoom) => {
    if (!user?.uid || room.createdByUid !== user.uid) return;
    setPendingDeleteRoom(room);
  }, [user?.uid]);

  const confirmDeleteRoom = useCallback(async () => {
    const room = pendingDeleteRoom;
    if (!room || !user?.uid || room.createdByUid !== user.uid) return;

    setDeletingRoomId(room.id);
    try {
      const messageSnap = await getDocs(collection(db, 'anonymousChatRooms', room.id, 'messages'));
      await Promise.all(messageSnap.docs.map((messageDoc) => deleteDoc(messageDoc.ref)));
      await deleteDoc(doc(db, 'anonymousChatRooms', room.id));
      if (selectedRoomId === room.id) {
        setSelectedRoomId(null);
      }
    } catch (error) {
      console.error('채팅방 삭제 실패:', error);
      alert('채팅방 삭제 중 오류가 발생했습니다.');
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

  const handleToggleCoHost = useCallback(async (memberUid: string) => {
    if (!selectedRoomId || !selectedRoom || !user?.uid) return;
    if (selectedRoom.createdByUid !== user.uid) return;
    if (memberUid === selectedRoom.createdByUid) return;

    const currentCoHosts = selectedRoom.coHostUids || [];
    const alreadyAssigned = currentCoHosts.includes(memberUid);
    const selectedMember = roomParticipants.find((member) => member.uid === memberUid);
    const selectedMemberName = selectedMember?.nickname || '익명';

    try {
      const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
      await updateDoc(roomRef, {
        coHostUids: alreadyAssigned
          ? currentCoHosts.filter((uid) => uid !== memberUid)
          : [...currentCoHosts, memberUid]
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

  const handleSendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !profile || !user?.uid || !selectedRoomId) return;
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
      const lastCleanupMs = toUnixMillis(selectedRoom?.lastCleanupAt);
      if (lastCleanupMs > 0 && nowMs - lastCleanupMs < 24 * 60 * 60 * 1000) {
        alert('청소도우미는 하루에 한 번만 사용할 수 있습니다.');
        return;
      }

      setSending(true);
      try {
        const roomRef = doc(db, 'anonymousChatRooms', selectedRoomId);
        await updateDoc(roomRef, { isFrozen: true });
        await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
          uid: '__system__',
          senderLabel: 'system',
          content: '청소도우미: 채팅방 청소를 시작합니다',
          systemText: '청소도우미: 채팅방 청소를 시작합니다',
          createdAtClient: Date.now(),
          createdAt: serverTimestamp()
        });

        const messageSnap = await getDocs(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'));
        const deleteTargets = messageSnap.docs.filter((d) => (d.data()?.uid || '') !== '__system__');
        await Promise.all(deleteTargets.map((d) => deleteDoc(d.ref)));

        await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
          uid: '__system__',
          senderLabel: 'system',
          content: '청소도우미: 청소가 완료되었습니다',
          systemText: '청소도우미: 청소가 완료되었습니다',
          createdAtClient: Date.now(),
          createdAt: serverTimestamp()
        });
        await updateDoc(roomRef, { isFrozen: false, lastCleanupAt: serverTimestamp() });
        setInput('');
      } catch (error) {
        console.error('채팅방 청소 실패:', error);
        alert('청소 중 오류가 발생했습니다.');
        await updateDoc(doc(db, 'anonymousChatRooms', selectedRoomId), { isFrozen: false }).catch(() => undefined);
      } finally {
        setSending(false);
      }
      return;
    }

    if (isRoomFrozen) {
      alert('현재 채팅방 청소 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setSending(true);
    try {
      shouldAutoScrollRef.current = true;
      forceScrollToLatest();
      await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
        uid: user.uid,
        senderLabel: profile.customNickname,
        profileNickname: profile.profileNickname || user.nickname || '',
        content: trimmed,
        replyToId: replyTarget?.id || null,
        replyPreviewSender: replyTarget?.senderLabel || '',
        replyPreviewContent: (replyTarget?.content || '').trim().slice(0, 80),
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });

      const targetUids = roomParticipants
        .map((member) => member.uid)
        .filter((uid) => uid && uid !== user.uid);

      if (targetUids.length > 0) {
        const notificationPayloads = targetUids.map((targetUid) => ({
          toUid: targetUid,
          type: 'anonymous_chat',
          postType: 'anonymous_chat',
          postId: selectedRoomId,
          postTitle: `익명채팅 - ${selectedRoom?.title || '채팅방'}`,
          message: `${profile.customNickname}: ${trimmed.slice(0, 80)}`,
          route: `/anonymous-chat?roomId=${encodeURIComponent(selectedRoomId)}`,
          roomId: selectedRoomId,
          fromUid: user.uid,
          fromNickname: profile.customNickname,
          hiddenFromInbox: true,
          isRead: true,
          createdAt: serverTimestamp()
        }));

        // 알림 저장은 UI 반응성과 분리해 백그라운드로 처리
        void Promise.all(
          notificationPayloads.map((payload) => addDoc(collection(db, 'notifications'), payload))
        ).catch((error) => {
          console.error('채팅 알림 생성 실패:', error);
        });
      }
      setInput('');
      setReplyTarget(null);
      markRoomAsReadThrottled(true);
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    } finally {
      setSending(false);
      forceScrollToLatest();
    }
  }, [
    input,
    profile,
    user?.uid,
    user?.nickname,
    selectedRoomId,
    myMuteUntilMs,
    canModerateChat,
    selectedRoom?.lastCleanupAt,
    selectedRoom?.title,
    isRoomFrozen,
    replyTarget,
    roomParticipants,
    forceScrollToLatest,
    markRoomAsReadThrottled
  ]);

  const handleBackToRoomList = useCallback(() => {
    setSelectedRoomId(null);
    setEnteredByPushLink(false);
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  }, [handleSendMessage]);

  const toggleNicknameChangePanel = useCallback(() => {
    setShowNicknameChangePanel((prev) => !prev);
  }, []);

  const closePendingDeleteRoomModal = useCallback(() => {
    setPendingDeleteRoom(null);
  }, []);

  const handleConfirmDeleteRoomClick = useCallback(() => {
    void confirmDeleteRoom();
  }, [confirmDeleteRoom]);

  const openMembersModal = useCallback(() => {
    setShowMembersModal(true);
  }, []);

  const closeMembersModal = useCallback(() => {
    setShowMembersModal(false);
  }, []);

  const toggleRoomMenu = useCallback(() => {
    setShowRoomMenu((prev) => !prev);
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

  if (loading) {
    return <div className="anonymous-chat-page">로딩 중...</div>;
  }

  if (!user?.uid) {
    return <div className="anonymous-chat-page">로그인 후 이용 가능합니다.</div>;
  }

  if (!profile) {
    return (
      <div className="anonymous-chat-page">
        <div className="anonymous-chat-setup-card">
          <h2>익명 채팅방 입장</h2>
          <p>입장 전에 사용할 익명 닉네임을 설정해주세요.</p>
          <input
            type="text"
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            maxLength={15}
            placeholder="닉네임 입력 (최대 15자)"
          />
          <button onClick={handleCreateNickname} disabled={creatingNickname || !nicknameInput.trim()}>
            {creatingNickname ? '설정 중...' : '입장하기'}
          </button>
          <div className="anonymous-chat-setup-note">
            한번 설정한 닉네임은 바꿀 수 없습니다.
          </div>
        </div>
      </div>
    );
  }

  if (!selectedRoomId) {
    return (
      <div className="anonymous-chat-page">
        <div className="anonymous-chat-header">
          <h2>익명 채팅방 목록</h2>
          <div className="anonymous-chat-header-row">
            <p className="anonymous-chat-header-display-name">내 표시명: {myDisplayName}</p>
            <button
              type="button"
              onClick={toggleNicknameChangePanel}
              className="anonymous-chat-nickname-toggle-btn"
            >
              {showNicknameChangePanel ? '닉네임 변경 닫기' : '닉네임 변경'}
            </button>
          </div>
        </div>
        {showNicknameChangePanel && (
          <>
            <div className="anonymous-chat-room-create">
              <input
                type="text"
                value={nicknameChangeInput}
                onChange={(e) => setNicknameChangeInput(e.target.value)}
                maxLength={15}
                placeholder={
                  canChangeNicknameUnlimited
                    ? '닉네임 변경 (무제한)'
                    : profile.nicknameChangedOnce
                      ? '닉네임 변경 완료'
                      : '닉네임 1회 변경'
                }
                disabled={(!canChangeNicknameUnlimited && profile.nicknameChangedOnce) || updatingNickname}
              />
              <button
                onClick={handleChangeNicknameOnce}
                disabled={
                  (!canChangeNicknameUnlimited && profile.nicknameChangedOnce) ||
                  updatingNickname ||
                  !nicknameChangeInput.trim()
                }
              >
                {updatingNickname ? '변경 중...' : '변경 적용'}
              </button>
            </div>
            <div className="anonymous-chat-setup-note anonymous-chat-setup-note-tight">
              추가 변경 원할시 회비통장 입금바랍니다^^
            </div>
          </>
        )}
        <div className="anonymous-chat-room-create">
          <input
            type="text"
            value={roomTitleInput}
            onChange={(e) => setRoomTitleInput(e.target.value)}
            maxLength={30}
            placeholder="새 채팅방 제목 (최대 30자)"
          />
          <button onClick={handleCreateRoom} disabled={creatingRoom || !roomTitleInput.trim()}>
            {creatingRoom ? '생성 중...' : '채팅방 만들기'}
          </button>
        </div>
        <div className="anonymous-chat-room-list">
          {rooms.length === 0 && (
            <div className="anonymous-chat-empty">아직 생성된 채팅방이 없습니다.</div>
          )}
          {rooms.map((room) => (
            <div key={room.id} className="anonymous-chat-room-item">
              <button
                className="anonymous-chat-room-enter"
                onClick={() => {
                  void handleEnterRoom(room, { fromPushLink: false });
                }}
                type="button"
              >
                <span className="anonymous-chat-room-title">{room.title}</span>
                <span className="anonymous-chat-room-sub">
                  방장: {getDisplayName(room.createdByNickname, '')}
                </span>
                <span className="anonymous-chat-room-rule">{getRoomRestrictionLabel(room)}</span>
              </button>
              {room.createdByUid === user.uid && (
                <button
                  className="anonymous-chat-room-delete"
                  onClick={() => handleDeleteRoom(room)}
                  disabled={deletingRoomId === room.id}
                  type="button"
                >
                  {deletingRoomId === room.id ? '삭제 중...' : '삭제'}
                </button>
              )}
            </div>
          ))}
        </div>
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
      </div>
    );
  }

  return (
    <div className="anonymous-chat-room-screen">
      <div className="anonymous-chat-topbar">
        <button
          className="anonymous-chat-topbar-back"
          onClick={handleBackToRoomList}
          type="button"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="anonymous-chat-topbar-center">
          <strong>{selectedRoom?.title || '익명 채팅방'}</strong>
          <button
            type="button"
            className="anonymous-chat-members-btn"
            onClick={openMembersModal}
          >
            👤 {sortedParticipants.length}
          </button>
        </div>
        <div className="anonymous-chat-topbar-actions">
          <button type="button" aria-label="검색"><Search size={19} /></button>
          <button type="button" aria-label="통화"><Phone size={19} /></button>
          <button
            type="button"
            aria-label={isRoomNotificationMuted ? '채팅 푸시 켜기' : '채팅 푸시 끄기'}
            title={isRoomNotificationMuted ? '채팅 푸시 켜기' : '채팅 푸시 끄기'}
            onClick={handleToggleRoomNotifications}
          >
            {isRoomNotificationMuted ? <BellOff size={19} /> : <Bell size={19} />}
          </button>
          <button type="button" aria-label="메뉴" onClick={toggleRoomMenu}><Menu size={19} /></button>
        </div>
      </div>
      <div className="anonymous-chat-room-rule-banner">{getRoomRestrictionLabel(selectedRoom)}</div>
      {isRoomFrozen && (
        <div className="anonymous-chat-room-rule-banner">청소도우미가 채팅방을 정리 중입니다.</div>
      )}

      {showRoomMenu && (
        <div className="anonymous-chat-room-menu">
          {selectedRoom?.createdByUid === user?.uid ? (
            <>
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

      <div className="anonymous-chat-messages kakao-style" ref={messagesContainerRef}>
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
          const isSystemMessage =
            message.uid === '__system__' ||
            message.uid === 'system' ||
            (message.senderLabel || '').toLowerCase() === 'system';
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
          const isMine = message.uid === myUid;
          const messageMs = toUnixMillis(message.createdAt) || (message.createdAtClient || 0);
          let eligibleCount = 0;
          let readCount = 0;
          for (const member of roomParticipants) {
            if (member.uid === message.uid) continue;
            eligibleCount += 1;
            const readMs = participantReadAtByUid.get(member.uid) || 0;
            if (readMs > 0 && readMs >= messageMs) {
              readCount += 1;
            }
          }
          const unreadCount = Math.max(0, eligibleCount - readCount);
          const messageSortSec = getMessageSortSeconds(message);
          const createdAtText = messageSortSec
            ? new Date(messageSortSec * 1000).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
              })
            : '';

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
              {!isMine && <div className="anonymous-chat-avatar">{message.senderLabel.slice(0, 1)}</div>}
              <div className="anonymous-chat-content">
                {!isMine && (
                  <div className="anonymous-chat-message-meta">
                    <span>{getDisplayName(message.senderLabel, message.profileNickname)}</span>
                  </div>
                )}
                <div className="anonymous-chat-bubble-row">
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
                    {unreadCount > 0 && (
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

      <div className="anonymous-chat-input kakao-style">
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
        <div className="anonymous-chat-input-top">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            maxLength={300}
            placeholder={isRoomFrozen ? '채팅방 청소 중입니다' : isMyChatMuted ? '채팅정지 상태입니다' : '메시지 입력'}
            disabled={isMyChatMuted || isRoomFrozen}
          />
        </div>
        <div className="anonymous-chat-input-bottom">
          <div className="anonymous-chat-input-tools">
            <button type="button" aria-label="추가"><Plus size={20} /></button>
            <button type="button" aria-label="이모티콘"><Smile size={18} /></button>
            <button type="button" aria-label="파일"><FileText size={18} /></button>
          </div>
          <div className="anonymous-chat-input-right">
            <div className="anonymous-chat-voice-slider" />
            <button className="anonymous-chat-send-btn" onClick={handleSendMessage} disabled={sending || !input.trim() || isMyChatMuted || isRoomFrozen}>
              전송
            </button>
          </div>
        </div>
      </div>

      {showMembersModal && (
        <div className="anonymous-chat-members-overlay" onClick={closeMembersModal}>
          <div className="anonymous-chat-members-modal" onClick={(e) => e.stopPropagation()}>
            <div className="anonymous-chat-members-title">입장 멤버</div>
            <div className="anonymous-chat-members-list">
              {sortedParticipants.length === 0 && (
                <div className="anonymous-chat-members-empty">현재 입장 멤버가 없습니다.</div>
              )}
              {sortedParticipants.map((member) => (
                <div
                  key={member.uid}
                  className={`anonymous-chat-members-item ${canManageCoHost && member.uid !== selectedRoom?.createdByUid ? 'can-toggle-cohost' : ''}`}
                  onClick={() => {
                    if (!canManageCoHost) return;
                    if (member.uid === selectedRoom?.createdByUid) return;
                    void handleToggleCoHost(member.uid);
                  }}
                >
                  <div className="anonymous-chat-members-name-row">
                    <span>{getDisplayName(member.nickname, member.profileNickname)}</span>
                    {member.uid === selectedRoom?.createdByUid && (
                      <span className="anonymous-chat-members-badge">방장</span>
                    )}
                    {member.uid !== selectedRoom?.createdByUid &&
                      selectedRoom?.coHostUids?.includes(member.uid) && (
                        <span className="anonymous-chat-members-badge cohost">부방장</span>
                      )}
                  </div>
                  <div className="anonymous-chat-members-joined">
                    입장: {member.joinedAt?.seconds
                      ? new Date(member.joinedAt.seconds * 1000).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '-'}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="anonymous-chat-members-close" onClick={closeMembersModal}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnonymousChatRoom;
