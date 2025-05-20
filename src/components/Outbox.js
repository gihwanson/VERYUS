import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, limit, startAfter, doc, deleteDoc, where, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function Outbox({ darkMode }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const me = localStorage.getItem("nickname");
  const PAGE_SIZE = 10;

  // 기본 쿼리 생성 함수
  const createQuery = (startAfterDoc = null) => {
    let q = query(
      collection(db, "messages"),
      where("senderNickname", "==", me),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );
    
    if (startAfterDoc) {
      q = query(
        collection(db, "messages"),
        where("senderNickname", "==", me),
        orderBy("createdAt", "desc"),
        startAfter(startAfterDoc),
        limit(PAGE_SIZE)
      );
    }
    
    return q;
  };

  // 초기 데이터 로드 및 리스너 설정
  useEffect(() => {
    if (!me) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const q = createQuery();
    
    // 구독을 설정하고 반환값을 저장 (정상적인 함수가 반환됨)
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setHasMore(false);
        setMsgs([]);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 저장 (페이지네이션용)
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      setMsgs(newMessages);
      setHasMore(newMessages.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    // 클린업 함수에서 구독 해제
    return () => unsubscribe();
  }, [me]);

  // 더 많은 메시지 로드
  const loadMoreMessages = () => {
    if (!lastVisible || !hasMore || loading) return;
    
    setLoading(true);
    
    const q = createQuery(lastVisible);
    
    getDocs(q).then((snapshot) => {
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
      setLoading(false);
    }).catch((err) => {
      console.error("추가 쪽지 불러오기 오류:", err);
      setError("추가 쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
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
        
        const newMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          read: doc.data().read || false
        }));
        
        setMsgs(newMessages);
        setHasMore(newMessages.length === PAGE_SIZE);
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
      const q = query(
        collection(db, "messages"),
        where("senderNickname", "==", me),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const filteredMsgs = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), read: doc.data().read || false }))
        .filter(msg => 
          msg.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
          (msg.receiverNickname && msg.receiverNickname.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      
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
        setHasMore(false);
        setMsgs([]);
        setLoading(false);
        return;
      }
      
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      setMsgs(newMessages);
      setHasMore(newMessages.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
  };

  // 쪽지 삭제
  const deleteMessage = async (id) => {
    if (!window.confirm("정말 이 쪽지를 삭제하시겠습니까?")) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, "messages", id));
      // 삭제 후 선택된 메시지 초기화
      setSelectedMsgId(null);
    } catch (err) {
      console.error("쪽지 삭제 오류:", err);
      alert("쪽지 삭제 중 오류가 발생했습니다.");
    }
  };

  // 쪽지 선택 토글
  const toggleMessageSelect = (id) => {
    setSelectedMsgId(prev => prev === id ? null : id);
  };

  // 날짜 포맷팅 함수
  const formatDate = (seconds) => {
    const date = new Date(seconds * 1000);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      // 오늘
      return `오늘 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (diffDays === 1) {
      // 어제
      return `어제 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (diffDays < 7) {
      // 1주일 이내
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${days[date.getDay()]}요일 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
      // 1주일 이상
      return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
  };

  // 카드 스타일 - 다크모드에 따라 조정
  const getCardStyle = (isSelected) => ({
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
  });

  // 버튼 스타일
  const buttonStyle = {
    padding: "6px 12px",
    backgroundColor: "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    margin: "0 5px"
  };

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

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>✉️ 보낸 쪽지함</h1>
      
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
          placeholder="쪽지 내용 또는 받는 사람으로 검색"
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
            ? `검색 결과: ${msgs.length}개의 쪽지`
            : `전체: ${msgs.length}개의 쪽지${hasMore ? ' 이상' : ''}`}
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
      {msgs.map(m => (
        <div 
          key={m.id} 
          style={getCardStyle(selectedMsgId === m.id)}
          onClick={() => toggleMessageSelect(m.id)}
        >
          <p style={{ fontWeight: "bold", marginTop: 0 }}>
            <strong>받는 사람:</strong> {m.receiverNickname || "알 수 없음"}
          </p>
          <p style={{ 
            margin: "12px 0", 
            whiteSpace: "pre-wrap", 
            wordBreak: "break-word"
          }}>
            {m.content}
          </p>
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginTop: "10px"
          }}>
            <p style={{ 
              fontSize: 12, 
              color: darkMode ? "#bbb" : "#666",
              margin: 0
            }}>
              {formatDate(m.createdAt.seconds)}
            </p>
            
            {selectedMsgId === m.id && (
              <div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMessage(m.id);
                  }}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "#d32f2f",
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
          
          {/* 읽음 상태 표시 */}
          {m.read && (
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

Outbox.propTypes = {
  darkMode: PropTypes.bool
};

Outbox.defaultProps = {
  darkMode: false
};

export default Outbox;
