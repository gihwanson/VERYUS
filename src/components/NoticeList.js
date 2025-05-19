import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import {
  collection, query, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function NoticeList({ darkMode }) {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => {
      setNotices(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📢 공지사항</h1>
      {notices.length === 0
        ? <p>공지사항이 없습니다</p>
        : notices.map(n => (
          <div key={n.id} style={{
            margin: "12px 0",
            padding: 14,
            borderRadius: 12,
            background: "#f3e7ff", // 💜 연보라 배경
            border: "1px solid #b49ddb"
          }}>
            <CustomLink to={`/notice/${n.id}`} style={{ color: "#7e57c2" }}>
              <h3>{n.title}</h3>
            </CustomLink>
            <p style={{ fontSize: 12, color: darkMode ? "#ccc" : "#666" }}>
              {new Date(n.createdAt.seconds * 1000).toLocaleString()}
            </p>
          </div>
        ))}
    </div>
  );
}

NoticeList.propTypes = {
  darkMode: PropTypes.bool
};

NoticeList.defaultProps = {
  darkMode: false
};

export default NoticeList;
