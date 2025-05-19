import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { db, storage } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn
} from "../components/style";

function EditProfilePic({ darkMode }) {
  const [file, setFile] = useState(null);
  const [prev, setPrev] = useState(null);
  const nav = useNavigate();
  const nick = localStorage.getItem("nickname");

  const onFile = e => {
    const f = e.target.files[0];
    setFile(f);
    if (f) {
      const fr = new FileReader();
      fr.onloadend = () => setPrev(fr.result);
      fr.readAsDataURL(f);
    } else setPrev(null);
  };

  const save = async () => {
    if (!file) return alert("이미지를 선택하세요");
    const r = ref(storage, `profiles/${uuidv4()}_${file.name}`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const ss = await getDocs(q);
    if (ss.empty) return alert("사용자 정보를 찾을 수 없습니다");
    await updateDoc(doc(db, "users", ss.docs[0].id), { profilePicUrl: url });
    alert("변경되었습니다");
    nav("/mypage");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>프로필사진 변경</h1>
      <input type="file" accept="image/*" onChange={onFile} />
      {prev && <img src={prev} alt="" style={{
        width: 120, height: 120, border: "1px solid #999",
        objectFit: "cover", marginTop: 10
      }} />}
      <button onClick={save} style={purpleBtn}>저장</button>
    </div>
  );
}

EditProfilePic.propTypes = {
  darkMode: PropTypes.bool
};

EditProfilePic.defaultProps = {
  darkMode: false
};

export default EditProfilePic;