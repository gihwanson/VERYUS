import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp, orderBy, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SUPER_ADMIN_NICKNAMES, GRADE_SYSTEM } from './AdminTypes';
import { getGradeEmoji } from '../utils/gradeDisplay';
import {
  loadPracticeRoomAlwaysOpenSettings,
  isDateInAlwaysOpenPeriod,
  ALWAYS_OPEN_NOTICE,
  type PracticeRoomAlwaysOpenSettings,
} from '../utils/practiceRoomAlwaysOpen';
import {
  canBookDateUnderTicketing,
  formatDateYmdKst,
  getBookableWeekRangeForDate,
  getTicketingStatusMessage,
  isTargetDateUnderTicketing,
  isTicketingNonBookableWeekday,
  isUnbookedSlotWalkInOpen,
  loadPracticeRoomTicketingSettings,
  parseYmdToLocalDate,
  TICKETING_NON_BOOKABLE_NOTICE,
  TICKETING_WALKIN_NOTICE,
  type PracticeRoomTicketingSettings,
} from '../utils/practiceRoomTicketing';
import { getMaxHoursByParticipantCount, SHOW_PRACTICE_ROOM_CHECK_IN_UI } from '../utils/practiceRoomBookingRules';
import {
  countWeeklyParticipationsByNickname,
  fetchConfirmedReservationsInWeek,
  getParticipationWeekRange,
  shouldUseTicketingParticipationRules,
  validateTicketingParticipationBooking,
} from '../utils/practiceRoomWeeklyParticipation';
import {
  canStealPendingReservation,
  confirmDuePendingReservations,
  describeRelativeBookingPriority,
  formatSlotReservationLabel,
  getActivePriorityWindow,
  getPriorityRankNumber,
  getReservationPhaseLabel,
  getReservationBlockHours,
  getSlotMergeInfo,
  getSundayPendingBannerText,
  isPracticeRoomAdminPriorityUser,
  isSundayPendingBookingWindow,
  loadPriorityRankingForWindow,
  pickLeadingReservation,
  reservationHasAdminPriority,
  sortReservationsForDisplay,
  type PriorityRankEntry,
  type VoteTallyWindow,
} from '../utils/practiceRoomVotePriority';
import { NotificationService } from '../utils/notificationService';
import NicknameSuggestInput, {
  findInvalidMemberNicknames,
  normalizeMemberNicknames,
} from './NicknameSuggestInput';
import { getUserMentions, type UserMention } from '../utils/getUserMentions';
import { Calendar, Clock, User, X, ChevronLeft, ChevronRight, Info, RefreshCw, LogIn, LogOut, Users, Music2, Settings } from 'lucide-react';
interface Reservation {
  id: string;
  userId: string;
  userDisplayName: string;
  members?: string[];
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalDuration?: number;
  purpose?: string;
  status: 'confirmed' | 'pending' | 'outbid' | 'cancelled';
  reservationGroup?: string;
  isFirstSlot?: boolean;
  createdAt: any;
  priorityVoteCount?: number;
  priorityRank?: number;
  /** 관리자 예약 — 무조건 1순위 */
  adminPriority?: boolean;
}

interface TimeSlot {
  time: string;
  endTime: string;
  isAvailable: boolean;
  isPast: boolean;
  isBlocked: boolean;
  isException?: boolean; // 규칙 예외 허용
  isWalkInOpen?: boolean;
  isTicketingBlock?: boolean;
  /** 일요일 대기 예약을 우선권으로 뺏을 수 있는지 */
  canSteal?: boolean;
  blockReason?: string;
  blockedBy?: string;
  blockId?: string;
  /** 현재 선두 예약 */
  reservation?: Reservation;
  /** 이 시간대에 예약한 모든 멤버 (선두 + 밀린 사람 포함) */
  reservations?: Reservation[];
}

interface BlockedSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  blockedBy: string;
  blockedAt: any;
  isException?: boolean; // true = 규칙 무시하고 예약 허용
}

interface BlockingRule {
  id: string;
  name: string;
  weekdays: number[];
  startDate: string;
  endDate?: string;
  reason: string;
  isActive: boolean;
  createdBy: string;
  createdAt: any;
}

interface CheckIn {
  id: string;
  userId: string;
  userNickname: string;
  checkInTime: any;
  checkOutTime?: any;
  status: 'checked_in' | 'checked_out';
  createdAt: any;
}

const PracticeRoomBookingNotebook: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [bookingDate, setBookingDate] = useState<Date | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showAdminActionModal, setShowAdminActionModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [blockingRules, setBlockingRules] = useState<BlockingRule[]>([]);
  const [alwaysOpenSettings, setAlwaysOpenSettings] = useState<PracticeRoomAlwaysOpenSettings | null>(null);
  const [ticketingSettings, setTicketingSettings] = useState<PracticeRoomTicketingSettings | null>(null);
  const [memberCandidates, setMemberCandidates] = useState<UserMention[]>([]);
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState(1);
  const [maxAvailableDuration, setMaxAvailableDuration] = useState<number>(1);
  const [members, setMembers] = useState<string[]>([]);
  const [memberInput, setMemberInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const isBookingInProgress = useRef(false); // 예약 진행 중 플래그
  const lastSlotInteractionAtRef = useRef(0); // 터치/클릭 중복 실행 방지
  const [isAdmin, setIsAdmin] = useState(false);
  const [dailyUsedHours, setDailyUsedHours] = useState(0);
  const [weeklyReservationCount, setWeeklyReservationCount] = useState(0);
  const [priorityRanking, setPriorityRanking] = useState<PriorityRankEntry[]>([]);
  const [priorityWindow, setPriorityWindow] = useState<VoteTallyWindow | null>(null);
  const [checkedInMembers, setCheckedInMembers] = useState<CheckIn[]>([]);
  const [checkInHistory, setCheckInHistory] = useState<CheckIn[]>([]);
  const [myCheckIn, setMyCheckIn] = useState<CheckIn | null>(null);
  const [showCheckInHistoryModal, setShowCheckInHistoryModal] = useState(false);
  const isUnlimitedUser = Boolean(
    currentUser?.nickname && SUPER_ADMIN_NICKNAMES.includes(currentUser.nickname)
  );
  const isAdminPriorityUser = isPracticeRoomAdminPriorityUser(currentUser) || isUnlimitedUser;
  /** 일요일 티켓팅: 예약자 닉네임/상세 비공개(팀 수만, 관리자 예약만 표시) */
  const hideTicketingReservationIdentities = isSundayPendingBookingWindow();

  const formatSlotOccupancyLabel = (
    reservations: Reservation[] | undefined,
    fallback?: Reservation
  ) =>
    formatSlotReservationLabel(
      reservations || (fallback ? [fallback] : []),
      priorityRanking,
      { hideIdentities: hideTicketingReservationIdentities }
    );

  /** 닉네임 없이 팀 수만 (우선 예약 가능 칸 등) */
  const formatAnonymousSlotOccupancyLabel = (
    reservations: Reservation[] | undefined,
    fallback?: Reservation
  ) =>
    formatSlotReservationLabel(
      reservations || (fallback ? [fallback] : []),
      priorityRanking,
      { hideIdentities: true }
    );

  const getLeadingPriorityHint = (
    reservations: Reservation[] | undefined,
    fallback?: Reservation
  ): string => {
    if (!currentUser?.uid) return '';
    const leading =
      pickLeadingReservation(
        reservations || (fallback ? [fallback] : []),
        priorityRanking
      ) || fallback;
    if (!leading) return '';
    return describeRelativeBookingPriority({
      myUid: currentUser.uid,
      defenderUid: leading.userId,
      ranking: priorityRanking,
      myIsAdminPriority: isAdminPriorityUser,
      defenderIsAdminPriority: reservationHasAdminPriority(leading),
    });
  };

  const hasFirstRoundVoteForBooking = (): boolean => {
    if (!currentUser) return false;
    if (isAdminPriorityUser) return true;
    return priorityRanking.some((entry) => entry.uid === currentUser.uid);
  };

  const NO_FIRST_VOTE_BOOKING_MESSAGE =
    '평가게시판 1차 투표가 없어 예약이 불가합니다.';

  const isCherryGradeUser = () =>
    Boolean(currentUser && getGradeEmoji(currentUser.grade) === GRADE_SYSTEM.CHERRY);

  const CHERRY_GRADE_BOOKING_MESSAGE =
    '🍒 체리 등급 회원은 연습실 예약을 이용할 수 없습니다.\n\n체리 등급을 졸업(딸기 등급 이상)한 후 예약해 주세요.';

  // 연습실 운영 시간 설정 (09:00 ~ 22:00, 1시간 단위)
  const OPEN_TIME = 9;
  const CLOSE_TIME = 22;
  const SLOT_DURATION = 60; // 분
  const MAX_DAILY_HOURS = 3; // 1인당 하루 최대 예약 시간
  const MAX_WEEKLY_RESERVATIONS = 1; // 1인당 주간 최대 예약 횟수
  const AUTO_CHECKOUT_MS = 4 * 60 * 60 * 1000; // 4시간 자동 퇴실
  const CHECK_IN_HISTORY_PREVIEW_LIMIT = 5; // 인라인 미리보기 개수

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    console.log('📦 PracticeRoomBooking - localStorage veryus_user:', userString);
    if (userString) {
      const user = JSON.parse(userString);
      console.log('👤 사용자 정보:', user);
      console.log('  - nickname:', user.nickname);
      console.log('  - "너래" 일치 여부:', user.nickname === '너래');
      setCurrentUser(user);
      // 관리자 체크 (너래 또는 리더/운영진)
      setIsAdmin(
        SUPER_ADMIN_NICKNAMES.includes(user.nickname) ||
          user.role === '리더' ||
          user.role === '운영진'
      );
    }
    
    // 모바일 감지
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    getUserMentions()
      .then(setMemberCandidates)
      .catch(() => setMemberCandidates([]));
  }, []);

  useEffect(() => {
    if (currentUser) {
      console.log('날짜 변경됨, 예약 데이터 로딩:', formatDate(selectedDate));
      void (async () => {
        try {
          await confirmDuePendingReservations();
        } catch (err) {
          console.warn('pending 예약 확정 처리 실패:', err);
        }
        await loadReservations();
        await loadMyReservations();
        await calculateDailyUsedHours();
        await calculateWeeklyReservationCount();
        await loadBlockedSlots();
        await loadBlockingRules();
        await loadAlwaysOpenSettings();
        await loadTicketingSettings();
        await loadPriorityRanking();
      })();
    }
  }, [selectedDate, currentUser]);

  const loadPriorityRanking = async () => {
    try {
      const window = getActivePriorityWindow();
      setPriorityWindow(window);
      const ranking = await loadPriorityRankingForWindow(window);
      setPriorityRanking(ranking);
    } catch (error) {
      console.error('1차 투표 우선권 순위 로딩 실패:', error);
      setPriorityRanking([]);
    }
  };

  // 실시간 입실 현황 로드
  useEffect(() => {
    if (!SHOW_PRACTICE_ROOM_CHECK_IN_UI || !currentUser) return;

    console.log('입실 현황 실시간 구독 시작');
    
    // 인덱스 문제를 완전히 피하기 위해 모든 데이터를 가져온 후 클라이언트에서 필터링 및 정렬
    const q = query(collection(db, 'practiceRoomCheckIn'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allCheckIns: CheckIn[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        allCheckIns.push({
          id: doc.id,
          ...data
        } as CheckIn);
      });

      const getCheckInMillis = (checkInTime: any): number | null => {
        if (!checkInTime) return null;
        if (checkInTime instanceof Timestamp) return checkInTime.toMillis();
        if (checkInTime?.toMillis) return checkInTime.toMillis();
        if (checkInTime?.seconds) return checkInTime.seconds * 1000;
        const parsed = new Date(checkInTime);
        return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
      };

      const isExpired = (checkInTime: any) => {
        const checkInMs = getCheckInMillis(checkInTime);
        if (!checkInMs) return false;
        return Date.now() - checkInMs >= AUTO_CHECKOUT_MS;
      };

      const autoCheckOutExpired = async (expired: CheckIn[]) => {
        if (expired.length === 0) return;
        try {
          await Promise.all(
            expired.map((checkIn) =>
              updateDoc(doc(db, 'practiceRoomCheckIn', checkIn.id), {
                checkOutTime: serverTimestamp(),
                status: 'checked_out'
              })
            )
          );
          console.log('✅ 자동 퇴실 처리:', expired.map(c => c.userNickname).join(', '));
        } catch (error) {
          console.error('자동 퇴실 처리 실패:', error);
        }
      };

      const expiredCheckIns = allCheckIns.filter(
        c => c.status === 'checked_in' && isExpired(c.checkInTime)
      );
      autoCheckOutExpired(expiredCheckIns);

      // 클라이언트에서 입실 중 + 4시간 미만만 필터링
      const checkedInOnly = allCheckIns.filter(
        c => c.status === 'checked_in' && !isExpired(c.checkInTime)
      );
      
      // 입실 시간 기준으로 정렬 (최신순)
      checkedInOnly.sort((a, b) => {
        const timeA = a.checkInTime?.toMillis?.() || a.checkInTime?.seconds * 1000 || 0;
        const timeB = b.checkInTime?.toMillis?.() || b.checkInTime?.seconds * 1000 || 0;
        return timeB - timeA; // 내림차순
      });
      
      setCheckedInMembers(checkedInOnly);

      // 퇴실 완료 기록 (최신 퇴실순)
      const historyOnly = allCheckIns.filter(c => c.status === 'checked_out');
      historyOnly.sort((a, b) => {
        const timeA =
          a.checkOutTime?.toMillis?.() ||
          a.checkOutTime?.seconds * 1000 ||
          a.checkInTime?.toMillis?.() ||
          a.checkInTime?.seconds * 1000 ||
          0;
        const timeB =
          b.checkOutTime?.toMillis?.() ||
          b.checkOutTime?.seconds * 1000 ||
          b.checkInTime?.toMillis?.() ||
          b.checkInTime?.seconds * 1000 ||
          0;
        return timeB - timeA;
      });
      setCheckInHistory(historyOnly);
      
      // 내 입실 상태 확인 (입실 중인 것만)
      const myCheckInData = checkedInOnly.find(c => c.userId === currentUser.uid);
      setMyCheckIn(myCheckInData || null);

      console.log('입실 현황 업데이트:', checkedInOnly.length, '명 / 전체:', allCheckIns.length, '명');
      if (checkedInOnly.length > 0) {
        console.log('입실 중인 멤버:', checkedInOnly.map(c => c.userNickname).join(', '));
      }
    }, (error) => {
      console.error('입실 현황 구독 오류:', error);
      console.error('에러 상세:', error.message);
      // 에러가 발생해도 계속 작동하도록 alert 제거
    });

    return () => {
      console.log('입실 현황 구독 해제');
      unsubscribe();
    };
  }, [currentUser]);

  // 5초마다 자동 새로고침 (로딩 중이 아닐 때만)
  useEffect(() => {
    if (!currentUser) return;
    
    const interval = setInterval(() => {
      if (!loading) {
        console.log('자동 새로고침');
        loadReservations();
        loadMyReservations();
        calculateDailyUsedHours();
        calculateWeeklyReservationCount();
        loadBlockedSlots();
        loadAlwaysOpenSettings();
        loadTicketingSettings();
      } else {
        console.log('예약 처리 중이라 자동 새로고침 생략');
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [currentUser, selectedDate, loading]);

  const loadReservations = async () => {
    try {
      const startDate = getWeekStart(selectedDate);
      const endDate = getWeekEnd(selectedDate);
      
      console.log('예약 로딩 시작:', formatDate(startDate), '~', formatDate(endDate));
      
      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('status', 'in', ['confirmed', 'pending', 'outbid'])
      );
      
      const snapshot = await getDocs(q);
      const allData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Reservation[];
      
      const data = allData.filter(r => {
        return r.date >= formatDate(startDate) && r.date <= formatDate(endDate);
      });
      
      console.log('예약 데이터 로딩됨:', data.length, '건');
      setReservations(data);
    } catch (error) {
      console.error('예약 정보 로딩 실패:', error);
    }
  };

  const loadBlockedSlots = async () => {
    try {
      const startDate = getWeekStart(selectedDate);
      const endDate = getWeekEnd(selectedDate);
      
      console.log('🚫 차단된 시간대 로딩 시작:', formatDate(startDate), '~', formatDate(endDate));
      
      const q = query(collection(db, 'blockedTimeSlots'));
      const snapshot = await getDocs(q);
      
      const allData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlockedSlot[];
      
      // 클라이언트 사이드에서 날짜 필터링
      const data = allData.filter(b => {
        return b.date >= formatDate(startDate) && b.date <= formatDate(endDate);
      });
      
      console.log('🚫 차단된 시간대 로딩됨:', data.length, '건');
      data.forEach(b => {
        console.log(`  - ${b.date} ${b.startTime} (${b.reason})`);
      });
      
      setBlockedSlots(data);
    } catch (error) {
      console.error('차단된 시간대 로딩 실패:', error);
    }
  };

  const loadBlockingRules = async () => {
    try {
      console.log('🔄 차단 규칙 로딩 시작...');
      const q = query(collection(db, 'blockingRules'));
      const snapshot = await getDocs(q);
      
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlockingRule[];
      
      // 활성화된 규칙만 필터링
      const activeRules = data.filter(r => r.isActive);
      
      console.log('🔄 차단 규칙 로딩됨:', activeRules.length, '개');
      activeRules.forEach(r => {
        console.log(`  - ${r.name}: 매주 ${r.weekdays.map((d: number) => ['일','월','화','수','목','금','토'][d]).join(', ')} (${r.reason})`);
      });
      
      setBlockingRules(activeRules);
    } catch (error) {
      console.error('차단 규칙 로딩 실패:', error);
    }
  };

  const loadAlwaysOpenSettings = async () => {
    try {
      const settings = await loadPracticeRoomAlwaysOpenSettings();
      setAlwaysOpenSettings(settings);
    } catch (error) {
      console.error('상시개방 설정 로딩 실패:', error);
    }
  };

  const loadTicketingSettings = async () => {
    try {
      const settings = await loadPracticeRoomTicketingSettings();
      setTicketingSettings(settings);
    } catch (error) {
      console.error('티켓팅 설정 로딩 실패:', error);
    }
  };

  const ticketingStatusMessage = getTicketingStatusMessage(ticketingSettings);
  const usesTicketingWeekNavForDate = (date: Date) =>
    shouldUseTicketingParticipationRules(formatDateYmdKst(date), ticketingSettings);
  const usesTicketingParticipationForSelectedDate = usesTicketingWeekNavForDate(selectedDate);
  const weeklyLimitLabel = usesTicketingParticipationForSelectedDate
    ? '이번 주 예약/참여'
    : '이번 주 예약';
  const weeklyLimitExceededMessage = usesTicketingParticipationForSelectedDate
    ? '이번 주 이미 예약하거나 참여한 기록이 있어 예약할 수 없습니다.'
    : '주에 1회만 예약이 가능합니다.';

  const isAlwaysOpenDate = (date: Date) =>
    isDateInAlwaysOpenPeriod(date, alwaysOpenSettings);

  const selectedDateAlwaysOpen = isAlwaysOpenDate(selectedDate);

  const loadMyReservations = async () => {
    if (!currentUser) return;
    
    try {
      // 단순화된 쿼리 (인덱스 불필요)
      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('userId', '==', currentUser.uid)
      );
      
      const snapshot = await getDocs(q);
      const allData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reservation[];
      
      // 현재 날짜와 시간
      const now = new Date();
      const todayStr = formatDate(now);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // 클라이언트 사이드에서 필터링 및 정렬
      const data = allData
        .filter(r => {
          // 확정·대기 예약만 (취소 제외)
          if (r.status !== 'confirmed' && r.status !== 'pending') return false;
          
          // 예약 날짜가 오늘보다 이전이면 제외
          if (r.date < todayStr) return false;
          
          // 예약 날짜가 오늘이면 종료 시간이 현재 시간보다 이전이면 제외
          if (r.date === todayStr) {
            if (r.endTime <= currentTime) return false;
          }
          
          return true;
        })
        .sort((a, b) => {
          // 날짜순 정렬
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          // 같은 날짜면 시간순 정렬
          return a.startTime.localeCompare(b.startTime);
        });
      
      setMyReservations(data);
    } catch (error) {
      console.error('내 예약 정보 로딩 실패:', error);
    }
  };

  const calculateDailyUsedHours = async (targetDate?: Date) => {
    if (!currentUser) {
      console.log('❌ currentUser 없음');
      return 0;
    }
    
    try {
      const dateToCheck = targetDate || selectedDate;
      const dateStr = formatDate(dateToCheck);
      
      console.log('');
      console.log('🔍 ===== 일일 사용 시간 계산 시작 =====');
      console.log('📅 확인 날짜:', dateStr);
      console.log('👤 사용자:', currentUser.nickname, '(', currentUser.uid, ')');
      
      // 간단한 쿼리: userId만으로 검색 후 클라이언트에서 필터링
      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('userId', '==', currentUser.uid)
      );
      
      const snapshot = await getDocs(q);
      console.log('📊 전체 내 예약 문서 수:', snapshot.docs.length);
      
      // 클라이언트에서 필터링
      const todayReservations = snapshot.docs.filter(doc => {
        const data = doc.data();
        const isToday = data.date === dateStr;
        const isActive = data.status === 'confirmed' || data.status === 'pending';
        
        if (isToday) {
          console.log(`  [${isActive ? '✅' : '❌'}] ${data.startTime} (status: ${data.status})`);
        }
        
        return isToday && isActive;
      });
      
      const totalHours = todayReservations.length;
      
      console.log('');
      console.log('📊 ===== 계산 결과 =====');
      console.log('📊 해당 날짜 예약 슬롯:', totalHours, '개');
      console.log('📊 일일 한도:', MAX_DAILY_HOURS, '시간');
      console.log('📊 남은 시간:', Math.max(0, MAX_DAILY_HOURS - totalHours), '시간');
      console.log('📊 차단 여부:', totalHours >= MAX_DAILY_HOURS ? '🚫 차단!' : '✅ 가능');
      console.log('🔍 ===== 계산 완료 =====');
      console.log('');
      
      // state 업데이트
      if (formatDate(dateToCheck) === formatDate(selectedDate)) {
        setDailyUsedHours(totalHours);
      }
      
      return totalHours;
    } catch (error) {
      console.error('❌ 일일 사용 시간 계산 실패:', error);
      return 0;
    }
  };

  const calculateWeeklyReservationCount = async (targetDate?: Date) => {
    if (!currentUser) return 0;

    try {
      const dateToCheck = targetDate || selectedDate;
      const dateStr = formatDate(dateToCheck);
      const useTicketingParticipation = shouldUseTicketingParticipationRules(
        dateStr,
        ticketingSettings
      );
      const weekRange = getParticipationWeekRange(dateStr, useTicketingParticipation);

      if (useTicketingParticipation) {
        const reservations = await fetchConfirmedReservationsInWeek(weekRange.start, weekRange.end);
        const total = countWeeklyParticipationsByNickname(
          reservations,
          currentUser.nickname || '익명'
        );
        if (formatDate(dateToCheck) === formatDate(selectedDate)) {
          setWeeklyReservationCount(total);
        }
        return total;
      }

      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('userId', '==', currentUser.uid)
      );

      const snapshot = await getDocs(q);
      const weeklyReservations = snapshot.docs.filter((item) => {
        const data = item.data() as Record<string, any>;
        if (data.status !== 'confirmed' && data.status !== 'pending') return false;
        const reservationDate = String(data.date || '');
        return reservationDate >= weekRange.start && reservationDate <= weekRange.end;
      });

      // 1~3시간 연속 예약은 같은 reservationGroup으로 묶여 1회로 계산
      const uniqueGroups = new Set<string>();
      weeklyReservations.forEach((item) => {
        const data = item.data() as Record<string, any>;
        const groupKey =
          typeof data.reservationGroup === 'string' && data.reservationGroup.trim()
            ? data.reservationGroup.trim()
            : `${String(data.date || '')}_${String(data.startTime || '')}`;
        uniqueGroups.add(groupKey);
      });

      const total = uniqueGroups.size;
      if (formatDate(dateToCheck) === formatDate(selectedDate)) {
        setWeeklyReservationCount(total);
      }
      return total;
    } catch (error) {
      console.error('주간 예약 횟수 계산 실패:', error);
      return 0;
    }
  };

  const formatDate = (date: Date): string => formatDateYmdKst(date);

  const getWeekStart = (date: Date): Date => {
    if (usesTicketingWeekNavForDate(date)) {
      const { start } = getBookableWeekRangeForDate(formatDate(date));
      return parseYmdToLocalDate(start);
    }
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const getWeekEnd = (date: Date): Date => {
    if (usesTicketingWeekNavForDate(date)) {
      const { end } = getBookableWeekRangeForDate(formatDate(date));
      return parseYmdToLocalDate(end);
    }
    const start = getWeekStart(date);
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  };

  const isBlockedByRule = (date: Date): { blocked: boolean; reason?: string } => {
    const dateStr = formatDate(date);
    const weekday = date.getDay(); // 0=일, 1=월, ..., 6=토

    // 운영 정책 변경: 일요일은 정기 차단 규칙에서 제외하여 예약 가능
    if (weekday === 0) {
      return { blocked: false };
    }
    
    for (const rule of blockingRules) {
      // 활성화되지 않은 규칙은 건너뛰기
      if (!rule.isActive) continue;
      
      // 시작 날짜 체크
      if (dateStr < rule.startDate) continue;
      
      // 종료 날짜 체크 (설정된 경우)
      if (rule.endDate && dateStr > rule.endDate) continue;
      
      // 요일 체크
      if (rule.weekdays.includes(weekday)) {
        return { blocked: true, reason: rule.reason };
      }
    }
    
    return { blocked: false };
  };

  const generateTimeSlots = (date: Date): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const dateStr = formatDate(date);
    const now = new Date();
    
    // 상시개방 기간이면 모든 슬롯 예약 불가
    const alwaysOpen = isAlwaysOpenDate(date);
    
    // 차단 규칙 체크
    const ruleCheck = isBlockedByRule(date);
    const targetUnderTicketing = isTargetDateUnderTicketing(dateStr, ticketingSettings);
    const ticketingBookCheck = canBookDateUnderTicketing(
      dateStr,
      ticketingSettings,
      now,
      isUnlimitedUser
    );
    
    for (let hour = OPEN_TIME; hour < CLOSE_TIME; hour++) {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      const endTimeStr = `${String(hour + 1).padStart(2, '0')}:00`;
      
      // 과거 시간 체크
      const slotDateTime = new Date(`${dateStr}T${timeStr}`);
      const isPast = slotDateTime < now;
      
      // 해당 날짜와 시간의 예약들 (선두 + 밀린 예약 포함)
      const slotReservations = sortReservationsForDisplay(
        reservations.filter((r) => r.date === dateStr && r.startTime === timeStr),
        priorityRanking
      );
      const reservation = pickLeadingReservation(slotReservations, priorityRanking) || undefined;

      // 관리자(너래·리더·운영진)는 타인 비관리자 예약을 가져갈 수 있음(pending/confirmed).
      // 일반 멤버는 pending만 우선권으로 뺏기 가능.
      const canSteal =
        Boolean(
          reservation &&
            currentUser?.uid &&
            reservation.userId !== currentUser.uid &&
            !reservationHasAdminPriority(reservation) &&
            (isAdminPriorityUser
              ? reservation.status === 'pending' || reservation.status === 'confirmed'
              : reservation.status === 'pending' &&
                canStealPendingReservation({
                  attackerUid: currentUser.uid,
                  defenderUid: reservation.userId,
                  ranking: priorityRanking,
                  attackerIsAdminPriority: false,
                  defenderIsAdminPriority: false,
                }))
        );
      
      // 개별 설정 찾기 (차단 또는 예외 허용)
      const individualSlot = blockedSlots.find(
        b => b.date === dateStr && b.startTime === timeStr
      );
      
      // 차단 여부 결정 (우선순위: 개별 설정 > 규칙)
      let isBlocked = false;
      let blockReason = '';
      let blockedBy = '';
      let blockId = undefined;
      let isException = false;
      let isWalkInOpen = false;
      let isTicketingBlock = false;

      // walk-in: 활성(선두) 예약이 없을 때만
      const slotWalkIn =
        !alwaysOpen &&
        isUnbookedSlotWalkInOpen(
          dateStr,
          Boolean(reservation && reservation.status !== 'outbid'),
          ticketingSettings,
          now,
          isUnlimitedUser
        );
      
      if (alwaysOpen) {
        isBlocked = true;
        blockReason = '상시개방';
        blockedBy = '상시개방 기간';
        isException = false;
      } else if (slotWalkIn) {
        isBlocked = true;
        isWalkInOpen = true;
        blockReason = '자유 이용';
        blockedBy = '티켓팅';
      } else if (
        targetUnderTicketing &&
        !reservation &&
        !ticketingBookCheck.allowed
      ) {
        isBlocked = true;
        isTicketingBlock = true;
        blockReason = isTicketingNonBookableWeekday(dateStr)
          ? '주말 예약 차단'
          : ticketingBookCheck.reason || '예약 오픈 전';
        blockedBy = '티켓팅';
      } else if (individualSlot) {
        // 개별 설정이 있는 경우
        if (individualSlot.isException) {
          // 예외 허용: 규칙 무시하고 예약 가능
          isBlocked = false;
          isException = true;
          blockReason = '규칙 예외 허용';
          blockedBy = individualSlot.blockedBy;
          blockId = individualSlot.id;
          console.log(`✅ 예외 허용 발견: ${dateStr} ${timeStr}`, individualSlot.reason);
        } else {
          // 개별 차단
          isBlocked = true;
          blockReason = individualSlot.reason;
          blockedBy = individualSlot.blockedBy;
          blockId = individualSlot.id;
          console.log(`🚫 개별 차단 발견: ${dateStr} ${timeStr}`, individualSlot.reason);
        }
      } else if (ruleCheck.blocked) {
        // 개별 설정이 없고 규칙에 의한 차단
        isBlocked = true;
        blockReason = ruleCheck.reason || '규칙에 의한 차단';
        blockedBy = '자동 규칙';
        console.log(`🔄 규칙 차단 발견: ${dateStr} ${timeStr}`, ruleCheck.reason);
      }
      
      // 디버깅 로그
      if (reservation) {
        console.log(`예약 발견: ${dateStr} ${timeStr}`, reservation.userDisplayName);
      }
      
      slots.push({
        time: timeStr,
        endTime: endTimeStr,
        isAvailable:
          (!reservation || canSteal) &&
          !isPast &&
          !isBlocked &&
          !alwaysOpen &&
          !isWalkInOpen &&
          ticketingBookCheck.allowed,
        isPast: isPast,
        isBlocked: isBlocked || alwaysOpen,
        isWalkInOpen,
        isTicketingBlock,
        canSteal,
        isException: isException,
        blockReason: blockReason,
        blockedBy: blockedBy,
        blockId: blockId,
        reservation: reservation,
        reservations: slotReservations,
      });
    }
    
    return slots;
  };

  const getWeekDates = (): Date[] => {
    const dates: Date[] = [];
    const start = getWeekStart(selectedDate);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  const checkMaxAvailableDuration = (
    startSlot: TimeSlot,
    date: Date,
    options?: { ignoreBlocks?: boolean; ignoreReservations?: boolean }
  ): number => {
    const slots = generateTimeSlots(date);
    const startIdx = slots.findIndex(s => s.time === startSlot.time);
    if (startIdx === -1) return 0;

    const ignoreBlocks = options?.ignoreBlocks ?? false;
    const ignoreReservations = options?.ignoreReservations ?? false;

    let maxDuration = 0;
    for (let i = 0; i < CLOSE_TIME - OPEN_TIME; i++) {
      const checkIdx = startIdx + i;
      if (checkIdx >= slots.length) break;

      const checkSlot = slots[checkIdx];
      if (checkSlot.isPast) break;
      if (!ignoreBlocks && checkSlot.isBlocked) break;
      if (!ignoreReservations && checkSlot.reservation) break;
      if (!ignoreBlocks && !ignoreReservations && !checkSlot.isAvailable) break;

      maxDuration++;
    }

    return maxDuration;
  };

  const openBookingFlow = async (
    slot: TimeSlot,
    date: Date,
    options?: { ignoreBlocks?: boolean; ignoreReservations?: boolean }
  ) => {
    if (isAlwaysOpenDate(date)) {
      alert(`🟢 ${ALWAYS_OPEN_NOTICE}`);
      return;
    }

    if (!hasFirstRoundVoteForBooking()) {
      alert(NO_FIRST_VOTE_BOOKING_MESSAGE);
      return;
    }

    const bookingCheck = canBookDateUnderTicketing(
      formatDate(date),
      ticketingSettings,
      new Date(),
      isUnlimitedUser
    );
    if (!bookingCheck.allowed) {
      alert(bookingCheck.reason || '현재 예약할 수 없습니다.');
      return;
    }

    if (!isUnlimitedUser && isCherryGradeUser()) {
      alert(CHERRY_GRADE_BOOKING_MESSAGE);
      return;
    }

    if (!isUnlimitedUser) {
      if (weeklyReservationCount >= MAX_WEEKLY_RESERVATIONS) {
        alert(weeklyLimitExceededMessage);
        return;
      }
      const weeklyCount = await calculateWeeklyReservationCount(date);
      if (weeklyCount >= MAX_WEEKLY_RESERVATIONS) {
        alert(weeklyLimitExceededMessage);
        return;
      }

      const currentUsedHours = await calculateDailyUsedHours(date);
      if (currentUsedHours >= MAX_DAILY_HOURS) {
        alert('일일 예약은 3시간까지만 가능합니다.');
        return;
      }
    }

    const maxDuration = checkMaxAvailableDuration(slot, date, options);
    const allowedDuration = isUnlimitedUser
      ? maxDuration
      : Math.min(
          maxDuration,
          MAX_DAILY_HOURS - (await calculateDailyUsedHours(date))
        );

    if (allowedDuration < 1) {
      alert('예약 가능한 연속 시간이 없습니다.');
      return;
    }

    // 멤버 미입력 상태(본인만)에서는 2~3명 규칙과 동일하게 최대 2시간
    const defaultDuration = isUnlimitedUser
      ? allowedDuration
      : Math.min(getMaxHoursByParticipantCount(1), allowedDuration);

    setMaxAvailableDuration(allowedDuration);
    setDuration(defaultDuration);
    setPurpose('');
    setMembers([]);
    setMemberInput('');
    setSelectedTimeSlot({ ...slot });
    setBookingDate(date);
    setShowBookingModal(true);
  };

  const handleTimeSlotClick = async (slot: TimeSlot, date: Date) => {
    // 로딩 중이거나 모달이 열려있으면 클릭 불가
    if (loading || showBookingModal) {
      console.log('예약 처리 중... 대기해주세요');
      return;
    }
    
    // 과거 시간은 클릭 불가
    if (slot.isPast) {
      return;
    }

    if (isAlwaysOpenDate(date)) {
      alert(`🟢 ${ALWAYS_OPEN_NOTICE}`);
      return;
    }

    if (slot.isWalkInOpen && !isUnlimitedUser) {
      alert(`🟢 ${TICKETING_WALKIN_NOTICE}`);
      return;
    }
    
    // 차단된 시간대 클릭
    if (slot.isBlocked) {
      if (slot.isTicketingBlock && !isUnlimitedUser) {
        alert(`🎫 ${slot.blockReason || '현재 예약할 수 없습니다.'}`);
        return;
      }
      if (isUnlimitedUser) {
        await openBookingFlow(slot, date, { ignoreBlocks: true, ignoreReservations: true });
      } else if (isAdmin) {
        // 관리자: 차단 해제 또는 예외 허용
        setSelectedTimeSlot({ ...slot });
        setBookingDate(date);
        setShowBlockModal(true);
      } else {
        // 일반 사용자: 차단 사유만 표시
        alert(`🚫 이 시간대는 차단되었습니다.\n\n사유: ${slot.blockReason || '관리자가 차단함'}`);
      }
      return;
    }
    
    if (slot.isAvailable) {
      console.log('');
      console.log('🖱️ ========== 시간대 클릭 ==========');
      console.log('📅 클릭한 날짜:', formatDate(date));
      console.log('🕐 선택한 시간:', slot.time);

      if (
        slot.canSteal &&
        slot.reservation &&
        !window.confirm(
          (() => {
            const priorityHint = getLeadingPriorityHint(slot.reservations, slot.reservation);
            return (
              `이 시간대를 우선 예약하시겠습니까?\n` +
              `(${formatDate(date)} ${slot.time})\n` +
              (priorityHint ? `${priorityHint}\n` : '') +
              `기존 대기 예약은 밀림 처리되고 알림이 전송됩니다.`
            );
          })()
        )
      ) {
        return;
      }

      // 관리자(너래 제외)는 예약/차단 선택 모달 — 뺏기는 바로 예약 플로우
      if (isAdmin && !isUnlimitedUser && !slot.isException && !slot.canSteal) {
        setSelectedTimeSlot({ ...slot });
        setBookingDate(date);
        setShowAdminActionModal(true);
        return;
      }

      await openBookingFlow(slot, date, slot.canSteal ? { ignoreReservations: true } : undefined);
      console.log('🖱️ ========================================');
      console.log('');
    } else if (slot.reservation) {
      if (isUnlimitedUser) {
        await openBookingFlow(slot, date, { ignoreReservations: true });
      } else if (slot.canSteal || isAdminPriorityUser) {
        setSelectedTimeSlot({ ...slot, canSteal: slot.canSteal || isAdminPriorityUser });
        setBookingDate(date);
        setShowDetailModal(true);
      } else {
        setSelectedTimeSlot(slot);
        setBookingDate(date);
        setShowDetailModal(true);
      }
    }
  };

  const handleSlotActivate = (slot: TimeSlot, date: Date, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const now = Date.now();
    // 모바일에서 touchend + click 이 연속 발생하는 케이스를 1회로 합친다.
    if (now - lastSlotInteractionAtRef.current < 250) return;
    lastSlotInteractionAtRef.current = now;

    if (slot.isPast) return;
    if (!isUnlimitedUser && slot.isAvailable && weeklyReservationCount >= MAX_WEEKLY_RESERVATIONS) {
      window.alert(weeklyLimitExceededMessage);
      return;
    }
    void handleTimeSlotClick(slot, date);
  };

  const calculateEndTime = (startTime: string, durationHours: number): string => {
    const [hour] = startTime.split(':').map(Number);
    const endHour = hour + durationHours;
    return `${String(endHour).padStart(2, '0')}:00`;
  };

  const getTrimmedMembers = () =>
    members.map((member) => member.trim()).filter(Boolean);

  const getBookingParticipantCount = () => 1 + getTrimmedMembers().length;

  const getEffectiveMaxDuration = (participantCount = getBookingParticipantCount()) => {
    if (isUnlimitedUser) return maxAvailableDuration;
    return Math.min(
      maxAvailableDuration,
      getMaxHoursByParticipantCount(participantCount)
    );
  };

  const clampDurationToParticipantLimit = (nextMembers: string[]) => {
    if (isUnlimitedUser) return;
    const count = 1 + nextMembers.map((m) => m.trim()).filter(Boolean).length;
    const effective = getEffectiveMaxDuration(count);
    setDuration((prev) => Math.min(prev, effective));
  };

  const isBookingFormValid = () => {
    if (isUnlimitedUser) return true;
    const trimmedPurpose = purpose.trim();
    const trimmedMembers = getTrimmedMembers();
    return trimmedPurpose.length > 0 && trimmedMembers.length >= 1;
  };

  const handleBooking = async () => {
    if (!selectedTimeSlot || !currentUser || !bookingDate) return;

    if (!hasFirstRoundVoteForBooking()) {
      alert(NO_FIRST_VOTE_BOOKING_MESSAGE);
      return;
    }

    const bookingCheck = canBookDateUnderTicketing(
      formatDate(bookingDate),
      ticketingSettings,
      new Date(),
      isUnlimitedUser
    );
    if (!bookingCheck.allowed) {
      alert(bookingCheck.reason || '현재 예약할 수 없습니다.');
      return;
    }

    if (!isUnlimitedUser && isCherryGradeUser()) {
      alert(CHERRY_GRADE_BOOKING_MESSAGE);
      return;
    }

    const trimmedPurpose = purpose.trim();
    const rawMembers = getTrimmedMembers();
    const trimmedMembers = isUnlimitedUser
      ? rawMembers
      : normalizeMemberNicknames(rawMembers, memberCandidates);

    if (!isUnlimitedUser) {
      const invalidMembers = findInvalidMemberNicknames(rawMembers, memberCandidates);
      if (invalidMembers.length > 0) {
        alert(`등록되지 않은 멤버 닉네임입니다: ${invalidMembers.join(', ')}`);
        return;
      }
    }

    if (!isUnlimitedUser) {
      if (!trimmedPurpose) {
        alert('사용 목적을 입력해주세요.');
        return;
      }

      if (trimmedMembers.length < 1) {
        alert('함께 사용할 멤버를 1명 이상 추가해주세요.\n(2인 이상부터 예약 가능합니다)');
        return;
      }

      const participantCount = 1 + trimmedMembers.length;
      const memberMaxHours = getMaxHoursByParticipantCount(participantCount);
      if (duration > memberMaxHours) {
        alert(
          `예약 인원 ${participantCount}명(본인 포함)은 최대 ${memberMaxHours}시간까지 예약할 수 있습니다.\n\n` +
            '2~3명: 최대 2시간\n4명 이상: 최대 3시간'
        );
        return;
      }
    }
    
    // 이미 예약 진행 중이면 무시
    if (isBookingInProgress.current) {
      console.log('⚠️ 예약 이미 진행 중! 중복 실행 차단');
      return;
    }
    
    isBookingInProgress.current = true;
    setLoading(true);
    
    try {
      const dateStr = formatDate(bookingDate);
      const startHour = parseInt(selectedTimeSlot.time.split(':')[0]);
      
      console.log('');
      console.log('🔒 ========== 예약 버튼 클릭 (잠금 활성화) ==========');
      console.log('📅 예약 날짜:', dateStr);
      console.log('🕐 시작 시간:', selectedTimeSlot.time);
      console.log('⏱️  예약 시간:', duration, '시간');

      const weeklyCount = await calculateWeeklyReservationCount(bookingDate);
      if (!isUnlimitedUser) {
        const useTicketingParticipation = shouldUseTicketingParticipationRules(
          dateStr,
          ticketingSettings
        );

        if (useTicketingParticipation) {
          const weekRange = getParticipationWeekRange(dateStr, true);
          const reservations = await fetchConfirmedReservationsInWeek(weekRange.start, weekRange.end);
          const participationCheck = validateTicketingParticipationBooking({
            bookerNickname: currentUser.nickname || '익명',
            memberNicknames: trimmedMembers,
            reservations,
          });
          if (!participationCheck.allowed) {
            alert(participationCheck.reason || '이번 주 예약/참여 한도로 예약할 수 없습니다.');
            isBookingInProgress.current = false;
            setLoading(false);
            setShowBookingModal(false);
            return;
          }
        } else if (weeklyCount >= MAX_WEEKLY_RESERVATIONS) {
          alert(weeklyLimitExceededMessage);
          isBookingInProgress.current = false;
          setLoading(false);
          setShowBookingModal(false);
          return;
        }
      }
      
      // 예약 직전 일일·주간 한도 재확인 (너래 제외)
      if (!isUnlimitedUser) {
        const currentUsedHours = await calculateDailyUsedHours(bookingDate);
        
        console.log('');
        console.log('⚠️ ===== 최종 검증 시작 =====');
        console.log('📊 현재 사용:', currentUsedHours, '/', MAX_DAILY_HOURS, '시간');
        console.log('📊 예약 요청:', duration, '시간');
        console.log('📊 합계:', currentUsedHours + duration, '/', MAX_DAILY_HOURS, '시간');
        
        // 🚨🚨🚨 체크 1: 이미 3시간 다 썼으면 차단
        if (currentUsedHours >= MAX_DAILY_HOURS) {
          console.log('');
          console.log('🚫🚫🚫 ========== 예약 차단 ==========');
          console.log('❌ 이유: 이미 일일 한도 도달');
          console.log('📊 현재:', currentUsedHours, '시간');
          console.log('📊 한도:', MAX_DAILY_HOURS, '시간');
          console.log('🚫🚫🚫 ================================');
          console.log('');
          
          alert('일일 예약은 3시간까지만 가능합니다.');
          isBookingInProgress.current = false;
          setLoading(false);
          setShowBookingModal(false);
          return;
        }
        
        // 🚨🚨🚨 체크 2: 예약하면 3시간 초과하면 차단
        if (currentUsedHours + duration > MAX_DAILY_HOURS) {
          console.log('');
          console.log('🚫🚫🚫 ========== 예약 차단 ==========');
          console.log('❌ 이유: 예약 시 일일 한도 초과');
          console.log('📊 현재:', currentUsedHours, '시간');
          console.log('📊 요청:', duration, '시간');
          console.log('📊 합계:', currentUsedHours + duration, '시간');
          console.log('📊 한도:', MAX_DAILY_HOURS, '시간');
          console.log('🚫🚫🚫 ================================');
          console.log('');
          
          alert(`예약 불가!\n\n현재: ${currentUsedHours}시간\n요청: ${duration}시간\n합계: ${currentUsedHours + duration}시간\n\n일일 한도 ${MAX_DAILY_HOURS}시간을 초과합니다.`);
          isBookingInProgress.current = false;
          setLoading(false);
          setShowBookingModal(false);
          return;
        }
        
        console.log('✅ 최종 검증 통과 - 예약 진행');
        console.log('⚠️ ===== 최종 검증 완료 =====');
        console.log('');
      }
      
      // 선택한 시간만큼 슬롯 충돌/우선권 검사
      const slotsToBook: string[] = [];
      const stolenOwners = new Map<string, { uid: string; nickname: string; group?: string; endTime?: string }>();
      const usePendingStatus =
        !isUnlimitedUser &&
        isSundayPendingBookingWindow() &&
        isTargetDateUnderTicketing(dateStr, ticketingSettings);
      const myRank = getPriorityRankNumber(priorityRanking, currentUser.uid, {
        isAdminPriority: isAdminPriorityUser,
      });
      const myVoteCount = priorityRanking.find((r) => r.uid === currentUser.uid)?.voteCount || 0;

      for (let i = 0; i < duration; i++) {
        const checkTime = `${String(startHour + i).padStart(2, '0')}:00`;
        slotsToBook.push(checkTime);
        
        const existingQ = query(
          collection(db, 'practiceRoomReservations'),
          where('date', '==', dateStr),
          where('startTime', '==', checkTime),
          where('status', 'in', ['confirmed', 'pending'])
        );
        
        const existingSnapshot = await getDocs(existingQ);
        if (isUnlimitedUser || isAdminPriorityUser) {
          // 관리자는 기존 pending/confirmed(비관리자)를 밀림 처리
          for (const existingDoc of existingSnapshot.docs) {
            const existing = existingDoc.data() as Reservation;
            if (existing.userId === currentUser.uid) continue;
            if (reservationHasAdminPriority(existing) && !isUnlimitedUser) {
              alert(`${checkTime} 시간대는 관리자 예약이라 덮어쓸 수 없습니다.`);
              isBookingInProgress.current = false;
              setLoading(false);
              setShowBookingModal(false);
              return;
            }
            if (existing.status === 'pending' || existing.status === 'confirmed') {
              stolenOwners.set(existing.userId, {
                uid: existing.userId,
                nickname: existing.userDisplayName || '멤버',
                group: existing.reservationGroup,
                endTime: existing.endTime,
              });
            }
          }
          continue;
        }
        if (existingSnapshot.empty) continue;

        for (const existingDoc of existingSnapshot.docs) {
          const existing = existingDoc.data() as Reservation;
          if (existing.userId === currentUser.uid) {
            alert(`${checkTime} 시간대에 이미 본인 예약이 있습니다.`);
            isBookingInProgress.current = false;
            setLoading(false);
            setShowBookingModal(false);
            return;
          }

          if (existing.status === 'confirmed') {
            alert(`${checkTime} 시간대가 이미 확정 예약되어 있습니다.`);
            isBookingInProgress.current = false;
            setLoading(false);
            setShowBookingModal(false);
            return;
          }

          // pending: 우선권이 더 높을 때만 뺏기 가능
          const canSteal = canStealPendingReservation({
            attackerUid: currentUser.uid,
            defenderUid: existing.userId,
            ranking: priorityRanking,
            attackerIsAdminPriority: isAdminPriorityUser,
            defenderIsAdminPriority: reservationHasAdminPriority(existing),
          });
          if (!canSteal) {
            alert(
              `${checkTime} 시간대는 이미 다른 팀의 대기 예약입니다.\n` +
                `우선순위가 더 높지 않아 우선 예약할 수 없습니다.`
            );
            isBookingInProgress.current = false;
            setLoading(false);
            setShowBookingModal(false);
            return;
          }

          stolenOwners.set(existing.userId, {
            uid: existing.userId,
            nickname: existing.userDisplayName || '멤버',
            group: existing.reservationGroup,
            endTime: existing.endTime,
          });
        }
      }

      // 뺏기: 상대 pending/confirmed → outbid 로 변경(화면에는 계속 표시) + 알림
      if (stolenOwners.size > 0) {
        const allActiveQ = query(
          collection(db, 'practiceRoomReservations'),
          where('date', '==', dateStr),
          where('status', 'in', ['pending', 'confirmed'])
        );
        const allPendingSnap = await getDocs(allActiveQ);
        for (const pendingDoc of allPendingSnap.docs) {
          const data = pendingDoc.data() as Reservation;
          const owner = stolenOwners.get(data.userId);
          if (!owner) continue;
          const sameGroup =
            owner.group && data.reservationGroup
              ? owner.group === data.reservationGroup
              : slotsToBook.includes(data.startTime);
          if (!sameGroup && !slotsToBook.includes(data.startTime)) continue;
          await updateDoc(doc(db, 'practiceRoomReservations', pendingDoc.id), {
            status: 'outbid',
            outbidAt: Timestamp.now(),
            outbidByUid: currentUser.uid,
            outbidByNickname: currentUser.nickname || '익명',
          });
        }

        await Promise.all(
          Array.from(stolenOwners.values()).map((owner) =>
            NotificationService.notifyPracticeRoomReservationStolen({
              toUid: owner.uid,
              fromUid: currentUser.uid,
              fromNickname: currentUser.nickname || '익명',
              date: dateStr,
              startTime: selectedTimeSlot.time,
              endTime: calculateEndTime(selectedTimeSlot.time, duration),
            }).catch((err) => console.error('예약 뺏김 알림 실패:', err))
          )
        );
      }
      
      // 모든 시간대 예약 생성
      const endTime = calculateEndTime(selectedTimeSlot.time, duration);
      const reservationGroup = `${currentUser.uid}_${Date.now()}`; // 그룹 ID
      
      console.log(`예약 생성 시작: ${dateStr}, ${duration}시간, 시작: ${selectedTimeSlot.time}`);
      
      for (let i = 0; i < duration; i++) {
        const slotStartTime = slotsToBook[i];
        const slotEndTime = i === duration - 1 ? endTime : slotsToBook[i + 1];
        
        const reservationData = {
          userId: currentUser.uid,
          userDisplayName: currentUser.nickname || '익명',
          members: trimmedMembers,
          date: dateStr,
          startTime: slotStartTime,
          endTime: slotEndTime,
          duration: SLOT_DURATION,
          totalDuration: duration * SLOT_DURATION,
          purpose: trimmedPurpose || (isAdminPriorityUser ? '관리자 예약' : ''),
          status: usePendingStatus ? 'pending' : 'confirmed',
          reservationGroup: reservationGroup,
          isFirstSlot: i === 0,
          priorityRank: isAdminPriorityUser ? 1 : Number.isFinite(myRank) ? myRank : null,
          priorityVoteCount: myVoteCount,
          adminPriority: isAdminPriorityUser,
          createdAt: Timestamp.now()
        };
        
        console.log(`예약 생성 중 [${i+1}/${duration}]:`, slotStartTime, '-', slotEndTime);
        await addDoc(collection(db, 'practiceRoomReservations'), reservationData);
      }
      
      console.log('✅ Firebase 예약 생성 완료!');
      
      // 예약한 날짜를 저장 (모달 닫기 전에)
      const reservedDate = new Date(bookingDate);
      const reservedDuration = duration;
      
      // 모달 닫기
      setShowBookingModal(false);
      setSelectedTimeSlot(null);
      setBookingDate(null);
      setPurpose('');
      setDuration(1);
      setMembers([]);
      setMemberInput('');
      
      console.log('⏳ Firebase 동기화 대기 중... (1초)');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('🔄 데이터 새로고침 시작...');
      await loadReservations();
      await loadMyReservations();
      const newUsedHours = await calculateDailyUsedHours(reservedDate);
      const newWeeklyCount = await calculateWeeklyReservationCount(reservedDate);
      
      console.log('');
      console.log('✅ ========== 예약 완료! ==========');
      console.log('📅 날짜:', dateStr);
      console.log('⏱️  예약 시간:', reservedDuration, '시간');
      console.log('📊 총 사용 시간:', newUsedHours, '/', MAX_DAILY_HOURS, '시간');
      console.log('📊 주간 예약:', newWeeklyCount, '/', MAX_WEEKLY_RESERVATIONS, '회');
      console.log('✅ ================================');
      console.log('');
      
      const pendingNote = usePendingStatus
        ? '\n\n※ 일요일 대기 예약입니다. 월요일 00시에 확정됩니다.\n우선순위가 더 높은 멤버가 이 시간대를 가져갈 수 있습니다.'
        : '';
      alert(
        isUnlimitedUser
          ? `${reservedDuration}시간 예약 완료!\n\n${dateStr}`
          : `${reservedDuration}시간 ${usePendingStatus ? '대기 ' : ''}예약 완료!\n\n${dateStr}\n일일 사용: ${newUsedHours}/${MAX_DAILY_HOURS}시간\n주간 예약: ${newWeeklyCount}/${MAX_WEEKLY_RESERVATIONS}회${pendingNote}`
      );
      console.log('🔓 잠금 해제');
    } catch (error) {
      console.error('❌ 예약 실패:', error);
      alert('예약에 실패했습니다. 다시 시도해주세요.');
    } finally {
      isBookingInProgress.current = false; // 항상 잠금 해제
      setLoading(false);
      console.log('🔓 잠금 해제 완료');
    }
  };

  const handleCancelReservation = async (reservation: Reservation) => {
    // 로딩 중이면 취소 불가
    if (loading) {
      console.log('예약 처리 중... 대기해주세요');
      return;
    }
    
    const isOwnReservation = reservation.userId === currentUser?.uid;
    const confirmMessage = isAdmin && !isOwnReservation
      ? `관리자 권한으로 ${reservation.userDisplayName}님의 예약을 취소하시겠습니까?\n(연속된 예약이 모두 취소됩니다)`
      : '예약을 취소하시겠습니까? (연속된 예약이 모두 취소됩니다)';
    
    if (!window.confirm(confirmMessage)) return;
    
    setLoading(true);
    try {
      // 같은 그룹의 모든 예약 찾기
      const groupQ = query(
        collection(db, 'practiceRoomReservations'),
        where('userId', '==', reservation.userId)
      );
      
      const groupSnapshot = await getDocs(groupQ);
      const groupReservations = groupSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((r: any) => {
          // status 확인
          if (r.status !== 'confirmed' && r.status !== 'pending') return false;
          // 날짜 확인
          if (r.date !== reservation.date) return false;
          
          // 같은 reservationGroup이거나, 연속된 시간대인지 확인
          if (r.reservationGroup && reservation.reservationGroup && 
              r.reservationGroup === reservation.reservationGroup) {
            return true;
          }
          // reservationGroup이 없는 경우 (이전 예약), 시간으로 판단
          const resHour = parseInt(reservation.startTime.split(':')[0]);
          const rHour = parseInt(r.startTime.split(':')[0]);
          return Math.abs(resHour - rHour) < 3;
        });
      
      // 모든 연관 예약 삭제
      for (const res of groupReservations) {
        await deleteDoc(doc(db, 'practiceRoomReservations', res.id));
      }
      
      setShowDetailModal(false);
      
      console.log('=== 예약 취소 완료 ===');
      console.log('취소된 예약 날짜:', reservation.date);
      console.log('취소된 예약 개수:', groupReservations.length);
      
      // 취소된 예약의 날짜를 Date 객체로 변환
      const [year, month, day] = reservation.date.split('-').map(Number);
      const canceledDate = new Date(year, month - 1, day);
      
      // Firebase 데이터 반영을 위한 충분한 대기 시간
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('데이터 새로고침 시작...');
      await loadReservations();
      await loadMyReservations();
      const newUsedHours = await calculateDailyUsedHours(canceledDate);
      await calculateWeeklyReservationCount(canceledDate);
      console.log('새로고침 완료. 총 사용 시간:', newUsedHours, '/', MAX_DAILY_HOURS);
      
      alert('예약이 취소되었습니다.');
    } catch (error) {
      console.error('예약 취소 실패:', error);
      alert('예약 취소에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockTimeSlot = async () => {
    if (!selectedTimeSlot || !bookingDate || !currentUser) return;
    
    if (!blockReason.trim()) {
      alert('차단 사유를 입력해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      const dateStr = formatDate(bookingDate);
      
      console.log('🚫 시간대 차단 시작:', dateStr, selectedTimeSlot.time);
      
      await addDoc(collection(db, 'blockedTimeSlots'), {
        date: dateStr,
        startTime: selectedTimeSlot.time,
        endTime: selectedTimeSlot.endTime,
        reason: blockReason,
        blockedBy: currentUser.nickname,
        blockedAt: serverTimestamp()
      });
      
      setShowBlockModal(false);
      setBlockReason('');
      setSelectedTimeSlot(null);
      setBookingDate(null);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadBlockedSlots();
      
      alert('시간대가 차단되었습니다.');
      console.log('✅ 시간대 차단 완료');
    } catch (error) {
      console.error('시간대 차단 실패:', error);
      alert('시간대 차단에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockTimeSlot = async () => {
    if (!selectedTimeSlot) return;
    
    // 규칙에 의한 차단인지 확인
    if (!selectedTimeSlot.blockId) {
      alert('⚠️ 이 시간대는 반복 규칙에 의해 차단되었습니다.\n\n차단 해제는 "연습실 관리" 페이지에서 규칙을 비활성화하거나 삭제해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      console.log('✅ 차단 해제 시작:', selectedTimeSlot.time);
      
      await deleteDoc(doc(db, 'blockedTimeSlots', selectedTimeSlot.blockId));
      
      setShowBlockModal(false);
      setSelectedTimeSlot(null);
      setBookingDate(null);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadBlockedSlots();
      
      alert('차단이 해제되었습니다.');
      console.log('✅ 차단 해제 완료');
    } catch (error) {
      console.error('차단 해제 실패:', error);
      alert('차단 해제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAllowException = async () => {
    if (!selectedTimeSlot || !bookingDate || !currentUser) return;
    
    setLoading(true);
    try {
      const dateStr = formatDate(bookingDate);
      
      console.log('✅ 예외 허용 시작:', dateStr, selectedTimeSlot.time);
      
      // 예외 허용 문서 추가
      await addDoc(collection(db, 'blockedTimeSlots'), {
        date: dateStr,
        startTime: selectedTimeSlot.time,
        endTime: selectedTimeSlot.endTime,
        reason: '규칙 예외 허용',
        blockedBy: currentUser.nickname || '관리자',
        blockedAt: serverTimestamp(),
        isException: true
      });
      
      setShowBlockModal(false);
      setSelectedTimeSlot(null);
      setBookingDate(null);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadBlockedSlots();
      
      alert('✅ 이 시간대가 예약 가능하도록 허용되었습니다.');
      console.log('✅ 예외 허용 완료');
    } catch (error) {
      console.error('예외 허용 실패:', error);
      alert('예외 허용에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelException = async (slot: TimeSlot) => {
    if (!slot.blockId) return;
    
    setLoading(true);
    try {
      console.log('❌ 예외 취소 시작:', slot.time);
      
      await deleteDoc(doc(db, 'blockedTimeSlots', slot.blockId));
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadBlockedSlots();
      
      alert('예외가 취소되었습니다.\n규칙에 의해 다시 차단됩니다.');
      console.log('✅ 예외 취소 완료');
    } catch (error) {
      console.error('예외 취소 실패:', error);
      alert('예외 취소에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const getDayName = (date: Date): string => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  const handleAddMember = () => {
    const trimmedInput = memberInput.trim();
    if (!trimmedInput) return;
    if (trimmedInput === currentUser?.nickname) {
      alert('본인은 이미 예약자로 포함됩니다. 다른 멤버를 추가해주세요.');
      return;
    }
    const invalidMembers = findInvalidMemberNicknames([trimmedInput], memberCandidates);
    if (invalidMembers.length > 0) {
      alert(`등록되지 않은 멤버 닉네임입니다: ${invalidMembers.join(', ')}`);
      return;
    }
    const normalized = normalizeMemberNicknames([trimmedInput], memberCandidates);
    const nickname = normalized[0];
    if (!nickname) return;
    if (!members.includes(nickname)) {
      const nextMembers = [...members, nickname];
      setMembers(nextMembers);
      clampDurationToParticipantLimit(nextMembers);
      setMemberInput('');
    }
  };

  const handleRemoveMember = (memberToRemove: string) => {
    const nextMembers = members.filter(m => m !== memberToRemove);
    setMembers(nextMembers);
    clampDurationToParticipantLimit(nextMembers);
  };

  const handleMemberInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddMember();
    }
  };

  const handleManualRefresh = async () => {
    if (loading) {
      console.log('이미 새로고침 중입니다...');
      return;
    }
    
    setLoading(true);
    try {
      console.log('수동 새로고침 시작...');
      try {
        await confirmDuePendingReservations();
      } catch (err) {
        console.warn('pending 예약 확정 처리 실패:', err);
      }
      await loadReservations();
      await loadMyReservations();
      await calculateDailyUsedHours();
      await calculateWeeklyReservationCount();
      await loadBlockedSlots();
      await loadPriorityRanking();
      console.log('수동 새로고침 완료');
    } finally {
      setLoading(false);
    }
  };

  // 입실 처리
  const handleCheckIn = async () => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    // 이미 입실 중인지 확인
    if (myCheckIn) {
      alert('이미 입실하셨습니다.');
      return;
    }

    try {
      setLoading(true);
      console.log('입실 처리 시작...');
      console.log('사용자 정보:', {
        uid: currentUser.uid,
        nickname: currentUser.nickname
      });

      const checkInTime = serverTimestamp();
      const checkInData = {
        userId: currentUser.uid,
        userNickname: currentUser.nickname || '익명',
        checkInTime: checkInTime,
        status: 'checked_in' as const,
        createdAt: checkInTime
      };

      console.log('입실 데이터:', checkInData);

      const docRef = await addDoc(collection(db, 'practiceRoomCheckIn'), checkInData);
      console.log('✅ 입실 완료 - 문서 ID:', docRef.id);
      
      // 즉시 상태 업데이트를 위해 약간의 지연
      await new Promise(resolve => setTimeout(resolve, 500));
      
      alert('입실이 완료되었습니다.');
    } catch (error: any) {
      console.error('❌ 입실 실패:', error);
      console.error('에러 코드:', error.code);
      console.error('에러 메시지:', error.message);
      alert(`입실 처리에 실패했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 퇴실 처리
  const handleCheckOut = async () => {
    if (!currentUser || !myCheckIn) {
      alert('입실 상태가 아닙니다.');
      return;
    }

    if (!window.confirm('퇴실하시겠습니까?')) {
      return;
    }

    try {
      setLoading(true);
      const checkInRef = doc(db, 'practiceRoomCheckIn', myCheckIn.id);
      await updateDoc(checkInRef, {
        checkOutTime: serverTimestamp(),
        status: 'checked_out'
      });
      alert('퇴실이 완료되었습니다.');
      console.log('✅ 퇴실 완료');
    } catch (error) {
      console.error('퇴실 실패:', error);
      alert('퇴실 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleForceCheckOut = async (checkIn: CheckIn) => {
    if (!currentUser || !isAdmin) return;

    const confirmMessage = `${checkIn.userNickname}님을 퇴실 처리하시겠습니까?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      setLoading(true);
      const checkInRef = doc(db, 'practiceRoomCheckIn', checkIn.id);
      await updateDoc(checkInRef, {
        checkOutTime: serverTimestamp(),
        status: 'checked_out'
      });
      console.log('✅ 관리자 퇴실 처리:', checkIn.userNickname);
      alert('퇴실 처리되었습니다.');
    } catch (error) {
      console.error('관리자 퇴실 처리 실패:', error);
      alert('퇴실 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toDateFromTimestamp = (time: any): Date | null => {
    if (!time) return null;
    if (time instanceof Timestamp) return time.toDate();
    if (time?.toDate) return time.toDate();
    const parsed = new Date(time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // 입실 시간 포맷팅 (상대 시간)
  const formatCheckInTime = (checkInTime: any): string => {
    const date = toDateFromTimestamp(checkInTime);
    if (!date) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 입실/퇴실 절대 시각
  const formatAbsoluteDateTime = (time: any): string => {
    const date = toDateFromTimestamp(time);
    if (!date) return '-';
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderCheckInHistoryItem = (record: CheckIn) => (
    <div key={record.id} className="check-in-history-item">
      <div className="check-in-history-user">
        <User size={14} />
        <span className="check-in-history-name">{record.userNickname}</span>
        {record.userId === currentUser?.uid && (
          <span className="check-in-badge">나</span>
        )}
      </div>
      <div className="check-in-history-times">
        <span>입실 {formatAbsoluteDateTime(record.checkInTime)}</span>
        <span className="check-in-history-sep">·</span>
        <span>퇴실 {formatAbsoluteDateTime(record.checkOutTime)}</span>
      </div>
    </div>
  );

  const weekDates = getWeekDates();

  return (
    <div className="practice-room-booking">
      <div className="practice-room-shell">
      <header className="booking-header">
        <button type="button" className="booking-back-button" onClick={() => navigate(-1)} aria-label="뒤로">
          <ChevronLeft size={22} />
        </button>
        <div className="booking-header__title-wrap">
          <h1>
            <Music2 size={20} className="booking-header__icon" aria-hidden />
            연습실 예약
          </h1>
          <p className="booking-header__sub">매일 09:00 – 22:00 · 1시간 단위</p>
        </div>
        <div className="header-buttons">
          {isUnlimitedUser && (
            <span className="unlimited-admin-badge" title="예약 한도 없음">
              무제한
            </span>
          )}
          {isUnlimitedUser && (
            <button
              type="button"
              className="management-button"
              onClick={() => navigate('/practice-room-management')}
              title="연습실 관리"
              aria-label="연습실 관리"
            >
              <Settings size={18} />
            </button>
          )}
          <button
            type="button"
            className="refresh-button"
            onClick={handleManualRefresh}
            disabled={loading}
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </header>

      {!isUnlimitedUser && isCherryGradeUser() && (
        <div
          className="cherry-grade-booking-notice"
          role="status"
        >
          🍒 체리 등급 회원은 연습실 예약을 이용할 수 없습니다. 체리 등급을 졸업(딸기 등급 이상)한 후 예약해 주세요.
        </div>
      )}

      {selectedDateAlwaysOpen && alwaysOpenSettings && (
        <div className="always-open-notice" role="status">
          🟢 {ALWAYS_OPEN_NOTICE}
          <span className="always-open-period">
            ({alwaysOpenSettings.startDate} ~ {alwaysOpenSettings.endDate})
          </span>
        </div>
      )}

      {ticketingStatusMessage && (
        <div className="ticketing-notice" role="status">
          {ticketingStatusMessage}
        </div>
      )}

      {isSundayPendingBookingWindow() && priorityWindow && (
        <div className="ticketing-notice" role="status" style={{ background: 'rgba(217, 119, 6, 0.15)' }}>
          ⏳ {getSundayPendingBannerText(priorityWindow)}
        </div>
      )}

      {priorityRanking.length > 0 && (
        <div
          className="priority-ranking-panel"
          style={{
            margin: '0 0 12px',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#334155' }}>
            이번 주 1차 투표 우선권 순위
            {priorityWindow ? (
              <span style={{ fontWeight: 500, fontSize: 12, color: '#64748B', marginLeft: 8 }}>
                집계 {priorityWindow.startYmd} ~ {priorityWindow.endYmd}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {priorityRanking.slice(0, 20).map((entry) => (
              <span
                key={entry.uid}
                style={{
                  fontSize: 13,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background:
                    entry.uid === currentUser?.uid ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                  color: '#334155',
                  fontWeight: entry.uid === currentUser?.uid ? 700 : 500,
                }}
              >
                {entry.rank}위 {entry.nickname} ({entry.voteCount}표)
              </span>
            ))}
          </div>
          {currentUser?.uid && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
              내 우선순위:{' '}
              {Number.isFinite(getPriorityRankNumber(priorityRanking, currentUser.uid))
                ? `${getPriorityRankNumber(priorityRanking, currentUser.uid)}위`
                : '순위 밖 (투표 미참여) — 대기 예약은 가능하지만 뺏길 수 있습니다'}
            </div>
          )}
        </div>
      )}

      {SHOW_PRACTICE_ROOM_CHECK_IN_UI && (
      <section className="check-in-section practice-notebook-section" aria-label="현재 입실 현황">
        <div className="practice-section-label">입실 현황</div>
        <div className="check-in-header">
          <div className="check-in-title">
            <Users size={20} />
            <h2>현재 입실 현황</h2>
            <span className="check-in-count">({checkedInMembers.length}명)</span>
          </div>
          {currentUser && (
            <div className="check-in-actions">
              {myCheckIn ? (
                <button 
                  className="check-out-button"
                  onClick={handleCheckOut}
                  disabled={loading}
                >
                  <LogOut size={18} />
                  퇴실하기
                </button>
              ) : (
                <button 
                  className="check-in-button"
                  onClick={handleCheckIn}
                  disabled={loading}
                >
                  <LogIn size={18} />
                  입실하기
                </button>
              )}
            </div>
          )}
        </div>
        
        {checkedInMembers.length === 0 ? (
          <div className="check-in-empty">
            <p>현재 입실 중인 멤버가 없습니다.</p>
          </div>
        ) : (
          <div className="check-in-list">
            {checkedInMembers.map((checkIn) => (
              <div 
                key={checkIn.id} 
                className={`check-in-item ${checkIn.userId === currentUser?.uid ? 'my-check-in' : ''}`}
              >
                <div className="check-in-user">
                  <User size={16} />
                  <span className="check-in-name">{checkIn.userNickname}</span>
                  {checkIn.userId === currentUser?.uid && (
                    <span className="check-in-badge">나</span>
                  )}
                </div>
                <div className="check-in-time">
                  입실 {formatAbsoluteDateTime(checkIn.checkInTime)}
                  <span className="check-in-time-relative">({formatCheckInTime(checkIn.checkInTime)})</span>
                </div>
                {isAdmin && checkIn.userId !== currentUser?.uid && (
                  <button
                    className="force-checkout-button"
                    onClick={() => handleForceCheckOut(checkIn)}
                    disabled={loading}
                    title="퇴실 처리"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="check-in-history">
          <div className="check-in-history-header">
            <div className="check-in-history-title">
              <Clock size={16} />
              <h3>입실·퇴실 기록</h3>
              <span className="check-in-count">({checkInHistory.length}건)</span>
            </div>
            {checkInHistory.length > CHECK_IN_HISTORY_PREVIEW_LIMIT && (
              <button
                type="button"
                className="check-in-history-more"
                onClick={() => setShowCheckInHistoryModal(true)}
              >
                전체 보기
              </button>
            )}
          </div>
          {checkInHistory.length === 0 ? (
            <div className="check-in-history-empty">
              <p>아직 입실·퇴실 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="check-in-history-list">
              {checkInHistory
                .slice(0, CHECK_IN_HISTORY_PREVIEW_LIMIT)
                .map((record) => renderCheckInHistoryItem(record))}
            </div>
          )}
        </div>
      </section>
      )}

      <section className="booking-controls practice-notebook-section" aria-label="예약 일정">
        <div className="practice-section-label">예약 일정</div>
        <div className="week-navigation">
          {isMobile ? (
            <>
              <button onClick={goToPreviousDay} className="nav-button">
                <ChevronLeft size={20} />
              </button>
              <button onClick={goToToday} className="today-button">
                오늘
              </button>
              <button onClick={goToNextDay} className="nav-button">
                <ChevronRight size={20} />
              </button>
            </>
          ) : (
            <>
              <button onClick={goToPreviousWeek} className="nav-button">
                <ChevronLeft size={20} />
              </button>
              <button onClick={goToToday} className="today-button">
                오늘
              </button>
              <button onClick={goToNextWeek} className="nav-button">
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>
        <div className="current-week">
          {isMobile ? (
            <div className="mobile-date-display">
              {formatDate(selectedDate)} ({getDayName(selectedDate)})
            </div>
          ) : (
            `${formatDate(weekDates[0])} ~ ${formatDate(weekDates[6])}`
          )}
        </div>
        
        {/* 색상 범례 */}
        <div className="color-legend">
          <div className="legend-item">
            <div className="legend-color available"></div>
            <span>예약 가능</span>
          </div>
          {isAdmin && (
            <div className="legend-item">
              <div className="legend-color exception"></div>
              <span>✅ 예외 허용</span>
            </div>
          )}
          <div className="legend-item">
            <div className="legend-color reserved"></div>
            <span>예약됨</span>
          </div>
          <div className="legend-item">
            <div className="legend-color my-reservation"></div>
            <span>내 예약</span>
          </div>
          <div className="legend-item">
            <div className="legend-color blocked"></div>
            <span>차단됨</span>
          </div>
          <div className="legend-item">
            <div className="legend-color past"></div>
            <span>지난 시간</span>
          </div>
        </div>
        
        {/* 일일 예약 현황 */}
        {!isUnlimitedUser && (
          <div className="daily-limit-info">
            <span className="limit-icon">⏰</span>
            <span className="limit-text">
              오늘 사용: <strong>{dailyUsedHours}</strong> / {MAX_DAILY_HOURS}시간
            </span>
            <span className="limit-text">
              {weeklyLimitLabel}: <strong>{weeklyReservationCount}</strong> / {MAX_WEEKLY_RESERVATIONS}회
            </span>
          </div>
        )}
      </section>

      {/* 뷰 렌더링 */}
      {isMobile ? (
        /* 모바일 일간 뷰 */
        <div className="day-view-mobile">
          {isTargetDateUnderTicketing(formatDate(selectedDate), ticketingSettings) &&
          isTicketingNonBookableWeekday(formatDate(selectedDate)) &&
          !isUnlimitedUser ? (
            <div
              className="weekend-blocked-mobile"
              onClick={() => alert(TICKETING_NON_BOOKABLE_NOTICE)}
            >
              주말 예약 차단
              <span>금요일·토요일은 예약할 수 없습니다</span>
            </div>
          ) : (
          <div className="day-slots">
            {(() => {
              const daySlots = generateTimeSlots(selectedDate);
              return daySlots.map((slot, idx) => {
              const merge = getSlotMergeInfo(daySlots, idx);
              if (merge.isContinuation) return null;

              const isMyReservation = slot.reservation?.userId === currentUser?.uid;
              const blockEndTime =
                merge.span > 1
                  ? daySlots[idx + merge.span - 1]?.endTime || slot.endTime
                  : slot.endTime;
              
              return (
                <div
                  key={idx}
                  className={`mobile-time-slot ${
                    slot.isPast
                      ? 'past'
                      : slot.isWalkInOpen
                        ? 'walk-in'
                        : slot.isBlocked
                          ? 'blocked'
                          : slot.isAvailable
                            ? 'available'
                            : 'reserved'
                  } ${isMyReservation ? 'my-reservation' : ''} ${slot.isException ? 'exception' : ''} ${
                    merge.span > 1 ? 'merged-block' : ''
                  }`}
                  onClick={(e) => handleSlotActivate(slot, selectedDate, e)}
                  style={merge.span > 1 ? { minHeight: `${Math.max(72, merge.span * 64)}px` } : undefined}
                >
                  <div className="mobile-slot-time">
                    <span className="time-label-large">{slot.time}</span>
                    <span className="time-separator">-</span>
                    <span className="time-label-small">{blockEndTime}</span>
                    {merge.span > 1 && (
                      <span className="merged-hours-badge">{merge.span}시간</span>
                    )}
                  </div>
                  <div className="mobile-slot-content">
                    {slot.isPast ? (
                      <span className="slot-status past-label">지난 시간</span>
                    ) : slot.isWalkInOpen ? (
                      <div className="walk-in-card">
                        <div className="walk-in-header">🟢 자유 이용</div>
                        <div className="walk-in-reason">예약 없음 · 누구나 이용</div>
                      </div>
                    ) : slot.isBlocked ? (
                      <div className="blocked-card">
                        <div className="blocked-header">
                          {slot.isTicketingBlock ? '🎫 예약 대기' : '🚫 차단됨'}
                        </div>
                        {slot.blockReason && (
                          <div className="blocked-reason">
                            {slot.blockReason}
                          </div>
                        )}
                      </div>
                    ) : slot.isAvailable ? (
                      <div className="available-status">
                        {slot.canSteal && slot.reservation ? (
                          <>
                            <span className="slot-status available-label">우선 예약 가능</span>
                            <div className="reservation-user" style={{ fontSize: 12, marginTop: 4 }}>
                              {formatAnonymousSlotOccupancyLabel(slot.reservations, slot.reservation)}
                            </div>
                          </>
                        ) : (
                          <span className="slot-status available-label">예약 가능</span>
                        )}
                        {slot.isException && isAdmin && (
                          <span className="exception-badge">✅ 예외 허용</span>
                        )}
                      </div>
                    ) : slot.reservation || (slot.reservations && slot.reservations.length > 0) ? (
                      <div className="reservation-card">
                        <div className="reservation-header">
                          <User size={14} />
                          <span className="reservation-user">
                            {formatSlotOccupancyLabel(
                              slot.reservations,
                              slot.reservation
                            )}
                          </span>
                        </div>
                        {(!hideTicketingReservationIdentities ||
                          reservationHasAdminPriority(slot.reservation || {})) &&
                          slot.reservation?.members &&
                          slot.reservation.members.length > 0 && (
                          <div className="reservation-members-mobile">
                            👥 {slot.reservation.members.join(', ')}
                          </div>
                        )}
                        {(!hideTicketingReservationIdentities ||
                          reservationHasAdminPriority(slot.reservation || {})) &&
                          slot.reservation?.purpose && (
                          <div className="reservation-purpose-mobile">
                            💡 {slot.reservation.purpose}
                          </div>
                        )}
                        {(isMyReservation || isAdmin) && slot.reservation && slot.reservation.status !== 'outbid' && (
                          <button
                            className="mobile-cancel-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelReservation(slot.reservation!);
                            }}
                          >
                            {isAdmin && !isMyReservation ? '관리자 취소' : '예약 취소'}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
              });
            })()}
          </div>
          )}
        </div>
      ) : (
        /* 데스크톱 주간 뷰 */
        <div className="week-view">
          <div className="week-grid">
          {/* 시간 헤더 */}
          <div className="time-column header">
            <div className="time-label">시간</div>
          </div>
          
          {/* 요일 헤더 */}
          {weekDates.map((date, idx) => (
            <div 
              key={idx} 
              className={`day-column header ${isToday(date) ? 'today' : ''}`}
            >
              <div className="day-name">{getDayName(date)}</div>
              <div className="day-date">{date.getDate()}</div>
            </div>
          ))}
          
          {/* 시간대별 슬롯 */}
          {Array.from({ length: CLOSE_TIME - OPEN_TIME }).map((_, hourIdx) => {
            const hour = OPEN_TIME + hourIdx;
            const timeStr = `${String(hour).padStart(2, '0')}:00`;
            
            return (
              <React.Fragment key={hour}>
                <div className="time-column">
                  <div className="time-label">{timeStr}</div>
                </div>
                
                {weekDates.map((date, dayIdx) => {
                  const dateStr = formatDate(date);
                  const weekendBlocked =
                    isTargetDateUnderTicketing(dateStr, ticketingSettings) &&
                    isTicketingNonBookableWeekday(dateStr) &&
                    !isUnlimitedUser;

                  if (weekendBlocked) {
                    if (hourIdx !== 0) return null;
                    return (
                      <div
                        key={`${dayIdx}-weekend`}
                        className="time-slot weekend-blocked"
                        style={{ gridRow: `span ${CLOSE_TIME - OPEN_TIME}` }}
                        onClick={() => alert(TICKETING_NON_BOOKABLE_NOTICE)}
                        title={TICKETING_NON_BOOKABLE_NOTICE}
                      >
                        <span className="weekend-blocked-label">주말 예약 차단</span>
                      </div>
                    );
                  }

                  const slots = generateTimeSlots(date);
                  const slot = slots[hourIdx];
                  const merge = getSlotMergeInfo(slots, hourIdx);
                  if (merge.isContinuation) return null;

                  const isMyReservation = slot.reservation?.userId === currentUser?.uid;
                  
                  return (
                    <div
                      key={`${dayIdx}-${hourIdx}`}
                      className={`time-slot ${
                        slot.isPast
                          ? 'past'
                          : slot.isWalkInOpen
                            ? 'walk-in'
                            : slot.isBlocked
                              ? 'blocked'
                              : slot.isAvailable
                                ? 'available'
                                : 'reserved'
                      } ${isMyReservation ? 'my-reservation' : ''} ${slot.isException ? 'exception' : ''} ${
                        merge.span > 1 ? 'merged-block' : ''
                      }`}
                      onClick={(e) => handleSlotActivate(slot, date, e)}
                      style={{
                        cursor: slot.isPast ? 'not-allowed' : 'pointer',
                        ...(merge.span > 1 ? { gridRow: `span ${merge.span}` } : {}),
                      }}
                    >
                      {slot.isWalkInOpen ? (
                        <div className="walk-in-info">
                          <span className="walk-in-label">🟢</span>
                          <span className="walk-in-reason-small">자유</span>
                        </div>
                      ) : slot.isBlocked ? (
                        <div className="blocked-info">
                          <span className="blocked-label">{slot.isTicketingBlock ? '🎫' : '🚫'}</span>
                          {slot.blockReason && (
                            <span className="blocked-reason-small">{slot.blockReason}</span>
                          )}
                        </div>
                      ) : slot.isAvailable && slot.canSteal && slot.reservation ? (
                        <div className="reservation-info">
                          <span className="user-name">우선 예약 가능</span>
                          <span className="member-names">
                            {formatAnonymousSlotOccupancyLabel(slot.reservations, slot.reservation)}
                          </span>
                        </div>
                      ) : slot.isAvailable && slot.isException && isAdmin ? (
                        <div className="exception-info">
                          <span className="exception-icon">✅</span>
                        </div>
                      ) : (slot.reservation || (slot.reservations && slot.reservations.length > 0)) && (
                        <div className="reservation-info">
                          <span className="user-name">
                            {formatSlotOccupancyLabel(slot.reservations, slot.reservation)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      )}
      {/* 뷰 렌더링 끝 */}

      {/* 내 예약 목록 */}
      {myReservations.length > 0 && (
        <section className="my-reservations-section practice-notebook-section" aria-label="내 예약 목록">
          <div className="practice-section-label">내 예약</div>
          <h2>예약한 시간</h2>
          <div className="my-reservations-list">
            {myReservations.map((reservation) => (
              <div key={reservation.id} className="my-reservation-item">
                <div className="reservation-date">
                  <Calendar size={16} />
                  <span>
                    {reservation.date}
                    {(() => {
                      const phase = getReservationPhaseLabel(reservation);
                      if (phase === '대기') return ' · 대기(월 00시 확정)';
                      if (phase === '확정') return ' · 확정';
                      return '';
                    })()}
                  </span>
                </div>
                <div className="reservation-time">
                  <Clock size={16} />
                  <span>{reservation.startTime} - {reservation.endTime}</span>
                </div>
                {reservation.purpose && (
                  <div className="reservation-purpose">
                    💡 {reservation.purpose}
                  </div>
                )}
                {reservation.members && reservation.members.length > 0 && (
                  <div className="reservation-members">
                    👥 함께 사용: {reservation.members.join(', ')}
                  </div>
                )}
                <div className="reservation-actions">
                  <button
                    className="cancel-button"
                    onClick={() => handleCancelReservation(reservation)}
                    disabled={loading}
                  >
                    {isAdmin && reservation.userId !== currentUser?.uid ? '관리자 취소' : '취소'}
                  </button>
                  {isAdmin && reservation.userId !== currentUser?.uid && (
                    <span className="admin-badge">🔧 관리자 권한</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      </div>{/* .practice-room-shell */}

      {/* 예약 모달 — body로 포털(라우트 transform 때문에 fixed가 맨 위에 붙는 문제 방지) */}
      {showBookingModal && selectedTimeSlot && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay practice-booking-modal-overlay" onClick={() => setShowBookingModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>연습실 예약</h3>
              <button className="close-button" onClick={() => setShowBookingModal(false)}>
                <X size={24} />
              </button>
            </div>
            {selectedTimeSlot.isException && (
              <div className="exception-notice">
                <p>
                  <strong>규칙 예외로 허용된 시간대</strong>입니다
                  {isAdmin && <span className="exception-notice__admin"> (취소는 하단 버튼)</span>}
                </p>
              </div>
            )}
            <div className="modal-body">
              <div className="booking-info">
                <div className="info-row">
                  <Calendar size={18} />
                  <span>{bookingDate && formatDate(bookingDate)}</span>
                </div>
                <div className="info-row">
                  <Clock size={18} />
                  <span>{selectedTimeSlot.time} - {calculateEndTime(selectedTimeSlot.time, duration)}</span>
                </div>
                <div className="info-row">
                  <User size={18} />
                  <span>{currentUser?.nickname}</span>
                </div>
              </div>
              <div className="duration-selector">
                <label>예약 시간 <span className="auto-selected">✓ 자동 선택됨</span></label>
                <div className="duration-buttons">
                  {(isUnlimitedUser
                    ? Array.from({ length: maxAvailableDuration }, (_, i) => i + 1)
                    : [1, 2, 3]
                  ).map((hours) => {
                    const effectiveMax = getEffectiveMaxDuration();
                    return (
                    <button
                      key={hours}
                      type="button"
                      className={`duration-button ${duration === hours ? 'active' : ''} ${hours > effectiveMax ? 'disabled' : ''}`}
                      onClick={() => hours <= effectiveMax && setDuration(hours)}
                      disabled={hours > effectiveMax}
                    >
                      {hours}시간
                    </button>
                    );
                  })}
                </div>
                {!isUnlimitedUser && (
                  <p className="duration-hint daily-limit">
                    📊 오늘 예약 가능: {MAX_DAILY_HOURS - dailyUsedHours}시간 (사용: {dailyUsedHours}/{MAX_DAILY_HOURS}시간)
                  </p>
                )}
                {!isUnlimitedUser && (
                  <p className="duration-hint">
                    👥 인원별 최대 시간: 2~3명 → 2시간 / 4명 이상 → 3시간
                    {getBookingParticipantCount() >= 2 && (
                      <> (현재 {getBookingParticipantCount()}명 → 최대 {getMaxHoursByParticipantCount(getBookingParticipantCount())}시간)</>
                    )}
                  </p>
                )}
                {isUnlimitedUser && (
                  <p className="duration-hint daily-limit" style={{ color: '#86efac' }}>
                    관리자 모드: 일일·주간 한도 없이 예약할 수 있습니다.
                  </p>
                )}
                {!isUnlimitedUser &&
                  maxAvailableDuration < getMaxHoursByParticipantCount(getBookingParticipantCount()) && (
                  <p className="duration-hint">
                    ⚠️ 연속된 시간대가 비어있지 않아 최대 {maxAvailableDuration}시간까지만 예약 가능합니다.
                  </p>
                )}
                <p className="duration-info">
                  💡 기본적으로 최대 시간이 선택됩니다. 필요시 변경하세요.
                </p>
              </div>
              <div className="members-input">
                <label>
                  함께 사용할 멤버
                  {!isUnlimitedUser && <span style={{ color: '#ef4444' }}> *</span>}
                </label>
                <p className="duration-hint">
                  단독 사용은 불가합니다. 본인 포함 <strong>2인 이상</strong>일 때만 예약할 수 있습니다.
                  {!isUnlimitedUser && (
                    <> 3시간 예약은 본인 포함 <strong>4명 이상</strong>일 때 가능합니다.</>
                  )}
                </p>
                <div className="member-input-container">
                  <NicknameSuggestInput
                    value={memberInput}
                    onChange={setMemberInput}
                    placeholder="멤버 닉네임 검색 후 추가"
                    candidates={memberCandidates}
                    excludeNicknames={[currentUser?.nickname, ...members]}
                    className="practice-room-member-suggest"
                  />
                  <button 
                    type="button"
                    className="add-member-btn" 
                    onClick={handleAddMember}
                    disabled={!memberInput.trim()}
                  >
                    추가
                  </button>
                </div>
                <p className="duration-hint">
                  예약 인원: <strong>{getBookingParticipantCount()}명</strong> (본인 포함)
                  {getTrimmedMembers().length < 1 && !isUnlimitedUser && (
                    <span style={{ color: '#ef4444' }}> · 멤버 1명 이상 추가 필요</span>
                  )}
                </p>
                {members.length > 0 && (
                  <div className="members-list">
                    {members.map((member, idx) => (
                      <div key={idx} className="member-tag">
                        <span>{member}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member)}
                          className="remove-member-btn"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="purpose-input">
                <label>
                  사용 목적
                  {!isUnlimitedUser && <span style={{ color: '#ef4444' }}> *</span>}
                </label>
                <input
                  type="text"
                  placeholder="예: 밴드 합주, 보컬 연습 등"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
            </div>
            <div className="modal-footer" style={{ flexDirection: selectedTimeSlot.isException && isAdmin ? 'column' : 'row', gap: selectedTimeSlot.isException && isAdmin ? '10px' : '12px' }}>
              {selectedTimeSlot.isException && isAdmin && (
                <button 
                  className="delete-btn" 
                  onClick={() => {
                    setShowBookingModal(false);
                    if (confirm('예외 허용을 취소하시겠습니까?\n\n규칙에 의해 다시 차단됩니다.')) {
                      handleCancelException(selectedTimeSlot);
                    }
                  }}
                  disabled={loading}
                  style={{ width: '100%', background: '#f59e0b' }}
                >
                  ❌ 예외 취소 (다시 차단)
                </button>
              )}
              <div style={{ display: 'flex', gap: '12px', width: '100%', flexDirection: 'column' }}>
                {!hasFirstRoundVoteForBooking() && (
                  <div
                    style={{
                      fontSize: 13,
                      color: '#B45309',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 8,
                      padding: '8px 10px',
                      lineHeight: 1.4,
                    }}
                  >
                    평가게시판 1차 투표가 없어 예약이 불가합니다.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowBookingModal(false)}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  취소
                </button>
                <button 
                  className="confirm-btn" 
                  onClick={() => {
                    if (!hasFirstRoundVoteForBooking()) {
                      alert(NO_FIRST_VOTE_BOOKING_MESSAGE);
                      return;
                    }
                    void handleBooking();
                  }}
                  disabled={loading || (!isUnlimitedUser && !isBookingFormValid())}
                  style={{ flex: 1 }}
                >
                  {loading ? '예약 중...' : '예약하기'}
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 예약 상세 모달 */}
      {showDetailModal && selectedTimeSlot?.reservation && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay practice-booking-modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>예약 상세 정보</h3>
              <button className="close-button" onClick={() => setShowDetailModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="booking-info">
                <div className="info-row">
                  <Calendar size={18} />
                  <span>{selectedTimeSlot.reservation.date}</span>
                </div>
                <div className="info-row">
                  <Clock size={18} />
                  <span>
                    {selectedTimeSlot.reservation.startTime} -{' '}
                    {calculateEndTime(
                      selectedTimeSlot.reservation.startTime,
                      getReservationBlockHours(selectedTimeSlot.reservation)
                    )}
                  </span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <strong>이 시간대 예약자</strong>
                  {hideTicketingReservationIdentities ? (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: '#ECFDF5',
                          border: '1px solid #E2E8F0',
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#334155',
                        }}
                      >
                        {formatSlotOccupancyLabel(
                          selectedTimeSlot.reservations,
                          selectedTimeSlot.reservation
                        )}
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: 500 }}>
                          일반 예약자 닉네임은 티켓팅 중 비공개입니다. 관리자 예약은 표시됩니다.
                        </div>
                      </div>
                      {sortReservationsForDisplay(
                        selectedTimeSlot.reservations || [selectedTimeSlot.reservation],
                        priorityRanking
                      )
                        .filter((r) => reservationHasAdminPriority(r))
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              background: '#FEF3C7',
                              border: '1px solid #F59E0B',
                              fontSize: 13,
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{r.userDisplayName} · 관리자</div>
                            {r.members && r.members.length > 0 && (
                              <div style={{ marginTop: 4 }}>👥 {r.members.join(', ')}</div>
                            )}
                            {r.purpose && <div style={{ marginTop: 2 }}>💡 {r.purpose}</div>}
                          </div>
                        ))}
                      {(() => {
                        const hint = getLeadingPriorityHint(
                          selectedTimeSlot.reservations,
                          selectedTimeSlot.reservation
                        );
                        return hint ? (
                          <div
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              fontSize: 13,
                              color: '#1E3A8A',
                              lineHeight: 1.45,
                            }}
                          >
                            {hint}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sortReservationsForDisplay(
                      selectedTimeSlot.reservations || [selectedTimeSlot.reservation],
                      priorityRanking
                    ).map((r, i, arr) => (
                      <div
                        key={r.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: r.status === 'outbid' ? '#F1F5F9' : '#ECFDF5',
                          border: '1px solid #E2E8F0',
                          fontSize: 14,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#334155' }}>
                          {arr.length === 1
                            ? `${r.userDisplayName}(${getReservationPhaseLabel(r) || '예약'})`
                            : `${r.userDisplayName}(${i + 1}순위·${getReservationPhaseLabel(r) || '예약'})`}
                          {r.userId === currentUser?.uid ? ' (나)' : ''}
                          {reservationHasAdminPriority(r) ? ' · 관리자' : ''}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          {getReservationPhaseLabel(r) === '대기'
                            ? '티켓팅 대기 — 월요일 00시에 확정'
                            : getReservationPhaseLabel(r) === '밀림'
                              ? '밀림(다른 시간 재예약 가능)'
                              : getReservationPhaseLabel(r) === '확정'
                                ? '확정'
                                : r.status}
                        </div>
                        {r.members && r.members.length > 0 && (
                          <div style={{ fontSize: 12, marginTop: 4 }}>👥 {r.members.join(', ')}</div>
                        )}
                        {r.purpose && (
                          <div style={{ fontSize: 12, marginTop: 2 }}>💡 {r.purpose}</div>
                        )}
                      </div>
                    ))}
                    {(() => {
                      const hint = getLeadingPriorityHint(
                        selectedTimeSlot.reservations,
                        selectedTimeSlot.reservation
                      );
                      return hint ? (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            fontSize: 13,
                            color: '#1E3A8A',
                            lineHeight: 1.45,
                          }}
                        >
                          {hint}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {selectedTimeSlot.reservation.userId !== currentUser?.uid &&
                (selectedTimeSlot.canSteal || isAdminPriorityUser) &&
                !reservationHasAdminPriority(selectedTimeSlot.reservation) && (
                <button
                  className="confirm-btn"
                  onClick={async () => {
                    if (!selectedTimeSlot || !bookingDate || !selectedTimeSlot.reservation) return;
                    const targetReservation = selectedTimeSlot.reservation;
                    const priorityHint = getLeadingPriorityHint(
                      selectedTimeSlot.reservations,
                      targetReservation
                    );
                    const ok = window.confirm(
                      `이 시간대를 우선 예약하시겠습니까?\n` +
                        `(${targetReservation.date} ${selectedTimeSlot.time})\n` +
                        (priorityHint ? `${priorityHint}\n` : '') +
                        (targetReservation.status === 'pending'
                          ? '기존 대기 예약은 밀림 처리되고 알림이 전송됩니다.'
                          : '기존 예약을 밀림 처리합니다.')
                    );
                    if (!ok) return;
                    setShowDetailModal(false);
                    await openBookingFlow(selectedTimeSlot, bookingDate, {
                      ignoreReservations: true,
                    });
                  }}
                  disabled={loading}
                >
                  우선 예약하기
                </button>
              )}
              {(selectedTimeSlot.reservation.userId === currentUser?.uid || isAdmin) && (
                <>
                  <button 
                    className="delete-btn" 
                    onClick={() => handleCancelReservation(selectedTimeSlot.reservation!)}
                    disabled={loading}
                  >
                    {loading ? '취소 중...' : isAdmin && selectedTimeSlot.reservation.userId !== currentUser?.uid ? '관리자 취소' : '예약 취소'}
                  </button>
                  {isAdmin && selectedTimeSlot.reservation.userId !== currentUser?.uid && (
                    <span className="admin-badge-modal">🔧 관리자 권한</span>
                  )}
                </>
              )}
              <button 
                className="cancel-btn" 
                onClick={() => setShowDetailModal(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 관리자 액션 선택 모달 (예약 또는 차단) */}
      {showAdminActionModal && selectedTimeSlot && bookingDate && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay practice-booking-modal-overlay" onClick={() => setShowAdminActionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔧 관리자 액션 선택</h3>
              <button className="close-button" onClick={() => setShowAdminActionModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="booking-info">
                <div className="info-row">
                  <Calendar size={18} />
                  <span>{formatDate(bookingDate)}</span>
                </div>
                <div className="info-row">
                  <Clock size={18} />
                  <span>{selectedTimeSlot.time} - {selectedTimeSlot.endTime}</span>
                </div>
              </div>
              <p style={{ textAlign: 'center', margin: '20px 0', color: '#6b7280' }}>
                이 시간대를 어떻게 관리하시겠습니까?
              </p>
            </div>
            <div className="modal-footer" style={{ flexDirection: 'column', gap: '12px' }}>
              <button
                className="confirm-btn"
                onClick={async () => {
                  setShowAdminActionModal(false);
                  if (selectedTimeSlot && bookingDate) {
                    await openBookingFlow(selectedTimeSlot, bookingDate);
                  }
                }}
                style={{ width: '100%' }}
              >
                📅 예약하기
              </button>
              <button
                className="delete-btn"
                onClick={() => {
                  setShowAdminActionModal(false);
                  setShowBlockModal(true);
                }}
                style={{ width: '100%', background: '#ef4444' }}
              >
                🚫 이 시간대 차단하기
              </button>
              <button
                className="cancel-btn"
                onClick={() => setShowAdminActionModal(false)}
                style={{ width: '100%' }}
              >
                취소
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 시간대 차단/해제 모달 */}
      {showBlockModal && selectedTimeSlot && bookingDate && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay practice-booking-modal-overlay" onClick={() => setShowBlockModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedTimeSlot.isBlocked ? '🔓 차단 해제' : '🚫 시간대 차단'}</h3>
              <button className="close-button" onClick={() => setShowBlockModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="booking-info">
                <div className="info-row">
                  <Calendar size={18} />
                  <span>{formatDate(bookingDate)}</span>
                </div>
                <div className="info-row">
                  <Clock size={18} />
                  <span>{selectedTimeSlot.time} - {selectedTimeSlot.endTime}</span>
                </div>
              </div>
              
              {selectedTimeSlot.isBlocked ? (
                <>
                  <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', margin: '16px 0' }}>
                    <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>현재 차단 정보</p>
                    <p style={{ margin: '8px 0 0 0', color: '#7f1d1d' }}>
                      📝 사유: {selectedTimeSlot.blockReason}<br />
                      👤 차단자: {selectedTimeSlot.blockedBy}
                      {!selectedTimeSlot.blockId && (
                        <>
                          <br />
                          🔄 <strong>반복 규칙에 의한 자동 차단</strong>
                        </>
                      )}
                    </p>
                  </div>
                  {selectedTimeSlot.blockId ? (
                    <p style={{ textAlign: 'center', color: '#6b7280' }}>
                      이 시간대의 차단을 해제하시겠습니까?
                    </p>
                  ) : (
                    <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px', margin: '16px 0' }}>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '14px', textAlign: 'center' }}>
                        💡 <strong>이 시간대만 예외로 허용</strong>할 수 있습니다.<br />
                        <span style={{ fontSize: '13px', color: '#1e3a8a' }}>
                          규칙은 유지되지만, 이 날짜/시간은 예약 가능하게 됩니다.
                        </span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group" style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                      차단 사유 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 점검, 행사, 휴무 등"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '12px',
                        fontSize: '14px'
                      }}
                      maxLength={50}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => {
                  setShowBlockModal(false);
                  setBlockReason('');
                }}
                disabled={loading}
              >
                취소
              </button>
              {selectedTimeSlot.isBlocked ? (
                selectedTimeSlot.blockId ? (
                  // 개별 차단: 차단 해제
                  <button
                    className="confirm-btn"
                    onClick={handleUnblockTimeSlot}
                    disabled={loading}
                    style={{ background: '#8A55CC' }}
                  >
                    {loading ? '처리 중...' : '차단 해제'}
                  </button>
                ) : (
                  // 규칙 차단: 예외로 허용
                  <button
                    className="confirm-btn"
                    onClick={handleAllowException}
                    disabled={loading}
                    style={{ background: '#10b981' }}
                  >
                    {loading ? '처리 중...' : '✅ 예외로 허용'}
                  </button>
                )
              ) : (
                // 차단하기
                <button
                  className="delete-btn"
                  onClick={handleBlockTimeSlot}
                  disabled={loading}
                  style={{ background: '#ef4444' }}
                >
                  {loading ? '처리 중...' : '차단하기'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {SHOW_PRACTICE_ROOM_CHECK_IN_UI && showCheckInHistoryModal && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay practice-booking-modal-overlay"
          onClick={() => setShowCheckInHistoryModal(false)}
        >
          <div
            className="modal-content check-in-history-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>입실·퇴실 기록 ({checkInHistory.length}건)</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowCheckInHistoryModal(false)}
                aria-label="닫기"
              >
                <X size={24} />
              </button>
            </div>
            <div className="modal-body check-in-history-modal-body">
              {checkInHistory.length === 0 ? (
                <div className="check-in-history-empty">
                  <p>아직 입실·퇴실 기록이 없습니다.</p>
                </div>
              ) : (
                <div className="check-in-history-list check-in-history-list--modal">
                  {checkInHistory.map((record) => renderCheckInHistoryItem(record))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PracticeRoomBookingNotebook;

