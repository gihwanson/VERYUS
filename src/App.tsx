import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
// @ts-ignore
import { auth, db } from './firebase';
// @ts-ignore
import Login from './components/Login';
// @ts-ignore
import Home from './components/Home';
// @ts-ignore
import Signup from './components/Signup';
// @ts-ignore
import ForgotPassword from './components/ForgotPassword';
// @ts-ignore
import FreePostList from './components/FreePostList';
// @ts-ignore
import FreePostWrite from './components/FreePostWrite';
// @ts-ignore
import FreePostDetail from './components/FreePostDetail';
// @ts-ignore
import AdminUserPanel from './components/AdminUserPanel';
// @ts-ignore
import MyPage from './components/MyPage';
// @ts-ignore
import Settings from './components/Settings';
// @ts-ignore
import RecordingPostList from './components/RecordingPostList';
// @ts-ignore
import RecordingPostWrite from './components/RecordingPostWrite';
// @ts-ignore
import RecordingPostDetail from './components/RecordingPostDetail';
// @ts-ignore
import RecordingPostEdit from './components/RecordingPostEdit';
// @ts-ignore
import Messages from './components/Messages';
// @ts-ignore
import Notifications from './components/Notifications';
// @ts-ignore
import ContestList from './components/ContestList';
// @ts-ignore
import ContestCreate from './components/ContestCreate';
// @ts-ignore
import ContestDetail from './components/ContestDetail';
// @ts-ignore
import ContestParticipate from './components/ContestParticipate';
// @ts-ignore
import ContestResults from './components/ContestResults';
// @ts-ignore
import ApprovedSongs from './components/ApprovedSongs';
// @ts-ignore
import PartnerPostList from './components/PartnerPostList';
// @ts-ignore
import PartnerPostWrite from './components/PartnerPostWrite';
// @ts-ignore
import PartnerPostDetail from './components/PartnerPostDetail';
import './App.css';

// 관리자 권한 체크 함수
const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
};

// 관리자 전용 라우트 컴포넌트
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!checkAdminAccess(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// 보호된 라우트 컴포넌트
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
        fontFamily: 'Pretendard, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(138, 85, 204, 0.1)',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#8A55CC', margin: '0 0 16px 0' }}>VERYUS CAFE</h2>
          <p style={{ color: '#6B7280', margin: 0 }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Firebase Auth 상태 변화 감지
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // localStorage에 로그인 상태 저장/제거
      if (currentUser) {
        try {
          // Firestore에서 사용자 추가 정보 가져오기
          const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
          const userData = userDoc.docs[0]?.data();
          
          localStorage.setItem('veryus_user', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            nickname: userData?.nickname || '',
            role: userData?.role || '일반',
            grade: userData?.grade || '🍒체리',
            isLoggedIn: true
          }));
        } catch (error) {
          console.error('사용자 정보 가져오기 실패:', error);
          localStorage.setItem('veryus_user', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            isLoggedIn: true
          }));
        }
      } else {
        localStorage.removeItem('veryus_user');
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 로딩 중일 때 표시할 화면
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
        fontFamily: 'Pretendard, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(138, 85, 204, 0.1)',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#8A55CC', margin: '0 0 16px 0' }}>VERYUS CAFE</h2>
          <p style={{ color: '#6B7280', margin: 0 }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* 로그인 페이지 - 이미 로그인되어 있으면 메인으로 */}
          <Route 
            path="/login" 
            element={user ? <Navigate to="/" replace /> : <Login />} 
          />
          
          {/* 회원가입 페이지 - 이미 로그인되어 있으면 메인으로 */}
          <Route 
            path="/signup" 
            element={user ? <Navigate to="/" replace /> : <Signup />} 
          />
          
          {/* 보호된 라우트들 - 로그인 필요 */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } 
          />
          
          {/* 자유게시판 라우트들 */}
          <Route 
            path="/free" 
            element={<FreePostList />}
          />
          
          <Route 
            path="/free/write" 
            element={
              <ProtectedRoute>
                <FreePostWrite />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/free/:id" 
            element={<FreePostDetail />}
          />
          
          <Route 
            path="/free/edit/:id" 
            element={
              <ProtectedRoute>
                <FreePostWrite />
              </ProtectedRoute>
            }
          />
          
          {/* 관리자 패널 - 리더/운영진만 접근 가능 */}
          <Route 
            path="/admin-user" 
            element={
              <AdminRoute>
                <AdminUserPanel />
              </AdminRoute>
            } 
          />
          
          {/* 마이페이지 - 로그인한 사용자만 접근 가능 */}
          <Route 
            path="/mypage" 
            element={
              <ProtectedRoute>
                <MyPage />
              </ProtectedRoute>
            } 
          />
          
          {/* 설정 페이지 - 로그인한 사용자만 접근 가능 */}
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } 
          />
          
          {/* 추후 추가할 보호된 라우트들 */}
          <Route 
            path="/menu" 
            element={
              <ProtectedRoute>
                <div style={{ padding: '20px', textAlign: 'center' }}>메뉴 페이지 (추후 구현)</div>
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/stores" 
            element={
              <ProtectedRoute>
                <div style={{ padding: '20px', textAlign: 'center' }}>매장 찾기 페이지 (추후 구현)</div>
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/events" 
            element={
              <ProtectedRoute>
                <div style={{ padding: '20px', textAlign: 'center' }}>이벤트 페이지 (추후 구현)</div>
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/reviews" 
            element={
              <ProtectedRoute>
                <div style={{ padding: '20px', textAlign: 'center' }}>리뷰 페이지 (추후 구현)</div>
              </ProtectedRoute>
            } 
          />
          
          {/* 비밀번호 찾기는 로그인이 필요 없음 */}
          <Route 
            path="/forgot-password" 
            element={
              user ? <Navigate to="/" replace /> : <ForgotPassword />
            } 
          />
          
          {/* 녹음게시판 라우트들 */}
          <Route path="/recording" element={<RecordingPostList />} />
          <Route path="/recording/write" element={<RecordingPostWrite />} />
          <Route path="/recording/:id" element={<RecordingPostDetail />} />
          <Route path="/recording/edit/:id" element={<RecordingPostEdit />} />
          
          {/* 쪽지함 라우트 */}
          <Route 
            path="/messages" 
            element={
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            }
          />
          
          {/* 알림 라우트 */}
          <Route 
            path="/notifications" 
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />
          
          {/* 대회 라우트들 */}
          <Route path="/contests" element={<ProtectedRoute><ContestList /></ProtectedRoute>} />
          <Route path="/contests/create" element={<ProtectedRoute><ContestCreate /></ProtectedRoute>} />
          <Route path="/contests/:id" element={<ProtectedRoute><ContestDetail /></ProtectedRoute>} />
          <Route path="/contests/:id/participate" element={<ProtectedRoute><ContestParticipate /></ProtectedRoute>} />
          <Route path="/contests/:id/results" element={<ProtectedRoute><ContestResults /></ProtectedRoute>} />
          
          {/* 합격곡 관리/조회 페이지 */}
          <Route path="/approved-songs" element={<ProtectedRoute><ApprovedSongs /></ProtectedRoute>} />
          
          {/* 파트너모집 게시판 라우트들 */}
          <Route path="/boards/partner" element={<PartnerPostList />} />
          <Route path="/boards/partner/write" element={<PartnerPostWrite />} />
          <Route path="/boards/partner/:id" element={<PartnerPostDetail />} />
          <Route path="/boards/partner/edit/:id" element={<PartnerPostWrite />} />
          
          {/* 기타 모든 경로 - 404 대신 로그인으로 리다이렉트 */}
          <Route 
            path="*" 
            element={<Navigate to={user ? "/" : "/login"} replace />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
