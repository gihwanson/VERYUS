// MainBoardList.js
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, limit, getDocs
} from "firebase/firestore";
import { db } from "../firebase";

function MainBoardList({ darkMode }) {
  const [duetPost, setDuetPost] = useState(null);
  const [freePost, setFreePost] = useState(null);
  const [songPost, setSongPost] = useState(null);
  const [advicePost, setAdvicePost] = useState(null);

  useEffect(() => {
    const fetchPost = async (collectionName, setter) => {
      const q = query(collection(db, collectionName), orderBy("createdAt", "desc"), limit(1));
      const snap = await getDocs(q);
      setter(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    };

    fetchPost("posts", setDuetPost);
    fetchPost("freeposts", setFreePost);
    fetchPost("songs", setSongPost);
    fetchPost("advice", setAdvicePost);
  }, []);

  const cardStyle = {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    textDecoration: "none",
    display: "block"
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      {/* 🎤 듀엣/합창 게시판 */}
      <a
        href="/duet"
        style={{
          ...cardStyle,
          background: darkMode ? "#444" : "#f3eaff",
          color: darkMode ? "#fff" : "#333",
        }}
      >
        <h2 style={{ color: "#7e57c2", marginBottom: 10 }}>🎤 듀엣/합창 게시판</h2>
        {duetPost ? (
          <div style={{ fontWeight: "bold" }}>▸ {duetPost.title}</div>
        ) : <p>글이 없습니다</p>}
      </a>

      {/* 📝 자유 게시판 */}
      <a
        href="/freeboard"
        style={{
          ...cardStyle,
          background: darkMode ? "#444" : "#e3f2fd",
          color: darkMode ? "#fff" : "#333",
        }}
      >
        <h2 style={{ color: "#1976d2", marginBottom: 10 }}>📝 자유 게시판</h2>
        {freePost ? (
          <div style={{ fontWeight: "bold" }}>▸ {freePost.title}</div>
        ) : <p>글이 없습니다</p>}
      </a>

      {/* 🎵 노래 추천 게시판 */}
      <a
        href="/songs"
        style={{
          ...cardStyle,
          background: darkMode ? "#444" : "#ffe0f0",
          color: darkMode ? "#fff" : "#333",
        }}
      >
        <h2 style={{ color: "#d81b60", marginBottom: 10 }}>🎵 노래 추천 게시판</h2>
        {songPost ? (
          <div style={{ fontWeight: "bold" }}>▸ {songPost.title}</div>
        ) : <p>추천곡이 없습니다</p>}
      </a>

      {/* 💬 고민 상담 게시판 */}
      <a
        href="/advice"
        style={{
          ...cardStyle,
          background: darkMode ? "#444" : "#e8eaf6",
          color: darkMode ? "#fff" : "#333",
        }}
      >
        <h2 style={{ color: "#3f51b5", marginBottom: 10 }}>💬 고민 상담 게시판</h2>
        {advicePost ? (
          <div style={{ fontWeight: "bold" }}>▸ {advicePost.title}</div>
        ) : <p>상담글이 없습니다</p>}
      </a>
    </div>
  );
}

MainBoardList.propTypes = {
  darkMode: PropTypes.bool
};

MainBoardList.defaultProps = {
  darkMode: false
};

export default MainBoardList;
