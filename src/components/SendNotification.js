// SendNotification.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, getDocs, query, where, Timestamp, orderBy, limit
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, 
  textareaStyle, darkTextareaStyle, purpleBtn, darkPurpleBtn, secondaryBtn, darkSecondaryBtn
} from "../components/style";

function SendNotification({ darkMode }) {
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState("all"); // all, role, specific
  const [specificUsers, setSpecificUsers] = useState("");
  const [selectedRole, setSelectedRole] = useState("일반회원");
  const [importance, setImportance] = useState("normal"); // normal, important, urgent
  const [showPreview, setShowPreview] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const me = localStorage.getItem("nickname");
  const myRole = localStorage.getItem("role") || "일반회원";
  const nav = useNavigate();

  // 최근 알림 불러오기
  useEffect(() => {
    const loadRecentNotifications = async () => {
      try {
        const q = query(
          collection(db, "notifications"),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        
        const snapshot = await getDocs(q);
        const notifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setRecentNotifications(notifications);
      } catch (err) {
        console.error("최근 알림 로드 중 오류:", err);
      }
    };
    
    loadRecentNotifications();
  }, []);

  // 알림 전송 권한 체크
  const canSendNotification = () => {
    const allowedRoles = ["운영진", "리더", "부운영진"];
    return allowedRoles.includes(myRole);
  };

  // 특정 사용자 닉네임 정리 (쉼표로 구분된 문자열을 배열로 변환)
  const parseSpecificUsers = () => {
    return specificUsers
      .split(",")
      .map(nick => nick.trim())
      .filter(nick => nick); // 빈 문자열 제거
  };
  
  // 폼 검증
  const validateForm = () => {
    if (!title.trim()) {
      setError("제목을 입력하세요");
      return false;
    }
    
    if (!msg.trim()) {
      setError("내용을 입력하세요");
      return false;
    }
    
    if (target === "specific" && !specificUsers.trim()) {
      setError("알림을 전송할 사용자를 입력하세요");
      return false;
    }
    
    setError(null);
    return true;
  };

  // 알림 전송
  const send = async () => {
    if (!canSendNotification()) {
      alert("알림 전송 권한이 없습니다");
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      
      // 알림 기본 데이터
      const notificationData = {
        title,
        message: msg,
        senderNickname: me,
        senderRole: myRole,
        importance,
        createdAt: Timestamp.now(),
        read: {}
      };
      
      // 대상에 따른 필드 추가
      if (target === "all") {
        notificationData.targetType = "all";
      } else if (target === "role") {
        notificationData.targetType = "role";
        notificationData.targetRole = selectedRole;
      } else if (target === "specific") {
        notificationData.targetType = "specific";
        notificationData.targetUsers = parseSpecificUsers();
      }
      
      // 알림 저장
      await addDoc(collection(db, "notifications"), notificationData);

      alert("알림이 전송되었습니다");
      
      // 폼 초기화
      setTitle("");
      setMsg("");
      setTarget("all");
      setSpecificUsers("");
      setSelectedRole("일반회원");
      setImportance("normal");
      
      // 알림 목록으로 이동
      nav("/notification");
    } catch (error) {
      console.error("알림 전송 중 오류 발생:", error);
      setError("알림 전송 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  // 미리보기 데이터
  const previewData = {
    title,
    message: msg,
    senderNickname: me,
    senderRole: myRole,
    importance,
    createdAt: Timestamp.now(),
    targetType: target,
    targetRole: target === "role" ? selectedRole : null,
    targetUsers: target === "specific" ? parseSpecificUsers() : []
  };

  // 날짜 포맷팅
  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp instanceof Timestamp 
      ? new Date(timestamp.seconds * 1000) 
      : new Date(timestamp);
    return date.toLocaleString();
  };
  
  // 중요도에 따른 스타일 및 아이콘
  const importanceStyles = {
    normal: {
      background: darkMode ? "#444" : "#f0f0f0",
      color: darkMode ? "#ddd" : "#333",
      icon: "📢"
    },
    important: {
      background: darkMode ? "#00897b" : "#e0f2f1",
      color: darkMode ? "#fff" : "#00695c",
      icon: "🔔"
    },
    urgent: {
      background: darkMode ? "#c62828" : "#ffebee",
      color: darkMode ? "#fff" : "#c62828",
      icon: "🚨"
    }
  };
  
  // 대상에 따른 텍스트
  const getTargetText = (notif) => {
    if (notif.targetType === "all") {
      return "전체 회원";
    } else if (notif.targetType === "role") {
      return `${notif.targetRole} 역할 사용자`;
    } else if (notif.targetType === "specific") {
      const userCount = notif.targetUsers?.length || 0;
      return `특정 사용자 ${userCount}명`;
    }
    return "알 수 없음";
  };
  
  // 스타일 정의
  const currentContainerStyle = darkMode ? darkContainerStyle : containerStyle;
  const currentInputStyle = darkMode ? darkInputStyle : inputStyle;
  const currentTextareaStyle = darkMode ? darkTextareaStyle : textareaStyle;
  const currentPurpleBtn = darkMode ? darkPurpleBtn : purpleBtn;
  const currentSecondaryBtn = darkMode ? darkSecondaryBtn : secondaryBtn;
  
  const formGroupStyle = {
    marginBottom: 20
  };
  
  const labelStyle = {
    display: "block",
    marginBottom: 8,
    fontWeight: "bold",
    color: darkMode ? "#ddd" : "#333",
    fontSize: 14
  };
  
  const radioContainerStyle = {
    display: "flex",
    gap: 15,
    marginBottom: 15
  };
  
  const radioLabelStyle = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer"
  };
  
  const radioStyle = {
    marginRight: 5,
    accentColor: darkMode ? "#bb86fc" : "#7e57c2"
  };
  
  const selectStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: 8,
    border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
    backgroundColor: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#333",
    fontSize: 14
  };
  
  const errorMessageStyle = {
    color: "#f44336",
    fontSize: 14,
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    backgroundColor: darkMode ? "#421a1a" : "#ffebee",
    borderRadius: 4
  };
  
  const notificationCardStyle = {
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: darkMode ? "#333" : "#f3f3f3",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  };
  
  const notificationTitleStyle = {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8
  };
  
  const notificationMetaStyle = {
    fontSize: 12,
    color: darkMode ? "#aaa" : "#757575",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10
  };
  
  const importanceBadgeStyle = (importanceType) => {
    const style = importanceStyles[importanceType] || importanceStyles.normal;
    
    return {
      display: "inline-block",
      padding: "3px 8px",
      borderRadius: 12,
      fontSize: 12,
      backgroundColor: style.background,
      color: style.color,
      marginRight: 8
    };
  };

  // 운영진/리더가 아니면 접근 거부
  if (!canSendNotification()) {
    return (
      <div style={currentContainerStyle}>
        <h1 style={titleStyle}>📢 알림 전송</h1>
        <div style={errorMessageStyle}>
          <strong>접근 권한이 없습니다</strong>
          <p>운영진 또는 리더만 알림을 전송할 수 있습니다.</p>
        </div>
        <button onClick={() => nav("/")} style={currentSecondaryBtn}>
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={currentContainerStyle}>
      <h1 style={titleStyle}>📢 알림 전송</h1>
      
      {/* 권한 정보 표시 */}
      <div style={{
        backgroundColor: darkMode ? "#333" : "#f3e5f5",
        padding: 10,
        borderRadius: 8,
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div>
          <span style={{ 
            fontWeight: "bold",
            marginRight: 5
          }}>
            {me}
          </span>
          <span style={{
            backgroundColor: "#7e57c2",
            color: "#fff",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 12
          }}>
            {myRole}
          </span>
          <span style={{ marginLeft: 8 }}>
            님으로 알림 전송
          </span>
        </div>
        
        <div style={{ fontSize: 13, color: darkMode ? "#bb86fc" : "#7e57c2" }}>
          {new Date().toLocaleDateString()}
        </div>
      </div>
      
      {/* 에러 메시지 */}
      {error && (
        <div style={errorMessageStyle}>
          {error}
        </div>
      )}
      
      {/* 알림 작성 폼 */}
      <div style={{ 
        display: showPreview ? "none" : "block" 
      }}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="알림 제목"
            style={currentInputStyle}
          />
        </div>
        
        <div style={formGroupStyle}>
          <label style={labelStyle}>알림 내용</label>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="알림 내용을 작성하세요"
            style={{
              ...currentTextareaStyle,
              minHeight: 150
            }}
          />
        </div>
        
        <div style={formGroupStyle}>
          <label style={labelStyle}>알림 대상</label>
          <div style={radioContainerStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="target"
                value="all"
                checked={target === "all"}
                onChange={() => setTarget("all")}
                style={radioStyle}
              />
              전체 회원
            </label>
            
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="target"
                value="role"
                checked={target === "role"}
                onChange={() => setTarget("role")}
                style={radioStyle}
              />
              특정 역할
            </label>
            
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="target"
                value="specific"
                checked={target === "specific"}
                onChange={() => setTarget("specific")}
                style={radioStyle}
              />
              개별 사용자
            </label>
          </div>
          
          {/* 역할 선택 */}
          {target === "role" && (
            <div style={{ marginTop: 10 }}>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={selectStyle}
              >
                <option value="일반회원">일반회원</option>
                <option value="조장">조장</option>
                <option value="부운영진">부운영진</option>
                <option value="운영진">운영진</option>
                <option value="리더">리더</option>
              </select>
            </div>
          )}
          
          {/* 특정 사용자 입력 */}
          {target === "specific" && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={specificUsers}
                onChange={(e) => setSpecificUsers(e.target.value)}
                placeholder="쉼표(,)로 구분하여 사용자 닉네임을 입력하세요"
                style={{
                  ...currentTextareaStyle,
                  minHeight: 80
                }}
              />
              <div style={{ 
                fontSize: 12, 
                color: darkMode ? "#aaa" : "#666",
                marginTop: 5 
              }}>
                예: user1, user2, user3
              </div>
            </div>
          )}
        </div>
        
        <div style={formGroupStyle}>
          <label style={labelStyle}>중요도</label>
          <div style={radioContainerStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="importance"
                value="normal"
                checked={importance === "normal"}
                onChange={() => setImportance("normal")}
                style={radioStyle}
              />
              일반
            </label>
            
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="importance"
                value="important"
                checked={importance === "important"}
                onChange={() => setImportance("important")}
                style={radioStyle}
              />
              중요
            </label>
            
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="importance"
                value="urgent"
                checked={importance === "urgent"}
                onChange={() => setImportance("urgent")}
                style={radioStyle}
              />
              긴급
            </label>
          </div>
        </div>
      </div>
      
      {/* 알림 미리보기 */}
      {showPreview && (
        <div>
          <h2 style={{ 
            fontSize: 18, 
            marginBottom: 15,
            color: darkMode ? "#ddd" : "#333"
          }}>
            알림 미리보기
          </h2>
          
          <div style={{
            ...notificationCardStyle,
            borderWidth: 2,
            borderStyle: "solid",
            borderColor: darkMode ? "#bb86fc" : "#7e57c2"
          }}>
            <div>
              <span style={importanceBadgeStyle(previewData.importance)}>
                {importanceStyles[previewData.importance].icon} {importance === "normal" ? "일반" : importance === "important" ? "중요" : "긴급"}
              </span>
            </div>
            
            <div style={notificationTitleStyle}>
              {previewData.title || "(제목 없음)"}
            </div>
            
            <div style={notificationMetaStyle}>
              <span>
                보낸이: {previewData.senderNickname} ({previewData.senderRole})
              </span>
              <span>
                {formatDate(previewData.createdAt)}
              </span>
            </div>
            
            <div style={{ 
              padding: "10px 0", 
              borderTop: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
              borderBottom: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
              margin: "10px 0",
              whiteSpace: "pre-wrap"
            }}>
              {previewData.message || "(내용 없음)"}
            </div>
            
            <div style={{ 
              fontSize: 13, 
              color: darkMode ? "#aaa" : "#757575" 
            }}>
              <strong>수신대상:</strong> {getTargetText(previewData)}
              {previewData.targetType === "specific" && previewData.targetUsers.length > 0 && (
                <div style={{ marginTop: 5 }}>
                  {previewData.targetUsers.map((user, index) => (
                    <span 
                      key={index}
                      style={{
                        display: "inline-block",
                        backgroundColor: darkMode ? "#444" : "#f0f0f0",
                        color: darkMode ? "#ddd" : "#555",
                        padding: "3px 8px",
                        borderRadius: 12,
                        fontSize: 12,
                        marginRight: 5,
                        marginBottom: 5
                      }}
                    >
                      {user}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 액션 버튼 영역 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        marginTop: 20
      }}>
        <button 
          onClick={() => setShowPreview(!showPreview)} 
          style={currentSecondaryBtn}
        >
          {showPreview ? "편집으로 돌아가기" : "미리보기"}
        </button>
        
        <button 
          onClick={send} 
          style={{
            ...currentPurpleBtn,
            opacity: loading ? 0.7 : 1
          }}
          disabled={loading}
        >
          {loading ? "전송 중..." : "알림 전송"}
        </button>
      </div>
      
      {/* 최근 알림 목록 */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ 
          fontSize: 18, 
          marginBottom: 15,
          color: darkMode ? "#ddd" : "#333",
          borderBottom: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
          paddingBottom: 10
        }}>
          최근 전송된 알림
        </h2>
        
        {recentNotifications.length === 0 ? (
          <p style={{ 
            textAlign: "center", 
            padding: 20,
            color: darkMode ? "#aaa" : "#666" 
          }}>
            최근 전송된 알림이 없습니다
          </p>
        ) : (
          recentNotifications.map(notification => (
            <div key={notification.id} style={notificationCardStyle}>
              <div>
                <span style={importanceBadgeStyle(notification.importance || "normal")}>
                  {importanceStyles[notification.importance || "normal"].icon} {
                    notification.importance === "important" ? "중요" : 
                    notification.importance === "urgent" ? "긴급" : "일반"
                  }
                </span>
              </div>
              
              <div style={notificationTitleStyle}>
                {notification.title || notification.message.substring(0, 30) + (notification.message.length > 30 ? "..." : "")}
              </div>
              
              <div style={notificationMetaStyle}>
                <span>
                  보낸이: {notification.senderNickname} {notification.senderRole ? `(${notification.senderRole})` : ""}
                </span>
                <span>
                  {formatDate(notification.createdAt)}
                </span>
              </div>
              
              <div style={{ fontSize: 13, color: darkMode ? "#aaa" : "#757575" }}>
                <strong>수신대상:</strong> {getTargetText(notification)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

SendNotification.propTypes = {
  darkMode: PropTypes.bool
};

SendNotification.defaultProps = {
  darkMode: false
};

export default SendNotification;
