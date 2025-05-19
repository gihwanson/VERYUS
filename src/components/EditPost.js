// EditPost.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, textareaStyle, purpleBtn
} from "./style";

function EditPost({ darkMode }) {
  const { type, id } = useParams();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const nick = localStorage.getItem("nickname");

  useEffect(() => {
    (async () => {
      const coll = type === "post" ? "posts" : "freeposts";
      const snap = await getDocs(collection(db, coll));
      const f = snap.docs.find(d => d.id === id);
      if (!f) return;
      if (f.data().nickname !== nick) {
        alert("본인 글만 수정 가능합니다");
        nav("/");
        return;
      }
      setTitle(f.data().title);
      setContent(f.data().content);
    })();
  }, [type, id, nick, nav]);

  const save = async () => {
    if (!title.trim() || !content.trim()) return alert("제목과 내용을 입력해주세요");
    await updateDoc(doc(db, type === "post" ? "posts" : "freeposts", id), {
      title, content
    });
    alert("수정되었습니다");
    nav(`/post/${type}/${id}`);
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>✏️ 글 수정</h1>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={darkMode ? darkInputStyle : inputStyle}
        placeholder="제목"
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        style={darkMode ? darkInputStyle : textareaStyle}
        placeholder="내용"
      />
      <button onClick={save} style={purpleBtn}>저장</button>
    </div>
  );
}

EditPost.propTypes = {
  darkMode: PropTypes.bool
};

EditPost.defaultProps = {
  darkMode: false
};

export default EditPost;
