import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, getDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { User, MessageSquare, Send, Menu, Paperclip, Image as ImageIcon, MoreVertical, Copy, Trash2, Flag, CornerUpLeft, Home, Users, BarChart3 } from 'lucide-react';
import './Messages.css';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { 
  sendMessage, 
  subscribeToUserConversations, 
  subscribeToConversationMessages, 
  generateConversationId,
  markMessagesAsRead
} from '../utils/chatService';
import { 
  markAnnouncementMessageAsRead,
  markAllAnnouncementMessagesAsRead,
  getMessageReadStatus,
  subscribeToAnnouncementUnreadCount
} from '../utils/readStatusService';
import ReadStatusModal from './ReadStatusModal';
import type { ReadStatus } from '../utils/readStatusService';

interface Message {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromUserRole?: string;
  toUid: string;
  toNickname: string;
  content: string;
  createdAt: any;
  isRead: boolean;
  postId?: string;
  postTitle?: string;
  reactions?: { emoji: string, users: string[] }[];
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  replyTo?: {
    messageId: string;
    content: string;
    senderNickname: string;
    senderUid: string;
  };
}

interface ChatRoom {
  userUid: string;
  userNickname: string;
  lastMessage: Message;
  postId?: string;
  postTitle?: string;
  isPinned?: boolean;
  profileEmoji?: string;
  profileImageUrl?: string;
}

const emojiList = ['😀','😎','🦄','🐱','🐶','🐻','🐼','🐸','🐵','🦊','🐯','🐰','🐥','🦉','🐳','🍀','🍎','🍉','🍔','🍕','🍩','🍦','⚽','🎸','🎹','🚗','✈️','🌈','⭐','🔥','💎','🎁'];
const reactionEmojis = ['❤️','😂','👍','😮','😢','👏','🔥','😡'];

const Messages: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showRoomList, setShowRoomList] = useState(false);
  const [search, setSearch] = useState('');

  const [reactionTarget, setReactionTarget] = useState<string|null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{top: number, left: number}>({top: 0, left: 0});
  const [filePreview, setFilePreview] = useState<string|null>(null);
  const [fileType, setFileType] = useState<string|null>(null);
  const [fileName, setFileName] = useState<string|null>(null);
  const [contextMenu, setContextMenu] = useState<{msgId: string, x: number, y: number} | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [mobileReactionMessageId, setMobileReactionMessageId] = useState<string | null>(null);

  // 컨텍스트 메뉴 및 리액션 피커 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (contextMenu && !target.closest('.chat-context-menu')) {
        setContextMenu(null);
      }
      
      if (showReactionPicker && !target.closest('.reaction-picker')) {
        setShowReactionPicker(false);
        setReactionTarget(null);
      }
      
      // 모바일 리액션 패널 외부 클릭 시 닫기
      if (mobileReactionMessageId && !target.closest('.message-hover-buttons')) {
        setMobileReactionMessageId(null);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setShowReactionPicker(false);
        setReactionTarget(null);
        setMobileReactionMessageId(null);
      }
    };

    if (contextMenu || showReactionPicker || mobileReactionMessageId) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [contextMenu, showReactionPicker, mobileReactionMessageId]);
  const [reportTarget, setReportTarget] = useState<Message|null>(null);
  const [reportReason, setReportReason] = useState('');
  const [analysisTarget, setAnalysisTarget] = useState<Message|null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [showReadUsers, setShowReadUsers] = useState(false);
  const [reactionModal, setReactionModal] = useState<{msgId: string, reactions: any[]} | null>(null);
  const [replyTo, setReplyTo] = useState<Message|null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [announcementMessages, setAnnouncementMessages] = useState<Message[]>([]);
  const [isAnnouncementMode, setIsAnnouncementMode] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [announcementParticipants, setAnnouncementParticipants] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<string[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  // 읽음 상태 관련 state
  const [readStatusModal, setReadStatusModal] = useState<{
    isOpen: boolean;
    messageId: string;
    messageContent: string;
    readStatus: ReadStatus | null;
  }>({
    isOpen: false,
    messageId: '',
    messageContent: '',
    readStatus: null
  });
  const [messageReadStatuses, setMessageReadStatuses] = useState<Record<string, ReadStatus>>({});
  
  // 안읽은 메시지 알림 관련 state
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  
  // 로딩 및 UI 상태
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 타이핑 인디케이터 상태
  const [typingUsers, setTypingUsers] = useState<Record<string, { nickname: string; timestamp: number }>>({});
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 브라우저 알림 상태
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const lastNotificationRef = useRef<number>(0);

  // Load current user
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) setUser(JSON.parse(userString));
  }, []);

  // 초기 알림 권한 확인
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      
      // 저장된 알림 설정 로드
      const savedSoundSetting = localStorage.getItem('veryus_notification_sound');
      if (savedSoundSetting !== null) {
        setSoundEnabled(JSON.parse(savedSoundSetting));
      }
    }
  }, []);

  // 모바일 화면 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth <= 900);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 사용자 프로필 정보 가져오기 함수
  const fetchUserProfile = useCallback(async (uid: string) => {
    if (userProfiles[uid]) return userProfiles[uid];
    
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        setUserProfiles(prev => ({
          ...prev,
          [uid]: profileData
        }));
        return profileData;
      }
    } catch (error) {
      console.error('프로필 정보 가져오기 실패:', error);
    }
    return null;
  }, [userProfiles]);

  // 특정 채팅방의 안읽은 메시지 수 계산
  const calculateUnreadCount = useCallback(async (roomUserUid: string, postId?: string) => {
    if (!user) return 0;
    
    try {
      const unreadQuery = query(
        collection(db, 'messages'),
        where('fromUid', '==', roomUserUid),
        where('toUid', '==', user.uid),
        where('isRead', '==', false)
      );
      
      const unreadSnapshot = await getDocs(unreadQuery);
      const count = unreadSnapshot.docs.filter((msgDoc: any) => {
        const msgData = msgDoc.data();
        const msgPostId = msgData.postId || null;
        const targetPostId = postId || null;
        return msgPostId === targetPostId;
      }).length;
      
      return count;
    } catch (error) {
      console.error('안읽은 메시지 수 계산 실패:', error);
      return 0;
    }
  }, [user]);

  // 메시지 읽음 처리 함수
  const markMessagesAsRead = useCallback(async (roomUserUid: string, postId?: string) => {
    if (!user) return;
    
    try {
      // 해당 사용자로부터 받은 읽지 않은 메시지들을 찾기
      const unreadQuery = query(
        collection(db, 'messages'),
        where('fromUid', '==', roomUserUid),
        where('toUid', '==', user.uid),
        where('isRead', '==', false)
      );
      
      const unreadSnapshot = await getDocs(unreadQuery);
      const updatePromises = unreadSnapshot.docs
        .filter((msgDoc: any) => {
          const msgData = msgDoc.data();
          const msgPostId = msgData.postId || null;
          const targetPostId = postId || null;
          return msgPostId === targetPostId;
        })
        .map((msgDoc: any) => updateDoc(doc(db, 'messages', msgDoc.id), { isRead: true }));
      
      await Promise.all(updatePromises);
      
      // 읽음 처리 후 안읽은 메시지 수 업데이트
      const roomKey = roomUserUid + (postId || '');
      setUnreadCounts(prev => ({
        ...prev,
        [roomKey]: 0
      }));
      
    } catch (error) {
      console.error('메시지 읽음 처리 실패:', error);
    }
  }, [user]);

  // 답장 체인 분석 함수
  const analyzeReplyChain = useCallback((messages: Message[]) => {
    const replyChains = new Map<string, Message[]>();
    const replyDepth = new Map<string, number>();
    const maxDepth = 10; // 최대 답장 깊이 제한
    
    // 메시지 ID to 메시지 매핑 (성능 최적화)
    const messageMap = new Map<string, Message>();
    messages.forEach(msg => {
      messageMap.set(msg.id, msg);
      if (!msg.replyTo) {
        replyDepth.set(msg.id, 0);
      }
    });
    
    // 깊이 계산 함수 (메모이제이션)
    const calculateDepth = (messageId: string, visited = new Set<string>()): number => {
      if (replyDepth.has(messageId)) {
        return replyDepth.get(messageId)!;
      }
      
      if (visited.has(messageId)) {
        // 순환 참조 감지
        console.warn('순환 참조가 감지된 답장 체인:', messageId);
        return 0;
      }
      
      const msg = messageMap.get(messageId);
      if (!msg || !msg.replyTo) {
        replyDepth.set(messageId, 0);
        return 0;
      }
      
      visited.add(messageId);
      const parentDepth = calculateDepth(msg.replyTo.messageId, visited);
      const depth = Math.min(parentDepth + 1, maxDepth);
      
      replyDepth.set(messageId, depth);
      visited.delete(messageId);
      
      // 답장 체인 그룹 생성
      const rootId = findRootMessage(msg, messages);
      if (!replyChains.has(rootId)) {
        replyChains.set(rootId, []);
      }
      replyChains.get(rootId)!.push(msg);
      
      return depth;
    };
    
    // 모든 메시지의 깊이 계산
    messages.forEach(msg => {
      calculateDepth(msg.id);
    });
    
    return { replyChains, replyDepth };
  }, []);

  // 루트 메시지 찾기 함수
  const findRootMessage = useCallback((msg: Message, messages: Message[]): string => {
    if (!msg.replyTo) return msg.id;
    
    const parentMsg = messages.find(m => m.id === msg.replyTo!.messageId);
    if (!parentMsg) return msg.id;
    
    return findRootMessage(parentMsg, messages);
  }, []);

  // 메시지 필터링 최적화
  const filteredMessages = useMemo(() => {
    const currentMessages = isAnnouncementMode ? announcementMessages : messages;
    return currentMessages.filter(Boolean); // null/undefined 메시지 제거
  }, [isAnnouncementMode, announcementMessages, messages]);

  // 답장 체인 계산 최적화
  const replyChainData = useMemo(() => {
    return analyzeReplyChain(filteredMessages);
  }, [filteredMessages, analyzeReplyChain]);

  // 답장 개수 계산 함수 최적화
  const getReplyCount = useCallback((messageId: string, messages: Message[]) => {
    return messages.filter(msg => msg.replyTo?.messageId === messageId).length;
  }, []);

  // 답장 체인 데이터 추출
  const { replyChains, replyDepth } = replyChainData;

  // Load chat rooms (새 구조 사용)
  useEffect(() => {
    if (!user) return;
    
    console.log('채팅방 리스너 시작:', user.uid);
    
    try {
      const unsubscribe = subscribeToUserConversations(user.uid, async (conversations) => {
        try {
          // conversations를 ChatRoom 형태로 변환
          const rooms: ChatRoom[] = [];
          
          for (const conversation of conversations) {
            // announcement 대화방은 제외 (별도 처리)
            if (conversation.id === 'announcement') continue;
            
            // 대화 상대방 식별
            const otherParticipantId = conversation.participants.find((p: string) => p !== user.uid);
            if (!otherParticipantId) continue;
            
            // 프로필 정보 가져오기
            const profile = await fetchUserProfile(otherParticipantId);
            
            const room: ChatRoom = {
              userUid: otherParticipantId,
              userNickname: conversation.lastMessage?.fromNickname || 'Unknown',
              lastMessage: conversation.lastMessage,
              postId: conversation.postId,
              postTitle: conversation.postTitle,
              profileImageUrl: profile?.profileImageUrl
            };
            
            rooms.push(room);
          }
          
          setChatRooms(rooms);
        } catch (error) {
          console.error('채팅방 데이터 처리 오류:', error);
        }
      });
      
      return () => {
        console.log('채팅방 리스너 정리');
        unsubscribe();
      };
    } catch (error) {
      console.error('채팅방 리스너 생성 실패:', error);
    }
  }, [user, fetchUserProfile]);

  // Load messages for selected room (새 구조 사용)
  useEffect(() => {
    if (!user || !selectedRoom) return;
    
    console.log('메시지 리스너 시작:', selectedRoom.userUid);
    
    try {
      // 대화방 ID 생성
      const conversationId = generateConversationId(
        user.uid, 
        selectedRoom.userUid, 
        selectedRoom.postId
      );
      
      // 새 구조로 메시지 구독
      const unsubscribe = subscribeToConversationMessages(conversationId, (messages) => {
        try {
          setMessages(messages);
          
          // 메시지 읽음 처리
          markMessagesAsRead(conversationId, user.uid).catch(console.error);
        } catch (error) {
          console.error('메시지 데이터 처리 오류:', error);
        }
      });

      return () => {
        console.log('메시지 리스너 정리:', conversationId);
        unsubscribe();
      };
    } catch (error) {
      console.error('메시지 리스너 생성 실패:', error);
    }
  }, [user, selectedRoom]);

  // 공지방 메시지 로드 (새 구조 사용)
  useEffect(() => {
    if (!user) return;
    
    console.log('공지방 리스너 시작');
    
    try {
      // 공지방 메시지 구독
      const unsubscribe = subscribeToConversationMessages('announcement', (messages) => {
        try {
          setAnnouncementMessages(messages);
        } catch (error) {
          console.error('공지방 메시지 처리 오류:', error);
        }
      });
      
      return () => {
        console.log('공지방 리스너 정리');
        unsubscribe();
      };
    } catch (error) {
      console.error('공지방 리스너 생성 실패:', error);
    }
  }, [user]);

  // 공지방 안읽은 메시지 수 구독
  useEffect(() => {
    if (!user) return;
    
    console.log('안읽은 메시지 리스너 시작');
    
    try {
      const unsubscribe = subscribeToAnnouncementUnreadCount(user.uid, (count) => {
        setAnnouncementUnreadCount(count);
      });
      
      return () => {
        console.log('안읽은 메시지 리스너 정리');
        unsubscribe();
      };
    } catch (error) {
      console.error('안읽은 메시지 리스너 생성 실패:', error);
    }
  }, [user]);

  // 관리자 패널과 동일한 방식으로 모든 사용자 로드
  useEffect(() => {
    if (!user) return;
    
    const fetchAllUsers = async () => {
      try {
        console.log('Firestore에서 사용자 목록 가져오기 시작...');
        const querySnapshot = await getDocs(collection(db, 'users'));
        console.log('사용자 문서 개수:', querySnapshot.size);
        
        const allUsers: any[] = [];
        
        querySnapshot.forEach((doc) => {
          console.log('사용자 문서:', doc.id, doc.data());
          const userData = doc.data();
          if (userData.uid && userData.nickname) {
            allUsers.push({
              uid: doc.id, // 문서 ID를 uid로 사용
              nickname: userData.nickname,
              email: userData.email,
              grade: userData.grade,
              role: userData.role,
              profileImageUrl: userData.profileImageUrl || null,
              createdAt: userData.createdAt
            });
          }
        });

        console.log('처리된 사용자 데이터:', allUsers);
        
        // userProfiles 상태에 모든 사용자 정보 저장
        const profilesMap: Record<string, any> = {};
        allUsers.forEach(user => {
          profilesMap[user.uid] = user;
        });
        setUserProfiles(prev => ({
          ...prev,
          ...profilesMap
        }));
        
        // 차단된 사용자 제외하고 역할 우선 정렬
        const filteredUsers = allUsers
          .filter(u => !bannedUsers.includes(u.uid))
          .sort((a, b) => {
            // 역할 우선순위 정의 (높은 숫자가 우선)
            const getRolePriority = (role: string) => {
              switch (role) {
                case '리더': return 4;
                case '운영진': return 3;
                case '부운영진': return 2;
                case '일반': return 1;
                default: return 0;
              }
            };
            
            const aPriority = getRolePriority(a.role || '일반');
            const bPriority = getRolePriority(b.role || '일반');
            
            // 역할이 다르면 역할 우선순위로 정렬
            if (aPriority !== bPriority) {
              return bPriority - aPriority;
            }
            
            // 같은 역할이면 닉네임 순으로 정렬
            return a.nickname.localeCompare(b.nickname);
          });
        
        setAnnouncementParticipants(filteredUsers);
        
        if (allUsers.length === 0) {
          console.log('사용자 데이터가 없습니다. Firestore 규칙이나 컬렉션을 확인하세요.');
        }
      } catch (error) {
        console.error('사용자 목록 가져오기 에러:', error);
      }
    };

    fetchAllUsers();
    
    // 차단된 사용자 목록 로드
    const bannedQuery = query(
      collection(db, 'announcementBanned')
    );
    
    const unsubBanned = onSnapshot(bannedQuery, (snap) => {
      const banned = snap.docs.map(doc => doc.data().uid);
      setBannedUsers(banned);
      // 차단 목록이 변경되면 사용자 목록도 다시 가져오기
      fetchAllUsers();
    });
    
    return () => {
      unsubBanned();
    };
  }, [user]);

  // 참여자 내보내기 기능
  const handleKickUser = async (targetUser: any) => {
    if (!user || !targetUser) return;
    
    try {
      // 차단 목록에 추가
      await addDoc(collection(db, 'announcementBanned'), {
        uid: targetUser.uid,
        nickname: targetUser.nickname,
        bannedBy: user.uid,
        bannedByNickname: user.nickname,
        bannedAt: serverTimestamp()
      });
      
      // 시스템 메시지 전송 (새 구조 사용)
      await sendMessage(
        'system',
        'announcement',
        `${targetUser.nickname} 사용자가 공지방에서 내보내기 되었습니다.`,
        '시스템',
        '공지방',
        'system',
        { postId: 'announcement', postTitle: '공지방' }
      );
      
      alert(`${targetUser.nickname} 사용자를 공지방에서 내보냈습니다.`);
      setShowParticipants(false);
    } catch (error) {
      console.error('사용자 내보내기 실패:', error);
      alert('사용자 내보내기에 실패했습니다.');
    }
  };

  // 읽음 상태 관련 함수들
  const canViewReadStatus = useCallback(() => {
    if (!user || !isAnnouncementMode) return false;
    const userRole = user.role || '일반';
    return userRole === '리더' || userRole === '운영진';
  }, [user, isAnnouncementMode]);

  // 메시지 읽음 상태 클릭 핸들러
  const handleReadStatusClick = async (messageId: string, messageContent: string) => {
    if (!canViewReadStatus()) return;
    
    try {
      const readStatus = await getMessageReadStatus(messageId);
      if (readStatus) {
        setReadStatusModal({
          isOpen: true,
          messageId,
          messageContent,
          readStatus
        });
      }
    } catch (error) {
      console.error('읽음 상태 조회 실패:', error);
    }
  };

  // 읽음 상태 모달 닫기
  const handleCloseReadStatusModal = () => {
    setReadStatusModal({
      isOpen: false,
      messageId: '',
      messageContent: '',
      readStatus: null
    });
  };

  // 공지방 메시지들의 읽음 상태 로드
  const loadMessageReadStatuses = useCallback(async () => {
    if (!canViewReadStatus() || announcementMessages.length === 0) return;
    
    try {
      const statuses: Record<string, ReadStatus> = {};
      
      for (const message of announcementMessages.slice(0, 10)) { // 최근 10개 메시지만
        if (message.fromUid === 'system') continue; // 시스템 메시지 제외
        
        const status = await getMessageReadStatus(message.id);
        if (status) {
          statuses[message.id] = status;
        }
      }
      
      setMessageReadStatuses(statuses);
    } catch (error) {
      console.error('읽음 상태 로드 실패:', error);
    }
  }, [canViewReadStatus, announcementMessages]);

  // 공지방 진입시 모든 메시지 읽음 처리
  useEffect(() => {
    if (!user || !isAnnouncementMode) return;
    
    // 공지방 진입시 모든 메시지를 읽음으로 처리
    markAllAnnouncementMessagesAsRead(user.uid);
  }, [user, isAnnouncementMode]);

  // 읽음 상태 로드
  useEffect(() => {
    if (canViewReadStatus() && announcementMessages.length > 0) {
      loadMessageReadStatuses();
    }
  }, [canViewReadStatus, announcementMessages, loadMessageReadStatuses]);

  // 전체 안읽은 메시지 수 계산
  useEffect(() => {
    const chatRoomUnreadTotal = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    setTotalUnreadCount(chatRoomUnreadTotal + announcementUnreadCount);
  }, [unreadCounts, announcementUnreadCount]);

  // 채팅방 변경 시 최신 메시지로 스크롤
  useEffect(() => {
    if (selectedRoom || isAnnouncementMode) {
      const timer = setTimeout(() => {
        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages) {
          chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 200); // 메시지 렌더링 완료 후 스크롤

      return () => clearTimeout(timer);
    }
  }, [selectedRoom?.userUid, selectedRoom?.postId, isAnnouncementMode]);

  // 새 메시지 추가 시 스크롤 (사용자가 맨 아래에 있을 때만)
  useEffect(() => {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;

    // 스크롤이 맨 아래에 있는지 확인 (100px 여유 두기)
    const isAtBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 100;
    
    if (isAtBottom) {
      const timer = setTimeout(() => {
        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: 'smooth'
        });
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [messages.length, announcementMessages.length]);

  const handleSend = useCallback(async () => {
    if (!user || (!selectedRoom && !isAnnouncementMode) || !newMessage.trim() || isSending) return;
    
    setIsSending(true);
    
    try {
      if (isAnnouncementMode) {
        // 차단된 사용자인지 확인
        if (bannedUsers.includes(user.uid)) {
          alert('공지방에서 내보내진 사용자는 메시지를 보낼 수 없습니다.');
          return;
        }
        
        // 공지방 메시지 전송 (새 구조 사용)
        const messageId = await sendMessage(
          user.uid,
          'announcement',
          newMessage.trim(),
          user.nickname,
          '공지방',
          user.role,
          { postId: 'announcement', postTitle: '공지방' },
          undefined, // fileData
          replyTo ? {
            messageId: replyTo.id,
            content: replyTo.content,
            senderNickname: replyTo.fromNickname,
            senderUid: replyTo.fromUid
          } : undefined
        );
        
        // 메시지 전송 후 자동으로 읽음 처리
        if (messageId) {
          await markAnnouncementMessageAsRead(messageId, user.uid);
        }
      } else {
        // 일반 채팅 메시지 전송 (새 구조 사용)
        await sendMessage(
          user.uid,
          selectedRoom!.userUid,
          newMessage.trim(),
          user.nickname,
          selectedRoom!.userNickname,
          user.role,
          selectedRoom!.postId ? { 
            postId: selectedRoom!.postId, 
            postTitle: selectedRoom!.postTitle || '' 
          } : undefined,
          undefined, // fileData
          replyTo ? {
            messageId: replyTo.id,
            content: replyTo.content,
            senderNickname: replyTo.fromNickname,
            senderUid: replyTo.fromUid
          } : undefined
        );
      }
      setNewMessage('');
      setReplyTo(null); // 답장 초기화
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    } finally {
      setIsSending(false);
    }
  }, [user, selectedRoom, newMessage, isAnnouncementMode, bannedUsers, replyTo, isSending]);

  // 모바일 화면 여부 (기존 호환성 유지)
const isMobile = isMobileView;

  // 각 채팅방의 안읽은 메시지 수 계산
  const getUnreadCount = (room: ChatRoom) => {
    if (!user) return 0;
    const roomKey = room.userUid + (room.postId || '');
    return unreadCounts[roomKey] || 0;
  };
  // 마지막 메시지 시간 포맷
  const formatTime = (date: any) => {
    if (!date) return '';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  // 프로필 이미지 또는 기본 이모지 반환
  const getProfileDisplay = (room: ChatRoom) => {
    if (room.profileImageUrl) {
      return (
        <img 
          src={room.profileImageUrl} 
          alt="프로필" 
          style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            objectFit: 'cover',
            border: '2px solid #E5E7EB'
          }} 
        />
      );
    }
    
    // 프로필 이미지가 없으면 기본 이모지 또는 닉네임 첫 글자
    if (room.profileEmoji) {
      return <span style={{fontSize:28}}>{room.profileEmoji}</span>;
    }
    
    // 닉네임 첫 글자를 기본 프로필로 사용
    const firstChar = room.userNickname ? room.userNickname.charAt(0) : 'U';
    return (
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: '#8A55CC',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        {firstChar}
      </div>
    );
  };



  // 채팅방 선택 핸들러
  const handleRoomSelect = (room: ChatRoom) => {
    setSelectedRoom(room);
    setIsAnnouncementMode(false);
    
    if (isMobileView) {
      setShowChatOnMobile(true);
    }
    
    // 채팅방 선택 후 스크롤을 최신 메시지로 이동
    setTimeout(() => {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // 공지방 선택 핸들러
  const handleAnnouncementSelect = () => {
    setIsAnnouncementMode(true);
    setSelectedRoom(null);
    
    if (isMobileView) {
      setShowChatOnMobile(true);
    }
    
    // 공지방 선택 후 스크롤을 최신 메시지로 이동
    setTimeout(() => {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // 모바일에서 채팅방 목록으로 돌아가기
  const handleBackToRoomList = () => {
    setShowChatOnMobile(false);
    setSelectedRoom(null);
    setIsAnnouncementMode(false);
  };

  // 검색 필터링된 채팅방
  let filteredRooms = chatRooms.filter(room => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      room.userNickname.toLowerCase().includes(s) ||
      (room.lastMessage.content && room.lastMessage.content.toLowerCase().includes(s))
    );
  });

  // 날짜 구분선 생성 함수
  const getDateLabel = (date: Date) => {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return '오늘';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return '어제';
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // 리액션 추가/제거
  const toggleReaction = async (msg: Message, emoji: string) => {
    if (!user) {
      console.log('사용자 정보가 없습니다.');
      alert('로그인이 필요합니다.');
      return;
    }
    
    if (!msg.id) {
      console.error('메시지 ID가 없습니다:', msg);
      alert('메시지 정보가 올바르지 않습니다.');
      return;
    }
    
    console.log('리액션 토글 시작:', {msgId: msg.id, emoji, userId: user.uid});
    
    try {
      let messageRef;
      
      // 새로운 구조에서 메시지 경로 결정
      if (isAnnouncementMode) {
        // 공지방 메시지
        messageRef = doc(db, 'conversations', 'announcement', 'messages', msg.id);
      } else if (selectedRoom) {
        // 일반 채팅방 메시지
        const conversationId = generateConversationId(
          user.uid, 
          selectedRoom.userUid, 
          selectedRoom.postId
        );
        messageRef = doc(db, 'conversations', conversationId, 'messages', msg.id);
      } else {
        console.error('채팅방이 선택되지 않았습니다.');
        alert('채팅방 정보를 찾을 수 없습니다.');
        return;
      }
      
      // 메시지가 존재하는지 확인
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        console.error('메시지가 존재하지 않습니다:', msg.id);
        console.log('찾은 경로:', messageRef.path);
        alert('메시지를 찾을 수 없습니다.');
        return;
      }
      
      const currentData = messageDoc.data();
      let reactions = [...(currentData.reactions || [])];
      
      // 사용자가 같은 이모지를 다시 누른 경우인지 확인
      const targetReaction = reactions.find(r => r.emoji === emoji);
      const isAlreadyReacted = targetReaction && targetReaction.users.includes(user.uid);
      
      if (isAlreadyReacted) {
        // 같은 이모지를 다시 누른 경우 - 리액션 제거 (토글)
        const targetIndex = reactions.findIndex(r => r.emoji === emoji);
        reactions[targetIndex].users = reactions[targetIndex].users.filter((uid: string) => uid !== user.uid);
        if (reactions[targetIndex].users.length === 0) {
          reactions.splice(targetIndex, 1);
        }
      } else {
        // 다른 이모지를 누른 경우 - 기존 리액션 모두 제거하고 새 리액션 추가
        
        // 1단계: 이 사용자의 모든 기존 리액션 제거
        reactions = reactions.map(reaction => ({
          ...reaction,
          users: reaction.users.filter((uid: string) => uid !== user.uid)
        })).filter(reaction => reaction.users.length > 0);
        
        // 2단계: 새로운 리액션 추가
        const existingReaction = reactions.find(r => r.emoji === emoji);
        if (existingReaction) {
          existingReaction.users.push(user.uid);
        } else {
          reactions.push({ emoji, users: [user.uid] });
        }
      }
      
      console.log('업데이트할 리액션:', reactions);
      
      // 데이터베이스에 리액션 업데이트
      await updateDoc(messageRef, {
        reactions: reactions
      });
      
      console.log('리액션 업데이트 성공');
      
      // 모바일에서 리액션 패널 닫기
      if (isMobileView) {
        setMobileReactionMessageId(null);
      }
      
      setShowReactionPicker(false);
      setReactionTarget(null);
    } catch (error) {
      console.error('리액션 업데이트 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      
      // Firebase 권한 오류인 경우 특별 처리
      if (errorMessage.includes('permission-denied') || errorMessage.includes('unauthorized')) {
        alert('리액션을 추가할 권한이 없습니다. 로그인 상태를 확인해주세요.');
      } else if (errorMessage.includes('not-found')) {
        alert('메시지를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.');
      } else {
        alert(`리액션 추가에 실패했습니다: ${errorMessage}`);
      }
    }
  };
  // 모바일 롱탭/PC 우클릭/호버 리액션 선택
  const handleReactionOpen = (msgId: string, e?: React.MouseEvent|React.TouchEvent) => {
    if (e) e.preventDefault();
    setReactionTarget(msgId);
    setShowReactionPicker(true);
  };
  const handleReactionClose = () => {
    setShowReactionPicker(false);
    setReactionTarget(null);
  };

  // 파일 첨부 핸들러
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileType(file.type);
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }
  };
  // 파일 업로드 및 메시지 전송
  const handleSendWithFile = useCallback(async () => {
    if (!user || (!newMessage.trim() && !filePreview && !fileName) || isUploading || isSending) return;
    
    if (isAnnouncementMode && bannedUsers.includes(user.uid)) {
      alert('공지방에서 내보내진 사용자는 파일을 보낼 수 없습니다.');
      return;
    }
    
    setIsUploading(true);
    
    // 백업용 데이터 저장
    const originalMessage = newMessage;
    const originalFilePreview = filePreview;
    const originalFileType = fileType;
    const originalFileName = fileName;
    
    // 즉시 상태 초기화 (UX 개선)
    setNewMessage('');
    setFilePreview(null);
    setFileType(null);
    setFileName(null);
    
    try {
      let fileUrl = '';
      if (originalFilePreview && originalFileName) {
        const fileInput = document.getElementById('chat-file-input') as HTMLInputElement;
        const file = fileInput?.files?.[0];
        
        if (!file) {
          throw new Error('파일을 찾을 수 없습니다.');
        }
        
        // 파일 크기 검증 (10MB 제한)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('파일 크기는 10MB 이하여야 합니다.');
        }
        
          const fileRef = storageRef(storage, `chat/${user.uid}/${Date.now()}_${file.name}`);
          await uploadBytes(fileRef, file);
          fileUrl = await getDownloadURL(fileRef);
      }
      
      if (isAnnouncementMode) {
        // 공지방 파일 메시지 전송 (새 구조 사용)
        const messageId = await sendMessage(
          user.uid,
          'announcement',
          originalMessage.trim(),
          user.nickname,
          '공지방',
          user.role,
          { postId: 'announcement', postTitle: '공지방' },
          fileUrl ? { fileUrl, fileType: originalFileType || '', fileName: originalFileName || '' } : undefined,
          replyTo ? {
            messageId: replyTo.id,
            content: replyTo.content,
            senderNickname: replyTo.fromNickname,
            senderUid: replyTo.fromUid
          } : undefined
        );
        
        // 메시지 전송 후 자동으로 읽음 처리
        if (messageId) {
          await markAnnouncementMessageAsRead(messageId, user.uid);
        }
      } else if (selectedRoom) {
        // 일반 채팅 파일 메시지 전송 (새 구조 사용)
        await sendMessage(
          user.uid,
          selectedRoom.userUid,
          originalMessage.trim(),
          user.nickname,
          selectedRoom.userNickname,
          user.role,
          selectedRoom.postId ? { 
            postId: selectedRoom.postId, 
            postTitle: selectedRoom.postTitle || '' 
          } : undefined,
          fileUrl ? { fileUrl, fileType: originalFileType || '', fileName: originalFileName || '' } : undefined,
          replyTo ? {
            messageId: replyTo.id,
            content: replyTo.content,
            senderNickname: replyTo.fromNickname,
            senderUid: replyTo.fromUid
          } : undefined
        );
      }
      
      setReplyTo(null); // 답장 초기화
      const fileInput = document.getElementById('chat-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('파일 메시지 전송 실패:', error);
      
      // 전송 실패 시 상태 복구
      setNewMessage(originalMessage);
      setFilePreview(originalFilePreview);
      setFileType(originalFileType);
      setFileName(originalFileName);
      
      // 구체적인 에러 메시지
      if (error instanceof Error) {
        if (error.message.includes('파일 크기')) {
          alert(error.message);
        } else if (error.message.includes('storage')) {
          alert('파일 업로드에 실패했습니다. 네트워크 연결을 확인해주세요.');
        } else if (error.message.includes('permission')) {
          alert('파일 업로드 권한이 없습니다.');
        } else {
          alert('파일 전송에 실패했습니다. 다시 시도해주세요.');
        }
      } else {
        alert('파일 전송에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsUploading(false);
    }
  }, [user, newMessage, filePreview, fileType, fileName, isAnnouncementMode, bannedUsers, selectedRoom, replyTo, isUploading, isSending]);

  // 메시지 복사
  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    setContextMenu(null);
  };
  // 메시지 삭제
  const handleDelete = async (msg: Message) => {
    if (!user || msg.fromUid !== user.uid) return;
    
    if (confirm('메시지를 삭제하시겠습니까?')) {
      try {
        let messageRef;
        
        // 새로운 구조에서 메시지 경로 결정
        if (isAnnouncementMode) {
          // 공지방 메시지
          messageRef = doc(db, 'conversations', 'announcement', 'messages', msg.id);
        } else if (selectedRoom) {
          // 일반 채팅방 메시지
          const conversationId = generateConversationId(
            user.uid, 
            selectedRoom.userUid, 
            selectedRoom.postId
          );
          messageRef = doc(db, 'conversations', conversationId, 'messages', msg.id);
        } else {
          console.error('채팅방이 선택되지 않았습니다.');
          alert('채팅방 정보를 찾을 수 없습니다.');
          return;
        }
        
        await updateDoc(messageRef, {
          content: '(삭제된 내용입니다)',
          isDeleted: true,
          deletedBy: user.uid,
          deletedAt: serverTimestamp()
        });
        setContextMenu(null);
      } catch (error) {
        console.error('메시지 삭제 실패:', error);
        alert('메시지 삭제에 실패했습니다. 권한을 확인해주세요.');
      }
    }
  };

  // 운영진/리더용 메시지 삭제 (내용을 "(삭제된 내용입니다)"로 변경)
  const handleMessageDelete = async (msg: Message) => {
    if (!user || (user.role !== '리더' && user.role !== '운영진')) return;
    
    if (confirm('이 메시지를 삭제하시겠습니까? (내용이 "(삭제된 내용입니다)"로 변경됩니다)')) {
      try {
        let messageRef;
        
        // 새로운 구조에서 메시지 경로 결정
        if (isAnnouncementMode) {
          // 공지방 메시지
          messageRef = doc(db, 'conversations', 'announcement', 'messages', msg.id);
        } else if (selectedRoom) {
          // 일반 채팅방 메시지
          const conversationId = generateConversationId(
            user.uid, 
            selectedRoom.userUid, 
            selectedRoom.postId
          );
          messageRef = doc(db, 'conversations', conversationId, 'messages', msg.id);
        } else {
          console.error('채팅방이 선택되지 않았습니다.');
          alert('채팅방 정보를 찾을 수 없습니다.');
          return;
        }
        
        await updateDoc(messageRef, {
          content: '(삭제된 내용입니다)',
          isDeleted: true,
          deletedBy: user.uid,
          deletedAt: serverTimestamp()
        });
        setContextMenu(null);
      } catch (error) {
        console.error('메시지 삭제 실패:', error);
        alert('메시지 삭제에 실패했습니다.');
      }
    }
  };
  // 메시지 신고
  const handleReport = (msg: Message) => {
    setReportTarget(msg);
    setContextMenu(null);
  };
  const handleReportSubmit = async () => {
    if (!user || !reportTarget || !reportReason.trim()) return;
    await addDoc(collection(db, 'reports'), {
      messageId: reportTarget.id,
      reporterUid: user.uid,
      reporterNickname: user.nickname,
      reason: reportReason,
      createdAt: serverTimestamp()
    });
    setReportTarget(null);
    setReportReason('');
    alert('신고가 접수되었습니다.');
  };
  // 답장
  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    setContextMenu(null);
  };

  // 메시지 분석
  const handleAnalysis = async (msg: Message) => {
    setContextMenu(null);
    setAnalysisTarget(msg);
    
    try {
      // 읽음 상태 정보 가져오기
      let detailedReadStatus = null;
      if (canViewReadStatus()) {
        detailedReadStatus = await getMessageReadStatus(msg.id);
      }
      
      // 읽음 상태 데이터 구조 변환
      let processedReadStatus = null;
      if (detailedReadStatus) {
        processedReadStatus = {
          ...detailedReadStatus,
          readUsers: detailedReadStatus.readByUsers || [], // readByUsers를 readUsers로 매핑
          unreadUsers: detailedReadStatus.unreadUsers || []
        };
      }
      
      // 해당 메시지와 관련된 채팅 분석 데이터 생성
      const analysis = {
        messageInfo: {
          content: msg.content,
          sender: msg.fromNickname,
          timestamp: msg.createdAt,
          hasFile: !!msg.fileUrl,
          fileType: msg.fileType
        },
        contextAnalysis: await analyzeMessageContext(msg),
        readStatus: processedReadStatus,
        reactions: msg.reactions || [],
        relatedMessages: await getRelatedMessages(msg)
      };
      
      setAnalysisData(analysis);
    } catch (error) {
      console.error('메시지 분석 실패:', error);
      alert('분석 중 오류가 발생했습니다.');
      setAnalysisTarget(null);
    }
  };

  // 메시지 컨텍스트 분석
  const analyzeMessageContext = async (msg: Message) => {
    const now = new Date();
    const msgDate = msg.createdAt?.toDate?.() || new Date(msg.createdAt);
    const timeDiff = now.getTime() - msgDate.getTime();
    
    return {
      timeAgo: formatTimeAgo(timeDiff),
      messageLength: msg.content.length,
      wordCount: msg.content.split(/\s+/).length,
      hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(msg.content),
      hasUrl: /https?:\/\/[^\s]+/g.test(msg.content),
      sentiment: analyzeSentiment(msg.content)
    };
  };

  // 관련 메시지 가져오기
  const getRelatedMessages = async (msg: Message) => {
    const messages = isAnnouncementMode ? announcementMessages : 
                    (selectedRoom ? await getMessagesForRoom(selectedRoom) : []);
    
    // 같은 사용자의 최근 메시지들
    const userMessages = messages
      .filter(m => m.fromUid === msg.fromUid && m.id !== msg.id)
      .slice(0, 5);
    
    // 답장이나 멘션된 메시지들
    const replyMessages = messages
      .filter(m => m.content.includes(msg.fromNickname) || 
                   (msg.content.includes(m.fromNickname) && m.id !== msg.id))
      .slice(0, 3);
    
    return {
      userMessages,
      replyMessages,
      totalCount: messages.length
    };
  };

  // 시간 차이 포맷팅
  const formatTimeAgo = (timeDiff: number) => {
    const minutes = Math.floor(timeDiff / (1000 * 60));
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  };

  // 간단한 감정 분석
  const analyzeSentiment = (text: string) => {
    const positiveWords = ['좋', '행복', '감사', '최고', '완벽', '훌륭', '멋진', '사랑', '기쁨', '웃음', '축하'];
    const negativeWords = ['나쁘', '슬프', '화나', '짜증', '실망', '최악', '힘들', '어려', '문제', '걱정'];
    
    const positiveCount = positiveWords.reduce((count, word) => 
      count + (text.includes(word) ? 1 : 0), 0);
    const negativeCount = negativeWords.reduce((count, word) => 
      count + (text.includes(word) ? 1 : 0), 0);
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  };

  // 채팅방 메시지 가져오기 (분석용)
  const getMessagesForRoom = async (room: ChatRoom) => {
    // 실제 구현에서는 해당 채팅방의 메시지들을 가져오는 로직
    return [];
  };

  // 더블클릭으로 리액션 추가
  const handleDoubleClick = (msg: Message, e?: React.MouseEvent) => {
    if (msg.fromUid === 'system') return;
    

    
    // 리액션 피커 위치 계산
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pickerWidth = 200;
      const pickerHeight = 40;
      
      let top = rect.top - pickerHeight - 10;
      let left = rect.left + rect.width / 2 - pickerWidth / 2;
      
      // 화면 경계 체크
      if (left < 10) left = 10;
      if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;
      if (top < 10) top = rect.bottom + 10;
      
      setReactionPickerPosition({top, left});
    }
    
    setReactionTarget(msg.id);
    setShowReactionPicker(true);
  };

  // 모바일용 더블탭 처리
  const [lastTap, setLastTap] = useState<{msgId: string, time: number} | null>(null);
  
  const handleMobileTap = (msg: Message, e?: React.MouseEvent) => {
    if (msg.fromUid === 'system') return;
    
    const now = Date.now();
    if (lastTap && lastTap.msgId === msg.id && now - lastTap.time < 500) {
      // 더블탭 감지 (500ms 내)

      
      // 리액션 피커 위치 계산
      if (e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pickerWidth = 200;
        const pickerHeight = 45;
        
        let top = rect.top - pickerHeight - 10;
        let left = rect.left + rect.width / 2 - pickerWidth / 2;
        
        // 화면 경계 체크
        if (left < 10) left = 10;
        if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;
        if (top < 10) top = rect.bottom + 10;
        
        setReactionPickerPosition({top, left});
      }
      
      setReactionTarget(msg.id);
      setShowReactionPicker(true);
      setLastTap(null);
    } else {
      setLastTap({msgId: msg.id, time: now});
      // 500ms 후에 lastTap 초기화
      setTimeout(() => {
        setLastTap(null);
      }, 500);
    }
  };

  // 리액션 상세 보기
  const handleReactionDetailClick = async (msg: Message) => {
    if (msg.reactions && msg.reactions.length > 0) {
      // 리액션한 사용자들의 프로필 정보 미리 로드
      const allUserIds = new Set<string>();
      msg.reactions.forEach(reaction => {
        reaction.users.forEach(userId => allUserIds.add(userId));
      });
      
      // 캐시되지 않은 사용자들의 프로필 정보 가져오기
      const uncachedUserIds = Array.from(allUserIds).filter(userId => 
        !userProfiles[userId] && !announcementParticipants.find(p => p.uid === userId)
      );
      
      if (uncachedUserIds.length > 0) {
        try {
          const newProfiles: Record<string, any> = {};
          
          await Promise.all(uncachedUserIds.map(async (userId) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', userId));
              if (userDoc.exists()) {
                newProfiles[userId] = userDoc.data();
              }
            } catch (error) {
              console.error(`사용자 ${userId} 프로필 로드 실패:`, error);
            }
          }));
          
          if (Object.keys(newProfiles).length > 0) {
            setUserProfiles(prev => ({
              ...prev,
              ...newProfiles
            }));
          }
        } catch (error) {
          console.error('사용자 프로필 로드 실패:', error);
        }
      }
      
      setReactionModal({msgId: msg.id, reactions: msg.reactions});
    }
  };

  // 원본 메시지로 스크롤 이동
  const scrollToMessage = (messageId: string) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      // 스크롤 애니메이션
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // 하이라이트 효과
      setHighlightedMessageId(messageId);
      
      // 3초 후 하이라이트 제거
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 3000);
    } else {
      // 원본 메시지를 찾을 수 없는 경우
      alert('원본 메시지를 찾을 수 없습니다. 메시지가 삭제되었거나 이전 대화에 있을 수 있습니다.');
    }
  };

  // 답장 원본 클릭 핸들러
  const handleReplySourceClick = (replyToMessageId: string) => {
    scrollToMessage(replyToMessageId);
  };

  // 키보드 단축키 및 이벤트 핸들러
  useEffect(() => {
    const handleKeyboardEvents = (e: KeyboardEvent) => {
      // ESC로 패널들 닫기
      if (e.key === 'Escape') {
        setShowReactionPicker(false);
        setReactionTarget(null);
        setContextMenu(null);
        setMobileReactionMessageId(null);
        setReplyTo(null);
        return;
      }

      // Ctrl+K: 채팅방 검색 포커스
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.chat-room-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }
      
      // Ctrl+F: 메시지 검색 (향후 구현 예정)
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        console.log('메시지 검색 기능 (향후 구현)');
        return;
      }
      
      // 방향키로 채팅방 이동 (채팅방 목록에 포커스가 있을 때)
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && 
          document.activeElement?.closest('.chat-room-list')) {
        e.preventDefault();
        const currentSelected = document.querySelector('.chat-room-item.selected');
        const allRooms = Array.from(document.querySelectorAll('.chat-room-item'));
        
        if (currentSelected && allRooms.length > 0) {
          const currentIndex = allRooms.indexOf(currentSelected);
          let nextIndex;
          
          if (e.key === 'ArrowUp') {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : allRooms.length - 1;
          } else {
            nextIndex = currentIndex < allRooms.length - 1 ? currentIndex + 1 : 0;
          }
          
          const nextRoom = allRooms[nextIndex] as HTMLElement;
          nextRoom.click();
          nextRoom.focus();
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyboardEvents);
    return () => document.removeEventListener('keydown', handleKeyboardEvents);
  }, []);

  // 메시지 입력 키 핸들러
  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter로 전송, Shift+Enter로 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (filePreview || fileName) {
        handleSendWithFile();
      } else {
        handleSend();
      }
    }
    
    // Ctrl+Enter로도 전송 가능
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (filePreview || fileName) {
        handleSendWithFile();
      } else {
        handleSend();
      }
    }
  };

  // 채팅방 아이템 키보드 핸들러
  const handleRoomKeyDown = (e: React.KeyboardEvent, room: ChatRoom) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRoomSelect(room);
    }
  };

  // 브라우저 알림 관련 함수들
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        // 테스트 알림 발송
        new Notification('VERYUS 알림이 활성화되었습니다!', {
          body: '새로운 메시지를 받을 때 알림을 보내드립니다.',
          icon: '/veryus_logo.png',
          badge: '/cherry-favicon.svg'
        });
      }
    } catch (error) {
      console.error('알림 권한 요청 실패:', error);
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      // 간단한 알림음 (Web Audio API 사용)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('알림음 재생 실패:', error);
    }
  }, [soundEnabled]);

  const showNotification = useCallback((title: string, body: string, onClick?: () => void) => {
    // 알림 빈도 제한 (5초 간격)
    const now = Date.now();
    if (now - lastNotificationRef.current < 5000) {
      return;
    }
    lastNotificationRef.current = now;

    if (notificationPermission === 'granted' && document.hidden) {
      try {
        const notification = new Notification(title, {
          body,
          icon: '/veryus_logo.png',
          badge: '/cherry-favicon.svg',
          requireInteraction: false,
          silent: false
        });

        if (onClick) {
          notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
          };
        }

        // 5초 후 자동 닫기
        setTimeout(() => {
          notification.close();
        }, 5000);

        // 알림음 재생
        playNotificationSound();
      } catch (error) {
        console.error('알림 표시 실패:', error);
      }
    }
  }, [notificationPermission, playNotificationSound]);

  // 메시지 변경 시 알림 발송
  useEffect(() => {
    if (!user || messages.length === 0) return;
    
    const latestMessage = messages[messages.length - 1];
    
    // 본인 메시지가 아니고, 새로 추가된 메시지인 경우 알림
    if (latestMessage.fromUid !== user.uid && 
        latestMessage.createdAt && 
        typeof latestMessage.createdAt.seconds === 'number') {
      
      const messageTime = latestMessage.createdAt.seconds * 1000;
      const now = Date.now();
      
      // 5초 이내에 생성된 메시지만 알림 (실시간 메시지)
      if (now - messageTime < 5000) {
        showNotification(
          `${latestMessage.fromNickname}님의 새 메시지`,
          latestMessage.content.length > 50 
            ? latestMessage.content.substring(0, 50) + '...' 
            : latestMessage.content,
          () => {
            // 알림 클릭 시 해당 채팅방으로 이동
            if (selectedRoom && selectedRoom.userUid === latestMessage.fromUid) {
              // 이미 해당 채팅방이 선택된 경우 스크롤만
              document.querySelector('.chat-messages')?.scrollTo({
                top: document.querySelector('.chat-messages')?.scrollHeight,
                behavior: 'smooth'
              });
            }
          }
        );
      }
    }
  }, [messages, user, showNotification, selectedRoom]);

  // 공지방 메시지 알림
  useEffect(() => {
    if (!user || announcementMessages.length === 0) return;
    
    const latestMessage = announcementMessages[announcementMessages.length - 1];
    
    // 본인 메시지가 아니고, 새로 추가된 메시지인 경우 알림
    if (latestMessage.fromUid !== user.uid && latestMessage.fromUid !== 'system' &&
        latestMessage.createdAt && 
        typeof latestMessage.createdAt.seconds === 'number') {
      
      const messageTime = latestMessage.createdAt.seconds * 1000;
      const now = Date.now();
      
      // 5초 이내에 생성된 메시지만 알림 (실시간 메시지)
      if (now - messageTime < 5000) {
        showNotification(
          `📢 공지방: ${latestMessage.fromNickname}님`,
          latestMessage.content.length > 50 
            ? latestMessage.content.substring(0, 50) + '...' 
            : latestMessage.content,
          () => {
            // 알림 클릭 시 공지방으로 이동
            if (!isAnnouncementMode) {
              setIsAnnouncementMode(true);
              setSelectedRoom(null);
            }
          }
        );
      }
    }
  }, [announcementMessages, user, showNotification, isAnnouncementMode]);

  return (
    <div className="messages-page">
    <div className="messages-container">
      <div className={`chat-room-list always-show${isMobileView && showChatOnMobile ? ' hide-on-mobile' : ''}`}>
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'0 0 24px 16px'}}>
          <button className="exit-home-btn" onClick={()=>window.location.href='/'} style={{background:'none',border:'none',padding:0,cursor:'pointer'}} title="홈으로">
            <Home size={22} color="#8A55CC" />
          </button>
          {isMobileView && (
            <button 
              className="chat-room-list-toggle" 
              onClick={handleBackToRoomList} 
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="채팅방으로 돌아가기"
            >
              <Menu size={22} color="#8A55CC" />
            </button>
          )}
          <h2 style={{margin:0}}>채팅</h2>
        </div>

        <div className="chat-room-search-bar">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="닉네임, 메시지 검색 (Ctrl+K)"
            className="chat-room-search-input"
            aria-label="채팅방 및 메시지 검색"
            role="searchbox"
          />
        </div>
        
        {/* 공지방 */}
        <div
          className={`chat-room-item${isAnnouncementMode ? ' selected' : ''}`}
          onClick={handleAnnouncementSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAnnouncementSelect();
            }
          }}
          style={{backgroundColor: isAnnouncementMode ? '#F8F4FF' : '', position: 'relative'}}
          tabIndex={0}
          role="button"
          aria-label={`공지방 채팅 ${isAnnouncementMode ? '(현재 선택됨)' : ''} ${announcementUnreadCount > 0 ? `안읽은 메시지 ${announcementUnreadCount}개` : ''}`}
          aria-pressed={isAnnouncementMode}
        >
          <div className="chat-room-profile">
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#FF6B35',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              📢
            </div>
          </div>
          <div className="chat-room-info">
            <div className="chat-room-title-row">
              <span className="chat-room-nickname" style={{fontWeight: 'bold', color: '#FF6B35'}}>공지방</span>
              <span className="chat-room-time">
                {announcementMessages.length > 0 ? formatTime(announcementMessages[announcementMessages.length - 1].createdAt) : ''}
              </span>
            </div>
            <div className="chat-room-last-message-row">
              <span className="chat-room-last-message">
                {announcementMessages.length > 0 ? announcementMessages[announcementMessages.length - 1].content : '공지방에 오신 것을 환영합니다!'}
              </span>
              {announcementUnreadCount > 0 && (
                <span className="chat-room-unread-badge" style={{
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '10px',
                  minWidth: '20px',
                  height: '20px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  marginLeft: '8px',
                  boxSizing: 'border-box',
                  lineHeight: '1',
                  padding: announcementUnreadCount > 9 ? '2px 4px' : '2px'
                }}>
                  {announcementUnreadCount > 99 ? '99+' : announcementUnreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {filteredRooms.length === 0 && <div className="empty">쪽지 내역이 없습니다.</div>}
        {filteredRooms.map((room: ChatRoom) => (
                      <div
              key={room.userUid + (room.postId || '')}
              className={`chat-room-item${selectedRoom && selectedRoom.userUid === room.userUid && selectedRoom.postId === room.postId ? ' selected' : ''}`}
              onClick={() => handleRoomSelect(room)}
              onKeyDown={(e) => handleRoomKeyDown(e, room)}
              tabIndex={0}
              role="button"
              aria-label={`${room.userNickname}님과의 채팅 ${selectedRoom && selectedRoom.userUid === room.userUid && selectedRoom.postId === room.postId ? '(현재 선택됨)' : ''} ${getUnreadCount(room) > 0 ? `안읽은 메시지 ${getUnreadCount(room)}개` : ''} 마지막 메시지: ${room.lastMessage.content}`}
              aria-pressed={!!(selectedRoom && selectedRoom.userUid === room.userUid && selectedRoom.postId === room.postId)}
          >
            <div className="chat-room-profile">
              {getProfileDisplay(room)}
            </div>
            <div className="chat-room-info">
              <div className="chat-room-title-row">
                <span className="chat-room-nickname">{room.userNickname}</span>
                <span className="chat-room-time">{formatTime(room.lastMessage.createdAt)}</span>

              </div>
              <div className="chat-room-last-message-row">
                <span className="chat-room-last-message">{room.lastMessage.content}</span>
                {getUnreadCount(room) > 0 && <span className="chat-room-unread-badge">{getUnreadCount(room)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className={`chat-view${isMobileView && showChatOnMobile ? ' show-on-mobile' : ''}`}>
        {(selectedRoom || isAnnouncementMode) ? (
          <>
            <div className="chat-header" style={{ 
              boxSizing: 'border-box', 
              width: '100%',
              overflow: 'hidden'
            }}>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                flex: 1,
                minWidth: 0,
                overflow: 'hidden'
              }}>
                                  {isAnnouncementMode ? (
                  <>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#FF6B35',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      marginRight: '4px'
                    }}>
                      📢
                    </div>
                    <span style={{ 
                      fontWeight: 700, 
                      color: '#FF6B35',
                      fontSize: isMobileView ? '16px' : '18px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      flexShrink: 1
                    }}>공지방</span>
                    <div style={{ 
                      marginLeft: 'auto', 
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <button 
                        onClick={() => setShowParticipants(!showParticipants)}
                        style={{
                          background: showParticipants ? 'rgba(255, 107, 53, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                          fontSize: '16px'
                        }}
                        title={`참여자 목록 (${announcementParticipants.length}명)`}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 107, 53, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = showParticipants ? 'rgba(255, 107, 53, 0.1)' : 'rgba(107, 114, 128, 0.1)'}
                      >
                        👥
                      </button>
                      
                      {/* 알림 설정 버튼 */}
                      {notificationPermission === 'default' && (
                        <button 
                          onClick={requestNotificationPermission}
                          style={{
                            background: 'rgba(107, 114, 128, 0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                            fontSize: '16px'
                          }}
                          title="브라우저 알림 활성화"
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(107, 114, 128, 0.1)'}
                        >
                          🔔
                        </button>
                      )}
                      
                      {notificationPermission === 'granted' && (
                        <button 
                          onClick={() => {
                            setSoundEnabled(!soundEnabled);
                            localStorage.setItem('veryus_notification_sound', JSON.stringify(!soundEnabled));
                          }}
                          style={{
                            background: soundEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                            fontSize: '16px'
                          }}
                          title={soundEnabled ? '알림음 끄기' : '알림음 켜기'}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = soundEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)'}
                        >
                          {soundEnabled ? '🔊' : '🔇'}
                        </button>
                      )}
                    </div>
                  </>
                ) : selectedRoom?.profileImageUrl ? (
                  <img 
                    src={selectedRoom.profileImageUrl} 
                    alt="프로필" 
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      borderRadius: '50%', 
                      objectFit: 'cover',
                      border: '2px solid #E5E7EB',
                      marginRight: '4px'
                    }} 
                  />
                ) : (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#8A55CC',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginRight: '4px'
                  }}>
                    {selectedRoom?.userNickname ? selectedRoom.userNickname.charAt(0) : 'U'}
                  </div>
                )}
                {!isAnnouncementMode && (
                  <span style={{ 
                    fontWeight: 700,
                    fontSize: isMobileView ? '16px' : '18px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    flexShrink: 1
                  }}>
                    {selectedRoom?.userNickname}
                  </span>
                )}
              </div>
            </div>
            <div className="chat-messages">
              {(isAnnouncementMode ? announcementMessages : messages).length === 0 && <div className="chat-placeholder">{isAnnouncementMode ? '공지사항이 없습니다.' : '메시지가 없습니다.'}</div>}
              {(isAnnouncementMode ? announcementMessages : messages).map((msg, idx) => {
                const currentMessages = isAnnouncementMode ? announcementMessages : messages;
                const prev = currentMessages[idx - 1]; // 이전 메시지
                const currDate = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : new Date(msg.createdAt);
                const prevDate = prev?.createdAt?.seconds ? new Date(prev.createdAt.seconds * 1000) : prev ? new Date(prev.createdAt) : null;
                const showDateLabel = !prevDate || currDate.toDateString() !== prevDate.toDateString();
                return (
                  <React.Fragment key={msg.id}>
                    {/* 날짜 구분선 - 메시지 앞에 표시 */}
                    {showDateLabel && (
                      <div className="chat-date-label">{getDateLabel(currDate)}</div>
                    )}
                    
                    {/* 메시지 전체 컨테이너 */}
                    <div 
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.fromUid === 'system' ? 'center' : msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
                        marginBottom: '8px',
                        maxWidth: '100%'
                      }}
                      onMouseEnter={() => !isMobileView && msg.fromUid !== 'system' && setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {/* 닉네임과 역할 표시 (시스템 메시지 제외) */}
                      {msg.fromUid !== 'system' && (
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          marginBottom: '1px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          paddingLeft: msg.fromUid === user.uid ? '0' : '4px',
                          paddingRight: msg.fromUid === user.uid ? '4px' : '0'
                        }}>
                          <span style={{ fontWeight: '600' }}>
                            {msg.fromUid === user.uid ? '나' : msg.fromNickname}
                          </span>
                          {msg.fromUserRole && msg.fromUserRole !== '일반' && msg.fromUserRole !== 'system' && (
                            <span style={{
                              fontSize: '10px',
                              padding: '1px 4px',
                              borderRadius: '8px',
                              backgroundColor: msg.fromUserRole === '리더' ? '#FFD700' : 
                                            msg.fromUserRole === '운영진' ? '#FF6B35' : 
                                            msg.fromUserRole === '부운영진' ? '#8A55CC' : '#E5E7EB',
                              color: msg.fromUserRole === '리더' ? '#8B5A00' :
                                    msg.fromUserRole === '운영진' ? 'white' :
                                    msg.fromUserRole === '부운영진' ? 'white' : '#6B7280',
                              fontWeight: '600'
                            }}>
                              {msg.fromUserRole}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* 메시지 말풍선과 시간 */}
                      {msg.fromUid === 'system' ? (
                        // 시스템 메시지는 기존 방식 유지
                        <div
                          data-message-id={msg.id}
                          className="chat-message system"
                          style={{
                            backgroundColor: '#FFF3CD',
                            border: '1px solid #FFEAA7',
                            borderRadius: '12px',
                            padding: isMobileView ? '6px 10px' : '8px 14px',
                            margin: '8px auto',
                            maxWidth: isMobileView ? 'calc(85% - 12px)' : 'calc(75% - 16px)',
                            textAlign: 'center',
                            color: '#856404',
                            fontSize: isMobileView ? '13px' : '14px',
                            wordBreak: 'keep-all',
                            lineHeight: '1.4',
                            boxSizing: 'border-box',
                            transition: 'all 0.3s ease',
                            ...(highlightedMessageId === msg.id && {
                              animation: 'highlightPulse 1.5s ease-in-out infinite',
                              zIndex: 10
                            })
                          }}
                        >
                          <div 
                            className="chat-message-content"
                            style={{
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                              whiteSpace: 'pre-wrap',
                              hyphens: 'auto',
                              width: '100%',
                              maxWidth: '100%'
                            }}
                          >
                            <span style={{
                              fontFamily: msg.content === '(삭제된 내용입니다)' ? 'monospace, "Courier New", Courier' : 'inherit',
                              fontStyle: msg.content === '(삭제된 내용입니다)' ? 'italic' : 'normal',
                              fontWeight: msg.content === '(삭제된 내용입니다)' ? '500' : 'normal'
                            }}>
                            {msg.content}
                            </span>
                          </div>
                        </div>
                      ) : (
                        // 일반 메시지는 말풍선과 시간을 같은 줄에
                        <div 
                          data-message-id={msg.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexDirection: msg.fromUid === user.uid ? 'row-reverse' : 'row',
                            maxWidth: `${Math.max(50, 85 - Math.min((replyDepth.get(msg.id) || 0), 5) * 5)}%`,
                            width: 'auto',
                            position: 'relative',
                            marginBottom: '8px',
                            marginLeft: msg.fromUid !== user.uid ? `${(replyDepth.get(msg.id) || 0) * (isMobileView ? 12 : 20)}px` : '0',
                            marginRight: msg.fromUid === user.uid ? `${(replyDepth.get(msg.id) || 0) * (isMobileView ? 12 : 20)}px` : '0',
                            alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
                            transition: 'all 0.3s ease',
                            ...(highlightedMessageId === msg.id && {
                              animation: 'highlightPulse 1.5s ease-in-out infinite',
                              zIndex: 10
                            })
                          }}>
                          
                          {/* 답장 연결선 */}
                          {msg.replyTo && (replyDepth.get(msg.id) || 0) > 0 && (() => {
                            const depth = Math.min(replyDepth.get(msg.id) || 0, 5);
                            const intensity = 0.3 + (depth * 0.15);
                            const hue = 260 + (depth * 10); // 보라색에서 파란색으로 변화
                            
                            return (
                              <div style={{
                                position: 'absolute',
                                left: msg.fromUid === user.uid ? 'auto' : '-15px',
                                right: msg.fromUid === user.uid ? '-15px' : 'auto',
                                top: '-8px',
                                bottom: '-8px',
                                width: '3px',
                                background: `linear-gradient(to bottom, 
                                  hsla(${hue}, 55%, 65%, ${intensity * 0.7}) 0%, 
                                  hsla(${hue}, 55%, 65%, ${intensity}) 50%, 
                                  hsla(${hue}, 55%, 65%, ${intensity * 0.7}) 100%)`,
                                borderRadius: '2px',
                                zIndex: 1,
                                boxShadow: `0 0 ${depth * 2}px hsla(${hue}, 55%, 65%, 0.3)`
                              }} />
                            );
                          })()}
                          
                          {/* 연결 곡선 */}
                          {msg.replyTo && (replyDepth.get(msg.id) || 0) > 0 && (() => {
                            const depth = Math.min(replyDepth.get(msg.id) || 0, 5);
                            const hue = 260 + (depth * 10);
                            const intensity = 0.4 + (depth * 0.1);
                            
                            return (
                              <div style={{
                                position: 'absolute',
                                left: msg.fromUid === user.uid ? 'auto' : '-15px',
                                right: msg.fromUid === user.uid ? '-15px' : 'auto',
                                top: '50%',
                                width: '15px',
                                height: '3px',
                                background: `hsla(${hue}, 55%, 65%, ${intensity})`,
                                borderRadius: msg.fromUid === user.uid ? '2px 0 0 2px' : '0 2px 2px 0',
                                transform: 'translateY(-50%)',
                                zIndex: 2
                              }} />
                            );
                          })()}
                          
                          <div
                            className={`chat-message${msg.fromUid === user.uid ? ' sent' : ' received'}`}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleDoubleClick(msg, e);
                            }}
                            onClick={(e) => {
                              if (isMobileView) {
                                e.stopPropagation();
                                // 리액션 패널이 열려있으면 닫고, 닫혀있으면 열기
                                if (mobileReactionMessageId === msg.id) {
                                  setMobileReactionMessageId(null);
                                } else {
                                  setMobileReactionMessageId(msg.id);
                                  // 3초 후 자동으로 닫기
                                  setTimeout(() => setMobileReactionMessageId(null), 3000);
                                }
                              }
                            }}
                                                  onContextMenu={e => {
                        e.preventDefault();
                        const menuWidth = 160;
                        const menuHeight = 200;
                        let x = e.clientX;
                        let y = e.clientY;
                        
                        // 화면 경계 체크 및 조정
                        if (x + menuWidth > window.innerWidth) {
                          x = window.innerWidth - menuWidth - 10;
                        }
                        if (y + menuHeight > window.innerHeight) {
                          y = window.innerHeight - menuHeight - 10;
                        }
                        if (x < 10) x = 10;
                        if (y < 10) y = 10;
                        
                        setContextMenu({msgId: msg.id, x, y});
                      }}
                      onTouchStart={e => {
                        let timeout = setTimeout(() => {
                          if (!e.currentTarget) return; // null 체크 추가
                          
                          const rect = e.currentTarget.getBoundingClientRect();
                          const menuWidth = 160;
                          const menuHeight = 200;
                          let x = rect.left + rect.width / 2;
                          let y = rect.top + rect.height / 2;
                          
                          // 모바일에서 화면 경계 체크
                          if (x + menuWidth > window.innerWidth) {
                            x = window.innerWidth - menuWidth - 10;
                          }
                          if (y + menuHeight > window.innerHeight) {
                            y = window.innerHeight - menuHeight - 10;
                          }
                          if (x < 10) x = 10;
                          if (y < 10) y = 10;
                          
                          setContextMenu({msgId: msg.id, x, y});
                        }, 500);
                        
                        const clear = () => { clearTimeout(timeout); };
                        if (e.currentTarget) { // null 체크 추가
                          e.currentTarget.addEventListener('touchend', clear, { once: true });
                          e.currentTarget.addEventListener('touchmove', clear, { once: true });
                        }
                      }}

                            style={{ 
                              maxWidth: '75%',
                              minWidth: '0',
                              width: 'auto',
                              display: 'block',
                              position: 'relative',
                              margin: '0',
                              alignSelf: 'auto',
                              flex: '0 0 auto',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere'
                            }}
                          >
                            {/* 답장 인용 표시 */}
                            {msg.replyTo && (
                              <div 
                                onClick={() => handleReplySourceClick(msg.replyTo!.messageId)}
                                onTouchStart={() => {}} // 모바일 터치 지원
                                style={{
                                  background: `linear-gradient(135deg, #F8F4FF 0%, #F3E8FF 100%)`,
                                  border: `3px solid #8A55CC`,
                                  borderRadius: '16px',
                                  padding: '16px 20px',
                                  marginBottom: '12px',
                                  fontSize: '13px',
                                  color: '#555',
                                  cursor: 'pointer',
                                  transition: 'all 0.25s ease',
                                  userSelect: 'none',
                                  boxShadow: '0 4px 16px rgba(138, 85, 204, 0.15)',
                                  position: 'relative',
                                  overflow: 'visible'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isMobileView) {
                                    e.currentTarget.style.background = `linear-gradient(135deg, #F3E8FF 0%, #E5DAF5 100%)`;
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(138, 85, 204, 0.25)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isMobileView) {
                                    e.currentTarget.style.background = `linear-gradient(135deg, #F8F4FF 0%, #F3E8FF 100%)`;
                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(138, 85, 204, 0.15)';
                                  }
                                }}
                                onTouchEnd={(e) => {
                                  // 모바일에서 터치 피드백
                                  e.currentTarget.style.background = `linear-gradient(135deg, #E5DAF5 0%, #D6C7E8 100%)`;
                                  setTimeout(() => {
                                    e.currentTarget.style.background = `linear-gradient(135deg, #F8F4FF 0%, #F3E8FF 100%)`;
                                  }, 150);
                                }}
                              >
                                {/* 답장 깊이 인디케이터 */}
                                {(replyDepth.get(msg.id) || 0) > 1 && (() => {
                                  const depth = replyDepth.get(msg.id) || 0;
                                  const isMaxDepth = depth >= 10;
                                  
                                  return (
                                    <div style={{
                                      position: 'absolute',
                                      top: '8px',
                                      right: '8px',
                                      background: isMaxDepth ? 'rgba(245, 158, 11, 0.2)' : 'rgba(138, 85, 204, 0.2)',
                                      borderRadius: '12px',
                                      padding: '2px 6px',
                                      fontSize: '10px',
                                      fontWeight: '600',
                                      color: isMaxDepth ? '#F59E0B' : '#8A55CC',
                                      border: isMaxDepth ? '1px solid rgba(245, 158, 11, 0.3)' : 'none'
                                    }}>
                                      {isMaxDepth ? 'MAX' : `L${depth}`}
                                    </div>
                                  );
                                })()}
                                
                                <div style={{
                                  fontSize: '13px',
                                  fontWeight: '800',
                                  color: 'white',
                                  marginBottom: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  background: '#8A55CC',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  boxShadow: '0 2px 6px rgba(138, 85, 204, 0.3)'
                                }}>
                                  <CornerUpLeft size={14} strokeWidth={3} color="white" />
                                  <span>💬 {msg.replyTo.senderNickname}에게 답장</span>
                                  {(replyDepth.get(msg.id) || 0) > 0 && (
                                    <div style={{
                                      width: '5px',
                                      height: '5px',
                                      borderRadius: '50%',
                                      background: 'white',
                                      opacity: 0.8
                                    }} />
                                  )}
                                </div>
                                <div style={{
                                  background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                  border: '2px solid #E5DAF5',
                                  borderRadius: '8px',
                                  padding: '12px 14px',
                                  fontSize: '14px',
                                  lineHeight: '1.4',
                                  color: '#374151',
                                  fontWeight: '500',
                                  position: 'relative',
                                  marginTop: '4px',
                                  boxShadow: '0 1px 4px rgba(138, 85, 204, 0.1)'
                                }}>
                                  <div style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    left: '12px',
                                    background: '#8A55CC',
                                    color: 'white',
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                  }}>
                                    📝 원본
                                  </div>
                                  <div style={{ marginTop: '4px' }}>
                                    "{msg.replyTo.content.length > 50 
                                      ? msg.replyTo.content.substring(0, 50) + '...' 
                                      : msg.replyTo.content}"
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div 
                              className="chat-message-content"
                              style={{
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                whiteSpace: 'pre-wrap',
                                hyphens: 'auto',
                                width: '100%',
                                maxWidth: '100%'
                              }}
                            >
                              <span style={{
                                fontFamily: msg.content === '(삭제된 내용입니다)' ? 'monospace, "Courier New", Courier' : 'inherit',
                                fontStyle: msg.content === '(삭제된 내용입니다)' ? 'italic' : 'normal',
                                fontWeight: msg.content === '(삭제된 내용입니다)' ? '500' : 'normal'
                              }}>
                              {msg.content}
                              </span>
                            </div>
                            
                            {/* 답장 카운트 표시 */}
                            {getReplyCount(msg.id, currentMessages) > 0 && (
                              <div style={{
                                marginTop: '8px',
                                fontSize: '11px',
                                color: '#8A55CC',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: 0.8
                              }}>
                                <MessageSquare size={12} strokeWidth={2} />
                                <span>답장 {getReplyCount(msg.id, currentMessages)}개</span>
                              </div>
                            )}
                            
                            {/* 호버/터치 시 나타나는 버튼들 */}
                            {((isMobileView && mobileReactionMessageId === msg.id) || (!isMobileView && hoveredMessageId === msg.id)) && (
                              <div 
                                className="message-hover-buttons"
                                style={{
                                  position: 'absolute',
                                  top: '-45px',
                                  [msg.fromUid === user.uid ? 'right' : 'left']: '-10px',
                                  display: 'flex',
                                  gap: '4px',
                                  background: 'rgba(255, 255, 255, 0.98)',
                                  backdropFilter: 'blur(15px)',
                                  borderRadius: '25px',
                                  padding: '8px 12px',
                                  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.1)',
                                  border: '1px solid rgba(232, 221, 208, 0.4)',
                                  zIndex: 9999
                                }}
                              >
                                {/* 답장 버튼 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReply(msg);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    transition: 'background 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(139, 69, 19, 0.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'none';
                                  }}
                                >
                                  <CornerUpLeft size={18} color="#8B4513" strokeWidth={2.5} />
                                </button>
                                
                                {/* 이모지 리액션 버튼들 */}
                                {['❤️', '😂', '👍', '😮', '😢', '👏'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleReaction(msg, emoji);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '36px',
                                      height: '36px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                      transition: 'transform 0.2s ease, background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'scale(1.2)';
                                      e.currentTarget.style.background = 'rgba(139, 69, 19, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'scale(1)';
                                      e.currentTarget.style.background = 'none';
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                            
                            {/* 리액션 선택창을 fixed 위치로 배치 */}
                            {showReactionPicker && reactionTarget === msg.id && (
                              <div 
                                className="reaction-picker" 
                                style={{
                                  top: `${reactionPickerPosition.top}px`,
                                  left: `${reactionPickerPosition.left}px`
                                }}
                                onMouseLeave={handleReactionClose}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {reactionEmojis.map(emoji => (
                                  <span 
                                    key={emoji} 
                                    className="reaction-emoji-picker" 
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      console.log('리액션 이모지 클릭됨:', emoji);
                                      toggleReaction(msg, emoji);
                                    }}
                                    style={{cursor: 'pointer'}}
                                  >
                                    {emoji}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          

                        </div>
                      )}
                      
                      {/* 시간 표시 - 말풍선 하단 좌측에 위치 */}
                      {msg.fromUid !== 'system' && (
                          <div style={{
                          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
                            fontSize: '11px',
                            color: '#999',
                          marginTop: '2px',
                          marginBottom: '4px',
                          paddingLeft: msg.fromUid === user.uid ? '0' : '4px',
                          paddingRight: msg.fromUid === user.uid ? '4px' : '0'
                            }}>
                              {currDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                      )}
                      
                      {/* 리액션 표시 - 메시지 블록 밖에 독립적으로 표시 */}
                      {msg.fromUid !== 'system' && msg.reactions && msg.reactions.length > 0 && (
                        <div style={{
                          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          marginTop: '4px'
                        }}>
                          <div className="chat-message-reactions">
                            {(() => {
                              // 모든 리액션의 총 사용자 수 계산
                              const allUsers = new Set();
                              msg.reactions.forEach(r => r.users.forEach(uid => allUsers.add(uid)));
                              const totalCount = allUsers.size;
                              
                              // 가장 많이 사용된 리액션 찾기
                              const topReaction = msg.reactions.reduce((max, current) => 
                                current.users.length > max.users.length ? current : max
                              );
                              
                              return (
                                <span 
                                  className={`reaction-emoji${topReaction.users.includes(user?.uid) ? ' my' : ''}`} 
                                  onClick={e => {e.stopPropagation(); handleReactionDetailClick(msg);}}
                                >
                                  <span className="reaction-emoji-icon">{topReaction.emoji}</span>
                                  <span className="reaction-count">{topReaction.users.length}</span>
                                  {totalCount > topReaction.users.length && (
                                    <>
                                      <span style={{ margin: '0 4px', opacity: 0.6 }}>👤</span>
                                      <span className="reaction-count">{totalCount}</span>
                                    </>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      
                      {/* 메시지 롱탭/우클릭 메뉴 (시스템 메시지 제외) */}
                      {msg.fromUid !== 'system' && contextMenu && contextMenu.msgId === msg.id && (
                        <div className="chat-context-menu" style={{top: contextMenu.y, left: contextMenu.x}}>
                          <button onClick={() => handleCopy(msg)}><Copy size={16}/> 복사</button>
                          {user && msg.fromUid === user.uid && <button onClick={() => handleDelete(msg)}><Trash2 size={16}/> 삭제</button>}
                          {user && (user.role === '리더' || user.role === '운영진') && msg.fromUid !== user.uid && <button onClick={() => handleMessageDelete(msg)}><Trash2 size={16}/> 삭제</button>}
                          <button onClick={() => handleReport(msg)}><Flag size={16}/> 신고</button>
                          <button onClick={() => handleReply(msg)}><CornerUpLeft size={16}/> 답장</button>
                          {user && (user.role === '리더' || user.role === '운영진') && <button onClick={() => handleAnalysis(msg)}><BarChart3 size={16}/> 분석</button>}
                        </div>
                      )}
                      
                      {/* 메시지 내 파일/이미지/동영상 표시 */}
                      {msg.fileUrl && (
                        <div className="chat-message-file" style={{
                          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
                          marginTop: '4px'
                        }}>
                          {msg.fileType?.startsWith('image/') ? (
                            <img src={msg.fileUrl} alt="img" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8 }} />
                          ) : msg.fileType?.startsWith('video/') ? (
                            <video src={msg.fileUrl} controls style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8 }} />
                          ) : (
                            <a href={msg.fileUrl} download={msg.fileName} className="chat-file-download">{msg.fileName || '파일 다운로드'}</a>
                          )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="chat-input-bar" style={{ boxSizing: 'border-box', width: '100%' }}>
              <label className="chat-attach-btn">
                <input
                  id="chat-file-input"
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp3,.wav,.mov,.mp4"
                  onChange={handleFileChange}
                />
                <Paperclip size={isMobileView ? 18 : 20} />
              </label>
              <textarea
                value={newMessage}
                onChange={e => {
                  setNewMessage(e.target.value);
                  // 타이핑 인디케이터 (단순화된 버전)
                  if (e.target.value.length > 0) {
                    console.log('사용자가 타이핑 중...');
                  }
                }}
                placeholder="메시지를 입력하세요"
                onKeyDown={handleMessageKeyDown}
                onCompositionStart={() => {}}
                onCompositionEnd={() => {}}
                onCompositionUpdate={() => {}}
                spellCheck={false}
                autoComplete="off"
                rows={1}
                aria-label={isAnnouncementMode ? "공지사항 입력창" : "메시지 입력창"}
                aria-describedby="message-input-help"
                disabled={!user || (isAnnouncementMode && bannedUsers.includes(user.uid))}
                style={{ 
                  flex: 1, 
                  minWidth: 0,
                  boxSizing: 'border-box',
                  resize: 'none',
                  overflow: 'auto',
                  minHeight: '38px',
                  maxHeight: '120px',
                  lineHeight: '1.4'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
              />
              <div id="message-input-help" style={{ display: 'none' }}>
                Enter로 메시지 전송, Shift+Enter로 줄바꿈, Ctrl+K로 채팅방 검색
              </div>
              <button 
                onClick={filePreview || fileName ? handleSendWithFile : handleSend} 
                className="send-btn"
                disabled={isSending || isUploading}
                aria-label={`메시지 전송 ${isSending || isUploading ? '(전송 중...)' : ''}`}
                title="메시지 전송 (Enter 또는 Ctrl+Enter)"
                style={{
                  opacity: (isSending || isUploading) ? 0.6 : 1,
                  cursor: (isSending || isUploading) ? 'not-allowed' : 'pointer'
                }}
              >
                {(isSending || isUploading) ? (
                  <div style={{
                    width: isMobileView ? 18 : 20,
                    height: isMobileView ? 18 : 20,
                    border: '2px solid transparent',
                    borderTop: '2px solid currentColor',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                ) : (
                <Send size={isMobileView ? 18 : 20} />
                )}
              </button>
            </div>
            {/* 파일 미리보기 */}
            {filePreview && (
              <div className="chat-file-preview">
                {fileType?.startsWith('image/') ? (
                  <img src={filePreview} alt="preview" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8 }} />
                ) : fileType?.startsWith('video/') ? (
                  <video src={filePreview} controls style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8 }} />
                ) : null}
                <span className="chat-file-name">{fileName}</span>
                <button className="chat-file-cancel" onClick={() => { setFilePreview(null); setFileType(null); setFileName(null); (document.getElementById('chat-file-input') as HTMLInputElement).value = ''; }}>×</button>
              </div>
            )}
            {/* 답장 인용 입력창 */}
            {replyTo && (
              <div className="chat-reply-bar">
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* 답장 대상자 - 매우 눈에 띄게 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: '#8A55CC',
                    borderRadius: '8px',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '16px',
                    boxShadow: '0 2px 8px rgba(138, 85, 204, 0.3)'
                  }}>
                    <CornerUpLeft size={18} strokeWidth={3} color="white" />
                    <span>💬 {replyTo.fromNickname || '사용자'}에게 답장</span>
                  </div>
                  
                  {/* 원본 메시지 - 완전히 다른 색상으로 명확하게 구분 */}
                  <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #374151 0%, #4B5563 100%)',
                    borderRadius: '12px',
                    border: '3px solid #374151',
                    position: 'relative',
                    boxShadow: '0 4px 12px rgba(55, 65, 81, 0.3)'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '-8px',
                      left: '16px',
                      background: '#374151',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      📝 원본 메시지
                    </div>
                    <div style={{
                      color: '#F9FAFB',
                      fontSize: '16px',
                      lineHeight: '1.5',
                      fontWeight: '500',
                      marginTop: '8px',
                      fontStyle: 'italic'
                    }}>
                      "{replyTo.content.length > 60 
                        ? replyTo.content.substring(0, 60) + '...' 
                        : replyTo.content}"
                    </div>
                  </div>
                </div>
                <button className="chat-reply-cancel" onClick={()=>setReplyTo(null)}>×</button>
              </div>
            )}
            {/* 신고 다이얼로그 */}
            {reportTarget && (
              <div className="chat-report-modal">
                <div className="chat-report-content">
                  <h3>메시지 신고</h3>
                  <div className="chat-report-quote">{reportTarget.content}</div>
                  <textarea 
                    value={reportReason} 
                    onChange={e=>setReportReason(e.target.value)} 
                    placeholder="신고 사유를 입력하세요... (Shift+Enter로 줄바꿈)"
                    rows={3}
                    style={{
                      resize: 'none',
                      overflow: 'hidden',
                      minHeight: '80px',
                      maxHeight: '200px',
                      lineHeight: '1.4',
                      fontFamily: 'inherit'
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(Math.max(target.scrollHeight, 80), 200) + 'px';
                    }}
                  />
                  <div className="chat-report-actions">
                    <button onClick={()=>setReportTarget(null)}>취소</button>
                    <button onClick={handleReportSubmit} disabled={!reportReason.trim()}>신고</button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 리액션 상세 모달 */}
            {reactionModal && (
              <div className="chat-report-modal" onClick={() => setReactionModal(null)}>
                <div className="chat-reaction-detail-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-reaction-header">
                    <h3>😊 리액션 상세</h3>
                    <button 
                      onClick={() => setReactionModal(null)}
                      className="chat-reaction-close"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="chat-reaction-content">
                    {reactionModal.reactions.map((reaction, index) => (
                      <div key={index} className="reaction-detail-section">
                        <div className="reaction-detail-header">
                          <span className="reaction-detail-emoji">{reaction.emoji}</span>
                          <span className="reaction-detail-count">{reaction.users.length}명</span>
                        </div>
                        <div className="reaction-detail-users">
                          {reaction.users.map((userId: string, userIndex: number) => {
                            // 사용자 정보 안전하게 가져오기
                            const userProfile = userProfiles[userId] || 
                              announcementParticipants.find(p => p.uid === userId) ||
                              {};
                            
                            const nickname = userProfile.nickname || 
                              (userId === user?.uid ? user.nickname : null) ||
                              `사용자${userId.slice(-4)}`;
                            
                            const profileImageUrl = userProfile.profileImageUrl || 
                              (userId === user?.uid ? user.profileImageUrl : null);
                              
                            return (
                              <div key={userIndex} className="reaction-detail-user">
                                <div className="reaction-user-profile">
                                  {profileImageUrl ? (
                                    <img 
                                      src={profileImageUrl} 
                                      alt="profile"
                                      style={{width: '24px', height: '24px', borderRadius: '50%'}}
                                    />
                                  ) : (
                                    <div style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      backgroundColor: '#8A55CC',
                                      color: 'white',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '12px',
                                      fontWeight: '600'
                                    }}>
                                      {nickname?.charAt(0) || '?'}
                                    </div>
                                  )}
                                </div>
                                <span className="reaction-user-nickname">
                                  {nickname}
                                  {userId === user?.uid && (
                                    <span style={{color: '#8A55CC', fontSize: '11px', marginLeft: '4px'}}>(나)</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 메시지 분석 모달 */}
            {analysisTarget && analysisData && (
              <div className="chat-report-modal" onClick={() => {setAnalysisTarget(null); setAnalysisData(null); setShowReadUsers(false);}}>
                <div className="chat-analysis-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-analysis-header">
                    <h3><BarChart3 size={20}/> 메시지 분석</h3>
                    <button 
                      onClick={() => {setAnalysisTarget(null); setAnalysisData(null); setShowReadUsers(false);}}
                      className="chat-analysis-close"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="chat-analysis-content">
                    {/* 메시지 정보 */}
                    <div className="analysis-section">
                      <h4>📝 메시지 정보</h4>
                      <div className="analysis-item">
                        <span className="analysis-label">발신자:</span>
                        <span className="analysis-value">{analysisData.messageInfo.sender}</span>
                      </div>
                      <div className="analysis-item">
                        <span className="analysis-label">시간:</span>
                        <span className="analysis-value">{analysisData.contextAnalysis.timeAgo}</span>
                      </div>
                      <div className="analysis-item">
                        <span className="analysis-label">글자 수:</span>
                        <span className="analysis-value">{analysisData.contextAnalysis.messageLength}자</span>
                      </div>
                      <div className="analysis-item">
                        <span className="analysis-label">단어 수:</span>
                        <span className="analysis-value">{analysisData.contextAnalysis.wordCount}개</span>
                      </div>
                    </div>

                    {/* 메시지 내용 */}
                    <div className="analysis-section">
                      <h4>💬 메시지 내용</h4>
                      <div className="analysis-message-content">
                        {analysisData.messageInfo.content}
                      </div>
                    </div>

                    {/* 컨텍스트 분석 */}
                    <div className="analysis-section">
                      <h4>🔍 컨텍스트 분석</h4>
                      <div className="analysis-tags">
                        {analysisData.contextAnalysis.hasEmoji && <span className="analysis-tag emoji">이모지 포함</span>}
                        {analysisData.contextAnalysis.hasUrl && <span className="analysis-tag url">링크 포함</span>}
                        {analysisData.messageInfo.hasFile && <span className="analysis-tag file">파일 첨부</span>}
                        <span className={`analysis-tag sentiment ${analysisData.contextAnalysis.sentiment}`}>
                          {analysisData.contextAnalysis.sentiment === 'positive' ? '😊 긍정적' : 
                           analysisData.contextAnalysis.sentiment === 'negative' ? '😔 부정적' : '😐 중립적'}
                        </span>
                      </div>
                    </div>

                    {/* 읽음 상태 */}
                    {analysisData.readStatus && (
                      <div className="analysis-section">
                        <h4 style={{
                          color: '#374151',
                          fontSize: '16px',
                          fontWeight: '700',
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          👀 읽음 상태 분석
                        </h4>
                        <div className="analysis-read-status">
                          <div 
                            className="read-status-summary clickable" 
                            onClick={() => setShowReadUsers(!showReadUsers)}
                            title="클릭하여 상세 목록 보기"
                            style={{
                              cursor: 'pointer',
                              background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                              border: '1px solid #E2E8F0',
                              borderRadius: '10px',
                              padding: '16px',
                              transition: 'all 0.2s ease',
                              marginBottom: '16px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div className="read-status-bar" style={{
                              width: '100%',
                              height: '8px',
                              backgroundColor: '#E5E7EB',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              marginBottom: '12px'
                            }}>
                              <div 
                                className="read-status-fill" 
                                style={{
                                  width: `${analysisData.readStatus.readPercentage}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease'
                                }}
                              ></div>
                            </div>
                            <div className="read-status-info" style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span className="read-status-text" style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151'
                              }}>
                                📊 읽음: {analysisData.readStatus.readCount}명 | 미읽음: {analysisData.readStatus.totalCount - analysisData.readStatus.readCount}명
                                <span style={{
                                  color: '#10B981',
                                  marginLeft: '8px',
                                  fontSize: '13px'
                                }}>
                                ({analysisData.readStatus.readPercentage}%)
                              </span>
                              </span>
                              <span className="read-status-toggle" style={{
                                fontSize: '12px',
                                color: '#6B7280',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {showReadUsers ? '▼ 숨기기' : '▶ 상세보기'}
                              </span>
                            </div>
                          </div>
                          
                          {/* 사용자 목록 (토글 가능) */}
                          {showReadUsers && (
                            <div style={{
                              background: '#FAFBFC',
                              borderRadius: '12px',
                              padding: '16px',
                              border: '1px solid #E5E7EB'
                            }}>
                              {/* 전체 상태 요약 */}
                              <div style={{
                                background: 'white',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '16px',
                                border: '1px solid #E5E7EB',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '16px'
                                }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#10B981' }}>
                                      {analysisData.readStatus.readUsers?.length || 0}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '500' }}>
                                      읽음
                                    </div>
                                  </div>
                                  <div style={{
                                    width: '1px',
                                    height: '30px',
                                    background: '#E5E7EB'
                                  }} />
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444' }}>
                                      {analysisData.readStatus.unreadUsers?.length || 0}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '500' }}>
                                      미읽음
                                    </div>
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: '24px',
                                  color: analysisData.readStatus.readPercentage >= 80 ? '#10B981' : 
                                         analysisData.readStatus.readPercentage >= 50 ? '#F59E0B' : '#EF4444'
                                }}>
                                  {analysisData.readStatus.readPercentage >= 80 ? '✅' : 
                                   analysisData.readStatus.readPercentage >= 50 ? '⚠️' : '❌'}
                                </div>
                              </div>

                              {/* 읽은 사용자 목록 */}
                                <div className="read-users-section">
                                <h5 style={{
                                  color: '#10B981',
                                  margin: '16px 0 12px 0',
                                  fontSize: '14px',
                                  fontWeight: '700',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}>
                                  ✅ 읽은 사용자 ({analysisData.readStatus.readUsers?.length || 0}명)
                                </h5>
                                
                                {analysisData.readStatus.readUsers && analysisData.readStatus.readUsers.length > 0 ? (
                                  <div className="read-users-list" style={{
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    background: '#F0FDF4',
                                    borderRadius: '8px',
                                    padding: '8px',
                                    border: '1px solid #BBF7D0'
                                  }}>
                                    {analysisData.readStatus.readUsers.map((readUser: any, index: number) => {
                                      // 사용자 정보 안전하게 가져오기
                                      const userProfile = userProfiles[readUser.uid] || 
                                        announcementParticipants.find(p => p.uid === readUser.uid) ||
                                        {};
                                      
                                      const nickname = readUser.nickname || userProfile.nickname || 
                                        (readUser.uid === user?.uid ? user.nickname : null) ||
                                        `사용자${readUser.uid?.slice(-4) || ''}`;
                                      
                                      const role = readUser.role || userProfile.role || '일반';
                                      const profileImageUrl = readUser.profileImageUrl || userProfile.profileImageUrl || 
                                        (readUser.uid === user?.uid ? user.profileImageUrl : null);
                                      
                                      return (
                                        <div key={index} className="read-user-item read" style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '10px 12px',
                                          margin: '4px 0',
                                          background: 'white',
                                          borderRadius: '6px',
                                          border: '1px solid #D1FAE5',
                                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                        }}>
                                          <div className="user-info" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            flex: 1
                                          }}>
                                            {/* 프로필 이미지 또는 아바타 */}
                                            <div style={{
                                              width: '32px',
                                              height: '32px',
                                              borderRadius: '50%',
                                              overflow: 'hidden',
                                              backgroundColor: '#10B981',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              flexShrink: 0
                                            }}>
                                              {profileImageUrl ? (
                                                <img 
                                                  src={profileImageUrl} 
                                                  alt="프로필" 
                                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                              ) : (
                                                <span style={{ 
                                                  color: 'white', 
                                                  fontWeight: 'bold',
                                                  fontSize: '14px'
                                                }}>
                                                  {nickname?.charAt(0) || '?'}
                                                </span>
                                              )}
                                        </div>
                                            
                                            <div style={{ flex: 1 }}>
                                              <div style={{
                                                display: 'flex',
                                                alignItems: 'center', 
                                                gap: '6px',
                                                marginBottom: '2px'
                                              }}>
                                                <span className="user-nickname" style={{
                                                  fontWeight: '600',
                                                  color: '#374151',
                                                  fontSize: '13px'
                                                }}>
                                                  {nickname}
                                                  {readUser.uid === user?.uid && (
                                                    <span style={{color: '#10B981', fontSize: '11px', marginLeft: '4px'}}>(나)</span>
                                                  )}
                                                </span>
                                                {role && role !== '일반' && (
                                                  <span className="user-role" style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '8px',
                                                    backgroundColor: role === '리더' ? '#FFD700' : 
                                                                  role === '운영진' ? '#FF6B35' : 
                                                                  role === '부운영진' ? '#8A55CC' : '#E5E7EB',
                                                    color: role === '리더' ? '#8B5A00' :
                                                          role === '운영진' ? 'white' :
                                                          role === '부운영진' ? 'white' : '#6B7280',
                                                    fontWeight: '600'
                                                  }}>
                                                    {role}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <span className="read-time" style={{
                                            fontSize: '11px',
                                            color: '#10B981',
                                            fontWeight: '500',
                                            whiteSpace: 'nowrap',
                                            marginLeft: '8px'
                                          }}>
                                            {readUser.readAt ? new Date(readUser.readAt.seconds * 1000).toLocaleString('ko-KR', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          }) : '시간 미상'}
                                        </span>
                                      </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{
                                    background: '#F9FAFB',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    color: '#6B7280',
                                    border: '1px solid #E5E7EB'
                                  }}>
                                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
                                    <div style={{ fontSize: '13px', fontWeight: '500' }}>
                                      아직 아무도 이 메시지를 읽지 않았습니다.
                                  </div>
                                </div>
                              )}
                              </div>
                              
                              {/* 안 읽은 사용자 목록 */}
                              {analysisData.readStatus.unreadUsers && analysisData.readStatus.unreadUsers.length > 0 && (
                                <div className="read-users-section">
                                  <h5 style={{
                                    color: '#EF4444',
                                    margin: '16px 0 12px 0',
                                    fontSize: '14px',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}>
                                    ❌ 안 읽은 사용자 ({analysisData.readStatus.unreadUsers.length}명)
                                  </h5>
                                  <div className="read-users-list" style={{
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    background: '#FEF2F2',
                                    borderRadius: '8px',
                                    padding: '8px',
                                    border: '1px solid #FECACA'
                                  }}>
                                    {analysisData.readStatus.unreadUsers.map((unreadUser: any, index: number) => {
                                      // 사용자 정보 안전하게 가져오기
                                      const userProfile = userProfiles[unreadUser.uid] || 
                                        announcementParticipants.find(p => p.uid === unreadUser.uid) ||
                                        {};
                                      
                                      const nickname = unreadUser.nickname || userProfile.nickname || 
                                        (unreadUser.uid === user?.uid ? user.nickname : null) ||
                                        `사용자${unreadUser.uid?.slice(-4) || ''}`;
                                      
                                      const role = unreadUser.role || userProfile.role || '일반';
                                      const profileImageUrl = unreadUser.profileImageUrl || userProfile.profileImageUrl || 
                                        (unreadUser.uid === user?.uid ? user.profileImageUrl : null);
                                      
                                      return (
                                        <div key={index} className="read-user-item unread" style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '10px 12px',
                                          margin: '4px 0',
                                          background: 'white',
                                          borderRadius: '6px',
                                          border: '1px solid #FCA5A5',
                                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                        }}>
                                          <div className="user-info" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            flex: 1
                                          }}>
                                            {/* 프로필 이미지 또는 아바타 */}
                                            <div style={{
                                              width: '32px',
                                              height: '32px',
                                              borderRadius: '50%',
                                              overflow: 'hidden',
                                              backgroundColor: '#EF4444',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              flexShrink: 0
                                            }}>
                                              {profileImageUrl ? (
                                                <img 
                                                  src={profileImageUrl} 
                                                  alt="프로필" 
                                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                              ) : (
                                                <span style={{ 
                                                  color: 'white', 
                                                  fontWeight: 'bold',
                                                  fontSize: '14px'
                                                }}>
                                                  {nickname?.charAt(0) || '?'}
                                                </span>
                                              )}
                                        </div>
                                            
                                            <div style={{ flex: 1 }}>
                                              <div style={{
                                                display: 'flex',
                                                alignItems: 'center', 
                                                gap: '6px',
                                                marginBottom: '2px'
                                              }}>
                                                <span className="user-nickname" style={{
                                                  fontWeight: '600',
                                                  color: '#374151',
                                                  fontSize: '13px'
                                                }}>
                                                  {nickname}
                                                  {unreadUser.uid === user?.uid && (
                                                    <span style={{color: '#EF4444', fontSize: '11px', marginLeft: '4px'}}>(나)</span>
                                                  )}
                                                </span>
                                                {role && role !== '일반' && (
                                                  <span className="user-role" style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '8px',
                                                    backgroundColor: role === '리더' ? '#FFD700' : 
                                                                  role === '운영진' ? '#FF6B35' : 
                                                                  role === '부운영진' ? '#8A55CC' : '#E5E7EB',
                                                    color: role === '리더' ? '#8B5A00' :
                                                          role === '운영진' ? 'white' :
                                                          role === '부운영진' ? 'white' : '#6B7280',
                                                    fontWeight: '600'
                                                  }}>
                                                    {role}
                                                  </span>
                                                )}
                                      </div>
                                            </div>
                                          </div>
                                          
                                          <span className="unread-status" style={{
                                            fontSize: '11px',
                                            color: '#EF4444',
                                            fontWeight: '600',
                                            background: '#FEE2E2',
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            whiteSpace: 'nowrap',
                                            marginLeft: '8px'
                                          }}>
                                            미읽음
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 리액션 */}
                    {analysisData.reactions.length > 0 && (
                      <div className="analysis-section">
                        <h4>😊 리액션</h4>
                        <div className="analysis-reactions">
                          {analysisData.reactions.map((reaction: any, index: number) => (
                            <div key={index} className="analysis-reaction">
                              <span className="reaction-emoji">{reaction.emoji}</span>
                              <span className="reaction-count">{reaction.users.length}명</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 관련 메시지 */}
                    <div className="analysis-section">
                      <h4>🔗 관련 정보</h4>
                      <div className="analysis-item">
                        <span className="analysis-label">같은 사용자 메시지:</span>
                        <span className="analysis-value">{analysisData.relatedMessages.userMessages.length}개</span>
                      </div>
                      <div className="analysis-item">
                        <span className="analysis-label">연관 메시지:</span>
                        <span className="analysis-value">{analysisData.relatedMessages.replyMessages.length}개</span>
                      </div>
                      <div className="analysis-item">
                        <span className="analysis-label">전체 메시지:</span>
                        <span className="analysis-value">{analysisData.relatedMessages.totalCount}개</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* 참여자 목록 모달 */}
            {showParticipants && (
              <div 
                className="chat-report-modal"
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: isMobileView ? '15px' : '20px',
                  boxSizing: 'border-box'
                }}
                onClick={() => setShowParticipants(false)}
              >
                <div 
                  className="chat-report-content" 
                  style={{
                    maxWidth: isMobileView ? 'calc(100% - 30px)' : '480px',
                    maxHeight: isMobileView ? '85vh' : '600px',
                    width: '100%',
                    backgroundColor: 'white',
                    borderRadius: isMobileView ? '12px' : '16px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
                    overflow: 'hidden',
                    position: 'relative',
                    margin: isMobileView ? '0 auto' : '0',
                    boxSizing: 'border-box'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: isMobileView ? '16px 16px 8px 16px' : '20px 20px 10px 20px',
                    borderBottom: '1px solid #E5E7EB'
                  }}>
                    <h3 style={{margin: 0, color: '#FF6B35', fontSize: '18px', fontWeight: 'bold'}}>공지방 참여자 목록</h3>
                    <button 
                      onClick={() => setShowParticipants(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: '#999',
                        padding: '0',
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{
                    maxHeight: isMobileView ? '50vh' : '400px',
                    overflowY: 'auto',
                    padding: '0',
                    margin: '0'
                  }}>
                    {announcementParticipants.length === 0 ? (
                      <div style={{
                        textAlign: 'center', 
                        color: '#9CA3AF', 
                        padding: '40px 20px',
                        fontSize: '16px',
                        fontWeight: '500'
                      }}>
                        <div style={{fontSize: '48px', marginBottom: '16px'}}>👥</div>
                        참여자가 없습니다.
                      </div>
                    ) : (
                      announcementParticipants.map(participant => (
                        <div key={participant.uid} style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: isMobileView ? '14px 16px' : '16px 20px',
                          borderBottom: '1px solid #F3F4F6',
                          gap: '12px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        onKeyDown={(e) => handleRoomKeyDown(e, participant)}
                        >
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: '#8A55CC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {participant.profileImageUrl ? (
                              <img 
                                src={participant.profileImageUrl} 
                                alt="프로필" 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <span style={{ color: 'white', fontWeight: 'bold' }}>
                                {participant.nickname?.charAt(0) || 'U'}
                              </span>
                            )}
                          </div>
                                                     <div style={{flex: 1}}>
                             <div style={{fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'}}>
                               <span>{participant.nickname}</span>
                               {participant.role && participant.role !== '일반' && (
                                 <span style={{
                                   fontSize: '11px',
                                   padding: '2px 6px',
                                   borderRadius: '10px',
                                   backgroundColor: participant.role === '리더' ? '#FFD700' : 
                                                 participant.role === '운영진' ? '#FF6B35' : 
                                                 participant.role === '부운영진' ? '#8A55CC' : '#E5E7EB',
                                   color: participant.role === '리더' ? '#8B5A00' :
                                         participant.role === '운영진' ? 'white' :
                                         participant.role === '부운영진' ? 'white' : '#6B7280',
                                   fontWeight: '600'
                                 }}>
                                   {participant.role}
                                 </span>
                               )}
                               {participant.uid === user?.uid && (
                                 <span style={{color: '#8A55CC', fontSize: '12px'}}>(나)</span>
                               )}
                             </div>
                           </div>
                          {participant.uid !== user?.uid && (() => {
                            // 현재 사용자 권한 확인
                            const currentUserParticipant = announcementParticipants.find(p => p.uid === user?.uid);
                            const currentUserRole = currentUserParticipant?.role || '일반';
                            
                            // 권한 체크: 리더 > 운영진 > 부운영진 > 일반
                            const canKick = 
                              currentUserRole === '리더' || // 리더는 모든 사람 내보내기 가능
                              (currentUserRole === '운영진' && participant.role !== '리더') || // 운영진은 리더 제외 내보내기 가능
                              (currentUserRole === '부운영진' && participant.role !== '리더' && participant.role !== '운영진'); // 부운영진은 일반 사용자만 내보내기 가능
                            
                            return canKick;
                          })() && (
                            <button
                              onClick={() => {
                                if (window.confirm(`${participant.nickname} 사용자를 공지방에서 내보내시겠습니까?`)) {
                                  handleKickUser(participant);
                                }
                              }}
                              style={{
                                background: '#EF4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '8px 16px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DC2626'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EF4444'}
                            >
                              내보내기
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{
                    padding: isMobileView ? '14px 16px' : '16px 20px',
                    textAlign: 'center', 
                    color: '#666', 
                    fontSize: '14px',
                    backgroundColor: '#F9FAFB',
                    borderTop: '1px solid #E5E7EB',
                    fontWeight: '500'
                  }}>
                    총 {announcementParticipants.length}명이 참여중입니다.
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="chat-placeholder">채팅방을 선택하세요.</div>
        )}
      </div>
      
      {/* 읽음 상태 모달 */}
      <ReadStatusModal
        isOpen={readStatusModal.isOpen}
        onClose={handleCloseReadStatusModal}
        readStatus={readStatusModal.readStatus}
        messageContent={readStatusModal.messageContent}
      />
      </div>
    </div>
  );
};

export default Messages; 