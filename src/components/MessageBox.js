import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc,
  limit, startAfter, where, addDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, smallBtn, purpleBtn
} from "./style";

function MessageBox({ darkMode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null); // 선택된 채팅 상대
  const [replyContent, setReplyContent] = useState("");
  const [chatGroups, setChatGroups] = useState({}); // 사용자별 채팅 그룹
  
  const me = localStorage.getItem("nickname");
  const PAGE_SIZE = 100; // 채팅방 스타일에서는 더 많은 메시지를 로드
  
  // 메시지를 사용자별로 그룹핑하는 함수 (받은 쪽지와 보낸 쪽지 모두 포함)
  const groupMessagesByUser = useCallback((messages) => {
    const groups = {};
    
    messages.forEach(msg => {
      // 나와 상대방을 구분
      const chatPartner = msg.senderNickname === me ? msg.receiverNickname : msg.senderNickname;
      
      if (!groups[chatPartner]) {
        groups[chatPartner] = {
          partner: chatPartner,
          messages: [],
          lastMessage: null,
          unreadCount: 0
        };
      }
      
      groups[chatPartner].messages.push({
        ...msg,
        isFromMe: msg.senderNickname === me // 내가 보낸 메시지인지 표시
      });
      
      // 최신 메시지로 마지막 메시지 업데이트
      if (!groups[chatPartner].lastMessage || 
          msg.createdAt.seconds > groups[chatPartner].lastMessage.createdAt.seconds) {
        groups[chatPartner].lastMessage = msg;
      }
      
      // 상대방이 보낸 읽지 않은 메시지 개수 계산
      if (msg.senderNickname !== me && !msg.read) {
        groups[chatPartner].unreadCount++;
      }
    });
    
    // 각 그룹의 메시지를 시간순으로 정렬
    Object.values(groups).forEach(group => {
      group.messages.sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
    });
    
    return groups;
  }, [me]);

  // 통합 쿼리 생성 함수 (받은 쪽지와 보낸 쪽지 모두)
  const createQuery = useCallback(() => {
    // 받은 쪽지와 보낸 쪽지를 모두 가져오기 위해 두 개의 쿼리를 사용
    const receivedQuery = query(
      collection(db, "messages"),
      where("receiverNickname", "==", me),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );
    
    const sentQuery = query(
      collection(db, "messages"),
      where("senderNickname", "==", me),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );
    
    return { receivedQuery, sentQuery };
  }, [me, PAGE_SIZE]);
  
  // 초기 데이터 로드
  useEffect(() => {
    if (!me) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const { receivedQuery, sentQuery } = createQuery();
    let allMessages = [];
    let completedQueries = 0;
    
    // 받은 쪽지 실시간 감시
    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const receivedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      allMessages = [...allMessages.filter(msg => msg.senderNickname === me), ...receivedMessages];
      completedQueries++;
      
      if (completedQueries === 2) {
        const groups = groupMessagesByUser(allMessages);
        setChatGroups(groups);
        setLoading(false);
      }
    }, (err) => {
      console.error("받은 쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    // 보낸 쪽지 실시간 감시
    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const sentMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        read: doc.data().read || false
      }));
      
      allMessages = [...allMessages.filter(msg => msg.receiverNickname === me), ...sentMessages];
      completedQueries++;
      
      if (completedQueries === 2) {
        const groups = groupMessagesByUser(allMessages);
        setChatGroups(groups);
        setLoading(false);
      }
    }, (err) => {
      console.error("보낸 쪽지 불러오기 오류:", err);
      setError("쪽지를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    setSelectedChat(null);
    setReplyContent("");
    
    return () => {
      unsubscribeReceived();
      unsubscribeSent();
    };
  }, [me, createQuery, groupMessagesByUser]);

  // 채팅 상대 선택
  const selectChat = async (partner) => {
    setSelectedChat(partner);
    
    // 받은 쪽지함에서 해당 상대방의 모든 메시지를 읽음으로 표시
    if (chatGroups[partner]) {
      const unreadMessages = chatGroups[partner].messages.filter(msg => !msg.read);
      
      for (const msg of unreadMessages) {
        try {
          await updateDoc(doc(db, "messages", msg.id), { read: true });
        } catch (error) {
          console.error("메시지 읽음 처리 오류:", error);
        }
      }
    }
  };

  // 답장 전송
  const sendReply = async () => {
    if (!replyContent.trim() || !selectedChat) return;
    
    try {
      await addDoc(collection(db, "messages"), {
        senderNickname: me,
        receiverNickname: selectedChat,
        content: replyContent.trim(),
        createdAt: Timestamp.now(),
        read: false,
        relatedPostTitle: null // 게시글과 연관없는 일반 쪽지
      });
      
      setReplyContent("");
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  // 메시지 삭제
  const deleteMessage = async (id) => {
    if (!window.confirm("이 메시지를 삭제하시겠습니까?")) return;
    
    try {
      await deleteDoc(doc(db, "messages", id));
      console.log("메시지 삭제 완료");
    } catch (error) {
      console.error("메시지 삭제 오류:", error);
      alert("메시지 삭제 중 오류가 발생했습니다.");
    }
  };

  const formatDate = (seconds) => {
    try {
      const date = new Date(seconds * 1000);
      const now = new Date();
      const diffInHours = (now - date) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return date.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit"
        });
      } else if (diffInHours < 168) { // 7일
        return date.toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric"
        });
      } else {
        return date.toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
    } catch (error) {
      return "날짜 오류";
    }
  };

  const cardStyle = {
    backgroundColor: darkMode ? "#2a1b3d" : "#f8f4ff",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: darkMode 
      ? "0 4px 20px rgba(126, 87, 194, 0.3)" 
      : "0 4px 20px rgba(126, 87, 194, 0.1)",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
    background: darkMode 
      ? "linear-gradient(135deg, #2a1b3d 0%, #1a1530 100%)"
      : "linear-gradient(135deg, #f8f5ff 0%, #f0ebff 100%)"
  };

  const chatListStyle = {
    width: "300px",
    height: "500px",
    overflowY: "auto",
    borderRight: `1px solid ${darkMode ? "#444" : "#ddd"}`,
    backgroundColor: darkMode ? "#1a1530" : "#faf8ff"
  };

  const chatWindowStyle = {
    flex: 1,
    height: "500px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: darkMode ? "#2a1b3d" : "#fff"
  };

  const messageStyle = (isFromMe) => ({
    maxWidth: "70%",
    padding: "8px 12px",
    margin: "4px 0",
    borderRadius: "12px",
    backgroundColor: isFromMe 
      ? (darkMode ? "#7e57c2" : "#9c68e6")
      : (darkMode ? "#444" : "#f0f0f0"),
    color: isFromMe ? "#fff" : (darkMode ? "#e0e0e0" : "#333"),
    alignSelf: isFromMe ? "flex-end" : "flex-start",
    wordBreak: "break-word"
  });

  if (loading && Object.keys(chatGroups).length === 0) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid #f3e7ff", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>쪽지를 불러오는 중...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0", color: "#f44336" }}>
          <h2>오류 발생</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={cardStyle}>
        <h1 style={{
          ...titleStyle,
          background: darkMode 
            ? "linear-gradient(135deg, #bb86fc 0%, #7e57c2 100%)"
            : "linear-gradient(135deg, #7e57c2 0%, #5e35b1 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          textAlign: "center",
          marginBottom: "20px"
        }}>
          쪽지함
        </h1>
        
        <div style={{ display: "flex", height: "500px", borderRadius: "12px", overflow: "hidden" }}>
          {/* 채팅 목록 */}
          <div style={chatListStyle}>
            <div style={{ 
              padding: "15px", 
              backgroundColor: darkMode ? "#2a1b3d" : "#f3e7ff",
              borderBottom: `1px solid ${darkMode ? "#444" : "#ddd"}`
            }}>
              <h3 style={{ 
                margin: 0, 
                color: darkMode ? "#bb86fc" : "#7e57c2",
                fontSize: "16px"
              }}>
                대화 목록 ({Object.keys(chatGroups).length})
              </h3>
            </div>
            
            <div style={{ height: "calc(100% - 60px)", overflowY: "auto" }}>
              {Object.values(chatGroups)
                .sort((a, b) => b.lastMessage.createdAt.seconds - a.lastMessage.createdAt.seconds)
                .map(group => (
                  <div
                    key={group.partner}
                    onClick={() => selectChat(group.partner)}
                    style={{
                      padding: "12px 15px",
                      cursor: "pointer",
                      borderBottom: `1px solid ${darkMode ? "#333" : "#eee"}`,
                      backgroundColor: selectedChat === group.partner 
                        ? (darkMode ? "rgba(126, 87, 194, 0.2)" : "rgba(126, 87, 194, 0.1)")
                        : "transparent",
                      transition: "background-color 0.2s",
                      "&:hover": {
                        backgroundColor: darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)"
                      }
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px"
                    }}>
                      <span style={{
                        fontWeight: "bold",
                        color: darkMode ? "#e0e0e0" : "#333"
                      }}>
                        {group.partner}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {group.unreadCount > 0 && (
                          <span style={{
                            background: "#f44336",
                            color: "white",
                            borderRadius: "10px",
                            padding: "2px 6px",
                            fontSize: "10px",
                            fontWeight: "bold"
                          }}>
                            {group.unreadCount}
                          </span>
                        )}
                        <span style={{
                          fontSize: "12px",
                          color: darkMode ? "#aaa" : "#666"
                        }}>
                          {formatDate(group.lastMessage.createdAt.seconds)}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: "13px",
                      color: darkMode ? "#bbb" : "#666",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {group.lastMessage.relatedPostTitle 
                        ? `[${group.lastMessage.relatedPostTitle}] ${group.lastMessage.content}`
                        : group.lastMessage.content
                      }
                    </div>
                  </div>
                ))}
              
              {Object.keys(chatGroups).length === 0 && (
                <div style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: darkMode ? "#aaa" : "#666"
                }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>💬</div>
                  <p>대화가 없습니다.</p>
                </div>
              )}
            </div>
          </div>
          
          {/* 채팅 창 */}
          <div style={chatWindowStyle}>
            {selectedChat ? (
              <>
                {/* 채팅 헤더 */}
                <div style={{
                  padding: "15px 20px",
                  backgroundColor: darkMode ? "#3a2a5a" : "#f8f4ff",
                  borderBottom: `1px solid ${darkMode ? "#444" : "#ddd"}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <h3 style={{
                    margin: 0,
                    color: darkMode ? "#bb86fc" : "#7e57c2",
                    fontSize: "16px"
                  }}>
                    {selectedChat}님과의 대화
                  </h3>
                  <CustomLink to={`/userpage/${selectedChat}`}>
                    <button style={{
                      ...smallBtn,
                      backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      fontSize: "12px"
                    }}>
                      프로필 보기
                    </button>
                  </CustomLink>
                </div>
                
                {/* 메시지 목록 */}
                <div style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  {chatGroups[selectedChat]?.messages.map(msg => (
                    <div key={msg.id} style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: msg.senderNickname === me ? "flex-end" : "flex-start"
                    }}>
                      <div style={messageStyle(msg.senderNickname === me)}>
                        {msg.relatedPostTitle && (
                          <div style={{
                            fontSize: "11px",
                            opacity: 0.8,
                            marginBottom: "4px",
                            fontStyle: "italic"
                          }}>
                            관련 게시글: {msg.relatedPostTitle}
                          </div>
                        )}
                        <div>{msg.content}</div>
                      </div>
                      <div style={{
                        fontSize: "10px",
                        color: darkMode ? "#aaa" : "#999",
                        marginTop: "2px",
                        display: "flex",
                        gap: "8px",
                        alignItems: "center"
                      }}>
                        <span>{formatDate(msg.createdAt.seconds)}</span>
                        {msg.senderNickname === me && (
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#f44336",
                              cursor: "pointer",
                              fontSize: "10px"
                            }}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* 답장 입력창 */}
                <div style={{
                  padding: "15px 20px",
                  backgroundColor: darkMode ? "#1a1530" : "#faf8ff",
                  borderTop: `1px solid ${darkMode ? "#444" : "#ddd"}`
                }}>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      type="text"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="메시지를 입력하세요..."
                      style={{
                        flex: 1,
                        padding: "10px 15px",
                        borderRadius: "20px",
                        border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                        backgroundColor: darkMode ? "#333" : "#fff",
                        color: darkMode ? "#fff" : "#333",
                        outline: "none"
                      }}
                      onKeyPress={(e) => e.key === "Enter" && sendReply()}
                    />
                    <button
                      onClick={sendReply}
                      disabled={!replyContent.trim()}
                      style={{
                        ...purpleBtn,
                        padding: "10px 20px",
                        borderRadius: "20px",
                        border: "none",
                        opacity: replyContent.trim() ? 1 : 0.5
                      }}
                    >
                      전송
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                color: darkMode ? "#aaa" : "#666",
                textAlign: "center"
              }}>
                <div>
                  <div style={{ fontSize: "48px", marginBottom: "15px" }}>💬</div>
                  <p>대화를 선택해주세요.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

MessageBox.propTypes = {
  darkMode: PropTypes.bool,
};

MessageBox.defaultProps = {
  darkMode: false,
};

export default MessageBox;
