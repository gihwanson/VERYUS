import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { auth, db } from '../firebase';
import './Login.css';

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [showPassword, setShowPassword] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  // 입력값 변경 핸들러 - 커서 위치 보존으로 모바일 역순 입력 방지
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, selectionStart } = e.target;
    const cursorPos = selectionStart;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
    requestAnimationFrame(() => {
      const ref = name === 'password' ? passwordRef : nicknameRef;
      if (ref.current && cursorPos !== null) {
        ref.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [error]);

  /** 로그인에 쓸 이메일: 닉네임이면 Firestore 조회, 이메일 형식이면 정규화(프로필 없어도 Auth 시도 가능) */
  const resolveEmailForSignIn = useCallback(async (raw: string): Promise<string | null> => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (EMAIL_LIKE.test(trimmed)) {
      const normalized = trimmed.toLowerCase();
      const q = query(collection(db, 'users'), where('email', '==', normalized));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const em = snap.docs[0].data().email;
        return String(em ?? normalized).trim().toLowerCase();
      }
      return normalized;
    }

    const q = query(collection(db, 'users'), where('nickname', '==', trimmed));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const userData = querySnapshot.docs[0].data();
    const em = userData.email;
    if (!em || typeof em !== 'string') return null;
    return em.trim().toLowerCase();
  }, []);

  // 로그인 처리
  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (!formData.nickname.trim()) {
        throw new Error('닉네임 또는 이메일을 입력해주세요.');
      }
      if (!formData.password.trim()) {
        throw new Error('비밀번호를 입력해주세요.');
      }

      const emailForSignIn = await resolveEmailForSignIn(formData.nickname);
      if (!emailForSignIn) {
        throw new Error('등록된 닉네임·이메일을 찾을 수 없습니다. 회원가입 시 기입한 닉네임으로 시도해 주세요.');
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        emailForSignIn,
        formData.password
      );

      const authEmail = (userCredential.user.email ?? emailForSignIn).trim().toLowerCase();

      let userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
      let userData = userSnap.data();

      if (!userData?.nickname) {
        const qByEmail = query(collection(db, 'users'), where('email', '==', authEmail));
        const byEmail = await getDocs(qByEmail);
        if (!byEmail.empty) {
          userData = byEmail.docs[0].data();
          if (byEmail.docs[0].id !== userCredential.user.uid) {
            console.warn(
              '[로그인] users 문서 ID와 Auth UID가 다릅니다. 문서:',
              byEmail.docs[0].id,
              'Auth:',
              userCredential.user.uid
            );
          }
        }
      }

      if (!userData?.nickname) {
        await signOut(auth);
        setError(
          '로그인은 되었으나 프로필(닉네임) 정보가 없습니다. 가입이 중간에 실패한 계정일 수 있습니다. 관리자에게 문의하거나, 다른 이메일로 새로 가입해 주세요.'
        );
        return;
      }

      const isAdmin =
        userData.nickname === '너래' ||
        userData.role === '리더' ||
        userData.role === '운영진';

      const userInfo: UserData = {
        uid: userCredential.user.uid,
        email: authEmail,
        nickname: userData.nickname,
        role: userData.role || '일반',
        grade: userData.grade || '🍒체리',
        profileImageUrl: userData.profileImageUrl,
        isAdmin,
        isLoggedIn: true
      };
      localStorage.setItem('veryus_user', JSON.stringify(userInfo));
      const returnTo = (location.state as { from?: string } | null)?.from;
      const nextPath =
        returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/';
      window.location.replace(nextPath);
    } catch (error: unknown) {
      console.error('로그인 에러:', error);
      const err = error as { code?: string; message?: string };
      if (err.message && !err.code) {
        setError(err.message);
      } else {
        setError(getErrorMessage(err.code || err.message || ''));
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, resolveEmailForSignIn, location.state]);

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
          <p className="login-guide">닉네임(또는 이메일)과 비밀번호로 로그인하세요</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <input
              ref={nicknameRef}
              type="text"
              name="nickname"
              dir="ltr"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="닉네임 또는 이메일"
              className="login-input"
              autoComplete="username"
              maxLength={254}
              disabled={isLoading}
              required
            />
          </div>

          <div className="input-group password-group">
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              name="password"
              dir="ltr"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="비밀번호를 입력해주세요"
              className="login-input"
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={30}
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(prev => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
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
              onClick={() => navigate('/signup')}
              disabled={isLoading}
            >
              회원가입
            </button>
            <span className="separator">|</span>
            <button 
              type="button" 
              className="link-button"
              onClick={() => navigate('/forgot-password')}
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