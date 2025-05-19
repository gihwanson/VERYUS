// EditPassword.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import sha256 from "crypto-js/sha256";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

function EditPassword({ darkMode }) {
  const [pw, setPw] = useState("");
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();

  const save = async () => {
    if (pw.length < 6) return alert("비밀번호는 6자 이상");
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const ss = await getDocs(q);
    if (ss.empty) return;
    await updateDoc(doc(db, "users", ss.docs[0].id), { password: sha256(pw).toString() });
    alert("변경되었습니다");
    nav("/");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>비밀번호 변경</h1>
      <input 
        type="password" 
        value={pw} 
        onChange={e => setPw(e.target.value)} 
        placeholder="새 비밀번호(6자↑)" 
        style={darkMode ? darkInputStyle : inputStyle}
      />
      <button onClick={save} style={purpleBtn}>변경</button>
    </div>
  );
}

EditPassword.propTypes = {
  darkMode: PropTypes.bool
};

EditPassword.defaultProps = {
  darkMode: false
};

export default EditPassword;