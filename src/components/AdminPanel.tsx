import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  orderBy,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  getAuth
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
  Send
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
  getDefaultTemplates
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
  UserActivitySummary as UserActivitySummaryComponent,
  ActivityChart,
  LogItem,
  LogStatsCard,
  LogDetailModal,
  LogFilter,
  NotificationSendModal,
  NotificationList,
  NotificationStats as NotificationStatsComponent,
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

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
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
    email: '',
    nickname: '',
    grade: GRADE_SYSTEM.CHERRY,
    role: ROLE_SYSTEM.MEMBER
  });
  
  // 통계
  const [userStats, setUserStats] = useState({
    totalUsers: 0,
    adminCount: 0,
    activeUsers: 0,
    recentJoins: 0,
    averageGrade: '',
    gradeDistribution: {} as Record<string, number>,
    roleDistribution: {} as Record<string, number>
  });
  
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

  // 초기화 및 권한 체크
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const user = JSON.parse(userString);
        setCurrentUser(user);

        if (!checkAdminAccess(user)) {
          alert('관리자 권한이 필요합니다.');
          navigate('/');
          return;
        }

        fetchUsers();
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
        navigate('/');
      }
    } else {
      alert('로그인이 필요합니다.');
      navigate('/login');
    }
  }, [navigate]);

  // 사용자 목록 필터링 및 정렬
  useEffect(() => {
    if (!users) return;
    
    let filtered = filterUsers(users, {
      search: searchTerm,
      grade: filterGrade !== 'all' ? filterGrade : undefined,
      role: filterRole !== 'all' ? filterRole : undefined,
      status: filterStatus !== 'all' ? filterStatus : undefined
    });

    // 정렬 적용
    filtered = sortUsers(filtered, sortBy, sortOrder);

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterRole, filterGrade, filterStatus, sortBy, sortOrder]);

  // 사용자 목록 가져오기
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(usersQuery);
      
      const usersData = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as AdminUser[];
      
      setUsers(usersData);
      setUserStats(calculateStats(usersData));
    } catch (error) {
      console.error('사용자 목록 가져오기 실패:', error);
      alert('사용자 목록을 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 사용자 업데이트
  const handleUpdateUser = async (user: AdminUser) => {
    if (!editingUser) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        nickname: editingUser.nickname,
        role: editingUser.role,
        grade: editingUser.grade
      });
      
      await fetchUsers();
      setEditingUser(null);
      alert('사용자 정보가 성공적으로 업데이트되었습니다.');
    } catch (error) {
      console.error('사용자 업데이트 실패:', error);
      alert('사용자 정보 업데이트에 실패했습니다.');
    }
  };

  // 사용자 삭제
  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`정말로 ${user.nickname}님을 삭제하시겠습니까?`)) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await fetchUsers();
      alert('사용자가 성공적으로 삭제되었습니다.');
    } catch (error) {
      console.error('사용자 삭제 실패:', error);
      alert('사용자 삭제에 실패했습니다.');
    }
  };

  // 새 사용자 추가
  const handleAddUser = async () => {
    if (!newUser.email || !newUser.nickname) {
      alert('이메일과 닉네임을 입력해주세요.');
      return;
    }

    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, newUser.email, 'temporary123!');
      
      await addDoc(collection(db, 'users'), {
        uid: userCredential.user.uid,
        email: newUser.email,
        nickname: newUser.nickname,
        grade: newUser.grade,
        role: newUser.role,
        createdAt: serverTimestamp()
      });

      await fetchUsers();
      setShowAddUserModal(false);
      setNewUser({ email: '', nickname: '', grade: GRADE_SYSTEM.CHERRY, role: ROLE_SYSTEM.MEMBER });
      alert('새 사용자가 성공적으로 추가되었습니다.');
    } catch (error) {
      console.error('사용자 추가 실패:', error);
      alert('사용자 추가에 실패했습니다.');
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

  // 벌크 등급 변경
  const handleBulkGradeChange = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명의 등급을 ${GRADE_NAMES[bulkGrade]}로 변경하시겠습니까?`)) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { grade: bulkGrade });
        success++;
      } catch (error) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setShowBulkGradeModal(false);
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`등급 변경 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
  };

  // 벌크 역할 변경
  const handleBulkRoleChange = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명의 역할을 ${bulkRole}로 변경하시겠습니까?`)) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { role: bulkRole });
        success++;
      } catch (error) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setShowBulkRoleModal(false);
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`역할 변경 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
  };

  // 벌크 비활성화
  const handleBulkDeactivate = async () => {
    if (!window.confirm(`선택된 ${selectedUserUids.length}명을 비활성화하시겠습니까?`)) return;
    
    setBulkActionLoading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const uid of selectedUserUids) {
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { isActive: false });
        success++;
      } catch (error) {
        failed++;
        const user = users.find(u => u.uid === uid);
        errors.push(`${user?.nickname || uid}: ${error}`);
      }
    }

    setBulkActionResult({ success, failed, errors });
    setBulkActionLoading(false);
    
    if (success > 0) {
      await fetchUsers();
      alert(`비활성화 완료: 성공 ${success}명, 실패 ${failed}명`);
    }
  };

  // 선택된 사용자만 엑셀 내보내기
  const handleBulkExport = () => {
    const selectedUsers = users.filter(user => selectedUserUids.includes(user.uid));
    exportToExcel(selectedUsers);
    alert(`${selectedUsers.length}명의 정보를 엑셀로 내보냈습니다.`);
  };

  // 상태 변경 처리
  const handleStatusChange = async () => {
    if (!statusChangeUser) return;
    
    try {
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
      
      await fetchUsers();
      setShowStatusModal(false);
      setStatusChangeUser(null);
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
          log.timestamp : new Date(log.timestamp);
        return logDate >= logFilters.dateRange!.start && logDate <= logFilters.dateRange!.end;
      });
    }
    
    setFilteredLogs(filtered);
  }, [logs, logFilters]);

  // 로그 기록 함수들 (기존 함수들에 로그 추가)
  const handleUpdateUserWithLog = async (user: AdminUser) => {
    if (!editingUser || !currentUser) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        nickname: editingUser.nickname,
        role: editingUser.role,
        grade: editingUser.grade
      });
      
      // 로그 기록
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'user_update',
        `${user.nickname}님의 정보를 수정했습니다.`,
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

  const handleDeleteUserWithLog = async (user: AdminUser) => {
    if (!window.confirm(`정말로 ${user.nickname}님을 삭제하시겠습니까?`) || !currentUser) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid));
      
      // 로그 기록
      await logAdminAction(
        currentUser.uid,
        currentUser.nickname,
        'user_delete',
        `${user.nickname}님을 삭제했습니다.`,
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

  if (loading) {
    return (
      <div className="admin-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Toss 스타일 카드 그룹 - 헤더 바로 위에만 위치 */}
      <div className="toss-card-group">
        <div className="toss-card">
          <FaUsers className="icon" />
          <div className="main-value">{userStats.totalUsers}명</div>
          <div className="desc">총 회원 수</div>
          <div className="sub-desc">최근 한달 가입: {userStats.recentJoins}명</div>
        </div>
        <div className="toss-card">
          <FaUserShield className="icon" />
          <div className="main-value">{userStats.adminCount}명</div>
          <div className="desc">운영진 현황</div>
          <div className="sub-desc">전체 대비: {((userStats.adminCount / (userStats.totalUsers || 1)) * 100).toFixed(1)}%</div>
        </div>
        <div className="toss-card">
          <FaChartPie className="icon" />
          <div className="main-value">{userStats.averageGrade || '-'}</div>
          <div className="desc">평균 등급</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {Object.entries(userStats.gradeDistribution).map(([grade, count]) => (
              <span key={grade} style={{ color: "#3182F6", fontSize: "0.95rem" }}>{grade} {count}명</span>
            ))}
          </div>
        </div>
        <div className="toss-card">
          <FaFire className="icon" />
          <div className="main-value">{userStats.activeUsers}명</div>
          <div className="desc">활성 사용자</div>
          <div className="sub-desc">전체 회원</div>
        </div>
      </div>
      {/* 헤더 */}
      <div className="admin-header">
        <div className="header-left">
          <h1 className="admin-title">
            <Shield size={28} />
            관리자 패널
          </h1>
        </div>
        <div className="header-actions">
          {activeTab === 'users' && (
            <>
              <button className="add-user-button" onClick={() => setShowAddUserModal(true)}>
                <UserPlus size={20} />
                회원 추가
              </button>
              <button className="export-button" onClick={handleExportExcel}>
                <Download size={20} />
                엑셀 내보내기
              </button>
              <button 
                className="migration-button" 
                onClick={handleMigration}
                disabled={isMigrating}
              >
                <Database size={20} />
                {isMigrating ? '마이그레이션 중...' : 'DB 마이그레이션'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="admin-tabs">
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

      {/* 마이그레이션 상태 */}
      {migrationStatus && (
        <div className={`migration-status ${
          migrationStatus.includes('실패') ? 'error' : 
          migrationStatus.includes('완료') ? 'success' : 'warning'
        }`}>
          {migrationStatus}
        </div>
      )}

      {/* 탭 컨텐츠 */}
      <div className="tab-content">
        {activeTab === 'users' && (
          <div className="users-panel">
            {/* 검색 및 필터 */}
            <div className="controls-section">
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
              
              <div className="filter-controls">
                <div className="filter-group">
                  <label>역할</label>
                  <select
                    className="filter-select"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                  >
                    <option value="all">전체</option>
                    {ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>등급</label>
                  <select
                    className="filter-select"
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                  >
                    <option value="all">전체</option>
                    {GRADE_ORDER.map(grade => (
                      <option key={grade} value={grade}>{grade} {GRADE_NAMES[grade]}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>상태</label>
                  <select
                    className="filter-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">전체</option>
                    {Object.entries(USER_STATUS_LABELS).map(([status, label]) => (
                      <option key={status} value={status}>{label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>정렬</label>
                  <select
                    className="filter-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                  >
                    <option value="createdAt">가입일 순</option>
                    <option value="nickname">닉네임 순</option>
                    <option value="role">역할 순</option>
                    <option value="grade">등급 순</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>순서</label>
                  <select
                    className="filter-select"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="desc">내림차순</option>
                    <option value="asc">오름차순</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 벌크 액션 바 */}
            {selectedUserUids.length > 0 && (
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
            )}

            {/* 사용자 목록 */}
            <div className="users-list">
              <div className="users-list-header">
                <h3>사용자 목록</h3>
                <span className="user-count">
                  {filteredUsers.length}명 / 총 {users.length}명
                </span>
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
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="activity-panel">
            <UserActivityBoard />
          </div>
        )}

        {activeTab === 'grades' && (
          <div className="grades-panel">
            <div className="grades-header">
              <h2>등급 관리</h2>
              <p>멤버들의 활동 기간과 현재 등급을 확인하고 관리할 수 있습니다.</p>
            </div>
            
            <div className="grades-list">
              <div className="grades-table-container">
                <table className="grades-table">
                  <thead>
                    <tr>
                      <th>닉네임</th>
                      <th>입장일</th>
                      <th>활동 기간</th>
                      <th>승급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => {
                      const activityDays = calculateActivityDays(user.createdAt);
                      const canPromoteUser = canPromote(user);
                      const currentGradeIndex = GRADE_ORDER.indexOf(user.grade as any);
                      const nextGradeIndex = currentGradeIndex + 1;
                      const nextGradeDay = (nextGradeIndex) * 90;
                      const daysToPromote = nextGradeDay - activityDays;
                      return (
                        <tr key={user.uid}>
                          <td style={{ width: 'auto', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <div className="user-cell">
                              <div className="profile-avatar small">
                                {user.profileImageUrl ? (
                                  <img src={user.profileImageUrl} alt="프로필" />
                                ) : (
                                  <User size={16} />
                                )}
                              </div>
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {user.nickname}
                                <span style={{ marginLeft: 2, fontSize: '1em', verticalAlign: 'middle' }}>{user.grade}</span>
                              </span>
                            </div>
                          </td>
                          <td>{formatDate(user.createdAt)}</td>
                          <td>{activityDays}일</td>
                          <td>
                            {(user.grade === GRADE_SYSTEM.SUN) ? (
                              <span className="status-badge">최고등급</span>
                            ) : canPromoteUser ? (
                              <button
                                className="promote-button"
                                onClick={async () => {
                                  const nextGrade = getNextGrade(user.grade);
                                  if (!window.confirm(`${user.nickname}님의 등급을 ${GRADE_NAMES[nextGrade]}로 승급하시겠습니까?`)) return;
                                  try {
                                    const userRef = doc(db, 'users', user.uid);
                                    await updateDoc(userRef, { grade: nextGrade });
                                    await fetchUsers();
                                    alert('등급이 성공적으로 변경되었습니다.');
                                  } catch (error) {
                                    console.error('등급 변경 중 오류:', error);
                                    alert('등급 변경 중 오류가 발생했습니다.');
                                  }
                                }}
                              >
                                승급
                              </button>
                            ) : (
                              <span className="status-badge">승급까지 {daysToPromote > 0 ? `${daysToPromote}일` : '0일'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-panel">
            <div className="analytics-header">
              <h2>사용자 활동 분석</h2>
              <p>사용자를 선택하여 상세한 활동 내역과 통계를 확인할 수 있습니다.</p>
            </div>
            
            {!selectedUserForActivity ? (
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
            ) : (
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
                    <UserActivitySummaryComponent summary={userActivitySummary} />
                    
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
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-panel">
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
            
            {logStats && (
              <div className="logs-stats">
                <LogStatsCard
                  stats={logStats}
                  title="로그 통계"
                  icon={<History size={24} />}
                />
              </div>
            )}
            
            <LogFilter
              filters={logFilters}
              onFilterChange={setLogFilters}
              actions={['user_create', 'user_update', 'user_delete', 'grade_change', 'role_change', 'status_change', 'bulk_action', 'data_export']}
            />
            
            {logLoading ? (
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
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="notifications-panel">
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

            <div className="notifications-content">
              <div className="notifications-stats">
                <NotificationStatsComponent stats={calculateNotificationStats(notifications)} />
              </div>

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
            </div>
          </div>
        )}
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
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>새 회원 추가</h2>
              <button className="close-btn" onClick={() => setShowAddUserModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>이메일</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="이메일 주소"
                />
              </div>
              <div className="form-group">
                <label>닉네임</label>
                <input
                  type="text"
                  value={newUser.nickname}
                  onChange={(e) => setNewUser({...newUser, nickname: e.target.value})}
                  placeholder="닉네임"
                />
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
                  추가
                </button>
                <button onClick={() => setShowAddUserModal(false)} className="cancel-btn">
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