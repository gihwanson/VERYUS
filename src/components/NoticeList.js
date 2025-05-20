import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import {
  collection, query, orderBy, onSnapshot, limit, startAfter, getDocs,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function NoticeList({ darkMode }) {
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
  const createQuery = (startAfterDoc = null) => {
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
  };

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
  }, [showOnlyImportant]); // 중요 공지사항 필터 변경 시 다시 로드

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
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: `0 4px 15px ${darkMode ? "rgba(126, 87, 194, 0.4)" : "rgba(126, 87, 194, 0.3)"}`
    }
  });

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
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
        <div key={notice.id} style={getNoticeCardStyle(notice.important)}>
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
          
          <CustomLink to={`/notice/${notice.id}`} style={{ 
            color: darkMode ? "#d4c2ff" : "#7e57c2",
            textDecoration: "none"
          }}>
            <h3 style={{ 
              margin: notice.important ? "5px 0 10px" : "0 0 10px",
              fontSize: "18px"
            }}>
              {notice.title}
            </h3>
          </CustomLink>
          
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
          <CustomLink to={`/notice/${notice.id}`} style={{ 
            display: "inline-block",
            marginTop: "10px",
            fontSize: "13px",
            color: darkMode ? "#9575cd" : "#673ab7",
            textDecoration: "none"
          }}>
            자세히 보기 →
          </CustomLink>
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

NoticeList.propTypes = {
  darkMode: PropTypes.bool
};

NoticeList.defaultProps = {
  darkMode: false
};

export default NoticeList;
