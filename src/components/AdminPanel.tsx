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
  User
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
  filterUsers
} from './AdminUtils';
import { 
  LoadingSpinner, 
  StatCard, 
  UserCard, 
  EmptyState,
  RoleDisplay,
  RoleIcon
} from './AdminComponents';
import { 
  checkAdminAccess, 
  GRADE_SYSTEM, 
  ROLE_SYSTEM, 
  GRADE_ORDER, 
  GRADE_NAMES, 
  ROLE_OPTIONS,
  type AdminUser,
  type TabType,
  type SortBy
} from './AdminTypes';
import './AdminUserPanel.css';

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
      role: filterRole !== 'all' ? filterRole : undefined
    });

    // 정렬 적용
    filtered = sortUsers(filtered, sortBy, sortOrder);

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterRole, filterGrade, sortBy, sortOrder]);

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

  if (loading) {
    return (
      <div className="admin-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="admin-container">
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
            {/* 통계 카드 */}
            <div className="stats-grid">
              <StatCard
                icon={<Users size={24} />}
                title="총 회원 수"
                value={`${userStats.totalUsers}명`}
                subtitle={`최근 한달 가입: ${userStats.recentJoins}명`}
              />
              
              <StatCard
                icon={<Shield size={24} />}
                title="운영진 현황"
                value={`${userStats.adminCount}명`}
                subtitle={`전체 대비: ${userStats.totalUsers > 0 ? ((userStats.adminCount / userStats.totalUsers) * 100).toFixed(1) : 0}%`}
              />

              <StatCard
                icon={<Crown size={24} />}
                title="평균 등급"
                value={userStats.averageGrade}
                extra={
                  <div className="stat-distribution">
                    {Object.entries(userStats.gradeDistribution).map(([grade, count]) => (
                      <span key={grade} className="distribution-item">
                        {grade} {count}명
                      </span>
                    ))}
                  </div>
                }
              />

              <StatCard
                icon={<Activity size={24} />}
                title="활성 사용자"
                value={`${userStats.activeUsers}명`}
                subtitle="전체 회원"
              />
            </div>

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

            {/* 사용자 목록 */}
            <div className="users-list">
              <div className="users-list-header">
                <h3>사용자 목록</h3>
                <span className="user-count">
                  {filteredUsers.length}명 / 총 {users.length}명
                </span>
              </div>
              
              {filteredUsers.length === 0 ? (
                <EmptyState message="검색 조건에 맞는 사용자가 없습니다." />
              ) : (
                <div className="users-grid">
                  {filteredUsers.map(user => (
                    <UserCard
                      key={user.uid}
                      user={user}
                      isEditing={editingUser?.uid === user.uid}
                      onEdit={() => setEditingUser(user)}
                      onSave={() => handleUpdateUser(user)}
                      onCancel={() => setEditingUser(null)}
                      onDelete={() => handleDeleteUser(user)}
                      onView={() => setSelectedUser(user)}
                      editingUser={editingUser || undefined}
                      onEditChange={(field, value) => {
                        if (editingUser) {
                          setEditingUser({ ...editingUser, [field]: value });
                        }
                      }}
                    />
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
    </div>
  );
};

export default AdminPanel; 