import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  writeBatch,
  orderBy,
  addDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  Users, 
  Search,
  ArrowLeft,
  X,
  Download,
  UserPlus,
  Database,
  Crown,
  Activity,
  Shield,
  CheckCircle,
  Edit3,
  Trash2,
  User,
  TrendingUp,
  History,
  Bell,
  Send,
  Copy,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { db } from '../firebase';
import { migrateExistingMessages } from '../utils/chatService';
import UserActivityBoard from './UserActivityBoard';
import { 
  formatDate, 
  calculateActivityDays, 
  calculateStats, 
  exportToExcel,
  canPromote,
  getNextGrade,
  sortUsers,
  filterUsers,
  getUserStatus,
  createStatusDisplay,
  changeUserStatus,
  getSuspensionTimeLeft,
  generateUserActivitySummary,
  logAdminAction,
  fetchAdminLogs,
  calculateLogStats,
  exportLogsToExcel,
  sendNotification,
  fetchNotifications,
  fetchNotificationTemplates,
  saveNotificationTemplate,
  calculateNotificationStats,
  getDefaultTemplates,
  getActivityLevel,
  getDaysUntilPromotion,
  checkPromotionEligibility,
  getExpectedGrade,
  generateTemporaryPassword,
  copyToClipboard
} from './AdminUtils';
import { 
  LoadingSpinner, 
  StatCard, 
  UserCard, 
  EmptyState,
  RoleDisplay,
  RoleIcon,
  ActivityItem,
  ActivityStatsCard,
  ActivityChart,
  LogItem,
  LogStatsCard,
  LogDetailModal,
  LogFilter,
  NotificationSendModal,
  NotificationList,
  NotificationTemplates
} from './AdminComponents';
import { 
  checkAdminAccess, 
  GRADE_SYSTEM, 
  ROLE_SYSTEM, 
  GRADE_ORDER, 
  GRADE_NAMES, 
  ROLE_OPTIONS,
  USER_STATUS,
  USER_STATUS_LABELS,
  type AdminUser,
  type TabType,
  type SortBy,
  type UserStatus,
  type UserActivitySummary,
  type AdminLog,
  type AdminAction,
  type LogStats,
  type Notification,
  type NotificationTemplate,
  type NotificationType
} from './AdminTypes';
import './AdminUserPanel.css';
import { FaUsers, FaUserShield, FaChartPie, FaFire } from "react-icons/fa";
import type { UserActivitySummary as UserActivitySummaryType, NotificationStats as NotificationStatsType } from './AdminTypes';

interface UserActivitySummaryProps {
  summary: UserActivitySummaryType;
}
const UserActivitySummary: React.FC<UserActivitySummaryProps> = ({ summary }) => {
  const activityLevel = getActivityLevel(summary.totalActivityScore);
  return (
    <div className="user-activity-summary">
      <h3>활동 요약</h3>
      <div>총 활동 점수: {summary.totalActivityScore} ({activityLevel.level})</div>
      <div>주간 활동 점수: {summary.weeklyActivityScore}</div>
      <div>월간 활동 점수: {summary.monthlyActivityScore}</div>
      {/* 기타 표시 내용 필요시 추가 */}
    </div>
  );
};

const NotificationStats: React.FC<{ stats: NotificationStatsType }> = ({ stats }) => (
  <div className="notification-stats">
    <h3>알림 통계</h3>
    <div>총 발송: {stats.totalSent}</div>
    <div>총 읽음: {stats.totalRead}</div>
    <div>평균 읽음률: {stats.averageReadRate.toFixed(1)}%</div>
    {/* 기타 표시 내용 필요시 추가 */}
  </div>
);

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('users');
  
  // 검색 및 필터링
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // 편집 상태
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  
  // 모달 상태
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    nickname: '',
    password: '',
    grade: GRADE_SYSTEM.CHERRY,
    role: ROLE_SYSTEM.MEMBER
  });
  const [showPassword, setShowPassword] = useState(false);
  
  
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');

  const [selectedUserUids, setSelectedUserUids] = useState<string[]>([]);

  // 벌크 액션 모달 상태
  const [showBulkGradeModal, setShowBulkGradeModal] = useState(false);
  const [showBulkRoleModal, setShowBulkRoleModal] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionResult, setBulkActionResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // 벌크 액션 설정
  const [bulkGrade, setBulkGrade] = useState(GRADE_SYSTEM.CHERRY);
  const [bulkRole, setBulkRole] = useState(ROLE_SYSTEM.MEMBER);

  // 상태 변경 모달
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChangeUser, setStatusChangeUser] = useState<AdminUser | null>(null);
  const [newStatus, setNewStatus] = useState<UserStatus>(USER_STATUS.ACTIVE);
  const [suspensionDays, setSuspensionDays] = useState(1);
  const [suspensionReason, setSuspensionReason] = useState('');

  // 활동 분석 상태
  const [selectedUserForActivity, setSelectedUserForActivity] = useState<AdminUser | null>(null);
  const [userActivitySummary, setUserActivitySummary] = useState<UserActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  // 로그 관련 상태
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AdminLog[]>([]);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);
  const [logFilters, setLogFilters] = useState({
    search: '',
    action: 'all',
    dateRange: null as { start: Date; end: Date } | null
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  // 사용자 목록 가져오기 (useCallback으로 최적화) - useEffect보다 먼저 정의
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(usersQuery);
      
      const usersData = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as AdminUser[];
      
      setUsers(usersData);
    } catch (error) {
      console.error('사용자 목록 가져오기 실패:', error);
      alert('사용자 목록을 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 사용자 목록 필터링 및 정렬 (성능 최적화)
  const filteredUsers = useMemo(() => {
    if (!users || users.length === 0) return [];
    
    let filtered = filterUsers(users, {
      search: searchTerm,
      grade: filterGrade !== 'all' ? filterGrade : undefined,
      role: filterRole !== 'all' ? filterRole : undefined,
      status: filterStatus !== 'all' ? filterStatus : undefined
    });

    // 정렬 적용
    filtered = sortUsers(filtered, sortBy, sortOrder);

    return filtered;
  }, [users, searchTerm, filterRole, filterGrade, filterStatus, sortBy, sortOrder]);

  // 초기화 및 권한 체크
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const user = JSON.parse(userString);
        setCurrentUser(user);

        if (!checkAdminAccess(user)) {
          alert('관리자 권한이 필요합니다.');
          setLoading(false);
          navigate('/');
          return;
        }

        fetchUsers().catch(error => {
          console.error('사용자 목록 가져오기 실패:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
        setLoading(false);
        navigate('/');
      }
    } else {
      alert('로그인이 필요합니다.');
      setLoading(false);
      navigate('/login');
    }
  }, [navigate, fetchUsers]);

  // 통계 계산 최적화 (기본값 포함)
  const userStats = useMemo(() => {
    if (!users || users.length === 0) {
      return {
        totalUsers: 0,
        adminCount: 0,
        activeUsers: 0,
        recentJoins: 0,
        averageGrade: '',
        gradeDistribution: {} as Record<string, number>,
        roleDistribution: {} as Record<string, number>,
        inactiveUsers: 0,
        topContributors: [],
        recentActivity: []
      };
    }
    return calculateStats(users);
  }, [users]);

  // 닉네임 변경 시 관련 게시물 업데이트
  const updateUserNicknameInPosts = async (oldNickname: string, newNickname: string) => {
    try {
      const batch = writeBatch(db);
      const boards = ['freePosts', 'evaluationPosts', 'recordingPosts', 'partnerPosts'];
      
      for (const board of boards) {
        const postsQuery = query(
          collection(db, board),
          where('author', '==', oldNickname)
        );
        const postsSnapshot = await getDocs(postsQuery);
        
        postsSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, { author: newNickname });
        });
      }
      
      await batch.commit();
      console.log('게시물 닉네임 업데이트 완료');
    } catch (error) {
      console.error('게시물 닉네임 업데이트 실패:', error);
      // 실패해도 계속 진행 (로깅만)
    }
  };

  // 사용자 업데이트 (로그 포함)
  const handleUpdateUser = async (user: AdminUser) => {
    if (!editingUser || !currentUser) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // 변경 사항 추적
      const changes: Record<string, { before: any; after: any }> = {};
      if (editingUser.nickname !== user.nickname) {
        changes.nickname = { before: user.nickname, after: editingUser.nickname };
      }
      if (editingUser.role !== user.role) {
        changes.role = { before: user.role, after: editingUser.role };
      }
      if (editingUser.grade !== user.grade) {
        changes.grade = { before: user.grade, after: editingUser.grade };
      }
      
      await updateDoc(userRef, {
        nickname: editingUser.nickname,
        role: editingUser.role,
        grade: editingUser.grade
      });
      
      // 닉네임 변경 시 관련 게시물 업데이트
      if (changes.nickname) {
        await updateUserNicknameInPosts(user.nickname, editingUser.nickname);
      }
      
      // 로그 기록
      const changeDetails = Object.entries(changes)
        .map(([field, change]) => `${field}: ${change.before} → ${change.after}`)
        .join(', ');
      
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'user_update',
        `${user.nickname}님의 정보를 수정했습니다. (${changeDetails})`,
        user.uid,
        user.nickname,
        { nickname: user.nickname, role: user.role, grade: user.grade },
        { nickname: editingUser.nickname, role: editingUser.role, grade: editingUser.grade }
      );
      
      await fetchUsers();
      setEditingUser(null);
      alert('사용자 정보가 성공적으로 업데이트되었습니다.');
    } catch (error) {
      console.error('사용자 업데이트 실패:', error);
      alert('사용자 정보 업데이트에 실패했습니다.');
    }
  };

  // 사용자 삭제 (로그 및 관련 데이터 정리 포함)
  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`정말로 ${user.nickname}님을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 사용자의 모든 게시물과 댓글이 삭제됩니다.`)) return;
    
    if (!currentUser) return;

    try {
      // 관련 데이터 삭제 (게시물, 댓글 등)
      const batch = writeBatch(db);
      
      // 게시물 삭제
      const boards = ['freePosts', 'evaluationPosts', 'recordingPosts', 'partnerPosts'];
      for (const board of boards) {
        const postsQuery = query(
          collection(db, board),
          where('author', '==', user.nickname)
        );
        const postsSnapshot = await getDocs(postsQuery);
        postsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
      }
      
      // 사용자 데이터 삭제
      const userRef = doc(db, 'users', user.uid);
      batch.delete(userRef);
      
      await batch.commit();
      
      // 로그 기록
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'user_delete',
        `${user.nickname}님의 계정을 삭제했습니다.`,
        user.uid,
        user.nickname
      );
      
      await fetchUsers();
      alert('사용자가 성공적으로 삭제되었습니다.');
    } catch (error) {
      console.error('사용자 삭제 실패:', error);
      alert('사용자 삭제에 실패했습니다.');
    }
  };

  // 새 사용자 추가 (닉네임 + 비밀번호만)
  const handleAddUser = async () => {
    if (!newUser.nickname || !newUser.password) {
      alert('닉네임과 비밀번호를 입력해주세요.');
      return;
    }

    // 비밀번호 검증 (최소 6자)
    if (newUser.password.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    // 닉네임 중복 확인
    try {
      const nicknameQuery = query(
        collection(db, 'users'),
        where('nickname', '==', newUser.nickname.trim())
      );
      const nicknameSnapshot = await getDocs(nicknameQuery);
      
      if (!nicknameSnapshot.empty) {
        alert('이미 사용 중인 닉네임입니다.');
        return;
      }

      const auth = getAuth();
      
      // 현재 관리자 정보 저장 (자동 로그인 방지용)
      const currentAdminInfo = currentUser ? {
        uid: currentUser.uid,
        email: currentUser.email,
        nickname: currentUser.nickname,
        role: currentUser.role,
        grade: currentUser.grade,
        profileImageUrl: currentUser.profileImageUrl
      } : null;
      
      // 닉네임 기반 내부 이메일 생성
      const sanitizedNickname = newUser.nickname
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, '')
        .replace(/\s+/g, '');
      
      // 고유성을 위해 타임스탬프 추가
      const timestamp = Date.now();
      const internalEmail = `${sanitizedNickname}${timestamp}@veryus.internal`;
      
      console.log('회원 추가 - 생성된 이메일:', internalEmail);
      console.log('회원 추가 - 닉네임:', newUser.nickname);
      
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        internalEmail, 
        newUser.password
      );
      
      console.log('회원 추가 - Firebase Auth 사용자 생성 완료, UID:', userCredential.user.uid);
      
      // 문서 ID를 uid로 설정하여 저장 (로그인 시 조회 용이)
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: internalEmail,
        nickname: newUser.nickname.trim(),
        grade: newUser.grade,
        role: newUser.role,
        createdAt: serverTimestamp()
      });

      // 로그 기록
      if (currentAdminInfo) {
        await logAdminAction(
          currentAdminInfo.uid,
          currentAdminInfo.nickname,
          'user_create',
          `${newUser.nickname}님의 계정을 생성했습니다.`,
          userCredential.user.uid,
          newUser.nickname
        );
      }
      
      // 새로 생성된 사용자로 자동 로그인된 상태를 해제하기 위해 로그아웃
      await signOut(auth);
      
      // 관리자로 다시 로그인 (localStorage에 저장된 이메일 정보 사용)
      // 관리자 이메일을 Firestore에서 조회
      if (currentAdminInfo) {
        try {
          const adminDocRef = doc(db, 'users', currentAdminInfo.uid);
          const adminDocSnap = await getDoc(adminDocRef);
          
          if (adminDocSnap.exists()) {
            const adminData = adminDocSnap.data();
            const adminEmail = adminData.email || currentAdminInfo.email;
            
            // 관리자 이메일로 다시 로그인 시도
            // 주의: 비밀번호는 저장하지 않으므로, 이 부분은 사용자에게 다시 로그인하도록 안내해야 함
            // 대신 localStorage에만 정보를 저장하고 페이지를 새로고침하지 않음
            localStorage.setItem('veryus_user', JSON.stringify({
              uid: currentAdminInfo.uid,
              email: adminEmail,
              nickname: currentAdminInfo.nickname,
              role: currentAdminInfo.role,
              grade: currentAdminInfo.grade,
              profileImageUrl: currentAdminInfo.profileImageUrl,
              isLoggedIn: true
            }));
            
            console.log('관리자 정보 복원 완료');
          } else {
            // 문서가 없으면 저장된 정보로만 복원
            localStorage.setItem('veryus_user', JSON.stringify({
              uid: currentAdminInfo.uid,
              email: currentAdminInfo.email,
              nickname: currentAdminInfo.nickname,
              role: currentAdminInfo.role,
              grade: currentAdminInfo.grade,
              profileImageUrl: currentAdminInfo.profileImageUrl,
              isLoggedIn: true
            }));
          }
        } catch (error) {
          console.error('관리자 정보 복원 실패:', error);
          // 실패해도 localStorage에 저장된 정보로 복원 시도
          localStorage.setItem('veryus_user', JSON.stringify({
            uid: currentAdminInfo.uid,
            email: currentAdminInfo.email,
            nickname: currentAdminInfo.nickname,
            role: currentAdminInfo.role,
            grade: currentAdminInfo.grade,
            profileImageUrl: currentAdminInfo.profileImageUrl,
            isLoggedIn: true
          }));
        }
      }
      
      await fetchUsers();
      setNewUser({ nickname: '', password: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
      setShowAddUserModal(false);
      alert(`${newUser.nickname}님의 계정이 성공적으로 생성되었습니다!`);
    } catch (error: any) {
      console.error('사용자 추가 실패:', error);
      let errorMessage = '사용자 추가에 실패했습니다.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = '이미 사용 중인 계정입니다.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '유효하지 않은 이메일입니다.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = '비밀번호가 너무 약합니다. (최소 6자)';
      }
      alert(errorMessage);
    }
  };


  // 마이그레이션
  const handleMigration = async () => {
    if (!window.confirm('메시지 데이터를 새로운 구조로 마이그레이션하시겠습니까?')) return;

    setIsMigrating(true);
    setMigrationStatus('마이그레이션 시작...');

    try {
      const success = await migrateExistingMessages();
      if (success) {
        setMigrationStatus('마이그레이션 완료!');
        alert('메시지 마이그레이션이 성공적으로 완료되었습니다.');
      }
    } catch (error) {
      console.error('Migration error:', error);
      setMigrationStatus('마이그레이션 실패');
      alert('마이그레이션 중 오류가 발생했습니다.');
    } finally {
      setIsMigrating(false);
      setTimeout(() => setMigrationStatus(''), 3000);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    exportToExcel(filteredUsers);
  };

  // 체크박스 토글 함수
  const handleToggleUserSelect = (uid: string) => {
    setSelectedUserUids(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // 전체 선택 토글
  const handleToggleSelectAll = () => {
    if (selectedUserUids.length === filteredUsers.length) {
      setSelectedUserUids([]);
    } else {
      setSelectedUserUids(filteredUsers.map(u => u.uid));
    }
  };

  // 벌크 등급 변경 (로그 포함)
  const handleBulkGradeChange = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명의 등급을 ${GRADE_NAMES[bulkGrade]}로 변경하시겠습니까?`)) return;
    if (!currentUser) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const user = users.find(u => u.uid === uid);
        if (!user) {
          failed++;
          errors.push(`${uid}: 사용자를 찾을 수 없습니다.`);
          continue;
        }

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { grade: bulkGrade });
        
        // 로그 기록
        await logAdminAction(
          currentUser.uid,
          currentUser.nickname,
          'grade_change',
          `${user.nickname}님의 등급을 ${GRADE_NAMES[bulkGrade]}로 일괄 변경했습니다.`,
          uid,
          user.nickname,
          { grade: user.grade },
          { grade: bulkGrade }
        );
        
        success++;
      } catch (error: any) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error.message || error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setShowBulkGradeModal(false);
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`등급 변경 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
    
    // 대량 작업 로그
    if (success > 0 && currentUser) {
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'bulk_action',
        `${selectedUserUids.length}명의 등급을 일괄 변경했습니다. (성공: ${success}, 실패: ${failed})`,
        undefined,
        undefined,
        undefined,
        { action: 'bulk_grade_change', targetCount: selectedUserUids.length, success, failed }
      );
    }
  };

  // 벌크 역할 변경 (로그 포함)
  const handleBulkRoleChange = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명의 역할을 ${bulkRole}로 변경하시겠습니까?`)) return;
    if (!currentUser) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const user = users.find(u => u.uid === uid);
        if (!user) {
          failed++;
          errors.push(`${uid}: 사용자를 찾을 수 없습니다.`);
          continue;
        }

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { role: bulkRole });
        
        // 로그 기록
        await logAdminAction(
          currentUser.uid,
          currentUser.nickname,
          'role_change',
          `${user.nickname}님의 역할을 ${bulkRole}로 일괄 변경했습니다.`,
          uid,
          user.nickname,
          { role: user.role },
          { role: bulkRole }
        );
        
        success++;
      } catch (error: any) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error.message || error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setShowBulkRoleModal(false);
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`역할 변경 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
    
    // 대량 작업 로그
    if (success > 0 && currentUser) {
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'bulk_action',
        `${selectedUserUids.length}명의 역할을 일괄 변경했습니다. (성공: ${success}, 실패: ${failed})`,
        undefined,
        undefined,
        undefined,
        { action: 'bulk_role_change', targetCount: selectedUserUids.length, success, failed }
      );
    }
  };

  // 벌크 비활성화 (로그 포함)
  const handleBulkDeactivate = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명을 비활성화하시겠습니까?`)) return;
    if (!currentUser) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const user = users.find(u => u.uid === uid);
        if (!user) {
          failed++;
          errors.push(`${uid}: 사용자를 찾을 수 없습니다.`);
          continue;
        }

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { isActive: false, status: USER_STATUS.INACTIVE });
        
        // 로그 기록
        await logAdminAction(
          currentUser.uid,
          currentUser.nickname,
          'status_change',
          `${user.nickname}님을 비활성화했습니다.`,
          uid,
          user.nickname,
          { isActive: user.isActive, status: getUserStatus(user) },
          { isActive: false, status: USER_STATUS.INACTIVE }
        );
        
        success++;
      } catch (error: any) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error.message || error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`비활성화 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
    
    // 대량 작업 로그
    if (success > 0 && currentUser) {
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'bulk_action',
        `${selectedUserUids.length}명을 일괄 비활성화했습니다. (성공: ${success}, 실패: ${failed})`,
        undefined,
        undefined,
        undefined,
        { action: 'bulk_deactivate', targetCount: selectedUserUids.length, success, failed }
      );
    }
  };

  // 선택된 사용자만 엑셀 내보내기
  const handleBulkExport = () => {
    const selectedUsers = users.filter(user => selectedUserUids.includes(user.uid));
    exportToExcel(selectedUsers);
    alert(`${selectedUsers.length}명의 정보를 엑셀로 내보냈습니다.`);
  };

  // 상태 변경 처리 (로그 포함)
  const handleStatusChange = async () => {
    if (!statusChangeUser || !currentUser) return;
    
    try {
      const oldStatus = getUserStatus(statusChangeUser);
      let suspendedUntil: Date | undefined;
      
      if (newStatus === USER_STATUS.SUSPENDED) {
        suspendedUntil = new Date();
        suspendedUntil.setDate(suspendedUntil.getDate() + suspensionDays);
      }
      
      await changeUserStatus(
        statusChangeUser.uid, 
        newStatus, 
        suspendedUntil, 
        suspensionReason
      );
      
      // 로그 기록
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'status_change',
        `${statusChangeUser.nickname}님의 상태를 ${USER_STATUS_LABELS[newStatus]}로 변경했습니다.${suspensionReason ? ` 사유: ${suspensionReason}` : ''}`,
        statusChangeUser.uid,
        statusChangeUser.nickname,
        { status: oldStatus, isActive: statusChangeUser.isActive, suspendedUntil: statusChangeUser.suspendedUntil },
        { status: newStatus, isActive: newStatus === USER_STATUS.ACTIVE, suspendedUntil }
      );
      
      await fetchUsers();
      setShowStatusModal(false);
      setStatusChangeUser(null);
      setNewStatus(USER_STATUS.ACTIVE);
      setSuspensionDays(1);
      setSuspensionReason('');
      alert('사용자 상태가 성공적으로 변경되었습니다.');
    } catch (error) {
      console.error('상태 변경 실패:', error);
      alert('상태 변경에 실패했습니다.');
    }
  };

  // 상태 변경 모달 열기
  const openStatusModal = (user: AdminUser) => {
    setStatusChangeUser(user);
    setNewStatus(getUserStatus(user));
    setSuspensionDays(1);
    setSuspensionReason('');
    setShowStatusModal(true);
  };

  // 사용자 활동 분석 열기
  const openUserActivity = async (user: AdminUser) => {
    setSelectedUserForActivity(user);
    setActivityLoading(true);
    
    try {
      const summary = await generateUserActivitySummary(user);
      setUserActivitySummary(summary);
    } catch (error) {
      console.error('활동 분석 실패:', error);
      alert('활동 분석을 불러오는데 실패했습니다.');
    } finally {
      setActivityLoading(false);
    }
  };

  // 로그 가져오기
  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const logsData = await fetchAdminLogs();
      setLogs(logsData);
      setFilteredLogs(logsData);
      setLogStats(calculateLogStats(logsData));
    } catch (error) {
      console.error('로그 가져오기 실패:', error);
      alert('로그를 가져오는데 실패했습니다.');
    } finally {
      setLogLoading(false);
    }
  };

  // 로그 필터링
  useEffect(() => {
    if (!logs) return;
    
    let filtered = logs;
    
    // 검색 필터
    if (logFilters.search) {
      const searchLower = logFilters.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.adminNickname.toLowerCase().includes(searchLower) ||
        log.targetNickname?.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower)
      );
    }
    
    // 액션 필터
    if (logFilters.action !== 'all') {
      filtered = filtered.filter(log => log.action === logFilters.action);
    }
    
    // 날짜 필터
    if (logFilters.dateRange) {
      filtered = filtered.filter(log => {
        const logDate = log.timestamp instanceof Date ? 
          log.timestamp : log.timestamp instanceof Timestamp ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate >= logFilters.dateRange!.start && logDate <= logFilters.dateRange!.end;
      });
    }
    
    setFilteredLogs(filtered);
  }, [logs, logFilters]);


  // 공지/알림 관련 함수들
  const loadNotifications = async () => {
    try {
      const fetchedNotifications = await fetchNotifications();
      setNotifications(fetchedNotifications);
    } catch (error) {
      console.error('알림 로드 실패:', error);
    }
  };

  const loadNotificationTemplates = async () => {
    try {
      const fetchedTemplates = await fetchNotificationTemplates();
      setNotificationTemplates(fetchedTemplates);
    } catch (error) {
      console.error('템플릿 로드 실패:', error);
    }
  };

  const handleSendNotification = async (notificationData: {
    title: string;
    content: string;
    type: NotificationType;
    targetUsers: string[];
  }) => {
    if (!currentUser) return;

    try {
      await sendNotification(
        notificationData.title,
        notificationData.content,
        notificationData.type,
        notificationData.targetUsers,
        currentUser.uid,
        currentUser.nickname || currentUser.displayName || '관리자'
      );

      // 로그 기록
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname || currentUser.displayName || '관리자',
        'notification_sent',
        `알림 발송: ${notificationData.title}`,
        undefined,
        undefined,
        undefined,
        { type: notificationData.type, targetCount: notificationData.targetUsers.length }
      );

      // 알림 목록 새로고침
      await loadNotifications();
      alert('알림이 성공적으로 발송되었습니다.');
    } catch (error) {
      console.error('알림 발송 실패:', error);
      alert('알림 발송에 실패했습니다.');
    }
  };

  const handleSaveTemplate = async (templateData: {
    name: string;
    title: string;
    content: string;
    type: NotificationType;
  }) => {
    if (!currentUser) return;

    try {
      await saveNotificationTemplate(
        templateData.name,
        templateData.title,
        templateData.content,
        templateData.type,
        currentUser.uid
      );

      // 템플릿 목록 새로고침
      await loadNotificationTemplates();
      alert('템플릿이 저장되었습니다.');
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      alert('템플릿 저장에 실패했습니다.');
    }
  };

  const handleUseTemplate = (template: NotificationTemplate) => {
    setShowNotificationModal(true);
    // 템플릿 데이터를 모달에 전달하는 로직은 모달 컴포넌트에서 처리
  };

  // 사용자 관리 섹션 함수 분리
  const renderUserFilters = () => (
    <div className="controls-section">
      {/* 검색 */}
      <div className="search-box">
        <Search size={20} />
        <input
          type="text"
          placeholder="닉네임 또는 이메일로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="clear-search" onClick={() => setSearchTerm('')}>
            <X size={16} />
          </button>
        )}
      </div>
      
      {/* 필터 - 가로 배치 */}
      <div className="filter-controls-inline">
        <select
          className="filter-select-inline"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option value="all">역할: 전체</option>
          {ROLE_OPTIONS.map(role => (
            <option key={role} value={role}>역할: {role}</option>
          ))}
        </select>
        
        <select
          className="filter-select-inline"
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
        >
          <option value="all">등급: 전체</option>
          {GRADE_ORDER.map(grade => (
            <option key={grade} value={grade}>등급: {grade} {GRADE_NAMES[grade]}</option>
          ))}
        </select>
        
        <select
          className="filter-select-inline"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">상태: 전체</option>
          {Object.entries(USER_STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>상태: {label}</option>
          ))}
        </select>
        
        <select
          className="filter-select-inline"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
        >
          <option value="createdAt">정렬: 가입일</option>
          <option value="nickname">정렬: 닉네임</option>
          <option value="role">정렬: 역할</option>
          <option value="grade">정렬: 등급</option>
        </select>

        <select
          className="filter-select-inline"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
        >
          <option value="desc">순서: 내림차순</option>
          <option value="asc">순서: 오름차순</option>
        </select>
      </div>
    </div>
  );

  const renderBulkActionBar = () => (
    selectedUserUids.length > 0 && (
      <div className="bulk-action-bar">
        <span>{selectedUserUids.length}명 선택됨</span>
        <button 
          className="bulk-action-btn" 
          onClick={() => setShowBulkGradeModal(true)}
          disabled={bulkActionLoading}
        >
          등급 일괄 변경
        </button>
        <button 
          className="bulk-action-btn" 
          onClick={() => setShowBulkRoleModal(true)}
          disabled={bulkActionLoading}
        >
          역할 일괄 변경
        </button>
        <button 
          className="bulk-action-btn" 
          onClick={handleBulkDeactivate}
          disabled={bulkActionLoading}
        >
          비활성화
        </button>
        <button 
          className="bulk-action-btn" 
          onClick={handleBulkExport}
          disabled={bulkActionLoading}
        >
          엑셀 내보내기
        </button>
        <button 
          className="bulk-action-btn" 
          onClick={() => setSelectedUserUids([])}
          disabled={bulkActionLoading}
        >
          선택 해제
        </button>
      </div>
    )
  );

  const renderUserList = () => (
    <div className="users-list">
      <div className="users-list-header">
        <div className="header-left">
          <h3>사용자 목록</h3>
          <span className="user-count">
            {filteredUsers.length}명 / 총 {users.length}명
          </span>
        </div>
        <div className="header-right">
          <button
            className="add-user-btn"
            onClick={() => {
              setShowAddUserModal(true);
              setNewUser({ nickname: '', password: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
              setShowPassword(false);
            }}
            title="새 회원 추가"
          >
            <UserPlus size={18} />
            회원 추가
          </button>
          <div className="select-all-wrapper">
            <input
              type="checkbox"
              checked={selectedUserUids.length === filteredUsers.length && filteredUsers.length > 0}
              onChange={handleToggleSelectAll}
              id="select-all"
            />
            <label htmlFor="select-all">전체 선택</label>
          </div>
        </div>
      </div>
      
      {filteredUsers.length === 0 ? (
        <EmptyState message="검색 조건에 맞는 사용자가 없습니다." />
      ) : (
        <div className="users-grid">
          {filteredUsers.map(user => (
            <div key={user.uid} className="user-card-wrapper">
              <div className="checkbox-wrapper">
                <input
                  type="checkbox"
                  checked={selectedUserUids.includes(user.uid)}
                  onChange={() => handleToggleUserSelect(user.uid)}
                  title="선택"
                />
              </div>
              <UserCard
                user={user}
                isEditing={editingUser?.uid === user.uid}
                onEdit={() => setEditingUser(user)}
                onSave={() => handleUpdateUser(user)}
                onCancel={() => setEditingUser(null)}
                onDelete={() => handleDeleteUser(user)}
                onView={() => setSelectedUser(user)}
                onStatusChange={() => openStatusModal(user)}
                editingUser={editingUser || undefined}
                onEditChange={(field, value) => {
                  if (editingUser) {
                    setEditingUser({ ...editingUser, [field]: value });
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderUsersPanel = () => (
    <div className="users-panel">
      {renderUserFilters()}
      {renderBulkActionBar()}
      {renderUserList()}
    </div>
  );

  const renderActivityPanel = () => (
    <div className="activity-panel">
      <UserActivityBoard />
    </div>
  );

  // 등급 관리 상태
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [promotionFilter, setPromotionFilter] = useState<string>('all'); // all, eligible, waiting
  const [gradeStats, setGradeStats] = useState<Record<string, number>>({});
  const [promotionModalUser, setPromotionModalUser] = useState<AdminUser | null>(null);
  const [promotionReason, setPromotionReason] = useState('');

  // 등급 통계 계산
  useEffect(() => {
    const stats: Record<string, number> = {};
    filteredUsers.forEach(user => {
      stats[user.grade] = (stats[user.grade] || 0) + 1;
    });
    setGradeStats(stats);
  }, [filteredUsers]);

  // 등급 관리 섹션 함수 분리
  const renderGradesHeader = () => (
    <div className="grades-header">
      <h2>등급 관리</h2>
      <p>멤버들의 활동 기간과 현재 등급을 확인하고 관리할 수 있습니다.</p>
    </div>
  );

  // 등급 통계 카드
  const renderGradeStats = () => (
    <div className="grade-stats-grid">
      {GRADE_ORDER.map(grade => {
        const count = gradeStats[grade] || 0;
        const percentage = filteredUsers.length > 0 ? ((count / filteredUsers.length) * 100).toFixed(1) : 0;
        return (
          <div key={grade} className="grade-stat-card">
            <div className="grade-emoji">{grade}</div>
            <div className="grade-name">{GRADE_NAMES[grade]}</div>
            <div className="grade-count">{count}명</div>
            <div className="grade-percentage">{percentage}%</div>
          </div>
        );
      })}
    </div>
  );

  // 등급 필터
  const renderGradeFilters = () => (
    <div className="grade-filters">
      <div className="filter-group">
        <label>등급 필터</label>
        <select
          className="filter-select"
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
        >
          <option value="all">전체 등급</option>
          {GRADE_ORDER.map(grade => (
            <option key={grade} value={grade}>
              {grade} {GRADE_NAMES[grade]}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>승급 상태</label>
        <select
          className="filter-select"
          value={promotionFilter}
          onChange={(e) => setPromotionFilter(e.target.value)}
        >
          <option value="all">전체</option>
          <option value="eligible">승급 가능</option>
          <option value="waiting">승급 대기</option>
        </select>
      </div>
      <button
        className="bulk-promote-btn"
        onClick={() => {
          const eligibleUsers = filteredUsers.filter(user => canPromote(user));
          if (eligibleUsers.length === 0) {
            alert('승급 가능한 사용자가 없습니다.');
            return;
          }
          if (!window.confirm(`승급 가능한 ${eligibleUsers.length}명을 모두 승급하시겠습니까?`)) return;
          handleBulkPromotion(eligibleUsers);
        }}
      >
        승급 가능자 일괄 승급
      </button>
    </div>
  );

  // 일괄 승급 처리
  const handleBulkPromotion = async (users: AdminUser[]) => {
    let success = 0;
    let failed = 0;
    
    for (const user of users) {
      try {
        const nextGrade = getNextGrade(user.grade);
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { grade: nextGrade });
        
        // 로그 기록
        if (currentUser) {
          await logAdminAction(
            currentUser.uid,
            currentUser.nickname,
            'grade_change',
            `${user.nickname}님을 ${GRADE_NAMES[nextGrade]}로 승급했습니다.`,
            user.uid,
            user.nickname,
            { grade: user.grade },
            { grade: nextGrade }
          );
        }
        
        success++;
      } catch (error) {
        console.error('승급 실패:', error);
        failed++;
      }
    }
    
    await fetchUsers();
    alert(`승급 완료: 성공 ${success}명, 실패 ${failed}명`);
  };

  // 개별 승급 처리 (로그 포함)
  const handlePromoteUser = async (user: AdminUser, reason?: string) => {
    const nextGrade = getNextGrade(user.grade);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { grade: nextGrade });
      
      // 로그 기록
      if (currentUser) {
        await logAdminAction(
          currentUser.uid,
          currentUser.nickname,
          'grade_change',
          `${user.nickname}님을 ${GRADE_NAMES[nextGrade]}로 승급했습니다.${reason ? ` 사유: ${reason}` : ''}`,
          user.uid,
          user.nickname,
          { grade: user.grade },
          { grade: nextGrade }
        );
      }
      
      await fetchUsers();
      setPromotionModalUser(null);
      setPromotionReason('');
      alert('등급이 성공적으로 변경되었습니다.');
    } catch (error) {
      console.error('등급 변경 중 오류:', error);
      alert('등급 변경 중 오류가 발생했습니다.');
    }
  };

  // 필터링된 사용자 목록
  const getFilteredGradesUsers = () => {
    let filtered = filteredUsers;
    
    // 등급 필터
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(user => user.grade === gradeFilter);
    }
    
    // 승급 상태 필터
    if (promotionFilter === 'eligible') {
      filtered = filtered.filter(user => canPromote(user));
    } else if (promotionFilter === 'waiting') {
      filtered = filtered.filter(user => {
        const promotionInfo = getDaysUntilPromotion(user);
        return !promotionInfo.canPromote && promotionInfo.daysLeft > 0;
      });
    }
    
    return filtered;
  };

  const renderGradesTable = () => {
    const displayUsers = getFilteredGradesUsers();
    
    return (
      <div className="grades-list">
        <div className="grades-table-container">
          <table className="grades-table">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>현재 등급</th>
                <th>입장일</th>
                <th>활동 기간</th>
                <th>예상 등급</th>
                <th>승급 정보</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                    <EmptyState message="검색 조건에 맞는 사용자가 없습니다." />
                  </td>
                </tr>
              ) : (
                displayUsers.map(user => {
                  const activityDays = calculateActivityDays(user.createdAt);
                  const canPromoteUser = canPromote(user);
                  const promotionInfo = getDaysUntilPromotion(user);
                  const expectedGrade = getExpectedGrade(user);
                  const eligibility = checkPromotionEligibility(user, promotionInfo.nextGrade);
                  
                  return (
                    <tr key={user.uid}>
                      <td>
                        <div className="user-cell">
                          <div className="profile-avatar small">
                            {user.profileImageUrl ? (
                              <img src={user.profileImageUrl} alt="프로필" />
                            ) : (
                              <User size={16} />
                            )}
                          </div>
                          <span>{user.nickname}</span>
                        </div>
                      </td>
                      <td>
                        <span className="grade-badge-large">
                          {user.grade} {GRADE_NAMES[user.grade]}
                        </span>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{activityDays}일</td>
                      <td>
                        {expectedGrade !== user.grade ? (
                          <span className="expected-grade">
                            {expectedGrade} {GRADE_NAMES[expectedGrade]}
                          </span>
                        ) : (
                          <span className="current-grade-match">현재 등급</span>
                        )}
                      </td>
                      <td>
                        {(user.grade === GRADE_SYSTEM.SUN || user.grade === GRADE_SYSTEM.GALAXY) ? (
                          <span className="status-badge max-grade">최고등급</span>
                        ) : canPromoteUser ? (
                          <div className="promotion-ready">
                            <span className="promotion-status">승급 가능</span>
                            <span className="next-grade">→ {promotionInfo.nextGrade} {GRADE_NAMES[promotionInfo.nextGrade]}</span>
                          </div>
                        ) : (
                          <div className="promotion-waiting">
                            <span className="promotion-status">승급 대기</span>
                            <span className="days-left">{promotionInfo.daysLeft > 0 ? `${promotionInfo.daysLeft}일 남음` : '조건 불충족'}</span>
                            {eligibility.reasons.length > 0 && (
                              <div className="eligibility-reasons" title={eligibility.reasons.join(', ')}>
                                {eligibility.reasons[0]}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {(user.grade === GRADE_SYSTEM.SUN || user.grade === GRADE_SYSTEM.GALAXY) ? (
                          <span className="status-badge">최고등급</span>
                        ) : canPromoteUser ? (
                          <button
                            className="promote-button"
                            onClick={() => {
                              setPromotionModalUser(user);
                              setPromotionReason('');
                            }}
                          >
                            승급
                          </button>
                        ) : (
                          <button
                            className="promote-button disabled"
                            disabled
                            title={eligibility.reasons.join(', ')}
                          >
                            대기 중
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderGradesPanel = () => (
    <div className="grades-panel">
      {renderGradesHeader()}
      {renderGradeStats()}
      {renderGradeFilters()}
      {renderGradesTable()}
      
      {/* 승급 모달 */}
      {promotionModalUser && (
        <div className="modal-overlay" onClick={() => setPromotionModalUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>등급 승급</h2>
              <button className="close-btn" onClick={() => setPromotionModalUser(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="user-info-display">
                <h3>{promotionModalUser.nickname}</h3>
                <p>현재 등급: {promotionModalUser.grade} {GRADE_NAMES[promotionModalUser.grade]}</p>
                <p>승급 예정: {getNextGrade(promotionModalUser.grade)} {GRADE_NAMES[getNextGrade(promotionModalUser.grade)]}</p>
              </div>
              <div className="form-group">
                <label>승급 사유 (선택사항)</label>
                <textarea
                  value={promotionReason}
                  onChange={(e) => setPromotionReason(e.target.value)}
                  className="filter-select"
                  rows={3}
                  placeholder="승급 사유를 입력하세요..."
                />
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => handlePromoteUser(promotionModalUser, promotionReason)} 
                  className="save-btn"
                >
                  승급하기
                </button>
                <button 
                  onClick={() => setPromotionModalUser(null)} 
                  className="cancel-btn"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 활동 분석 섹션 함수 분리
  const renderAnalyticsHeader = () => (
    <div className="analytics-header">
      <h2>사용자 활동 분석</h2>
      <p>사용자를 선택하여 상세한 활동 내역과 통계를 확인할 수 있습니다.</p>
    </div>
  );

  const renderUserSelection = () => (
    <div className="user-selection">
      <h3>분석할 사용자 선택</h3>
      <div className="users-grid">
        {filteredUsers.slice(0, 12).map(user => (
          <div key={user.uid} className="user-select-card" onClick={() => openUserActivity(user)}>
            <div className="profile-avatar">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="프로필" />
              ) : (
                <User size={24} />
              )}
            </div>
            <div className="user-info">
              <div className="user-name">{user.nickname}</div>
              <div className="user-grade">{user.grade}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderActivityAnalysis = () => (
    <div className="activity-analysis">
      <div className="analysis-header">
        <button 
          className="back-button"
          onClick={() => {
            setSelectedUserForActivity(null);
            setUserActivitySummary(null);
          }}
        >
          ← 목록으로 돌아가기
        </button>
      </div>
      {activityLoading ? (
        <div className="loading-container">
          <LoadingSpinner />
        </div>
      ) : userActivitySummary ? (
        <div className="analysis-content">
          <UserActivitySummary summary={userActivitySummary} />
          <div className="analysis-charts">
            <ActivityChart activities={userActivitySummary.recentActivities} />
            <ActivityStatsCard
              stats={userActivitySummary.activityStats}
              title="활동 통계"
              icon={<TrendingUp size={24} />}
            />
          </div>
        </div>
      ) : (
        <div className="error-state">
          <p>활동 데이터를 불러올 수 없습니다.</p>
        </div>
      )}
    </div>
  );

  const renderAnalyticsPanel = () => (
    <div className="analytics-panel">
      {renderAnalyticsHeader()}
      {!selectedUserForActivity ? renderUserSelection() : renderActivityAnalysis()}
    </div>
  );

  // 관리자 로그 섹션 함수 분리
  const renderLogsHeader = () => (
    <div className="logs-header">
      <h2>관리자 로그</h2>
      <p>관리자가 수행한 모든 작업의 기록을 확인할 수 있습니다.</p>
      <button 
        className="export-logs-btn"
        onClick={() => exportLogsToExcel(filteredLogs)}
      >
        <Download size={20} />
        로그 내보내기
      </button>
    </div>
  );

  const renderLogsStats = () => (
    logStats && (
      <div className="logs-stats">
        <LogStatsCard
          stats={logStats}
          title="로그 통계"
          icon={<History size={24} />}
        />
      </div>
    )
  );

  const renderLogsFilter = () => (
    <LogFilter
      filters={logFilters}
      onFilterChange={setLogFilters}
      actions={['user_create', 'user_update', 'user_delete', 'grade_change', 'role_change', 'status_change', 'bulk_action', 'data_export']}
    />
  );

  const renderLogsList = () => (
    logLoading ? (
      <div className="loading-container">
        <LoadingSpinner />
      </div>
    ) : (
      <div className="logs-list">
        <div className="logs-list-header">
          <h3>로그 목록</h3>
          <span className="log-count">
            {filteredLogs.length}개 / 총 {logs.length}개
          </span>
        </div>
        {filteredLogs.length === 0 ? (
          <EmptyState message="검색 조건에 맞는 로그가 없습니다." />
        ) : (
          <div className="logs-container">
            {filteredLogs.map(log => (
              <LogItem
                key={log.id}
                log={log}
                onViewDetails={setSelectedLog}
              />
            ))}
          </div>
        )}
      </div>
    )
  );

  const renderLogsPanel = () => (
    <div className="logs-panel">
      {renderLogsHeader()}
      {renderLogsStats()}
      {renderLogsFilter()}
      {renderLogsList()}
    </div>
  );

  // 공지/알림 섹션 함수 분리
  const renderNotificationsHeader = () => (
    <div className="notifications-header">
      <h2>공지/알림 관리</h2>
      <button 
        onClick={() => setShowNotificationModal(true)}
        className="btn btn-primary"
      >
        <Send size={16} />
        새 알림 발송
      </button>
    </div>
  );

  const renderNotificationsStats = () => (
    <div className="notifications-stats">
      <NotificationStats stats={calculateNotificationStats(notifications)} />
    </div>
  );

  const renderNotificationsMain = () => (
    <div className="notifications-main">
      <div className="notifications-section">
        <NotificationList
          notifications={notifications}
          onRefresh={loadNotifications}
        />
      </div>
      <div className="templates-section">
        <NotificationTemplates
          templates={notificationTemplates}
          onSaveTemplate={handleSaveTemplate}
          onUseTemplate={handleUseTemplate}
        />
      </div>
    </div>
  );

  const renderNotificationsPanel = () => (
    <div className="notifications-panel">
      {renderNotificationsHeader()}
      <div className="notifications-content">
        {renderNotificationsStats()}
        {renderNotificationsMain()}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* 헤더(관리자 패널 문구) 화면 최상단 */}
      <div className="admin-header" style={{marginBottom: 0, paddingTop: 32, paddingBottom: 16}}>
        <h1 className="admin-title" style={{fontSize: '2.4rem', fontWeight: 900, color: '#7f5fff', letterSpacing: '-1px', margin: 0, textAlign: 'center'}}>
          <Shield size={32} style={{verticalAlign: 'middle', marginRight: 8}} />
          관리자 패널
        </h1>
      </div>
      {/* 탭 버튼 헤더 바로 아래로 이동 */}
      <div className="admin-tabs" style={{marginTop: 12, marginBottom: 24}}>
        <button 
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={20} />
          <span>사용자 관리</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <Activity size={20} />
          <span>활동 현황</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'grades' ? 'active' : ''}`}
          onClick={() => setActiveTab('grades')}
        >
          <Crown size={20} />
          <span>등급 관리</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <TrendingUp size={20} />
          <span>활동 분석</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('logs');
            fetchLogs();
          }}
        >
          <History size={20} />
          <span>관리자 로그</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('notifications');
            loadNotifications();
            loadNotificationTemplates();
          }}
        >
          <Bell size={20} />
          <span>공지/알림</span>
        </button>
      </div>
      {/* 주요 콘텐츠(tab-content)는 컨테이너 박스/배경을 줄이고, 여백을 충분히 */}
      <div className="tab-content" style={{background: 'none', boxShadow: 'none', padding: '0 0 48px 0', margin: '0 auto', maxWidth: 1400}}>
        {activeTab === 'users' && renderUsersPanel()}
        {activeTab === 'activity' && renderActivityPanel()}
        {activeTab === 'grades' && renderGradesPanel()}
        {activeTab === 'analytics' && renderAnalyticsPanel()}
        {activeTab === 'logs' && renderLogsPanel()}
        {activeTab === 'notifications' && renderNotificationsPanel()}
      </div>

      {/* 사용자 상세 모달 */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>사용자 상세 정보</h2>
              <button className="close-btn" onClick={() => setSelectedUser(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="user-detail-card">
                <div className="profile-avatar large">
                  {selectedUser.profileImageUrl ? (
                    <img src={selectedUser.profileImageUrl} alt="프로필" />
                  ) : (
                    <User size={48} />
                  )}
                </div>
                <div className="user-detail-info">
                  <h3>{selectedUser.nickname}</h3>
                  <div className="detail-badges">
                    <span style={{ marginLeft: 6, fontSize: '1.2em' }}>{selectedUser.grade}</span>
                    <RoleDisplay role={selectedUser.role} />
                  </div>
                </div>
              </div>
              
              <div className="detail-rows">
                <div className="detail-row">
                  <strong>이메일:</strong> 
                  <span>{selectedUser.email}</span>
                </div>
                <div className="detail-row">
                  <strong>가입일:</strong> 
                  <span>{formatDate(selectedUser.createdAt)}</span>
                </div>
                <div className="detail-row">
                  <strong>활동 기간:</strong> 
                  <span>{calculateActivityDays(selectedUser.createdAt)}일</span>
                </div>
                <div className="detail-row">
                  <strong>UID:</strong> 
                  <span className="uid-text">{selectedUser.uid}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 회원 추가 모달 */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => {
          setShowAddUserModal(false);
          setNewUser({ nickname: '', password: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
          setShowPassword(false);
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>새 회원 추가</h2>
              <button className="close-btn" onClick={() => {
                setShowAddUserModal(false);
                setNewUser({ nickname: '', password: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
                setShowPassword(false);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>닉네임 <span style={{color: '#ef4444'}}>*</span></label>
                <input
                  type="text"
                  value={newUser.nickname}
                  onChange={(e) => setNewUser({...newUser, nickname: e.target.value})}
                  placeholder="닉네임을 입력하세요"
                  maxLength={20}
                />
              </div>
              <div className="form-group">
                <label>비밀번호 <span style={{color: '#ef4444'}}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    placeholder="비밀번호를 입력하세요 (최소 6자)"
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#7f5fff',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
                  최소 6자 이상 입력해주세요
                </p>
              </div>
              <div className="form-group">
                <label>등급</label>
                <select
                  value={newUser.grade}
                  onChange={(e) => setNewUser({...newUser, grade: e.target.value as any})}
                >
                  {GRADE_ORDER.map(grade => (
                    <option key={grade} value={grade}>
                      {grade} {GRADE_NAMES[grade]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>역할</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value as any})}
                >
                  {ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button onClick={handleAddUser} className="save-btn">
                  회원 추가
                </button>
                <button onClick={() => {
                  setShowAddUserModal(false);
                  setNewUser({ nickname: '', password: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
                  setShowPassword(false);
                }} className="cancel-btn">
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 벌크 등급 변경 모달 */}
      {showBulkGradeModal && (
        <div className="modal-overlay" onClick={() => setShowBulkGradeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>등급 일괄 변경</h2>
              <button className="close-btn" onClick={() => setShowBulkGradeModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>선택된 {selectedUserUids.length}명의 등급을 변경합니다.</p>
              <div className="form-group">
                <label>변경할 등급</label>
                <select
                  value={bulkGrade}
                  onChange={(e) => setBulkGrade(e.target.value as any)}
                  className="filter-select"
                >
                  {GRADE_ORDER.map(grade => (
                    <option key={grade} value={grade}>
                      {grade} {GRADE_NAMES[grade]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={handleBulkGradeChange} 
                  className="save-btn"
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? '처리 중...' : '변경'}
                </button>
                <button 
                  onClick={() => setShowBulkGradeModal(false)} 
                  className="cancel-btn"
                  disabled={bulkActionLoading}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 벌크 역할 변경 모달 */}
      {showBulkRoleModal && (
        <div className="modal-overlay" onClick={() => setShowBulkRoleModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>역할 일괄 변경</h2>
              <button className="close-btn" onClick={() => setShowBulkRoleModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>선택된 {selectedUserUids.length}명의 역할을 변경합니다.</p>
              <div className="form-group">
                <label>변경할 역할</label>
                <select
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value as any)}
                  className="filter-select"
                >
                  {ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={handleBulkRoleChange} 
                  className="save-btn"
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? '처리 중...' : '변경'}
                </button>
                <button 
                  onClick={() => setShowBulkRoleModal(false)} 
                  className="cancel-btn"
                  disabled={bulkActionLoading}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상태 변경 모달 */}
      {showStatusModal && statusChangeUser && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>사용자 상태 변경</h2>
              <button className="close-btn" onClick={() => setShowStatusModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="user-info-display">
                <h3>{statusChangeUser.nickname}</h3>
                <p>현재 상태: {createStatusDisplay(getUserStatus(statusChangeUser))}</p>
              </div>
              
              <div className="form-group">
                <label>변경할 상태</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as UserStatus)}
                  className="filter-select"
                >
                  {Object.entries(USER_STATUS_LABELS).map(([status, label]) => (
                    <option key={status} value={status}>{label}</option>
                  ))}
                </select>
              </div>
              
              {newStatus === USER_STATUS.SUSPENDED && (
                <>
                  <div className="form-group">
                    <label>정지 기간 (일)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={suspensionDays}
                      onChange={(e) => setSuspensionDays(parseInt(e.target.value) || 1)}
                      className="filter-select"
                    />
                  </div>
                  <div className="form-group">
                    <label>정지 사유</label>
                    <textarea
                      value={suspensionReason}
                      onChange={(e) => setSuspensionReason(e.target.value)}
                      className="filter-select"
                      rows={3}
                      placeholder="정지 사유를 입력하세요..."
                    />
                  </div>
                </>
              )}
              
              <div className="modal-actions">
                <button onClick={handleStatusChange} className="save-btn">
                  변경
                </button>
                <button onClick={() => setShowStatusModal(false)} className="cancel-btn">
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 로그 상세 모달 */}
      <LogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />

      {/* 알림 발송 모달 */}
      {showNotificationModal && (
        <NotificationSendModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
          users={users}
          onSend={handleSendNotification}
        />
      )}
    </div>
  );
};

export default AdminPanel; 