// Login.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { collection, getDocs } from "firebase/firestore";
import sha256 from "crypto-js/sha256";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "./style";

function Login({ darkMode }) {
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const nav = useNavigate();

  const onLogin = async () => {
    if (!nick || !pw) return alert("닉네임과 비밀번호를 입력하세요");
    const snap = await getDocs(collection(db, "users"));
    const ok = snap.docs.some(d => {
      const u = d.data();
      return u.nickname === nick && u.password === sha256(pw).toString();
    });
    if (ok) {
      localStorage.setItem("nickname", nick);
      window.location.href = "/";
    } else alert("로그인 실패");
  };

  const onKey = e => e.key === "Enter" && onLogin();

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>로그인</h1>
      <input
        value={nick}
        onChange={e => setNick(e.target.value)}
        onKeyDown={onKey}
        placeholder="닉네임"
        style={darkMode ? darkInputStyle : inputStyle}
      />
      <input
        type="password"
        value={pw}
        onChange={e => setPw(e.target.value)}
        onKeyDown={onKey}
        placeholder="비밀번호"
        style={darkMode ? darkInputStyle : inputStyle}
      />
      <button onClick={onLogin} style={purpleBtn}>로그인</button>
      <button onClick={() => nav("/signup")} style={purpleBtn}>회원가입</button>
    </div>
  );
}

Login.propTypes = {
  darkMode: PropTypes.bool
};

Login.defaultProps = {
  darkMode: false
};

export default Login;
