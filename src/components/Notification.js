import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import {
  collection, query, orderBy, onSnapshot, limit, startAfter, getDocs,
  doc, updateDoc, deleteDoc, where, getDoc, writeBatch, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";
import CustomLink from "./CustomLink";

function NotificationCenter({ darkMode }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("notifications"); // "notifications", "notices", "notice-detail"
  const [selectedNoticeId, setSelectedNoticeId] = useState(null);

  // 탭 전환 함수
  const switchTab = (tab, noticeId = null) => {
    setActiveTab(tab);
    if (tab === "notice-detail" && noticeId) {
      setSelectedNoticeId(noticeId);
    }
  };

  // 컴포넌트 렌더링
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      {/* 탭 네비게이션 */}
      <div style={{ 
        display: "flex", 
        borderBottom: `1px solid ${darkMode ? "#444" : "#ddd"}`,
        marginBottom: "20px"
      }}>
        <TabButton 
          label="알림"
          isActive={activeTab === "notifications"}
          onClick={() => switchTab("notifications")}
          darkMode={darkMode}
        />
        <TabButton 
          label="공지사항"
          isActive={activeTab === "notices"} 
          onClick={() => switchTab("notices")}
          darkMode={darkMode}
        />
      </div>

      {/* 컨텐츠 영역 */}
      {activeTab === "notifications" && (
        <NotificationsTab darkMode={darkMode} navigate={navigate} />
      )}
      
      {activeTab === "notices" && (
        <NoticesTab 
          darkMode={darkMode} 
          onViewDetail={(noticeId) => switchTab("notice-detail", noticeId)} 
        />
      )}
      
      {activeTab === "notice-detail" && selectedNoticeId && (
        <NoticeDetailTab 
          darkMode={darkMode} 
          noticeId={selectedNoticeId}
          onBack={() => switchTab("notices")}
        />
      )}
    </div>
  );
}

// 탭 버튼 컴포넌트
function TabButton({ label, isActive, onClick, darkMode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 20px",
        backgroundColor: "transparent",
        color: isActive 
          ? (darkMode ? "#9575cd" : "#7e57c2") 
          : (darkMode ? "#aaa" : "#666"),
        border: "none",
        borderBottom: isActive 
          ? `2px solid ${darkMode ? "#9575cd" : "#7e57c2"}` 
          : "2px solid transparent",
        fontWeight: isActive ? "bold" : "normal",
        cursor: "pointer",
        fontSize: "16px",
        transition: "all 0.2s ease"
      }}
    >
      {label}
    </button>
  );
}

// 알림 탭 컴포넌트
function NotificationsTab({ darkMode, navigate }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("all"); // 'all', 'unread', 'read'
  const PAGE_SIZE = 10;
  
  // 현재 로그인한 사용자 닉네임 가져오기
  const currentUser = localStorage.getItem("nickname");
  
  // 기본 쿼리 생성 함수
  const createQuery = useCallback((startAfterDoc = null) => {
    if (!currentUser) return null;
    
    let baseQuery;
    
    // 필터에 따른 쿼리 조건 설정 (항상 현재 사용자의 알림만)
    if (filter === "unread") {
      baseQuery = query(
        collection(db, "notifications"),
        where("receiverNickname", "==", currentUser),
        where("isRead", "==", false),
        orderBy("createdAt", "desc")
      );
    } else if (filter === "read") {
      baseQuery = query(
        collection(db, "notifications"),
        where("receiverNickname", "==", currentUser),
        where("isRead", "==", true),
        orderBy("createdAt", "desc")
      );
    } else {
      baseQuery = query(
        collection(db, "notifications"),
        where("receiverNickname", "==", currentUser),
        orderBy("createdAt", "desc")
      );
    }
    
    // 페이지네이션 적용
    if (startAfterDoc) {
      return query(baseQuery, startAfter(startAfterDoc), limit(PAGE_SIZE));
    }
    
    return query(baseQuery, limit(PAGE_SIZE));
  }, [filter, currentUser]);
  
  // 초기 데이터 로드
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setError("로그인이 필요합니다.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const q = createQuery();
    
    if (!q) {
      setLoading(false);
      return;
    }
    
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
        isRead: doc.data().isRead || false, // 읽음 상태가 없으면 기본값 false
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
  }, [filter, createQuery, currentUser]); 
  
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
        isRead: doc.data().isRead || false,
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
        isRead: true
      });
    } catch (err) {
      console.error("알림 읽음 처리 오류:", err);
    }
  };
  
  // 선택된 알림 모두 읽음 처리
  const markAllAsRead = async () => {
    const unreadNotifications = list.filter(notification => !notification.isRead);
    
    if (unreadNotifications.length === 0) {
      alert("읽지 않은 알림이 없습니다.");
      return;
    }
    
    if (!window.confirm(`${unreadNotifications.length}개의 알림을 모두 읽음으로 표시하시겠습니까?`)) {
      return;
    }
    
    try {
      const promises = unreadNotifications.map(notification => 
        updateDoc(doc(db, "notifications", notification.id), { isRead: true })
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
  
  // 알림 클릭 핸들러 - 게시글로 이동 기능 추가
  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.read) {
        await markAsRead(notification.id);
      }
      
      // 알림 타입에 따라 다른 페이지로 라우팅
      if (notification.relatedPostId && notification.relatedPostType) {
        // 게시글 관련 알림인 경우 해당 게시글로 이동
        const url = `/post/${notification.relatedPostType}/${notification.relatedPostId}`;
        
        // 댓글이나 답글 관련 알림인 경우 해당 댓글로 스크롤
        if (notification.commentId) {
          navigate(`${url}?comment=${notification.commentId}`);
        } else {
          navigate(url);
        }
      } else if (notification.link) {
        // link 속성이 있는 경우 해당 URL로 이동
        navigate(notification.link);
      } else if (notification.targetUrl) {
        // targetUrl이 있는 경우 해당 URL로 이동
        navigate(notification.targetUrl);
      } else {
        // 기본 동작: 알림 메시지를 표시하고 홈으로 이동
        alert(notification.message || "알림을 확인했습니다.");
        navigate("/");
      }
    } catch (error) {
      console.error("알림 처리 중 오류:", error);
      alert("알림을 처리하는 중 오류가 발생했습니다.");
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
    <div>
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
            cursor: notification.relatedPostId || notification.relatedPostType || notification.targetUrl ? "pointer" : "default"
          }}
          onClick={() => {
            if (notification.relatedPostId || notification.relatedPostType || notification.targetUrl) {
              handleNotificationClick(notification);
            } else if (!notification.read) {
              markAsRead(notification.id);
            }
          }}
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
              {/* 이동 가능한 알림에 대한 표시 */}
              {(notification.relatedPostId || notification.relatedPostType || notification.targetUrl) && (
                <p style={{ 
                  fontSize: 12, 
                  color: darkMode ? "#9575cd" : "#7e57c2",
                  margin: "4px 0 0 0",
                  fontStyle: "italic"
                }}>
                  클릭하여 이동하기 →
                </p>
              )}
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
                  transition: "opacity 0.3s"
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = "1"}
                onMouseOut={(e) => e.currentTarget.style.opacity = "0.8"}
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

// 공지사항 목록 탭 컴포넌트
function NoticesTab({ darkMode, onViewDetail }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showOnlyImportant, setShowOnlyImportant] = useState(false);
  const PAGE_SIZE = 5;

  // 기본 쿼리 생성 함수
  const createQuery = useCallback((startAfterDoc = null) => {
    let baseQuery;
    
    // 중요 공지사항 필터링 옵션
    if (showOnlyImportant) {
      baseQuery = query(
        collection(db, "notices"),
        where("important", "==", true),
        orderBy("createdAt", "desc")
      );
    } else {
      baseQuery = query(
        collection(db, "notices"),
        orderBy("createdAt", "desc")
      );
    }
    
    // 페이지네이션 적용
    if (startAfterDoc) {
      return query(baseQuery, startAfter(startAfterDoc), limit(PAGE_SIZE));
    }
    
    return query(baseQuery, limit(PAGE_SIZE));
  }, [showOnlyImportant]);

  // 초기 데이터 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    
    const q = createQuery();
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setNotices([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 저장 (페이지네이션용)
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const noticeData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        important: doc.data().important || false // 중요 공지사항 여부
      }));
      
      setNotices(noticeData);
      setHasMore(noticeData.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("공지사항 불러오기 오류:", err);
      setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [showOnlyImportant, createQuery]); 

  // 더 많은 공지사항 로드
  const loadMoreNotices = async () => {
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
      
      const newNotices = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        important: doc.data().important || false
      }));
      
      setNotices(prev => [...prev, ...newNotices]);
      setHasMore(newNotices.length === PAGE_SIZE);
    } catch (err) {
      console.error("추가 공지사항 불러오기 오류:", err);
      setError("추가 공지사항을 불러오는 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };

   // 검색 기능
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      // 검색어가 없으면 기본 쿼리로 돌아감
      setIsSearching(false);
      setLoading(true);
      
      const q = createQuery();
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setNotices([]);
        setHasMore(false);
      } else {
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(lastDoc);
        
        const noticeData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          important: doc.data().important || false
        }));
        
        setNotices(noticeData);
        setHasMore(noticeData.length === PAGE_SIZE);
      }
      
      setLoading(false);
      return;
    }
    
    setIsSearching(true);
    setLoading(true);
    setError(null);
    
    try {
      // Firebase는 필드 내 부분 문자열 검색을 직접 지원하지 않지만
      // 클라이언트 측에서 필터링할 수 있음
      let baseQuery;
      
      if (showOnlyImportant) {
        baseQuery = query(
          collection(db, "notices"),
          where("important", "==", true),
          orderBy("createdAt", "desc")
        );
      } else {
        baseQuery = query(
          collection(db, "notices"),
          orderBy("createdAt", "desc")
        );
      }
      
      const querySnapshot = await getDocs(baseQuery);
      const filteredNotices = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), important: doc.data().important || false }))
        .filter(notice => 
          notice.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          (notice.content && notice.content.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      
      setNotices(filteredNotices);
      setHasMore(false); // 검색 시에는 페이지네이션 비활성화
    } catch (err) {
      console.error("공지사항 검색 오류:", err);
      setError("공지사항을 검색하는 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };

  // 검색어 변경 핸들러
  const handleSearchTermChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // 검색 폼 제출 핸들러
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  // 검색 초기화
  const clearSearch = () => {
    setSearchTerm("");
    setIsSearching(false);
    setLoading(true);
    
    // 기본 쿼리로 돌아가기
    const q = createQuery();
    
    onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setNotices([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const noticeData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        important: doc.data().important || false
      }));
      
      setNotices(noticeData);
      setHasMore(noticeData.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("공지사항 불러오기 오류:", err);
      setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
  };

  // 중요 공지사항 필터 토글
  const toggleImportantFilter = () => {
    setShowOnlyImportant(prev => !prev);
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

  // 내용 미리보기 생성 함수
  const createPreview = (content, maxLength = 100) => {
    if (!content) return "";
    
    // HTML 태그 제거
    const plainText = content.replace(/<[^>]*>/g, '');
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    
    return plainText.substring(0, maxLength) + "...";
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
  const getFilterButtonStyle = (isActive) => ({
    ...buttonStyle,
    backgroundColor: isActive ? "#7e57c2" : (darkMode ? "#555" : "#e0e0e0"),
    color: isActive ? "white" : (darkMode ? "#fff" : "#000")
  });

  // 검색 입력 스타일
  const inputStyle = {
    padding: "8px 12px",
    borderRadius: "4px",
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    backgroundColor: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#000",
    width: "100%",
    marginRight: "10px"
  };

  // 공지사항 카드 스타일
  const getNoticeCardStyle = (isImportant) => ({
    margin: "12px 0",
    padding: 14,
    borderRadius: 12,
    background: darkMode 
      ? (isImportant ? "#4a3154" : "#3a2a5a") 
      : (isImportant ? "#f8efff" : "#f3e7ff"),
    border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
    boxShadow: isImportant 
      ? `0 2px 10px ${darkMode ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.2)"}` 
      : "none",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer"
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <h1 style={titleStyle}>📢 공지사항</h1>
        
        {/* 중요 공지사항 필터 버튼 */}
        <button 
          onClick={toggleImportantFilter}
          style={getFilterButtonStyle(showOnlyImportant)}
        >
          {showOnlyImportant ? "전체 공지사항 보기" : "중요 공지사항만 보기"}
        </button>
      </div>
      
      {/* 검색 폼 */}
      <form onSubmit={handleSearchSubmit} style={{ 
        display: "flex", 
        marginBottom: "20px", 
        alignItems: "center" 
      }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchTermChange}
          placeholder="제목 또는 내용으로 검색"
          style={inputStyle}
        />
        <button 
          type="submit" 
          style={buttonStyle}
          disabled={loading}
        >
          검색
        </button>
        {isSearching && (
          <button 
            type="button" 
            onClick={clearSearch} 
            style={{
              ...buttonStyle,
              backgroundColor: darkMode ? "#555" : "#e0e0e0",
              color: darkMode ? "#fff" : "#000"
            }}
          >
            초기화
          </button>
        )}
      </form>
      
      {/* 결과 카운트 및 정보 */}
      {!loading && !error && (
        <div style={{ 
          marginBottom: "15px", 
          fontSize: "14px", 
          color: darkMode ? "#bbb" : "#666" 
        }}>
          {isSearching 
            ? `검색 결과: ${notices.length}개의 공지사항`
            : `${showOnlyImportant ? "중요 " : ""}공지사항: ${notices.length}개${hasMore ? ' 이상' : ''}`}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading && notices.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p>공지사항을 불러오는 중...</p>
          <div style={{ 
            width: "30px", 
            height: "30px", 
            border: "3px solid #f3e7ff", 
            borderTop: "3px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto" 
          }}></div>
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
            onClick={clearSearch}
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
      {!loading && !error && notices.length === 0 && (
        <div style={{ 
          padding: "30px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px"
        }}>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            {isSearching
              ? "검색 결과가 없습니다."
              : showOnlyImportant
                ? "중요 공지사항이 없습니다."
                : "공지사항이 없습니다."}
          </p>
          {isSearching && (
            <button 
              onClick={clearSearch}
              style={{
                padding: "8px 16px",
                backgroundColor: "#7e57c2",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                marginTop: "15px"
              }}
            >
              모든 공지사항 보기
            </button>
          )}
        </div>
      )}
      
      {/* 공지사항 목록 */}
      {notices.map(notice => (
        <div 
          key={notice.id} 
          style={getNoticeCardStyle(notice.important)}
          onClick={() => onViewDetail(notice.id)}
        >
          {/* 중요 공지사항 표시 */}
          {notice.important && (
            <div style={{ 
              display: "inline-block",
              margin: "0 0 8px 0",
              padding: "2px 8px",
              fontSize: "12px",
              backgroundColor: darkMode ? "#7e57c2" : "#d4b3ff",
              color: darkMode ? "white" : "#4a148c",
              borderRadius: "4px",
              fontWeight: "bold"
            }}>
              중요
            </div>
          )}
          
          <h3 style={{ 
            margin: notice.important ? "5px 0 10px" : "0 0 10px",
            fontSize: "18px",
            color: darkMode ? "#d4c2ff" : "#7e57c2",
          }}>
            {notice.title}
          </h3>
          
          {/* 내용 미리보기 */}
          {notice.content && (
            <p style={{ 
              fontSize: "14px", 
              color: darkMode ? "#bbb" : "#666",
              margin: "8px 0 12px",
              lineHeight: "1.4"
            }}>
              {createPreview(notice.content)}
            </p>
          )}
          
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center"
          }}>
            <p style={{ 
              fontSize: 12, 
              color: darkMode ? "#aaa" : "#666",
              margin: 0
            }}>
              {formatDate(notice.createdAt.seconds)}
            </p>
            
            {/* 글쓴이 정보가 있는 경우 표시 */}
            {notice.author && (
              <p style={{ 
                fontSize: 12, 
                color: darkMode ? "#aaa" : "#666",
                margin: 0
              }}>
                작성자: {notice.author.displayName || "관리자"}
              </p>
            )}
          </div>
          
          {/* 더 보기 링크 */}
          <p style={{ 
            marginTop: "10px",
            fontSize: "13px",
            color: darkMode ? "#9575cd" : "#673ab7",
            fontStyle: "italic"
          }}>
            자세히 보기 →
          </p>
        </div>
      ))}
      
      {/* 더 보기 버튼 */}
      {!isSearching && hasMore && !loading && notices.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button 
            onClick={loadMoreNotices}
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
      {loading && notices.length > 0 && (
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

// 공지사항 상세 보기 탭 컴포넌트
function NoticeDetailTab({ darkMode, noticeId, onBack }) {
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prevNotice, setPrevNotice] = useState(null);
  const [nextNotice, setNextNotice] = useState(null);
  
  // 공지사항 상세 정보 가져오기
  useEffect(() => {
    const fetchNoticeDetail = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 단일 문서 가져오기
        const noticeDoc = await getDoc(doc(db, "notices", noticeId));
        
        if (!noticeDoc.exists()) {
          setError("존재하지 않는 공지사항입니다.");
          setLoading(false);
          return;
        }
        
        const noticeData = { id: noticeDoc.id, ...noticeDoc.data() };
        setNotice(noticeData);
        
        // 이전/다음 공지사항 가져오기
        const createdAt = noticeData.createdAt;
        
        // 이전 공지사항 (현재보다 최신)
        const prevQuery = query(
          collection(db, "notices"),
          where("createdAt", ">", createdAt),
          orderBy("createdAt", "asc"),
          limit(1)
        );
        
        // 다음 공지사항 (현재보다 오래된)
        const nextQuery = query(
          collection(db, "notices"),
          where("createdAt", "<", createdAt),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        
        const [prevSnapshot, nextSnapshot] = await Promise.all([
          getDocs(prevQuery),
          getDocs(nextQuery)
        ]);
        
        if (!prevSnapshot.empty) {
          const prevDoc = prevSnapshot.docs[0];
          setPrevNotice({ id: prevDoc.id, title: prevDoc.data().title });
        } else {
          setPrevNotice(null);
        }
        
        if (!nextSnapshot.empty) {
          const nextDoc = nextSnapshot.docs[0];
          setNextNotice({ id: nextDoc.id, title: nextDoc.data().title });
        } else {
          setNextNotice(null);
        }
      } catch (err) {
        console.error("공지사항 상세 정보 로드 오류:", err);
        setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      }
      
      setLoading(false);
    };
    
    fetchNoticeDetail();
  }, [noticeId]);

  // 날짜 포맷팅 함수
  const formatDate = (seconds) => {
    const date = new Date(seconds * 1000);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}년 ${month}월 ${day}일 ${hours}:${minutes}`;
  };

  // HTML 내용을 안전하게 렌더링하는 함수
  const createMarkup = (htmlContent) => {
    return { __html: htmlContent };
  };

  // 로딩 중 상태
  if (loading) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 0"
      }}>
        <div style={{ 
          width: "40px", 
          height: "40px", 
          border: "4px solid #f3e7ff", 
          borderTop: "4px solid #7e57c2", 
          borderRadius: "50%", 
          animation: "spin 1s linear infinite", 
          margin: "0 auto 20px" 
        }}></div>
        <p>공지사항을 불러오는 중...</p>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 20px"
      }}>
        <div style={{ 
          padding: "20px", 
          backgroundColor: darkMode ? "#482121" : "#ffebee",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <p style={{ color: "#d32f2f", margin: 0 }}>{error}</p>
        </div>
        <button 
          onClick={onBack}
          style={{
            padding: "10px 20px",
            backgroundColor: "#7e57c2",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px"
          }}
        >
          공지사항 목록으로 돌아가기
        </button>
      </div>
    );
  }

  // 공지사항이 없는 경우
  if (!notice) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 20px"
      }}>
        <div style={{ 
          padding: "20px", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <p style={{ color: darkMode ? "#bbb" : "#666", margin: 0 }}>
            존재하지 않는 공지사항입니다.
          </p>
        </div>
        <button 
          onClick={onBack}
          style={{
            padding: "10px 20px",
            backgroundColor: "#7e57c2",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px"
          }}
        >
          공지사항 목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "20px",
      borderRadius: "8px",
      boxShadow: `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`
    }}>
      {/* 상단 네비게이션 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "20px"
      }}>
        <button 
          onClick={onBack}
          style={{
            padding: "8px 16px",
            backgroundColor: darkMode ? "#444" : "#f0f0f0",
            color: darkMode ? "#fff" : "#333",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            fontSize: "14px"
          }}
        >
          ← 목록으로
        </button>
        
        <div>
          {notice.important && (
            <span style={{ 
              display: "inline-block",
              padding: "4px 10px",
              backgroundColor: darkMode ? "#7e57c2" : "#d4b3ff",
              color: darkMode ? "white" : "#4a148c",
              borderRadius: "4px",
              fontWeight: "bold",
              fontSize: "14px"
            }}>
              중요 공지사항
            </span>
          )}
        </div>
      </div>
      
      {/* 공지사항 헤더 */}
      <div style={{
        padding: "15px",
        backgroundColor: darkMode ? "#333" : "#f9f4ff",
        borderRadius: "8px",
        marginBottom: "20px"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          color: darkMode ? "#e0e0e0" : "#333",
          margin: "0 0 15px 0"
        }}>
          {notice.title}
        </h1>
        
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          borderTop: `1px solid ${darkMode ? "#444" : "#ddd"}`,
          paddingTop: "12px",
          color: darkMode ? "#aaa" : "#666"
        }}>
          <div style={{ fontSize: 14 }}>
            <span>작성자: {notice.author?.displayName || notice.nickname || "관리자"}</span>
          </div>
          
          <div style={{ fontSize: 14 }}>
            <span>작성일: {formatDate(notice.createdAt.seconds)}</span>
          </div>
        </div>
      </div>
      
      {/* 공지사항 내용 */}
      <div 
        style={{ 
          marginTop: 20,
          padding: "20px",
          backgroundColor: darkMode ? "#2a2a2a" : "#fff",
          borderRadius: "8px",
          lineHeight: "1.6",
          fontSize: "16px",
          color: darkMode ? "#e0e0e0" : "#333",
          minHeight: "200px"
        }}
        dangerouslySetInnerHTML={createMarkup(notice.content)}
      />
      
      {/* 첨부 파일 (있는 경우) */}
      {notice.attachments && notice.attachments.length > 0 && (
        <div style={{
          marginTop: "30px",
          padding: "15px",
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px"
        }}>
          <h3 style={{ 
            fontSize: "16px", 
            color: darkMode ? "#e0e0e0" : "#333",
            margin: "0 0 10px 0"
          }}>
            첨부 파일
          </h3>
          
          <ul style={{
            listStyle: "none",
            padding: 0,
            margin: 0
          }}>
            {notice.attachments.map((file, index) => (
              <li key={index} style={{ marginBottom: "8px" }}>
                <a 
                  href={file.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: darkMode ? "#9575cd" : "#7e57c2",
                    textDecoration: "none"
                  }}
                >
                  <span style={{
                    marginRight: "8px",
                    fontSize: "18px"
                  }}>
                    📎
                  </span>
                  <span>{file.name || `첨부파일 ${index + 1}`}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* 이전/다음 공지사항 네비게이션 */}
      <div style={{
        marginTop: "40px",
        display: "flex",
        justifyContent: "space-between",
        padding: "15px 0",
        borderTop: `1px solid ${darkMode ? "#444" : "#ddd"}`
      }}>
        <div style={{ flex: 1 }}>
          {prevNotice ? (
            <div 
              onClick={() => onBack && onBack(prevNotice.id)}
              style={{
                padding: "10px",
                color: darkMode ? "#9575cd" : "#7e57c2",
                cursor: "pointer"
              }}
            >
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#888", marginBottom: "5px" }}>
                이전 공지사항
              </div>
              <div style={{ 
                whiteSpace: "nowrap", 
                overflow: "hidden", 
                textOverflow: "ellipsis"
              }}>
                ← {prevNotice.title}
              </div>
            </div>
          ) : (
            <div style={{ padding: "10px", color: darkMode ? "#555" : "#ccc" }}>
              <div style={{ fontSize: "14px", marginBottom: "5px" }}>
                이전 공지사항
              </div>
              <div>처음 공지사항입니다</div>
            </div>
          )}
        </div>
        
        <div style={{ 
          width: "1px", 
          backgroundColor: darkMode ? "#444" : "#ddd", 
          margin: "0 15px" 
        }} />
        
        <div style={{ flex: 1, textAlign: "right" }}>
          {nextNotice ? (
            <div 
              onClick={() => onBack && onBack(nextNotice.id)}
              style={{
                padding: "10px",
                color: darkMode ? "#9575cd" : "#7e57c2",
                cursor: "pointer"
              }}
            >
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#888", marginBottom: "5px" }}>
                다음 공지사항
              </div>
              <div style={{ 
                whiteSpace: "nowrap", 
                overflow: "hidden", 
                textOverflow: "ellipsis"
              }}>
                {nextNotice.title} →
              </div>
            </div>
          ) : (
            <div style={{ padding: "10px", color: darkMode ? "#555" : "#ccc" }}>
              <div style={{ fontSize: "14px", marginBottom: "5px" }}>
                다음 공지사항
              </div>
              <div>마지막 공지사항입니다</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// PropTypes 정의
TabButton.propTypes = {
  label: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  darkMode: PropTypes.bool
};

NotificationsTab.propTypes = {
  darkMode: PropTypes.bool,
  navigate: PropTypes.func.isRequired
};

NoticesTab.propTypes = {
  darkMode: PropTypes.bool,
  onViewDetail: PropTypes.func.isRequired
};

NoticeDetailTab.propTypes = {
  darkMode: PropTypes.bool,
  noticeId: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired
};

NotificationCenter.propTypes = {
  darkMode: PropTypes.bool
};

NotificationCenter.defaultProps = {
  darkMode: false
};

export default NotificationCenter;