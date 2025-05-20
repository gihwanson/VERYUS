import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  getDoc, doc, updateDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, textareaStyle, purpleBtn
} from "./style";

function EditPost({ darkMode }) {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [originalData, setOriginalData] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    isPrivate: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [charCount, setCharCount] = useState({
    title: 0,
    content: 0
  });
  const [showPreview, setShowPreview] = useState(false);
  
  const nick = localStorage.getItem("nickname");
  const MAX_TITLE_LENGTH = 100;
  const MAX_CONTENT_LENGTH = 10000;
  
  // 컬렉션 이름 결정
  const getCollectionName = () => {
    switch(type) {
      case "post":
      case "duet":
        return "posts";
      case "free":
      case "freepost":
        return "freeposts";
      case "song":
        return "songs";
      case "advice":
        return "advice";
      default:
        return "posts";
    }
  };
  
  // 게시물 데이터 로드
  useEffect(() => {
    const fetchPostData = async () => {
      if (!nick) {
        navigate("/login", { 
          state: { from: `/edit/${type}/${id}`, message: "로그인이 필요합니다." } 
        });
        return;
      }
      
      try {
        setLoading(true);
        const collectionName = getCollectionName();
        const docRef = doc(db, collectionName, id);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          setError("존재하지 않는 게시물입니다.");
          setLoading(false);
          return;
        }
        
        const postData = docSnap.data();
        
        // 작성자 확인
        if (postData.nickname !== nick) {
          setError("본인이 작성한 글만 수정할 수 있습니다.");
          setLoading(false);
          setTimeout(() => {
            navigate(-1);
          }, 2000);
          return;
        }
        
        // 원본 데이터 저장
        setOriginalData(postData);
        
        // 폼 데이터 설정
        setFormData({
          title: postData.title || "",
          content: postData.content || "",
          isPrivate: postData.isPrivate || false
        });
        
        // 글자 수 설정
        setCharCount({
          title: (postData.title || "").length,
          content: (postData.content || "").length
        });
        
        setLoading(false);
      } catch (err) {
        console.error("게시물 데이터 로드 오류:", err);
        setError("게시물을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };
    
    fetchPostData();
  }, [type, id, nick, navigate]);
  
  // 입력값 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // 글자 수 제한 체크
    if (name === "title" && value.length > MAX_TITLE_LENGTH) {
      return;
    }
    
    if (name === "content" && value.length > MAX_CONTENT_LENGTH) {
      return;
    }
    
    // 폼 데이터 업데이트
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
    
    // 글자 수 업데이트
    if (name === "title" || name === "content") {
      setCharCount(prev => ({
        ...prev,
        [name]: value.length
      }));
    }
  };
  
  // 게시물 저장
  const savePost = async () => {
    // 유효성 검사
    if (!formData.title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    
    if (!formData.content.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    
    // 변경 사항이 있는지 확인
    if (
      formData.title === originalData.title &&
      formData.content === originalData.content &&
      formData.isPrivate === originalData.isPrivate
    ) {
      if (window.confirm("변경된 내용이 없습니다. 돌아가시겠습니까?")) {
        navigate(-1);
      }
      return;
    }
    
    try {
      setSaving(true);
      const collectionName = getCollectionName();
      
      // 문서 업데이트
      await updateDoc(doc(db, collectionName, id), {
        title: formData.title.trim(),
        content: formData.content.trim(),
        isPrivate: formData.isPrivate,
        updatedAt: Timestamp.now()
      });
      
      alert("게시물이 성공적으로 수정되었습니다.");
      navigate(`/post/${type}/${id}`);
    } catch (err) {
      console.error("게시물 수정 오류:", err);
      setError("게시물 수정 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    // 변경사항이 있는지 확인
    if (
      formData.title !== originalData?.title ||
      formData.content !== originalData?.content ||
      formData.isPrivate !== originalData?.isPrivate
    ) {
      if (!window.confirm("변경 사항이 저장되지 않습니다. 정말 취소하시겠습니까?")) {
        return;
      }
    }
    
    navigate(-1);
  };
  
  // 미리보기 토글
  const togglePreview = () => {
    setShowPreview(prev => !prev);
  };
  
  // HTML 내용을 안전하게 렌더링하는 함수
  const createMarkup = (htmlContent) => {
    return { __html: htmlContent };
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: `0 2px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px",
    gap: "10px"
  };
  
  // 탭 버튼 스타일
  const getTabButtonStyle = (isActive) => ({
    padding: "8px 16px",
    backgroundColor: isActive 
      ? (darkMode ? "#7e57c2" : "#7e57c2") 
      : (darkMode ? "#444" : "#f0f0f0"),
    color: isActive ? "white" : (darkMode ? "#e0e0e0" : "#333"),
    border: "none",
    borderRadius: "4px 4px 0 0",
    cursor: "pointer",
    fontSize: "14px"
  });
  
  // 제목 입력 스타일
  const getTitleInputStyle = () => ({
    ...(darkMode ? darkInputStyle : inputStyle),
    width: "100%",
    marginBottom: "5px",
    fontWeight: "bold",
    fontSize: "18px"
  });
  
  // 내용 입력 스타일
  const getContentTextareaStyle = () => ({
    ...(darkMode ? darkInputStyle : textareaStyle),
    width: "100%",
    minHeight: "300px",
    resize: "vertical",
    marginBottom: "5px",
    fontSize: "16px",
    lineHeight: "1.6"
  });
  
  // 글자 수 카운터 스타일
  const getCharCountStyle = (current, max) => ({
    textAlign: "right",
    fontSize: "12px",
    marginBottom: "15px",
    color: current > max * 0.9 
      ? (current > max * 0.95 ? "#f44336" : "#ff9800") 
      : (darkMode ? "#bbb" : "#666")
  });
  
  // 미리보기 스타일
  const previewStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#f9f9f9",
    padding: "20px",
    borderRadius: "4px",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
    minHeight: "300px",
    fontSize: "16px",
    lineHeight: "1.6",
    color: darkMode ? "#e0e0e0" : "#333"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "20px"
      }}>
        <h1 style={titleStyle}>✏️ 게시물 수정</h1>
        
        {!loading && !error && (
          <div style={{ 
            marginLeft: "auto", 
            fontSize: "14px",
            color: darkMode ? "#bbb" : "#666"
          }}>
            마지막 수정: {originalData?.updatedAt 
              ? new Date(originalData.updatedAt.seconds * 1000).toLocaleString() 
              : new Date(originalData?.createdAt?.seconds * 1000).toLocaleString()}
          </div>
        )}
      </div>
      
      {/* 에러 메시지 */}
      {error && (
        <div style={{ 
          padding: "15px", 
          backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "#ffebee",
          color: "#f44336", 
          borderRadius: "4px", 
          marginBottom: "20px",
          animation: "fadeIn 0.3s"
        }}>
          {error}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading && (
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
          <p>게시물을 불러오는 중...</p>
        </div>
      )}
      
      {/* 편집 폼 */}
      {!loading && !error && (
        <div style={cardStyle}>
          {/* 편집/미리보기 탭 */}
          <div style={{ 
            display: "flex", 
            borderBottom: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
            marginBottom: "20px"
          }}>
            <button 
              onClick={() => setShowPreview(false)}
              style={getTabButtonStyle(!showPreview)}
            >
              ✏️ 편집
            </button>
            <button 
              onClick={() => setShowPreview(true)}
              style={getTabButtonStyle(showPreview)}
            >
              👁️ 미리보기
            </button>
          </div>
          
          {!showPreview ? (
            /* 편집 모드 */
            <>
              {/* 제목 입력 */}
              <div style={{ marginBottom: "15px" }}>
                <input
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  style={getTitleInputStyle()}
                  placeholder="제목을 입력하세요"
                  maxLength={MAX_TITLE_LENGTH}
                />
                <div style={getCharCountStyle(charCount.title, MAX_TITLE_LENGTH)}>
                  {charCount.title}/{MAX_TITLE_LENGTH}
                </div>
              </div>
              
              {/* 비공개 설정 */}
              <div style={{ 
                marginBottom: "15px",
                display: "flex",
                alignItems: "center"
              }}>
                <label style={{ 
                  display: "flex", 
                  alignItems: "center",
                  cursor: "pointer",
                  color: darkMode ? "#e0e0e0" : "#333",
                  fontSize: "14px"
                }}>
                  <input
                    type="checkbox"
                    name="isPrivate"
                    checked={formData.isPrivate}
                    onChange={handleInputChange}
                    style={{ marginRight: "8px" }}
                  />
                  🔒 비공개 게시물 (작성자만 볼 수 있음)
                </label>
              </div>
              
              {/* 내용 입력 */}
              <div>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  style={getContentTextareaStyle()}
                  placeholder="내용을 입력하세요"
                  maxLength={MAX_CONTENT_LENGTH}
                />
                <div style={getCharCountStyle(charCount.content, MAX_CONTENT_LENGTH)}>
                  {charCount.content}/{MAX_CONTENT_LENGTH}
                </div>
              </div>
              
              <div style={{ 
                fontSize: "13px", 
                color: darkMode ? "#aaa" : "#777",
                marginBottom: "10px",
                borderTop: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
                paddingTop: "10px"
              }}>
                <div>• HTML 태그 사용 가능: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;a&gt; 등</div>
                <div>• 미리보기 탭에서 최종 모습을 확인할 수 있습니다.</div>
              </div>
            </>
          ) : (
            /* 미리보기 모드 */
            <div style={{ animation: "fadeIn 0.3s" }}>
              <h2 style={{ 
                marginTop: 0, 
                color: darkMode ? "#e0e0e0" : "#333",
                borderBottom: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
                paddingBottom: "10px"
              }}>
                {formData.title || "제목을 입력하세요"}
                {formData.isPrivate && (
                  <span style={{ 
                    marginLeft: "10px",
                    fontSize: "14px",
                    color: darkMode ? "#ff9800" : "#e67e22",
                    fontWeight: "normal"
                  }}>
                    🔒 비공개
                  </span>
                )}
              </h2>
              
              {/* 내용 미리보기 */}
              <div 
                style={previewStyle} 
                dangerouslySetInnerHTML={createMarkup(formData.content || "<p>내용이 없습니다</p>")}
              ></div>
            </div>
          )}
          
          {/* 버튼 그룹 */}
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
            >
              취소
            </button>
            
            <button 
              onClick={savePost}
              style={{
                ...purpleBtn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "100px",
                opacity: saving ? 0.7 : 1
              }}
              disabled={saving}
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
                    marginRight: "8px"
                  }}></span>
                  저장 중...
                </>
              ) : "저장"}
            </button>
          </div>
        </div>
      )}
      
      {/* 데이터가 로드된 후 관련 게시물 표시 (옵션) */}
      {!loading && !error && originalData && (
        <div style={{
          backgroundColor: darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)",
          padding: "15px",
          borderRadius: "8px",
          fontSize: "14px",
          color: darkMode ? "#d4c2ff" : "#7e57c2",
          textAlign: "center"
        }}>
          <p style={{ margin: 0 }}>
            {getPostTypeLabel(type)} 게시물을 수정하고 있습니다.
            <br/>
            잘못 들어오셨다면 <button 
              onClick={handleCancel} 
              style={{
                background: "none",
                border: "none",
                color: darkMode ? "#9575cd" : "#673ab7",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
                fontSize: "14px"
              }}
            >
              이전 페이지로 돌아가기
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

// 게시물 타입에 따른 라벨 반환
function getPostTypeLabel(type) {
  switch(type) {
    case "post":
    case "duet":
      return "듀엣/합창";
    case "free":
    case "freepost":
      return "자유 게시판";
    case "song":
      return "노래 추천";
    case "advice":
      return "고민 상담";
    default:
      return "게시판";
  }
}

EditPost.propTypes = {
  darkMode: PropTypes.bool
};

EditPost.defaultProps = {
  darkMode: false
};

export default EditPost;
