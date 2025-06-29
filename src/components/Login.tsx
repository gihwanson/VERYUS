import React, { useState, useCallback, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Login.css';

interface LoginFormData {
  nickname: string;
  password: string;
}

interface UserData {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  isAdmin: boolean;
  isLoggedIn: boolean;
}

const Login: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
    nickname: '',
    password: ''
  });
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 이미 로그인된 사용자 체크
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      const userData = JSON.parse(userString);
      if (userData.isLoggedIn) {
        window.location.replace('/');
      }
    }
  }, []);

  // 입력값 변경 핸들러
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // 입력 시 에러 메시지 초기화
  }, []);

  // 닉네임으로 이메일 찾기
  const findEmailByNickname = useCallback(async (nickname: string): Promise<string | null> => {
    try {
      const q = query(
        collection(db, 'users'), 
        where('nickname', '==', nickname.trim())
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        return userData.email;
      }
      return null;
    } catch (error) {
      console.error('닉네임으로 이메일 찾기 에러:', error);
      throw new Error('사용자 정보를 찾는 중 오류가 발생했습니다.');
    }
  }, []);

  // 로그인 처리
  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 입력값 검증
      if (!formData.nickname.trim()) {
        throw new Error('닉네임을 입력해주세요.');
      }
      if (!formData.password.trim()) {
        throw new Error('비밀번호를 입력해주세요.');
      }

      // 닉네임으로 이메일 찾기
      const foundEmail = await findEmailByNickname(formData.nickname);
      if (!foundEmail) {
        throw new Error('존재하지 않는 닉네임입니다.');
      }

      // Firebase 로그인
      const userCredential = await signInWithEmailAndPassword(
        auth, 
        foundEmail, 
        formData.password
      );
      
      // 사용자 정보 가져오기 (uid로 정확히 조회)
      const userRef = doc(db, 'users', userCredential.user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      if (!userData || !userData.nickname) {
        alert('닉네임 정보가 없습니다. 관리자에게 문의하세요.');
        setIsLoading(false);
        return;
      }
      // 관리자 권한 확인
      const isAdmin = userData.nickname === '너래' || 
                     userData.role === '리더' || 
                     userData.role === '운영진';
      // 로그인 정보 저장
      const userInfo: UserData = {
        uid: userCredential.user.uid,
        email: foundEmail,
        nickname: userData.nickname,
        role: userData.role || '일반',
        grade: userData.grade || '🍒체리',
        profileImageUrl: userData.profileImageUrl,
        isAdmin,
        isLoggedIn: true
      };
      localStorage.setItem('veryus_user', JSON.stringify(userInfo));
      window.location.replace('/');
      
    } catch (error: any) {
      console.error('로그인 에러:', error);
      setError(getErrorMessage(error.code || error.message));
    } finally {
      setIsLoading(false);
    }
  }, [formData, findEmailByNickname]);

  // 에러 메시지 변환
  const getErrorMessage = (errorCode: string): string => {
    const errorMessages: Record<string, string> = {
      'auth/user-not-found': '등록되지 않은 계정입니다.',
      'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
      'auth/invalid-email': '계정 정보를 찾을 수 없습니다.',
      'auth/too-many-requests': '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
      'auth/invalid-credential': '닉네임 또는 비밀번호가 올바르지 않습니다.',
      'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
      'auth/internal-error': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    };
    
    return errorMessages[errorCode] || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="app-title">VERYUS</h1>
          <p className="app-subtitle">베리어스 버스킹팀에 오신 것을 환영합니다</p>
          <p className="login-guide">닉네임과 비밀번호로 간편하게 로그인하세요</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="닉네임을 입력해주세요"
              className="login-input"
              autoComplete="username"
              maxLength={20}
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="비밀번호를 입력해주세요"
              className="login-input"
              autoComplete="current-password"
              maxLength={30}
              disabled={isLoading}
              required
            />
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="login-footer">
          <div className="footer-links">
            <button 
              type="button" 
              className="link-button"
              onClick={() => window.location.replace('/signup')}
              disabled={isLoading}
            >
              회원가입
            </button>
            <span className="separator">|</span>
            <button 
              type="button" 
              className="link-button"
              onClick={() => window.location.replace('/forgot-password')}
              disabled={isLoading}
            >
              비밀번호 찾기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 