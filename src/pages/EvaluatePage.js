import React, { useState, useEffect } from "react";
import { collection, addDoc, Timestamp, query, where, getDocs, orderBy, limit } from "firebase/firestore";
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

function EvaluatePage({ darkMode }) {
  const [target, setTarget] = useState("");
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [gradePreview, setGradePreview] = useState("");
  const [myRole, setMyRole] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentEvaluations, setRecentEvaluations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const evaluator = localStorage.getItem("nickname");

  useEffect(() => {
    const fetchRole = async () => {
      if (!evaluator) return;
      try {
        const q = query(collection(db, "users"), where("nickname", "==", evaluator));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setMyRole(data.role || "");
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
        setError("사용자 역할을 가져오는 중 오류가 발생했습니다.");
      }
    };
    fetchRole();
    fetchRecentEvaluations();
  }, [evaluator, fetchRecentEvaluations]);

  const fetchRecentEvaluations = async () => {
    try {
      const q = query(
        collection(db, "scores"),
        where("evaluator", "==", evaluator),
        orderBy("createdAt", "desc"),
        limit(5)
      );
      const snap = await getDocs(q);
      const evaluations = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate().toLocaleString()
      }));
      setRecentEvaluations(evaluations);
    } catch (err) {
      console.error("Error fetching recent evaluations:", err);
    }
  };

  const searchUsers = async (searchTerm) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setUserSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoadingUsers(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef, 
        where("nickname", ">=", searchTerm), 
        where("nickname", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const snapshot = await getDocs(q);
      
      const suggestions = snapshot.docs
        .map(doc => doc.data().nickname)
        .filter(nick => nick !== evaluator); // 자기 자신은 제외

      setUserSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (err) {
      console.error("Error searching users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleTargetChange = (e) => {
    const value = e.target.value;
    setTarget(value);
    searchUsers(value);
  };

  const selectUser = (nickname) => {
    setTarget(nickname);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!target.trim() || !score.trim()) {
      setError("모든 항목을 입력하세요");
      return;
    }

    const num = parseInt(score);
    if (isNaN(num) || num < 0 || num > 100) {
      setError("0~100점 사이의 숫자만 입력하세요");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 대상 사용자 존재 확인
      const userQ = query(collection(db, "users"), where("nickname", "==", target));
      const userSnap = await getDocs(userQ);
      if (userSnap.empty) {
        setError("존재하지 않는 사용자입니다.");
        setLoading(false);
        return;
      }

      // 중복 평가 방지
      const q = query(
        collection(db, "scores"),
        where("target", "==", target),
        where("evaluator", "==", evaluator)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError("이미 이 피평가자에 대해 평가를 등록했습니다.");
        setLoading(false);
        return;
      }

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
      fetchRecentEvaluations();
    } catch (err) {
      console.error("Error submitting evaluation:", err);
      setError("평가 저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
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

  const containerStyle = {
    maxWidth: 600,
    margin: "40px auto",
    padding: 30,
    borderRadius: 16,
    background: darkMode ? "#2d2d30" : "#f3e7ff",
    boxSizing: "border-box",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    color: darkMode ? "#e4e4e4" : "#333"
  };

  const customInputStyle = {
    width: "100%",
    padding: "12px 14px",
    marginBottom: 12,
    borderRadius: 10,
    border: darkMode ? "1px solid #555" : "1px solid #ccc",
    boxSizing: "border-box",
    fontSize: 14,
    background: darkMode ? "#3a3a3d" : "#fff",
    color: darkMode ? "#e4e4e4" : "#333"
  };

  const buttonStyle = {
    width: "100%",
    padding: "12px",
    background: darkMode ? "#6a1b9a" : "#7e57c2",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
    fontSize: 16,
    cursor: "pointer",
    marginTop: 8,
    opacity: loading ? 0.7 : 1
  };

  const suggestionStyle = {
    position: "absolute",
    width: "calc(100% - 60px)",
    maxWidth: 540,
    background: darkMode ? "#3a3a3d" : "#fff",
    border: darkMode ? "1px solid #555" : "1px solid #ccc",
    borderRadius: 10,
    marginTop: -10,
    zIndex: 10,
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
  };

  const suggestionItemStyle = {
    padding: "10px 15px",
    cursor: "pointer",
    borderBottom: darkMode ? "1px solid #555" : "1px solid #eee",
    color: darkMode ? "#e4e4e4" : "#333"
  };

  const gradeCardStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "10px",
    marginTop: 20,
    background: darkMode ? "#363639" : "#f9f4ff",
    padding: 15,
    borderRadius: 10
  };

  const gradeItemStyle = {
    padding: "10px",
    background: darkMode ? "#444447" : "#fff",
    borderRadius: 8,
    textAlign: "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
  };

  const recentEvalStyle = {
    marginTop: 30,
    background: darkMode ? "#363639" : "#f9f4ff",
    padding: 15,
    borderRadius: 10
  };

  const evalItemStyle = {
    background: darkMode ? "#444447" : "#fff",
    padding: "12px 15px",
    borderRadius: 8,
    marginBottom: 10,
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ textAlign: "center", color: darkMode ? "#bb86fc" : "#7e57c2", marginBottom: 30 }}>
        🎯 <span style={{ fontWeight: "bold" }}>등급 평가 입력</span>
      </h1>

      <div style={{ position: "relative", marginBottom: 15 }}>
        <label htmlFor="target" style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
          피평가자 닉네임
        </label>
        <input
          id="target"
          value={target}
          onChange={handleTargetChange}
          placeholder="평가할 사용자의 닉네임"
          style={customInputStyle}
        />
        {showSuggestions && userSuggestions.length > 0 && (
          <div style={suggestionStyle}>
            {loadingUsers ? (
              <div style={suggestionItemStyle}>검색 중...</div>
            ) : (
              userSuggestions.map((name, idx) => (
                <div 
                  key={idx} 
                  style={suggestionItemStyle}
                  onClick={() => selectUser(name)}
                >
                  {name}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 15 }}>
        <label htmlFor="score" style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
          점수 (0~100)
        </label>
        <input
          id="score"
          value={score}
          onChange={handleScoreChange}
          placeholder="0~100 사이의 점수"
          style={customInputStyle}
          type="number"
          min="0"
          max="100"
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label htmlFor="comment" style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
          코멘트 (선택사항)
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="평가에 대한 코멘트를 남겨주세요"
          style={{ ...customInputStyle, height: 100, resize: "vertical" }}
        />
      </div>

      {error && (
        <div style={{ 
          padding: "10px 15px", 
          background: "#f8d7da", 
          color: "#721c24",
          borderRadius: 8,
          marginBottom: 15
        }}>
          {error}
        </div>
      )}

      <button 
        onClick={handleSubmit} 
        style={buttonStyle}
        disabled={loading}
      >
        {loading ? "저장 중..." : "평가 저장"}
      </button>

      {gradePreview && (
        <p style={{
          marginTop: 15,
          textAlign: "center",
          fontWeight: "bold",
          color: darkMode ? "#bb86fc" : "#6a1b9a",
          fontSize: 16,
          background: darkMode ? "#444447" : "#f9f4ff",
          padding: "10px",
          borderRadius: 8
        }}>
          🎖 선택한 점수의 추천 등급: {gradePreview}
        </p>
      )}

      <h3 style={{ marginTop: 30, color: darkMode ? "#bb86fc" : "#7e57c2" }}>등급 기준표</h3>
      <div style={gradeCardStyle}>
        <div style={gradeItemStyle}>🌞 태양<br/>90점 이상</div>
        <div style={gradeItemStyle}>🪐 토성<br/>80~89점</div>
        <div style={gradeItemStyle}>🌏 지구<br/>70~79점</div>
        <div style={gradeItemStyle}>🍉 수박<br/>60~69점</div>
        <div style={gradeItemStyle}>🍈 멜론<br/>50~59점</div>
        <div style={gradeItemStyle}>🍎 사과<br/>40~49점</div>
        <div style={gradeItemStyle}>🥝 키위<br/>30~39점</div>
        <div style={gradeItemStyle}>🫐 블루베리<br/>29점 이하</div>
      </div>

      {recentEvaluations.length > 0 && (
        <div style={recentEvalStyle}>
          <h3 style={{ color: darkMode ? "#bb86fc" : "#7e57c2", marginTop: 0 }}>
            최근 평가 내역
          </h3>
          {recentEvaluations.map((evaluation, idx) => (
            <div key={idx} style={evalItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{evaluation.target}</strong>
                <span>{evaluation.score}점 ({getGrade(evaluation.score)})</span>
              </div>
              {evaluation.comment && <p style={{ margin: "8px 0 0" }}>{evaluation.comment}</p>}
              <small style={{ display: "block", marginTop: 5, color: darkMode ? "#aaa" : "#777" }}>
                {evaluation.createdAt}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EvaluatePage;
