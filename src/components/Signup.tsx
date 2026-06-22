import React, { useState, useCallback, useRef } from 'react';
import { createUserWithEmailAndPassword, updateProfile, deleteUser, type User } from 'firebase/auth';
import { doc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Eye, EyeOff } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { useNavigate } from 'react-router-dom';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    inviteCode: '',
    nickname: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [nicknameChecked, setNicknameChecked] = useState(false);
  const [nicknameAvailable, setNicknameAvailable] = useState(false);
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [checkingNickname, setCheckingNickname] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const inviteCodeInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, selectionStart } = e.target;
    const cursorPos = selectionStart;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (success) setSuccess('');

    if (name === 'nickname') {
      setNicknameChecked(false);
      setNicknameAvailable(false);
    }
    if (name === 'email') {
      setEmailChecked(false);
      setEmailAvailable(false);
    }

    requestAnimationFrame(() => {
      const refMap: Record<string, React.RefObject<HTMLInputElement | null>> = {
        nickname: nicknameInputRef,
        email: emailInputRef,
        password: passwordInputRef,
        confirmPassword: confirmPasswordInputRef,
        inviteCode: inviteCodeInputRef,
      };
      const inputRef = refMap[name];
      if (inputRef?.current && cursorPos !== null) {
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [error, success]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    if (!nick) { setError('닉네임을 입력해주세요.'); return; }
    if (nick.length < 2 || nick.length > 20) {
      setError('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }
    setCheckingNickname(true);
    setError(''); setSuccess('');
    try {
      const q = query(collection(db, 'users'), where('nickname', '==', nick));
      const snap = await getDocs(q);
      if (snap.empty) {
        setNicknameAvailable(true);
        setNicknameChecked(true);
        setSuccess('사용 가능한 닉네임입니다.');
      } else {
        setNicknameAvailable(false);
        setNicknameChecked(false);
        setError('이미 사용 중인 닉네임입니다.');
      }
    } catch {
      setError('닉네임 중복 확인 중 오류가 발생했습니다.');
    } finally {
      setCheckingNickname(false);
    }
  };

  const checkEmailAvailability = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email) { setError('이메일을 입력해주세요.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setError('올바른 이메일 형식이 아닙니다.'); return; }
    setCheckingEmail(true);
    setError(''); setSuccess('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        setEmailAvailable(true);
        setEmailChecked(true);
        setSuccess('사용 가능한 이메일입니다.');
      } else {
        setEmailAvailable(false);
        setEmailChecked(false);
        setError('이미 사용 중인 이메일입니다.');
      }
    } catch {
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
      return await getDownloadURL(imageRef);
    } catch {
      throw new Error('프로필 이미지 업로드에 실패했습니다.');
    }
  };

  const validateInviteCode = async (code: string): Promise<boolean> => {
    try {
      const configDoc = await getDoc(doc(db, 'appConfig', 'inviteCode'));
      if (configDoc.exists()) {
        const validCode = configDoc.data().code;
        return code === validCode;
      }
      // Firestore에 설정이 없으면 기존 하드코딩 값으로 폴백
      return code === '0924';
    } catch {
      return code === '0924';
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setSuccess('');

    const inviteCode = formData.inviteCode.trim();
    const nicknameTrim = formData.nickname.trim();
    const emailTrim = formData.email.trim().toLowerCase();

    if (!inviteCode) { setError('가입코드를 입력해주세요.'); return; }

    const isValidCode = await validateInviteCode(inviteCode);
    if (!isValidCode) { setError('가입코드가 올바르지 않습니다.'); return; }

    if (!nicknameTrim || nicknameTrim.length < 2 || nicknameTrim.length > 20) {
      setError('닉네임은 2자 이상 20자 이하로 입력해주세요.'); return;
    }
    if (!nicknameChecked || !nicknameAvailable) {
      setError('닉네임 중복확인을 완료해주세요.'); return;
    }

    if (!emailTrim) { setError('이메일을 입력해주세요.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrim)) { setError('올바른 이메일 형식이 아닙니다.'); return; }
    if (!emailChecked || !emailAvailable) {
      setError('이메일 중복확인을 완료해주세요.'); return;
    }

    if (formData.password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (formData.password !== formData.confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }

    // 가입 직전 닉네임/이메일 재확인
    try {
      const nickSnap = await getDocs(query(collection(db, 'users'), where('nickname', '==', nicknameTrim)));
      if (!nickSnap.empty) {
        setError('이미 사용 중인 닉네임입니다. 닉네임 중복확인을 다시 해주세요.');
        setNicknameChecked(false); setNicknameAvailable(false); return;
      }
    } catch { setError('닉네임 확인 중 오류가 발생했습니다.'); return; }

    setIsLoading(true);
    let createdUser: User | null = null;
    let userDocCreated = false;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailTrim, formData.password);
      const user = userCredential.user;
      createdUser = user;

      const userRole = nicknameTrim === '너래' ? '리더' : '일반';
      const userGrade = '🍒';
      const isAdmin = userRole === '리더';

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        nickname: nicknameTrim,
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
        } catch {
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

      localStorage.setItem('veryus_user', JSON.stringify({
        uid: user.uid,
        email: emailTrim,
        nickname: nicknameTrim,
        role: userRole,
        grade: userGrade,
        profileImageUrl: profileImageUrl || undefined,
        isAdmin,
        isLoggedIn: true
      }));

      setSuccess('회원가입이 완료되었습니다! 메인 페이지로 이동합니다.');
      setTimeout(() => navigate('/'), 800);
    } catch (error: unknown) {
      console.error('회원가입 에러:', error);
      if (createdUser && !userDocCreated) {
        try { await deleteUser(createdUser); } catch { /* ignore */ }
      }
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 등록된 이메일입니다. 로그인 화면에서 시도하거나 비밀번호 찾기를 이용해주세요.');
      } else {
        setError(getErrorMessage(err.code));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (errorCode?: string): string => {
    switch (errorCode) {
      case 'auth/email-already-in-use': return '이미 사용 중인 이메일입니다.';
      case 'auth/invalid-email': return '올바른 이메일 형식이 아닙니다.';
      case 'auth/weak-password': return '비밀번호가 너무 약합니다. 6자 이상으로 설정해주세요.';
      case 'auth/network-request-failed': return '네트워크 연결을 확인해주세요.';
      default: return '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.';
    }
  };

  const passwordStrength = formData.password.length === 0 ? null
    : formData.password.length < 6 ? 'weak'
    : formData.password.length < 10 ? 'medium' : 'strong';

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="app-title">VERYUS</h1>
          <p className="app-subtitle">베리어스에 오신 것을 환영합니다</p>
        </div>

        <form onSubmit={handleSignup} className="login-form">
          {/* 가입코드 */}
          <div className="input-group">
            <input
              ref={inviteCodeInputRef}
              type="text"
              name="inviteCode"
              dir="ltr"
              value={formData.inviteCode}
              onChange={handleInputChange}
              placeholder="가입코드"
              className="login-input"
              required
              disabled={isLoading}
            />
          </div>

          {/* 닉네임 안내 + 입력 */}
          <div className="signup-notice">
            ※ 닉네임 칸에는 닉네임만 입력해주세요. (예: `홍길동`)
            <br />
            ※ `닉네임/생년/성별/사는지역` 형태로 입력하지 말아주세요.
          </div>
          <div className="input-group signup-nickname-row">
            <input
              ref={nicknameInputRef}
              type="text"
              name="nickname"
              dir="ltr"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="닉네임"
              className="login-input"
              required
              maxLength={20}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={checkNicknameAvailability}
              disabled={checkingNickname || isLoading || !formData.nickname.trim()}
              className="nickname-check-button"
            >
              {checkingNickname ? '확인중...' : nicknameChecked && nicknameAvailable ? '✓ 확인완료' : '중복확인'}
            </button>
          </div>

          {/* 이메일 + 중복확인 */}
          <div className="input-group signup-nickname-row">
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              dir="ltr"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="이메일 (비밀번호 찾기용)"
              className="login-input"
              required
              autoComplete="email"
              disabled={isLoading}
              style={{ flex: '1 1 auto', width: '100%' }}
            />
            <button
              type="button"
              onClick={checkEmailAvailability}
              disabled={checkingEmail || isLoading || !formData.email.trim()}
              className="nickname-check-button"
            >
              {checkingEmail ? '확인중...' : emailChecked && emailAvailable ? '✓ 확인완료' : '중복확인'}
            </button>
          </div>

          {/* 비밀번호 */}
          <div className="input-group password-group">
            <input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              name="password"
              dir="ltr"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="비밀번호 (6자 이상)"
              className="login-input"
              required
              autoComplete="new-password"
              disabled={isLoading}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(prev => !prev)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {passwordStrength && (
            <div className={`password-strength password-strength--${passwordStrength}`}>
              {passwordStrength === 'weak' ? '⚠️ 6자 이상 입력해주세요' : passwordStrength === 'medium' ? '보통 강도' : '✓ 안전한 비밀번호'}
            </div>
          )}

          {/* 비밀번호 확인 */}
          <div className="input-group password-group">
            <input
              ref={confirmPasswordInputRef}
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              dir="ltr"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="비밀번호 확인"
              className="login-input"
              required
              autoComplete="new-password"
              disabled={isLoading}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowConfirmPassword(prev => !prev)}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <div className="password-strength password-strength--weak">비밀번호가 일치하지 않습니다</div>
          )}

          {/* 프로필 이미지 */}
          <div className="file-upload-container">
            <label className="file-upload-label">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="file-upload-input"
                disabled={isLoading}
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
              disabled={isLoading}
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
