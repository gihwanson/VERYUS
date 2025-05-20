// DeleteAccount.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn
} from "../components/style";

function DeleteAccount({ darkMode }) {
  const nick = localStorage.getItem("nickname");
  const nav = useNavigate();
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [relatedData, setRelatedData] = useState({
    posts: 0,
    comments: 0,
    likes: 0
  });

  // 사용자의 관련 데이터 검색
  useEffect(() => {
    const fetchUserRelatedData = async () => {
      try {
        // 사용자 ID 가져오기
        const userQuery = query(collection(db, "users"), where("nickname", "==", nick));
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) return;
        
        const userId = userSnapshot.docs[0].id;
        
        // 게시물 수 가져오기 (posts 컬렉션에 'authorId' 필드가 있다고 가정)
        const postsQuery = query(collection(db, "posts"), where("authorId", "==", userId));
        const postsSnapshot = await getDocs(postsQuery);
        
        // 댓글 수 가져오기 (comments 컬렉션에 'userId' 필드가 있다고 가정)
        const commentsQuery = query(collection(db, "comments"), where("userId", "==", userId));
        const commentsSnapshot = await getDocs(commentsQuery);
        
        // 좋아요 수 가져오기 (likes 컬렉션에 'userId' 필드가 있다고 가정)
        const likesQuery = query(collection(db, "likes"), where("userId", "==", userId));
        const likesSnapshot = await getDocs(likesQuery);
        
        setRelatedData({
          posts: postsSnapshot.size,
          comments: commentsSnapshot.size,
          likes: likesSnapshot.size
        });
      } catch (error) {
        console.error("관련 데이터 가져오기 오류:", error);
      }
    };
    
    if (nick) {
      fetchUserRelatedData();
    }
  }, [nick]);

  const moveToNextStep = () => {
    setStep(step + 1);
  };

  const handleReasonChange = (e) => {
    setReason(e.target.value);
  };

  const handleConfirmTextChange = (e) => {
    setConfirmText(e.target.value);
  };

  const deleteRelatedData = async (userId) => {
    const batch = writeBatch(db);
    
    try {
      // 게시물 삭제
      const postsQuery = query(collection(db, "posts"), where("authorId", "==", userId));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 댓글 삭제
      const commentsQuery = query(collection(db, "comments"), where("userId", "==", userId));
      const commentsSnapshot = await getDocs(commentsQuery);
      commentsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 좋아요 삭제
      const likesQuery = query(collection(db, "likes"), where("userId", "==", userId));
      const likesSnapshot = await getDocs(likesQuery);
      likesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 탈퇴 이유 저장 (선택 사항)
      if (reason.trim() !== "") {
        const feedbackRef = doc(collection(db, "userFeedback"));
        batch.set(feedbackRef, {
          type: "accountDeletion",
          reason: reason,
          timestamp: new Date(),
          nickname: nick
        });
      }
      
      await batch.commit();
      return true;
    } catch (error) {
      console.error("관련 데이터 삭제 오류:", error);
      return false;
    }
  };

  const bye = async () => {
    if (confirmText !== "회원탈퇴") {
      alert("확인 텍스트가 일치하지 않습니다.");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const q = query(collection(db, "users"), where("nickname", "==", nick));
      const ss = await getDocs(q);
      
      if (ss.empty) {
        setIsLoading(false);
        alert("계정 정보를 찾을 수 없습니다.");
        return;
      }
      
      const userId = ss.docs[0].id;
      
      // 관련 데이터 삭제
      const relatedDataDeleted = await deleteRelatedData(userId);
      
      if (!relatedDataDeleted) {
        setIsLoading(false);
        alert("관련 데이터 삭제에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      
      // 사용자 계정 삭제
      await deleteDoc(doc(db, "users", userId));
      
      localStorage.removeItem("nickname");
      setIsLoading(false);
      alert("탈퇴가 완료되었습니다. 이용해주셔서 감사합니다.");
      nav("/signup");
    } catch (error) {
      setIsLoading(false);
      console.error("탈퇴 처리 중 오류 발생:", error);
      alert("탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  const cancelDeletion = () => {
    if (window.confirm("회원 탈퇴를 취소하시겠습니까?")) {
      nav("/profile");
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <p style={{ textAlign: "center", marginBottom: "20px" }}>
              탈퇴 시 아래 데이터가 모두 삭제되며 복구할 수 없습니다.
            </p>
            <div style={dataBoxStyle}>
              <div style={dataItemStyle}>
                <span style={dataLabelStyle}>게시물</span>
                <span style={dataValueStyle}>{relatedData.posts}개</span>
              </div>
              <div style={dataItemStyle}>
                <span style={dataLabelStyle}>댓글</span>
                <span style={dataValueStyle}>{relatedData.comments}개</span>
              </div>
              <div style={dataItemStyle}>
                <span style={dataLabelStyle}>좋아요</span>
                <span style={dataValueStyle}>{relatedData.likes}개</span>
              </div>
            </div>
            <button 
              onClick={moveToNextStep} 
              style={{ ...purpleBtn, marginTop: "20px" }}
            >
              계속하기
            </button>
            <button 
              onClick={cancelDeletion} 
              style={{ ...purpleBtn, background: "#888", marginTop: "10px" }}
            >
              취소
            </button>
          </>
        );
      case 2:
        return (
          <>
            <p style={{ textAlign: "center", marginBottom: "20px" }}>
              탈퇴하시는 이유를 알려주시면 서비스 개선에 도움이 됩니다. (선택사항)
            </p>
            <select 
              value={reason} 
              onChange={handleReasonChange}
              style={selectStyle}
            >
              <option value="">선택해주세요</option>
              <option value="사용빈도 낮음">사용빈도가 낮아요</option>
              <option value="서비스 불만족">서비스가 만족스럽지 않아요</option>
              <option value="UI/UX 불편">UI/UX가 불편해요</option>
              <option value="개인정보 우려">개인정보 보호가 우려돼요</option>
              <option value="타서비스 이용">다른 서비스를 이용할 거예요</option>
              <option value="기타">기타</option>
            </select>
            {reason === "기타" && (
              <textarea
                placeholder="탈퇴 이유를 입력해주세요"
                style={textareaStyle}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <button 
              onClick={moveToNextStep} 
              style={{ ...purpleBtn, marginTop: "20px" }}
            >
              계속하기
            </button>
            <button 
              onClick={() => setStep(1)} 
              style={{ ...purpleBtn, background: "#888", marginTop: "10px" }}
            >
              이전
            </button>
          </>
        );
      case 3:
        return (
          <>
            <p style={{ textAlign: "center", color: "red", fontWeight: "bold", marginBottom: "20px" }}>
              ⚠️ 최종 확인 ⚠️
            </p>
            <p style={{ textAlign: "center", marginBottom: "20px" }}>
              탈퇴를 진행하시려면 아래에 "회원탈퇴"를 입력해주세요.
            </p>
            <input
              type="text"
              placeholder="회원탈퇴"
              value={confirmText}
              onChange={handleConfirmTextChange}
              style={inputStyle}
            />
            <button 
              onClick={bye} 
              style={{ ...purpleBtn, background: "red", marginTop: "20px" }}
              disabled={isLoading}
            >
              {isLoading ? "처리 중..." : "회원 탈퇴하기"}
            </button>
            <button 
              onClick={() => setStep(2)} 
              style={{ ...purpleBtn, background: "#888", marginTop: "10px" }}
              disabled={isLoading}
            >
              이전
            </button>
          </>
        );
      default:
        return null;
    }
  };

  // 추가 스타일
  const dataBoxStyle = {
    width: "100%",
    borderRadius: "8px",
    backgroundColor: darkMode ? "#444" : "#f5f5f5",
    padding: "15px",
    marginBottom: "10px"
  };

  const dataItemStyle = {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: darkMode ? "1px solid #555" : "1px solid #e0e0e0"
  };

  const dataLabelStyle = {
    fontWeight: "bold"
  };

  const dataValueStyle = {
    color: darkMode ? "#ddd" : "#333"
  };

  const selectStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    backgroundColor: darkMode ? "#444" : "#fff",
    color: darkMode ? "#fff" : "#333",
    marginBottom: "10px"
  };

  const textareaStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    backgroundColor: darkMode ? "#444" : "#fff",
    color: darkMode ? "#fff" : "#333",
    minHeight: "100px",
    resize: "vertical",
    marginBottom: "10px"
  };

  const inputStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    backgroundColor: darkMode ? "#444" : "#fff",
    color: darkMode ? "#fff" : "#333",
    marginBottom: "10px"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🚫 회원 탈퇴</h1>
      {renderStepContent()}
    </div>
  );
}

DeleteAccount.propTypes = {
  darkMode: PropTypes.bool
};

DeleteAccount.defaultProps = {
  darkMode: false
};

export default DeleteAccount;
