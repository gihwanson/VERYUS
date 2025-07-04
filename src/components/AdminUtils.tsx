import type { AdminUser, ExtendedUserStats, UserActivity, UserAnalytics, BulkAction } from './AdminTypes';
import { GRADE_ORDER, GRADE_NAMES, ROLE_OPTIONS, GRADE_SYSTEM, ROLE_SYSTEM, USER_STATUS, USER_STATUS_LABELS, USER_STATUS_COLORS, ACTIVITY_SCORES, ACTIVITY_LABELS, ADMIN_ACTION_LABELS, ADMIN_ACTION_COLORS, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_COLORS, type UserStatus, type ActivityStats, type UserActivitySummary, type AdminLog, type AdminAction, type LogFilter, type LogStats, type Notification, type NotificationType, type NotificationStatus, type NotificationTemplate, type NotificationStats, type NotificationTarget } from './AdminTypes';
import { Crown, Shield, User, TrendingUp, Activity, Users, Clock, Award, MessageSquare, Heart, FileText, History, Search, Filter, Edit3, Trash2, AlertCircle, Settings, Download, LogIn, Bell, Send, Save, Plus, CheckCircle, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { collection, doc, getDocs, updateDoc, addDoc, serverTimestamp, query, where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../firebase';


// 날짜 포맷팅
export const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-';
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ko-KR');
};

// 등급 표시
export const getGradeDisplay = (grade: string): string => {
  return `${grade} ${GRADE_NAMES[grade] || ''}`;
};

// 등급 이름 가져오기
export const getGradeName = (emoji: string): string => {
  return GRADE_NAMES[emoji] || emoji;
};

// 역할 표시 컴포넌트 생성 함수
export const createRoleDisplay = (role: string) => {
  const roleConfig: Record<string, { icon: any; className: string; label: string }> = {
    [ROLE_SYSTEM.LEADER]: { icon: Crown, className: 'leader', label: '리더' },
    [ROLE_SYSTEM.ADMIN]: { icon: Shield, className: 'admin', label: '운영진' },
    [ROLE_SYSTEM.SUB_ADMIN]: { icon: Shield, className: 'sub-admin', label: '부운영진' },
    [ROLE_SYSTEM.MEMBER]: { icon: User, className: 'member', label: '일반' }
  };

  const config = roleConfig[role] || roleConfig[ROLE_SYSTEM.MEMBER];
  const IconComponent = config.icon;

  return (
    <span className={`role-badge ${config.className}`}>
      <IconComponent size={12} />
      {config.label}
    </span>
  );
};

// 역할 아이콘 컴포넌트 생성 함수
export const createRoleIcon = (role: string) => {
  const roleConfig: Record<string, { icon: any; className: string }> = {
    [ROLE_SYSTEM.LEADER]: { icon: Crown, className: 'leader' },
    [ROLE_SYSTEM.ADMIN]: { icon: Shield, className: 'admin' },
    [ROLE_SYSTEM.SUB_ADMIN]: { icon: Shield, className: 'sub-admin' },
    [ROLE_SYSTEM.MEMBER]: { icon: User, className: 'member' }
  };

  const config = roleConfig[role] || roleConfig[ROLE_SYSTEM.MEMBER];
  const IconComponent = config.icon;

  return <IconComponent size={16} className={`role-icon ${config.className}`} />;
};

// 통계 계산
export const calculateStats = (usersData: AdminUser[]): ExtendedUserStats => {
  const totalUsers = usersData.length;
  const adminCount = usersData.filter(u => 
    u.role === ROLE_SYSTEM.ADMIN || u.role === ROLE_SYSTEM.LEADER
  ).length;
  
  // 등급 분포
  const gradeDistribution: Record<string, number> = {};
  usersData.forEach(user => {
    gradeDistribution[user.grade] = (gradeDistribution[user.grade] || 0) + 1;
  });
  
  // 역할 분포
  const roleDistribution: Record<string, number> = {};
  usersData.forEach(user => {
    roleDistribution[user.role] = (roleDistribution[user.role] || 0) + 1;
  });

  // 최근 가입자 (한달 이내)
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const recentJoins = usersData.filter(user => {
    const createdDate = user.createdAt instanceof Timestamp ? user.createdAt.toDate() : new Date(user.createdAt);
    return createdDate > oneMonthAgo;
  }).length;

  // 활성 사용자 (실제로는 최근 활동 시간을 확인해야 함)
  const activeUsers = totalUsers;

  // 평균 등급 계산
  const averageGrade = calculateAverageGrade(usersData);

  return {
    totalUsers,
    adminCount,
    activeUsers,
    recentJoins,
    averageGrade,
    gradeDistribution,
    roleDistribution,
    inactiveUsers: 0, // TODO: 실제 계산 로직 구현
    topContributors: [], // TODO: 실제 계산 로직 구현
    recentActivity: [] // TODO: 실제 계산 로직 구현
  };
};

// 평균 등급 계산
export const calculateAverageGrade = (usersData: AdminUser[]): string => {
  if (usersData.length === 0) return '-';
  
  const gradeIndexSum = usersData.reduce((sum, user) => {
    const gradeIndex = GRADE_ORDER.indexOf(user.grade as any);
    return sum + (gradeIndex >= 0 ? gradeIndex : 0);
  }, 0);
  
  const averageIndex = Math.round(gradeIndexSum / usersData.length);
  const averageGradeEmoji = GRADE_ORDER[averageIndex] || GRADE_SYSTEM.CHERRY;
  
  return `${averageGradeEmoji} ${GRADE_NAMES[averageGradeEmoji]}`;
};

// 활동 일수 계산
export const calculateActivityDays = (createdAt: any): number => {
  if (!createdAt) return 0;
  const createdDate = createdAt instanceof Timestamp ? createdAt.toDate() : new Date(createdAt);
  const now = new Date();
  const diffTime = now.getTime() - createdDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// 다음 등급 가져오기
export const getNextGrade = (currentGrade: string): string => {
  const currentIndex = GRADE_ORDER.indexOf(currentGrade as any);
  if (currentIndex === -1 || currentIndex === GRADE_ORDER.length - 1) {
    return currentGrade;
  }
  return GRADE_ORDER[currentIndex + 1];
};

// 예상 등급 계산
export const getExpectedGrade = (user: AdminUser): string => {
  const activityDays = calculateActivityDays(user.createdAt);
  const expectedGradeIndex = Math.min(
    Math.floor(activityDays / 90),
    GRADE_ORDER.length - 1
  );
  
  if (expectedGradeIndex <= 0) return '-';
  
  const expectedGrade = GRADE_ORDER[expectedGradeIndex];
  return expectedGrade;
};

// 승급 가능 여부 확인
export const canPromote = (user: AdminUser): boolean => {
  const activityDays = calculateActivityDays(user.createdAt);
  const currentGradeIndex = GRADE_ORDER.indexOf(user.grade as any);
  const maxGradeIndex = Math.min(
    Math.floor(activityDays / 90),
    GRADE_ORDER.length - 1
  );
  
  if (activityDays < 90) return false;
  return currentGradeIndex < maxGradeIndex;
};

// 사용자 정렬 함수
export const sortUsers = (users: AdminUser[], sortBy: string, sortOrder: 'asc' | 'desc' = 'asc') => {
  return [...users].sort((a, b) => {
    let aValue: any, bValue: any;

    switch (sortBy) {
      case 'nickname':
        aValue = a.nickname.toLowerCase();
        bValue = b.nickname.toLowerCase();
        break;
      case 'grade':
        aValue = GRADE_ORDER.indexOf(a.grade as any);
        bValue = GRADE_ORDER.indexOf(b.grade as any);
        break;
      case 'role':
        aValue = ROLE_OPTIONS.indexOf(a.role as any);
        bValue = ROLE_OPTIONS.indexOf(b.role as any);
        break;
      case 'createdAt':
        aValue = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        bValue = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
};

// 사용자 필터링 함수
export const filterUsers = (users: AdminUser[], filters: {
  search?: string;
  grade?: string;
  role?: string;
  status?: string;
}) => {
  return users.filter(user => {
    // 검색 필터
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        user.nickname.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // 등급 필터
    if (filters.grade && user.grade !== filters.grade) {
      return false;
    }

    // 역할 필터
    if (filters.role && user.role !== filters.role) {
      return false;
    }

    // 상태 필터
    if (filters.status) {
      const userStatus = getUserStatus(user);
      if (userStatus !== filters.status) {
        return false;
      }
    }

    return true;
  });
};

// 엑셀 내보내기
export const exportToExcel = (users: AdminUser[]) => {
  const headers = ['닉네임', '이메일', '등급', '역할', '가입일', 'UID'];
  const csvContent = [
    headers.join(','),
    ...users.map(user => [
      user.nickname,
      user.email,
      `"${user.grade} ${GRADE_NAMES[user.grade] || ''}"`,
      user.role,
      formatDate(user.createdAt),
      user.uid
    ].join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `veryus_users_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// 사용자 활동 점수 계산
export const calculateActivityScore = (activities: UserActivity[]): number => {
  return activities.reduce((total, activity) => {
    const score = activity.score || ACTIVITY_SCORES[activity.action as keyof typeof ACTIVITY_SCORES] || 0;
    return total + score;
  }, 0);
};

// 기간별 활동 점수 계산
export const calculatePeriodActivityScore = (activities: UserActivity[], days: number): number => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentActivities = activities.filter(activity => {
    const activityDate = activity.timestamp instanceof Timestamp ? 
      activity.timestamp.toDate() : new Date(activity.timestamp);
    return activityDate >= cutoffDate;
  });
  
  return calculateActivityScore(recentActivities);
};

// 활동 통계 계산
export const calculateActivityStats = (activities: UserActivity[]): ActivityStats => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const weeklyActivities = activities.filter(activity => {
    const activityDate = activity.timestamp instanceof Timestamp ? 
      activity.timestamp.toDate() : new Date(activity.timestamp);
    return activityDate >= weekAgo;
  });
  
  const monthlyActivities = activities.filter(activity => {
    const activityDate = activity.timestamp instanceof Timestamp ? 
      activity.timestamp.toDate() : new Date(activity.timestamp);
    return activityDate >= monthAgo;
  });
  
  // 활동 타입별 카운트
  const totalPosts = activities.filter(a => a.action === 'post').length;
  const totalComments = activities.filter(a => a.action === 'comment').length;
  const totalLikes = activities.filter(a => a.action === 'like').length;
  
  // 일별/시간별 활동 분석
  const dailyActivity: Record<string, number> = {};
  const hourlyActivity: Record<number, number> = {};
  
  activities.forEach(activity => {
    const activityDate = activity.timestamp instanceof Timestamp ? 
      activity.timestamp.toDate() : new Date(activity.timestamp);
    
    const dayKey = activityDate.toLocaleDateString('ko-KR');
    dailyActivity[dayKey] = (dailyActivity[dayKey] || 0) + 1;
    
    const hour = activityDate.getHours();
    hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
  });
  
  const mostActiveDay = Object.entries(dailyActivity)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || '없음';
  
  const mostActiveHour = Object.entries(hourlyActivity)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || '0';
  
  return {
    totalPosts,
    totalComments,
    totalLikes,
    weeklyActivity: calculateActivityScore(weeklyActivities),
    monthlyActivity: calculateActivityScore(monthlyActivities),
    averageDailyActivity: activities.length / Math.max(1, Object.keys(dailyActivity).length),
    mostActiveDay,
    mostActiveHour: parseInt(mostActiveHour)
  };
};

// 사용자 활동 요약 생성
export const generateUserActivitySummary = async (user: AdminUser): Promise<UserActivitySummary> => {
  // 실제로는 Firestore에서 사용자 활동 데이터를 가져와야 함
  // 여기서는 더미 데이터로 시뮬레이션
  const dummyActivities: UserActivity[] = [
    {
      uid: user.uid,
      nickname: user.nickname,
      action: 'login',
      timestamp: new Date(),
      score: ACTIVITY_SCORES.LOGIN
    },
    {
      uid: user.uid,
      nickname: user.nickname,
      action: 'post',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      score: ACTIVITY_SCORES.POST
    },
    {
      uid: user.uid,
      nickname: user.nickname,
      action: 'comment',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      score: ACTIVITY_SCORES.COMMENT
    }
  ];
  
  const activityStats = calculateActivityStats(dummyActivities);
  
  return {
    uid: user.uid,
    nickname: user.nickname,
    lastLoginAt: user.lastLoginAt,
    lastActivityAt: user.lastActivityAt,
    totalActivityScore: calculateActivityScore(dummyActivities),
    weeklyActivityScore: activityStats.weeklyActivity,
    monthlyActivityScore: activityStats.monthlyActivity,
    activityStats,
    recentActivities: dummyActivities.slice(0, 10) // 최근 10개 활동
  };
};

// 활동 내역 가져오기 (실제 구현 시 사용)
export const fetchUserActivities = async (uid: string, limit: number = 50): Promise<UserActivity[]> => {
  try {
    const activitiesQuery = query(
      collection(db, 'user_activities'),
      where('uid', '==', uid),
      orderBy('timestamp', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(activitiesQuery);
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp
    })) as UserActivity[];
  } catch (error) {
    console.error('활동 내역 가져오기 실패:', error);
    return [];
  }
};

// 활동 아이콘 생성
export const getActivityIcon = (action: string) => {
  const iconMap: Record<string, any> = {
    login: User,
    post: FileText,
    comment: MessageSquare,
    like: Heart,
    grade_up: Award,
    profile_update: User,
    contest_participate: Activity
  };
  
  return iconMap[action] || Activity;
};

// 활동 시간 포맷팅
export const formatActivityTime = (timestamp: any): string => {
  if (!timestamp) return '-';
  
  const activityDate = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - activityDate.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  
  return activityDate.toLocaleDateString('ko-KR');
};

// 활동 점수 레벨 계산
export const getActivityLevel = (score: number): { level: string; color: string } => {
  if (score >= 1000) return { level: '매우 활성', color: '#10b981' };
  if (score >= 500) return { level: '활성', color: '#3b82f6' };
  if (score >= 200) return { level: '보통', color: '#f59e0b' };
  if (score >= 50) return { level: '낮음', color: '#6b7280' };
  return { level: '비활성', color: '#ef4444' };
};

// 사용자 상태 가져오기
export const getUserStatus = (user: AdminUser): UserStatus => {
  if (user.status) return user.status;
  
  // 기본 상태 계산
  if (user.suspendedUntil) {
    const suspendedUntil = user.suspendedUntil instanceof Timestamp ? 
      user.suspendedUntil.toDate() : new Date(user.suspendedUntil);
    if (suspendedUntil > new Date()) {
      return USER_STATUS.SUSPENDED;
    }
  }
  
  if (user.isActive === false) {
    return USER_STATUS.INACTIVE;
  }
  
  return USER_STATUS.ACTIVE;
};

// 사용자 상태 표시 컴포넌트 생성
export const createStatusDisplay = (status: UserStatus) => {
  const label = USER_STATUS_LABELS[status];
  const color = USER_STATUS_COLORS[status];
  
  return (
    <span 
      className="status-badge"
      style={{
        backgroundColor: color,
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontWeight: '600'
      }}
    >
      {label}
    </span>
  );
};

// 사용자 상태 변경
export const changeUserStatus = async (
  uid: string, 
  status: UserStatus, 
  suspendedUntil?: Date,
  suspensionReason?: string
) => {
  const userRef = doc(db, 'users', uid);
  const updateData: any = { status };
  
  if (status === USER_STATUS.SUSPENDED && suspendedUntil) {
    updateData.suspendedUntil = suspendedUntil;
    updateData.suspensionReason = suspensionReason || '';
  } else if (status === USER_STATUS.ACTIVE) {
    updateData.isActive = true;
    updateData.suspendedUntil = null;
    updateData.suspensionReason = '';
  } else if (status === USER_STATUS.INACTIVE) {
    updateData.isActive = false;
  }
  
  await updateDoc(userRef, updateData);
};

// 정지 기간 확인
export const isUserSuspended = (user: AdminUser): boolean => {
  if (!user.suspendedUntil) return false;
  
  const suspendedUntil = user.suspendedUntil instanceof Timestamp ? 
    user.suspendedUntil.toDate() : new Date(user.suspendedUntil);
  
  return suspendedUntil > new Date();
};

// 정지 남은 시간 계산
export const getSuspensionTimeLeft = (user: AdminUser): string => {
  if (!user.suspendedUntil) return '';
  
  const suspendedUntil = user.suspendedUntil instanceof Timestamp ? 
    user.suspendedUntil.toDate() : new Date(user.suspendedUntil);
  const now = new Date();
  
  if (suspendedUntil <= now) return '';
  
  const diff = suspendedUntil.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}일 ${hours}시간`;
  return `${hours}시간`;
};

// 대량 작업 실행
export const executeBulkAction = async (action: BulkAction, users: AdminUser[]): Promise<{ success: number; failed: number; errors: string[] }> => {
  const results = { success: 0, failed: 0, errors: [] as string[] };
  
  for (const uid of action.targetUsers) {
    try {
      const user = users.find(u => u.uid === uid);
      if (!user) {
        results.failed++;
        results.errors.push(`사용자 ${uid}를 찾을 수 없습니다.`);
        continue;
      }
      
      switch (action.type) {
        case 'grade_promotion':
          const nextGrade = getNextGrade(user.grade);
          if (nextGrade !== user.grade) {
            // 실제 업데이트 로직은 여기에 구현
            results.success++;
          }
          break;
        case 'role_change':
          if (action.parameters?.newRole) {
            // 실제 업데이트 로직은 여기에 구현
            results.success++;
          }
          break;
        case 'deactivation':
          // 실제 비활성화 로직은 여기에 구현
          results.success++;
          break;
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`사용자 ${uid} 처리 중 오류: ${error}`);
    }
  }
  
  return results;
};

// 사용자 분석 데이터 생성
export const generateUserAnalytics = (users: AdminUser[], activities: UserActivity[]): UserAnalytics => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const dailyActiveUsers = users.filter(user => {
    if (!user.lastLoginAt) return false;
    const lastLogin = user.lastLoginAt instanceof Timestamp ? user.lastLoginAt.toDate() : new Date(user.lastLoginAt);
    return lastLogin > oneDayAgo;
  }).length;
  
  const weeklyActiveUsers = users.filter(user => {
    if (!user.lastLoginAt) return false;
    const lastLogin = user.lastLoginAt instanceof Timestamp ? user.lastLoginAt.toDate() : new Date(user.lastLoginAt);
    return lastLogin > oneWeekAgo;
  }).length;
  
  const monthlyActiveUsers = users.filter(user => {
    if (!user.lastLoginAt) return false;
    const lastLogin = user.lastLoginAt instanceof Timestamp ? user.lastLoginAt.toDate() : new Date(user.lastLoginAt);
    return lastLogin > oneMonthAgo;
  }).length;
  
  // 활동 시간대 분석
  const activityHours = activities.map(activity => {
    const timestamp = activity.timestamp instanceof Timestamp ? activity.timestamp.toDate() : new Date(activity.timestamp);
    return timestamp.getHours();
  });
  
  const hourCounts = new Array(24).fill(0);
  activityHours.forEach(hour => hourCounts[hour]++);
  const mostActiveHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(item => item.hour);
  
  return {
    dailyActiveUsers,
    weeklyActiveUsers,
    monthlyActiveUsers,
    averageSessionDuration: 30, // 실제 계산 로직 필요
    mostActiveHours,
    popularContentTypes: ['게시글', '댓글', '좋아요'] // 실제 분석 로직 필요
  };
};

// 사용자 검색 및 필터링 개선
export const advancedUserSearch = (users: AdminUser[], searchParams: {
  keyword?: string;
  grade?: string;
  role?: string;
  status?: string;
  dateRange?: { start: Date; end: Date };
  activityScore?: { min: number; max: number };
}) => {
  return users.filter(user => {
    // 키워드 검색
    if (searchParams.keyword) {
      const keyword = searchParams.keyword.toLowerCase();
      const matchesKeyword = 
        user.nickname.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword) ||
        user.uid.toLowerCase().includes(keyword);
      if (!matchesKeyword) return false;
    }
    
    // 등급 필터
    if (searchParams.grade && user.grade !== searchParams.grade) {
      return false;
    }
    
    // 역할 필터
    if (searchParams.role && user.role !== searchParams.role) {
      return false;
    }
    
    // 상태 필터
    if (searchParams.status) {
      const userStatus = getUserStatus(user);
      if (userStatus !== searchParams.status) {
        return false;
      }
    }
    
    // 날짜 범위 필터
    if (searchParams.dateRange) {
      const createdDate = user.createdAt instanceof Timestamp ? user.createdAt.toDate() : new Date(user.createdAt);
      if (createdDate < searchParams.dateRange.start || createdDate > searchParams.dateRange.end) {
        return false;
      }
    }
    
    // 활동 점수 필터
    if (searchParams.activityScore) {
      const userScore = user.totalActivityScore || 0;
      if (userScore < searchParams.activityScore.min || userScore > searchParams.activityScore.max) {
        return false;
      }
    }
    
    return true;
  });
};

// 사용자 통계 대시보드 데이터
export const generateDashboardData = (users: AdminUser[], activities: UserActivity[]) => {
  const totalUsers = users.length;
  const activeUsers = users.filter(user => getUserStatus(user) === USER_STATUS.ACTIVE).length;
  const inactiveUsers = users.filter(user => getUserStatus(user) === USER_STATUS.INACTIVE).length;
  const suspendedUsers = users.filter(user => getUserStatus(user) === USER_STATUS.SUSPENDED).length;
  
  // 최근 가입자 (7일 이내)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const recentJoins = users.filter(user => {
    const createdDate = user.createdAt instanceof Timestamp ? user.createdAt.toDate() : new Date(user.createdAt);
    return createdDate > oneWeekAgo;
  }).length;
  
  // 상위 기여자 (활동 점수 기준)
  const usersWithScores = users.map(user => ({
    ...user,
    activityScore: calculateActivityScore(activities)
  }));
  
  const topContributors = usersWithScores
    .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0))
    .slice(0, 5);
  
  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    suspendedUsers,
    recentJoins,
    topContributors,
    gradeDistribution: calculateGradeDistribution(users),
    roleDistribution: calculateRoleDistribution(users)
  };
};

// 등급 분포 계산
const calculateGradeDistribution = (users: AdminUser[]) => {
  const distribution: Record<string, number> = {};
  GRADE_ORDER.forEach(grade => {
    distribution[grade] = users.filter(user => user.grade === grade).length;
  });
  return distribution;
};

// 역할 분포 계산
const calculateRoleDistribution = (users: AdminUser[]) => {
  const distribution: Record<string, number> = {};
  ROLE_OPTIONS.forEach(role => {
    distribution[role] = users.filter(user => user.role === role).length;
  });
  return distribution;
};

// 관리자 로그 기록
export const logAdminAction = async (
  adminUid: string,
  adminNickname: string,
  action: AdminAction,
  details: string,
  targetUid?: string,
  targetNickname?: string,
  beforeValue?: any,
  afterValue?: any
) => {
  try {
    const logData: Omit<AdminLog, 'id' | 'timestamp'> = {
      adminUid,
      adminNickname,
      action,
      details,
      targetUid,
      targetNickname,
      beforeValue,
      afterValue,
      ipAddress: '127.0.0.1', // 실제로는 클라이언트 IP 가져오기
      userAgent: navigator.userAgent
    };

    await addDoc(collection(db, 'admin_logs'), {
      ...logData,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('로그 기록 실패:', error);
  }
};

// 로그 조회
export const fetchAdminLogs = async (
  filters: LogFilter = {},
  limit: number = 100
): Promise<AdminLog[]> => {
  try {
    let logsQuery = query(
      collection(db, 'admin_logs'),
      orderBy('timestamp', 'desc')
    );

    // 필터 적용
    if (filters.adminUid) {
      logsQuery = query(logsQuery, where('adminUid', '==', filters.adminUid));
    }
    if (filters.action) {
      logsQuery = query(logsQuery, where('action', '==', filters.action));
    }
    if (filters.targetUid) {
      logsQuery = query(logsQuery, where('targetUid', '==', filters.targetUid));
    }

    const snapshot = await getDocs(logsQuery);
    let logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as AdminLog[];

    // 날짜 필터 적용 (클라이언트 사이드)
    if (filters.dateRange) {
      logs = logs.filter(log => {
        const logDate = log.timestamp instanceof Timestamp ? 
          log.timestamp.toDate() : new Date(log.timestamp);
        return logDate >= filters.dateRange!.start && logDate <= filters.dateRange!.end;
      });
    }

    // 검색 필터 적용
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      logs = logs.filter(log => 
        log.adminNickname.toLowerCase().includes(searchLower) ||
        log.targetNickname?.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower)
      );
    }

    return logs.slice(0, limit);
  } catch (error) {
    console.error('로그 조회 실패:', error);
    return [];
  }
};

// 로그 통계 계산
export const calculateLogStats = (logs: AdminLog[]): LogStats => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const todayLogs = logs.filter(log => {
    const logDate = log.timestamp instanceof Timestamp ? 
      log.timestamp.toDate() : new Date(log.timestamp);
    return logDate >= today;
  }).length;

  const weeklyLogs = logs.filter(log => {
    const logDate = log.timestamp instanceof Timestamp ? 
      log.timestamp.toDate() : new Date(log.timestamp);
    return logDate >= weekAgo;
  }).length;

  const monthlyLogs = logs.filter(log => {
    const logDate = log.timestamp instanceof Timestamp ? 
      log.timestamp.toDate() : new Date(log.timestamp);
    return logDate >= monthAgo;
  }).length;

  // 액션별 분포
  const actionDistribution: Record<AdminAction, number> = {} as any;
  logs.forEach(log => {
    actionDistribution[log.action] = (actionDistribution[log.action] || 0) + 1;
  });

  // 관리자별 분포
  const adminDistribution: Record<string, number> = {};
  logs.forEach(log => {
    adminDistribution[log.adminNickname] = (adminDistribution[log.adminNickname] || 0) + 1;
  });

  return {
    totalLogs: logs.length,
    todayLogs,
    weeklyLogs,
    monthlyLogs,
    actionDistribution,
    adminDistribution
  };
};

// 로그 포맷팅
export const formatLogTime = (timestamp: any): string => {
  if (!timestamp) return '-';
  
  const logDate = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
  return logDate.toLocaleString('ko-KR');
};

// 로그 액션 아이콘 생성
export const getLogActionIcon = (action: AdminAction) => {
  const iconMap: Record<AdminAction, any> = {
    user_create: User,
    user_update: Edit3,
    user_delete: Trash2,
    grade_change: Crown,
    role_change: Shield,
    status_change: AlertCircle,
    bulk_action: Users,
    system_config: Settings,
    data_export: Download,
    login: LogIn,
    notification_sent: Send
  };
  
  return iconMap[action] || History;
};

// 로그 엑셀 내보내기 (XLSX 라이브러리 필요)
export const exportLogsToExcel = (logs: AdminLog[]) => {
  // TODO: XLSX 라이브러리 설치 후 구현
  console.log('로그 내보내기:', logs);
  alert('로그 내보내기 기능은 준비 중입니다.');
};

// 로그 필터링
export const filterLogs = (logs: AdminLog[], filters: LogFilter): AdminLog[] => {
  return logs.filter(log => {
    // 날짜 필터
    if (filters.dateRange) {
      const logDate = log.timestamp instanceof Timestamp ? 
        log.timestamp.toDate() : new Date(log.timestamp);
      if (logDate < filters.dateRange.start || logDate > filters.dateRange.end) {
        return false;
      }
    }

    // 관리자 필터
    if (filters.adminUid && log.adminUid !== filters.adminUid) {
      return false;
    }

    // 액션 필터
    if (filters.action && log.action !== filters.action) {
      return false;
    }

    // 대상 사용자 필터
    if (filters.targetUid && log.targetUid !== filters.targetUid) {
      return false;
    }

    // 검색 필터
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        log.adminNickname.toLowerCase().includes(searchLower) ||
        log.targetNickname?.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    return true;
  });
};

// 공지/알림 발송
export const sendNotification = async (
  title: string,
  content: string,
  type: NotificationType,
  targetUsers: string[],
  senderUid: string,
  senderNickname: string,
  templateId?: string
): Promise<string> => {
  try {
    const notificationData: Omit<Notification, 'id' | 'sentAt'> = {
      title,
      content,
      type,
      targetUsers,
      targetUserCount: targetUsers.length,
      senderUid,
      senderNickname,
      status: 'sending',
      readCount: 0,
      templateId
    };

    const docRef = await addDoc(collection(db, 'notifications'), {
      ...notificationData,
      sentAt: serverTimestamp()
    });

    // 실제 발송 로직 (여기서는 시뮬레이션)
    setTimeout(async () => {
      await updateDoc(doc(db, 'notifications', docRef.id), {
        status: 'sent'
      });
    }, 2000);

    return docRef.id;
  } catch (error) {
    console.error('알림 발송 실패:', error);
    throw error;
  }
};

// 공지/알림 목록 가져오기
export const fetchNotifications = async (limit: number = 50): Promise<Notification[]> => {
  try {
    const notificationsQuery = query(
      collection(db, 'notifications'),
      orderBy('sentAt', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(notificationsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Notification[];
  } catch (error) {
    console.error('알림 목록 가져오기 실패:', error);
    return [];
  }
};

// 알림 템플릿 가져오기
export const fetchNotificationTemplates = async (): Promise<NotificationTemplate[]> => {
  try {
    const templatesQuery = query(
      collection(db, 'notification_templates'),
      orderBy('usageCount', 'desc')
    );
    
    const snapshot = await getDocs(templatesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as NotificationTemplate[];
  } catch (error) {
    console.error('템플릿 가져오기 실패:', error);
    return [];
  }
};

// 알림 템플릿 저장
export const saveNotificationTemplate = async (
  name: string,
  title: string,
  content: string,
  type: NotificationType,
  createdBy: string
): Promise<string> => {
  try {
    const templateData: Omit<NotificationTemplate, 'id' | 'createdAt' | 'usageCount'> = {
      name,
      title,
      content,
      type,
      createdBy
    };

    const docRef = await addDoc(collection(db, 'notification_templates'), {
      ...templateData,
      createdAt: serverTimestamp(),
      usageCount: 0
    });

    return docRef.id;
  } catch (error) {
    console.error('템플릿 저장 실패:', error);
    throw error;
  }
};

// 알림 통계 계산
export const calculateNotificationStats = (notifications: Notification[]): NotificationStats => {
  const totalSent = notifications.length;
  const totalRead = notifications.reduce((sum, notification) => sum + notification.readCount, 0);
  const averageReadRate = totalSent > 0 ? (totalRead / totalSent) * 100 : 0;

  // 타입별 분포
  const typeDistribution: Record<NotificationType, number> = {} as any;
  notifications.forEach(notification => {
    typeDistribution[notification.type] = (typeDistribution[notification.type] || 0) + 1;
  });

  return {
    totalSent,
    totalRead,
    averageReadRate,
    typeDistribution,
    recentNotifications: notifications.slice(0, 10)
  };
};

// 사용자 선택 상태 관리
export const createNotificationTargets = (users: AdminUser[]): NotificationTarget[] => {
  return users.map(user => ({
    uid: user.uid,
    nickname: user.nickname,
    email: user.email,
    grade: user.grade,
    role: user.role,
    isSelected: false
  }));
};

// 선택된 사용자 필터링
export const getSelectedTargets = (targets: NotificationTarget[]): NotificationTarget[] => {
  return targets.filter(target => target.isSelected);
};

// 전체 선택/해제 토글
export const toggleAllTargets = (targets: NotificationTarget[], selectAll: boolean): NotificationTarget[] => {
  return targets.map(target => ({
    ...target,
    isSelected: selectAll
  }));
};

// 알림 타입 아이콘 생성
export const getNotificationTypeIcon = (type: NotificationType) => {
  const iconMap: Record<NotificationType, any> = {
    announcement: Bell,
    warning: AlertCircle,
    info: MessageSquare,
    event: Activity,
    maintenance: Settings
  };
  
  return iconMap[type] || Bell;
};

// 알림 상태 표시
export const getNotificationStatusDisplay = (status: NotificationStatus) => {
  const statusConfig: Record<NotificationStatus, { label: string; color: string; icon: any }> = {
    draft: { label: '임시저장', color: '#6b7280', icon: Save },
    sending: { label: '발송 중', color: '#f59e0b', icon: Send },
    sent: { label: '발송 완료', color: '#10b981', icon: CheckCircle },
    failed: { label: '발송 실패', color: '#ef4444', icon: X }
  };
  
  return statusConfig[status];
};

// 기본 알림 템플릿들
export const getDefaultTemplates = (): Omit<NotificationTemplate, 'id' | 'createdAt' | 'usageCount' | 'createdBy'>[] => [
  {
    name: '서비스 점검 안내',
    title: '[점검 안내] 서비스 점검 예정',
    content: '안녕하세요.\n\n더 나은 서비스를 위해 점검을 진행할 예정입니다.\n\n점검 시간: [시간 입력]\n점검 내용: [내용 입력]\n\n불편을 끼쳐 죄송합니다.',
    type: 'maintenance'
  },
  {
    name: '이벤트 안내',
    title: '[이벤트] 새로운 이벤트가 시작되었습니다!',
    content: '안녕하세요.\n\n새로운 이벤트가 시작되었습니다!\n\n이벤트 기간: [기간 입력]\n이벤트 내용: [내용 입력]\n\n많은 참여 부탁드립니다.',
    type: 'event'
  },
  {
    name: '중요 공지사항',
    title: '[중요] 공지사항',
    content: '안녕하세요.\n\n중요한 공지사항을 전달드립니다.\n\n[공지 내용]\n\n확인 부탁드립니다.',
    type: 'announcement'
  },
  {
    name: '경고 안내',
    title: '[경고] 이용 규칙 위반',
    content: '안녕하세요.\n\n이용 규칙 위반으로 인한 경고를 전달드립니다.\n\n위반 내용: [내용 입력]\n\n앞으로 주의해 주시기 바랍니다.',
    type: 'warning'
  }
]; 