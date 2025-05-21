import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc,
  limit, startAfter, getDocs, where
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, smallBtn
} from "./style";

function MessageBox({ darkMode, mode = "inbox" }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all', 'unread', 'read' - 받은 쪽지함에서만 사용
  const [showReplyForm, setShowReplyForm] = useState(null); // 답장 폼을 보여줄 메시지 ID
  const [replyContent, setReplyContent] = useState(""); // 답장 내용
  
  const me = localStorage.getItem("nickname");
  const PAGE_SIZE = 10;
  
  const isInbox = mode === "inbox";
  
  // 기본 쿼리 생성 함수
  const createQuery = (startAfterDoc = null) => {
    let baseQuery;
    
    if (isInbox) {
      // 받은 쪽지함 쿼리
      if (filter === "unread") {
        baseQuery = query(
          collection(db, "messages"),
          where("receiverNickname", "==", me),
          where("read", "==", false),
          orderBy("createdAt", "desc")
        );
      } else if (filter === "read") {
        baseQuery = query(
          collection(db, "messages"),
          where("receiverNickname", "==", me),
          where("read", "==", true),
          orderBy("createdAt", "desc")
        );
      } else {
        baseQuery = query(
          collection(db, "messages"),
          where("receiverNickname", "==", me),
          orderBy("createdAt", "desc")
        );
      }
    } else {
      // 보낸 쪽지함 쿼리
      baseQuery = query(
        collection(db, "messages"),
        where("senderNickname", "==", me),
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
    if (!me) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    setMsgs([]); // 모드 전환 시 기존 메시지 초기화
    
    const q = createQuery();
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setMsgs([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 저장 (페이지네이션용)
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false // 읽음 상태가 없으면 기본값 false
      }));
      
      setMsgs(messages);
      setHasMore(messages.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    // 선택된 메시지 및 답장 폼 초기화
    setSelectedMsgId(null);
    setShowReplyForm(null);
    setReplyContent("");
    
    return () => unsubscribe();
  }, [me, mode, filter]); // 모드나 필터가 변경될 때마다 다시 로드
  
  // 더 많은 쪽지 로드
  const loadMoreMessages = async () => {
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
      
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      setMsgs(prev => [...prev, ...newMessages]);
      setHasMore(newMessages.length === PAGE_SIZE);
    } catch (err) {
      console.error("추가 쪽지 불러오기 오류:", err);
      setError("추가 쪽지를 불러오는 중 오류가 발생했습니다.");
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
        setMsgs([]);
        setHasMore(false);
      } else {
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(lastDoc);
        
        const messages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          read: doc.data().read || false
        }));
        
        setMsgs(messages);
        setHasMore(messages.length === PAGE_SIZE);
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
      
      if (isInbox) {
        if (filter === "unread") {
          baseQuery = query(
            collection(db, "messages"),
            where("receiverNickname", "==", me),
            where("read", "==", false),
            orderBy("createdAt", "desc")
          );
        } else if (filter === "read") {
          baseQuery = query(
            collection(db, "messages"),
            where("receiverNickname", "==", me),
            where("read", "==", true),
            orderBy("createdAt", "desc")
          );
        } else {
          baseQuery = query(
            collection(db, "messages"),
            where("receiverNickname", "==", me),
            orderBy("createdAt", "desc")
          );
        }
      } else {
        baseQuery = query(
          collection(db, "messages"),
          where("senderNickname", "==", me),
          orderBy("createdAt", "desc")
        );
      }
      
      const querySnapshot = await getDocs(baseQuery);
      const filteredMsgs = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), read: doc.data().read || false }))
        .filter(msg => {
          const contentMatch = msg.content.toLowerCase().includes(searchTerm.toLowerCase());
          let personMatch = false;
          
          // 받은 쪽지함에서는 보낸 사람으로, 보낸 쪽지함에서는 받는 사람으로 검색
          if (isInbox) {
            personMatch = msg.senderNickname && msg.senderNickname.toLowerCase().includes(searchTerm.toLowerCase());
          } else {
            personMatch = msg.receiverNickname && msg.receiverNickname.toLowerCase().includes(searchTerm.toLowerCase());
          }
          
          return contentMatch || personMatch;
        });
      
      setMsgs(filteredMsgs);
      setHasMore(false); // 검색 시에는 페이지네이션 비활성화
    } catch (err) {
      console.error("쪽지 검색 오류:", err);
      setError("쪽지를 검색하는 중 오류가 발생했습니다.");
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
        setMsgs([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      setMsgs(messages);
      setHasMore(messages.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
  };
  
  // 필터 변경 핸들러 (받은 쪽지함에서만 사용)
  const handleFilterChange = (newFilter) => {
    if (isInbox) {
      setFilter(newFilter);
    }
  };
  
  // 쪽지 읽음 처리 (받은 쪽지함에서만 사용)
  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "messages", id), {
        read: true
      });
    } catch (err) {
      console.error("쪽지 읽음 처리 오류:", err);
    }
  };
  
  // 선택된 쪽지 읽음 처리 (받은 쪽지함에서만 사용)
  const handleMarkAsRead = async (id) => {
    if (!id || !isInbox) return;
    
    try {
      await markAsRead(id);
      
      // 상태 업데이트
      setMsgs(prev => 
        prev.map(msg => 
          msg.id === id ? { ...msg, read: true } : msg
        )
      );
    } catch (err) {
      console.error("쪽지 읽음 처리 오류:", err);
    }
  };
  
  // 선택된 모든 쪽지 읽음 처리 (받은 쪽지함에서만 사용)
  const markAllAsRead = async () => {
    if (!isInbox) return;
    
    const unreadMessages = msgs.filter(msg => !msg.read);
    
    if (unreadMessages.length === 0) {
      alert("읽지 않은 쪽지가 없습니다.");
      return;
    }
    
    if (!window.confirm(`${unreadMessages.length}개의 쪽지를 모두 읽음으로 표시하시겠습니까?`)) {
      return;
    }
    
    try {
      const promises = unreadMessages.map(msg => 
        updateDoc(doc(db, "messages", msg.id), { read: true })
      );
      
      await Promise.all(promises);
      
      // 상태 업데이트
      setMsgs(prev => 
        prev.map(msg => ({ ...msg, read: true }))
      );
      
      alert("모든 쪽지가 읽음으로 표시되었습니다.");
    } catch (err) {
      console.error("일괄 읽음 처리 오류:", err);
      alert("쪽지 읽음 처리 중 오류가 발생했습니다.");
    }
  };
  
  // 쪽지 삭제
  const deleteMessage = async (id) => {
    if (!window.confirm("이 쪽지를 삭제하시겠습니까?")) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, "messages", id));
      // 상태 업데이트
      setMsgs(prev => prev.filter(msg => msg.id !== id));
      // 선택된 쪽지가 삭제된 경우 초기화
      if (selectedMsgId === id) {
        setSelectedMsgId(null);
      }
      if (showReplyForm === id) {
        setShowReplyForm(null);
        setReplyContent("");
      }
    } catch (err) {
      console.error("쪽지 삭제 오류:", err);
      alert("쪽지 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 모든 쪽지 삭제
  const deleteAllMessages = async () => {
    if (msgs.length === 0) {
      alert("삭제할 쪽지가 없습니다.");
      return;
    }
    
    const confirmMsg = isInbox 
      ? `${msgs.length}개의 쪽지를 모두 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`
      : `보낸 쪽지 ${msgs.length}개를 모두 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`;
      
    if (!window.confirm(confirmMsg)) {
      return;
    }
    
    try {
      const promises = msgs.map(msg => 
        deleteDoc(doc(db, "messages", msg.id))
      );
      
      await Promise.all(promises);
      
      // 상태 업데이트
      setMsgs([]);
      setSelectedMsgId(null);
      setShowReplyForm(null);
      setReplyContent("");
      
      alert("모든 쪽지가 삭제되었습니다.");
    } catch (err) {
      console.error("쪽지 일괄 삭제 오류:", err);
      alert("쪽지 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 쪽지 선택 토글
  const toggleMessageSelect = async (id, isRead) => {
    // 받은 쪽지함에서 읽지 않은 쪽지를 선택한 경우 읽음 처리
    if (isInbox && !isRead) {
      await handleMarkAsRead(id);
    }
    
    setSelectedMsgId(prev => prev === id ? null : id);
    
    // 답장 폼이 열려있고 다른 쪽지를 선택한 경우, 답장 폼 초기화
    if (showReplyForm && showReplyForm !== id) {
      setShowReplyForm(null);
      setReplyContent("");
    }
  };
  
  // 답장 폼 토글 (받은 쪽지함에서만 사용)
  const toggleReplyForm = (id, originalContent, senderNickname) => {
    if (!isInbox) return;
    
    if (showReplyForm === id) {
      setShowReplyForm(null);
      setReplyContent("");
    } else {
      setShowReplyForm(id);
      // 원본 메시지에 > 표시를 붙여서 인용 형태로 표시
      const quotedMessage = originalContent
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
      setReplyContent(`\n\n${quotedMessage}`);
    }
  };
  
  // 답장 내용 변경 핸들러
  const handleReplyContentChange = (e) => {
    setReplyContent(e.target.value);
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
      return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
  };
  
  // 카드 스타일 - 다크모드와 읽음 상태에 따라 조정
  const getCardStyle = (isRead, isSelected) => {
    // 받은 쪽지함에서는 읽음 상태를 스타일에 반영
    if (isInbox) {
      return {
        margin: "12px 0",
        padding: 14,
        borderRadius: 12,
        background: darkMode 
          ? (isSelected ? "#4a3a7a" : isRead ? "#2d2d3d" : "#3a2a5a") 
          : (isSelected ? "#e6d6ff" : isRead ? "#f5f5f5" : "#f3e7ff"),
        border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
        color: darkMode ? "#e0e0e0" : "#000",
        cursor: "pointer",
        transition: "background-color 0.2s",
        position: "relative",
        opacity: isRead ? 0.85 : 1
      };
    } else {
      // 보낸 쪽지함에서는 읽음 상태를 스타일에 덜 강조
      return {
        margin: "12px 0",
        padding: 14,
        borderRadius: 12,
        background: darkMode 
          ? (isSelected ? "#4a3a7a" : "#3a2a5a") 
          : (isSelected ? "#e6d6ff" : "#f3e7ff"),
        border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
        color: darkMode ? "#e0e0e0" : "#000",
        cursor: "pointer",
        transition: "background-color 0.2s",
        position: "relative"
      };
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
  
  // 텍스트 영역 스타일
  const textareaStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: "4px",
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    backgroundColor: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#000",
    minHeight: "100px",
    resize: "vertical",
    marginBottom: "10px",
    fontSize: "14px",
    fontFamily: "inherit"
  };
  
  // 모드에 따른 제목과 검색 플레이스홀더 설정
  const title = isInbox ? "📨 받은 쪽지함" : "✉️ 보낸 쪽지함";
  const searchPlaceholder = isInbox 
    ? "보낸 사람 또는 내용으로 검색" 
    : "받는 사람 또는 내용으로 검색";

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "15px" 
      }}>
        <h1 style={titleStyle}>{title}</h1>
        
        {isInbox && (
          <div>
            <button 
              onClick={markAllAsRead}
              style={{
                ...buttonStyle,
                backgroundColor: "#4caf50"
              }}
              disabled={msgs.filter(m => !m.read).length === 0}
            >
              모두 읽음
            </button>
            <button 
              onClick={deleteAllMessages}
              style={{
                ...buttonStyle,
                backgroundColor: "#f44336"
              }}
              disabled={msgs.length === 0}
            >
              모두 삭제
            </button>
          </div>
        )}
        
        {!isInbox && msgs.length > 0 && (
          <div>
            <button 
              onClick={deleteAllMessages}
              style={{
                ...buttonStyle,
                backgroundColor: "#f44336"
              }}
            >
              모두 삭제
            </button>
          </div>
        )}
      </div>
      
      {/* 모드 전환 버튼 */}
      <div style={{ 
        display: "flex", 
        marginBottom: "20px",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <button 
            onClick={() => window.location.href = "/inbox"}
            style={{
              ...buttonStyle,
              backgroundColor: isInbox ? "#7e57c2" : (darkMode ? "#555" : "#e0e0e0"),
              color: isInbox ? "white" : (darkMode ? "#fff" : "#000")
            }}
          >
            받은 쪽지함
          </button>
          <button 
            onClick={() => window.location.href = "/outbox"}
            style={{
              ...buttonStyle,
              backgroundColor: !isInbox ? "#7e57c2" : (darkMode ? "#555" : "#e0e0e0"),
              color: !isInbox ? "white" : (darkMode ? "#fff" : "#000")
            }}
          >
            보낸 쪽지함
          </button>
        </div>
        
        {/* 새 쪽지 작성 버튼 */}
        <CustomLink 
          to={`/send-message/`}
          style={{
            ...buttonStyle,
            backgroundColor: "#00a0a0",
            color: "white",
            textDecoration: "none",
            display: "inline-block"
          }}
        >
          + 새 쪽지
        </CustomLink>
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
          placeholder={searchPlaceholder}
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
      
      {/* 필터 버튼 - 받은 쪽지함에서만 표시 */}
      {isInbox && (
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
      )}
      
      {/* 쪽지 카운트 */}
      {!loading && !error && (
        <div style={{ 
          marginBottom: "15px", 
          fontSize: "14px", 
          color: darkMode ? "#bbb" : "#666" 
        }}>
          {isInbox ? (
            filter === "all" ? (
              <>
                전체: <strong>{msgs.length}개</strong> {hasMore ? '이상' : ''}
                {' | '}
                읽지 않음: <strong>{msgs.filter(m => !m.read).length}개</strong>
              </>
            ) : filter === "unread" ? (
              <>읽지 않은 쪽지: <strong>{msgs.length}개</strong> {hasMore ? '이상' : ''}</>
            ) : (
              <>읽은 쪽지: <strong>{msgs.length}개</strong> {hasMore ? '이상' : ''}</>
            )
          ) : (
            isSearching 
              ? <><strong>{msgs.length}개</strong>의 검색 결과</>
              : <>보낸 쪽지: <strong>{msgs.length}개</strong> {hasMore ? '이상' : ''}</>
          )}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading && msgs.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p>쪽지를 불러오는 중...</p>
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
      {!loading && !error && msgs.length === 0 && (
        <div style={{ 
          padding: "30px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px"
        }}>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            {isSearching
              ? "검색 결과가 없습니다."
              : isInbox
                ? filter === "unread"
                  ? "읽지 않은 쪽지가 없습니다."
                  : filter === "read"
                    ? "읽은 쪽지가 없습니다."
                    : "받은 쪽지가 없습니다."
                : "보낸 쪽지가 없습니다."}
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
              모든 쪽지 보기
            </button>
          )}
        </div>
      )}
      
      {/* 쪽지 목록 */}
      {msgs.map(msg => (
        <div key={msg.id}>
          <div 
            style={getCardStyle(msg.read, selectedMsgId === msg.id)}
            onClick={() => toggleMessageSelect(msg.id, msg.read)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <p style={{ fontWeight: "bold", marginTop: 0 }}>
                <strong>{isInbox ? "보낸 사람" : "받는 사람"}:</strong> {isInbox ? (msg.senderNickname || "알 수 없음") : (msg.receiverNickname || "알 수 없음")}
              </p>
              
              {isInbox && !msg.read && (
                <div style={{ 
                  width: "10px", 
                  height: "10px", 
                  borderRadius: "50%", 
                  backgroundColor: "#f44336",
                  marginTop: "5px"
                }}></div>
              )}
            </div>
            
            <p style={{ 
              margin: "12px 0", 
              whiteSpace: "pre-wrap", 
              wordBreak: "break-word"
            }}>
              {msg.content}
            </p>
            
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center"
            }}>
              <p style={{ 
                fontSize: 12, 
                color: darkMode ? "#bbb" : "#666",
                margin: 0
              }}>
                {formatDate(msg.createdAt.seconds)}
              </p>
              
              {selectedMsgId === msg.id && (
                <div>
                  {isInbox && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReplyForm(msg.id, msg.content, msg.senderNickname);
                      }}
                      style={{
                        ...smallBtn,
                        marginRight: "5px"
                      }}
                    >
                      ↩️ 답장하기
                    </button>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(msg.id);
                    }}
                    style={{
                      padding: "4px 8px",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
            
            {/* 읽음 상태 표시 (보낸 쪽지함에서만) */}
            {!isInbox && msg.read && (
              <div style={{ 
                position: "absolute", 
                top: "10px", 
                right: "10px", 
                fontSize: "12px",
                color: darkMode ? "#aaa" : "#888",
                backgroundColor: darkMode ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.7)",
                padding: "2px 6px",
                borderRadius: "10px"
              }}>
                읽음
              </div>
            )}
          </div>
          
          {/* 답장 폼 (받은 쪽지함에서만) */}
          {isInbox && showReplyForm === msg.id && (
            <div style={{
              margin: "0 0 20px 20px",
              padding: "15px",
              borderRadius: "8px",
              backgroundColor: darkMode ? "#2a2a3a" : "#f9f4ff",
              border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`
            }}>
              <h4 style={{ margin: "0 0 10px 0", color: darkMode ? "#d4c2ff" : "#7e57c2" }}>
                {msg.senderNickname || "알 수 없음"}님에게 답장
              </h4>
              
              <textarea
                value={replyContent}
                onChange={handleReplyContentChange}
                placeholder="답장 내용을 입력하세요..."
                style={textareaStyle}
              />
              
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button 
                  onClick={() => setShowReplyForm(null)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: darkMode ? "#555" : "#e0e0e0",
                    color: darkMode ? "#fff" : "#333",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    marginRight: "8px"
                  }}
                >
                  취소
                </button>
                
                <CustomLink 
                  to={`/send-message/${msg.senderNickname || "알 수 없음"}?reply=${encodeURIComponent(replyContent)}`}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#7e57c2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    textDecoration: "none",
                    display: "inline-block"
                  }}
                >
                  전송하기
                </CustomLink>
              </div>
            </div>
          )}
        </div>
      ))}
      
      {/* 더 보기 버튼 */}
      {!isSearching && hasMore && !loading && msgs.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button 
            onClick={loadMoreMessages}
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
      {loading && msgs.length > 0 && (
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

MessageBox.propTypes = {
  darkMode: PropTypes.bool,
  mode: PropTypes.oneOf(["inbox", "outbox"])
};

MessageBox.defaultProps = {
  darkMode: false,
  mode: "inbox"
};

export default MessageBox;
