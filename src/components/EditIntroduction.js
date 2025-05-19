// EditIntroduction.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function EditIntroduction({ darkMode }) {
  const [intro, setIntro] = useState("");
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();

  const save = async () => {
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const ss = await getDocs(q);
    if (ss.empty) return alert("사용자 정보가 없습니다");
    await updateDoc(doc(db, "users", ss.docs[0].id), { introduction: intro });
    alert("저장되었습니다");
    nav("/mypage");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>자기소개 수정</h1>
      <textarea
        value={intro}
        onChange={e => setIntro(e.target.value)}
        placeholder="자기소개"
        style={darkMode ? darkInputStyle : textareaStyle}
      />
      <button onClick={save} style={purpleBtn}>저장</button>
    </div>
  );
}

EditIntroduction.propTypes = {
  darkMode: PropTypes.bool
};

EditIntroduction.defaultProps = {
  darkMode: false
};

export default EditIntroduction;