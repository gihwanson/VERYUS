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
  evaluationBuskingWeeklyLimit?: number;
  /** 설정에서 요청한 등급(승인 전). 없으면 승인 대기 없음 */
  pendingGrade?: string;
  pendingGradeRequestedAt?: Timestamp | Date;
  /** 설정에서 요청한 가입일(승인 전). 없으면 승인 대기 없음 */
  pendingCreatedAt?: Timestamp | Date;
  pendingCreatedAtRequestedAt?: Timestamp | Date;
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

export type TabType = 'users' | 'grades' | 'logs';
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
  SUN: '☀️',
  CRESCENT: '🌙',
  GALAXY: '🌌'
} as const;

// 등급 순서 (낮은 등급부터 높은 등급 순)
export const GRADE_ORDER = [
  GRADE_SYSTEM.CHERRY,      // 0일
  GRADE_SYSTEM.BLUEBERRY,   // 90일
  GRADE_SYSTEM.KIWI,        // 180일
  GRADE_SYSTEM.APPLE,       // 270일
  GRADE_SYSTEM.MELON,       // 360일
  GRADE_SYSTEM.WATERMELON,  // 450일
  GRADE_SYSTEM.EARTH,       // 540일
  GRADE_SYSTEM.SATURN,      // 630일
  GRADE_SYSTEM.SUN,         // 720일
  GRADE_SYSTEM.CRESCENT,    // 초승달 (예외 등급)
  GRADE_SYSTEM.GALAXY       // 은하 (평가자 등급)
] as const;

// 등급 한글 이름
export const GRADE_NAMES: Record<string, string> = {
  [GRADE_SYSTEM.CHERRY]: '체리',
  [GRADE_SYSTEM.BLUEBERRY]: '블루베리',
  [GRADE_SYSTEM.KIWI]: '키위',
  [GRADE_SYSTEM.APPLE]: '사과',
  [GRADE_SYSTEM.MELON]: '멜론',
  [GRADE_SYSTEM.WATERMELON]: '수박',
  [GRADE_SYSTEM.EARTH]: '지구',
  [GRADE_SYSTEM.SATURN]: '토성',
  [GRADE_SYSTEM.SUN]: '태양',
  [GRADE_SYSTEM.CRESCENT]: '초승달',
  [GRADE_SYSTEM.GALAXY]: '은하'
};

// 등급별 필요한 최소 활동 일수
export const GRADE_REQUIREMENTS: Record<string, number> = {
  [GRADE_SYSTEM.CHERRY]: 0,
  [GRADE_SYSTEM.BLUEBERRY]: 90,
  [GRADE_SYSTEM.KIWI]: 180,
  [GRADE_SYSTEM.APPLE]: 270,
  [GRADE_SYSTEM.MELON]: 360,
  [GRADE_SYSTEM.WATERMELON]: 450,
  [GRADE_SYSTEM.EARTH]: 540,
  [GRADE_SYSTEM.SATURN]: 630,
  [GRADE_SYSTEM.SUN]: 720,
  [GRADE_SYSTEM.CRESCENT]: 9999, // 예외 등급 (수동 부여)
  [GRADE_SYSTEM.GALAXY]: 999 // 평가자 등급 (수동 부여)
};

// 역할 시스템 정의
export const ROLE_SYSTEM = {
  MEMBER: '일반',
  SUB_ADMIN: '부운영진',
  ADMIN: '운영진',
  SQUAD_LEADER: '조장',
  LEADER: '리더'
} as const;

export const ROLE_OPTIONS = [
  ROLE_SYSTEM.MEMBER,
  ROLE_SYSTEM.SUB_ADMIN,
  ROLE_SYSTEM.ADMIN,
  ROLE_SYSTEM.SQUAD_LEADER,
  ROLE_SYSTEM.LEADER
] as const;

export type RoleAssignableUser = {
  uid: string;
  nickname?: string;
  role?: string;
};

/** 현재 리더(1명) 조회. excludeUid는 역할 변경 대상(본인 유지 시 제외) */
export const findExistingLeader = (
  users: RoleAssignableUser[],
  excludeUid?: string
): RoleAssignableUser | undefined =>
  users.find((u) => u.role === ROLE_SYSTEM.LEADER && u.uid !== excludeUid);

export const getLeaderRoleAssignmentError = (
  nextRole: string,
  targetUid: string,
  users: RoleAssignableUser[]
): string | null => {
  if (nextRole !== ROLE_SYSTEM.LEADER) return null;
  const existing = findExistingLeader(users, targetUid);
  if (!existing) return null;
  const label = existing.nickname?.trim() || '알 수 없음';
  return `리더는 1명만 지정할 수 있습니다. 현재 리더: ${label}`;
};

export const getBulkLeaderRoleAssignmentError = (
  nextRole: string,
  targetUids: string[],
  users: RoleAssignableUser[]
): string | null => {
  if (nextRole !== ROLE_SYSTEM.LEADER) return null;
  if (targetUids.length > 1) {
    return '리더는 한 번에 한 명만 지정할 수 있습니다.';
  }
  if (targetUids.length === 0) return null;
  return getLeaderRoleAssignmentError(nextRole, targetUids[0], users);
};

export const canAssignLeaderRole = (
  targetUid: string | undefined,
  users: RoleAssignableUser[]
): boolean => !findExistingLeader(users, targetUid);

/** 관리자 패널·운영 권한: 리더/운영진 + 아래 닉네임 (코드 한 곳에서만 수정) */
export const SUPER_ADMIN_NICKNAMES: readonly string[] = ['너래'];

export type AdminAccessUser = {
  nickname?: string;
  role?: string;
} | null | undefined;

/** 관리자 패널·데이터 운영에 해당하는 계정 */
export const checkAdminAccess = (user: AdminAccessUser): boolean => {
  if (!user) return false;
  if (user.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname)) return true;
  return user.role === ROLE_SYSTEM.LEADER || user.role === ROLE_SYSTEM.ADMIN;
};

/** 베리어스 디펜스 등 리더 전용 기능 */
export const checkLeaderAccess = (user: AdminAccessUser): boolean => {
  if (!user) return false;
  return user.role === ROLE_SYSTEM.LEADER;
};

/** 익명 쪽지 관리 등 일부 기능은 지정 닉네임만 허용 */
export const canManageAnonymousNotes = (user: AdminAccessUser): boolean => {
  if (!user?.nickname) return false;
  return SUPER_ADMIN_NICKNAMES.includes(user.nickname);
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

// AdminAction 라벨과 색상
export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
  user_create: '사용자 생성',
  user_update: '사용자 수정',
  user_delete: '사용자 삭제',
  grade_change: '등급 변경',
  role_change: '역할 변경',
  status_change: '상태 변경',
  bulk_action: '대량 작업',
  system_config: '시스템 설정',
  data_export: '데이터 내보내기',
  login: '로그인',
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
  system_config: '#6b7280',
  data_export: '#f97316',
  login: '#10b981',
  notification_sent: '#ec4899'
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