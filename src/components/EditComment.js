import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  doc, getDoc, updateDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "./style";

function EditComment({ darkMode }) {
  const { type, postId, commentId } = useParams();
  const [formData, setFormData] = useState({
    text: "",
    isPrivate: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [charCount, setCharCount] = useState(0);
  const [postTitle, setPostTitle] = useState("");
  
  const navigate = useNavigate();
  const nick = localStorage.getItem("nickname");
  const MAX_CHAR_COUNT = 300; // 최대 글자 수 제한
  
  // 댓글 데이터 로드
  useEffect(() => {
    const fetchCommentData = async () => {
      if (!nick) {
        navigate("/login", { state: { from: `/edit-comment/${type}/${postId}/${commentId}` } });
        return;
      }
      
      try {
        setLoading(true);
        
        // 댓글 문서 가져오기 - 전체 컬렉션이 아닌 특정 문서만 가져옴
        const commentDocRef = doc(db, `${type}-${postId}-comments`, commentId);
        const commentDoc = await getDoc(commentDocRef);
        
        if (!commentDoc.exists()) {
          setError("댓글을 찾을 수 없습니다.");
          setLoading(false);
          return;
        }
        
        const commentData = commentDoc.data();
        
        // 본인 댓글인지 확인
        if (commentData.nickname !== nick) {
          setError("본인이 작성한 댓글만 수정할 수 있습니다.");
          setLoading(false);
          setTimeout(() => navigate(`/post/${type}/${postId}`), 2000);
          return;
        }
        
        // 게시물 제목 가져오기 (선택적)
        try {
          const postDocRef = doc(db, type === "post" ? "posts" : (
            type === "free" ? "freeposts" : (
              type === "song" ? "songs" : (
                type === "advice" ? "advice" : "posts"
              )
            )
          ), postId);
          const postDoc = await getDoc(postDocRef);
          
          if (postDoc.exists()) {
            setPostTitle(postDoc.data().title || "");
          }
        } catch (err) {
          console.error("게시물 정보 로드 오류:", err);
          // 게시물 제목은 필수가 아니므로 에러 무시
        }
        
        // 폼 데이터 설정
        setFormData({
          text: commentData.text || "",
          isPrivate: commentData.isPrivate || false
        });
        setCharCount(commentData.text ? commentData.text.length : 0);
        setOriginalData(commentData);
        
        setLoading(false);
      } catch (err) {
        console.error("댓글 정보 로드 오류:", err);
        setError("댓글 정보를 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };
    
    fetchCommentData();
  }, [type, postId, commentId, nick, navigate]);
  
  // 입력값 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === "text") {
      // 최대 글자 수 제한
      if (value.length <= MAX_CHAR_COUNT) {
        setFormData(prev => ({ ...prev, [name]: value }));
        setCharCount(value.length);
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value
      }));
    }
  };
  
  // 댓글 저장
  const saveComment = async () => {
    if (!formData.text.trim()) {
      setError("댓글 내용을 입력해주세요.");
      return;
    }
    
    // 변경 사항이 없는 경우
    if (
      formData.text === originalData?.text &&
      formData.isPrivate === originalData?.isPrivate
    ) {
      if (window.confirm("변경된 내용이 없습니다. 돌아가시겠습니까?")) {
        navigate(`/post/${type}/${postId}`);
      }
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // 댓글 업데이트
      await updateDoc(doc(db, `${type}-${postId}-comments`, commentId), {
        text: formData.text.trim(),
        isPrivate: formData.isPrivate,
        updatedAt: Timestamp.now()
      });
      
      alert("댓글이 성공적으로 수정되었습니다.");
      navigate(`/post/${type}/${postId}`);
    } catch (err) {
      console.error("댓글 수정 오류:", err);
      setError("댓글 수정 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    // 변경 사항이 있는 경우 확인
    if (
      formData.text !== originalData?.text ||
      formData.isPrivate !== originalData?.isPrivate
    ) {
      if (!window.confirm("변경 사항이 저장되지 않습니다. 정말 취소하시겠습니까?")) {
        return;
      }
    }
    
    navigate(`/post/${type}/${postId}`);
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "25px",
    maxWidth: "600px",
    width: "100%",
    margin: "0 auto",
    boxShadow: `0 2px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    border: `1px solid ${darkMode ? "#444" : "#eee"}`
  };
  
  // 글자 수 스타일
  const getCharCountStyle = () => ({
    textAlign: "right",
    fontSize: "14px",
    marginTop: "8px",
    color: charCount > MAX_CHAR_COUNT * 0.8 
      ? (charCount > MAX_CHAR_COUNT * 0.95 ? "#f44336" : "#ff9800") 
      : (darkMode ? "#bbb" : "#666")
  });
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px"
  };
  
  // 체크박스 라벨 스타일
  const checkboxLabelStyle = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    marginTop: "15px",
    marginBottom: "15px",
    color: darkMode ? "#e0e0e0" : "#333"
  };
  
  // 게시물 타입 라벨 가져오기
  const getPostTypeLabel = () => {
    switch (type) {
      case "post":
      case "duet":
        return "듀엣/합창";
      case "free":
      case "freepost":
        return "자유게시판";
      case "song":
        return "노래추천";
      case "advice":
        return "고민상담";
      default:
        return "게시글";
    }
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <h1 style={titleStyle}>💬 댓글 수정</h1>
      
      {/* 일반 오류 메시지 */}
      {error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "#ffebee",
          color: "#f44336", 
          borderRadius: "4px", 
          marginBottom: "20px",
          textAlign: "center"
        }}>
          {error}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid rgba(126, 87, 194, 0.1)", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>댓글 정보를 불러오는 중...</p>
        </div>
      ) : (
        <div style={cardStyle}>
          {/* 게시물 정보 */}
          {postTitle && (
            <div style={{ 
              marginBottom: "20px",
              padding: "10px 15px",
              backgroundColor: darkMode ? "#333" : "#f5f5f5",
              borderRadius: "6px",
              color: darkMode ? "#e0e0e0" : "#333"
            }}>
              <div style={{ 
                fontSize: "14px", 
                color: darkMode ? "#bbb" : "#666",
                marginBottom: "5px"
              }}>
                {getPostTypeLabel()} 댓글 수정 중
              </div>
              <div style={{ 
                fontWeight: "bold",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {postTitle}
              </div>
            </div>
          )}
          
          {/* 댓글 입력 */}
          <div style={{ marginBottom: "5px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "10px",
              color: darkMode ? "#e0e0e0" : "#333",
              fontWeight: "bold"
            }}>
              댓글 내용
            </label>
            <textarea
              name="text"
              value={formData.text}
              onChange={handleInputChange}
              placeholder="수정할 댓글 내용을 입력하세요"
              style={{
                ...(darkMode ? darkInputStyle : textareaStyle),
                width: "100%",
                minHeight: "120px",
                resize: "vertical"
              }}
              disabled={saving}
              maxLength={MAX_CHAR_COUNT}
            />
            <div style={getCharCountStyle()}>
              {charCount}/{MAX_CHAR_COUNT}
            </div>
          </div>
          
          {/* 비밀댓글 설정 */}
          <label style={checkboxLabelStyle}>
            <input
              name="isPrivate"
              type="checkbox"
              checked={formData.isPrivate}
              onChange={handleInputChange}
              style={{ marginRight: "8px" }}
              disabled={saving}
            />
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: "6px" }}>🔒</span>
              비밀댓글 (작성자와 게시물 작성자만 볼 수 있음)
            </span>
          </label>
          
          {/* 버튼 영역 */}
          <div style={buttonGroupStyle}>
            <button 
              onClick={handleCancel}
              style={{
                padding: "10px 20px",
                backgroundColor: darkMode ? "#444" : "#e0e0e0",
                color: darkMode ? "#fff" : "#333",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px"
              }}
              disabled={saving}
              type="button"
            >
              취소
            </button>
            
            <button 
              onClick={saveComment}
              style={{
                ...purpleBtn,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "120px",
                opacity: saving ? 0.7 : 1
              }}
              disabled={saving || !formData.text.trim()}
              type="button"
            >
              {saving ? (
                <>
                  <span style={{ 
                    display: "inline-block", 
                    width: "16px", 
                    height: "16px", 
                    border: "2px solid rgba(255, 255, 255, 0.3)", 
                    borderTop: "2px solid #fff", 
                    borderRadius: "50%", 
                    animation: "spin 1s linear infinite",
                    marginRight: "10px"
                  }}></span>
                  저장 중...
                </>
              ) : "수정 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

EditComment.propTypes = {
  darkMode: PropTypes.bool
};

EditComment.defaultProps = {
  darkMode: false
};

export default EditComment;
