import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Link, useNavigate } from "react-router-dom";

function ScoreBoard({ darkMode, globalProfilePics, globalGrades }) {
  const navigate = useNavigate();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContest, setSelectedContest] = useState(null);
  const [scores, setScores] = useState([]);
  
  // 현재 사용자의 role 가져오기
  const userRole = localStorage.getItem("role");
  
  // 운영진 권한 체크 함수
  const isAdmin = () => {
    return userRole === "운영진" || userRole === "부운영진";
  };

  // 콘테스트 생성 권한 체크 및 알림
  const handleCreateClick = (e) => {
    if (!userRole) {
      e.preventDefault();
      alert("권한이 없습니다. 운영진만 콘테스트를 생성할 수 있습니다.");
    } else if (!isAdmin()) {
      e.preventDefault();
      alert("운영진만 콘테스트를 생성할 수 있습니다.");
    }
  };

  // 콘테스트 클릭 핸들러
  const handleContestClick = (contest) => {
    navigate(`/register-score/${contest.id}`);
  };

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const q = query(
          collection(db, "contests"),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);
        const contestData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setContests(contestData);
        setLoading(false);
      } catch (err) {
        console.error("콘테스트 데이터 불러오기 오류:", err);
        setError("콘테스트 데이터를 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };

    fetchContests();
  }, []);

  // 특정 콘테스트의 점수들을 불러오는 함수
  useEffect(() => {
    const fetchScores = async () => {
      if (!selectedContest) return;

      try {
        const q = query(
          collection(db, `contests/${selectedContest.id}/scores`),
          orderBy("score", "desc")
        );

        const snapshot = await getDocs(q);
        const scoreData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setScores(scoreData);
      } catch (err) {
        console.error("점수 데이터 불러오기 오류:", err);
      }
    };

    fetchScores();
  }, [selectedContest]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  const containerStyle = {
    padding: "20px",
    backgroundColor: darkMode ? "#2d2d2d" : "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "20px"
  };

  const thStyle = {
    padding: "12px",
    backgroundColor: darkMode ? "#3d3d3d" : "#f5f5f5",
    color: darkMode ? "#ffffff" : "#333333",
    textAlign: "left",
    borderBottom: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`
  };

  const tdStyle = {
    padding: "12px",
    borderBottom: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    color: darkMode ? "#e0e0e0" : "#333333"
  };

  const buttonStyle = {
    display: "inline-block",
    padding: "8px 16px",
    backgroundColor: "#7e57c2",
    color: "#ffffff",
    borderRadius: "4px",
    textDecoration: "none",
    marginBottom: "20px",
    border: "none",
    cursor: "pointer",
    marginRight: "10px"
  };

  const contestCardStyle = {
    padding: "15px",
    backgroundColor: darkMode ? "#3d3d3d" : "#f5f5f5",
    borderRadius: "8px",
    marginBottom: "15px",
    cursor: "pointer",
    border: `2px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    transition: "all 0.3s ease"
  };

  const selectedContestStyle = {
    ...contestCardStyle,
    borderColor: "#7e57c2",
    backgroundColor: darkMode ? "#4a3a6a" : "#f3eaff"
  };

  if (loading) {
    return <div style={containerStyle}>로딩 중...</div>;
  }

  if (error) {
    return <div style={containerStyle}>{error}</div>;
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ color: darkMode ? "#ffffff" : "#333333" }}>콘테스트</h2>
        <Link 
          to={isAdmin() ? "/create-contest" : "#"} 
          style={{
            ...buttonStyle,
            opacity: isAdmin() ? 1 : 0.5,
            cursor: isAdmin() ? "pointer" : "not-allowed"
          }}
          onClick={handleCreateClick}
        >
          콘테스트 방 만들기
        </Link>
      </div>

      {/* 콘테스트 목록 */}
      <div style={{ marginBottom: "30px" }}>
        <h3 style={{ color: darkMode ? "#ffffff" : "#333333", marginBottom: "15px" }}>진행중인 콘테스트</h3>
        {contests.map(contest => (
          <div
            key={contest.id}
            style={{
              ...contestCardStyle,
              cursor: 'pointer'
            }}
            onClick={() => handleContestClick(contest)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h4 style={{ margin: "0 0 5px 0", color: darkMode ? "#ffffff" : "#333333" }}>
                  {contest.title}
                </h4>
                <p style={{ margin: "0", fontSize: "14px", color: darkMode ? "#bbb" : "#666" }}>
                  주최자: {contest.organizer} • 참가자: {contest.participantCount || 0}명
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", color: darkMode ? "#bbb" : "#666" }}>
                  {formatDate(contest.createdAt)}
                </div>
                <div style={{ 
                  fontSize: "12px", 
                  color: contest.status === "진행중" ? "#4caf50" : "#ff9800",
                  marginTop: "5px"
                }}>
                  {contest.status || "진행중"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 선택된 콘테스트의 점수 목록 */}
      {selectedContest && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ color: darkMode ? "#ffffff" : "#333333" }}>
              {selectedContest.title} - 점수 현황
            </h3>
            <Link 
              to={`/register-score/${selectedContest.id}`} 
              style={buttonStyle}
            >
              점수 등록하기
            </Link>
          </div>
          
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>순위</th>
                <th style={thStyle}>참가자</th>
                <th style={thStyle}>곡명</th>
                <th style={thStyle}>점수</th>
                <th style={thStyle}>평가자</th>
                <th style={thStyle}>등록일</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score, index) => (
                <tr key={score.id}>
                  <td style={tdStyle}>{index + 1}</td>
                  <td style={tdStyle}>{score.participantName}</td>
                  <td style={tdStyle}>{score.songTitle}</td>
                  <td style={tdStyle}>{score.score}</td>
                  <td style={tdStyle}>{score.evaluator}</td>
                  <td style={tdStyle}>{formatDate(score.createdAt)}</td>
                </tr>
              ))}
              {scores.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ ...tdStyle, textAlign: "center" }}>
                    등록된 점수가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ScoreBoard; 