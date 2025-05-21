import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
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

function AdminEvalPage({ darkMode }) {
  const [results, setResults] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [rawEntries, setRawEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("avgDesc");
  const [filterTarget, setFilterTarget] = useState("");
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const currentRole = localStorage.getItem("role");
  const isLeader = currentRole === "리더";
  const isAdmin = currentRole === "운영진" || isLeader;

  useEffect(() => {
    fetchUserRoles();
    fetchResults();
  }, []);

  const fetchUserRoles = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const roles = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.nickname && data.role) {
          roles[data.nickname] = data.role;
        }
      });
      setUserRoles(roles);
    } catch (err) {
      console.error("사용자 역할 가져오기 오류:", err);
      setError("사용자 역할을 가져오는 중 오류가 발생했습니다.");
    }
  };

  const fetchResults = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "scores"));
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // 타임스탬프를 날짜 문자열로 변환
      const processed = raw.map(entry => {
        if (entry.createdAt) {
          try {
            entry.createdAtString = entry.createdAt.toDate().toLocaleString();
          } catch (e) {
            entry.createdAtString = "날짜 정보 없음";
          }
        } else {
          entry.createdAtString = "날짜 정보 없음";
        }
        return entry;
      });
      
      setRawEntries(processed);

      const grouped = {};
      processed.forEach(r => {
        if (!grouped[r.target]) grouped[r.target] = [];
        grouped[r.target].push(r);
      });

      const formatted = Object.entries(grouped).map(([target, entries]) => {
        const total = entries.reduce((sum, e) => sum + e.score, 0);
        const avg = (total / entries.length).toFixed(1);
        const grade = getGrade(avg);
        return { target, entries, total, avg: parseFloat(avg), grade };
      });

      setResults(formatted);
    } catch (err) {
      console.error("결과 가져오기 오류:", err);
      setError("평가 결과를 가져오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = async () => {
    if (confirmingDelete === 'all') {
      setConfirmingDelete(null);
      return;
    }
    
    setConfirmingDelete('all');
    setTimeout(() => {
      setConfirmingDelete(null);
    }, 3000);
  };

  const confirmReset = async () => {
    setUpdating(true);
    try {
      const snap = await getDocs(collection(db, "scores"));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "scores", d.id))));
      setResults([]);
      setRawEntries([]);
      alert("모든 평가 결과가 초기화되었습니다. (부운영진 평가 포함)");
    } catch (err) {
      console.error("초기화 중 오류:", err);
      alert("초기화 중 오류가 발생했습니다.");
    } finally {
      setUpdating(false);
      setConfirmingDelete(null);
    }
  };

  const deleteEvaluation = async (evalId) => {
    if (confirmingDelete === evalId) {
      setConfirmingDelete(null);
      return;
    }
    
    setConfirmingDelete(evalId);
    setTimeout(() => {
      setConfirmingDelete(null);
    }, 3000);
  };

  const confirmDeleteEvaluation = async (evalId) => {
    setUpdating(true);
    try {
      await deleteDoc(doc(db, "scores", evalId));
      alert("평가가 삭제되었습니다.");
      // 데이터 다시 불러오기
      fetchResults();
    } catch (err) {
      console.error("평가 삭제 중 오류:", err);
      alert("평가 삭제 중 오류가 발생했습니다.");
    } finally {
      setUpdating(false);
      setConfirmingDelete(null);
    }
  };

  const updateUserGrade = async (nickname, grade) => {
    if (!isAdmin) {
      alert("권한이 없습니다.");
      return;
    }

    const confirmed = window.confirm(`${nickname}님의 등급을 ${grade}로 업데이트하시겠습니까?`);
    if (!confirmed) return;

    setUpdating(true);
    try {
      // 해당 사용자 문서 찾기
      const userQuery = await getDocs(collection(db, "users"));
      let userId = null;
      
      userQuery.forEach(doc => {
        const data = doc.data();
        if (data.nickname === nickname) {
          userId = doc.id;
        }
      });

      if (!userId) {
        alert("사용자를 찾을 수 없습니다.");
        setUpdating(false);
        return;
      }

      // 등급 업데이트
      await updateDoc(doc(db, "users", userId), { grade });
      alert(`${nickname}님의 등급이 ${grade}로 업데이트되었습니다.`);
    } catch (err) {
      console.error("등급 업데이트 중 오류:", err);
      alert("등급 업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  // 부운영진 평가 목록 생성
  const subAdmins = Object.entries(userRoles)
    .filter(([_, role]) => role === "부운영진")
    .map(([nickname]) => nickname);

  const subAdminEntries = rawEntries.filter(entry => subAdmins.includes(entry.evaluator));

  const subAdminGrouped = {};
  subAdminEntries.forEach(entry => {
    if (!subAdminGrouped[entry.target]) subAdminGrouped[entry.target] = [];
    subAdminGrouped[entry.target].push(entry);
  });

  // 정렬 및 필터링 로직
  const sortResults = (list) => {
    const sorted = [...list];
    
    switch (sortBy) {
      case "avgDesc":
        return sorted.sort((a, b) => b.avg - a.avg);
      case "avgAsc":
        return sorted.sort((a, b) => a.avg - b.avg);
      case "targetAsc":
        return sorted.sort((a, b) => a.target.localeCompare(b.target));
      case "targetDesc":
        return sorted.sort((a, b) => b.target.localeCompare(a.target));
      case "countDesc":
        return sorted.sort((a, b) => b.entries.length - a.entries.length);
      case "countAsc":
        return sorted.sort((a, b) => a.entries.length - b.entries.length);
      default:
        return sorted;
    }
  };

  const filteredResults = filterTarget 
    ? results.filter(r => r.target.includes(filterTarget))
    : results;

  const sortedResults = sortResults(filteredResults);

  // 스타일 정의
  const containerStyle = {
    maxWidth: 800,
    margin: "40px auto",
    padding: 30,
    borderRadius: 16,
    background: darkMode ? "#1e1e24" : "#fff5ff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    color: darkMode ? "#e4e4e4" : "#333",
  };

  const headerStyle = {
    textAlign: "center", 
    color: darkMode ? "#bb86fc" : "#7e57c2", 
    marginBottom: 30
  };

  const cardStyle = {
    border: `2px solid ${darkMode ? "#6a1b9a" : "#b49ddb"}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    background: darkMode ? "#2d2d34" : "#f3e7ff"
  };

  const entryStyle = {
    background: darkMode ? "#3a3a48" : "#fff",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 14,
    position: "relative"
  };

  const subAdminStyle = {
    background: darkMode ? "#322442" : "#fbe9f5",
    border: `1px solid ${darkMode ? "#9c64a6" : "#ce93d8"}`,
    padding: 20,
    marginBottom: 30,
    borderRadius: 10
  };

  const buttonStyle = {
    background: darkMode ? "#6a1b9a" : "#7e57c2",
    color: "#fff",
    padding: "10px 20px",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: 10
  };

  const dangerButtonStyle = {
    background: darkMode ? "#a03131" : "#e91e63",
    color: "#fff",
    padding: "10px 20px",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    marginBottom: 30,
    cursor: "pointer"
  };

  const controlsContainerStyle = {
    marginBottom: 20,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10
  };

  const selectStyle = {
    padding: "8px 12px",
    background: darkMode ? "#3a3a48" : "#fff",
    color: darkMode ? "#e4e4e4" : "#333",
    border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
    borderRadius: 8
  };

  const inputStyle = {
    padding: "8px 12px",
    background: darkMode ? "#3a3a48" : "#fff",
    color: darkMode ? "#e4e4e4" : "#333",
    border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
    borderRadius: 8,
    flex: 1
  };

  const deleteButtonStyle = {
    background: darkMode ? "#a03131" : "#e91e63",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    position: "absolute",
    top: 8,
    right: 8
  };

  const applyGradeButtonStyle = {
    background: darkMode ? "#2e7d32" : "#43a047",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    marginLeft: 10
  };

  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>
        👑 <span style={{ fontWeight: "bold" }}>등급 평가 결과</span>
      </h1>

      {isAdmin && (
        <>
          {confirmingDelete === 'all' ? (
            <button 
              onClick={confirmReset}
              style={{ ...dangerButtonStyle, opacity: updating ? 0.7 : 1 }}
              disabled={updating}
            >
              ⚠️ 정말 모든 평가를 초기화하시겠습니까? ⚠️
            </button>
          ) : (
            <button 
              onClick={resetAll}
              style={dangerButtonStyle}
              disabled={updating}
            >
              🗑 모든 평가 (부운영진 포함) 초기화
            </button>
          )}
        </>
      )}

      {error && (
        <div style={{ 
          padding: "10px 15px", 
          background: darkMode ? "#42100e" : "#f8d7da", 
          color: darkMode ? "#ffb4ab" : "#721c24",
          borderRadius: 8,
          marginBottom: 15
        }}>
          {error}
        </div>
      )}

      {/* 필터링 및 정렬 컨트롤 */}
      <div style={controlsContainerStyle}>
        <div>
          <label style={{ marginRight: 5 }}>정렬:</label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={selectStyle}
          >
            <option value="avgDesc">평균 점수 높은순</option>
            <option value="avgAsc">평균 점수 낮은순</option>
            <option value="targetAsc">닉네임 오름차순</option>
            <option value="targetDesc">닉네임 내림차순</option>
            <option value="countDesc">평가수 많은순</option>
            <option value="countAsc">평가수 적은순</option>
          </select>
        </div>
        
        <div style={{ display: "flex", flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            placeholder="닉네임으로 필터링"
            value={filterTarget}
            onChange={(e) => setFilterTarget(e.target.value)}
            style={inputStyle}
          />
          {filterTarget && (
            <button 
              onClick={() => setFilterTarget("")}
              style={{
                background: "transparent",
                border: "none",
                color: darkMode ? "#bb86fc" : "#7e57c2",
                cursor: "pointer",
                marginLeft: 5
              }}
            >
              ❌
            </button>
          )}
        </div>
        
        <button 
          onClick={fetchResults}
          style={{
            ...buttonStyle,
            background: darkMode ? "#3949ab" : "#5c6bc0"
          }}
          disabled={loading}
        >
          {loading ? "불러오는 중..." : "🔄 새로고침"}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: darkMode ? "#bb86fc" : "#7e57c2" }}>
          데이터를 불러오는 중입니다...
        </div>
      ) : sortedResults.length === 0 ? (
        <p style={{ textAlign: "center", color: darkMode ? "#aaa" : "#888" }}>평가 결과가 없습니다.</p>
      ) : (
        sortedResults.map(({ target, entries, total, avg, grade }) => (
          <div key={target} style={cardStyle}>
            <h2 style={{ marginBottom: 10, color: darkMode ? "#bb86fc" : "#7e57c2" }}>
              🎯 피평가자: {target}
              {isAdmin && (
                <button 
                  onClick={() => updateUserGrade(target, grade)}
                  style={applyGradeButtonStyle}
                  disabled={updating}
                >
                  등급 적용
                </button>
              )}
            </h2>
            
            {entries.map((entry) => {
              const role = userRoles[entry.evaluator];
              return (
                <div key={entry.id} style={entryStyle}>
                  {isAdmin && (
                    confirmingDelete === entry.id ? (
                      <button 
                        onClick={() => confirmDeleteEvaluation(entry.id)}
                        style={{ ...deleteButtonStyle, background: darkMode ? "#d32f2f" : "#f44336" }}
                      >
                        확인
                      </button>
                    ) : (
                      <button 
                        onClick={() => deleteEvaluation(entry.id)}
                        style={deleteButtonStyle}
                      >
                        삭제
                      </button>
                    )
                  )}
                  <p style={{ color: darkMode ? "#bb86fc" : "#7b1fa2" }}>
                    👤 평가자: <strong>{entry.evaluator}</strong> 
                    {role && <span> ({role})</span>}
                  </p>
                  <p>점수: <strong>{entry.score}</strong></p>
                  <p>코멘트: {entry.comment || "없음"}</p>
                  <p>부여한 등급: {getGrade(entry.score)}</p>
                  <p style={{ fontSize: "12px", color: darkMode ? "#999" : "#666" }}>
                    평가일: {entry.createdAtString}
                  </p>
                </div>
              );
            })}
            
            <div style={{ 
              marginTop: 20, 
              padding: 15, 
              borderRadius: 8, 
              background: darkMode ? "#3a3a48" : "#fff",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10 
            }}>
              <div>
                <p><strong>평가자 수:</strong> {entries.length}명</p>
                <p><strong>총합:</strong> {total}점</p>
              </div>
              <div>
                <p><strong>평균:</strong> {avg}점</p>
                <p><strong>최종 등급:</strong> <span style={{ fontSize: 18 }}>{grade}</span></p>
              </div>
            </div>
          </div>
        ))
      )}

      {/* 부운영진 평가 모아보기 (리더 전용) */}
      {isLeader && subAdminEntries.length > 0 && (
        <div style={{
          marginTop: 50,
          paddingTop: 30,
          borderTop: `2px dashed ${darkMode ? "#bb86fc" : "#7e57c2"}`
        }}>
          <h2 style={{ color: darkMode ? "#bb86fc" : "#6a1b9a", marginBottom: 20 }}>
            🟣 부운영진 평가 모아보기 (리더 전용)
          </h2>

          {Object.entries(subAdminGrouped).map(([target, records]) => {
            const total = records.reduce((sum, r) => sum + r.score, 0);
            const avg = (total / records.length).toFixed(1);
            const grade = getGrade(avg);
            return (
              <div key={target} style={subAdminStyle}>
                <h3 style={{ color: darkMode ? "#bb86fc" : "#6a1b9a" }}>
                  🎯 피평가자: <strong>{target}</strong>
                  <button 
                    onClick={() => updateUserGrade(target, grade)}
                    style={applyGradeButtonStyle}
                    disabled={updating}
                  >
                    등급 적용
                  </button>
                </h3>
                
                {records.map((r) => (
                  <div key={r.id} style={{
                    background: darkMode ? "#3a3a48" : "#fff",
                    padding: 10,
                    borderRadius: 6,
                    marginTop: 10,
                    fontSize: 14,
                    position: "relative"
                  }}>
                    {isAdmin && (
                      confirmingDelete === r.id ? (
                        <button 
                          onClick={() => confirmDeleteEvaluation(r.id)}
                          style={{ ...deleteButtonStyle, background: darkMode ? "#d32f2f" : "#f44336" }}
                        >
                          확인
                        </button>
                      ) : (
                        <button 
                          onClick={() => deleteEvaluation(r.id)}
                          style={deleteButtonStyle}
                        >
                          삭제
                        </button>
                      )
                    )}
                    <p>👤 부운영진: {r.evaluator}</p>
                    <p>점수: {r.score}</p>
                    <p>코멘트: {r.comment || "없음"}</p>
                    <p>추천 등급: {getGrade(r.score)}</p>
                    <p style={{ fontSize: "12px", color: darkMode ? "#999" : "#666" }}>
                      평가일: {r.createdAtString}
                    </p>
                  </div>
                ))}
                
                <div style={{ 
                  marginTop: 16, 
                  padding: 12, 
                  borderRadius: 8, 
                  background: darkMode ? "#3a3a48" : "#fff" 
                }}>
                  <p><strong>부운영진 평가 수:</strong> {records.length}명</p>
                  <p><strong>부운영진 평균:</strong> {avg}점</p>
                  <p><strong>부운영진 결과 등급:</strong> {grade}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminEvalPage;
