import { Timestamp } from 'firebase/firestore';

export interface AdminUser {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  role: string;
  createdAt: Timestamp | Date;
  profileImageUrl?: string;
  lastLoginAt?: Timestamp | Date;
  isActive?: boolean;
  loginCount?: number;
  totalActivityScore?: number;
  status?: UserStatus;
  suspendedUntil?: Timestamp | Date;
  suspensionReason?: string;
  lastActivityAt?: Timestamp | Date;
  postCount?: number;
  commentCount?: number;
  likeCount?: number;
  weeklyActivityScore?: number;
  monthlyActivityScore?: number;
}

export interface UserStats {
  totalUsers: number;
  adminCount: number;
  gradeDistribution: Record<string, number>;
  roleDistribution: Record<string, number>;
}

export interface ExtendedUserStats extends UserStats {
  activeUsers: number;
  recentJoins: number;
  averageGrade: string;
  inactiveUsers: number;
  topContributors: AdminUser[];
  recentActivity: UserActivity[];
}

export interface UserActivity {
  uid: string;
  nickname: string;
  action: 'login' | 'post' | 'comment' | 'like' | 'grade_up' | 'profile_update' | 'contest_participate';
  timestamp: Timestamp | Date;
  details?: string;
  targetId?: string;
  targetType?: string;
  score?: number;
}

export interface UserAnalytics {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  averageSessionDuration: number;
  mostActiveHours: number[];
  popularContentTypes: string[];
}

export interface BulkAction {
  type: 'grade_promotion' | 'role_change' | 'deactivation' | 'export';
  targetUsers: string[];
  parameters?: Record<string, any>;
}

export type TabType = 'users' | 'activity' | 'grades' | 'analytics' | 'bulk_actions' | 'logs' | 'notifications';
export type SortBy = 'nickname' | 'grade' | 'role' | 'createdAt' | 'lastLoginAt' | 'activityScore';
export type SortOrder = 'asc' | 'desc';

// 등급 시스템 정의
export const GRADE_SYSTEM = {
  CHERRY: '🍒',
  BLUEBERRY: '🫐',
  KIWI: '🥝',
  APPLE: '🍎',
  MELON: '🍈',
  WATERMELON: '🍉',
  EARTH: '🌍',
  SATURN: '🪐',
  SUN: '☀️'
} as const;

export const GRADE_ORDER = [
  GRADE_SYSTEM.CHERRY,
  GRADE_SYSTEM.BLUEBERRY,
  GRADE_SYSTEM.KIWI,
  GRADE_SYSTEM.APPLE,
  GRADE_SYSTEM.MELON,
  GRADE_SYSTEM.WATERMELON,
  GRADE_SYSTEM.EARTH,
  GRADE_SYSTEM.SATURN,
  GRADE_SYSTEM.SUN
] as const;

export const GRADE_NAMES: Record<string, string> = {
  [GRADE_SYSTEM.CHERRY]: '체리',
  [GRADE_SYSTEM.BLUEBERRY]: '블루베리',
  [GRADE_SYSTEM.KIWI]: '키위',
  [GRADE_SYSTEM.APPLE]: '사과',
  [GRADE_SYSTEM.MELON]: '멜론',
  [GRADE_SYSTEM.WATERMELON]: '수박',
  [GRADE_SYSTEM.EARTH]: '지구',
  [GRADE_SYSTEM.SATURN]: '토성',
  [GRADE_SYSTEM.SUN]: '태양'
};

// 역할 시스템 정의
export const ROLE_SYSTEM = {
  MEMBER: '일반',
  SUB_ADMIN: '부운영진',
  ADMIN: '운영진',
  LEADER: '리더'
} as const;

export const ROLE_OPTIONS = [
  ROLE_SYSTEM.MEMBER,
  ROLE_SYSTEM.SUB_ADMIN,
  ROLE_SYSTEM.ADMIN,
  ROLE_SYSTEM.LEADER
] as const;

// 관리자 권한 체크 함수
export const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || 
         user.role === ROLE_SYSTEM.LEADER || 
         user.role === ROLE_SYSTEM.ADMIN;
};

// 타입 가드 함수들
export const isAdminUser = (user: any): user is AdminUser => {
  return user && 
         typeof user.uid === 'string' &&
         typeof user.email === 'string' &&
         typeof user.nickname === 'string' &&
         typeof user.grade === 'string' &&
         typeof user.role === 'string';
};

export const isValidGrade = (grade: string): boolean => {
  return GRADE_ORDER.includes(grade as any);
};

export const isValidRole = (role: string): boolean => {
  return ROLE_OPTIONS.includes(role as any);
};

// 사용자 상태 관련
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
} as const;

export type UserStatus = typeof USER_STATUS[keyof typeof USER_STATUS];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  [USER_STATUS.ACTIVE]: '활성',
  [USER_STATUS.INACTIVE]: '비활성',
  [USER_STATUS.SUSPENDED]: '정지',
  [USER_STATUS.PENDING]: '대기'
};

export const USER_STATUS_COLORS: Record<UserStatus, string> = {
  [USER_STATUS.ACTIVE]: '#10b981',
  [USER_STATUS.INACTIVE]: '#6b7280',
  [USER_STATUS.SUSPENDED]: '#ef4444',
  [USER_STATUS.PENDING]: '#f59e0b'
};

export interface ActivityStats {
  totalPosts: number;
  totalComments: number;
  totalLikes: number;
  weeklyActivity: number;
  monthlyActivity: number;
  averageDailyActivity: number;
  mostActiveDay: string;
  mostActiveHour: number;
}

export interface UserActivitySummary {
  uid: string;
  nickname: string;
  lastLoginAt?: Timestamp | Date;
  lastActivityAt?: Timestamp | Date;
  totalActivityScore: number;
  weeklyActivityScore: number;
  monthlyActivityScore: number;
  activityStats: ActivityStats;
  recentActivities: UserActivity[];
}

// 활동 점수 시스템
export const ACTIVITY_SCORES = {
  LOGIN: 1,
  POST: 10,
  COMMENT: 5,
  LIKE: 2,
  GRADE_UP: 50,
  PROFILE_UPDATE: 3,
  CONTEST_PARTICIPATE: 20
} as const;

export const ACTIVITY_LABELS = {
  LOGIN: '로그인',
  POST: '게시글 작성',
  COMMENT: '댓글 작성',
  LIKE: '좋아요',
  GRADE_UP: '등급 상승',
  PROFILE_UPDATE: '프로필 수정',
  CONTEST_PARTICIPATE: '대회 참여'
} as const;

// 관리자 로그 관련 타입
export interface AdminLog {
  id: string;
  adminUid: string;
  adminNickname: string;
  action: AdminAction;
  targetUid?: string;
  targetNickname?: string;
  details: string;
  beforeValue?: any;
  afterValue?: any;
  timestamp: Timestamp | Date;
  ipAddress?: string;
  userAgent?: string;
}

export type AdminAction = 
  | 'user_create' 
  | 'user_update' 
  | 'user_delete' 
  | 'grade_change' 
  | 'role_change' 
  | 'status_change' 
  | 'bulk_action' 
  | 'system_config' 
  | 'data_export' 
  | 'login'
  | 'notification_sent';

export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
  user_create: '사용자 생성',
  user_update: '사용자 정보 수정',
  user_delete: '사용자 삭제',
  grade_change: '등급 변경',
  role_change: '역할 변경',
  status_change: '상태 변경',
  bulk_action: '일괄 작업',
  system_config: '시스템 설정',
  data_export: '데이터 내보내기',
  login: '관리자 로그인',
  notification_sent: '알림 발송'
};

export const ADMIN_ACTION_COLORS: Record<AdminAction, string> = {
  user_create: '#10b981',
  user_update: '#3b82f6',
  user_delete: '#ef4444',
  grade_change: '#f59e0b',
  role_change: '#8b5cf6',
  status_change: '#06b6d4',
  bulk_action: '#84cc16',
  system_config: '#6366f1',
  data_export: '#14b8a6',
  login: '#6b7280',
  notification_sent: '#8b5cf6'
};

export interface LogFilter {
  dateRange?: { start: Date; end: Date };
  adminUid?: string;
  action?: AdminAction;
  targetUid?: string;
  search?: string;
}

export interface LogStats {
  totalLogs: number;
  todayLogs: number;
  weeklyLogs: number;
  monthlyLogs: number;
  actionDistribution: Record<AdminAction, number>;
  adminDistribution: Record<string, number>;
}

// 공지/알림 관련 타입
export interface Notification {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  targetUsers: string[]; // UID 목록
  targetUserCount: number;
  senderUid: string;
  senderNickname: string;
  status: NotificationStatus;
  sentAt: Timestamp | Date;
  readCount: number;
  templateId?: string;
}

export type NotificationType = 'announcement' | 'warning' | 'info' | 'event' | 'maintenance';

export type NotificationStatus = 'draft' | 'sending' | 'sent' | 'failed';

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  announcement: '공지사항',
  warning: '경고',
  info: '안내',
  event: '이벤트',
  maintenance: '점검'
};

export const NOTIFICATION_TYPE_COLORS: Record<NotificationType, string> = {
  announcement: '#3b82f6',
  warning: '#ef4444',
  info: '#10b981',
  event: '#f59e0b',
  maintenance: '#8b5cf6'
};

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  type: NotificationType;
  createdBy: string;
  createdAt: Timestamp | Date;
  usageCount: number;
}

export interface NotificationStats {
  totalSent: number;
  totalRead: number;
  averageReadRate: number;
  typeDistribution: Record<NotificationType, number>;
  recentNotifications: Notification[];
}

export interface NotificationTarget {
  uid: string;
  nickname: string;
  email: string;
  grade: string;
  role: string;
  isSelected: boolean;
} 