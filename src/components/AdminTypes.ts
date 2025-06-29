import { Timestamp } from 'firebase/firestore';

export interface AdminUser {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  role: string;
  createdAt: Timestamp | Date;
  profileImageUrl?: string;
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
}

export type TabType = 'users' | 'activity' | 'grades';
export type SortBy = 'nickname' | 'grade' | 'role' | 'createdAt';
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