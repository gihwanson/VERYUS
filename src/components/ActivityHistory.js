import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, getDocs, doc, setDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  purpleBtn, smallBtn
} from "../components/style";

function ActivityHistory({ darkMode }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const nick = localStorage.getItem("nickname");
  const isAdmin = nick === "너래";

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "meta"));
        const document = snap.docs.find(d => d.id === "history");
        if (document) {
          const data = document.data();
          setText(data.text || "");
          setInputText(data.text || "");
        }
      } catch (error) {
        console.error("활동 이력을 불러오는 중 오류 발생:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const save = async () => {
    if (!isAdmin) return alert("관리자만 수정할 수 있습니다");
    
    try {
      setLoading(true);
      const timestamp = Timestamp.now();
      
      // 메인 문서 업데이트
      await setDoc(doc(db, "meta", "history"), { 
        text: inputText,
        lastUpdated: timestamp 
      });
      
      setText(inputText);
      setEditing(false);
      alert("저장되었습니다");
    } catch (error) {
      console.error("저장 중 오류 발생:", error);
      alert("저장 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    maxWidth: 800,
    margin: "40px auto",
    padding: 24,
    background: darkMode ? "#333" : "#f3e7ff",
    borderRadius: 16,
    border: `1px solid ${darkMode ? "#555" : "#b49ddb"}`,
    color: darkMode ? "#fff" : "#000",
    lineHeight: 1.8
  };

  const titleStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    textAlign: "center"
  };

  const textareaStyle = {
    width: "100%",
    height: 300,
    marginTop: 10,
    lineHeight: 1.6,
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
    background: darkMode ? "#222" : "#fff",
    color: darkMode ? "#fff" : "#000"
  };

  const preStyle = {
    whiteSpace: "pre-wrap",
    marginTop: 10,
    padding: 15,
    background: darkMode ? "#222" : "#fff",
    borderRadius: 8,
    color: darkMode ? "#fff" : "#000"
  };

  const buttonStyle = {
    ...smallBtn,
    marginTop: 10,
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: darkMode ? "#000" : "#fff"
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>📖 베리어스 활동이력</h2>
      
      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}>데이터를 불러오는 중...</div>
      ) : editing ? (
        <>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            style={textareaStyle}
          />
          
          <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
            <button 
              onClick={save} 
              style={{
                ...purpleBtn,
                marginTop: 10,
                background: darkMode ? "#bb86fc" : "#7e57c2",
                color: darkMode ? "#000" : "#fff"
              }}
              disabled={loading}
            >
              저장하기
            </button>
            
            <button 
              onClick={() => setEditing(false)} 
              style={{
                ...smallBtn,
                marginTop: 10,
                background: darkMode ? "#444" : "#eee",
                color: darkMode ? "#fff" : "#333"
              }}
            >
              취소
            </button>
          </div>
        </>
      ) : (
        <>
          <pre style={preStyle}>
            {text || "활동이력이 없습니다."}
          </pre>
          
          {isAdmin && (
            <button onClick={() => setEditing(true)} style={buttonStyle}>
              ✏️ 수정
            </button>
          )}
        </>
      )}
    </div>
  );
}

ActivityHistory.propTypes = {
  darkMode: PropTypes.bool
};

ActivityHistory.defaultProps = {
  darkMode: false
};

export default ActivityHistory;
