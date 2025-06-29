import type { AdminUser, ExtendedUserStats } from './AdminTypes';
import { GRADE_ORDER, GRADE_NAMES, ROLE_OPTIONS, GRADE_SYSTEM, ROLE_SYSTEM } from './AdminTypes';
import { Crown, Shield, User } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

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
    roleDistribution
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
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
}) => {
  return users.filter(user => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!user.nickname.toLowerCase().includes(searchLower) &&
          !user.email.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    if (filters.grade && user.grade !== filters.grade) {
      return false;
    }
    
    if (filters.role && user.role !== filters.role) {
      return false;
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