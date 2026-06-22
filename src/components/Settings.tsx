import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { signOut, deleteUser as firebaseDeleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { 
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { useUserProfile } from '../contexts/UserProfileContext';
import { GRADE_NAMES, GRADE_SYSTEM } from './AdminTypes';
import { 
  Edit, 
  Trash2, 
  LogOut, 
  User, 
  Save,
  ArrowLeft,
  Palette
} from 'lucide-react';
import AppThemePicker from './AppThemePicker';
import AppUiStylePicker from './AppUiStylePicker';
import BottomNavThemePicker from './BottomNavThemePicker';
import { APP_UI_STYLE_CHANGE_EVENT, getSavedAppUiStyle } from '../utils/appUiStyle';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  intro?: string;
  role?: string;
  grade?: string;
  pendingGrade?: string;
  pendingGradeRequestedAt?: unknown;
  pendingCreatedAt?: any;
  pendingCreatedAtRequestedAt?: unknown;
  profileImageUrl?: string;
  createdAt?: any;
  notificationsEnabled?: boolean;
  isLoggedIn: boolean;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const [uiStyle, setUiStyle] = useState(getSavedAppUiStyle);
  const [user, setUser] = useState<User | null>(null);
  const [newNickname, setNewNickname] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [newIntro, setNewIntro] = useState('');
  const [newGrade, setNewGrade] = useState<string>(GRADE_SYSTEM.CHERRY);
  const [newJoinDate, setNewJoinDate] = useState('');
  const [savingProfileMeta, setSavingProfileMeta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const toLocalDateInputValue = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    const applyUserState = (userData: User) => {
      setUser(userData);
      setNewNickname(userData.nickname || '');
      setNewIntro(userData.intro || '');
      setNewGrade(userData.pendingGrade || userData.grade || GRADE_SYSTEM.CHERRY);

      const createdAt = userData.createdAt;
      const date = createdAt?.seconds
        ? new Date(createdAt.seconds * 1000)
        : createdAt
          ? new Date(createdAt)
          : null;
      setNewJoinDate(date ? toLocalDateInputValue(date) : '');
    };

    const loadLatestUser = async () => {
      const localUserString = localStorage.getItem('veryus_user');
      const localUser = localUserString ? (JSON.parse(localUserString) as User) : null;
      const uid = profile?.uid || localUser?.uid;

      if (!uid) {
        toast.error('로그인이 필요합니다.');
        navigate('/login');
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          const dbUser = userSnap.data() as Partial<User>;
          const mergedUser: User = {
            uid,
            email: (dbUser.email as string) || profile?.email || localUser?.email || '',
            nickname: (dbUser.nickname as string) || profile?.nickname || localUser?.nickname || '',
            intro: (dbUser.intro as string) || '',
            role: (dbUser.role as string) || profile?.role || localUser?.role,
            grade: (dbUser.grade as string) || GRADE_SYSTEM.CHERRY,
            pendingGrade: dbUser.pendingGrade as string | undefined,
            pendingGradeRequestedAt: dbUser.pendingGradeRequestedAt,
            pendingCreatedAt: dbUser.pendingCreatedAt,
            pendingCreatedAtRequestedAt: dbUser.pendingCreatedAtRequestedAt,
            profileImageUrl: (dbUser.profileImageUrl as string) || profile?.profileImageUrl || localUser?.profileImageUrl,
            notificationsEnabled:
              typeof dbUser.notificationsEnabled === 'boolean'
                ? dbUser.notificationsEnabled
                : localUser?.notificationsEnabled,
            createdAt: dbUser.createdAt,
            isLoggedIn: true
          };

          applyUserState(mergedUser);
          localStorage.setItem('veryus_user', JSON.stringify(mergedUser));
        } else if (localUser) {
          applyUserState(localUser);
        } else {
          toast.error('사용자 정보를 찾을 수 없습니다.');
          navigate('/login');
          return;
        }
      } catch (error) {
        console.error('사용자 정보 로딩 에러:', error);
        if (localUser) {
          applyUserState(localUser);
        } else {
          toast.error('사용자 정보를 불러올 수 없습니다.');
          navigate('/login');
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    void loadLatestUser();
  }, [navigate, profile]);

  useEffect(() => {
    const syncUiStyle = () => setUiStyle(getSavedAppUiStyle());
    window.addEventListener(APP_UI_STYLE_CHANGE_EVENT, syncUiStyle);
    return () => window.removeEventListener(APP_UI_STYLE_CHANGE_EVENT, syncUiStyle);
  }, []);

  const handleNicknameChange = async () => {
    if (!user || !newNickname.trim()) {
      toast.warning('닉네임을 입력해주세요.');
      return;
    }

    const trimmed = newNickname.trim();
    if (trimmed === user.nickname) {
      setEditingNickname(false);
      return;
    }

    if (trimmed.length < 2 || trimmed.length > 20) {
      toast.warning('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }

    try {
      const nickQuery = query(collection(db, 'users'), where('nickname', '==', trimmed));
      const nickSnap = await getDocs(nickQuery);
      if (!nickSnap.empty) {
        toast.error('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.');
        return;
      }

      const oldNickname = user.nickname || '';

      await updateDoc(doc(db, 'users', user.uid), {
        nickname: trimmed
      });

      if (oldNickname) {
        await updateNicknameInCollections(oldNickname, trimmed);
      }

      const updatedUser = { ...user, nickname: trimmed };
      localStorage.setItem('veryus_user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      setEditingNickname(false);
      toast.success('닉네임이 변경되었습니다.');
    } catch (error) {
      console.error('닉네임 변경 에러:', error);
      toast.error('닉네임 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleProfileMetaSave = async () => {
    if (!user) return;
    if (!newJoinDate) {
      toast.warning('가입일을 입력해주세요.');
      return;
    }

    try {
      setSavingProfileMeta(true);
      const joinDate = new Date(`${newJoinDate}T00:00:00`);
      const currentJoinDate = user.createdAt?.seconds
        ? new Date(user.createdAt.seconds * 1000)
        : user.createdAt
          ? new Date(user.createdAt)
          : null;
      const currentJoinDateKey = currentJoinDate
        ? toLocalDateInputValue(currentJoinDate)
        : '';
      const requestedJoinDateKey = toLocalDateInputValue(joinDate);
      const joinDateChanged = currentJoinDateKey !== requestedJoinDateKey;
      const chosenGrade = newGrade || GRADE_SYSTEM.CHERRY;
      const samePendingRequest =
        chosenGrade !== user.grade && user.pendingGrade === chosenGrade;

      const updates: {
        intro: string;
        pendingCreatedAt?: Date | ReturnType<typeof deleteField>;
        pendingCreatedAtRequestedAt?: ReturnType<typeof serverTimestamp> | ReturnType<typeof deleteField>;
        pendingGrade?: string | ReturnType<typeof deleteField>;
        pendingGradeRequestedAt?: ReturnType<typeof serverTimestamp> | ReturnType<typeof deleteField>;
      } = {
        intro: newIntro.trim()
      };

      let toastExtra = '';

      if (chosenGrade === user.grade) {
        if (user.pendingGrade) {
          updates.pendingGrade = deleteField();
          updates.pendingGradeRequestedAt = deleteField();
          toastExtra = ' 등급 승인 요청을 취소했습니다.';
        }
      } else if (!samePendingRequest) {
        updates.pendingGrade = chosenGrade;
        updates.pendingGradeRequestedAt = serverTimestamp();
      }

      if (!joinDateChanged) {
        if (user.pendingCreatedAt) {
          updates.pendingCreatedAt = deleteField();
          updates.pendingCreatedAtRequestedAt = deleteField();
          toastExtra += ' 가입일 수정 요청을 취소했습니다.';
        }
      } else {
        updates.pendingCreatedAt = joinDate;
        updates.pendingCreatedAtRequestedAt = serverTimestamp();
        toastExtra += ' 가입일 변경 요청이 접수되었습니다.';
      }

      await updateDoc(doc(db, 'users', user.uid), updates);

      if (chosenGrade !== user.grade && !samePendingRequest) {
        await NotificationService.notifyStaffOfPendingGradeRequest({
          requesterUid: user.uid,
          requesterNickname: user.nickname || '회원',
          requestedGrade: chosenGrade
        });
        toastExtra = ' 등급 변경 요청이 접수되었습니다. 운영진 승인 후 반영됩니다.';
      }

      const updatedUser: User = {
        ...user,
        intro: newIntro.trim()
      };

      if (chosenGrade === user.grade) {
        delete updatedUser.pendingGrade;
        delete updatedUser.pendingGradeRequestedAt;
      } else {
        updatedUser.pendingGrade = chosenGrade;
        if (!samePendingRequest) {
          updatedUser.pendingGradeRequestedAt = new Date();
        }
      }

      if (!joinDateChanged) {
        delete updatedUser.pendingCreatedAt;
        delete updatedUser.pendingCreatedAtRequestedAt;
      } else {
        updatedUser.pendingCreatedAt = { seconds: Math.floor(joinDate.getTime() / 1000) };
        updatedUser.pendingCreatedAtRequestedAt = new Date();
      }

      setUser(updatedUser);
      localStorage.setItem('veryus_user', JSON.stringify(updatedUser));
      toast.success(`프로필 정보가 저장되었습니다.${toastExtra}`);
    } catch (error) {
      console.error('프로필 정보 저장 에러:', error);
      toast.error('프로필 정보 저장에 실패했습니다.');
    } finally {
      setSavingProfileMeta(false);
    }
  };

  const updateNicknameInCollections = async (oldNickname: string, newNickname: string) => {
    const batch = writeBatch(db);

    try {
      // posts 컬렉션 업데이트
      const postsQuery = query(collection(db, 'posts'), where('writerNickname', '==', oldNickname));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      // comments 컬렉션 업데이트
      const commentsQuery = query(collection(db, 'comments'), where('writerNickname', '==', oldNickname));
      const commentsSnapshot = await getDocs(commentsQuery);
      commentsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      // messages 컬렉션 업데이트
      const messagesQuery = query(collection(db, 'messages'), where('senderNickname', '==', oldNickname));
      const messagesSnapshot = await getDocs(messagesQuery);
      messagesSnapshot.forEach((doc) => {
        batch.update(doc.ref, { senderNickname: newNickname });
      });

      await batch.commit();
    } catch (error) {
      console.error('컬렉션 닉네임 업데이트 에러:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !deleteConfirm) return;

    const finalConfirm = window.confirm(
      '정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
    );

    if (!finalConfirm) {
      setDeleteConfirm(false);
      return;
    }

    try {
      // Firestore에서 사용자 문서 삭제
      await deleteDoc(doc(db, 'users', user.uid));

      // Firebase Auth에서 사용자 삭제
      if (auth.currentUser) {
        await firebaseDeleteUser(auth.currentUser);
      }

      // localStorage 클리어
      localStorage.removeItem('veryus_user');

      toast.success('계정이 삭제되었습니다.');
      navigate('/login');
    } catch (error) {
      console.error('계정 삭제 에러:', error);
      toast.error('계정 삭제에 실패했습니다. 다시 로그인한 뒤 시도하거나 관리자에게 문의해 주세요.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      toast.info('로그아웃되었습니다.');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
      toast.error('로그아웃에 실패했습니다.');
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      toast.warning('이메일 정보가 없습니다. 가입 시 사용한 이메일이 프로필에 없을 수 있습니다.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success('비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함)을 확인해 주세요.');
    } catch (error) {
      toast.error('재설정 메일 발송에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="loading">설정을 불러오는 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="settings-container">
        <div className="error">사용자 정보를 불러올 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <button type="button" className="back-button" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        <ArrowLeft size={18} />
        뒤로가기
      </button>
      {/* 사용자 프로필 섹션 */}
      <div className="settings-card">
        <div className="card-header">
          <User className="card-icon" />
          <h3>프로필 정보</h3>
        </div>
        <div className="profile-info">
          <div className="profile-avatar">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="프로필" />
            ) : (
              user.nickname?.charAt(0) || '?'
            )}
          </div>
          <div className="profile-details">
            <div className="user-name">{user.nickname}</div>
            <div className="user-email">{user.email}</div>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-header">
          <Edit className="card-icon" />
          <h3>닉네임 / 소개 / 등급 / 가입일</h3>
        </div>
        <div className="setting-item settings-form-grid">
          <label className="settings-field-label">닉네임</label>
          {editingNickname ? (
            <div className="nickname-edit">
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="새 닉네임 입력"
                className="nickname-input"
              />
              <div className="edit-buttons">
                <button onClick={handleNicknameChange} className="save-btn">
                  <Save size={16} />
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditingNickname(false);
                    setNewNickname(user.nickname || '');
                  }}
                  className="cancel-btn"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="nickname-display">
              <span>현재 닉네임: {user.nickname}</span>
              <button onClick={() => setEditingNickname(true)} className="edit-btn">
                변경
              </button>
            </div>
          )}

          <div className="nickname-edit">
            <label className="settings-field-label">한 줄 소개</label>
            <textarea
              value={newIntro}
              onChange={(e) => setNewIntro(e.target.value)}
              rows={3}
              className="nickname-input"
              style={{ resize: 'vertical', minHeight: 84 }}
              placeholder="한 줄 소개를 입력하세요."
            />

            <label className="settings-field-label">등급</label>
            <p className="settings-field-hint">
              변경 후 저장하면 <strong>운영진 승인</strong>을 거쳐 반영됩니다. 현재 표시 등급은{' '}
              <strong>
                {user.grade} {GRADE_NAMES[user.grade || ''] || ''}
              </strong>
              입니다.
            </p>
            {user.pendingGrade && user.pendingGrade !== user.grade && (
              <div className="settings-pending-notice">
                승인 대기 중: {user.pendingGrade} {GRADE_NAMES[user.pendingGrade] || ''}
              </div>
            )}
            <select
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
              className="nickname-input"
            >
              {Object.values(GRADE_SYSTEM).map((grade) => (
                <option key={grade} value={grade}>
                  {grade} {GRADE_NAMES[grade] || grade}
                </option>
              ))}
            </select>
            <p className="settings-field-hint settings-field-hint--small">
              승인 대기를 취소하려면 현재 반영 등급과 동일한 항목을 선택한 뒤 저장하세요.
            </p>

            <label className="settings-field-label">가입일</label>
            <p className="settings-field-hint">
              가입일 변경은 <strong>운영진 승인</strong> 후 반영됩니다.
            </p>
            {user.pendingCreatedAt && (
              <div className="settings-pending-notice settings-pending-notice--date">
                가입일 변경 승인 대기: {user.pendingCreatedAt?.seconds
                  ? new Date(user.pendingCreatedAt.seconds * 1000).toLocaleDateString('ko-KR')
                  : ''}
              </div>
            )}
            <input
              type="date"
              value={newJoinDate}
              onChange={(e) => setNewJoinDate(e.target.value)}
              className="nickname-input"
            />
          </div>

          <button
            onClick={handleProfileMetaSave}
            className="save-btn"
            disabled={savingProfileMeta}
          >
            <Save size={16} />
            {savingProfileMeta ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 화면 디자인 */}
      <div className="settings-card">
        <div className="card-header">
          <Palette className="card-icon" />
          <h3>화면 디자인</h3>
        </div>
        <div className="setting-item">
          <AppUiStylePicker />
        </div>
      </div>

      {/* 앱 테마 색상 */}
      <div className="settings-card">
        <div className="card-header">
          <Palette className="card-icon" />
          <h3>{uiStyle === 'classic' ? '앱 테마 색상' : '앱 강조 색상'}</h3>
        </div>
        <div className="setting-item">
          <AppThemePicker />
        </div>
      </div>

      {/* 하단 네비게이션 색상 */}
      <div className="settings-card">
        <div className="card-header">
          <Palette className="card-icon" />
          <h3>하단 네비게이션 색상</h3>
        </div>
        <div className="setting-item">
          <BottomNavThemePicker />
        </div>
      </div>

      {/* 비밀번호 재설정 */}
      <div className="settings-card">
        <div className="card-header">
          <Edit className="card-icon" />
          <h3>비밀번호 재설정</h3>
        </div>
        <div className="setting-item">
          <span>비밀번호를 잊으셨나요?</span>
          <button onClick={handlePasswordReset} className="save-btn">비밀번호 재설정 메일 발송</button>
        </div>
      </div>

      {/* 계정 관리 */}
      <div className="settings-card danger-zone">
        <div className="card-header">
          <Trash2 className="card-icon" />
          <h3>계정 관리</h3>
        </div>
        <div className="setting-item">
          <div className="danger-actions">
            <button onClick={handleLogout} className="logout-btn">
              <LogOut size={16} />
              로그아웃
            </button>
            
            {deleteConfirm ? (
              <div className="delete-confirm">
                <p>정말로 계정을 삭제하시겠습니까?</p>
                <div className="confirm-buttons">
                  <button onClick={handleDeleteAccount} className="delete-confirm-btn">
                    예, 삭제합니다
                  </button>
                  <button 
                    onClick={() => setDeleteConfirm(false)} 
                    className="cancel-btn"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setDeleteConfirm(true)} 
                className="delete-btn"
              >
                <Trash2 size={16} />
                계정 영구 삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 