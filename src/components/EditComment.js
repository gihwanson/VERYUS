// EditComment.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "./style";

function EditComment({ darkMode }) {
  const { type, postId, commentId } = useParams();
  const nav = useNavigate();
  const nick = localStorage.getItem("nickname");
  const [text, setText] = useState("");
  const [priv, setPriv] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, `${type}-${postId}-comments`));
      const f = snap.docs.find(d => d.id === commentId);
      if (!f) return;
      if (f.data().nickname !== nick) {
        alert("본인 댓글만 수정 가능합니다");
        nav(`/post/${type}/${postId}`);
        return;
      }
      setText(f.data().text);
      setPriv(f.data().isPrivate);
    })();
  }, [type, postId, commentId, nick, nav]);

  const save = async () => {
    if (!text.trim()) return alert("내용을 입력하세요");
    await updateDoc(doc(db, `${type}-${postId}-comments`, commentId), {
      text, isPrivate: priv
    });
    alert("수정되었습니다");
    nav(`/post/${type}/${postId}`);
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>댓글 수정</h1>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        style={darkMode ? darkInputStyle : textareaStyle}
        placeholder="수정할 댓글"
      />
      <label>
        <input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} />
        비밀댓글
      </label>
      <button onClick={save} style={purpleBtn}>저장</button>
    </div>
  );
}

EditComment.propTypes = {
  darkMode: PropTypes.bool
};

EditComment.defaultProps = {
  darkMode: false
};

export default EditComment;
