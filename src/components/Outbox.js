// Outbox.js
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function Outbox({ darkMode }) {
  const [msgs, setMsgs] = useState([]);
  const me = localStorage.getItem("nickname");

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => {
      setMsgs(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.senderNickname === me)
      );
    });
  }, [me]);

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>✉️ 보낸 쪽지함</h1>
      {msgs.length === 0
        ? <p>쪽지가 없습니다</p>
        : msgs.map(m => (
          <div key={m.id} style={{
            margin: "12px 0",
            padding: 14,
            borderRadius: 12,
            background: "#f3e7ff", // 💜 연보라 배경
            border: "1px solid #b49ddb",
            color: "#000"
          }}>
            <p><strong>받는 사람:</strong> {m.receiverNickname || "알 수 없음"}</p>
            <p>{m.content}</p>
            <p style={{ fontSize: 12, color: darkMode ? "#ccc" : "#666" }}>
              {new Date(m.createdAt.seconds * 1000).toLocaleString()}
            </p>
          </div>
        ))}
    </div>
  );
}

Outbox.propTypes = {
  darkMode: PropTypes.bool
};

Outbox.defaultProps = {
  darkMode: false
};

export default Outbox;
