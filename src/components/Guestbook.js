// Guestbook.js
import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function Guestbook({ darkMode }) {
  const { owner } = useParams(); // 방명록 주인
  const [entries, setEntries] = useState([]);
  const [msg, setMsg] = useState("");
  const [secret, setSecret] = useState(false);
  const me = localStorage.getItem("nickname");

  useEffect(() => {
    const q = collection(db, `guestbook-${owner}`);
    return onSnapshot(q, s =>
      setEntries(
        s.docs
          .map((d, i) => ({ id: d.id, no: i + 1, ...d.data() }))
          .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
      )
    );
  }, [owner]);

  const add = async () => {
    if (!msg.trim()) return;
    await addDoc(collection(db, `guestbook-${owner}`), {
      writer: me,
      text: msg,
      isSecret: secret,
      createdAt: Timestamp.now()
    });
    setMsg("");
    setSecret(false);
  };

  const deleteEntry = async (entryId) => {
    if (!window.confirm("정말 이 글을 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, `guestbook-${owner}`, entryId));
    alert("삭제되었습니다");
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📖 {owner}님의 방명록</h1>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="메시지"
        style={darkMode ? darkInputStyle : textareaStyle}
      />
      <label>
        <input
          type="checkbox"
          checked={secret}
          onChange={e => setSecret(e.target.checked)}
        /> 비밀글
      </label>
      <button onClick={add} style={{ ...purpleBtn, marginTop: 10 }}>등록</button>
      <hr />
      {entries.length === 0 ? (
        <p>아직 글이 없습니다</p>
      ) : (
        entries.map(e => {
          const canView = !e.isSecret || e.writer === me || owner === me;
          return (
            <div key={e.id} style={{
              margin: "20px 0",
              border: "1px solid #ccc",
              borderRadius: 10,
              padding: 10,
              background: darkMode ? "#333" : "#fdfdfd"
            }}>
              {/* 상단 정보 */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                fontSize: 14,
                fontWeight: "bold",
                background: darkMode ? "#444" : "#f0f0f0",
                padding: "6px 10px",
                borderRadius: 6
              }}>
                <span> {e.writer} ({new Date(e.createdAt.seconds * 1000).toLocaleString()})</span>
                {e.writer === me && (
                  <div>
                    <button 
                      onClick={() => deleteEntry(e.id)} 
                      style={{ background: "red", color: "white", border: "none" }}
                    >
                      삭제
                    </button>
                    {/* 수정 버튼 추가 */}
                    <Link 
                      to={`/edit-entry/${e.id}`} 
                      style={{ color: "#888", marginLeft: "10px" }}
                    >
                      수정
                    </Link>
                  </div>
                )}
              </div>

              {/* 비밀글 표시 */}
              {e.isSecret && (
                <div style={{ color: "#e67e22", fontSize: 13, marginBottom: 10 }}>
                  🔒 비밀이야 (이 글은 홈주인과 작성자만 볼 수 있어요)
                </div>
              )}

              {/* 본문 */}
              <div style={{ textAlign: "center", fontSize: 16 }}>
                {canView ? (e.isSecret ? "🔒 " : "") + e.text : <i style={{ color: "#888" }}>🔒 비밀글입니다</i>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

Guestbook.propTypes = {
  darkMode: PropTypes.bool
};

Guestbook.defaultProps = {
  darkMode: false
};

export default Guestbook;
