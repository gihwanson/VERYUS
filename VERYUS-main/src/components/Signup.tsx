import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // 로그인과 같은 스타일 사용

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    nickname: '',
    inviteCode: ''
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [nicknameChecked, setNicknameChecked] = useState<boolean>(false);
  const [nicknameAvailable, setNicknameAvailable] = useState<boolean>(false);
  const [checkingNickname, setCheckingNickname] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // 닉네임이 변경되면 중복확인 초기화
    if (name === 'nickname') {
      setNicknameChecked(false);
      setNicknameAvailable(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 파일 크기 제한 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('프로필 이미지는 5MB 이하로 선택해주세요.');
        return;
      }
      setProfileImage(file);
      setError('');
    }
  };

  const checkNicknameAvailability = async () => {
    if (!formData.nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    if (formData.nickname.length < 2 || formData.nickname.length > 10) {
      setError('닉네임은 2자 이상 10자 이하로 입력해주세요.');
      return;
    }

    setCheckingNickname(true);
    setError('');

    try {
      const q = query(collection(db, 'users'), where('nickname', '==', formData.nickname));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setNicknameAvailable(true);
        setNicknameChecked(true);
        setSuccess('사용 가능한 닉네임입니다.');
      } else {
        setNicknameAvailable(false);
        setNicknameChecked(false);
        setError('이미 사용 중인 닉네임입니다.');
      }
    } catch (error) {
      console.error('닉네임 중복 확인 에러:', error);
      setError('닉네임 중복 확인 중 오류가 발생했습니다.');
    } finally {
      setCheckingNickname(false);
    }
  };

  const uploadProfileImage = async (userId: string): Promise<string | null> => {
    if (!profileImage) return null;

    try {
      const imageRef = ref(storage, `profile-images/${userId}/${profileImage.name}`);
      await uploadBytes(imageRef, profileImage);
      const downloadURL = await getDownloadURL(imageRef);
      return downloadURL;
    } catch (error) {
      console.error('프로필 이미지 업로드 에러:', error);
      throw new Error('프로필 이미지 업로드에 실패했습니다.');
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 가입코드 확인
    if (formData.inviteCode !== '0924') {
      setError('가입코드가 올바르지 않습니다.');
      return;
    }

    // 비밀번호 확인
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (formData.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    // 닉네임 중복확인 체크
    if (!nicknameChecked || !nicknameAvailable) {
      setError('닉네임 중복확인을 완료해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      // 닉네임을 기반으로 이메일 생성 (내부용)
      const sanitizedNickname = formData.nickname
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, '');
      const internalEmail = `${sanitizedNickname}@veryus.internal`;

      // Firebase Authentication 회원가입
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        internalEmail,
        formData.password
      );
      const user = userCredential.user;

      // 프로필 이미지 업로드 (선택사항)
      let profileImageUrl = null;
      if (profileImage) {
        profileImageUrl = await uploadProfileImage(user.uid);
      }

      // Firebase Auth 프로필 업데이트
      await updateProfile(user, {
        displayName: formData.nickname,
        photoURL: profileImageUrl
      });

      // Firestore에 사용자 데이터 저장
      const userRole = formData.nickname === '너래' ? '리더' : '일반';
      const userGrade = '🍒체리';

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        nickname: formData.nickname,
        internalEmail,
        role: userRole,
        grade: userGrade,
        profileImageUrl: profileImageUrl,
        createdAt: new Date().toISOString()
      });

      // localStorage에 로그인 상태 저장
      localStorage.setItem('veryus_user', JSON.stringify({
        uid: user.uid,
        nickname: formData.nickname,
        role: userRole,
        grade: userGrade,
        profileImageUrl: profileImageUrl,
        isLoggedIn: true
      }));

      setSuccess('회원가입이 완료되었습니다! 메인 페이지로 이동합니다.');
      
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (error: any) {
      console.error('회원가입 에러:', error);
      setError(getErrorMessage(error.code));
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일입니다.';
      case 'auth/invalid-email':
        return '올바른 이메일 형식이 아닙니다.';
      case 'auth/weak-password':
        return '비밀번호가 너무 약합니다. 6자 이상으로 설정해주세요.';
      default:
        return '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.';
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="app-title">VERYUS</h1>
          <p className="app-subtitle">닉네임으로 간편하게 가입하세요</p>
        </div>

        <form onSubmit={handleSignup} className="login-form">
          <div className="input-group">
            <input
              type="text"
              name="inviteCode"
              value={formData.inviteCode}
              onChange={handleInputChange}
              placeholder="가입코드를 입력해주세요"
              className="login-input"
              required
            />
          </div>

          <div className="signup-input-row">
            <div className="input-group">
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="비밀번호 (6자 이상)"
                className="login-input"
                required
              />
            </div>

            <div className="input-group">
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="비밀번호 확인"
                className="login-input"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <div className="nickname-check-container">
              <input
                type="text"
                name="nickname"
                value={formData.nickname}
                onChange={handleInputChange}
                placeholder="닉네임 (2-10자)"
                className="login-input"
                style={{ paddingRight: '90px' }}
                required
              />
              <button
                type="button"
                onClick={checkNicknameAvailability}
                disabled={checkingNickname || !formData.nickname.trim()}
                className="nickname-check-button"
              >
                {checkingNickname ? '확인중...' : '중복확인'}
              </button>
            </div>
          </div>

          <div className="file-upload-container">
            <label className="file-upload-label">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="file-upload-input"
              />
              📷 {profileImage ? profileImage.name : '프로필 이미지 선택 (선택사항)'}
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="login-footer">
          <div className="footer-links">
            <button 
              type="button" 
              className="link-button"
              onClick={() => navigate('/login')}
            >
              이미 계정이 있으신가요? 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup; 