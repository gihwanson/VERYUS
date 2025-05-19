import React, { useState, useEffect } from "react";
import { collection, addDoc, Timestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

function getGrade(score) {
  if (score >= 90) return "🌞 태양";
  if (score >= 80) return "🪐 토성";
  if (score >= 70) return "🌏 지구";
  if (score >= 60) return "🍉 수박";
  if (score >= 50) return "🍈 멜론";
  if (score >= 40) return "🍎 사과";
  if (score >= 30) return "🥝 키위";
  return "🫐 블루베리";
}

function EvaluatePage() {
  const [target, setTarget] = useState("");
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [gradePreview, setGradePreview] = useState("");
  const [myRole, setMyRole] = useState("");

  const evaluator = localStorage.getItem("nickname");

  useEffect(() => {
    const fetchRole = async () => {
      if (!evaluator) return;
      const q = query(collection(db, "users"), where("nickname", "==", evaluator));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setMyRole(data.role || "");
      }
    };
    fetchRole();
  }, [evaluator]);

  const handleSubmit = async () => {
    if (!target.trim() || !score.trim()) return alert("모든 항목을 입력하세요");

    const num = parseInt(score);
    if (isNaN(num) || num < 0 || num > 100) return alert("0~100점 사이의 숫자만 입력하세요");

    // 중복 평가 방지
    const q = query(
      collection(db, "scores"),
      where("target", "==", target),
      where("evaluator", "==", evaluator)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return alert("이미 이 피평가자에 대해 평가를 등록했습니다.");

    await addDoc(collection(db, "scores"), {
      target,
      score: num,
      comment,
      evaluator,
      role: myRole,
      createdAt: Timestamp.now()
    });

    alert("평가가 저장되었습니다!");
    setTarget("");
    setScore("");
    setComment("");
    setGradePreview("");
  };

  const handleScoreChange = (e) => {
    const value = e.target.value;
    setScore(value);

    const num = parseInt(value);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setGradePreview(getGrade(num));
    } else {
      setGradePreview("");
    }
  };

  return (
    <div style={{
      maxWidth: 600,
      margin: "40px auto",
      padding: 30,
      borderRadius: 16,
      background: "#f3e7ff",
      boxSizing: "border-box",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
    }}>
      <h1 style={{ textAlign: "center", color: "#7e57c2", marginBottom: 30 }}>
        🎯 <span style={{ fontWeight: "bold" }}>등급 평가 입력</span>
      </h1>

      <input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="피평가자 닉네임"
        style={inputStyle}
      />

      <input
        value={score}
        onChange={handleScoreChange}
        placeholder="점수 (0~100)"
        style={inputStyle}
      />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="코멘트 (선택사항)"
        style={{ ...inputStyle, height: 100, resize: "vertical" }}
      />

      <button onClick={handleSubmit} style={buttonStyle}>평가 저장</button>

      {gradePreview && (
        <p style={{
          marginTop: 15,
          textAlign: "center",
          fontWeight: "bold",
          color: "#6a1b9a",
          fontSize: 16
        }}>
          🎖 추천 등급: {gradePreview}
        </p>
      )}

      <div style={{ marginTop: 30, lineHeight: 1.8 }}>
        <p>🌞 태양: 90점 이상</p>
        <p>🪐 토성: 80~89점</p>
        <p>🌏 지구: 70~79점</p>
        <p>🍉 수박: 60~69점</p>
        <p>🍈 멜론: 50~59점</p>
        <p>🍎 사과: 40~49점</p>
        <p>🥝 키위: 30~39점</p>
        <p>🫐 블루베리: 29점 이하</p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  marginBottom: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  boxSizing: "border-box",
  fontSize: 14
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  background: "#7e57c2",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontWeight: "bold",
  fontSize: 16,
  cursor: "pointer",
  marginTop: 8
};

export default EvaluatePage;
