import React, { useState, useEffect } from 'react';
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
  limit,
  addDoc,
  serverTimestamp,
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import { deleteUser } from 'firebase/auth';
import { db } from '../firebase';
import { 
  Users, 
  Search, 
  Edit3, 
  Trash2, 
  Crown, 
  Shield, 
  User,
  ArrowLeft,
  Filter,
  CheckCircle,
  X,
  Download,
  Eye,
  Calendar,
  Activity,
  UserPlus,
  Database
} from 'lucide-react';
import './AdminUserPanel.css';
import UserActivityBoard from './UserActivityBoard';
import { migrateExistingMessages } from '../utils/chatService';

interface AdminUser {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  role: string;
  createdAt: any;
  profileImageUrl?: string;
}

interface UserStats {
  totalUsers: number;
  adminCount: number;
  gradeDistribution: Record<string, number>;
  roleDistribution: Record<string, number>;
}

interface ExtendedUserStats extends UserStats {
  activeUsers: number;
  recentJoins: number;
  averageGrade: string;
}

interface GradeNames {
  [key: string]: string;
}

// 관리자 권한 체크 함수
const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || ['리더', '운영진'].includes(user.role);
};

const AdminUserPanel: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'nickname' | 'grade' | 'role' | 'createdAt'>('createdAt');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [userStats, setUserStats] = useState<ExtendedUserStats>({
    totalUsers: 0,
    adminCount: 0,
    activeUsers: 0,
    recentJoins: 0,
    averageGrade: '',
    gradeDistribution: {},
    roleDistribution: {}
  });
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    nickname: '',
    grade: '🍒',
    role: '일반'
  });
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'grades'>('users');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');

  // 등급 옵션 (이모지로 표시)
  const gradeOptions = [
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
  const GRADE_ORDER = [
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
  const gradeNames: GradeNames = {
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
  const roleOptions = ['일반', '부운영진', '운영진', '리더'];

  useEffect(() => {
    // 현재 사용자 정보 확인
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const user = JSON.parse(userString);
        console.log('관리자 패널 접근 사용자:', user);
        setCurrentUser(user);

        // 관리자 권한 확인
        if (!checkAdminAccess(user)) {
          alert('관리자 권한이 필요합니다.');
          navigate('/');
          return;
        }

        // 권한이 확인되면 사용자 목록 가져오기
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

  useEffect(() => {
    if (!users) return; // 사용자 데이터가 없으면 필터링 하지 않음
    
    let filtered = [...users];

    // 검색어 필터링
    if (searchTerm) {
      filtered = filtered.filter(user => {
        const nicknameLower = (user.nickname || '').toLowerCase();
        const emailLower = (user.email || '').toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();
        return nicknameLower.includes(searchTermLower) || emailLower.includes(searchTermLower);
      });
    }

    // 역할 필터링
    if (filterRole !== 'all') {
      filtered = filtered.filter(user => user.role === filterRole);
    }

    // 등급 필터링
    if (filterGrade !== 'all') {
      filtered = filtered.filter(user => user.grade === filterGrade);
    }

    // 정렬
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'nickname':
          return (a.nickname || '').localeCompare(b.nickname || '');
        case 'grade':
          return gradeOptions.indexOf(a.grade) - gradeOptions.indexOf(b.grade);
        case 'role':
          return roleOptions.indexOf(a.role) - roleOptions.indexOf(b.role);
        case 'createdAt':
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });

    setFilteredUsers(filtered);
  }, [users, searchTerm, sortBy, filterRole, filterGrade]);

  const fetchUsers = async () => {
    try {
      console.log('Firestore에서 사용자 목록 가져오기 시작...');
      const querySnapshot = await getDocs(collection(db, 'users'));
      console.log('사용자 문서 개수:', querySnapshot.size);
      
      const usersData: AdminUser[] = [];
      
      querySnapshot.forEach((doc) => {
        console.log('사용자 문서:', doc.id, doc.data());
        usersData.push({
          uid: doc.id,
          ...doc.data()
        } as AdminUser);
      });

      console.log('처리된 사용자 데이터:', usersData);
      setUsers(usersData);
      calculateStats(usersData);
      
      if (usersData.length === 0) {
        console.log('사용자 데이터가 없습니다. Firestore 규칙이나 컬렉션을 확인하세요.');
      }
    } catch (error) {
      console.error('사용자 목록 가져오기 에러:', error);
      alert(`사용자 목록을 불러오는 중 오류가 발생했습니다: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (usersData: AdminUser[]) => {
    const stats: ExtendedUserStats = {
      totalUsers: usersData.length,
      adminCount: usersData.filter(u => u.role === '운영진' || u.role === '리더').length,
      activeUsers: usersData.length, // 실제로는 활동 지표에 따라 계산
      recentJoins: usersData.filter(u => {
        const joinDate = new Date(u.createdAt?.seconds * 1000);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return joinDate > oneMonthAgo;
      }).length,
      averageGrade: calculateAverageGrade(usersData),
      gradeDistribution: {},
      roleDistribution: {}
    };

    usersData.forEach(user => {
      stats.gradeDistribution[user.grade] = (stats.gradeDistribution[user.grade] || 0) + 1;
      stats.roleDistribution[user.role] = (stats.roleDistribution[user.role] || 0) + 1;
    });

    setUserStats(stats);
  };

  const calculateAverageGrade = (usersData: AdminUser[]): string => {
    if (usersData.length === 0) return '🫐';  // 기본값을 블루베리로 변경
    
    // 평균 계산 대상 등급만 필터링
    const validGrades = usersData
      .map(user => getGradeDisplay(user.grade))
      .filter(grade => GRADE_ORDER.includes(grade));
    
    if (validGrades.length === 0) return '🫐';  // 유효한 등급이 없으면 블루베리 반환
    
    const gradeValues = validGrades.map(grade => GRADE_ORDER.indexOf(grade));
    const average = gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length;
    const roundedIndex = Math.round(average);
    
    return GRADE_ORDER[roundedIndex] || '🫐';
  };

  // 등급 표시 헬퍼 함수
  const getGradeDisplay = (grade: string) => {
    // 이미 이모지인 경우 그대로 반환
    if (gradeOptions.includes(grade)) return grade;
    // 텍스트인 경우 해당하는 이모지 찾기
    const emoji = Object.entries(gradeNames).find(([_, name]) => name === grade)?.[0];
    return emoji || '🍒'; // 기본값은 체리
  };

  // 등급 이름 가져오기 헬퍼 함수
  const getGradeName = (emoji: string) => {
    return gradeNames[emoji] || '체리';
  };

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case '리더':
        return (
          <span className="role-badge leader">
            <Crown size={16} />
            리더
          </span>
        );
      case '운영진':
        return (
          <span className="role-badge admin">
            <Shield size={16} />
            운영진
          </span>
        );
      case '부운영진':
        return (
          <span className="role-badge sub-admin">
            <Shield size={16} />
            부운영진
          </span>
        );
      default:
        return (
          <span className="role-badge member">
            <User size={16} />
            일반
          </span>
        );
    }
  };

  const handleUpdateUser = async (user: AdminUser) => {
    if (!editingUser) return;
    if (!editingUser.nickname || editingUser.nickname.trim() === '') {
      alert('닉네임은 비워둘 수 없습니다.');
      return;
    }

    try {
      // Firestore에서 사용자 정보 업데이트
      await updateDoc(doc(db, 'users', user.uid), {
        nickname: editingUser.nickname,
        email: editingUser.email,
        grade: editingUser.grade,
        role: editingUser.role,
        createdAt: editingUser.createdAt instanceof Date
          ? Timestamp.fromDate(editingUser.createdAt)
          : (editingUser.createdAt?.seconds
              ? editingUser.createdAt
              : Timestamp.now())
      });

      // 닉네임이 변경된 경우, 관련 게시글과 댓글 업데이트
      if (user.nickname !== editingUser.nickname) {
        await updateUserNicknameInPosts(user.nickname, editingUser.nickname);
      }

      // 로컬 상태 업데이트
      const updatedUsers = users.map(u => 
        u.uid === user.uid ? { ...u, ...editingUser } : u
      );
      setUsers(updatedUsers);
      calculateStats(updatedUsers);
      
      setEditingUser(null);
      alert('사용자 정보가 성공적으로 수정되었습니다.');
    } catch (error) {
      console.error('사용자 정보 수정 에러:', error);
      alert('사용자 정보 수정 중 오류가 발생했습니다.');
    }
  };

  const updateUserNicknameInPosts = async (oldNickname: string, newNickname: string) => {
    try {
      const batch = writeBatch(db);

      // 게시글 업데이트
      const postsQuery = query(collection(db, 'posts'), where('writerNickname', '==', oldNickname));
      const postsSnapshot = await getDocs(postsQuery);
      
      postsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      // 댓글 업데이트
      const commentsQuery = query(collection(db, 'comments'), where('writerNickname', '==', oldNickname));
      const commentsSnapshot = await getDocs(commentsQuery);
      
      commentsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      await batch.commit();
    } catch (error) {
      console.error('닉네임 일괄 업데이트 에러:', error);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (user.uid === currentUser?.uid) {
      alert('자신의 계정은 삭제할 수 없습니다.');
      return;
    }

    // "너래" 닉네임은 슈퍼관리자이므로 모든 권한을 가짐
    const isSuperAdmin = currentUser?.nickname === '너래';
    const isCurrentUserLeader = currentUser?.role === '리더';

    if (user.role === '리더' && !isSuperAdmin && !isCurrentUserLeader) {
      alert('리더 계정은 슈퍼관리자나 리더만 삭제할 수 있습니다.');
      return;
    }

    const confirmMessage = `정말로 "${user.nickname}" 사용자를 탈퇴시키시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 해당 사용자의 모든 데이터가 삭제됩니다.`;
    
    if (window.confirm(confirmMessage)) {
      try {
        // Firestore에서 사용자 문서 삭제
        await deleteDoc(doc(db, 'users', user.uid));

        // 로컬 상태 업데이트
        const updatedUsers = users.filter(u => u.uid !== user.uid);
        setUsers(updatedUsers);
        calculateStats(updatedUsers);

        alert('사용자가 성공적으로 탈퇴되었습니다.');
      } catch (error) {
        console.error('사용자 삭제 에러:', error);
        alert('사용자 탈퇴 중 오류가 발생했습니다.');
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('ko-KR');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case '리더': return <Crown size={16} className="role-icon leader" />;
      case '운영진': return <Shield size={16} className="role-icon admin" />;
      case '부운영진': return <Shield size={16} className="role-icon sub-admin" />;
      default: return <User size={16} className="role-icon member" />;
    }
  };

  const exportToExcel = () => {
    const headers = ['닉네임', '이메일', '등급', '역할', '가입일'];
    const data = filteredUsers.map(user => [
      user.nickname,
      user.email,
      user.grade,
      user.role,
      formatDate(user.createdAt)
    ]);

    const csvContent = [headers, ...data]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `사용자_목록_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.nickname) {
      alert('이메일과 닉네임은 필수입니다.');
      return;
    }

    try {
      // Firebase Authentication에 사용자 생성
      const auth = getAuth();
      const temporaryPassword = Math.random().toString(36).slice(-8); // 임시 비밀번호 생성
      const userCredential = await createUserWithEmailAndPassword(auth, newUser.email, temporaryPassword);
      
      // Firestore에 사용자 정보 저장
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userDocRef, {
        uid: userCredential.user.uid,
        email: newUser.email,
        nickname: newUser.nickname,
        grade: newUser.grade,
        role: newUser.role,
        createdAt: serverTimestamp()
      });

      // 로컬 상태 업데이트
      const addedUser = {
        uid: userCredential.user.uid,
        ...newUser,
        createdAt: new Date()
      };

      setUsers([addedUser, ...users]);
      calculateStats([addedUser, ...users]);
      
      setShowAddUserModal(false);
      setNewUser({
        email: '',
        nickname: '',
        grade: '🍒',
        role: '일반'
      });
      
      alert(`사용자가 성공적으로 추가되었습니다.\n임시 비밀번호: ${temporaryPassword}\n사용자에게 이 비밀번호를 안전하게 전달해주세요.`);
    } catch (error: any) {
      console.error('사용자 추가 오류:', error);
      if (error.code === 'auth/email-already-in-use') {
        alert('이미 사용 중인 이메일 주소입니다.');
      } else {
        alert('사용자 추가 중 오류가 발생했습니다.');
      }
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    const newPassword = window.prompt('새 비밀번호를 입력하세요. (8자 이상)', '');
    if (!newPassword || newPassword.length < 8) {
      alert('8자 이상의 새 비밀번호를 입력해야 합니다.');
      return;
    }
    try {
      const res = await fetch('/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        alert('비밀번호가 성공적으로 초기화되었습니다.');
      } else {
        alert('비밀번호 초기화 실패: ' + data.message);
      }
    } catch (error) {
      alert('비밀번호 초기화 중 오류가 발생했습니다.');
    }
  };

  // 예상등급(다음 등급) 구하는 함수
  const getNextGrade = (currentGrade: string) => {
    const idx = GRADE_ORDER.indexOf(currentGrade);
    if (idx === -1 || idx === GRADE_ORDER.length - 1) return '-';
    return GRADE_ORDER[idx + 1];
  };

  // 활동 기간 계산 (정확한 일수 기준)
  const calculateActivityDays = (createdAt: any): number => {
    if (!createdAt) return 0;
    const now = new Date();
    let joinDate: Date;
    if (createdAt.seconds) {
      joinDate = new Date(createdAt.seconds * 1000);
    } else if (createdAt instanceof Date) {
      joinDate = createdAt;
    } else if (typeof createdAt === 'string') {
      joinDate = new Date(createdAt);
    } else {
      return 0;
    }
    
    // 밀리초 단위의 차이를 일수로 변환
    const diffTime = Math.abs(now.getTime() - joinDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // 예상등급(가입일 기준) 구하는 함수
  const getExpectedGrade = (user: AdminUser): string => {
    const activityDays = calculateActivityDays(user.createdAt);
    // 3개월 = 약 90일, 6개월 = 약 180일, 12개월 = 약 365일
    const gradeIdx = Math.min(Math.floor(activityDays / 90), GRADE_ORDER.length - 1);
    const expectedGrade = GRADE_ORDER[gradeIdx];
    // 이미 현재 등급이 예상등급 이상이면 '-' 표시
    const currentIdx = GRADE_ORDER.indexOf(user.grade);
    if (currentIdx >= gradeIdx) return '-';
    return expectedGrade;
  };

  // 승급 가능 여부 확인 (정확히 90일 단위로만 승급)
  const canPromote = (user: AdminUser): boolean => {
    const activityDays = calculateActivityDays(user.createdAt);
    const currentGradeIndex = GRADE_ORDER.indexOf(user.grade);
    const maxGradeIndex = Math.min(
      Math.floor(activityDays / 90),
      GRADE_ORDER.length - 1
    );
    // 90일이 안 됐으면 승급 불가
    if (activityDays < 90) return false;
    return currentGradeIndex < maxGradeIndex;
  };

  // 승급 처리 함수
  const handleGradePromotion = async (user: AdminUser) => {
    const nextGrade = getNextGrade(user.grade);
    if (!window.confirm(`${user.nickname}님의 등급을 ${gradeNames[nextGrade]}로 승급하시겠습니까?`)) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        grade: nextGrade
      });
      
      // 사용자 목록 새로고침
      await fetchUsers();
      alert('등급이 성공적으로 변경되었습니다.');
    } catch (error) {
      console.error('등급 변경 중 오류:', error);
      alert('등급 변경 중 오류가 발생했습니다.');
    }
  };

  // 메시지 마이그레이션 처리 함수
  const handleMigration = async () => {
    if (!window.confirm('메시지 데이터를 새로운 구조로 마이그레이션하시겠습니까?\n\n이 작업은 시간이 걸릴 수 있으며, 작업 중에는 채팅 기능이 일시적으로 중단될 수 있습니다.')) {
      return;
    }

    setIsMigrating(true);
    setMigrationStatus('마이그레이션 시작...');

    try {
      const success = await migrateExistingMessages();
      if (success) {
        setMigrationStatus('마이그레이션 완료!');
        alert('메시지 마이그레이션이 성공적으로 완료되었습니다.');
      } else {
        setMigrationStatus('마이그레이션 실패');
        alert('마이그레이션 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
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

  if (loading) {
    return (
      <div className="admin-container">
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="orbital-loading">
                <div className="loading-sun">☀️</div>
                <div className="loading-planet loading-planet-1">🍎</div>
                <div className="loading-planet loading-planet-2">🍈</div>
                <div className="loading-planet loading-planet-3">🍉</div>
                <div className="loading-planet loading-planet-4">🥝</div>
                <div className="loading-planet loading-planet-5">🫐</div>
                <div className="loading-planet loading-planet-6">🍒</div>
              </div>
            </div>
            <h2>관리자 패널 로딩 중...</h2>
            <p>사용자 데이터를 불러오고 있습니다.</p>
          </div>
        )}

        {!loading && (
          <>
            {/* 통합 헤더 */}
            <div className="admin-header">
              <div className="header-left">
                <button className="back-button" onClick={() => navigate('/')}>
                  <ArrowLeft size={20} />
                  홈으로
                </button>
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
                    <button className="export-button" onClick={exportToExcel}>
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
            </div>

            {/* 마이그레이션 상태 표시 */}
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
                  {/* 통계 카드 */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon">
                        <Users size={24} />
                      </div>
                      <div className="stat-content">
                        <h3>총 회원 수</h3>
                        <div className="stat-number">{userStats.totalUsers}명</div>
                        <div className="stat-subtitle">최근 한달 가입: {userStats.recentJoins}명</div>
                      </div>
                    </div>
                    
                    <div className="stat-card">
                      <div className="stat-icon">
                        <Shield size={24} />
                      </div>
                      <div className="stat-content">
                        <h3>운영진 현황</h3>
                        <div className="stat-number">{userStats.adminCount}명</div>
                        <div className="stat-subtitle">전체 대비: {((userStats.adminCount / userStats.totalUsers) * 100).toFixed(1)}%</div>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">
                        <Crown size={24} />
                      </div>
                      <div className="stat-content">
                        <h3>평균 등급</h3>
                        <div className="stat-number">{userStats.averageGrade}</div>
                        <div className="stat-distribution">
                          {Object.entries(userStats.gradeDistribution).map(([grade, count]) => (
                            <span key={grade} className="distribution-item">
                              {grade} {count}명
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">
                        <User size={24} />
                      </div>
                      <div className="stat-content">
                        <h3>역할 분포</h3>
                        <div className="stat-distribution">
                          {Object.entries(userStats.roleDistribution).map(([role, count]) => (
                            <span key={role} className="distribution-item">
                              {role} {count}명
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 검색 및 필터링 */}
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
                        <button 
                          className="clear-search"
                          onClick={() => setSearchTerm('')}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    <div className="filter-controls">
                      <div className="filter-group">
                        <label>역할</label>
                        <select 
                          value={filterRole} 
                          onChange={(e) => setFilterRole(e.target.value)}
                          className="filter-select"
                        >
                          <option value="all">모든 역할</option>
                          {roleOptions.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>

                      <div className="filter-group">
                        <label>등급</label>
                        <select 
                          value={filterGrade} 
                          onChange={(e) => setFilterGrade(e.target.value)}
                          className="filter-select"
                        >
                          <option value="all">모든 등급</option>
                          {gradeOptions.map(grade => (
                            <option key={grade} value={grade}>{grade}</option>
                          ))}
                        </select>
                      </div>

                      <div className="filter-group">
                        <label>정렬</label>
                        <select 
                          value={sortBy} 
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="filter-select"
                        >
                          <option value="createdAt">가입일순</option>
                          <option value="nickname">닉네임순</option>
                          <option value="grade">등급순</option>
                          <option value="role">역할순</option>
                        </select>
                      </div>

                      <button 
                        className="reset-filters"
                        onClick={() => {
                          setFilterRole('all');
                          setFilterGrade('all');
                          setSortBy('createdAt');
                          setSearchTerm('');
                        }}
                      >
                        <Filter size={16} />
                        필터 초기화
                      </button>
                    </div>
                  </div>

                  {/* 사용자 목록 */}
                  <div className="users-list">
                    {filteredUsers.length === 0 ? (
                      <div className="empty-state">
                        <Users size={48} />
                        <h3>검색 결과가 없습니다</h3>
                        <p>다른 검색어를 입력하거나 필터를 조정해보세요.</p>
                      </div>
                    ) : (
                      <>
                        <div className="users-list-header">
                          <span className="user-count">총 {filteredUsers.length}명</span>
                        </div>
                        {filteredUsers.map((user) => (
                          <div key={user.uid} className="user-card">
                            {editingUser?.uid === user.uid ? (
                              // 편집 모드
                              <div className="edit-mode">
                                <div className="user-profile">
                                  <div className="profile-avatar">
                                    {user.profileImageUrl ? (
                                      <img src={user.profileImageUrl} alt="프로필" />
                                    ) : (
                                      <div className="avatar-placeholder">
                                        <User size={32} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="user-info">
                                    <input
                                      type="text"
                                      value={editingUser.nickname}
                                      onChange={(e) => setEditingUser({...editingUser, nickname: e.target.value})}
                                      className="edit-input nickname-input"
                                      placeholder="닉네임"
                                    />
                                    <input
                                      type="email"
                                      value={editingUser.email}
                                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                      className="edit-input email-input"
                                      placeholder="이메일 주소"
                                    />
                                  </div>
                                </div>

                                <div className="edit-controls">
                                  <div className="edit-controls-row">
                                    <select
                                      value={editingUser.grade}
                                      onChange={(e) => setEditingUser({...editingUser, grade: e.target.value})}
                                      className="edit-select"
                                    >
                                      {gradeOptions.map(grade => (
                                        <option key={grade} value={grade}>
                                          {grade} {getGradeName(grade)}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      value={editingUser.role}
                                      onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                                      className="edit-select"
                                      disabled={user.uid === currentUser?.uid || (user.role === '리더' && currentUser?.role !== '리더' && currentUser?.nickname !== '너래')}
                                    >
                                      {roleOptions.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  <div className="edit-controls-date">
                                    <label>가입일</label>
                                    <input
                                      type="date"
                                      className="edit-input"
                                      value={(() => {
                                        if (!editingUser.createdAt) return '';
                                        if (typeof editingUser.createdAt === 'string') return editingUser.createdAt.slice(0,10);
                                        if (editingUser.createdAt.seconds) {
                                          const d = new Date(editingUser.createdAt.seconds * 1000);
                                          return d.toISOString().slice(0,10);
                                        }
                                        if (editingUser.createdAt instanceof Date) return editingUser.createdAt.toISOString().slice(0,10);
                                        return '';
                                      })()}
                                      onChange={e => {
                                        const dateStr = e.target.value;
                                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                          const [year, month, day] = dateStr.split('-').map(Number);
                                          const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                                          setEditingUser({
                                            ...editingUser,
                                            createdAt: utcDate
                                          });
                                        }
                                      }}
                                    />
                                  </div>
                                </div>

                                <div className="edit-actions">
                                  <button 
                                    className="save-btn"
                                    onClick={() => handleUpdateUser(user)}
                                  >
                                    <CheckCircle size={16} />
                                    저장
                                  </button>
                                  <button 
                                    className="cancel-btn"
                                    onClick={() => setEditingUser(null)}
                                  >
                                    <X size={16} />
                                    취소
                                  </button>
                                  <button
                                    className="reset-password-btn"
                                    onClick={() => handleResetPassword(user)}
                                  >
                                    비밀번호 초기화
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="user-profile">
                                  <div className="profile-avatar">
                                    {user.profileImageUrl ? (
                                      <img src={user.profileImageUrl} alt="프로필" />
                                    ) : (
                                      <div className="avatar-placeholder">
                                        <User size={32} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="user-info">
                                    <div className="user-name">
                                      <span className="nickname-text">{user.nickname}</span>
                                      <span className="user-grade-primary">{getGradeDisplay(user.grade)}</span>
                                    </div>
                                    <div className="user-role-display">
                                      {getRoleDisplay(user.role)}
                                    </div>
                                    <div className="user-date">
                                      <Calendar size={14} />
                                      {formatDate(user.createdAt)} 가입
                                    </div>
                                  </div>
                                </div>

                                <div className="user-actions">
                                  <button 
                                    className="action-btn view-btn"
                                    onClick={() => setSelectedUser(user)}
                                    title="상세 정보 보기"
                                  >
                                    <Eye size={16} />
                                    <span>상세</span>
                                  </button>
                                  <button 
                                    className="action-btn edit-btn"
                                    onClick={() => setEditingUser({...user})}
                                    title="사용자 정보 수정"
                                  >
                                    <Edit3 size={16} />
                                    <span>수정</span>
                                  </button>
                                  <button 
                                    className="action-btn delete-btn"
                                    onClick={() => handleDeleteUser(user)}
                                    title="사용자 탈퇴"
                                  >
                                    <Trash2 size={16} />
                                    <span>탈퇴</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </>
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
                            <th>현재 등급</th>
                            <th>입장일</th>
                            <th>활동 기간</th>
                            <th>예상 등급</th>
                            <th>관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map(user => {
                            const activityDays = calculateActivityDays(user.createdAt);
                            const expectedGrade = getExpectedGrade(user);
                            const canPromoteUser = canPromote(user);
                            
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
                                    {user.nickname}
                                  </div>
                                </td>
                                <td>
                                  <span className="grade-badge">
                                    {user.grade} {gradeNames[user.grade]}
                                  </span>
                                </td>
                                <td>{formatDate(user.createdAt)}</td>
                                <td>{activityDays}일</td>
                                <td>
                                  <span className="grade-badge expected">
                                    {expectedGrade !== '-' ? `${expectedGrade} ${gradeNames[expectedGrade]}` : '-'}
                                  </span>
                                </td>
                                <td>
                                  {canPromoteUser && (
                                    <button
                                      className="promote-button"
                                      onClick={() => handleGradePromotion(user)}
                                    >
                                      승급
                                    </button>
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
            </div>

            {/* 사용자 상세 정보 모달 */}
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
                        <div className="detail-name-section">
                          <h3 className="detail-nickname">{selectedUser.nickname}</h3>
                          <span className="detail-grade">{getGradeDisplay(selectedUser.grade)}</span>
                        </div>
                        <div className="detail-badges">
                          {getRoleDisplay(selectedUser.role)}
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
                        onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                      >
                        {gradeOptions.map(grade => (
                          <option key={grade} value={grade}>
                            {grade} {gradeNames[grade]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>역할</label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      >
                        {roleOptions.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                    <div className="modal-actions">
                      <button onClick={handleAddUser} className="save-btn">
                        <CheckCircle size={16} />
                        추가
                      </button>
                      <button onClick={() => setShowAddUserModal(false)} className="cancel-btn">
                        <X size={16} />
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="admin-container">
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="orbital-loading">
              <div className="loading-sun">☀️</div>
              <div className="loading-planet loading-planet-1">🍎</div>
              <div className="loading-planet loading-planet-2">🍈</div>
              <div className="loading-planet loading-planet-3">🍉</div>
              <div className="loading-planet loading-planet-4">🥝</div>
              <div className="loading-planet loading-planet-5">🫐</div>
              <div className="loading-planet loading-planet-6">🍒</div>
            </div>
          </div>
          <h2>관리자 패널 로딩 중...</h2>
          <p>사용자 데이터를 불러오고 있습니다.</p>
        </div>
      )}

      {!loading && (
        <>
          {/* 통합 헤더 */}
          <div className="admin-header">
            <div className="header-left">
              <button className="back-button" onClick={() => navigate('/')}>
                <ArrowLeft size={20} />
                홈으로
              </button>
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
                  <button className="export-button" onClick={exportToExcel}>
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
          </div>

          {/* 마이그레이션 상태 표시 */}
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
                {/* 통계 카드 */}
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">
                      <Users size={24} />
                    </div>
                    <div className="stat-content">
                      <h3>총 회원 수</h3>
                      <div className="stat-number">{userStats.totalUsers}명</div>
                      <div className="stat-subtitle">최근 한달 가입: {userStats.recentJoins}명</div>
                    </div>
                  </div>
                  
                  <div className="stat-card">
                    <div className="stat-icon">
                      <Shield size={24} />
                    </div>
                    <div className="stat-content">
                      <h3>운영진 현황</h3>
                      <div className="stat-number">{userStats.adminCount}명</div>
                      <div className="stat-subtitle">전체 대비: {((userStats.adminCount / userStats.totalUsers) * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">
                      <Crown size={24} />
                    </div>
                    <div className="stat-content">
                      <h3>평균 등급</h3>
                      <div className="stat-number">{userStats.averageGrade}</div>
                      <div className="stat-distribution">
                        {Object.entries(userStats.gradeDistribution).map(([grade, count]) => (
                          <span key={grade} className="distribution-item">
                            {grade} {count}명
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">
                      <User size={24} />
                    </div>
                    <div className="stat-content">
                      <h3>역할 분포</h3>
                      <div className="stat-distribution">
                        {Object.entries(userStats.roleDistribution).map(([role, count]) => (
                          <span key={role} className="distribution-item">
                            {role} {count}명
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 검색 및 필터링 */}
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
                      <button 
                        className="clear-search"
                        onClick={() => setSearchTerm('')}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  <div className="filter-controls">
                    <div className="filter-group">
                      <label>역할</label>
                      <select 
                        value={filterRole} 
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="filter-select"
                      >
                        <option value="all">모든 역할</option>
                        {roleOptions.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>

                    <div className="filter-group">
                      <label>등급</label>
                      <select 
                        value={filterGrade} 
                        onChange={(e) => setFilterGrade(e.target.value)}
                        className="filter-select"
                      >
                        <option value="all">모든 등급</option>
                        {gradeOptions.map(grade => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                    </div>

                    <div className="filter-group">
                      <label>정렬</label>
                      <select 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="filter-select"
                      >
                        <option value="createdAt">가입일순</option>
                        <option value="nickname">닉네임순</option>
                        <option value="grade">등급순</option>
                        <option value="role">역할순</option>
                      </select>
                    </div>

                    <button 
                      className="reset-filters"
                      onClick={() => {
                        setFilterRole('all');
                        setFilterGrade('all');
                        setSortBy('createdAt');
                        setSearchTerm('');
                      }}
                    >
                      <Filter size={16} />
                      필터 초기화
                    </button>
                  </div>
                </div>

                {/* 사용자 목록 */}
                <div className="users-list">
                  {filteredUsers.length === 0 ? (
                    <div className="empty-state">
                      <Users size={48} />
                      <h3>검색 결과가 없습니다</h3>
                      <p>다른 검색어를 입력하거나 필터를 조정해보세요.</p>
                    </div>
                  ) : (
                    <>
                      <div className="users-list-header">
                        <span className="user-count">총 {filteredUsers.length}명</span>
                      </div>
                      {filteredUsers.map((user) => (
                        <div key={user.uid} className="user-card">
                          {editingUser?.uid === user.uid ? (
                            // 편집 모드
                            <div className="edit-mode">
                              <div className="user-profile">
                                <div className="profile-avatar">
                                  {user.profileImageUrl ? (
                                    <img src={user.profileImageUrl} alt="프로필" />
                                  ) : (
                                    <div className="avatar-placeholder">
                                      <User size={32} />
                                    </div>
                                  )}
                                </div>
                                <div className="user-info">
                                  <input
                                    type="text"
                                    value={editingUser.nickname}
                                    onChange={(e) => setEditingUser({...editingUser, nickname: e.target.value})}
                                    className="edit-input"
                                    placeholder="닉네임"
                                  />
                                  <input
                                    type="email"
                                    value={editingUser.email}
                                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                    className="edit-input"
                                    placeholder="이메일 주소"
                                  />
                                </div>
                              </div>

                              <div className="edit-controls">
                                <div className="edit-controls-row">
                                  <select
                                    value={editingUser.grade}
                                    onChange={(e) => setEditingUser({...editingUser, grade: e.target.value})}
                                    className="edit-select"
                                  >
                                    {gradeOptions.map(grade => (
                                      <option key={grade} value={grade}>
                                        {grade} {getGradeName(grade)}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={editingUser.role}
                                    onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                                    className="edit-select"
                                    disabled={user.uid === currentUser?.uid || (user.role === '리더' && currentUser?.role !== '리더' && currentUser?.nickname !== '너래')}
                                  >
                                    {roleOptions.map(role => (
                                      <option key={role} value={role}>{role}</option>
                                    ))}
                                  </select>
                                </div>
                                
                                <div className="edit-controls-date">
                                  <label>가입일</label>
                                  <input
                                    type="date"
                                    className="edit-input"
                                    value={(() => {
                                      if (!editingUser.createdAt) return '';
                                      if (typeof editingUser.createdAt === 'string') return editingUser.createdAt.slice(0,10);
                                      if (editingUser.createdAt.seconds) {
                                        const d = new Date(editingUser.createdAt.seconds * 1000);
                                        return d.toISOString().slice(0,10);
                                      }
                                      if (editingUser.createdAt instanceof Date) return editingUser.createdAt.toISOString().slice(0,10);
                                      return '';
                                    })()}
                                    onChange={e => {
                                      const dateStr = e.target.value;
                                      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                        const [year, month, day] = dateStr.split('-').map(Number);
                                        const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                                        setEditingUser({
                                          ...editingUser,
                                          createdAt: utcDate
                                        });
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="edit-actions">
                                <button 
                                  className="save-btn"
                                  onClick={() => handleUpdateUser(user)}
                                >
                                  <CheckCircle size={16} />
                                  저장
                                </button>
                                <button 
                                  className="cancel-btn"
                                  onClick={() => setEditingUser(null)}
                                >
                                  <X size={16} />
                                  취소
                                </button>
                                <button
                                  className="reset-password-btn"
                                  onClick={() => handleResetPassword(user)}
                                >
                                  비밀번호 초기화
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="user-profile">
                                <div className="profile-avatar">
                                  {user.profileImageUrl ? (
                                    <img src={user.profileImageUrl} alt="프로필" />
                                  ) : (
                                    <div className="avatar-placeholder">
                                      <User size={32} />
                                    </div>
                                  )}
                                </div>
                                <div className="user-info">
                                  <div className="user-name">
                                    <span className="nickname-text">{user.nickname}</span>
                                    <span className="user-grade-primary">{getGradeDisplay(user.grade)}</span>
                                  </div>
                                  <div className="user-role-display">
                                    {getRoleDisplay(user.role)}
                                  </div>
                                  <div className="user-date">
                                    <Calendar size={14} />
                                    {formatDate(user.createdAt)} 가입
                                  </div>
                                </div>
                              </div>

                              <div className="user-actions">
                                <button 
                                  className="action-btn view-btn"
                                  onClick={() => setSelectedUser(user)}
                                  title="상세 정보 보기"
                                >
                                  <Eye size={16} />
                                  <span>상세</span>
                                </button>
                                <button 
                                  className="action-btn edit-btn"
                                  onClick={() => setEditingUser({...user})}
                                  title="사용자 정보 수정"
                                >
                                  <Edit3 size={16} />
                                  <span>수정</span>
                                </button>
                                <button 
                                  className="action-btn delete-btn"
                                  onClick={() => handleDeleteUser(user)}
                                  title="사용자 탈퇴"
                                >
                                  <Trash2 size={16} />
                                  <span>탈퇴</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </>
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
                          <th>현재 등급</th>
                          <th>입장일</th>
                          <th>활동 기간</th>
                          <th>예상 등급</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(user => {
                          const activityDays = calculateActivityDays(user.createdAt);
                          const expectedGrade = getExpectedGrade(user);
                          const canPromoteUser = canPromote(user);
                          
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
                                  {user.nickname}
                                </div>
                              </td>
                              <td>
                                <span className="grade-badge">
                                  {user.grade} {gradeNames[user.grade]}
                                </span>
                              </td>
                              <td>{formatDate(user.createdAt)}</td>
                              <td>{activityDays}일</td>
                              <td>
                                <span className="grade-badge expected">
                                  {expectedGrade !== '-' ? `${expectedGrade} ${gradeNames[expectedGrade]}` : '-'}
                                </span>
                              </td>
                              <td>
                                {canPromoteUser && (
                                  <button
                                    className="promote-button"
                                    onClick={() => handleGradePromotion(user)}
                                  >
                                    승급
                                  </button>
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
          </div>

          {/* 사용자 상세 정보 모달 */}
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
                        <span className="user-grade">{getGradeDisplay(selectedUser.grade)}</span>
                        {getRoleDisplay(selectedUser.role)}
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
                      onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                    >
                      {gradeOptions.map(grade => (
                        <option key={grade} value={grade}>
                          {grade} {gradeNames[grade]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>역할</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    >
                      {roleOptions.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-actions">
                    <button onClick={handleAddUser} className="save-btn">
                      <CheckCircle size={16} />
                      추가
                    </button>
                    <button onClick={() => setShowAddUserModal(false)} className="cancel-btn">
                      <X size={16} />
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminUserPanel; 