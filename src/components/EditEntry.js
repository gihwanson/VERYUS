import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import {
  doc, getDoc, updateDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function EditEntry({ darkMode }) {
  const { entryId } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const ownerFromUrl = queryParams.get("owner"); // URL에서 owner 값을 가져옴
  
  const [formData, setFormData] = useState({
    message: "",
    isSecret: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [owner, setOwner] = useState(ownerFromUrl || "");
  const [charCount, setCharCount] = useState(0);
  const [originalData, setOriginalData] = useState(null);
  
  const navigate = useNavigate();
  const me = localStorage.getItem("nickname");
  const MAX_CHAR_COUNT = 500; // 최대 글자 수 제한
  
  // 방명록 항목 로드
  useEffect(() => {
    const fetchEntry = async () => {
      if (!me) {
        navigate("/login", { state: { from: `/edit-entry/${entryId}` } });
        return;
      }
      
      if (!entryId) {
        setError("방명록 ID가 유효하지 않습니다.");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // owner가 URL에서 제공되었다면 직접 사용
        if (owner) {
          const entryDoc = await getDoc(doc(db, `guestbook-${owner}`, entryId));
          
          if (!entryDoc.exists()) {
            setError("방명록 항목을 찾을 수 없습니다.");
            setLoading(false);
            return;
          }
          
          const entryData = entryDoc.data();
          
          // 작성자 권한 확인
          if (entryData.writer !== me) {
            setError("본인이 작성한 방명록만 수정할 수 있습니다.");
            setLoading(false);
            setTimeout(() => navigate(`/guestbook/${owner}`), 2000);
            return;
          }
          
          setFormData({
            message: entryData.text || "",
            isSecret: entryData.isSecret || false
          });
          setCharCount(entryData.text ? entryData.text.length : 0);
          setOriginalData(entryData);
          setLoading(false);
          return;
        }
        
        // owner가 없는 경우 다른 방법으로 찾기
        // 이 부분은 애플리케이션 구조에 따라 최적화가 필요할 수 있습니다.
        // 예를 들어 entries 컬렉션에 owner 필드를 추가하거나,
        // 유저 정보에 자신의 guestbook entries ID 목록을 저장할 수 있습니다.
        
        // localStorage에 최근 방문한 방명록 정보가 있는지 확인
        const recentGuestbooks = JSON.parse(localStorage.getItem("recentGuestbooks") || "[]");
        for (const guestbook of recentGuestbooks) {
          try {
            const entryDoc = await getDoc(doc(db, `guestbook-${guestbook.owner}`, entryId));
            if (entryDoc.exists() && entryDoc.data().writer === me) {
              setOwner(guestbook.owner);
              setFormData({
                message: entryDoc.data().text || "",
                isSecret: entryDoc.data().isSecret || false
              });
              setCharCount(entryDoc.data().text ? entryDoc.data().text.length : 0);
              setOriginalData(entryDoc.data());
              setLoading(false);
              return;
            }
          } catch (err) {
            console.error(`Error checking guestbook-${guestbook.owner}:`, err);
          }
        }
        
        // 여기까지 왔다면 방명록 항목을 찾지 못한 것
        setError("방명록 항목을 찾을 수 없습니다. 주인 정보가 필요합니다.");
        setLoading(false);
      } catch (err) {
        console.error("방명록 항목 로드 오류:", err);
        setError("방명록 항목을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };
    
    fetchEntry();
  }, [entryId, me, navigate, owner]);
  
  // 입력값 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === "message") {
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
  
  // 방명록 저장
  const saveEntry = async () => {
    if (!formData.message.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    
    if (!owner) {
      setError("방명록 주인을 찾을 수 없습니다.");
      return;
    }
    
    // 변경 사항이 없는 경우
    if (
      formData.message === originalData?.text &&
      formData.isSecret === originalData?.isSecret
    ) {
      if (window.confirm("변경된 내용이 없습니다. 돌아가시겠습니까?")) {
        navigate(`/guestbook/${owner}`);
      }
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // 방명록 업데이트
      await updateDoc(doc(db, `guestbook-${owner}`, entryId), { 
        text: formData.message.trim(), 
        isSecret: formData.isSecret,
        updatedAt: Timestamp.now()
      });
      
      alert("방명록이 성공적으로 수정되었습니다.");
      navigate(`/guestbook/${owner}`);
    } catch (err) {
      console.error("방명록 저장 오류:", err);
      setError("방명록 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    // 변경 사항이 있는 경우 확인
    if (
      formData.message !== originalData?.text ||
      formData.isSecret !== originalData?.isSecret
    ) {
      if (!window.confirm("변경 사항이 저장되지 않습니다. 정말 취소하시겠습니까?")) {
        return;
      }
    }
    
    navigate(`/guestbook/${owner}`);
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
    color: darkMode ? "#e0e0e0" : "#333",
    marginTop: "15px",
    marginBottom: "15px"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <h1 style={titleStyle}>📖 방명록 수정</h1>
      
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
          <p>방명록 정보를 불러오는 중...</p>
        </div>
      ) : (
        <div style={cardStyle}>
          {/* 방명록 주인 정보 */}
          {owner && (
            <div style={{ 
              marginBottom: "20px",
              padding: "10px 15px",
              backgroundColor: darkMode ? "#333" : "#f5f5f5",
              borderRadius: "6px",
              fontSize: "14px",
              color: darkMode ? "#bbb" : "#666",
              textAlign: "center"
            }}>
              <strong>{owner}</strong>님의 방명록을 수정하고 있습니다
            </div>
          )}
          
          {/* 방명록 입력 */}
          <div style={{ marginBottom: "5px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "10px",
              color: darkMode ? "#e0e0e0" : "#333",
              fontWeight: "bold"
            }}>
              방명록 내용
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              placeholder="수정할 방명록 내용을 입력하세요"
              style={{
                ...(darkMode ? darkInputStyle : textareaStyle),
                width: "100%",
                minHeight: "150px",
                resize: "vertical",
                padding: "15px",
                fontSize: "16px",
                lineHeight: 1.5
              }}
              disabled={saving}
              maxLength={MAX_CHAR_COUNT}
            />
            <div style={getCharCountStyle()}>
              {charCount}/{MAX_CHAR_COUNT}
            </div>
          </div>
          
          {/* 비밀글 설정 */}
          <label style={checkboxLabelStyle}>
            <input
              name="isSecret"
              type="checkbox"
              checked={formData.isSecret}
              onChange={handleInputChange}
              style={{ marginRight: "8px" }}
              disabled={saving}
            />
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: "6px" }}>🔒</span>
              비밀글로 설정 (방명록 주인과 작성자만 볼 수 있음)
            </span>
          </label>
          
          {/* 안내 메시지 */}
          <div style={{ 
            padding: "15px",
            backgroundColor: darkMode ? "#333" : "#f9f4ff",
            borderRadius: "6px",
            fontSize: "14px",
            color: darkMode ? "#bbb" : "#666",
            marginBottom: "20px"
          }}>
            <p style={{ margin: 0 }}>
              <span style={{ marginRight: "8px" }}>💡</span>
              방명록은 수정 후에도 작성 시간과 작성자 정보가 유지됩니다.
            </p>
          </div>
          
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
              onClick={saveEntry}
              style={{
                ...purpleBtn,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "120px",
                opacity: saving ? 0.7 : 1
              }}
              disabled={saving}
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

EditEntry.propTypes = {
  darkMode: PropTypes.bool
};

EditEntry.defaultProps = {
  darkMode: false
};

export default EditEntry;