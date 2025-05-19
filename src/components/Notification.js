// Notification.js
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function Notification({ darkMode }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🔔 알림 목록</h1>
      {list.length === 0
        ? <p>등록된 알림이 없습니다</p>
        : list.map(n => (
          <div key={n.id} style={{
            margin: "10px 0", padding: 10, borderRadius: 8,
            background: darkMode ? "#444" : "#eee"
          }}>
            <p>{n.message}</p>
            <p style={{ fontSize: 12, color: darkMode ? "#aaa" : "#666" }}>
              {new Date(n.createdAt.seconds * 1000).toLocaleString()}
            </p>
          </div>
        ))}
    </div>
  );
}

Notification.propTypes = {
  darkMode: PropTypes.bool
};

Notification.defaultProps = {
  darkMode: false
};

export default Notification;