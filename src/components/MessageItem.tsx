import React, { memo } from 'react';
import { Copy, Trash2, Flag, CornerUpLeft, BarChart3 } from 'lucide-react';

interface Message {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromUserRole?: string;
  toUid: string;
  toNickname: string;
  content: string;
  createdAt: any;
  isRead: boolean;
  postId?: string;
  postTitle?: string;
  reactions?: { emoji: string, users: string[] }[];
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  replyTo?: {
    messageId: string;
    content: string;
    senderNickname: string;
    senderUid: string;
  };
}

interface MessageItemProps {
  msg: Message;
  user: any;
  isMobileView: boolean;
  highlightedMessageId: string | null;
  replyDepth: Map<string, number>;
  hoveredMessageId: string | null;
  mobileReactionMessageId: string | null;
  contextMenu: {msgId: string, x: number, y: number} | null;
  onHover: (id: string | null) => void;
  onMobileReaction: (id: string | null) => void;
  onContextMenu: (msgId: string, x: number, y: number) => void;
  onDoubleClick: (msg: Message, e?: React.MouseEvent) => void;
  onReplySourceClick: (messageId: string) => void;
  onCopy: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onMessageDelete: (msg: Message) => void;
  onReport: (msg: Message) => void;
  onReply: (msg: Message) => void;
  onAnalysis: (msg: Message) => void;
  onReactionDetailClick: (msg: Message) => void;
  toggleReaction: (msg: Message, emoji: string) => void;
  getReplyCount: (messageId: string, messages: Message[]) => number;
  currentMessages: Message[];
}

const MessageItem = memo<MessageItemProps>(({
  msg,
  user,
  isMobileView,
  highlightedMessageId,
  replyDepth,
  hoveredMessageId,
  mobileReactionMessageId,
  contextMenu,
  onHover,
  onMobileReaction,
  onContextMenu,
  onDoubleClick,
  onReplySourceClick,
  onCopy,
  onDelete,
  onMessageDelete,
  onReport,
  onReply,
  onAnalysis,
  onReactionDetailClick,
  toggleReaction,
  getReplyCount,
  currentMessages
}) => {
  const currDate = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : new Date(msg.createdAt);
  
  // 시스템 메시지 렌더링
  if (msg.fromUid === 'system') {
    return (
      <div
        data-message-id={msg.id}
        className="chat-message system"
        style={{
          backgroundColor: '#FFF3CD',
          border: '1px solid #FFEAA7',
          borderRadius: '12px',
          padding: isMobileView ? '6px 10px' : '8px 14px',
          margin: '8px auto',
          maxWidth: isMobileView ? 'calc(85% - 12px)' : 'calc(75% - 16px)',
          textAlign: 'center',
          color: '#856404',
          fontSize: isMobileView ? '13px' : '14px',
          wordBreak: 'keep-all',
          lineHeight: '1.4',
          boxSizing: 'border-box',
          transition: 'all 0.3s ease',
          ...(highlightedMessageId === msg.id && {
            animation: 'highlightPulse 1.5s ease-in-out infinite',
            zIndex: 10
          })
        }}
      >
        <div 
          className="chat-message-content"
          style={{
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
            hyphens: 'auto',
            width: '100%',
            maxWidth: '100%'
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
        marginBottom: '8px',
        maxWidth: '100%'
      }}
      onMouseEnter={() => !isMobileView && onHover(msg.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* 닉네임과 역할 표시 */}
      <div style={{
        fontSize: '12px',
        color: '#666',
        marginBottom: '1px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        paddingLeft: msg.fromUid === user.uid ? '0' : '4px',
        paddingRight: msg.fromUid === user.uid ? '4px' : '0'
      }}>
        <span style={{ fontWeight: '600' }}>
          {msg.fromUid === user.uid ? '나' : msg.fromNickname}
        </span>
        {msg.fromUserRole && msg.fromUserRole !== '일반' && msg.fromUserRole !== 'system' && (
          <span style={{
            fontSize: '10px',
            padding: '1px 4px',
            borderRadius: '8px',
            backgroundColor: msg.fromUserRole === '리더' ? '#FFD700' : 
                          msg.fromUserRole === '운영진' ? '#FF6B35' : 
                          msg.fromUserRole === '부운영진' ? '#8A55CC' : '#E5E7EB',
            color: msg.fromUserRole === '리더' ? '#8B5A00' :
                  msg.fromUserRole === '운영진' ? 'white' :
                  msg.fromUserRole === '부운영진' ? 'white' : '#6B7280',
            fontWeight: '600'
          }}>
            {msg.fromUserRole}
          </span>
        )}
      </div>
      
      {/* 메시지 말풍선과 시간 */}
      <div 
        data-message-id={msg.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexDirection: msg.fromUid === user.uid ? 'row-reverse' : 'row',
          maxWidth: `${Math.max(50, 85 - Math.min((replyDepth.get(msg.id) || 0), 5) * 5)}%`,
          width: 'auto',
          position: 'relative',
          marginBottom: '8px',
          marginLeft: msg.fromUid !== user.uid ? `${(replyDepth.get(msg.id) || 0) * (isMobileView ? 12 : 20)}px` : '0',
          marginRight: msg.fromUid === user.uid ? `${(replyDepth.get(msg.id) || 0) * (isMobileView ? 12 : 20)}px` : '0',
          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
          transition: 'all 0.3s ease',
          ...(highlightedMessageId === msg.id && {
            animation: 'highlightPulse 1.5s ease-in-out infinite',
            zIndex: 10
          })
        }}
      >
        {/* 답장 연결선 */}
        {msg.replyTo && (replyDepth.get(msg.id) || 0) > 0 && (() => {
          const depth = Math.min(replyDepth.get(msg.id) || 0, 5);
          const intensity = 0.3 + (depth * 0.15);
          const hue = 260 + (depth * 10);
          
          return (
            <div style={{
              position: 'absolute',
              left: msg.fromUid === user.uid ? 'auto' : '-15px',
              right: msg.fromUid === user.uid ? '-15px' : 'auto',
              top: '-8px',
              bottom: '-8px',
              width: '3px',
              background: `linear-gradient(to bottom, 
                hsla(${hue}, 55%, 65%, ${intensity * 0.7}) 0%, 
                hsla(${hue}, 55%, 65%, ${intensity}) 50%, 
                hsla(${hue}, 55%, 65%, ${intensity * 0.7}) 100%)`,
              borderRadius: '2px',
              zIndex: 1,
              boxShadow: `0 0 ${depth * 2}px hsla(${hue}, 55%, 65%, 0.3)`
            }} />
          );
        })()}
        
        <div
          className={`chat-message${msg.fromUid === user.uid ? ' sent' : ' received'}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick(msg, e);
          }}
          onClick={(e) => {
            if (isMobileView) {
              e.stopPropagation();
              if (mobileReactionMessageId === msg.id) {
                onMobileReaction(null);
              } else {
                onMobileReaction(msg.id);
                setTimeout(() => onMobileReaction(null), 3000);
              }
            }
          }}
          onContextMenu={e => {
            e.preventDefault();
            const menuWidth = 160;
            const menuHeight = 200;
            let x = e.clientX;
            let y = e.clientY;
            
            if (x + menuWidth > window.innerWidth) {
              x = window.innerWidth - menuWidth - 10;
            }
            if (y + menuHeight > window.innerHeight) {
              y = window.innerHeight - menuHeight - 10;
            }
            if (x < 10) x = 10;
            if (y < 10) y = 10;
            
            onContextMenu(msg.id, x, y);
          }}
          style={{ 
            maxWidth: '75%',
            minWidth: '0',
            width: 'auto',
            display: 'block',
            position: 'relative',
            margin: '0',
            alignSelf: 'auto',
            flex: '0 0 auto',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere'
          }}
        >
          {/* 답장 인용 표시 */}
          {msg.replyTo && (
            <div 
              onClick={() => onReplySourceClick(msg.replyTo!.messageId)}
              style={{
                background: `linear-gradient(135deg, #F8F4FF 0%, #F3E8FF 100%)`,
                border: `3px solid #8A55CC`,
                borderRadius: '16px',
                padding: '12px 16px',
                marginBottom: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontSize: '13px',
                lineHeight: '1.4',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '6px',
                fontWeight: '700',
                fontSize: '12px',
                color: '#8A55CC',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <CornerUpLeft size={14} strokeWidth={3} />
                <span>↪ {msg.replyTo.senderNickname}에게 답장</span>
              </div>
              <div style={{
                color: '#374151',
                fontWeight: '500',
                fontStyle: 'italic',
                opacity: 0.8
              }}>
                "{msg.replyTo.content.length > 60 
                  ? msg.replyTo.content.substring(0, 60) + '...' 
                  : msg.replyTo.content}"
              </div>
            </div>
          )}
          
          <div 
            className="chat-message-content"
            style={{
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              hyphens: 'auto',
              width: '100%',
              maxWidth: '100%'
            }}
          >
            {msg.content}
          </div>
          
          {/* 답장 카운트 표시 */}
          {getReplyCount(msg.id, currentMessages) > 0 && (
            <div style={{
              marginTop: '8px',
              fontSize: '11px',
              color: '#8A55CC',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              opacity: 0.8
            }}>
              <span>💬</span>
              <span>답장 {getReplyCount(msg.id, currentMessages)}개</span>
            </div>
          )}
          
          {/* 호버/터치 시 나타나는 버튼들 */}
          {((isMobileView && mobileReactionMessageId === msg.id) || (!isMobileView && hoveredMessageId === msg.id)) && (
            <div 
              className="message-hover-buttons"
              style={{
                position: 'absolute',
                top: '-45px',
                [msg.fromUid === user.uid ? 'right' : 'left']: '-10px',
                display: 'flex',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(15px)',
                borderRadius: '25px',
                padding: '8px 12px',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(232, 221, 208, 0.4)',
                zIndex: 9999
              }}
            >
              {/* 답장 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(msg);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'background 0.2s ease'
                }}
              >
                <CornerUpLeft size={18} color="#8B4513" strokeWidth={2.5} />
              </button>
              
              {/* 이모지 리액션 버튼들 */}
              {['❤️', '😂', '👍', '😮', '😢', '👏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReaction(msg, emoji);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '16px',
                    transition: 'transform 0.2s ease, background 0.2s ease'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* 시간 표시 */}
        <div style={{
          display: 'flex',
          flexDirection: msg.fromUid === user.uid ? 'row' : 'row-reverse',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: '#999',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          minWidth: '45px'
        }}>
          <span style={{
            textAlign: msg.fromUid === user.uid ? 'left' : 'right'
          }}>
            {currDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </div>
      </div>
      
      {/* 리액션 표시 */}
      {msg.reactions && msg.reactions.length > 0 && (
        <div style={{
          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
          maxWidth: '85%',
          marginTop: '4px'
        }}>
          <div className="chat-message-reactions">
            {(() => {
              const allUsers = new Set();
              msg.reactions!.forEach(r => r.users.forEach(uid => allUsers.add(uid)));
              const totalCount = allUsers.size;
              
              const topReaction = msg.reactions!.reduce((max, current) => 
                current.users.length > max.users.length ? current : max
              );
              
              return (
                <span 
                  className={`reaction-emoji${topReaction.users.includes(user?.uid) ? ' my' : ''}`} 
                  onClick={e => {e.stopPropagation(); onReactionDetailClick(msg);}}
                >
                  <span className="reaction-emoji-icon">{topReaction.emoji}</span>
                  <span className="reaction-count">{topReaction.users.length}</span>
                  {totalCount > topReaction.users.length && (
                    <>
                      <span style={{ margin: '0 4px', opacity: 0.6 }}>👤</span>
                      <span className="reaction-count">{totalCount}</span>
                    </>
                  )}
                </span>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* 컨텍스트 메뉴 */}
      {contextMenu && contextMenu.msgId === msg.id && (
        <div className="chat-context-menu" style={{top: contextMenu.y, left: contextMenu.x}}>
          <button onClick={() => onCopy(msg)}><Copy size={16}/> 복사</button>
          {user && msg.fromUid === user.uid && <button onClick={() => onDelete(msg)}><Trash2 size={16}/> 삭제</button>}
          {user && (user.role === '리더' || user.role === '운영진') && msg.fromUid !== user.uid && <button onClick={() => onMessageDelete(msg)}><Trash2 size={16}/> 삭제</button>}
          <button onClick={() => onReport(msg)}><Flag size={16}/> 신고</button>
          <button onClick={() => onReply(msg)}><CornerUpLeft size={16}/> 답장</button>
          {user && (user.role === '리더' || user.role === '운영진') && <button onClick={() => onAnalysis(msg)}><BarChart3 size={16}/> 분석</button>}
        </div>
      )}
      
      {/* 파일 표시 */}
      {msg.fileUrl && (
        <div className="chat-message-file" style={{
          alignSelf: msg.fromUid === user.uid ? 'flex-end' : 'flex-start',
          marginTop: '4px'
        }}>
          {msg.fileType?.startsWith('image/') ? (
            <img src={msg.fileUrl} alt="img" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8 }} />
          ) : msg.fileType?.startsWith('video/') ? (
            <video src={msg.fileUrl} controls style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8 }} />
          ) : (
            <a href={msg.fileUrl} download={msg.fileName} className="chat-file-download">{msg.fileName || '파일 다운로드'}</a>
          )}
        </div>
      )}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem; 