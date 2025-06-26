import type { AdminUser, ExtendedUserStats } from './AdminTypes';
import { GRADE_ORDER, GRADE_NAMES } from './AdminTypes';
import { Crown, Shield, User } from 'lucide-react';

// 날짜 포맷팅
export const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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

// 역할 표시
export const getRoleDisplay = (role: string) => {
  switch (role) {
    case '리더':
      return (
        <span className="role-badge leader">
          <Crown size={12} />
          리더
        </span>
      );
    case '운영진':
      return (
        <span className="role-badge admin">
          <Shield size={12} />
          운영진
        </span>
      );
    case '부운영진':
      return (
        <span className="role-badge sub-admin">
          <Shield size={12} />
          부운영진
        </span>
      );
    default:
      return (
        <span className="role-badge member">
          <User size={12} />
          일반
        </span>
      );
  }
};

// 역할 아이콘
export const getRoleIcon = (role: string) => {
  switch (role) {
    case '리더': return <Crown size={16} className="role-icon leader" />;
    case '운영진': return <Shield size={16} className="role-icon admin" />;
    case '부운영진': return <Shield size={16} className="role-icon sub-admin" />;
    default: return <User size={16} className="role-icon member" />;
  }
};

// 통계 계산
export const calculateStats = (usersData: AdminUser[]): ExtendedUserStats => {
  const totalUsers = usersData.length;
  const adminCount = usersData.filter(u => u.role === '운영진' || u.role === '리더').length;
  
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
    const createdDate = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
    return createdDate > oneMonthAgo;
  }).length;

  // 활성 사용자 (최근 일주일 이내 활동)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const activeUsers = totalUsers; // 실제로는 최근 활동 시간을 확인해야 함

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
    const gradeIndex = GRADE_ORDER.indexOf(user.grade);
    return sum + (gradeIndex >= 0 ? gradeIndex : 0);
  }, 0);
  
  const averageIndex = Math.round(gradeIndexSum / usersData.length);
  const averageGradeEmoji = GRADE_ORDER[averageIndex] || '🍒';
  
  return `${averageGradeEmoji} ${GRADE_NAMES[averageGradeEmoji]}`;
};

// 활동 일수 계산
export const calculateActivityDays = (createdAt: any): number => {
  if (!createdAt) return 0;
  const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// 다음 등급 가져오기
export const getNextGrade = (currentGrade: string): string => {
  const currentIndex = GRADE_ORDER.indexOf(currentGrade);
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
  const currentGradeIndex = GRADE_ORDER.indexOf(user.grade);
  const maxGradeIndex = Math.min(
    Math.floor(activityDays / 90),
    GRADE_ORDER.length - 1
  );
  
  if (activityDays < 90) return false;
  return currentGradeIndex < maxGradeIndex;
};

// 엑셀 내보내기
export const exportToExcel = (users: AdminUser[]) => {
  // CSV 형식으로 데이터 생성
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

  // 파일 다운로드
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