export interface AdminUser {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  role: string;
  createdAt: any;
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

export interface GradeNames {
  [key: string]: string;
}

export type TabType = 'users' | 'activity' | 'grades';

export type SortBy = 'nickname' | 'grade' | 'role' | 'createdAt';

// 등급 옵션
export const GRADE_OPTIONS = [
  '🍒', // 체리
  '🫐', // 블루베리
  '🥝', // 키위
  '🍎', // 사과
  '🍈', // 멜론
  '🍉', // 수박
  '🌍', // 지구
  '🪐', // 토성
  '☀️', // 태양
  '🌌', // 은하
  '🌙', // 달
];

// 등급 순서 정의 (낮은 등급이 앞에 오도록)
export const GRADE_ORDER = [
  '🍒', // 체리 (가장 낮음)
  '🫐', // 블루베리
  '🥝', // 키위
  '🍎', // 사과
  '🍈', // 멜론
  '🍉', // 수박
  '🌍', // 지구
  '🪐', // 토성
  '☀️'  // 태양 (가장 높음)
];

// 등급 이름 매핑
export const GRADE_NAMES: GradeNames = {
  '🍒': '체리',
  '🫐': '블루베리',
  '🥝': '키위',
  '🍎': '사과',
  '🍈': '멜론',
  '🍉': '수박',
  '🌍': '지구',
  '🪐': '토성',
  '☀️': '태양'
};

// 역할 옵션
export const ROLE_OPTIONS = ['일반', '부운영진', '운영진', '리더'];

// 관리자 권한 체크 함수
export const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
}; 