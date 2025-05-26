import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { collection, addDoc, getDocs, query, where, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import sha256 from "crypto-js/sha256";
import { db, storage } from "../firebase";
import { 
  containerStyle, darkContainerStyle, titleStyle, 
  inputStyle, darkInputStyle, purpleBtn, darkPurpleBtn,
  secondaryBtn, darkSecondaryBtn
} from "./style";



// 기본 아바타 이미지
const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// 이용약관 텍스트
const TERMS_OF_SERVICE = `
# 베리어스(VERYUS) 이용약관

## 1. 서비스 이용 약관
본 약관은 베리어스(VERYUS) 서비스 이용에 관한 규정을 정합니다.

## 2. 개인정보 수집 및 이용
- 수집항목: 닉네임, 비밀번호(암호화), 프로필 이미지(선택)
- 수집목적: 서비스 제공, 회원 식별 및 관리
- 보관기간: 회원 탈퇴시까지

## 3. 활동 규칙
- 타인을 존중하는 언어를 사용해주세요.
- 저작권을 침해하는 콘텐츠를 게시하지 마세요.
- 불법적이거나 유해한 콘텐츠 게시를 금지합니다.

베리어스(VERYUS)는 건전하고 즐거운 듀엣/합창 커뮤니티를 지향합니다.
`;

function Signup({ darkMode }) {
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [code, setCode] = useState("");
  const [pic, setPic] = useState(null);
  const [picPreview, setPicPreview] = useState(null);
  const [introduction, setIntroduction] = useState("");
  const [partnerDone, setPartnerDone] = useState(false);
  const [preferredGenres, setPreferredGenres] = useState([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const nav = useNavigate();

  // 닉네임 중복 체크
  const [nickAvailable, setNickAvailable] = useState(null);
  const [checkingNick, setCheckingNick] = useState(false);

  // 장르 옵션
  const genreOptions = [
    "발라드", "댄스", "힙합", "R&B", "록", "인디", "팝", "OST", "재즈", "트로트", "클래식"
  ];

  // 이미지 미리보기 생성
  useEffect(() => {
    if (pic) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicPreview(reader.result);
      };
      reader.readAsDataURL(pic);
    } else {
      setPicPreview(null);
    }
  }, [pic]);

  // 닉네임 중복 체크
  const checkNickname = useCallback(async () => {
  if (!nick.trim()) {
    setNickAvailable(null);
    return;
  }
  
  setCheckingNick(true);
  try {
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const dupSnap = await getDocs(q);
    setNickAvailable(dupSnap.empty);
  } catch (error) {
    console.error("닉네임 중복 확인 중 오류 발생:", error);
  } finally {
    setCheckingNick(false);
  }
}, [nick]); // nick을 의존성으로 추가

useEffect(() => {
  const timer = setTimeout(() => {
    if (nick.trim()) {
      checkNickname();
    }
  }, 500);
  
  return () => clearTimeout(timer);
}, [nick, checkNickname]);

  // 장르 선택 토글
  const toggleGenre = (genre) => {
    setPreferredGenres(prev => 
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  // 단계별 검증
  const validateStep1 = () => {
    const newErrors = {};
    
    if (!nick.trim()) {
      newErrors.nick = "닉네임을 입력하세요";
    } else if (nickAvailable === false) {
      newErrors.nick = "이미 사용 중인 닉네임입니다";
    }
    
    if (!pw) {
      newErrors.pw = "비밀번호를 입력하세요";
    } else if (pw.length < 6) {
      newErrors.pw = "비밀번호는 6자 이상이어야 합니다";
    }
    
    if (!pwConfirm) {
      newErrors.pwConfirm = "비밀번호를 한번 더 입력하세요";
    } else if (pw !== pwConfirm) {
      newErrors.pwConfirm = "비밀번호가 일치하지 않습니다";
    }
    
    if (!code) {
      newErrors.code = "가입코드를 입력하세요";
    } else if (code !== "0924") {
      newErrors.code = "가입코드가 틀립니다";
    }
    
    if (!termsAccepted) {
      newErrors.terms = "이용약관에 동의해야 합니다";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 회원가입 처리
  const handleSignup = async () => {
    if (!validateStep1()) return;
    
    setLoading(true);
    try {
      let profileUrl = DEFAULT_AVATAR;
      
      // 프로필 이미지 업로드
      if (pic) {
        const filename = `${uuidv4()}_${pic.name}`;
        const storageRef = ref(storage, `profiles/${filename}`);
        await uploadBytes(storageRef, pic);
        profileUrl = await getDownloadURL(storageRef);
      }
      
      // 사용자 데이터 저장
      const userData = {
        nickname: nick,
        id: nick, // 닉네임을 ID로 사용
        email: `${nick}@veryus.app`, // 임시 이메일
        password: sha256(pw).toString(), // 비밀번호 해싱
        profilePicUrl: profileUrl,
        introduction: introduction.trim() || "안녕하세요! 베리어스에서 만나게 되어 반갑습니다.",
        preferredGenres: preferredGenres,
        grade: "체리", // 초기 등급
        createdAt: Timestamp.now(),
        partnerDone: partnerDone,
        role: "일반회원", // 기본 역할
        followers: [],
        following: [],
        lastActive: Timestamp.now(),
        isApproved: false, // 관리자 승인 대기 상태
        status: "pending" // 승인 대기 상태
      };

      // users 컬렉션에 문서 추가
      const docRef = await addDoc(collection(db, "users"), userData);
      console.log("User document created with ID:", docRef.id);
      
      alert("회원가입이 완료되었습니다! 관리자 승인 후 로그인이 가능합니다.");
      nav("/login");
    } catch (error) {
      console.error("회원가입 중 오류 발생:", error);
      alert("회원가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 다음 단계로 이동
  const nextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2) {
      handleSignup();
    }
  };

  // 이전 단계로 이동
  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // 스타일 정의
  const currentContainerStyle = darkMode ? darkContainerStyle : containerStyle;
  const currentInputStyle = darkMode ? darkInputStyle : inputStyle;
  const currentPurpleBtn = darkMode ? darkPurpleBtn : purpleBtn;
  const currentSecondaryBtn = darkMode ? darkSecondaryBtn : secondaryBtn;
  
  const stepIndicatorStyle = {
    display: "flex",
    justifyContent: "center",
    marginBottom: 20
  };
  
  const stepDotStyle = (isActive) => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    backgroundColor: isActive 
      ? (darkMode ? "#bb86fc" : "#7e57c2") 
      : (darkMode ? "#666" : "#ccc"),
    margin: "0 5px",
    transition: "background-color 0.3s"
  });
  
  const formGroupStyle = {
    marginBottom: 20
  };
  
  const labelStyle = {
    display: "block",
    marginBottom: 8,
    fontWeight: "bold",
    color: darkMode ? "#ddd" : "#333",
    fontSize: 14
  };
  
  const errorMessageStyle = {
    color: "#f44336",
    fontSize: 12,
    marginTop: 4
  };
  
  const fileInputContainerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 20
  };
  
  const previewImageStyle = {
    width: 120,
    height: 120,
    borderRadius: "50%",
    objectFit: "cover",
    border: `3px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`,
    marginBottom: 10
  };
  
  const fileInputLabelStyle = {
    padding: "10px 15px",
    backgroundColor: darkMode ? "#555" : "#e0e0e0",
    color: darkMode ? "#fff" : "#333",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "center",
    display: "inline-block",
    transition: "background-color 0.3s"
  };
  
  const hiddenFileInputStyle = {
    display: "none"
  };
  
  const genreContainerStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10
  };
  
  const genreChipStyle = (isSelected) => ({
    padding: "8px 12px",
    borderRadius: 20,
    fontSize: 14,
    cursor: "pointer",
    backgroundColor: isSelected 
      ? (darkMode ? "#bb86fc" : "#7e57c2") 
      : (darkMode ? "#444" : "#f0f0f0"),
    color: isSelected 
      ? "#fff" 
      : (darkMode ? "#ddd" : "#666"),
    transition: "all 0.2s",
    border: "none"
  });
  
  const buttonContainerStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 30,
    gap: 10
  };
  
  const termsContainerStyle = {
    marginTop: 20,
    marginBottom: 20
  };
  
  const termsTextStyle = {
    padding: 15,
    backgroundColor: darkMode ? "#333" : "#f3f3f3",
    borderRadius: 8,
    maxHeight: 150,
    overflowY: "auto",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    marginTop: 10,
    marginBottom: 10,
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`
  };
  
  const checkboxContainerStyle = {
    display: "flex",
    alignItems: "center",
    marginBottom: 10
  };
  
  const checkboxStyle = {
    marginRight: 10,
    accentColor: darkMode ? "#bb86fc" : "#7e57c2"
  };
  
  const linkStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    textDecoration: "underline",
    cursor: "pointer"
  };
  
  const introTextareaStyle = {
    width: "100%",
    padding: "12px",
    borderRadius: 8,
    border: `1px solid ${darkMode ? "#666" : "#ccc"}`,
    backgroundColor: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#333",
    minHeight: 100,
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit"
  };
  
  const nickStatusStyle = {
    display: "flex",
    alignItems: "center",
    marginTop: 5,
    fontSize: 12
  };

  return (
    <div style={currentContainerStyle}>
      <h1 style={titleStyle}>회원가입</h1>
      
      {/* 단계 표시기 */}
      <div style={stepIndicatorStyle}>
        <div style={stepDotStyle(step === 1)}></div>
        <div style={stepDotStyle(step === 2)}></div>
      </div>
      
      {/* 단계 1: 필수 정보 입력 */}
      {step === 1 && (
        <>
          <div style={formGroupStyle}>
            <label style={labelStyle}>닉네임</label>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="커뮤니티에서 사용할 닉네임"
              style={currentInputStyle}
            />
            
            {nick.trim() && (
              <div style={nickStatusStyle}>
                {checkingNick ? (
                  <span style={{ color: "#9e9e9e" }}>확인 중...</span>
                ) : nickAvailable === true ? (
                  <span style={{ color: "#4caf50" }}>✓ 사용 가능한 닉네임입니다</span>
                ) : nickAvailable === false ? (
                  <span style={{ color: "#f44336" }}>✗ 이미 사용 중인 닉네임입니다</span>
                ) : null}
              </div>
            )}
            
            {errors.nick && (
              <div style={errorMessageStyle}>{errors.nick}</div>
            )}
          </div>
          
          <div style={formGroupStyle}>
            <label style={labelStyle}>비밀번호</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="6자 이상 입력해주세요"
              style={currentInputStyle}
            />
            {errors.pw && (
              <div style={errorMessageStyle}>{errors.pw}</div>
            )}
          </div>
          
          <div style={formGroupStyle}>
            <label style={labelStyle}>비밀번호 확인</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="비밀번호를 한번 더 입력하세요"
              style={currentInputStyle}
            />
            {errors.pwConfirm && (
              <div style={errorMessageStyle}>{errors.pwConfirm}</div>
            )}
          </div>
          
          <div style={formGroupStyle}>
            <label style={labelStyle}>가입코드</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="베리어스 가입코드를 입력하세요"
              style={currentInputStyle}
            />
            {errors.code && (
              <div style={errorMessageStyle}>{errors.code}</div>
            )}
          </div>
          
          <div style={termsContainerStyle}>
            <div style={checkboxContainerStyle}>
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={() => setTermsAccepted(!termsAccepted)}
                style={checkboxStyle}
              />
              <label htmlFor="terms">이용약관 및 개인정보 처리방침에 동의합니다</label>
            </div>
            
            <div style={{ fontSize: 13 }}>
              <span 
                style={linkStyle}
                onClick={() => setShowTerms(!showTerms)}
              >
                {showTerms ? "약관 숨기기" : "약관 보기"}
              </span>
            </div>
            
            {showTerms && (
              <div style={termsTextStyle}>
                {TERMS_OF_SERVICE}
              </div>
            )}
            
            {errors.terms && (
              <div style={errorMessageStyle}>{errors.terms}</div>
            )}
          </div>
        </>
      )}
      
      {/* 단계 2: 추가 정보 입력 */}
      {step === 2 && (
        <>
          <div style={fileInputContainerStyle}>
            <label style={labelStyle}>프로필 이미지</label>
            <img 
              src={picPreview || DEFAULT_AVATAR} 
              alt="프로필 미리보기" 
              style={previewImageStyle}
            />
            
            <label htmlFor="profilePic" style={fileInputLabelStyle}>
              이미지 선택하기
            </label>
            <input
              id="profilePic"
              type="file"
              accept="image/*"
              onChange={(e) => setPic(e.target.files[0])}
              style={hiddenFileInputStyle}
            />
            <div style={{ fontSize: 12, marginTop: 5, color: darkMode ? "#bbb" : "#666" }}>
              선택하지 않으면 기본 이미지가 사용됩니다
            </div>
          </div>
          
          <div style={formGroupStyle}>
            <label style={labelStyle}>자기소개</label>
            <textarea
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              placeholder="자신을 간단히 소개해보세요 (선택사항)"
              style={introTextareaStyle}
              maxLength={200}
            />
            <div style={{ fontSize: 12, textAlign: "right", color: darkMode ? "#aaa" : "#777" }}>
              {introduction.length}/200
            </div>
          </div>
          
          <div style={formGroupStyle}>
            <label style={labelStyle}>선호하는 음악 장르 (선택사항)</label>
            <div style={genreContainerStyle}>
              {genreOptions.map(genre => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  style={genreChipStyle(preferredGenres.includes(genre))}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
          
          <div style={formGroupStyle}>
            <div style={checkboxContainerStyle}>
              <input
                type="checkbox"
                id="partnerDone"
                checked={partnerDone}
                onChange={() => setPartnerDone(!partnerDone)}
                style={checkboxStyle}
              />
              <label htmlFor="partnerDone">
                듀엣 파트너를 찾고 있어요
              </label>
            </div>
          </div>
        </>
      )}
      
      {/* 버튼 영역 */}
      <div style={buttonContainerStyle}>
        {step > 1 ? (
          <button onClick={prevStep} style={currentSecondaryBtn}>
            이전
          </button>
        ) : (
          <button 
            onClick={() => nav("/login")} 
            style={currentSecondaryBtn}
          >
            로그인으로 돌아가기
          </button>
        )}
        
        <button 
          onClick={nextStep}
          style={{...currentPurpleBtn, opacity: loading ? 0.7 : 1}}
          disabled={loading}
        >
          {loading ? "처리 중..." : step < 2 ? "다음" : "가입하기"}
        </button>
      </div>
      
      {step === 1 && (
        <div style={{ marginTop: 20, textAlign: "center", fontSize: 14 }}>
          이미 계정이 있으신가요? <Link to="/login" style={linkStyle}>로그인하기</Link>
        </div>
      )}
    </div>
  );
}

export default Signup;
