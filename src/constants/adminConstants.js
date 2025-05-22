export const USERS_PER_PAGE = 10;

export const GRADES = [
  { value: "🍒", label: "🍒 체리", level: 1 },
  { value: "🫐", label: "🫐 블루베리", level: 2 },
  { value: "🥝", label: "🥝 키위", level: 3 },
  { value: "🍎", label: "🍎 사과", level: 4 },
  { value: "🍈", label: "🍈 멜론", level: 5 },
  { value: "🍉", label: "🍉 수박", level: 6 },
  { value: "🌏", label: "🌏 지구", level: 7 },
  { value: "🪐", label: "🪐 토성", level: 8 },
  { value: "🌞", label: "🌞 태양", level: 9 },
  { value: "🌌", label: "🌌 은하", level: 10 }
];

export const ROLES = [
  { value: "일반", label: "일반", level: 1 },
  { value: "조장", label: "조장", level: 2 },
  { value: "부운영진", label: "부운영진", level: 3 },
  { value: "운영진", label: "운영진", level: 4 },
  { value: "리더", label: "리더", level: 5 }
];

export const ACTIVITY_TYPES = {
  LOGIN: "로그인",
  SIGNUP: "회원가입",
  POST: "게시글 작성",
  COMMENT: "댓글 작성",
  DELETE: "게시글 삭제",
  UPDATE: "정보 수정",
  ADMIN_ACTION: "관리자 조치"
};

export const FILTER_OPTIONS = [
  { value: "all", label: "전체 사용자" },
  { value: "admin", label: "관리자" },
  { value: "recent", label: "최근 가입" }
];

export const SORT_OPTIONS = [
  { value: "nickname", label: "닉네임" },
  { value: "grade", label: "등급" },
  { value: "role", label: "직책" },
  { value: "createdAt", label: "가입일" }
];

export const BULK_ACTIONS = [
  { value: "grade", label: "등급 변경" },
  { value: "role", label: "직책 변경" },
  { value: "delete", label: "삭제" }
]; 