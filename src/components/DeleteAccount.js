// DeleteAccount.js
import React from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn
} from "../components/style";

function DeleteAccount({ darkMode }) {
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();

  const bye = async () => {
    if (!window.confirm("정말 탈퇴하시겠습니까?")) return;
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const ss = await getDocs(q);
    if (ss.empty) return;
    await deleteDoc(doc(db, "users", ss.docs[0].id));
    localStorage.removeItem("nickname");
    alert("탈퇴되었습니다");
    nav("/signup");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🚫 회원 탈퇴</h1>
      <p style={{ textAlign: "center" }}>탈퇴 시 모든 데이터가 삭제됩니다</p>
      <button onClick={bye} style={{ ...purpleBtn, background: "red" }}>회원 탈퇴하기</button>
    </div>
  );
}

DeleteAccount.propTypes = {
  darkMode: PropTypes.bool
};

DeleteAccount.defaultProps = {
  darkMode: false
};

export default DeleteAccount;
