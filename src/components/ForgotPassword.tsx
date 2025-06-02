import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Mail, User, ArrowLeft, Loader } from 'lucide-react';
import './ForgotPassword.css';

const ForgotPassword: React.FC = () => {
  const [nickname, setNickname] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [step, setStep] = useState<'input' | 'verify' | 'success'>('input');
  const navigate = useNavigate();

  const findEmailByNickname = async (nickname: string): Promise<string | null> => {
    try {
      const q = query(
        collection(db, 'users'), 
        where('nickname', '==', nickname.trim())
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        return userDoc.data().email;
      }
      return null;
    } catch (error) {
      console.error('닉네임으로 이메일 찾기 에러:', error);
      throw new Error('사용자 정보를 확인하는 중 오류가 발생했습니다.');
    }
  };

  const validateInput = (input: string, type: 'email' | 'nickname'): boolean => {
    if (!input.trim()) return false;
    
    if (type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(input.trim());
    }
    
    return input.trim().length >= 2;
  };

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      let resetEmail = email.trim();

      if (nickname.trim()) {
        const foundEmail = await findEmailByNickname(nickname);
        if (!foundEmail) {
          setError('존재하지 않는 닉네임입니다.');
          return;
        }
        resetEmail = foundEmail;
      }

      if (!resetEmail && !nickname.trim()) {
        setError('닉네임 또는 이메일을 입력해주세요.');
        return;
      }

      if (resetEmail && !validateInput(resetEmail, 'email')) {
        setError('올바른 이메일 형식이 아닙니다.');
        return;
      }

      await sendPasswordResetEmail(auth, resetEmail, {
        url: window.location.origin + '/login',
        handleCodeInApp: true
      });
      
      setStep('success');
      setSuccess(`비밀번호 재설정 링크가 ${resetEmail}로 전송되었습니다.`);
      
      // 5초 후 로그인 페이지로 이동
      setTimeout(() => {
        navigate('/login');
      }, 5000);

    } catch (error: any) {
      console.error('비밀번호 재설정 에러:', error);
      setError(getErrorMessage(error.code));
      setStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case 'auth/user-not-found':
        return '등록되지 않은 계정입니다.';
      case 'auth/invalid-email':
        return '올바른 이메일 형식이 아닙니다.';
      case 'auth/too-many-requests':
        return '너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.';
      case 'auth/network-request-failed':
        return '네트워크 연결을 확인해주세요.';
      default:
        return '비밀번호 재설정 중 오류가 발생했습니다. 다시 시도해주세요.';
    }
  };

  if (step === 'success') {
    return (
      <div className="forgot-password-container">
        <div className="success-card">
          <div className="success-icon">✓</div>
          <h2>이메일 전송 완료</h2>
          <p>{success}</p>
          <p className="redirect-message">잠시 후 로그인 페이지로 이동합니다...</p>
          <button 
            className="login-link-button"
            onClick={() => navigate('/login')}
          >
            <ArrowLeft size={16} />
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-card">
        <div className="card-header">
          <h1>비밀번호 찾기</h1>
          <p className="header-description">
            가입하신 닉네임 또는 이메일을 입력하시면<br />
            비밀번호 재설정 링크를 보내드립니다.
          </p>
        </div>

        <form onSubmit={handlePasswordReset} className="reset-form">
          <div className="input-group">
            <label htmlFor="nickname" className="input-label">
              <User size={18} />
              닉네임
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError('');
              }}
              placeholder="닉네임을 입력해주세요"
              className="reset-input"
              disabled={isLoading}
            />
          </div>

          <div className="input-divider">또는</div>

          <div className="input-group">
            <label htmlFor="email" className="input-label">
              <Mail size={18} />
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="이메일을 입력해주세요"
              className="reset-input"
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="reset-button"
            disabled={isLoading || (!nickname.trim() && !email.trim())}
          >
            {isLoading ? (
              <>
                <Loader className="spin" size={16} />
                처리 중...
              </>
            ) : (
              '비밀번호 재설정 이메일 받기'
            )}
          </button>
        </form>

        <div className="card-footer">
          <button 
            type="button" 
            className="back-button"
            onClick={() => navigate('/login')}
            disabled={isLoading}
          >
            <ArrowLeft size={16} />
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword; 