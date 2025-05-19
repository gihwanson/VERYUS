// EditNickname.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs, query, where, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

function EditNickname({ darkMode }) {
  const [next, setNext] = useState("");
  const old = localStorage.getItem("nickname");
  const nav = useNavigate();

  const save = async () => {
    if (!next.trim()) return alert("새 닉네임을 입력하세요");
    const dupSnap = await getDocs(collection(db, "users"));
    if (dupSnap.docs.some(d => d.data().nickname === next)) return alert("이미 사용 중인 닉네임입니다");
    const q = query(collection(db, "users"), where("nickname", "==", old));
    const ss = await getDocs(q);
    if (ss.empty) return;
    await updateDoc(doc(db, "users", ss.docs[0].id), { nickname: next });
    localStorage.setItem("nickname", next);
    alert("변경되었습니다");
    nav("/");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>닉네임 변경</h1>
      <input 
        value={next} 
        onChange={e => setNext(e.target.value)} 
        placeholder="새 닉네임" 
        style={darkMode ? darkInputStyle : inputStyle}
      />
      <button onClick={save} style={purpleBtn}>변경</button>
    </div>
  );
}

EditNickname.propTypes = {
  darkMode: PropTypes.bool
};

EditNickname.defaultProps = {
  darkMode: false
};

export default EditNickname;