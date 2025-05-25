import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { containerStyle, darkContainerStyle, titleStyle } from './style';

// 등급 이모지 매핑
const gradeEmojis = {
  "체리": "🍒",
  "블루베리": "🫐",
  "키위": "🥝",
  "사과": "🍎",
  "멜론": "🍈",
  "수박": "🍉",
  "지구": "🌏",
  "토성": "🪐",
  "태양": "🌞",
  "은하": "🌌",
  "맥주": "🍺",
  "번개": "⚡",
  "달": "🌙",
  "별": "⭐"
};

function UserPage({ darkMode, globalProfilePics, globalIntroductions, globalGrades }) {
  const { nickname } = useParams();
  const navigate = useNavigate();
  const currentUser = localStorage.getItem("nickname");
  
  const [activeTab, setActiveTab] = useState('profile');
  const [recordings, setRecordings] = useState([]);
  const [guestbookEntries, setGuestbookEntries] = useState([]);
  const [newGuestbookMessage, setNewGuestbookMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [guestbookLoading, setGuestbookLoading] = useState(false);

  // 사용자 정보 로드
  useEffect(() => {
    if (!nickname) {
      navigate('/');
      return;
    }
    setLoading(false);
  }, [nickname, navigate]);

  // 녹음 데이터 로드
  useEffect(() => {
    if (activeTab !== 'recordings' || !nickname) return;
    
    setRecordingsLoading(true);
    const q = query(
      collection(db, 'mypage_recordings'),
      where('uploaderNickname', '==', nickname),
      where('isPrivate', '==', false), // 공개된 녹음만
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordingList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecordings(recordingList);
      setRecordingsLoading(false);
    }, (error) => {
      console.error('녹음 로드 오류:', error);
      setRecordingsLoading(false);
    });

    return () => unsubscribe();
  }, [activeTab, nickname]);

  // 방명록 데이터 로드
  useEffect(() => {
    if (activeTab !== 'guestbook' || !nickname) return;
    
    setGuestbookLoading(true);
    const q = query(
      collection(db, `guestbook-${nickname}`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGuestbookEntries(entries);
      setGuestbookLoading(false);
    }, (error) => {
      console.error('방명록 로드 오류:', error);
      setGuestbookLoading(false);
    });

    return () => unsubscribe();
  }, [activeTab, nickname]);

  // 방명록 작성
  const submitGuestbookEntry = async () => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!newGuestbookMessage.trim()) {
      alert('메시지를 입력해주세요.');
      return;
    }

    if (currentUser === nickname) {
      alert('자신의 방명록에는 작성할 수 없습니다.');
      return;
    }

    try {
      await addDoc(collection(db, `guestbook-${nickname}`), {
        author: currentUser,
        message: newGuestbookMessage.trim(),
        createdAt: Timestamp.now()
      });
      
      setNewGuestbookMessage('');
      alert('방명록이 작성되었습니다.');
    } catch (error) {
      console.error('방명록 작성 오류:', error);
      alert('방명록 작성 중 오류가 발생했습니다.');
    }
  };

  // 방명록 삭제
  const deleteGuestbookEntry = async (entryId, author) => {
    if (currentUser !== author && currentUser !== nickname) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!window.confirm('이 방명록 항목을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, `guestbook-${nickname}`, entryId));
      alert('방명록이 삭제되었습니다.');
    } catch (error) {
      console.error('방명록 삭제 오류:', error);
      alert('방명록 삭제 중 오류가 발생했습니다.');
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
          <p>사용자 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const userGrade = globalGrades[nickname];
  const userProfilePic = globalProfilePics[nickname];
  const userIntroduction = globalIntroductions[nickname];

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      {/* 헤더 */}
      <div style={{
        backgroundColor: darkMode ? '#2a2a2a' : '#fff',
        borderRadius: '12px',
        padding: '30px',
        marginBottom: '20px',
        boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
        border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '20px'
        }}>
          <img
            src={userProfilePic || '/default-avatar.png'}
            alt={nickname}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `3px solid ${darkMode ? '#bb86fc' : '#7e57c2'}`
            }}
          />
          <div style={{ flex: 1 }}>
            <h1 style={{
              ...titleStyle,
              margin: '0 0 10px 0',
              fontSize: '28px'
            }}>
              {nickname}님의 페이지
            </h1>
            {userGrade && (
              <div style={{
                color: darkMode ? '#bb86fc' : '#7e57c2',
                fontSize: '16px',
                fontWeight: 'bold',
                marginBottom: '10px'
              }}>
                {gradeEmojis[userGrade]} {userGrade}
              </div>
            )}
            {userIntroduction && (
              <p style={{
                color: darkMode ? '#ccc' : '#666',
                fontSize: '14px',
                margin: '0',
                lineHeight: '1.5'
              }}>
                {userIntroduction}
              </p>
            )}
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div style={{
          display: 'flex',
          borderBottom: `2px solid ${darkMode ? '#444' : '#e0e0e0'}`,
          gap: '0'
        }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'none',
              color: activeTab === 'profile' 
                ? (darkMode ? '#bb86fc' : '#7e57c2')
                : (darkMode ? '#aaa' : '#666'),
              borderBottom: activeTab === 'profile' 
                ? `3px solid ${darkMode ? '#bb86fc' : '#7e57c2'}`
                : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: activeTab === 'profile' ? 'bold' : 'normal',
              transition: 'all 0.3s ease'
            }}
          >
            📊 프로필 & 활동
          </button>
          <button
            onClick={() => setActiveTab('recordings')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'none',
              color: activeTab === 'recordings' 
                ? (darkMode ? '#bb86fc' : '#7e57c2')
                : (darkMode ? '#aaa' : '#666'),
              borderBottom: activeTab === 'recordings' 
                ? `3px solid ${darkMode ? '#bb86fc' : '#7e57c2'}`
                : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: activeTab === 'recordings' ? 'bold' : 'normal',
              transition: 'all 0.3s ease'
            }}
          >
            🎵 녹음 ({recordings.length})
          </button>
          <button
            onClick={() => setActiveTab('guestbook')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'none',
              color: activeTab === 'guestbook' 
                ? (darkMode ? '#bb86fc' : '#7e57c2')
                : (darkMode ? '#aaa' : '#666'),
              borderBottom: activeTab === 'guestbook' 
                ? `3px solid ${darkMode ? '#bb86fc' : '#7e57c2'}`
                : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: activeTab === 'guestbook' ? 'bold' : 'normal',
              transition: 'all 0.3s ease'
            }}
          >
            📖 방명록 ({guestbookEntries.length})
          </button>
        </div>
      </div>

      {/* 탭 내용 */}
      {activeTab === 'profile' && (
        <div style={{
          backgroundColor: darkMode ? '#2a2a2a' : '#fff',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
          border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            color: darkMode ? '#bb86fc' : '#7e57c2'
          }}>
            프로필 정보
          </h3>
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: darkMode ? '#aaa' : '#666'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>👤</div>
            <p>프로필 정보가 곧 업데이트됩니다.</p>
          </div>
        </div>
      )}

      {activeTab === 'recordings' && (
        <div style={{
          backgroundColor: darkMode ? '#2a2a2a' : '#fff',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
          border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            color: darkMode ? '#bb86fc' : '#7e57c2'
          }}>
            공개 녹음 목록
          </h3>
          
          {recordingsLoading ? (
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
              <p>녹음을 불러오는 중...</p>
            </div>
          ) : recordings.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  style={{
                    backgroundColor: darkMode ? '#333' : '#f9f9f9',
                    borderRadius: '12px',
                    padding: '20px',
                    border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`
                  }}
                >
                  <h4 style={{
                    margin: '0 0 10px 0',
                    color: darkMode ? '#e0e0e0' : '#333'
                  }}>
                    {recording.title}
                  </h4>
                  {recording.description && (
                    <p style={{
                      margin: '0 0 15px 0',
                      color: darkMode ? '#ccc' : '#666',
                      fontSize: '14px'
                    }}>
                      {recording.description}
                    </p>
                  )}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#888',
                    marginBottom: '15px'
                  }}>
                    <span>📅 {formatDate(recording.createdAt)}</span>
                    {recording.fileName && <span>📁 {recording.fileName}</span>}
                  </div>
                  {recording.downloadURL && (
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
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: darkMode ? '#aaa' : '#666'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎤</div>
              <p>아직 공개된 녹음이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'guestbook' && (
        <div style={{
          backgroundColor: darkMode ? '#2a2a2a' : '#fff',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
          border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            color: darkMode ? '#bb86fc' : '#7e57c2'
          }}>
            방명록
          </h3>

          {/* 방명록 작성 */}
          {currentUser && currentUser !== nickname && (
            <div style={{
              backgroundColor: darkMode ? '#333' : '#f9f9f9',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`
            }}>
              <textarea
                value={newGuestbookMessage}
                onChange={(e) => setNewGuestbookMessage(e.target.value)}
                placeholder="방명록을 남겨주세요..."
                style={{
                  width: '100%',
                  minHeight: '80px',
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
                maxLength={500}
              />
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={submitGuestbookEntry}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: darkMode ? '#bb86fc' : '#7e57c2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  방명록 작성
                </button>
              </div>
            </div>
          )}

          {/* 방명록 목록 */}
          {guestbookLoading ? (
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
              <p>방명록을 불러오는 중...</p>
            </div>
          ) : guestbookEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {guestbookEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    backgroundColor: darkMode ? '#333' : '#f9f9f9',
                    padding: '15px',
                    borderRadius: '8px',
                    border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <Link to={`/userpage/${entry.author}`} style={{ textDecoration: 'none' }}>
                        <strong style={{
                          color: darkMode ? '#bb86fc' : '#7e57c2',
                          marginRight: '10px'
                        }}>
                          {entry.author}
                        </strong>
                      </Link>
                      <span style={{
                        fontSize: '12px',
                        color: darkMode ? '#aaa' : '#666'
                      }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    {(currentUser === entry.author || currentUser === nickname) && (
                      <button
                        onClick={() => deleteGuestbookEntry(entry.id, entry.author)}
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
                    {entry.message}
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
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>📖</div>
              <p>
                {currentUser === nickname 
                  ? "아직 방명록이 없습니다." 
                  : "첫 번째 방명록을 남겨보세요!"
                }
              </p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

UserPage.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalIntroductions: PropTypes.object,
  globalGrades: PropTypes.object
};

UserPage.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalIntroductions: {},
  globalGrades: {}
};

export default UserPage; 