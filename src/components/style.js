// src/components/style.js

// 기본 프로필 이미지
export const DEFAULT_AVATAR = "https://raw.githubusercontent.com/encharm/Font-Awesome-SVG-PNG/master/black/png/64/user-o.png";

// 색상 팔레트 (중앙 관리를 위한 변수 정의)
export const colors = {
  // 주요 색상
  primary: "#7e57c2",
  primaryDark: "#6a1b9a",
  primaryLight: "#9c68e6",
  
  // 보조 색상
  secondary: "#2196f3",
  secondaryDark: "#1565c0",
  secondaryLight: "#64b5f6",
  
  // 강조 색상
  accent: "#ff4081",
  accentDark: "#c2185b",
  accentLight: "#ff80ab",
  
  // 알림/경고 색상
  success: "#4caf50",
  warning: "#ff9800",
  error: "#f44336",
  info: "#2196f3",
  
  // 배경 색상
  lightBg: "#f5f0ff",
  darkBg: "#333",
  cardLightBg: "#f3e7ff",
  cardDarkBg: "#444",
  
  // 텍스트 색상
  textDark: "#333",
  textLight: "#fff",
  textMuted: "#666",
  textMutedDark: "#aaa",
  
 // 경계선 색상
  borderLight: "#b49ddb",
  borderDark: "#555",
};

// 애니메이션 및 전환 효과
export const transitions = {
  fast: "all 0.2s ease",
  medium: "all 0.3s ease",
  slow: "all 0.5s ease",
};

// 음영 효과
export const shadows = {
  small: "0 2px 4px rgba(0,0,0,0.1)",
  medium: "0 4px 8px rgba(0,0,0,0.1)",
  large: "0 8px 16px rgba(0,0,0,0.1)",
  focus: "0 0 0 3px rgba(126, 87, 194, 0.3)",
};

// 반응형 디자인을 위한 브레이크포인트
export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
};

// 미디어 쿼리 함수 추가 (styled-components용)
export const media = {
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  desktop: `@media (max-width: ${breakpoints.desktop}px)`,
};

// CSS-in-JS 라이브러리용 미디어 쿼리 도우미 함수
export const createMediaQuery = (maxWidth) => `@media (max-width: ${maxWidth}px)`;

// 테마별 변수 모음
export const lightTheme = {
  background: colors.lightBg,
  cardBackground: colors.cardLightBg,
  text: colors.textDark,
  textMuted: colors.textMuted,
  border: colors.borderLight,
};

export const darkTheme = {
  background: colors.darkBg,
  cardBackground: colors.cardDarkBg,
  text: colors.textLight,
  textMuted: colors.textMutedDark,
  border: colors.borderDark,
};

// 전역 스타일 상수
export const containerStyle = {
  padding: "20px",
  minHeight: "100vh",
  width: "100%",
  maxWidth: "100%",
  margin: "0 auto",
  boxSizing: "border-box",
  wordWrap: "break-word",
  overflowWrap: "break-word",
  // 모바일 반응형
  "@media (max-width: 768px)": {
    padding: "10px",
  }
};

export const darkContainerStyle = {
  ...containerStyle,
  backgroundColor: "#1a1a1a",
  color: "#e0e0e0"
};

// 전역 배경색 스타일
export const globalBackgroundStyle = {
  backgroundColor: "#f8f5ff", // 라이트 모드의 연한 보라색 배경
  minHeight: "100vh",
  transition: "background-color 0.3s ease",
};

export const darkGlobalBackgroundStyle = {
  ...globalBackgroundStyle,
  backgroundColor: "#1a1a2e", // 다크 모드의 진한 남색 배경
};

// 섹션 컨테이너 스타일
export const sectionContainerStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  borderRadius: "12px",
  padding: "20px",
  marginBottom: "20px",
  backdropFilter: "blur(8px)",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
  border: "1px solid rgba(126, 87, 194, 0.1)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  wordWrap: "break-word",
  overflowWrap: "break-word",
  // 모바일 반응형
  "@media (max-width: 768px)": {
    padding: "15px",
    marginBottom: "15px",
  }
};

export const darkSectionContainerStyle = {
  ...sectionContainerStyle,
  backgroundColor: "rgba(42, 42, 42, 0.8)",
  border: "1px solid rgba(126, 87, 194, 0.2)",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.2)",
};

// 카드 스타일
export const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "15px",
  marginBottom: "15px",
  boxShadow: "0 2px 4px rgba(126, 87, 194, 0.1)",
  border: "1px solid rgba(126, 87, 194, 0.1)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: "0 4px 8px rgba(126, 87, 194, 0.15)",
  },
};

export const darkCardStyle = {
  ...cardStyle,
  backgroundColor: "#2a2a2a",
  border: "1px solid rgba(126, 87, 194, 0.2)",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
  },
};

// 제목 스타일
export const titleStyle = {
  textAlign: "center",
  marginBottom: 20,
  color: colors.primary,
  fontSize: 24,
  fontWeight: "bold",
  transition: transitions.fast,
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.tablet)]: {
    fontSize: 22,
    marginBottom: 16,
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    fontSize: 20,
    marginBottom: 12,
  },
};

export const darkTitleStyle = {
  ...titleStyle,
  color: colors.primaryLight,
};

// 입력 필드 스타일
export const inputStyle = {
  width: "100%",
  maxWidth: "100%",
  padding: "12px 16px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "16px", // iOS에서 줌 방지
  outline: "none",
  transition: "border-color 0.2s ease",
  boxSizing: "border-box",
  wordWrap: "break-word",
  overflowWrap: "break-word",
  "&:focus": {
    borderColor: "#7e57c2",
    boxShadow: "0 0 0 2px rgba(126, 87, 194, 0.2)"
  },
  // 모바일 반응형
  "@media (max-width: 768px)": {
    padding: "10px 14px",
    fontSize: "16px", // iOS 줌 방지를 위해 16px 유지
  }
};

export const darkInputStyle = {
  ...inputStyle,
  backgroundColor: "#2a2a2a",
  color: "#e0e0e0",
  border: "1px solid #444",
  "&:focus": {
    borderColor: "#bb86fc",
    boxShadow: "0 0 0 2px rgba(187, 134, 252, 0.2)"
  }
};

// 텍스트 영역 스타일
export const textareaStyle = {
  ...inputStyle,
  minHeight: "120px",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: "1.5",
  // 모바일 반응형
  "@media (max-width: 768px)": {
    minHeight: "100px",
    padding: "10px 14px",
  }
};

export const darkTextareaStyle = {
  ...textareaStyle,
  ...darkInputStyle,
};

// 버튼 스타일
export const buttonBaseStyle = {
  padding: "12px 20px",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: "bold",
  transition: transitions.fast,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 16,
  outline: "none",
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.tablet)]: {
    padding: "10px 16px",
    fontSize: 15,
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: "8px 14px",
    fontSize: 14,
    borderRadius: 6,
    gap: 6,
  },
};

// 보라색 버튼 스타일
export const purpleBtn = {
  backgroundColor: "#7e57c2",
  color: "white",
  border: "none",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxSizing: "border-box",
  minHeight: "44px", // 모바일 터치 영역
  wordWrap: "break-word",
  overflowWrap: "break-word",
  "&:hover": {
    backgroundColor: "#6a4cac",
    transform: "translateY(-1px)"
  },
  // 모바일 반응형
  "@media (max-width: 768px)": {
    padding: "10px 20px",
    fontSize: "14px",
  }
};

export const darkPurpleBtn = {
  ...purpleBtn,
  background: `${colors.primary}dd`,
  boxShadow: "none",
  "&:hover": {
    background: colors.primary,
  },
};

// 작은 버튼 스타일
export const smallBtn = {
  backgroundColor: "#7e57c2",
  color: "white",
  border: "none",
  padding: "8px 16px",
  borderRadius: "4px",
  fontSize: "14px",
  cursor: "pointer",
  transition: "all 0.2s ease",
  boxSizing: "border-box",
  minHeight: "40px", // 모바일 터치 영역
  wordWrap: "break-word",
  overflowWrap: "break-word",
  "&:hover": {
    backgroundColor: "#6a4cac"
  },
  // 모바일 반응형
  "@media (max-width: 768px)": {
    padding: "6px 12px",
    fontSize: "12px",
  }
};

export const darkSmallBtn = {
  ...smallBtn,
  background: `${colors.primary}dd`,
};

// 위험 작업용 버튼 (빨간색)
export const dangerBtn = {
  ...buttonBaseStyle,
  background: colors.error,
  color: colors.textLight,
};

export const darkDangerBtn = {
  ...dangerBtn,
  background: `${colors.error}dd`,
};

// 보조 버튼 (회색)
export const secondaryBtn = {
  ...buttonBaseStyle,
  background: "#eee",
  color: colors.textDark,
};

export const darkSecondaryBtn = {
  ...secondaryBtn,
  background: "#555",
  color: colors.textLight,
};

// 메뉴 스타일
export const menuStyle = {
  background: "#fff",
  padding: "16px 20px",
  borderRadius: 10,
  fontWeight: "bold",
  fontSize: 16,
  color: colors.textDark,
  textDecoration: "none",
  boxShadow: shadows.medium,
  minWidth: 140,
  textAlign: "center",
  transition: transitions.medium,
  cursor: "pointer",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: shadows.large,
  },
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.tablet)]: {
    padding: "12px 16px",
    fontSize: 15,
    minWidth: 120,
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: "10px 14px",
    fontSize: 14,
    minWidth: 100,
    boxShadow: shadows.small,
    borderRadius: 8,
    "&:hover": {
      transform: "none",
      boxShadow: shadows.small,
    },
  },
};

export const darkMenuStyle = {
  ...menuStyle,
  background: colors.cardDarkBg,
  color: colors.textLight,
  boxShadow: `0 4px 8px rgba(0,0,0,0.3)`,
};

// 뱃지 스타일
export const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 8px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: "bold",
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.mobile)]: {
    padding: "2px 6px",
    fontSize: 11,
    borderRadius: 10,
  },
};

export const primaryBadge = {
  ...badgeStyle,
  background: `${colors.primary}33`,
  color: colors.primary,
};

export const darkPrimaryBadge = {
  ...primaryBadge,
  background: `${colors.primary}22`,
  color: colors.primaryLight,
};

// 알림용 스타일
export const alertStyle = {
  padding: 16,
  borderRadius: 8,
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 12,
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.tablet)]: {
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: 10,
    gap: 8,
    marginBottom: 10,
    borderRadius: 6,
    flexDirection: "column",
    alignItems: "flex-start",
  },
};

export const successAlert = {
  ...alertStyle,
  background: `${colors.success}22`,
  color: colors.success,
  border: `1px solid ${colors.success}44`,
};

export const errorAlert = {
  ...alertStyle,
  background: `${colors.error}22`,
  color: colors.error,
  border: `1px solid ${colors.error}44`,
};

export const warningAlert = {
  ...alertStyle,
  background: `${colors.warning}22`,
  color: colors.warning,
  border: `1px solid ${colors.warning}44`,
};

export const infoAlert = {
  ...alertStyle,
  background: `${colors.info}22`,
  color: colors.info,
  border: `1px solid ${colors.info}44`,
};

// 모달 스타일
export const modalOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

export const modalContentStyle = {
  background: colors.lightBg,
  padding: 24,
  borderRadius: 12,
  maxWidth: 500,
  width: "90%",
  boxShadow: shadows.large,
  
  // 모바일 최적화 추가
  [createMediaQuery(breakpoints.tablet)]: {
    padding: 20,
    width: "95%",
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: 16,
    borderRadius: 10,
    width: "95%",
    maxWidth: "calc(100% - 20px)",
  },
};

export const darkModalContentStyle = {
  ...modalContentStyle,
  background: colors.darkBg,
  color: colors.textLight,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

// 게시판 및 목록 스타일 (모바일 최적화를 위해 추가)
export const boardContainerStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "20px",
  marginBottom: "40px",
  
  // 모바일 최적화
  [createMediaQuery(breakpoints.tablet)]: {
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
    marginBottom: "30px",
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    gridTemplateColumns: "1fr",
    gap: "10px",
    marginBottom: "20px",
  },
};

export const boardSectionStyle = {
  background: colors.cardLightBg,
  borderRadius: "12px",
  padding: "20px",
  boxShadow: shadows.small,
  
  // 모바일 최적화
  [createMediaQuery(breakpoints.tablet)]: {
    padding: "15px",
    borderRadius: "10px",
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: "12px",
    borderRadius: "8px",
  },
};

// 헤더 스타일 (모바일 최적화를 위해 추가)
export const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "15px 20px",
  backgroundColor: "#fff",
  boxShadow: shadows.small,
  
  // 모바일 최적화
  [createMediaQuery(breakpoints.tablet)]: {
    padding: "12px 15px",
  },
  
  [createMediaQuery(breakpoints.mobile)]: {
    padding: "10px 12px",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "10px",
  },
};

export const headerMenuStyle = {
  display: "flex",
  gap: "20px",
  alignItems: "center",
  
  // 모바일 최적화
  [createMediaQuery(breakpoints.mobile)]: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "10px",
    width: "100%",
  },
};

// 유틸리티 함수
export const getThemeStyles = (isDarkMode) => ({
  container: isDarkMode ? darkContainerStyle : containerStyle,
  card: isDarkMode ? darkCardStyle : cardStyle,
  title: isDarkMode ? darkTitleStyle : titleStyle,
  input: isDarkMode ? darkInputStyle : inputStyle,
  textarea: isDarkMode ? darkTextareaStyle : textareaStyle,
  button: {
    primary: isDarkMode ? darkPurpleBtn : purpleBtn,
    small: isDarkMode ? darkSmallBtn : smallBtn,
    danger: isDarkMode ? darkDangerBtn : dangerBtn,
    secondary: isDarkMode ? darkSecondaryBtn : secondaryBtn,
  },
  menu: isDarkMode ? darkMenuStyle : menuStyle,
  badge: {
    primary: isDarkMode ? darkPrimaryBadge : primaryBadge,
  },
  modal: {
    overlay: modalOverlayStyle,
    content: isDarkMode ? darkModalContentStyle : modalContentStyle,
  },
  board: {
    container: boardContainerStyle,
    section: boardSectionStyle,
  },
  header: {
    container: headerStyle,
    menu: headerMenuStyle,
  },
  colors: colors,
  theme: isDarkMode ? darkTheme : lightTheme,
  media: media, // 미디어 쿼리 추가
});
