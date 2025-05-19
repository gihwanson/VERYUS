// NoticeDetail.js
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle
} from "../components/style";

function NoticeDetail({ darkMode }) {
  const { id } = useParams();
  const [ntc, setNtc] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "notices"));
      const f = snap.docs.find(d => d.id === id);
      if (f) setNtc({ id: f.id, ...f.data() });
    })();
  }, [id]);

  if (!ntc) return <div style={containerStyle}>로딩…</div>;

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1>{ntc.title}</h1>
      <p style={{ fontSize: 12, color: darkMode ? "#ccc" : "#666" }}>
        {new Date(ntc.createdAt.seconds * 1000).toLocaleString()} | {ntc.nickname || "알 수 없음"}
      </p>
      <div style={{ marginTop: 20 }}>{ntc.content}</div>
    </div>
  );
}

NoticeDetail.propTypes = {
  darkMode: PropTypes.bool
};

NoticeDetail.defaultProps = {
  darkMode: false
};

export default NoticeDetail;
