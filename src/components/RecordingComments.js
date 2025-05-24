import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, 
  doc, 
  getDoc, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  Timestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { containerStyle, darkContainerStyle, titleStyle } from './style';

function RecordingComments({ darkMode }) {
  const { recordingId } = useParams();
  const navigate = useNavigate();
  const [recording, setRecording] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const currentUser = localStorage.getItem('nickname');

  // 녹음 정보 가져오기
  useEffect(() => {
    const fetchRecording = async () => {
      try {
        const recordingRef = doc(db, 'mypage_recordings', recordingId);
        const recordingSnap = await getDoc(recordingRef);
        
        if (recordingSnap.exists()) {
          setRecording({ id: recordingSnap.id, ...recordingSnap.data() });
        } else {
          console.error('녹음을 찾을 수 없습니다.');
          navigate('/mypage');
        }
      } catch (error) {
        console.error('녹음 로드 오류:', error);
      }
    };

    fetchRecording();
  }, [recordingId, navigate]);

  // 댓글 실시간 로드
  useEffect(() => {
    if (!recordingId) return;

    const commentsQuery = query(
      collection(db, `recording-comments-${recordingId}`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(commentsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [recordingId]);

  // 댓글 작성
  const submitComment = async () => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!newComment.trim()) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, `recording-comments-${recordingId}`), {
        author: currentUser,
        content: newComment.trim(),
        createdAt: Timestamp.now(),
        likes: 0
      });

      // 녹음 파일의 댓글 수 업데이트
      const recordingRef = doc(db, 'mypage_recordings', recordingId);
      await updateDoc(recordingRef, {
        commentCount: comments.length + 1
      });

      setNewComment('');
      alert('댓글이 등록되었습니다.');
    } catch (error) {
      console.error('댓글 등록 오류:', error);
      alert('댓글 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // 댓글 삭제
  const deleteComment = async (commentId, author) => {
    if (currentUser !== author && currentUser !== recording?.uploaderNickname) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!window.confirm('이 댓글을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, `recording-comments-${recordingId}`, commentId));
      
      // 녹음 파일의 댓글 수 업데이트
      const recordingRef = doc(db, 'mypage_recordings', recordingId);
      await updateDoc(recordingRef, {
        commentCount: Math.max(0, comments.length - 1)
      });

      alert('댓글이 삭제되었습니다.');
    } catch (error) {
      console.error('댓글 삭제 오류:', error);
      alert('댓글 삭제 중 오류가 발생했습니다.');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ko-KR');
  };

  if (loading) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3e7ff', 
            borderTop: '4px solid #7e57c2', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite', 
            margin: '0 auto 20px' 
          }}></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <h2>녹음을 찾을 수 없습니다.</h2>
          <button onClick={() => navigate('/mypage')} style={{
            padding: '10px 20px',
            backgroundColor: '#7e57c2',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            마이페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{
        backgroundColor: darkMode ? '#2a2a2a' : '#fff',
        borderRadius: '12px',
        padding: '30px',
        marginBottom: '20px',
        boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
        border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={() => navigate('/mypage')}
            style={{
              padding: '8px 16px',
              backgroundColor: darkMode ? '#555' : '#e0e0e0',
              color: darkMode ? '#e0e0e0' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginRight: '20px'
            }}
          >
            ← 돌아가기
          </button>
          <h1 style={{
            ...titleStyle,
            margin: 0,
            flex: 1
          }}>
            🎵 {recording.title} - 댓글
          </h1>
        </div>

        {/* 녹음 정보 */}
        <div style={{
          backgroundColor: darkMode ? '#333' : '#f8f4ff',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px',
          border: `1px solid ${darkMode ? '#555' : '#e8dbff'}`
        }}>
          <h3 style={{
            margin: '0 0 10px 0',
            color: darkMode ? '#bb86fc' : '#7e57c2'
          }}>
            {recording.title}
          </h3>
          
          {recording.description && (
            <p style={{
              margin: '0 0 15px 0',
              color: darkMode ? '#ccc' : '#666',
              lineHeight: '1.5'
            }}>
              {recording.description}
            </p>
          )}

          <div style={{
            display: 'flex',
            gap: '15px',
            fontSize: '12px',
            color: darkMode ? '#aaa' : '#888',
            marginBottom: '15px'
          }}>
            <span>👤 {recording.uploaderNickname}</span>
            <span>📅 {formatDate(recording.createdAt)}</span>
            <span>📁 {recording.fileName}</span>
          </div>

          {/* 오디오 플레이어 */}
          <audio 
            controls 
            style={{ 
              width: '100%',
              outline: 'none'
            }}
            preload="metadata"
          >
            <source src={recording.downloadURL} type="audio/mpeg" />
            <source src={recording.downloadURL} type="audio/wav" />
            <source src={recording.downloadURL} type="audio/ogg" />
            브라우저가 오디오 재생을 지원하지 않습니다.
          </audio>
        </div>

        {/* 댓글 작성 */}
        {currentUser && (
          <div style={{
            backgroundColor: darkMode ? '#333' : '#f9f9f9',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`
          }}>
            <h3 style={{
              margin: '0 0 15px 0',
              color: darkMode ? '#bb86fc' : '#7e57c2'
            }}>
              댓글 작성
            </h3>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                backgroundColor: darkMode ? '#2a2a2a' : '#fff',
                color: darkMode ? '#e0e0e0' : '#333',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '10px',
                boxSizing: 'border-box'
              }}
              disabled={submitting}
            />
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={submitComment}
                disabled={submitting || !newComment.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: submitting ? '#ccc' : '#7e57c2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {submitting ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </div>
        )}

        {/* 댓글 목록 */}
        <div style={{
          backgroundColor: darkMode ? '#333' : '#f9f9f9',
          padding: '20px',
          borderRadius: '8px',
          border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            color: darkMode ? '#bb86fc' : '#7e57c2'
          }}>
            댓글 ({comments.length})
          </h3>

          {comments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    backgroundColor: darkMode ? '#2a2a2a' : '#fff',
                    padding: '15px',
                    borderRadius: '8px',
                    border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <strong style={{
                        color: darkMode ? '#e0e0e0' : '#333',
                        marginRight: '10px'
                      }}>
                        {comment.author}
                      </strong>
                      <span style={{
                        fontSize: '12px',
                        color: darkMode ? '#aaa' : '#666'
                      }}>
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    
                    {(currentUser === comment.author || currentUser === recording.uploaderNickname) && (
                      <button
                        onClick={() => deleteComment(comment.id, comment.author)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  
                  <p style={{
                    margin: 0,
                    color: darkMode ? '#e0e0e0' : '#333',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: darkMode ? '#aaa' : '#666'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>💬</div>
              <p style={{ margin: 0 }}>
                첫 번째 댓글을 작성해보세요!
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default RecordingComments; 