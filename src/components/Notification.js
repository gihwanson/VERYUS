import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, limit, startAfter, getDocs,
  doc, updateDoc, deleteDoc, where
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function Notification({ darkMode }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("all"); // 'all', 'unread', 'read'
  const PAGE_SIZE = 10;
  
  // 기본 쿼리 생성 함수
  const createQuery = (startAfterDoc = null) => {
    let baseQuery;
    
    // 필터에 따른 쿼리 조건 설정
    if (filter === "unread") {
      baseQuery = query(
        collection(db, "notifications"),
        where("read", "==", false),
        orderBy("createdAt", "desc")
      );
    } else if (filter === "read") {
      baseQuery = query(
        collection(db, "notifications"),
        where("read", "==", true),
        orderBy("createdAt", "desc")
      );
    } else {
      baseQuery = query(
        collection(db, "notifications"),
        orderBy("createdAt", "desc")
      );
    }
    
    // 페이지네이션 적용
    if (startAfterDoc) {
      return query(baseQuery, startAfter(startAfterDoc), limit(PAGE_SIZE));
    }
    
    return query(baseQuery, limit(PAGE_SIZE));
  };
  
  // 초기 데이터 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    
    const q = createQuery();
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setList([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 저장 (페이지네이션용)
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false, // 읽음 상태가 없으면 기본값 false
        type: doc.data().type || "default", // 알림 유형이 없으면 기본값 "default"
      }));
      
      setList(notifications);
      setHasMore(notifications.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("알림 불러오기 오류:", err);
      setError("알림을 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [filter]); // 필터가 변경될 때마다 다시 로드
  
  // 더 많은 알림 로드
  const loadMoreNotifications = async () => {
    if (!lastVisible || !hasMore || loading) return;
    
    setLoading(true);
    
    try {
      const q = createQuery(lastVisible);
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 업데이트
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false,
        type: doc.data().type || "default",
      }));
      
      setList(prev => [...prev, ...newNotifications]);
      setHasMore(newNotifications.length === PAGE_SIZE);
    } catch (err) {
      console.error("추가 알림 불러오기 오류:", err);
      setError("추가 알림을 불러오는 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };
  
  // 필터 변경 핸들러
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
  };
  
  // 알림 읽음 처리
  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true
      });
    } catch (err) {
      console.error("알림 읽음 처리 오류:", err);
    }
  };
  
  // 선택된 알림 모두 읽음 처리
  const markAllAsRead = async () => {
    const unreadNotifications = list.filter(notification => !notification.read);
    
    if (unreadNotifications.length === 0) {
      alert("읽지 않은 알림이 없습니다.");
      return;
    }
    
    if (!window.confirm(`${unreadNotifications.length}개의 알림을 모두 읽음으로 표시하시겠습니까?`)) {
      return;
    }
    
    try {
      const promises = unreadNotifications.map(notification => 
        updateDoc(doc(db, "notifications", notification.id), { read: true })
      );
      
      await Promise.all(promises);
      alert("모든 알림이 읽음으로 표시되었습니다.");
    } catch (err) {
      console.error("일괄 읽음 처리 오류:", err);
      alert("알림 읽음 처리 중 오류가 발생했습니다.");
    }
  };
  
  // 알림 삭제
  const deleteNotification = async (id) => {
    if (!window.confirm("이 알림을 삭제하시겠습니까?")) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      console.error("알림 삭제 오류:", err);
      alert("알림 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 모든 알림 삭제
  const deleteAllNotifications = async () => {
    if (list.length === 0) {
      alert("삭제할 알림이 없습니다.");
      return;
    }
    
    if (!window.confirm(`${list.length}개의 알림을 모두 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`)) {
      return;
    }
    
    try {
      const promises = list.map(notification => 
        deleteDoc(doc(db, "notifications", notification.id))
      );
      
      await Promise.all(promises);
      alert("모든 알림이 삭제되었습니다.");
    } catch (err) {
      console.error("알림 일괄 삭제 오류:", err);
      alert("알림 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 날짜 포맷팅 함수
  const formatDate = (seconds) => {
    const date = new Date(seconds * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) {
      return "방금 전";
    } else if (diffMin < 60) {
      return `${diffMin}분 전`;
    } else if (diffHour < 24) {
      return `${diffHour}시간 전`;
    } else if (diffDay < 7) {
      return `${diffDay}일 전`;
    } else {
      return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
    }
  };
  
  // 알림 유형에 따른 아이콘 반환
  const getNotificationIcon = (type) => {
    switch (type) {
      case "message":
        return "📩"; // 쪽지
      case "comment":
        return "💬"; // 댓글
      case "like":
        return "❤️"; // 좋아요
      case "follow":
        return "👤"; // 팔로우
      case "system":
        return "🔧"; // 시스템
      case "warning":
        return "⚠️"; // 경고
      default:
        return "🔔"; // 기본 알림
    }
  };
  
  // 알림 유형에 따른 배경색 반환
  const getNotificationBackground = (type, isRead) => {
    if (isRead) {
      return darkMode ? "#333" : "#f5f5f5";
    }
    
    switch (type) {
      case "message":
        return darkMode ? "#2c3e50" : "#e3f2fd"; // 파란 계열
      case "comment":
        return darkMode ? "#2d4330" : "#e8f5e9"; // 초록 계열
      case "like":
        return darkMode ? "#4a2c2c" : "#fce4ec"; // 분홍 계열
      case "follow":
        return darkMode ? "#3c3054" : "#ede7f6"; // 보라 계열
      case "warning":
        return darkMode ? "#4d3319" : "#fff3e0"; // 주황 계열
      case "system":
        return darkMode ? "#424242" : "#eeeeee"; // 회색 계열
      default:
        return darkMode ? "#333" : "#f5f5f5";
    }
  };
  
  // 버튼 스타일
  const buttonStyle = {
    padding: "6px 12px",
    backgroundColor: "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    margin: "0 5px 0 0"
  };
  
  // 필터 버튼 스타일
  const getFilterButtonStyle = (buttonFilter) => ({
    ...buttonStyle,
    backgroundColor: filter === buttonFilter ? "#7e57c2" : (darkMode ? "#555" : "#e0e0e0"),
    color: filter === buttonFilter ? "white" : (darkMode ? "#fff" : "#000")
  });

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <h1 style={titleStyle}>🔔 알림 목록</h1>
        
        <div>
          <button 
            onClick={markAllAsRead}
            style={{
              ...buttonStyle,
              backgroundColor: "#4caf50"
            }}
            disabled={list.filter(n => !n.read).length === 0}
          >
            모두 읽음
          </button>
          <button 
            onClick={deleteAllNotifications}
            style={{
              ...buttonStyle,
              backgroundColor: "#f44336"
            }}
            disabled={list.length === 0}
          >
            모두 삭제
          </button>
        </div>
      </div>
      
      {/* 필터 버튼 */}
      <div style={{ marginBottom: "20px" }}>
        <button 
          onClick={() => handleFilterChange("all")}
          style={getFilterButtonStyle("all")}
        >
          전체 보기
        </button>
        <button 
          onClick={() => handleFilterChange("unread")}
          style={getFilterButtonStyle("unread")}
        >
          읽지 않음
        </button>
        <button 
          onClick={() => handleFilterChange("read")}
          style={getFilterButtonStyle("read")}
        >
          읽음
        </button>
      </div>
      
      {/* 읽지 않은 알림 카운트 */}
      {!loading && !error && (
        <div style={{ 
          marginBottom: "15px", 
          fontSize: "14px", 
          color: darkMode ? "#bbb" : "#666" 
        }}>
          {filter === "all" && (
            <>
              전체: <strong>{list.length}개</strong> {hasMore ? '이상' : ''}
              {' | '}
              읽지 않음: <strong>{list.filter(n => !n.read).length}개</strong>
            </>
          )}
          {filter === "unread" && (
            <>읽지 않은 알림: <strong>{list.length}개</strong> {hasMore ? '이상' : ''}</>
          )}
          {filter === "read" && (
            <>읽은 알림: <strong>{list.length}개</strong> {hasMore ? '이상' : ''}</>
          )}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading && list.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p>알림을 불러오는 중...</p>
          <div style={{ 
            width: "30px", 
            height: "30px", 
            border: "3px solid #f3e7ff", 
            borderTop: "3px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto" 
          }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      
      {/* 에러 상태 */}
      {error && (
        <div style={{ 
          padding: "20px", 
          textAlign: "center", 
          color: "#d32f2f",
          backgroundColor: darkMode ? "#482121" : "#ffebee",
          borderRadius: "8px"
        }}>
          <p>{error}</p>
          <button 
            onClick={() => handleFilterChange(filter)}
            style={{
              padding: "8px 16px",
              backgroundColor: "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginTop: "10px"
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      
      {/* 빈 상태 */}
      {!loading && !error && list.length === 0 && (
        <div style={{ 
          padding: "30px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px"
        }}>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            {filter === "all"
              ? "등록된 알림이 없습니다."
              : filter === "unread"
                ? "읽지 않은 알림이 없습니다."
                : "읽은 알림이 없습니다."
            }
          </p>
        </div>
      )}
      
      {/* 알림 목록 */}
      {list.map(notification => (
        <div 
          key={notification.id} 
          style={{
            margin: "10px 0", 
            padding: 12, 
            borderRadius: 8,
            background: getNotificationBackground(notification.type, notification.read),
            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
            opacity: notification.read ? 0.8 : 1,
            position: "relative",
            transition: "background-color 0.3s ease",
            cursor: "default"
          }}
          onClick={() => !notification.read && markAsRead(notification.id)}
        >
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ 
              fontSize: "20px", 
              marginRight: "10px",
              width: "24px"
            }}>
              {getNotificationIcon(notification.type)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ 
                margin: "0 0 8px 0",
                fontSize: "15px",
                color: darkMode ? "#e0e0e0" : "#333",
                fontWeight: notification.read ? "normal" : "bold"
              }}>
                {notification.message}
              </p>
              <p style={{ 
                fontSize: 12, 
                color: darkMode ? "#aaa" : "#666",
                margin: 0
              }}>
                {formatDate(notification.createdAt.seconds)}
              </p>
            </div>
            <div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(notification.id);
                }}
                style={{
                  padding: "4px 8px",
                  backgroundColor: darkMode ? "#555" : "#e0e0e0",
                  color: darkMode ? "#fff" : "#000",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  opacity: 0.8,
                  transition: "opacity 0.3s",
                  ":hover": { opacity: 1 }
                }}
              >
                삭제
              </button>
            </div>
          </div>
          
          {/* 읽지 않은 알림 표시 */}
          {!notification.read && (
            <div style={{ 
              position: "absolute", 
              top: "8px", 
              right: "8px", 
              width: "8px", 
              height: "8px", 
              borderRadius: "50%", 
              backgroundColor: "#f44336"
            }} />
          )}
        </div>
      ))}
      
      {/* 더 보기 버튼 */}
      {hasMore && !loading && list.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button 
            onClick={loadMoreNotifications}
            style={{
              padding: "10px 20px",
              backgroundColor: "#7e57c2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            더 보기
          </button>
        </div>
      )}
      
      {/* 추가 로딩 인디케이터 */}
      {loading && list.length > 0 && (
        <div style={{ textAlign: "center", padding: "15px 0" }}>
          <div style={{ 
            width: "20px", 
            height: "20px", 
            border: "2px solid #f3e7ff", 
            borderTop: "2px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto" 
          }}></div>
        </div>
      )}
    </div>
  );
}

Notification.propTypes = {
  darkMode: PropTypes.bool
};

Notification.defaultProps = {
  darkMode: false
};

export default Notification;
