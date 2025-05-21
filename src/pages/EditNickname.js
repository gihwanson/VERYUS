import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";

function EditNickname({ darkMode }) {
  const oldNickname = localStorage.getItem("nickname");
  const [newNickname, setNewNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(null);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    // 닉네임이 바뀔 때마다 사용 가능 여부 초기화
    if (newNickname !== oldNickname) {
      setIsAvailable(null);
    }
  }, [newNickname, oldNickname]);

  // 닉네임 중복 확인
  const checkNicknameAvailability = async () => {
    if (!newNickname.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }

    if (newNickname === oldNickname) {
      setError("현재 사용 중인 닉네임과 동일합니다.");
      return;
    }

    setIsChecking(true);
    setError("");

    try {
      const q = query(collection(db, "users"), where("nickname", "==", newNickname));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setIsAvailable(true);
      } else {
        setIsAvailable(false);
        setError("이미 사용 중인 닉네임입니다.");
      }
    } catch (err) {
      console.error("닉네임 확인 오류:", err);
      setError("닉네임 확인 중 오류가 발생했습니다.");
    } finally {
      setIsChecking(false);
    }
  };

  // 닉네임 유효성 검사
  const validateNickname = (nickname) => {
    if (!nickname.trim()) {
      return "닉네임을 입력해주세요.";
    }
    
    if (nickname.length < 2) {
      return "닉네임은 2자 이상이어야 합니다.";
    }
    
    if (nickname.length > 20) {
      return "닉네임은 20자 이하여야 합니다.";
    }
    
    // 특수문자 제한 (공백, 한글, 영문, 숫자만 허용)
    if (!/^[가-힣a-zA-Z0-9\s]+$/.test(nickname)) {
      return "닉네임은 한글, 영문, 숫자, 공백만 포함할 수 있습니다.";
    }
    
    return "";
  };

  const handleSave = async () => {
    // 닉네임 유효성 검사
    const validationError = validateNickname(newNickname);
    if (validationError) {
      setError(validationError);
      return;
    }

    // 중복 확인이 필요한 경우
    if (isAvailable === null && newNickname !== oldNickname) {
      setError("닉네임 중복 확인이 필요합니다.");
      return;
    }

    // 중복 확인 실패한 경우
    if (isAvailable === false) {
      setError("이미 사용 중인 닉네임입니다. 다른 닉네임을 사용해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const q = query(collection(db, "users"), where("nickname", "==", oldNickname));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setError("사용자 정보를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }
      
      const userDoc = snap.docs[0];
      const userId = userDoc.id;
      
      // 사용자 문서 업데이트
      await updateDoc(doc(db, "users", userId), { 
        nickname: newNickname,
        updatedAt: serverTimestamp()
      });
      
      // 관련 컬렉션 업데이트 (posts, comments 등)
      await updateRelatedCollections(userId, oldNickname, newNickname);
      
      // 로컬 스토리지 업데이트
      localStorage.setItem("nickname", newNickname);
      
      alert("닉네임이 성공적으로 변경되었습니다. 페이지가 새로고침됩니다.");
      window.location.reload();
    } catch (err) {
      console.error("닉네임 변경 오류:", err);
      setError("닉네임 변경 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 관련 컬렉션 업데이트 (posts, comments, messages 등)
  const updateRelatedCollections = async (userId, oldNick, newNick) => {
    const collectionsToUpdate = [
      "posts", "comments", "freeposts", 
      "songs", "advice", "messages"
    ];
    
    try {
      for (const collectionName of collectionsToUpdate) {
        const q = query(collection(db, collectionName), where("uid", "==", userId));
        const snap = await getDocs(q);
        
        const batch = [];
        snap.forEach(docSnapshot => {
          batch.push(
            updateDoc(doc(db, collectionName, docSnapshot.id), {
              nickname: newNick,
              updatedAt: serverTimestamp()
            })
          );
        });
        
        if (batch.length > 0) {
          await Promise.all(batch);
        }
      }
    } catch (err) {
      console.error("관련 컬렉션 업데이트 오류:", err);
      throw err; // 에러를 상위로 전파
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
    input: {
      width: "100%",
      padding: "0.75rem",
      borderRadius: "8px",
      border: `1px solid ${darkMode ? "#444" : "#ddd"}`,
      backgroundColor: darkMode ? "#2a2a2a" : "#fff",
      color: darkMode ? "#e0e0e0" : "#333",
      fontSize: "1rem",
      marginBottom: "1rem",
      boxSizing: "border-box"
    },
    buttonsContainer: {
      display: "flex",
      gap: "0.5rem",
      marginBottom: "1.5rem"
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
      transition: "background-color 0.2s"
    },
    secondaryButton: {
      backgroundColor: darkMode ? "#2a2a2a" : "#e0e0e0",
      color: darkMode ? "#e0e0e0" : "#333",
      border: "none",
      borderRadius: "8px",
      padding: "0.75rem 1.5rem",
      fontSize: "1rem",
      fontWeight: "bold",
      cursor: "pointer",
      transition: "background-color 0.2s"
    },
    checkButton: {
      padding: "0.75rem 1rem",
      backgroundColor: darkMode ? "#03dac6" : "#5c6bc0",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "0.9rem",
      fontWeight: "bold"
    },
    currentNickname: {
      display: "flex",
      alignItems: "center",
      padding: "1rem",
      marginBottom: "1.5rem",
      backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
      borderRadius: "8px",
      fontSize: "1.1rem"
    },
    currentNicknameIcon: {
      marginRight: "1rem",
      fontSize: "1.5rem"
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
    note: {
      marginTop: "1.5rem",
      padding: "1rem",
      borderRadius: "8px",
      backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
      fontSize: "0.9rem"
    },
    checkerContainer: {
      display: "flex",
      gap: "0.5rem",
      alignItems: "center"
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>닉네임 수정</h2>
      
      {/* 현재 닉네임 표시 */}
      <div style={styles.currentNickname}>
        <span style={styles.currentNicknameIcon}>👤</span>
        <div>
          <strong>현재 닉네임:</strong> {oldNickname || "닉네임 없음"}
        </div>
      </div>
      
      {/* 오류 메시지 */}
      {error && <div style={styles.error}>{error}</div>}
      
      {/* 사용 가능 메시지 */}
      {isAvailable === true && (
        <div style={styles.success}>
          ✅ '{newNickname}'는 사용 가능한 닉네임입니다.
        </div>
      )}
      
      <div style={styles.formGroup}>
        <label htmlFor="nickname-input" style={styles.label}>새 닉네임</label>
        <div style={styles.checkerContainer}>
          <input
            id="nickname-input"
            value={newNickname}
            onChange={e => setNewNickname(e.target.value)}
            placeholder="새 닉네임을 입력하세요"
            style={{...styles.input, marginBottom: 0, flex: 1}}
          />
          <button
            onClick={checkNicknameAvailability}
            style={styles.checkButton}
            disabled={isChecking || !newNickname.trim() || newNickname === oldNickname}
          >
            {isChecking ? "확인 중..." : "중복 확인"}
          </button>
        </div>
      </div>
      
      <div style={styles.buttonsContainer}>
        <button
          onClick={() => window.history.back()}
          style={styles.secondaryButton}
        >
          취소
        </button>
        <button
          onClick={handleSave}
          style={{
            ...styles.button,
            opacity: (loading || !newNickname || (newNickname !== oldNickname && isAvailable !== true)) ? 0.7 : 1,
            cursor: (loading || !newNickname || (newNickname !== oldNickname && isAvailable !== true)) ? "not-allowed" : "pointer"
          }}
          disabled={loading || !newNickname || (newNickname !== oldNickname && isAvailable !== true)}
        >
          {loading ? "저장 중..." : "닉네임 저장"}
        </button>
      </div>
      
      <div style={styles.note}>
        <p><strong>닉네임 변경 시 유의사항:</strong></p>
        <ul>
          <li>닉네임은 2~20자 사이여야 합니다.</li>
          <li>한글, 영문, 숫자, 공백만 사용 가능합니다.</li>
          <li>닉네임 변경 시 모든 게시글과 댓글의 작성자 이름도 함께 변경됩니다.</li>
          <li>닉네임 변경 후에는 페이지가 새로고침됩니다.</li>
        </ul>
      </div>
    </div>
  );
}

export default EditNickname;
