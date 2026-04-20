import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, deleteUser, type User } from 'firebase/auth';
import { doc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // 로그인과 같은 스타일 사용

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
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
  const [checkingEmail, setCheckingEmail] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSuccess('');

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
    const nick = formData.nickname.trim();
    if (!nick) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    if (nick.length < 2 || nick.length > 20) {
      setError('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }

    setCheckingNickname(true);
    setError('');
    setSuccess('');

    try {
      const q = query(collection(db, 'users'), where('nickname', '==', nick));
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

  const checkEmailAvailability = async () => {
    if (!formData.email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    // 이메일 형식 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setCheckingEmail(true);
    setError('');
    setSuccess('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', formData.email.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setSuccess('사용 가능한 이메일입니다.');
      } else {
        setError('이미 사용 중인 이메일입니다.');
      }
    } catch (error) {
      setError('이메일 중복 확인 중 오류가 발생했습니다.');
    } finally {
      setCheckingEmail(false);
    }
  };

  const uploadProfileImage = async (userId: string): Promise<string | null> => {
    if (!profileImage) return null;

    try {
      const safeName = profileImage.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const imageRef = ref(storage, `profile-images/${userId}/${Date.now()}_${safeName}`);
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
    if (formData.inviteCode.trim() !== '0924') {
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

    const emailTrim = formData.email.trim().toLowerCase();
    const nicknameTrim = formData.nickname.trim();

    // 닉네임 중복확인 체크
    if (!nicknameChecked || !nicknameAvailable) {
      setError('닉네임 중복확인을 완료해주세요.');
      return;
    }

    if (nicknameTrim.length < 2 || nicknameTrim.length > 20) {
      setError('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }

    // 이메일 필수 입력 및 유효성 검사
    if (!emailTrim) {
      setError('이메일을 입력해주세요.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrim)) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }

    // 가입 직전 닉네임 재확인 (타인이 먼저 가입한 경우)
    const nicknameQuery = query(collection(db, 'users'), where('nickname', '==', nicknameTrim));
    let nicknameSnapshot;
    try {
      nicknameSnapshot = await getDocs(nicknameQuery);
    } catch {
      setError('닉네임 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (!nicknameSnapshot.empty) {
      setError('이미 사용 중인 닉네임입니다. 닉네임 중복확인을 다시 해주세요.');
      setNicknameChecked(false);
      setNicknameAvailable(false);
      return;
    }

    setIsLoading(true);

    let createdUser: User | null = null;
    let userDocCreated = false;

    try {
      const sanitizedNickname = nicknameTrim
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, '');
      const internalLocal =
        sanitizedNickname.length > 0 ? sanitizedNickname : `user_${Date.now()}`;
      const internalEmail = `${internalLocal}@veryus.internal`;

      const userCredential = await createUserWithEmailAndPassword(auth, emailTrim, formData.password);
      const user = userCredential.user;
      createdUser = user;

      const userRole = nicknameTrim === '너래' ? '리더' : '일반';
      const userGrade = '🍒';
      const isAdmin = userRole === '리더';

      // Firestore 먼저 저장 → 이후 단계 실패 시 Auth 계정만 정리 가능
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        nickname: nicknameTrim,
        internalEmail,
        email: emailTrim,
        role: userRole,
        grade: userGrade,
        profileImageUrl: null,
        createdAt: serverTimestamp()
      });
      userDocCreated = true;

      let profileImageUrl: string | null = null;
      if (profileImage) {
        try {
          profileImageUrl = await uploadProfileImage(user.uid);
        } catch (uploadErr) {
          console.error('프로필 이미지 업로드 실패(계정은 생성됨):', uploadErr);
          setSuccess('가입은 완료되었으나 프로필 이미지 업로드에 실패했습니다. 마이페이지에서 다시 등록해 주세요.');
        }
      }

      await updateProfile(user, {
        displayName: nicknameTrim,
        ...(profileImageUrl ? { photoURL: profileImageUrl } : {})
      });

      if (profileImageUrl) {
        await updateDoc(doc(db, 'users', user.uid), { profileImageUrl });
      }

      localStorage.setItem(
        'veryus_user',
        JSON.stringify({
          uid: user.uid,
          email: emailTrim,
          nickname: nicknameTrim,
          role: userRole,
          grade: userGrade,
          profileImageUrl: profileImageUrl || undefined,
          isAdmin,
          isLoggedIn: true
        })
      );

      if (!profileImage || profileImageUrl) {
        setSuccess('회원가입이 완료되었습니다! 메인 페이지로 이동합니다.');
      }
      window.location.replace('/');
    } catch (error: unknown) {
      console.error('회원가입 에러:', error);
      if (createdUser && !userDocCreated) {
        try {
          await deleteUser(createdUser);
        } catch (delErr) {
          console.error('가입 롤백(계정 삭제) 실패 — 관리자에게 문의해 주세요.', delErr);
        }
      }
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/email-already-in-use') {
        setError(
          '이미 Firebase에 등록된 이메일입니다. 로그인 화면에서 가입 시 사용한 닉네임(또는 해당 이메일)과 비밀번호로 로그인해 주세요. 비밀번호를 모르면 「비밀번호 찾기」를 이용해 주세요. 가입이 끝나지 않은 계정이면 관리자에게 문의해 주세요.'
        );
      } else {
        setError(getErrorMessage(err.code));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (errorCode?: string): string => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일입니다.';
      case 'auth/invalid-email':
        return '올바른 이메일 형식이 아닙니다.';
      case 'auth/weak-password':
        return '비밀번호가 너무 약합니다. 6자 이상으로 설정해주세요.';
      case 'auth/network-request-failed':
        return '네트워크 연결을 확인해주세요.';
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

          <div className="input-group" style={{ marginBottom: 8 }}>
            <div style={{ color: '#F43F5E', fontSize: 13, marginBottom: 4, textAlign: 'left', fontWeight: 600 }}>
              ※ 반드시 닉네임은 카카오톡 오픈채팅방과 같은 닉네임으로 가입 부탁드리겠습니다.
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: 8 }}>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="이메일 (비밀번호 찾기용, 필수)"
              className="login-input"
              required
              autoComplete="email"
            />
          </div>
          <div className="input-group signup-email-check-row" style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={checkEmailAvailability}
              disabled={checkingEmail || checkingNickname || isLoading || !formData.email.trim()}
              className="nickname-check-button"
            >
              {checkingEmail ? '이메일 확인 중...' : '이메일 중복 확인 (선택)'}
            </button>
          </div>

          <div className="input-group" style={{ marginBottom: 8 }}>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="비밀번호 (6자 이상)"
              className="login-input"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="input-group" style={{ marginBottom: 8 }}>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="비밀번호 확인"
              className="login-input"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="input-group signup-nickname-row" style={{ marginBottom: 8 }}>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="닉네임 (2-20자)"
              className="login-input"
              required
              maxLength={20}
            />
            <button
              type="button"
              onClick={checkNicknameAvailability}
              disabled={checkingNickname || checkingEmail || isLoading || !formData.nickname.trim()}
              className="nickname-check-button"
            >
              {checkingNickname ? '확인중...' : '닉네임 중복확인'}
            </button>
          </div>

          <div className="file-upload-container" style={{ marginBottom: 24 }}>
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
            disabled={isLoading || checkingNickname || checkingEmail}
            style={{ marginTop: 12, marginBottom: 8 }}
          >
            {isLoading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="login-footer">
          <div className="footer-links">
            <div style={{ color: '#8A55CC', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
              비밀번호를 잊어버렸을 때 이메일로 찾을 수 있습니다.
            </div>
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