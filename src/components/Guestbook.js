import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, Timestamp,
  query, orderBy, limit, startAfter, getDocs, updateDoc, where
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, 
  textareaStyle, purpleBtn, smallBtn
} from "../components/style";

function Guestbook({ darkMode, globalProfilePics }) {
  const { owner } = useParams(); // 방명록 주인
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [formData, setFormData] = useState({
    message: "",
    isSecret: false
  });
  const [editingEntry, setEditingEntry] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [charCount, setCharCount] = useState(0);
  
  const me = localStorage.getItem("nickname");
  const navigate = useNavigate();
  const messageInputRef = useRef(null);
  const PAGE_SIZE = 10;
  const MAX_MESSAGE_LENGTH = 500;
  
  // 페이지 로드 시 URL에서 스크롤 위치 확인
  useEffect(() => {
    const entryId = new URLSearchParams(window.location.search).get("highlight");
    if (entryId) {
      setTimeout(() => {
        const element = document.getElementById(`entry-${entryId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.style.animation = "highlight 2s";
        }
      }, 500);
    }
  }, [entries]);
  
  // 기본 데이터 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    
    try {
      const q = query(
        collection(db, `guestbook-${owner}`),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
          setEntries([]);
          setHasMore(false);
          setLoading(false);
          return;
        }
        
        // 마지막 문서 저장 (페이지네이션용)
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(lastDoc);
        
        const entriesData = snapshot.docs.map((doc, index) => ({
          id: doc.id,
          no: index + 1,
          ...doc.data()
        }));
        
        setEntries(entriesData);
        setHasMore(entriesData.length === PAGE_SIZE);
        setLoading(false);
      }, (err) => {
        console.error("방명록 불러오기 오류:", err);
        setError("방명록을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      });
      
      return () => unsubscribe();
    } catch (err) {
      console.error("방명록 구독 설정 오류:", err);
      setError("방명록 로딩 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }, [owner]);
  
  // 더 많은 방명록 로드
  const loadMoreEntries = async () => {
    if (!lastVisible || !hasMore || loading) return;
    
    setLoading(true);
    
    try {
      const q = query(
        collection(db, `guestbook-${owner}`),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(PAGE_SIZE)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 업데이트
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newEntries = snapshot.docs.map((doc, index) => ({
        id: doc.id,
        no: entries.length + index + 1,
        ...doc.data()
      }));
      
      setEntries(prev => [...prev, ...newEntries]);
      setHasMore(newEntries.length === PAGE_SIZE);
    } catch (err) {
      console.error("추가 방명록 불러오기 오류:", err);
      setError("추가 방명록을 불러오는 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };
  
  // 입력 핸들러
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const inputValue = type === "checkbox" ? checked : value;
    
    if (name === "message") {
      if (value.length <= MAX_MESSAGE_LENGTH) {
        setCharCount(value.length);
        setFormData(prev => ({ ...prev, [name]: inputValue }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: inputValue }));
    }
  };
  
  // 방명록 등록
  const addEntry = async () => {
    if (!me) {
      if (window.confirm("로그인이 필요한 기능입니다. 로그인 페이지로 이동하시겠습니까?")) {
        navigate("/login", { state: { from: `/guestbook/${owner}` } });
      }
      return;
    }
    
    if (!formData.message.trim()) {
      alert("메시지를 입력해주세요.");
      messageInputRef.current.focus();
      return;
    }
    
    try {
      setLoading(true);
      
      const entryData = {
        writer: me,
        text: formData.message.trim(),
        isSecret: formData.isSecret,
        createdAt: Timestamp.now(),
        replies: []
      };
      
      const docRef = await addDoc(collection(db, `guestbook-${owner}`), entryData);
      
      // 방명록 알림 추가 (방명록 주인이 나와 다를 경우)
      if (me !== owner) {
        try {
          await addDoc(collection(db, "notifications"), {
            receiverNickname: owner,
            message: `${me}님이 방명록에 새 글을 작성했습니다.`,
            type: "guestbook",
            createdAt: Timestamp.now(),
            read: false,
            link: `/guestbook/${owner}?highlight=${docRef.id}`
          });
        } catch (err) {
          console.error("알림 생성 오류:", err);
        }
      }
      
      setFormData({
        message: "",
        isSecret: false
      });
      setCharCount(0);
      
      // 새 글이 추가되면 스크롤을 맨 위로 올림 (새 글이 맨 위에 표시되므로)
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("방명록 등록 오류:", err);
      alert("방명록 등록 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };
  
  // 방명록 삭제
  const deleteEntry = async (entryId) => {
    if (!window.confirm("정말 이 글을 삭제하시겠습니까?")) return;
    
    try {
      await deleteDoc(doc(db, `guestbook-${owner}`, entryId));
      alert("삭제되었습니다");
    } catch (err) {
      console.error("방명록 삭제 오류:", err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 방명록 수정 모드 설정
  const startEditing = (entry) => {
    setEditingEntry(entry);
    setFormData({
      message: entry.text,
      isSecret: entry.isSecret
    });
    setCharCount(entry.text.length);
    
    // 수정 폼으로 스크롤
    setTimeout(() => {
      messageInputRef.current.focus();
      messageInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };
  
  // 방명록 수정 취소
  const cancelEditing = () => {
    setEditingEntry(null);
    setFormData({
      message: "",
      isSecret: false
    });
    setCharCount(0);
  };
  
  // 방명록 수정 저장
  const updateEntry = async () => {
    if (!formData.message.trim()) {
      alert("메시지를 입력해주세요.");
      messageInputRef.current.focus();
      return;
    }
    
    try {
      setLoading(true);
      
      await updateDoc(doc(db, `guestbook-${owner}`, editingEntry.id), {
        text: formData.message.trim(),
        isSecret: formData.isSecret,
        editedAt: Timestamp.now()
      });
      
      setEditingEntry(null);
      setFormData({
        message: "",
        isSecret: false
      });
      setCharCount(0);
      
      alert("수정되었습니다");
    } catch (err) {
      console.error("방명록 수정 오류:", err);
      alert("수정 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };
  
  // 답글 모드 설정
  const startReplying = (entryId) => {
    setReplyingTo(entryId);
    setReplyText("");
    
    // 답글 폼으로 스크롤
    setTimeout(() => {
      const replyForm = document.getElementById(`reply-form-${entryId}`);
      if (replyForm) {
        replyForm.scrollIntoView({ behavior: "smooth", block: "center" });
        replyForm.querySelector("textarea").focus();
      }
    }, 100);
  };
  
  // 답글 취소
  const cancelReplying = () => {
    setReplyingTo(null);
    setReplyText("");
  };
  
  // 답글 저장
  const addReply = async (entryId) => {
    if (!me) {
      if (window.confirm("로그인이 필요한 기능입니다. 로그인 페이지로 이동하시겠습니까?")) {
        navigate("/login", { state: { from: `/guestbook/${owner}` } });
      }
      return;
    }
    
    if (!replyText.trim()) {
      alert("답글 내용을 입력해주세요.");
      return;
    }
    
    try {
      setLoading(true);
      
      // 기존 방명록 문서 가져오기
      const entryDoc = doc(db, `guestbook-${owner}`, entryId);
      const entrySnapshot = await getDocs(query(
        collection(db, `guestbook-${owner}`),
        where("__name__", "==", entryId)
      ));
      
      if (entrySnapshot.empty) {
        throw new Error("원본 방명록을 찾을 수 없습니다.");
      }
      
      const entryData = entrySnapshot.docs[0].data();
      const oldReplies = entryData.replies || [];
      
      // 새 답글 추가
      const newReply = {
        id: Date.now().toString(),
        writer: me,
        text: replyText.trim(),
        createdAt: Timestamp.now()
      };
      
      await updateDoc(entryDoc, {
        replies: [...oldReplies, newReply]
      });
      
      // 알림 추가 (원 글 작성자에게)
      if (me !== entryData.writer && entryData.writer !== owner) {
        try {
          await addDoc(collection(db, "notifications"), {
            receiverNickname: entryData.writer,
            message: `${me}님이 회원님의 방명록 글에 답글을 남겼습니다.`,
            type: "reply",
            createdAt: Timestamp.now(),
            read: false,
            link: `/guestbook/${owner}?highlight=${entryId}`
          });
        } catch (err) {
          console.error("알림 생성 오류:", err);
        }
      }
      
      // 방명록 주인에게도 알림 (방명록 주인이 글 작성자도 아니고, 답글 작성자도 아닐 경우)
      if (me !== owner && entryData.writer !== owner) {
        try {
          await addDoc(collection(db, "notifications"), {
            receiverNickname: owner,
            message: `${me}님이 방명록에 답글을 남겼습니다.`,
            type: "reply",
            createdAt: Timestamp.now(),
            read: false,
            link: `/guestbook/${owner}?highlight=${entryId}`
          });
        } catch (err) {
          console.error("알림 생성 오류:", err);
        }
      }
      
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      console.error("답글 추가 오류:", err);
      alert("답글 추가 중 오류가 발생했습니다.");
    }
    
    setLoading(false);
  };
  
  // 답글 삭제
  const deleteReply = async (entryId, replyId) => {
    if (!window.confirm("정말 이 답글을 삭제하시겠습니까?")) return;
    
    try {
      // 기존 방명록 문서 가져오기
      const entryDoc = doc(db, `guestbook-${owner}`, entryId);
      const entrySnapshot = await getDocs(query(
        collection(db, `guestbook-${owner}`),
        where("__name__", "==", entryId)
      ));
      
      if (entrySnapshot.empty) {
        throw new Error("원본 방명록을 찾을 수 없습니다.");
      }
      
      const entryData = entrySnapshot.docs[0].data();
      const oldReplies = entryData.replies || [];
      
      // 답글 필터링하여 제거
      const newReplies = oldReplies.filter(reply => reply.id !== replyId);
      
      await updateDoc(entryDoc, {
        replies: newReplies
      });
      
      alert("답글이 삭제되었습니다.");
    } catch (err) {
      console.error("답글 삭제 오류:", err);
      alert("답글 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 날짜 포맷팅 함수
  const formatDate = (seconds, includeTime = true) => {
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
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      if (includeTime) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}.${month}.${day} ${hours}:${minutes}`;
      } else {
        return `${year}.${month}.${day}`;
      }
    }
  };
  
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes highlight {
          0% { background-color: ${darkMode ? "#513989" : "#b49ddb"}; }
          100% { background-color: ${darkMode ? "#333" : "#fdfdfd"}; }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
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
        marginBottom: "15px" 
      }}>
        <h1 style={titleStyle}>📖 {owner}님의 방명록</h1>
        
        {me && me !== owner && (
          <Link 
            to={`/send-message/${owner}`} 
            style={{
              padding: "8px 12px",
              backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
              color: darkMode ? "#d4c2ff" : "#7e57c2",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`
            }}
          >
            <span style={{ marginRight: "8px" }}>✉️</span>
            <span>쪽지 보내기</span>
          </Link>
        )}
      </div>
      
      {/* 방명록 작성 폼 */}
      <div style={{
        backgroundColor: darkMode ? "#2a2a2a" : "#f9f9f9",
        borderRadius: "10px",
        padding: "20px",
        marginBottom: "30px",
        border: `1px solid ${darkMode ? "#444" : "#eee"}`
      }}>
        <h3 style={{ 
          margin: "0 0 15px 0", 
          color: darkMode ? "#d4c2ff" : "#7e57c2" 
        }}>
          {editingEntry ? "방명록 수정하기" : "방명록 남기기"}
        </h3>
        
        <textarea
          ref={messageInputRef}
          name="message"
          value={formData.message}
          onChange={handleInputChange}
          placeholder={me ? "메시지를 입력하세요..." : "로그인 후 작성할 수 있습니다."}
          style={{
            ...darkMode ? darkInputStyle : textareaStyle,
            width: "100%",
            minHeight: "100px",
            resize: "vertical",
            marginBottom: "10px"
          }}
          disabled={!me || loading}
        />
        
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: "15px"
        }}>
          <label style={{ 
            display: "flex", 
            alignItems: "center",
            color: darkMode ? "#bbb" : "#666",
            cursor: "pointer"
          }}>
            <input
              name="isSecret"
              type="checkbox"
              checked={formData.isSecret}
              onChange={handleInputChange}
              style={{ marginRight: "8px" }}
              disabled={!me || loading}
            /> 
            🔒 비밀글로 작성
          </label>
          
          <div style={{ 
            fontSize: "12px",
            color: charCount > MAX_MESSAGE_LENGTH * 0.8 
              ? (charCount > MAX_MESSAGE_LENGTH * 0.95 ? "#f44336" : "#ff9800") 
              : (darkMode ? "#bbb" : "#666")
          }}>
            {charCount}/{MAX_MESSAGE_LENGTH}자
          </div>
        </div>
        
        <div style={{ 
          display: "flex", 
          justifyContent: "flex-end",
          gap: "10px"
        }}>
          {editingEntry && (
            <button 
              onClick={cancelEditing} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#555" : "#e0e0e0",
                color: darkMode ? "#fff" : "#333",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px"
              }}
              disabled={loading}
            >
              취소
            </button>
          )}
          
          <button 
            onClick={editingEntry ? updateEntry : addEntry} 
            style={{
              ...purpleBtn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 20px",
              opacity: loading ? 0.7 : 1
            }}
            disabled={!me || loading}
          >
            {loading ? (
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
                처리 중...
              </>
            ) : (
              editingEntry ? "수정 완료" : "등록"
            )}
          </button>
        </div>
      </div>
      
      {/* 로딩 상태 */}
      {loading && entries.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid rgba(126, 87, 194, 0.1)", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>방명록을 불러오는 중...</p>
        </div>
      )}
      
      {/* 에러 상태 */}
      {error && (
        <div style={{ 
          padding: "20px", 
          textAlign: "center", 
          color: "#d32f2f",
          backgroundColor: darkMode ? "#482121" : "#ffebee",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
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
      {!loading && !error && entries.length === 0 && (
        <div style={{ 
          padding: "40px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📝</div>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            아직 방명록이 없습니다.
            {me && <><br/>첫 번째 방명록을 남겨보세요!</>}
          </p>
        </div>
      )}
      
      {/* 방명록 목록 */}
      {entries.length > 0 && (
        <div>
          {entries.map(entry => {
            const canView = !entry.isSecret || entry.writer === me || owner === me;
            const isMyEntry = entry.writer === me;
            const isOwner = owner === me;
            
            return (
              <div 
                key={entry.id} 
                id={`entry-${entry.id}`}
                style={{
                  margin: "20px 0",
                  border: `1px solid ${darkMode ? "#444" : "#ddd"}`,
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: darkMode ? "#333" : "#fdfdfd",
                  boxShadow: `0 2px 4px rgba(0,0,0,${darkMode ? 0.2 : 0.05})`,
                  animation: "fadeIn 0.3s ease-out"
                }}
              >
                {/* 상단 정보 */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  backgroundColor: darkMode ? "#3a3a3a" : "#f5f5f5",
                  borderBottom: `1px solid ${darkMode ? "#444" : "#eee"}`
                }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <img
                      src={globalProfilePics?.[entry.writer] || "/path/to/default.png"}
                      alt={`${entry.writer}의 프로필`}
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        marginRight: "10px",
                        objectFit: "cover",
                        border: `1px solid ${darkMode ? "#666" : "#ddd"}`
                      }}
                    />
                    
                    <div>
                      <div style={{ 
                        fontWeight: "bold",
                        color: darkMode ? "#e0e0e0" : "#333"
                      }}>
                        {entry.writer}
                      </div>
                      <div style={{ 
                        fontSize: "12px",
                        color: darkMode ? "#aaa" : "#888"
                      }}>
                        {formatDate(entry.createdAt.seconds)}
                        {entry.editedAt && <span> (수정됨)</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    {(isMyEntry || isOwner) && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        {isMyEntry && (
                          <>
                            <button 
                              onClick={() => startEditing(entry)} 
                              style={{
                                ...smallBtn,
                                backgroundColor: darkMode ? "#555" : "#e0e0e0",
                                color: darkMode ? "#fff" : "#333",
                                fontSize: "12px",
                                padding: "4px 8px"
                              }}
                            >
                              수정
                            </button>
                            
                            <button 
                                                            onClick={() => deleteEntry(entry.id)} 
                              style={{
                                ...smallBtn,
                                backgroundColor: "#f44336",
                                color: "white",
                                fontSize: "12px",
                                padding: "4px 8px"
                              }}
                            >
                              삭제
                            </button>
                          </>
                        )}
                        
                        {isOwner && !isMyEntry && (
                          <button 
                            onClick={() => deleteEntry(entry.id)} 
                            style={{
                              ...smallBtn,
                              backgroundColor: "#f44336",
                              color: "white",
                              fontSize: "12px",
                              padding: "4px 8px"
                            }}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 본문 */}
                <div style={{ 
                  padding: "16px",
                  backgroundColor: entry.isSecret 
                    ? (darkMode ? "rgba(0, 0, 0, 0.2)" : "rgba(0, 0, 0, 0.02)")
                    : "transparent"
                }}>
                  {/* 비밀글 표시 */}
                  {entry.isSecret && (
                    <div style={{ 
                      color: "#e67e22", 
                      fontSize: 14, 
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      backgroundColor: darkMode ? "rgba(230, 126, 34, 0.1)" : "rgba(230, 126, 34, 0.05)",
                      padding: "6px 10px",
                      borderRadius: "4px"
                    }}>
                      <span style={{ marginRight: "8px" }}>🔒</span>
                      비밀글입니다. (방명록 주인과 작성자만 볼 수 있어요)
                    </div>
                  )}
                  
                  {/* 내용 */}
                  <div style={{ 
                    fontSize: 16,
                    color: darkMode ? "#e0e0e0" : "#333",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}>
                    {canView 
                      ? entry.text 
                      : (
                        <div style={{ 
                          textAlign: "center", 
                          padding: "30px 20px",
                          color: darkMode ? "#777" : "#999",
                          fontStyle: "italic"
                        }}>
                          <span style={{ fontSize: "20px", marginBottom: "10px", display: "block" }}>🔒</span>
                          비밀글입니다
                        </div>
                      )
                    }
                  </div>
                </div>
                
                {/* 답글 섹션 */}
                {canView && (
                  <div style={{ 
                    borderTop: `1px solid ${darkMode ? "#444" : "#eee"}`,
                    padding: "12px 16px",
                    backgroundColor: darkMode ? "#2a2a2a" : "#f9f9f9"
                  }}>
                    {/* 답글 목록 */}
                    {entry.replies && entry.replies.length > 0 && (
                      <div style={{ marginBottom: "15px" }}>
                        {entry.replies.map(reply => (
                          <div 
                            key={reply.id}
                            style={{
                              display: "flex",
                              padding: "10px",
                              borderBottom: `1px solid ${darkMode ? "#444" : "#eee"}`,
                              animation: "fadeIn 0.3s ease-out"
                            }}
                          >
                            <div style={{ 
                              marginRight: "12px",
                              flexShrink: 0
                            }}>
                              <img
                                src={globalProfilePics?.[reply.writer] || "/path/to/default.png"}
                                alt={`${reply.writer}의 프로필`}
                                style={{
                                  width: "26px",
                                  height: "26px",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                  border: `1px solid ${darkMode ? "#555" : "#ddd"}`
                                }}
                              />
                            </div>
                            
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "flex-start"
                              }}>
                                <div>
                                  <span style={{ 
                                    fontWeight: "bold",
                                    marginRight: "8px",
                                    color: darkMode ? "#e0e0e0" : "#333",
                                    fontSize: "14px"
                                  }}>
                                    {reply.writer}
                                  </span>
                                  <span style={{ 
                                    fontSize: "12px",
                                    color: darkMode ? "#aaa" : "#888"
                                  }}>
                                    {formatDate(reply.createdAt.seconds)}
                                  </span>
                                </div>
                                
                                {(reply.writer === me || isOwner) && (
                                  <button
                                    onClick={() => deleteReply(entry.id, reply.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: darkMode ? "#aaa" : "#888",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                      padding: "2px"
                                    }}
                                  >
                                    삭제
                                  </button>
                                )}
                              </div>
                              
                              <div style={{ 
                                marginTop: "4px",
                                fontSize: "14px",
                                lineHeight: 1.5,
                                color: darkMode ? "#ccc" : "#555",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word"
                              }}>
                                {reply.text}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* 답글 작성 폼 또는 버튼 */}
                    {replyingTo === entry.id ? (
                      <div 
                        id={`reply-form-${entry.id}`}
                        style={{ 
                          padding: "10px",
                          backgroundColor: darkMode ? "#333" : "#fff",
                          borderRadius: "6px",
                          border: `1px solid ${darkMode ? "#444" : "#ddd"}`
                        }}
                      >
                        <textarea
                          value={replyText}
                          onChange={e => {
                            if (e.target.value.length <= 200) {
                              setReplyText(e.target.value);
                            }
                          }}
                          placeholder="답글을 입력하세요..."
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                            backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                            color: darkMode ? "#e0e0e0" : "#333",
                            resize: "vertical",
                            minHeight: "80px",
                            marginBottom: "10px",
                            fontSize: "14px"
                          }}
                        />
                        
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <div style={{ 
                            fontSize: "12px",
                            color: darkMode ? "#aaa" : "#888"
                          }}>
                            {replyText.length}/200자
                          </div>
                          
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={cancelReplying}
                              style={{
                                padding: "5px 10px",
                                backgroundColor: darkMode ? "#555" : "#e0e0e0",
                                color: darkMode ? "#fff" : "#333",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "13px"
                              }}
                            >
                              취소
                            </button>
                            
                            <button
                              onClick={() => addReply(entry.id)}
                              style={{
                                padding: "5px 10px",
                                backgroundColor: "#7e57c2",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "13px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                              disabled={loading}
                            >
                              {loading ? (
                                <>
                                  <span style={{ 
                                    display: "inline-block", 
                                    width: "12px", 
                                    height: "12px", 
                                    border: "2px solid rgba(255, 255, 255, 0.3)", 
                                    borderTop: "2px solid #fff", 
                                    borderRadius: "50%", 
                                    animation: "spin 1s linear infinite",
                                    marginRight: "5px"
                                  }}></span>
                                  처리 중...
                                </>
                              ) : "답글 등록"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startReplying(entry.id)}
                        style={{
                          background: "none",
                          border: `1px solid ${darkMode ? "#666" : "#ccc"}`,
                          padding: "6px 12px",
                          borderRadius: "4px",
                          color: darkMode ? "#aaa" : "#666",
                          cursor: "pointer",
                          fontSize: "13px",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        disabled={!me}
                      >
                        <span style={{ marginRight: "5px" }}>💬</span>
                        답글 작성
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* 더 보기 버튼 */}
          {hasMore && !loading && (
            <div style={{ textAlign: "center", marginTop: "30px" }}>
              <button 
                onClick={loadMoreEntries}
                style={{
                  padding: "10px 20px",
                  backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold"
                }}
              >
                더 보기
              </button>
            </div>
          )}
          
          {/* 추가 로딩 인디케이터 */}
          {loading && entries.length > 0 && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ 
                width: "30px", 
                height: "30px", 
                border: "3px solid rgba(126, 87, 194, 0.1)", 
                borderTop: "3px solid #7e57c2", 
                borderRadius: "50%", 
                animation: "spin 1s linear infinite", 
                margin: "0 auto" 
              }}></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Guestbook.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object
};

Guestbook.defaultProps = {
  darkMode: false,
  globalProfilePics: {}
};

export default Guestbook;
