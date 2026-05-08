import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp, orderBy, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Clock, User, X, ChevronLeft, ChevronRight, Info, RefreshCw, LogIn, LogOut, Users } from 'lucide-react';
import './PracticeRoomBooking.css';

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
  status: 'confirmed' | 'cancelled';
  reservationGroup?: string;
  isFirstSlot?: boolean;
  createdAt: any;
}

interface TimeSlot {
  time: string;
  endTime: string;
  isAvailable: boolean;
  isPast: boolean;
  isBlocked: boolean;
  isException?: boolean; // 규칙 예외 허용
  blockReason?: string;
  blockedBy?: string;
  blockId?: string;
  reservation?: Reservation;
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

const PracticeRoomBooking: React.FC = () => {
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
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState<1 | 2 | 3>(1);
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
  const [checkedInMembers, setCheckedInMembers] = useState<CheckIn[]>([]);
  const [myCheckIn, setMyCheckIn] = useState<CheckIn | null>(null);
  const isUnlimitedUser = currentUser?.nickname === '너래';

  // 연습실 운영 시간 설정 (09:00 ~ 22:00, 1시간 단위)
  const OPEN_TIME = 9;
  const CLOSE_TIME = 22;
  const SLOT_DURATION = 60; // 분
  const MAX_DAILY_HOURS = 3; // 1인당 하루 최대 예약 시간
  const MAX_WEEKLY_RESERVATIONS = 1; // 1인당 주간 최대 예약 횟수
  const AUTO_CHECKOUT_MS = 4 * 60 * 60 * 1000; // 4시간 자동 퇴실

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
      setIsAdmin(user.nickname === '너래' || user.role === '리더' || user.role === '운영진');
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
    if (currentUser) {
      console.log('날짜 변경됨, 예약 데이터 로딩:', formatDate(selectedDate));
      loadReservations();
      loadMyReservations();
      calculateDailyUsedHours();
      calculateWeeklyReservationCount();
      loadBlockedSlots();
      loadBlockingRules();
    }
  }, [selectedDate, currentUser]);

  // 실시간 입실 현황 로드
  useEffect(() => {
    if (!currentUser) return;

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
      
      // 단순화된 쿼리 (인덱스 불필요)
      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('status', '==', 'confirmed')
      );
      
      const snapshot = await getDocs(q);
      const allData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reservation[];
      
      // 클라이언트 사이드에서 날짜 필터링
      const data = allData.filter(r => {
        return r.date >= formatDate(startDate) && r.date <= formatDate(endDate);
      });
      
      console.log('예약 데이터 로딩됨:', data.length, '건');
      data.forEach(r => {
        console.log(`- ${r.date} ${r.startTime} (${r.userDisplayName})`);
      });
      
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
          // 취소된 예약 제외
          if (r.status !== 'confirmed') return false;
          
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
        const isConfirmed = data.status === 'confirmed';
        
        if (isToday) {
          console.log(`  [${isConfirmed ? '✅' : '❌'}] ${data.startTime} (status: ${data.status})`);
        }
        
        return isToday && isConfirmed;
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
      const weekStartStr = formatDate(getWeekStart(dateToCheck));
      const weekEndStr = formatDate(getWeekEnd(dateToCheck));

      const q = query(
        collection(db, 'practiceRoomReservations'),
        where('userId', '==', currentUser.uid)
      );

      const snapshot = await getDocs(q);
      const weeklyReservations = snapshot.docs.filter((item) => {
        const data = item.data() as Record<string, any>;
        if (data.status !== 'confirmed') return false;
        const dateStr = String(data.date || '');
        return dateStr >= weekStartStr && dateStr <= weekEndStr;
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

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const getWeekEnd = (date: Date): Date => {
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
    
    // 차단 규칙 체크
    const ruleCheck = isBlockedByRule(date);
    
    for (let hour = OPEN_TIME; hour < CLOSE_TIME; hour++) {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      const endTimeStr = `${String(hour + 1).padStart(2, '0')}:00`;
      
      // 과거 시간 체크
      const slotDateTime = new Date(`${dateStr}T${timeStr}`);
      const isPast = slotDateTime < now;
      
      // 해당 날짜와 시간의 예약 찾기
      const reservation = reservations.find(
        r => r.date === dateStr && r.startTime === timeStr
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
      
      if (individualSlot) {
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
        isAvailable: !reservation && !isPast && !isBlocked,
        isPast: isPast,
        isBlocked: isBlocked,
        isException: isException,
        blockReason: blockReason,
        blockedBy: blockedBy,
        blockId: blockId,
        reservation: reservation
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

  const checkMaxAvailableDuration = (startSlot: TimeSlot, date: Date): number => {
    const dateStr = formatDate(date);
    const slots = generateTimeSlots(date);
    const startIdx = slots.findIndex(s => s.time === startSlot.time);
    
    let maxDuration = 0;
    for (let i = 0; i < 3; i++) {
      const checkIdx = startIdx + i;
      if (checkIdx >= slots.length) break;
      
      const checkSlot = slots[checkIdx];
      if (!checkSlot.isAvailable || checkSlot.isPast) break;
      
      maxDuration++;
    }
    
    return maxDuration;
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
    
    // 차단된 시간대 클릭
    if (slot.isBlocked) {
      if (isAdmin) {
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

      // 먼저 화면 상태값으로 즉시 차단/알림
      if (!isUnlimitedUser && weeklyReservationCount >= MAX_WEEKLY_RESERVATIONS) {
        alert('주에 1회만 예약이 가능합니다.');
        return;
      }

      // 이어서 DB 재조회로 재검증 (동시성/다중 탭 대비)
      const weeklyCount = await calculateWeeklyReservationCount(date);
      if (!isUnlimitedUser && weeklyCount >= MAX_WEEKLY_RESERVATIONS) {
        alert('주에 1회만 예약이 가능합니다.');
        return;
      }
      
      // 관리자는 예약/차단/예외취소 선택 모달 표시
      if (isAdmin && !slot.isException) {
        // 일반 예약 가능 시간대 - 예약 또는 차단 선택
        setSelectedTimeSlot({ ...slot });
        setBookingDate(date);
        setShowAdminActionModal(true);
        return;
      }
      
      // 예외 허용된 시간대 포함, 일반 예약 가능 시간대는 예약 진행
      // (관리자든 일반 사용자든 예약 가능)
      
      // 일반 사용자 - 일일 한도 체크
      const currentUsedHours = await calculateDailyUsedHours(date);
      
      // 🚨🚨🚨 핵심: 3시간 이상이면 무조건 차단
      if (currentUsedHours >= MAX_DAILY_HOURS) {
        console.log('');
        console.log('🚫🚫🚫 ========== 예약 차단 ==========');
        console.log('❌ 이유: 일일 한도 초과');
        console.log('📊 현재 사용:', currentUsedHours, '시간');
        console.log('📊 한도:', MAX_DAILY_HOURS, '시간');
        console.log('🚫🚫🚫 ================================');
        console.log('');
        alert('일일 예약은 3시간까지만 가능합니다.');
        return; // 모달 안 띄움
      }
      
      console.log('✅ 예약 가능 - 모달 표시');
      
      const maxDuration = checkMaxAvailableDuration(slot, date);
      const remainingHours = Math.min(maxDuration, MAX_DAILY_HOURS - currentUsedHours);
      
      setMaxAvailableDuration(remainingHours);
      setDuration(Math.min(3, remainingHours) as 1 | 2 | 3);
      setMembers([]);
      setMemberInput('');
      setSelectedTimeSlot({ ...slot });
      setBookingDate(date);
      setShowBookingModal(true);
      console.log('🖱️ ========================================');
      console.log('');
    } else if (slot.reservation) {
      setSelectedTimeSlot(slot);
      setShowDetailModal(true);
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
      window.alert('주에 1회만 예약이 가능합니다.');
      return;
    }
    void handleTimeSlotClick(slot, date);
  };

  const calculateEndTime = (startTime: string, durationHours: number): string => {
    const [hour] = startTime.split(':').map(Number);
    const endHour = hour + durationHours;
    return `${String(endHour).padStart(2, '0')}:00`;
  };

  const handleBooking = async () => {
    if (!selectedTimeSlot || !currentUser || !bookingDate) return;
    
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
      if (!isUnlimitedUser && weeklyCount >= MAX_WEEKLY_RESERVATIONS) {
        alert('주에 1회만 예약이 가능합니다.');
        isBookingInProgress.current = false;
        setLoading(false);
        setShowBookingModal(false);
        return;
      }
      
      // 예약 직전 일일 한도 재확인 (관리자 제외)
      if (!isAdmin) {
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
      
      // 선택한 시간만큼 모든 슬롯이 비어있는지 체크
      const slotsToBook: string[] = [];
      for (let i = 0; i < duration; i++) {
        const checkTime = `${String(startHour + i).padStart(2, '0')}:00`;
        slotsToBook.push(checkTime);
        
        const existingQ = query(
          collection(db, 'practiceRoomReservations'),
          where('date', '==', dateStr),
          where('startTime', '==', checkTime),
          where('status', '==', 'confirmed')
        );
        
        const existingSnapshot = await getDocs(existingQ);
        if (!existingSnapshot.empty) {
          alert(`${checkTime} 시간대가 이미 예약되어 있습니다.`);
          isBookingInProgress.current = false;
          setLoading(false);
          setShowBookingModal(false);
          return;
        }
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
          members: members.length > 0 ? members : [],
          date: dateStr,
          startTime: slotStartTime,
          endTime: slotEndTime,
          duration: SLOT_DURATION,
          totalDuration: duration * SLOT_DURATION,
          purpose: purpose || '',
          status: 'confirmed',
          reservationGroup: reservationGroup,
          isFirstSlot: i === 0,
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
      
      alert(
        `${reservedDuration}시간 예약 완료!\n\n${dateStr}\n일일 사용: ${newUsedHours}/${MAX_DAILY_HOURS}시간\n주간 예약: ${newWeeklyCount}/${MAX_WEEKLY_RESERVATIONS}회`
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
          if (r.status !== 'confirmed') return false;
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
    if (trimmedInput && !members.includes(trimmedInput)) {
      setMembers([...members, trimmedInput]);
      setMemberInput('');
    }
  };

  const handleRemoveMember = (memberToRemove: string) => {
    setMembers(members.filter(m => m !== memberToRemove));
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
      await loadReservations();
      await loadMyReservations();
      await calculateDailyUsedHours();
      await calculateWeeklyReservationCount();
      await loadBlockedSlots();
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

  // 입실 시간 포맷팅
  const formatCheckInTime = (checkInTime: any): string => {
    if (!checkInTime) return '';
    
    let date: Date;
    if (checkInTime instanceof Timestamp) {
      date = checkInTime.toDate();
    } else if (checkInTime.toDate) {
      date = checkInTime.toDate();
    } else {
      date = new Date(checkInTime);
    }

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

  const weekDates = getWeekDates();

  return (
    <div className="practice-room-booking">
      <div className="booking-header">
        <button className="booking-back-button" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1>🎹 연습실 예약</h1>
        <div className="header-buttons">
          {currentUser?.nickname === '너래' && (
            <button 
              className="management-button" 
              onClick={() => navigate('/practice-room-management')}
              title="연습실 관리"
            >
              ⚙️
            </button>
          )}
          <button 
            className="refresh-button" 
            onClick={handleManualRefresh}
            disabled={loading}
            title="새로고침"
          >
            <RefreshCw size={20} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* 현재 입실 현황 섹션 */}
      <div className="check-in-section">
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
                  {formatCheckInTime(checkIn.checkInTime)}
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
      </div>

      <div className="booking-controls">
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
        {!isAdmin && (
          <div className="daily-limit-info">
            <span className="limit-icon">⏰</span>
            <span className="limit-text">
              오늘 사용: <strong>{dailyUsedHours}</strong> / {MAX_DAILY_HOURS}시간
            </span>
            <span className="limit-text">
              이번 주 예약: <strong>{weeklyReservationCount}</strong> / {MAX_WEEKLY_RESERVATIONS}회
            </span>
          </div>
        )}
      </div>

      {/* 뷰 렌더링 */}
      {isMobile ? (
        /* 모바일 일간 뷰 */
        <div className="day-view-mobile">
          <div className="day-slots">
            {generateTimeSlots(selectedDate).map((slot, idx) => {
              const isMyReservation = slot.reservation?.userId === currentUser?.uid;
              
              return (
                <div
                  key={idx}
                  className={`mobile-time-slot ${
                    slot.isPast ? 'past' : slot.isBlocked ? 'blocked' : slot.isAvailable ? 'available' : 'reserved'
                  } ${isMyReservation ? 'my-reservation' : ''} ${slot.isException ? 'exception' : ''}`}
                  onClick={(e) => handleSlotActivate(slot, selectedDate, e)}
                >
                  <div className="mobile-slot-time">
                    <span className="time-label-large">{slot.time}</span>
                    <span className="time-separator">-</span>
                    <span className="time-label-small">{slot.endTime}</span>
                  </div>
                  <div className="mobile-slot-content">
                    {slot.isPast ? (
                      <span className="slot-status past-label">지난 시간</span>
                    ) : slot.isBlocked ? (
                      <div className="blocked-card">
                        <div className="blocked-header">
                          🚫 차단됨
                        </div>
                        {slot.blockReason && (
                          <div className="blocked-reason">
                            {slot.blockReason}
                          </div>
                        )}
                      </div>
                    ) : slot.isAvailable ? (
                      <div className="available-status">
                        <span className="slot-status available-label">예약 가능</span>
                        {slot.isException && isAdmin && (
                          <span className="exception-badge">✅ 예외 허용</span>
                        )}
                      </div>
                    ) : slot.reservation ? (
                      <div className="reservation-card">
                        <div className="reservation-header">
                          <User size={14} />
                          <span className="reservation-user">
                            {isMyReservation ? '내 예약' : slot.reservation.userDisplayName}
                          </span>
                        </div>
                        {slot.reservation.members && slot.reservation.members.length > 0 && (
                          <div className="reservation-members-mobile">
                            👥 {slot.reservation.members.join(', ')}
                          </div>
                        )}
                        {slot.reservation.purpose && (
                          <div className="reservation-purpose-mobile">
                            💡 {slot.reservation.purpose}
                          </div>
                        )}
                        {(isMyReservation || isAdmin) && (
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
            })}
          </div>
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
                  const slots = generateTimeSlots(date);
                  const slot = slots[hourIdx];
                  const isMyReservation = slot.reservation?.userId === currentUser?.uid;
                  
                  return (
                    <div
                      key={`${dayIdx}-${hourIdx}`}
                      className={`time-slot ${
                        slot.isPast ? 'past' : slot.isBlocked ? 'blocked' : slot.isAvailable ? 'available' : 'reserved'
                      } ${isMyReservation ? 'my-reservation' : ''} ${slot.isException ? 'exception' : ''}`}
                      onClick={(e) => handleSlotActivate(slot, date, e)}
                      style={{ cursor: slot.isPast ? 'not-allowed' : 'pointer' }}
                    >
                      {slot.isBlocked ? (
                        <div className="blocked-info">
                          <span className="blocked-label">🚫</span>
                          {slot.blockReason && (
                            <span className="blocked-reason-small">{slot.blockReason}</span>
                          )}
                        </div>
                      ) : slot.isAvailable && slot.isException && isAdmin ? (
                        <div className="exception-info">
                          <span className="exception-icon">✅</span>
                        </div>
                      ) : slot.reservation && (
                        <div className="reservation-info">
                          <span className="user-name">
                            {isMyReservation ? '내 예약' : slot.reservation.userDisplayName}
                          </span>
                          {slot.reservation.members && slot.reservation.members.length > 0 && (
                            <span className="member-names">
                              👥 {slot.reservation.members.join(', ')}
                            </span>
                          )}
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
        <div className="my-reservations-section">
          <h2>📋 내 예약 목록</h2>
          <div className="my-reservations-list">
            {myReservations.map((reservation) => (
              <div key={reservation.id} className="my-reservation-item">
                <div className="reservation-date">
                  <Calendar size={16} />
                  <span>{reservation.date}</span>
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
        </div>
      )}

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
              <div style={{ background: '#d1fae5', padding: '10px 20px', borderTop: '1px solid #6ee7b7' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#065f46', textAlign: 'center' }}>
                  ✅ <strong>규칙 예외로 허용된 시간대</strong>입니다
                  {isAdmin && <span style={{ fontSize: '12px' }}> (취소는 하단 버튼)</span>}
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
                  {[1, 2, 3].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      className={`duration-button ${duration === hours ? 'active' : ''} ${hours > maxAvailableDuration ? 'disabled' : ''}`}
                      onClick={() => hours <= maxAvailableDuration && setDuration(hours as 1 | 2 | 3)}
                      disabled={hours > maxAvailableDuration}
                    >
                      {hours}시간
                    </button>
                  ))}
                </div>
                {!isAdmin && (
                  <p className="duration-hint daily-limit">
                    📊 오늘 예약 가능: {MAX_DAILY_HOURS - dailyUsedHours}시간 (사용: {dailyUsedHours}/{MAX_DAILY_HOURS}시간)
                  </p>
                )}
                {maxAvailableDuration < 3 && (
                  <p className="duration-hint">
                    ⚠️ 연속된 시간대가 비어있지 않아 최대 {maxAvailableDuration}시간까지만 예약 가능합니다.
                  </p>
                )}
                <p className="duration-info">
                  💡 기본적으로 최대 시간이 선택됩니다. 필요시 변경하세요.
                </p>
              </div>
              <div className="members-input">
                <label>함께 사용할 멤버 (선택)</label>
                <div className="member-input-container">
                  <input
                    type="text"
                    placeholder="멤버 닉네임 입력 후 추가 버튼 클릭"
                    value={memberInput}
                    onChange={(e) => setMemberInput(e.target.value)}
                    onKeyPress={handleMemberInputKeyPress}
                    maxLength={20}
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
                <label>사용 목적 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 밴드 합주, 개인 연습 등"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  maxLength={50}
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
                  onClick={handleBooking}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? '예약 중...' : '예약하기'}
                </button>
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
                  <User size={18} />
                  <span>{selectedTimeSlot.reservation.userDisplayName}</span>
                </div>
                <div className="info-row">
                  <Calendar size={18} />
                  <span>{selectedTimeSlot.reservation.date}</span>
                </div>
                <div className="info-row">
                  <Clock size={18} />
                  <span>
                    {selectedTimeSlot.reservation.startTime} - {selectedTimeSlot.reservation.endTime}
                  </span>
                </div>
                {selectedTimeSlot.reservation.members && selectedTimeSlot.reservation.members.length > 0 && (
                  <div className="members-display">
                    <strong>👥 함께 사용하는 멤버:</strong>
                    <div className="members-tags">
                      {selectedTimeSlot.reservation.members.map((member, idx) => (
                        <span key={idx} className="member-tag-display">{member}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTimeSlot.reservation.purpose && (
                  <div className="purpose-display">
                    <strong>💡 사용 목적:</strong>
                    <p>{selectedTimeSlot.reservation.purpose}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
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
                onClick={() => {
                  setShowAdminActionModal(false);
                  // 관리자도 예약 가능하도록 설정
                  const maxDuration = checkMaxAvailableDuration(selectedTimeSlot, bookingDate);
                  setMaxAvailableDuration(maxDuration);
                  setDuration(Math.min(3, maxDuration) as 1 | 2 | 3);
                  setMembers([]);
                  setMemberInput('');
                  setShowBookingModal(true);
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
    </div>
  );
};

export default PracticeRoomBooking;

