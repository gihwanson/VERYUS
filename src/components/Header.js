import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import logo from "../assets/logo.png";
import defaultAvatar from "../assets/default-avatar.png";

function Header({ dark, toggleDark, nick, grades, unread, logout, purpleBtn, globalProfilePics, notiCount, role }) {
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    borderRadius: "6px",
    transition: "background 0.2s",
    color: "#000",
    fontSize: "14px"
  };

  const handleNavigate = (path) => {
    navigate(path);
    setShowMenu(false);
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 20px",
      flexWrap: "wrap",
      position: "relative"
    }}>
      {/* 왼쪽: 로고 */}
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src={logo} alt="Veryus 로고" style={{ height: 130 }} />
        <span style={{ fontWeight: "bold", fontSize: 20, color: "#7e57c2" }}></span>
      </Link>

      {/* 오른쪽: 프로필 이미지 + 알림 */}
      {nick && (
        <div style={{ position: "relative" }}>
          <img
            src={globalProfilePics[nick] || defaultAvatar}
            alt="프로필"
            onClick={() => setShowMenu(x => !x)}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              objectFit: "cover",
              cursor: "pointer",
              border: "2px solid #7e57c2"
            }}
          />

          {/* 🔴 알림 빨간풍선 */}
          {notiCount > 0 && (
            <div style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "red",
              color: "white",
              fontSize: 10,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              {notiCount}
            </div>
          )}

          {/* 드롭다운 메뉴 */}
          {showMenu && (
            <div style={{
              position: "absolute",
              top: 50,
              right: 0,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 10,
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
              padding: 10,
              zIndex: 999,
              minWidth: 180
            }}>
              <div onClick={() => handleNavigate("/mypage")} style={menuItemStyle}>👤 마이페이지</div>
              <div onClick={() => handleNavigate("/inbox")} style={menuItemStyle}>📬 받은쪽지함</div>
              <div onClick={() => handleNavigate("/outbox")} style={menuItemStyle}>📤 보낸쪽지함</div>
              <div onClick={() => { toggleDark(); setShowMenu(false); }} style={menuItemStyle}>🌓 {dark ? "라이트모드" : "다크모드"}</div>
              <div onClick={() => handleNavigate(`/guestbook/${nick}`)} style={menuItemStyle}>📖 내 방명록</div>
              <div onClick={() => handleNavigate("/notification")} style={menuItemStyle}>🔔 알림</div>
              <div onClick={() => handleNavigate("/evaluate")} style={menuItemStyle}>📝 등급 평가</div>

              {(nick === "너래") && (
                <div onClick={() => handleNavigate("/admin-eval")} style={menuItemStyle}>👑 평가 결과</div>
              )}

              {(role === "운영진" || role === "리더" || nick === "너래") && (
                <div onClick={() => handleNavigate("/admin-user")} style={menuItemStyle}>👥 관리자메뉴</div>
              )}

              <div onClick={() => { logout(); setShowMenu(false); }} style={{ ...menuItemStyle, color: "red" }}>🚪 로그아웃</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Header;
