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

// 컨테이너 스타일
export const containerStyle = {
  maxWidth: 800,
  margin: "40px auto",
  padding: 20,
  borderRadius: 16,
  background: colors.lightBg,
  boxShadow: shadows.small,
  transition: transitions.medium,
};

export const darkContainerStyle = {
  ...containerStyle,
  background: colors.darkBg,
  color: colors.textLight,
  boxShadow: "none",
  border: `1px solid ${colors.borderDark}`,
};

// 카드 스타일 (게시글, 댓글 등)
export const cardStyle = {
  padding: 16,
  borderRadius: 12,
  background: colors.cardLightBg,
  border: `1px solid ${colors.borderLight}`,
  marginBottom: 16,
  boxShadow: shadows.small,
  transition: transitions.medium,
};

export const darkCardStyle = {
  ...cardStyle,
  background: colors.cardDarkBg,
  border: `1px solid ${colors.borderDark}`,
  color: colors.textLight,
};

// 제목 스타일
export const titleStyle = {
  textAlign: "center",
  marginBottom: 20,
  color: colors.primary,
  fontSize: 24,
  fontWeight: "bold",
  transition: transitions.fast,
};

export const darkTitleStyle = {
  ...titleStyle,
  color: colors.primaryLight,
};

// 입력 필드 스타일
export const inputStyle = {
  width: "100%",
  padding: "12px 16px",
  marginBottom: 16,
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 16,
  transition: transitions.fast,
  outline: "none",
  boxSizing: "border-box",
};

export const darkInputStyle = {
  ...inputStyle,
  background: "#444",
  color: colors.textLight,
  border: `1px solid ${colors.borderDark}`,
};

// 텍스트 영역 스타일
export const textareaStyle = {
  ...inputStyle,
  height: 120,
  resize: "vertical",
  lineHeight: 1.5,
  fontFamily: "inherit",
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
};

// 주요 버튼 (퍼플 컬러)
export const purpleBtn = {
  ...buttonBaseStyle,
  width: "100%",
  background: colors.primary,
  color: colors.textLight,
  boxShadow: shadows.small,
  "&:hover": {
    background: colors.primaryDark,
    transform: "translateY(-2px)",
    boxShadow: shadows.medium,
  },
  "&:active": {
    transform: "translateY(0)",
  },
  "&:disabled": {
    opacity: 0.7,
    cursor: "not-allowed",
  },
};

export const darkPurpleBtn = {
  ...purpleBtn,
  background: `${colors.primary}dd`,
  boxShadow: "none",
  "&:hover": {
    background: colors.primary,
  },
};

// 작은 버튼
export const smallBtn = {
  ...buttonBaseStyle,
  padding: "6px 12px",
  fontSize: 14,
  borderRadius: 6,
  background: colors.primary,
  color: colors.textLight,
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
};

export const darkModalContentStyle = {
  ...modalContentStyle,
  background: colors.darkBg,
  color: colors.textLight,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
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
  colors: colors,
  theme: isDarkMode ? darkTheme : lightTheme,
});
