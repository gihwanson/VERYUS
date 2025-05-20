import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  doc, getDoc, collection, query, orderBy, limit, getDocs, where
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle
} from "../components/style";
import CustomLink from "./CustomLink";

function NoticeDetail({ darkMode }) {
  const { id } = useParams();
  const navigate = useNavigate();
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
        // 단일 문서 가져오기 - 훨씬 효율적
        const noticeDoc = await getDoc(doc(db, "notices", id));
        
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
        }
        
        if (!nextSnapshot.empty) {
          const nextDoc = nextSnapshot.docs[0];
          setNextNotice({ id: nextDoc.id, title: nextDoc.data().title });
        }
      } catch (err) {
        console.error("공지사항 상세 정보 로드 오류:", err);
        setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      }
      
      setLoading(false);
    };
    
    fetchNoticeDetail();
  }, [id]);

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

  // 뒤로 가기 핸들러
  const handleGoBack = () => {
    navigate(-1);
  };

  // 로딩 중 상태
  if (loading) {
    return (
      <div style={{
        ...darkMode ? darkContainerStyle : containerStyle,
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
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div style={{
        ...darkMode ? darkContainerStyle : containerStyle,
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
          onClick={handleGoBack}
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
        ...darkMode ? darkContainerStyle : containerStyle,
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
          onClick={handleGoBack}
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
      ...darkMode ? darkContainerStyle : containerStyle,
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
          onClick={handleGoBack}
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
            <CustomLink 
              to={`/notice/${prevNotice.id}`}
              style={{
                display: "block",
                padding: "10px",
                color: darkMode ? "#9575cd" : "#7e57c2",
                textDecoration: "none"
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
            </CustomLink>
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
            <CustomLink 
              to={`/notice/${nextNotice.id}`}
              style={{
                display: "block",
                padding: "10px",
                color: darkMode ? "#9575cd" : "#7e57c2",
                textDecoration: "none"
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
            </CustomLink>
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

NoticeDetail.propTypes = {
  darkMode: PropTypes.bool
};

NoticeDetail.defaultProps = {
  darkMode: false
};

export default NoticeDetail;
