// FreePostList.js
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import Avatar from "./Avatar";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn, smallBtn
} from "../components/style";

// gradeEmojis 객체 추가
const gradeEmojis = {
  "체리": "🍒",
  "블루베리": "🫐",
  "키위": "🥝",
  "사과": "🍎",
  "멜론": "🍈",
  "수박": "🍉",
  "지구": "🌏",
  "토성": "🪐",
  "태양": "🌞"
};

function FreePostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [cCnt, setCCnt] = useState({});
  const me = localStorage.getItem("nickname");
  const nav = useNavigate();

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, "freeposts"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => {
      const arr = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(arr);
      arr.forEach(p => {
        if (!(p.id in cCnt)) {
          getDocs(collection(db, `freepost-${p.id}-comments`)).then(cs =>
            setCCnt(cc => ({ ...cc, [p.id]: cs.size }))
          );
        }
      });
    });
  }, [me, cCnt]);

  const filtered = posts.filter(p =>
    (p.title + p.content).includes(search) &&
    (!p.isPrivate || p.nickname === me)
  );

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📝 자유 게시판</h1>
      <SearchBar darkMode={darkMode} onSearch={setSearch} />

      <button onClick={() => nav("/write/free")} style={purpleBtn}>글쓰기</button>

      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 ? (
          <p>게시글이 없습니다</p>
        ) : (
          filtered.map(p => (
            <div key={p.id} style={{
              marginBottom: 16,
              padding: 14,
              border: "1px solid #b49ddb",
              borderRadius: 12,
              background: "#f3e7ff",
              color: "#000"
            }}>
              <Link to={`/post/freepost/${p.id}`} style={{
                textDecoration: "none",
                color: darkMode ? "#fff" : "#333"
              }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar src={globalProfilePics[p.nickname]} size={28} />
                  {p.title.length > 50 ? p.title.slice(0, 50) + "..." : p.title}
                </h3>
              </Link>
              <div style={{
                fontSize: 12,
                borderBottom: "1px dashed #999",
                paddingBottom: 4,
                color: darkMode ? "#ccc" : "#666"
              }}>
                {new Date(p.createdAt.seconds * 1000).toLocaleString()} |
                작성자:{" "}
                <Link to={`/userpage/${p.nickname || "알 수 없음"}`} style={{
                  textDecoration: "none",
                  color: darkMode ? "#ccc" : "#666"
                }}>
                  {p.nickname || "알 수 없음"} {p.nickname ? gradeEmojis[globalGrades[p.nickname]] : ""}
                </Link>
              </div>
              <p style={{
                fontSize: 12,
                color: darkMode ? "#aaa" : "#999",
                marginTop: 4
              }}>
                ❤️ {p.likes || 0} | 🚨 {p.reports || 0} | 💬 {(cCnt[p.id] ?? 0)}
              </p>
              <Link to={`/send-message/${p.nickname || "알 수 없음"}`}>
                <button style={{ ...smallBtn, marginTop: 5 }}>✉️ 쪽지</button>
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Props 검증 추가
FreePostList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired
};

// 기본값 설정
FreePostList.defaultProps = {
  darkMode: false
};

export default FreePostList;
