import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, Phone, Video, Menu, Plus, Smile, FileText } from 'lucide-react';
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
  serverTimestamp,
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
  requiredActiveDays?: number;
  createdAt: any;
};

type RoomParticipant = {
  uid: string;
  nickname: string;
  profileNickname?: string;
  joinedAt?: any;
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
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRetryTimeoutRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);

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
      if (selectedRoomId && !nextRooms.some((room) => room.id === selectedRoomId)) {
        setSelectedRoomId(null);
      }
    });

    return () => unsubRooms();
  }, [selectedRoomId]);

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
          joinedAt: serverTimestamp()
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

  const sortedMessages = useMemo(() => {
    const joinedAtSec = roomJoinedAt?.seconds || 0;
    return messages.filter((msg) => {
      const sec = getMessageSortSeconds(msg);
      if (msg.uid === user?.uid && sec <= 0) {
        return true;
      }
      return sec >= joinedAtSec;
    });
  }, [messages, roomJoinedAt?.seconds, user?.uid]);

  const sortedParticipants = useMemo(() => {
    return [...roomParticipants].sort((a, b) => {
      const aSec = a.joinedAt?.seconds || 0;
      const bSec = b.joinedAt?.seconds || 0;
      return aSec - bSec;
    });
  }, [roomParticipants]);

  const isNerae = user?.nickname === NERAE_NICKNAME;

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

  useEffect(() => {
    if (!selectedRoomId) return;
    const room = rooms.find((item) => item.id === selectedRoomId);
    setRoomRequirementInput(room?.requiredActiveDays || 0);
  }, [selectedRoomId, rooms]);

  useLayoutEffect(() => {
    if (!selectedRoomId) return;
    if (shouldAutoScrollRef.current || isNearBottom()) {
      forceScrollToLatest();
      shouldAutoScrollRef.current = false;
    };
  }, [latestTimelineToken, selectedRoomId, forceScrollToLatest, isNearBottom]);

  useEffect(() => {
    if (!selectedRoomId) return;
    shouldAutoScrollRef.current = true;
    forceScrollToLatest();
  }, [selectedRoomId, forceScrollToLatest]);

  useEffect(() => {
    return () => {
      if (scrollRetryTimeoutRef.current) {
        window.clearTimeout(scrollRetryTimeoutRef.current);
      }
    };
  }, []);

  const myDisplayName = getDisplayName(profile?.customNickname, profile?.profileNickname);

  const canEnterRoom = (room: AnonymousRoom) => {
    const required = room.requiredActiveDays || 0;
    return userActiveDays >= required;
  };

  const getRoomRestrictionLabel = (room?: AnonymousRoom) => {
    const required = room?.requiredActiveDays || 0;
    if (required <= 0) return '누구나 입장 가능';
    return `활동 ${required}일 이후 입장가능`;
  };

  const handleCreateNickname = async () => {
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
  };

  const handleChangeNicknameOnce = async () => {
    if (!user?.uid || !profile) return;
    if (profile.nicknameChangedOnce) {
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
        if (currentProfile.nicknameChangedOnce) {
          throw new Error('닉네임은 이미 변경되었습니다.');
        }
        transaction.update(profileRef, {
          customNickname: trimmed,
          nicknameChangedOnce: true
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
      alert('닉네임이 변경되었습니다. (1회 변경 완료)');
    } catch (error: any) {
      console.error('닉네임 변경 실패:', error);
      alert(error?.message || '닉네임 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingNickname(false);
    }
  };

  const handleCreateRoom = async () => {
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
        createdByNickname: profile.customNickname,
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
  };

  const handleDeleteRoom = async (room: AnonymousRoom) => {
    if (!user?.uid || room.createdByUid !== user.uid) return;
    if (!window.confirm('이 채팅방을 삭제하시겠습니까?')) return;

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
    }
  };

  const handleSetRoomRequirement = async (selectedRoom: AnonymousRoom) => {
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
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !profile || !user?.uid || !selectedRoomId) return;

    setSending(true);
    try {
      shouldAutoScrollRef.current = true;
      forceScrollToLatest();
      await addDoc(collection(db, 'anonymousChatRooms', selectedRoomId, 'messages'), {
        uid: user.uid,
        senderLabel: profile.customNickname,
        profileNickname: profile.profileNickname || user.nickname || '',
        content: trimmed,
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });
      setInput('');
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    } finally {
      setSending(false);
      forceScrollToLatest();
    }
  };

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
            <p style={{ margin: 0 }}>내 표시명: {myDisplayName}</p>
            <button
              type="button"
              onClick={() => setShowNicknameChangePanel((prev) => !prev)}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
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
                placeholder={profile.nicknameChangedOnce ? '닉네임 변경 완료' : '닉네임 1회 변경'}
                disabled={profile.nicknameChangedOnce || updatingNickname}
              />
              <button
                onClick={handleChangeNicknameOnce}
                disabled={profile.nicknameChangedOnce || updatingNickname || !nicknameChangeInput.trim()}
              >
                {updatingNickname ? '변경 중...' : '변경 적용'}
              </button>
            </div>
            <div className="anonymous-chat-setup-note" style={{ marginTop: -2 }}>
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
                  if (!canEnterRoom(room)) {
                    alert(`${getRoomRestrictionLabel(room)}\n현재 내 활동일: ${userActiveDays}일`);
                    return;
                  }
                  setSelectedRoomId(room.id);
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
      </div>
    );
  }

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  const myUid = user.uid;

  return (
    <div className="anonymous-chat-room-screen">
      <div className="anonymous-chat-topbar">
        <button className="anonymous-chat-topbar-back" onClick={() => setSelectedRoomId(null)} type="button">
          <ChevronLeft size={24} />
        </button>
        <div className="anonymous-chat-topbar-center">
          <strong>{selectedRoom?.title || '익명 채팅방'}</strong>
          <button
            type="button"
            className="anonymous-chat-members-btn"
            onClick={() => setShowMembersModal(true)}
          >
            👤 {sortedParticipants.length}
          </button>
        </div>
        <div className="anonymous-chat-topbar-actions">
          <button type="button" aria-label="검색"><Search size={19} /></button>
          <button type="button" aria-label="통화"><Phone size={19} /></button>
          <button type="button" aria-label="영상"><Video size={19} /></button>
          <button type="button" aria-label="메뉴" onClick={() => setShowRoomMenu((prev) => !prev)}><Menu size={19} /></button>
        </div>
      </div>
      <div className="anonymous-chat-room-rule-banner">{getRoomRestrictionLabel(selectedRoom)}</div>

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
          const isMine = message.uid === myUid;
          const createdAtText = getMessageSortSeconds(message)
            ? new Date(getMessageSortSeconds(message) * 1000).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
              })
            : '';

          return (
            <div
              key={message.id}
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
                  <div className={`anonymous-chat-bubble ${isMine ? 'mine' : 'other'}`}>
                    {message.content}
                  </div>
                  <span className="anonymous-chat-time">{createdAtText}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="anonymous-chat-input kakao-style">
        <div className="anonymous-chat-input-top">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            maxLength={300}
            placeholder="메시지 입력"
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
            <button className="anonymous-chat-send-btn" onClick={handleSendMessage} disabled={sending || !input.trim()}>
              전송
            </button>
          </div>
        </div>
      </div>

      {showMembersModal && (
        <div className="anonymous-chat-members-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="anonymous-chat-members-modal" onClick={(e) => e.stopPropagation()}>
            <div className="anonymous-chat-members-title">입장 멤버</div>
            <div className="anonymous-chat-members-list">
              {sortedParticipants.length === 0 && (
                <div className="anonymous-chat-members-empty">현재 입장 멤버가 없습니다.</div>
              )}
              {sortedParticipants.map((member) => (
                <div key={member.uid} className="anonymous-chat-members-item">
                  <div className="anonymous-chat-members-name-row">
                    <span>{getDisplayName(member.nickname, member.profileNickname)}</span>
                    {member.uid === selectedRoom?.createdByUid && (
                      <span className="anonymous-chat-members-badge">방장</span>
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
            <button type="button" className="anonymous-chat-members-close" onClick={() => setShowMembersModal(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnonymousChatRoom;
