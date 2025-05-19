// EditGrade.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

// gradeEmojis 객체
const gradeEmojis = {
  "체리": "🍒",
  "블루베리": "🫐",
  "키위": "🥝",
  "사과": "🍎",
  "멜론": "🍈",
  "수박": "🍉",
  "지구": "🌏",
  "토성": "🪐",
  "태양": "🌞"
};

function EditGrade({ darkMode }) {
  const [grade, setGrade] = useState("");
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();

  const save = async () => {
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const ss = await getDocs(q);
    if (ss.empty) return alert("사용자 정보가 없습니다");
    await updateDoc(doc(db, "users", ss.docs[0].id), { grade });
    alert("저장되었습니다");
    nav("/mypage");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>등급 수정</h1>
      <select 
        value={grade} 
        onChange={e => setGrade(e.target.value)} 
        style={darkMode ? darkInputStyle : inputStyle}
      >
        <option value="">선택하세요</option>
        {Object.keys(gradeEmojis).map(k =>
          <option key={k} value={k}>{gradeEmojis[k]} {k}</option>
        )}
      </select>
      <button onClick={save} style={purpleBtn}>저장</button>
    </div>
  );
}

EditGrade.propTypes = {
  darkMode: PropTypes.bool
};

EditGrade.defaultProps = {
  darkMode: false
};

export default EditGrade;