import React from "react";
import { useNavigate } from "react-router-dom";
import DEFAULT_AVATAR from "../assets/default-avatar.png"; // 기본 프로필 이미지 경로
import {
    containerStyle,
    darkContainerStyle,
    titleStyle,
    purpleBtn
  } from "../components/style";

function MyPage({ darkMode, globalProfilePics, globalIntroductions, globalGrades }) {
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();

  // ✅ 이모지 → 등급명 매핑
  const gradeNames = {
    "🍒": "체리",
    "🫐": "블루베리",
    "🥝": "키위",
    "🍎": "사과",
    "🍈": "멜론",
    "🍉": "수박",
    "🌏": "지구",
    "🪐": "토성",
    "🌞": "태양",
    "🌌": "은하",
  };

  const gradeEmoji = globalGrades[nick];
  const gradeName = gradeNames[gradeEmoji];

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>{nick}님의 마이페이지</h1>
      <img
        src={globalProfilePics[nick] || DEFAULT_AVATAR}
        alt="프로필"
        style={{
          width: 150,
          height: 150,
          objectFit: "cover",
          display: "block",
          margin: "0 auto 20px",
          border: "1px solid #999"
        }}
      />
      <p><strong>자기소개:</strong> {globalIntroductions[nick] || "작성된 자기소개가 없습니다"}</p>
      <p><strong>등급:</strong> {gradeEmoji ? `${gradeName} ${gradeEmoji}` : "미입력"}</p>

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        <button onClick={() => nav("/edit-profilepic")} style={purpleBtn}>프로필사진 변경</button>
        <button onClick={() => nav(`/guestbook/${nick}`)} style={purpleBtn}>📖 내 방명록</button>
        <button onClick={() => nav("/edit-introduction")} style={purpleBtn}>자기소개 수정</button>
        <button onClick={() => nav("/edit-grade")} style={purpleBtn}>등급 수정</button>
        <button onClick={() => nav("/edit-nickname")} style={purpleBtn}>닉네임 변경</button>
        <button onClick={() => nav("/edit-password")} style={purpleBtn}>비밀번호 변경</button>
        <button onClick={() => nav("/popular")} style={purpleBtn}>🔥 인기글</button>
        <button onClick={() => nav("/notification")} style={purpleBtn}>🔔 알림</button>
        <button onClick={() => nav("/delete-account")} style={{ ...purpleBtn, background: "red" }}>회원 탈퇴</button>
      </div>
    </div>
  );
}

// 💡 스타일 변수들은 기존처럼 전역 또는 상단에서 import되었다고 가정
export default MyPage;
