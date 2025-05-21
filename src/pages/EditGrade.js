import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";

// 등급 정보
const GRADES = [
  { value: "🍒", label: "🍒 체리", description: "체리 등급입니다." },
  { value: "🫐", label: "🫐 블루베리", description: "블루베리 등급입니다." },
  { value: "🥝", label: "🥝 키위", description: "키위 등급입니다." },
  { value: "🍎", label: "🍎 사과", description: "사과 등급입니다." },
  { value: "🍈", label: "🍈 멜론", description: "멜론 등급입니다." },
  { value: "🍉", label: "🍉 수박", description: "수박 등급입니다." },
  { value: "🌏", label: "🌏 지구", description: "지구 등급입니다." },
  { value: "🪐", label: "🪐 토성", description: "토성 등급입니다." },
  { value: "🌞", label: "🌞 태양", description: "태양 등급입니다." },
  { value: "🌌", label: "🌌 은하", description: "은하 등급입니다." }
];

function EditGrade({ darkMode }) {
  const nickname = localStorage.getItem("nickname");
  const [newGrade, setNewGrade] = useState("");
  const [currentGrade, setCurrentGrade] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 현재 등급 불러오기
  useEffect(() => {
    const fetchCurrentGrade = async () => {
      try {
        const q = query(collection(db, "users"), where("nickname", "==", nickname));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userData = snap.docs[0].data();
          setCurrentGrade(userData.grade || "");
          setNewGrade(userData.grade || "");
        }
      } catch (err) {
        console.error("등급 정보 로드 오류:", err);
        setError("현재 등급을 불러오는 중 오류가 발생했습니다.");
      }
    };
    
    fetchCurrentGrade();
  }, [nickname]);

  const handleSave = async () => {
    if (!newGrade) {
      setError("등급을 선택해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setSaved(false);
    
    try {
      const q = query(collection(db, "users"), where("nickname", "==", nickname));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setError("사용자 정보를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }
      
      await updateDoc(doc(db, "users", snap.docs[0].id), { 
        grade: newGrade,
        updatedAt: serverTimestamp()
      });
      
      setCurrentGrade(newGrade);
      setSaved(true);
      
      setTimeout(() => {
        setSaved(false);
      }, 3000);
    } catch (err) {
      console.error("등급 수정 오류:", err);
      setError("등급 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 스타일 정의
  const styles = {
    container: {
      maxWidth: "600px",
      margin: "0 auto",
      padding: "2rem",
      borderRadius: "12px",
      backgroundColor: darkMode ? "#1e1e24" : "#f5f0ff",
      color: darkMode ? "#e0e0e0" : "#333",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)"
    },
    header: {
      marginBottom: "1.5rem",
      color: darkMode ? "#bb86fc" : "#7e57c2",
      fontSize: "1.8rem",
      textAlign: "center"
    },
    formGroup: {
      marginBottom: "1.5rem"
    },
    label: {
      display: "block",
      marginBottom: "0.5rem",
      fontWeight: "bold",
      color: darkMode ? "#bb86fc" : "#7e57c2"
    },
    select: {
      width: "100%",
      padding: "0.75rem",
      borderRadius: "8px",
      border: `1px solid ${darkMode ? "#444" : "#ddd"}`,
      backgroundColor: darkMode ? "#2a2a2a" : "#fff",
      color: darkMode ? "#e0e0e0" : "#333",
      fontSize: "1rem",
      marginBottom: "1rem"
    },
    button: {
      backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
      color: darkMode ? "#000" : "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "0.75rem 1.5rem",
      fontSize: "1rem",
      fontWeight: "bold",
      cursor: "pointer",
      transition: "background-color 0.2s",
      width: "100%"
    },
    buttonHover: {
      backgroundColor: darkMode ? "#9969da" : "#6a1b9a"
    },
    currentGrade: {
      display: "flex",
      alignItems: "center",
      padding: "1rem",
      marginBottom: "1.5rem",
      backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
      borderRadius: "8px",
      fontSize: "1.1rem"
    },
    gradeEmoji: {
      fontSize: "2rem",
      marginRight: "1rem"
    },
    error: {
      padding: "0.75rem",
      marginBottom: "1rem",
      color: "#fff",
      backgroundColor: darkMode ? "#cf6679" : "#f44336",
      borderRadius: "8px",
      textAlign: "center"
    },
    success: {
      padding: "0.75rem",
      marginBottom: "1rem",
      color: "#fff",
      backgroundColor: darkMode ? "#03dac6" : "#4caf50",
      borderRadius: "8px",
      textAlign: "center"
    },
    gradeDescription: {
      marginTop: "1rem",
      padding: "1rem",
      backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
      borderRadius: "8px",
      fontSize: "0.9rem",
      color: darkMode ? "#bb86fc" : "#7e57c2"
    },
    gradeItem: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    gradeLegend: {
      marginTop: "2rem",
      padding: "1rem",
      backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
      borderRadius: "8px"
    },
    gradeLegendTitle: {
      marginBottom: "0.5rem",
      fontWeight: "bold",
      color: darkMode ? "#bb86fc" : "#7e57c2"
    },
    gradeLegendList: {
      margin: 0,
      padding: 0,
      listStyle: "none"
    },
    gradeLegendItem: {
      display: "flex",
      alignItems: "center",
      padding: "0.5rem 0",
      borderBottom: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
    }
  };

  // 선택된 등급의 설명 가져오기
  const selectedGradeInfo = GRADES.find(grade => grade.value === newGrade);

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>등급 수정</h2>
      
      {/* 현재 등급 표시 */}
      <div style={styles.currentGrade}>
        <span style={styles.gradeEmoji}>{currentGrade || "🔹"}</span>
        <div>
          <strong>현재 등급:</strong> {currentGrade ? `${currentGrade} (${GRADES.find(g => g.value === currentGrade)?.label.split(' ')[1] || '등급 없음'})` : "등급 없음"}
        </div>
      </div>
      
      {/* 오류 메시지 */}
      {error && <div style={styles.error}>{error}</div>}
      
      {/* 저장 성공 메시지 */}
      {saved && <div style={styles.success}>등급이 성공적으로 수정되었습니다!</div>}
      
      <div style={styles.formGroup}>
        <label htmlFor="grade-select" style={styles.label}>새 등급 선택</label>
        <select 
          id="grade-select"
          value={newGrade} 
          onChange={e => setNewGrade(e.target.value)}
          style={styles.select}
        >
          <option value="">선택하세요</option>
          {GRADES.map(grade => (
            <option key={grade.value} value={grade.value}>
              {grade.label}
            </option>
          ))}
        </select>
        
        {/* 선택된 등급 설명 */}
        {selectedGradeInfo && (
          <div style={styles.gradeDescription}>
            <div style={styles.gradeItem}>
              <span style={{ fontSize: "1.5rem" }}>{selectedGradeInfo.value}</span>
              <span>{selectedGradeInfo.label.split(' ')[1]}</span>
            </div>
            <p>{selectedGradeInfo.description}</p>
          </div>
        )}
      </div>
      
      <button 
        onClick={handleSave} 
        style={{
          ...styles.button,
          ...(loading ? { opacity: 0.7, cursor: "not-allowed" } : {}),
          ...(newGrade === currentGrade ? { opacity: 0.5, cursor: "not-allowed" } : {})
        }}
        disabled={loading || newGrade === currentGrade}
      >
        {loading ? "저장 중..." : "등급 저장"}
      </button>
      
      {/* 등급 설명 섹션 */}
      <div style={styles.gradeLegend}>
        <div style={styles.gradeLegendTitle}>등급 안내</div>
        <ul style={styles.gradeLegendList}>
          {GRADES.map(grade => (
            <li key={grade.value} style={styles.gradeLegendItem}>
              <span style={{ fontSize: "1.5rem", marginRight: "10px" }}>{grade.value}</span>
              <span>{grade.label.split(' ')[1]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default EditGrade;
