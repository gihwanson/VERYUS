import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

function RegisterScore({ darkMode }) {
  const { contestId } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({});
  const [reviews, setReviews] = useState({});
  const [userId, setUserId] = useState(null);
  const [existingRecords, setExistingRecords] = useState([]);

  useEffect(() => {
    const fetchUserData = async () => {
      const userNickname = localStorage.getItem("nickname");
      if (!userNickname) {
        alert("로그인이 필요합니다.");
        navigate("/login");
        return;
      }

      // 현재 로그인한 사용자의 document ID 가져오기
      const userQuery = query(
        collection(db, "users"),
        where("nickname", "==", userNickname)
      );
      const userSnapshot = await getDocs(userQuery);
      if (!userSnapshot.empty) {
        setUserId(userSnapshot.docs[0].id);
      }
    };

    fetchUserData();
  }, [navigate]);

  useEffect(() => {
    const fetchContestAndTeams = async () => {
      try {
        // 콘테스트 정보 가져오기
        const contestQuery = query(
          collection(db, "contests"),
          where("__name__", "==", contestId)
        );
        const contestSnapshot = await getDocs(contestQuery);
        
        if (contestSnapshot.empty) {
          alert("콘테스트를 찾을 수 없습니다.");
          navigate("/scores");
          return;
        }

        const contestData = {
          id: contestSnapshot.docs[0].id,
          ...contestSnapshot.docs[0].data()
        };
        setContest(contestData);

        // 팀 정보 가져오기
        const teamsQuery = query(
          collection(db, "contestTeams"),
          where("contestId", "==", contestId)
        );
        const teamsSnapshot = await getDocs(teamsQuery);
        
        const teamsData = teamsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => a.teamNumber - b.teamNumber);

        setTeams(teamsData);
        
        // 초기 점수와 리뷰 상태 설정
        const initialScores = {};
        const initialReviews = {};
        teamsData.forEach(team => {
          initialScores[team.id] = "";
          initialReviews[team.id] = "";
        });
        setScores(initialScores);
        setReviews(initialReviews);

        // 기존 등록 기록 확인
        if (userId) {
          const recordsQuery = query(
            collection(db, "contestRecords"),
            where("contestId", "==", contestId),
            where("evaluatorId", "==", userId)
          );
          const recordsSnapshot = await getDocs(recordsQuery);
          
          if (!recordsSnapshot.empty) {
            const records = recordsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setExistingRecords(records);

            // 기존 점수와 리뷰 불러오기
            const existingScores = {};
            const existingReviews = {};
            records.forEach(record => {
              existingScores[record.teamId] = record.record.toString();
              existingReviews[record.teamId] = record.review;
            });
            setScores(existingScores);
            setReviews(existingReviews);
          }
        }

      } catch (error) {
        console.error("데이터 로딩 오류:", error);
        alert("데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchContestAndTeams();
  }, [contestId, navigate, userId]);

  const handleScoreChange = (teamId, value) => {
    setScores(prev => ({
      ...prev,
      [teamId]: value
    }));
  };

  const handleReviewChange = (teamId, value) => {
    setReviews(prev => ({
      ...prev,
      [teamId]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userId) {
        alert("로그인이 필요합니다.");
        navigate("/login");
        return;
      }

      // 기존 등록 확인
      if (existingRecords.length > 0) {
        const confirmUpdate = window.confirm(
          "이미 등록한 점수가 있습니다. 점수를 수정하시겠습니까?"
        );

        if (confirmUpdate) {
          // 기존 기록 삭제
          for (const record of existingRecords) {
            await deleteDoc(doc(db, "contestRecords", record.id));
          }
        } else {
          setLoading(false);
          return;
        }
      }

      // 모든 팀의 점수와 리뷰 저장
      for (const team of teams) {
        const score = parseFloat(scores[team.id]);
        if (isNaN(score) || score < 0 || score > 100) {
          alert("점수는 0에서 100 사이의 숫자여야 합니다.");
          setLoading(false);
          return;
        }

        await addDoc(collection(db, "contestRecords"), {
          contestId,
          teamId: team.id,
          memberIds: team.memberIds || [],
          members: team.members || [],
          record: score,
          review: reviews[team.id],
          evaluatorId: userId,
          createdAt: serverTimestamp()
        });
      }

      alert("점수와 리뷰가 성공적으로 등록되었습니다!");
      navigate("/scores");
    } catch (error) {
      console.error("점수 등록 오류:", error);
      alert("점수 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    padding: "20px",
    backgroundColor: darkMode ? "#2d2d2d" : "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    maxWidth: "800px",
    margin: "0 auto"
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "20px"
  };

  const cellStyle = {
    padding: "12px",
    border: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    backgroundColor: darkMode ? "#3d3d3d" : "#ffffff",
    color: darkMode ? "#ffffff" : "#333333"
  };

  const inputStyle = {
    padding: "8px",
    width: "100%",
    borderRadius: "4px",
    border: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    backgroundColor: darkMode ? "#3d3d3d" : "#ffffff",
    color: darkMode ? "#ffffff" : "#333333"
  };

  const buttonStyle = {
    padding: "12px 24px",
    backgroundColor: "#7e57c2",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "16px",
    marginTop: "20px",
    opacity: loading ? 0.7 : 1
  };

  if (loading) {
    return <div style={containerStyle}>로딩 중...</div>;
  }

  if (!contest) {
    return <div style={containerStyle}>콘테스트를 찾을 수 없습니다.</div>;
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: darkMode ? "#ffffff" : "#333333" }}>
        {contest.title} - 점수 등록
      </h2>
      <p style={{ color: darkMode ? "#cccccc" : "#666666" }}>
        {contest.description}
      </p>

      {existingRecords.length > 0 && (
        <div style={{
          padding: "10px",
          marginBottom: "20px",
          backgroundColor: darkMode ? "#4a3a6a" : "#f3eaff",
          borderRadius: "4px",
          color: darkMode ? "#ffffff" : "#333333"
        }}>
          ⚠️ 이미 등록한 점수가 있습니다. 수정하시면 기존 점수가 삭제됩니다.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>팀 번호</th>
              <th style={cellStyle}>팀원</th>
              <th style={cellStyle}>점수 (0-100)</th>
              <th style={cellStyle}>리뷰</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(team => (
              <tr key={team.id}>
                <td style={{...cellStyle, textAlign: 'center'}}>{team.teamNumber}</td>
                <td style={cellStyle}>{Array.isArray(team.members) ? team.members.join(', ') : team.members}</td>
                <td style={cellStyle}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores[team.id]}
                    onChange={(e) => handleScoreChange(team.id, e.target.value)}
                    style={inputStyle}
                    required
                  />
                </td>
                <td style={cellStyle}>
                  <textarea
                    value={reviews[team.id]}
                    onChange={(e) => handleReviewChange(team.id, e.target.value)}
                    style={{...inputStyle, minHeight: "60px"}}
                    placeholder="리뷰를 입력하세요"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button 
          type="submit" 
          style={buttonStyle}
          disabled={loading}
        >
          {loading ? "등록 중..." : (existingRecords.length > 0 ? "점수 수정하기" : "점수 등록하기")}
        </button>
      </form>

      {contest && contest.category === "grade" && (
        <div style={{
          marginTop: "30px",
          padding: "20px",
          backgroundColor: darkMode ? "#3d3d3d" : "#f5f5f5",
          borderRadius: "8px",
          color: darkMode ? "#ffffff" : "#333333"
        }}>
          <h3 style={{ 
            marginTop: 0, 
            marginBottom: 20,
            color: darkMode ? "#bb86fc" : "#7e57c2" 
          }}>
            등급 기준표
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "15px",
            textAlign: "center"
          }}>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🌞 태양<br/>90점 이상
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🪐 토성<br/>80~89점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🌏 지구<br/>70~79점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🍉 수박<br/>60~69점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🍈 멜론<br/>50~59점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🍎 사과<br/>40~49점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🥝 키위<br/>30~39점
            </div>
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              fontSize: "14px"
            }}>
              🫐 블루베리<br/>29점 이하
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegisterScore; 