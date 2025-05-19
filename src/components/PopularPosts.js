import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { containerStyle, darkContainerStyle, titleStyle } from "../components/style";

function PopularPosts({ darkMode }) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("views", "desc"));
    return onSnapshot(q, s => {
      setPosts(s.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 5));
    });
  }, []);

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🔥 인기 게시물</h1>
      {posts.length === 0
        ? <p>게시물이 없습니다</p>
        : posts.map(p => (
          <div key={p.id} style={{
            margin: "12px 0",
            padding: 14,
            borderRadius: 12,
            background: "#f3e7ff", // 💜 연보라 배경
            border: "1px solid #b49ddb"
          }}>
            <CustomLink to={`/post/duet/${p.id}`} style={{ color: "#7e57c2" }}>
              <h3>{p.title}</h3>
            </CustomLink>
            <p style={{ fontSize: 12, color: darkMode ? "#ccc" : "#666" }}>
              조회수: {p.views || 0} · 좋아요: {p.likes?.length || 0}
            </p>
          </div>
        ))}
    </div>
  );
}

PopularPosts.propTypes = {
  darkMode: PropTypes.bool
};

PopularPosts.defaultProps = {
  darkMode: false
};

export default PopularPosts;
