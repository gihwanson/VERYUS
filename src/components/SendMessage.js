// SendMessage.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, Timestamp, getDocs, query, where, orderBy, limit
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, 
  inputStyle, darkInputStyle, textareaStyle, darkTextareaStyle, 
  purpleBtn, darkPurpleBtn, secondaryBtn, darkSecondaryBtn
} from "../components/style";
import Avatar from "./Avatar";

function SendMessage({ darkMode, globalProfilePics, globalGrades }) {
  const { receiverNickname } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const reply = params.get("reply");
  const replyId = params.get("id");
  const replyHeader = params.get("header");

  const me = localStorage.getItem("nickname");
  const nav = useNavigate();

  const [txt, setTxt] = useState(reply ? `\n\n${reply}` : "");
  const [subject, setSubject] = useState(replyHeader ? `Re: ${replyHeader}` : "");
  const [loading, setLoading] = useState(false);
  const [recentMessages, setRecentMessages] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState(null);
  const [receiverExists, setReceiverExists] = useState(true);
  const [checkingReceiver, setCheckingReceiver] = useState(false);

  // 수신자가 존재하는지 확인
  useEffect(() => {
    const checkReceiverExists = async () => {
      try {
        setCheckingReceiver(true);
        const userQuery = query(
          collection(db, "users"),
          where("nickname", "==", receiverNickname)
        );
        const snapshot = await getDocs(userQuery);
        setReceiverExists(!snapshot.empty);
      } catch (err) {
        console.error("수신자 확인 중 오류:", err);
      } finally {
        setCheckingReceiver(false);
      }
    };
    
    if (receiverNickname) {
      checkReceiverExists();
    }
  }, [receiverNickname]);

  // 이전 메시지 내역 불러오기
  useEffect(() => {
    const loadMessageHistory = async () => {
      try {
        const sent = query(
          collection(db, "messages"),
          where("senderNickname", "==", me),
          where("receiverNickname", "==", receiverNickname),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        
        const received = query(
          collection(db, "messages"),
          where("senderNickname", "==", receiverNickname),
          where("receiverNickname", "==", me),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        
        const [sentSnapshot, receivedSnapshot] = await Promise.all([
          getDocs(sent),
          getDocs(received)
        ]);
        
        const sentMessages = sentSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          direction: "sent"
        }));
        
        const receivedMessages = receivedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          direction: "received"
        }));
        
        const allMessages = [...sentMessages, ...receivedMessages].sort(
          (a, b) => b.createdAt.seconds - a.createdAt.seconds
        );
        
        setRecentMessages(allMessages.slice(0, 10)); // 최근 10개 메시지만 표시
      } catch (err) {
        console.error("메시지 내역 로드 중 오류:", err);
      }
    };
    
    if (me && receiverNickname) {
      loadMessageHistory();
    }
  }, [me, receiverNickname]);

  // 글자 수 계산
  useEffect(() => {
    setCharCount(txt.length);
  }, [txt]);

  // 첨부 파일 추가
  const handleAttachment = (type) => {
    // 실제 구현에서는 파일 업로드 등의 기능을 추가할 수 있습니다
    setAttachments([
      ...attachments,
      { type, url: "#", name: `첨부파일_${attachments.length + 1}` }
    ]);
  };

  // 첨부 파일 삭제
  const removeAttachment = (index) => {
    const newAttachments = [...attachments];
    newAttachments.splice(index, 1);
    setAttachments(newAttachments);
  };

  // 메시지 보내기
  const send = async () => {
    if (!txt.trim()) {
      setError("내용을 입력하세요");
      return;
    }
    
    if (txt.length > 300) {
      setError("300자 이하로 입력하세요");
      return;
    }
    
    if (!receiverExists) {
      setError("존재하지 않는 사용자입니다");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const messageData = {
        senderNickname: me,
        receiverNickname,
        content: txt,
        subject: subject.trim() || "(제목 없음)",
        createdAt: Timestamp.now(),
        isRead: false,
        replyToMessageId: replyId || null,
        attachments: attachments.length > 0 ? attachments : null
      };
      
      await addDoc(collection(db, "messages"), messageData);
      
      alert("쪽지를 성공적으로 보냈습니다");
      nav("/outbox");
    } catch (err) {
      console.error("쪽지 보내기 중 오류:", err);
      setError("쪽지 전송 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  // 날짜 포맷팅
  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleString();
  };
  
  // 등급 이모지 가져오기
  const getGradeEmoji = (nickname) => {
  // globalGrades가 없거나, nickname이 없거나, 해당 nickname의 grade가 없으면 빈 문자열 반환
  if (!globalGrades || !nickname || !globalGrades[nickname]) return "";
    
    const gradeEmojis = {
      "체리": "🍒",
      "블루베리": "🫐",
      "키위": "🥝",
      "사과": "🍎",
      "멜론": "🍈",
      "수박": "🍉",
      "지구": "🌏",
      "토성": "🪐",
      "태양": "🌞"
    };
    
    return gradeEmojis[globalGrades[nickname]] || "";
  };

  // 스타일 정의
  const currentContainerStyle = darkMode ? darkContainerStyle : containerStyle;
  const currentInputStyle = darkMode ? darkInputStyle : inputStyle;
  const currentTextareaStyle = darkMode ? darkTextareaStyle : textareaStyle;
  const currentPurpleBtn = darkMode ? darkPurpleBtn : purpleBtn;
  const currentSecondaryBtn = darkMode ? darkSecondaryBtn : secondaryBtn;
  
  const headerStyle = {
    display: "flex",
    alignItems: "center",
    gap: 15,
    marginBottom: 25
  };
  
  const receiverInfoStyle = {
    flex: 1
  };
  
  const avatarWrapperStyle = {
    position: "relative"
  };
  
  const statusIndicatorStyle = {
    width: 12,
    height: 12,
    borderRadius: "50%",
    backgroundColor: receiverExists ? "#4caf50" : "#f44336",
    border: "2px solid white",
    position: "absolute",
    bottom: 0,
    right: 0
  };
  
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
  
  const charCountStyle = {
    textAlign: "right",
    fontSize: 12,
    marginTop: 5,
    color: txt.length > 300 ? "#f44336" : (darkMode ? "#aaa" : "#777")
  };
  
  const errorMessageStyle = {
    color: "#f44336",
    backgroundColor: darkMode ? "#421a1a" : "#ffebee",
    padding: 10,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 10
  };
  
  const replyBoxStyle = {
    background: darkMode ? "#442f66" : "#e0d3ff",
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 20,
    border: `1px solid ${darkMode ? "#6a4ca7" : "#b49ddb"}`,
    fontSize: 14,
    color: darkMode ? "#e0d3ff" : "#4a2e8a",
    whiteSpace: "pre-wrap"
  };
  
  const buttonGroupStyle = {
    display: "flex",
    gap: 10,
    marginTop: 20
  };
  
  const attachmentBarStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 20
  };
  
  const attachmentButtonStyle = {
    padding: "8px 12px",
    backgroundColor: darkMode ? "#333" : "#f0f0f0",
    color: darkMode ? "#ddd" : "#555",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 5
  };
  
  const attachmentBadgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: darkMode ? "#444" : "#e0e0e0",
    color: darkMode ? "#ddd" : "#555",
    padding: "5px 10px",
    borderRadius: 16,
    fontSize: 12,
    marginRight: 10
  };
  
  const removeButtonStyle = {
    backgroundColor: "transparent",
    color: darkMode ? "#ff9e80" : "#f44336",
    border: "none",
    cursor: "pointer",
    marginLeft: 5,
    padding: 0,
    fontSize: 14
  };
  
  const historyToggleStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginBottom: 15
  };
  
  const historyContainerStyle = {
    marginTop: 30,
    padding: 15,
    backgroundColor: darkMode ? "#333" : "#f5f0ff",
    borderRadius: 8,
    border: `1px solid ${darkMode ? "#444" : "#e0d3ff"}`,
    maxHeight: showHistory ? "100%" : 0,
    overflow: "hidden",
    transition: "max-height 0.3s ease-in-out"
  };
  
  const messageItemStyle = (direction) => ({
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: direction === "sent" 
      ? (darkMode ? "#1e4a8d" : "#e3f2fd") 
      : (darkMode ? "#442f66" : "#f3e5f5"),
    alignSelf: direction === "sent" ? "flex-end" : "flex-start",
    maxWidth: "80%",
    border: `1px solid ${direction === "sent" 
      ? (darkMode ? "#305d9e" : "#bbdefb") 
      : (darkMode ? "#6a4ca7" : "#e1bee7")}`
  });
  
  const messageDateStyle = {
    fontSize: 11,
    color: darkMode ? "#aaa" : "#777",
    marginTop: 5,
    textAlign: "right"
  };
  
  const messageDirectionStyle = (direction) => ({
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
    color: direction === "sent" 
      ? (darkMode ? "#90caf9" : "#2196f3") 
      : (darkMode ? "#ce93d8" : "#9c27b0")
  });

  // 수신자가 존재하지 않을 경우
  if (!checkingReceiver && !receiverExists) {
    return (
      <div style={currentContainerStyle}>
        <h1 style={titleStyle}>✉️ 존재하지 않는 사용자</h1>
        
        <div style={errorMessageStyle}>
          <p>'{receiverNickname}' 님은 존재하지 않는 사용자입니다.</p>
          <p>사용자 이름이 정확한지 확인해주세요.</p>
        </div>
        
        <div style={buttonGroupStyle}>
          <button 
            onClick={() => nav(-1)} 
            style={currentSecondaryBtn}
          >
            이전 페이지로
          </button>
          
          <button 
            onClick={() => nav("/")} 
            style={currentPurpleBtn}
          >
            홈으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={currentContainerStyle}>
      {/* 쪽지 헤더 */}
      <div style={headerStyle}>
        <div style={avatarWrapperStyle}>
          <Avatar 
             src={(globalProfilePics && receiverNickname && globalProfilePics[receiverNickname]) || "https://via.placeholder.com/50"}
  size={50}
  alt={receiverNickname || "사용자"}
/>
          {!checkingReceiver && (
            <div style={statusIndicatorStyle}></div>
          )}
        </div>
        
        <div style={receiverInfoStyle}>
          <h2 style={{
  fontSize: 20,
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 5
}}>
  {receiverNickname}
  {getGradeEmoji(receiverNickname) && (
    <span style={{ fontSize: 20 }}>
      {getGradeEmoji(receiverNickname)}
    </span>
  )}
</h2>
          
          <div style={{ fontSize: 14, marginTop: 5 }}>
            <Link 
              to={`/profile/${receiverNickname}`}
              style={{
                color: darkMode ? "#bb86fc" : "#7e57c2",
                textDecoration: "none"
              }}
            >
              프로필 보기
            </Link>
          </div>
        </div>
      </div>

      <h1 style={titleStyle}>✉️ 쪽지 보내기</h1>
      
      {error && (
        <div style={errorMessageStyle}>
          {error}
        </div>
      )}
      
      {/* 메시지 작성 폼 */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>제목</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="쪽지 제목 (선택사항)"
          style={currentInputStyle}
          maxLength={50}
        />
      </div>
      
      <div style={formGroupStyle}>
        <label style={labelStyle}>내용</label>
        <textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="내용을 입력하세요 (최대 300자)"
          style={{
            ...currentTextareaStyle,
            minHeight: 150
          }}
        />
        <div style={charCountStyle}>
          {charCount}/300자
        </div>
      </div>
      
      {/* 원문 메시지 (답장인 경우) */}
      {reply && (
        <div style={replyBoxStyle}>
          <strong style={{
            display: "block",
            marginBottom: 8,
            color: darkMode ? "#d1c4e9" : "#7e57c2"
          }}>
            📩 원문 메시지:
          </strong>
          <em>{reply}</em>
        </div>
      )}
      
      {/* 첨부 파일 바 */}
      <div>
        <label style={labelStyle}>첨부</label>
        <div style={attachmentBarStyle}>
          {attachments.map((attachment, index) => (
            <div key={index} style={attachmentBadgeStyle}>
              {attachment.name}
              <button
                onClick={() => removeAttachment(index)}
                style={removeButtonStyle}
              >
                ×
              </button>
            </div>
          ))}
          
          {/* 실제 구현에서는 실제 파일 업로드 기능 추가 */}
          <button 
            style={attachmentButtonStyle}
            onClick={() => handleAttachment('image')}
          >
            🖼️ 이미지
          </button>
          
          <button 
            style={attachmentButtonStyle}
            onClick={() => handleAttachment('link')}
          >
            🔗 링크
          </button>
        </div>
      </div>
      
      {/* 버튼 영역 */}
      <div style={buttonGroupStyle}>
        <button 
          onClick={() => nav(-1)} 
          style={currentSecondaryBtn}
        >
          취소
        </button>
        
        <button 
          onClick={send}
          style={{
            ...currentPurpleBtn,
            opacity: loading ? 0.7 : 1
          }}
          disabled={loading}
        >
          {loading ? "전송 중..." : "쪽지 보내기"}
        </button>
      </div>
      
      {/* 메시지 내역 */}
      {recentMessages.length > 0 && (
        <div style={historyContainerStyle}>
          <div 
            style={historyToggleStyle}
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "▼ 이전 메시지 내역 숨기기" : "► 이전 메시지 내역 보기"} ({recentMessages.length}개)
          </div>
          
          {showHistory && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
              {recentMessages.map(message => (
                <div 
                  key={message.id}
                  style={messageItemStyle(message.direction)}
                >
                  <div style={messageDirectionStyle(message.direction)}>
                    {message.direction === "sent" ? "보낸 쪽지" : "받은 쪽지"}
                    {message.subject && ` - ${message.subject}`}
                  </div>
                  
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {message.content}
                  </div>
                  
                  <div style={messageDateStyle}>
                    {formatDate(message.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

SendMessage.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

SendMessage.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalGrades: {}
};

export default SendMessage;
