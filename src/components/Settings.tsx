import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, deleteUser as firebaseDeleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  ArrowLeft, 
  Bell, 
  BellOff, 
  Edit, 
  Trash2, 
  LogOut, 
  User, 
  Save,
  Settings as SettingsIcon
} from 'lucide-react';
import './Settings.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  notificationsEnabled?: boolean;
  isLoggedIn: boolean;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [newNickname, setNewNickname] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    // 사용자 정보 불러오기
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      const userData = JSON.parse(userString);
      setUser(userData);
      setNewNickname(userData.nickname || '');
      setNotifications(userData.notificationsEnabled ?? true);
    } else {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    setLoading(false);
  }, [navigate]);

  const handleNotificationToggle = async () => {
    if (!user) return;

    const newNotifications = !notifications;
    setNotifications(newNotifications);

    try {
      // Firestore에 알림 설정 저장
      await updateDoc(doc(db, 'users', user.uid), {
        notificationsEnabled: newNotifications
      });

      // localStorage도 업데이트
      const updatedUser = { ...user, notificationsEnabled: newNotifications };
      localStorage.setItem('veryus_user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      alert(`알림이 ${newNotifications ? '활성화' : '비활성화'}되었습니다.`);
    } catch (error) {
      console.error('알림 설정 업데이트 에러:', error);
      alert('알림 설정 업데이트 중 오류가 발생했습니다.');
      setNotifications(!newNotifications); // 원래 상태로 되돌리기
    }
  };

  const handleNicknameChange = async () => {
    if (!user || !newNickname.trim()) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    if (newNickname === user.nickname) {
      setEditingNickname(false);
      return;
    }

    try {
      const oldNickname = user.nickname || '';

      // Firestore users 컬렉션 업데이트
      await updateDoc(doc(db, 'users', user.uid), {
        nickname: newNickname.trim()
      });

      // 다른 컬렉션의 nickname도 일괄 업데이트
      if (oldNickname) {
        await updateNicknameInCollections(oldNickname, newNickname.trim());
      }

      // localStorage 업데이트
      const updatedUser = { ...user, nickname: newNickname.trim() };
      localStorage.setItem('veryus_user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      setEditingNickname(false);
      alert('닉네임이 성공적으로 변경되었습니다.');
    } catch (error) {
      console.error('닉네임 변경 에러:', error);
      alert('닉네임 변경 중 오류가 발생했습니다.');
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

      alert('계정이 성공적으로 삭제되었습니다.');
      navigate('/login');
    } catch (error) {
      console.error('계정 삭제 에러:', error);
      alert('계정 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      alert('로그아웃되었습니다.');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      alert('이메일 정보가 없습니다.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      alert('비밀번호 재설정 메일이 발송되었습니다. 이메일을 확인해주세요.');
    } catch (error) {
      alert('비밀번호 재설정 메일 발송 중 오류가 발생했습니다.');
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
      {/* 헤더 */}
      <div className="settings-header glassmorphism">
        <button className="back-button glassmorphism" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          뒤로가기
        </button>
        <h1 className="settings-title">
          <SettingsIcon size={28} />
          설정
        </h1>
      </div>

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
            <div className="user-grade">{user.grade}</div>
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="settings-card">
        <div className="card-header">
          {notifications ? <Bell className="card-icon" /> : <BellOff className="card-icon" />}
          <h3>알림 설정</h3>
        </div>
        <div className="setting-item">
          <span>알림 받기</span>
          <button 
            className={`toggle-switch ${notifications ? 'active' : ''}`}
            onClick={handleNotificationToggle}
          >
            <div className="toggle-slider"></div>
          </button>
        </div>
      </div>

      {/* 닉네임 변경 */}
      <div className="settings-card">
        <div className="card-header">
          <Edit className="card-icon" />
          <h3>닉네임 변경</h3>
        </div>
        <div className="setting-item">
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
              <button 
                onClick={() => setEditingNickname(true)} 
                className="edit-btn"
              >
                변경
              </button>
            </div>
          )}
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