import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { containerStyle, darkContainerStyle, titleStyle } from './style';

function UserRecordings({ darkMode, globalProfilePics, globalGrades }) {
  const { nickname } = useParams();
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userExists, setUserExists] = useState(true);

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

  // 해당 사용자의 녹음 파일 로드
  useEffect(() => {
    if (!nickname) return;

    const q = query(
      collection(db, 'mypage_recordings'),
      where('uploaderNickname', '==', nickname),
      where('isPublic', '==', true), // 공개된 녹음만
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty && loading) {
        // 사용자가 없거나 녹음이 없음
        setUserExists(false);
      } else {
        setUserExists(true);
      }
      
      const recordingList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecordings(recordingList);
      setLoading(false);
    }, (error) => {
      console.error('녹음 로드 오류:', error);
      setLoading(false);
      setUserExists(false);
    });

    return () => unsubscribe();
  }, [nickname, loading]);

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
          <p>녹음 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!userExists) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{
          backgroundColor: darkMode ? '#2a2a2a' : '#fff',
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: `0 4px 12px ${darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
          border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>😅</div>
          <h2 style={{
            color: darkMode ? '#bb86fc' : '#7e57c2',
            marginBottom: '15px'
          }}>
            사용자를 찾을 수 없습니다
          </h2>
          <p style={{
            color: darkMode ? '#ccc' : '#666',
            marginBottom: '20px'
          }}>
            "{nickname}" 사용자가 존재하지 않거나 녹음을 업로드하지 않았습니다.
          </p>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 24px',
              backgroundColor: darkMode ? '#7e57c2' : '#7e57c2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            이전 페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const userGrade = globalGrades[nickname] || '';
  const gradeEmoji = userGrade ? gradeEmojis[userGrade] : '';

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
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
          <button
            onClick={() => navigate(`/userpage/${nickname}`)}
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
            ← 프로필로 돌아가기
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <img
              src={globalProfilePics[nickname] || '/default-avatar.png'}
              alt={nickname}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                objectFit: 'cover',
                marginRight: '15px',
                border: `2px solid ${darkMode ? '#555' : '#ddd'}`
              }}
            />
            <div>
              <h1 style={{
                ...titleStyle,
                margin: '0 0 5px 0',
                fontSize: '24px'
              }}>
                🎵 {nickname}님의 녹음 목록
              </h1>
              {userGrade && (
                <div style={{
                  color: darkMode ? '#bb86fc' : '#7e57c2',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}>
                  {gradeEmoji} {userGrade}
                </div>
              )}
            </div>
          </div>
          
          <div style={{
            backgroundColor: darkMode ? '#333' : '#f8f4ff',
            padding: '10px 20px',
            borderRadius: '20px',
            color: darkMode ? '#bb86fc' : '#7e57c2',
            fontWeight: 'bold',
            fontSize: '16px'
          }}>
            총 {recordings.length}개
          </div>
        </div>

        {/* 녹음 목록 */}
        {recordings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {recordings.map((recording) => (
              <div
                key={recording.id}
                style={{
                  backgroundColor: darkMode ? '#333' : '#f9f9f9',
                  borderRadius: '12px',
                  padding: '25px',
                  border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`,
                  boxShadow: `0 2px 8px ${darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'}`,
                  transition: 'transform 0.2s ease',
                  ':hover': {
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '20px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    backgroundColor: darkMode ? '#7e57c2' : '#bb86fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    flexShrink: 0,
                    boxShadow: `0 4px 15px ${darkMode ? 'rgba(126, 87, 194, 0.4)' : 'rgba(126, 87, 194, 0.3)'}`
                  }}>
                    🎵
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      margin: '0 0 10px 0',
                      color: darkMode ? '#e0e0e0' : '#333',
                      fontSize: '20px',
                      fontWeight: 'bold'
                    }}>
                      {recording.title}
                    </h3>

                    {recording.description && (
                      <p style={{
                        margin: '0 0 15px 0',
                        color: darkMode ? '#ccc' : '#666',
                        fontSize: '15px',
                        lineHeight: '1.6'
                      }}>
                        {recording.description}
                      </p>
                    )}

                    <div style={{
                      display: 'flex',
                      gap: '20px',
                      fontSize: '13px',
                      color: darkMode ? '#aaa' : '#888'
                    }}>
                      <span>📅 {formatDate(recording.createdAt)}</span>
                      <span>📁 {recording.fileName}</span>
                      <span>📏 {(recording.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                      {recording.commentCount > 0 && (
                        <span>💬 {recording.commentCount}개 댓글</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 오디오 플레이어 */}
                <div style={{
                  backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5',
                  padding: '20px',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
                }}>
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

                {/* 액션 버튼들 */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  <a
                    href={recording.downloadURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: darkMode ? '#7e57c2' : '#7e57c2',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    ▶️ 새 탭에서 재생
                  </a>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(recording.downloadURL);
                      alert('링크가 클립보드에 복사되었습니다!');
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: darkMode ? '#555' : '#e0e0e0',
                      color: darkMode ? '#e0e0e0' : '#333',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    🔗 링크 복사
                  </button>

                  <button
                    onClick={() => navigate(`/recording-comments/${recording.id}`)}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: darkMode ? '#4a90e2' : '#2196f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    💬 댓글 ({recording.commentCount || 0})
                  </button>

                  <div style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    gap: '15px',
                    alignItems: 'center',
                    fontSize: '14px',
                    color: darkMode ? '#aaa' : '#666'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      ❤️ {recording.likes || 0}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      📥 {recording.downloads || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            color: darkMode ? '#aaa' : '#666'
          }}>
            <div style={{ fontSize: '80px', marginBottom: '20px' }}>🎤</div>
            <h3 style={{
              margin: '0 0 15px 0',
              color: darkMode ? '#ccc' : '#555',
              fontSize: '24px'
            }}>
              아직 업로드된 녹음이 없습니다
            </h3>
            <p style={{ 
              fontSize: '16px', 
              marginBottom: '30px',
              lineHeight: '1.5'
            }}>
              {nickname}님이 아직 녹음을 업로드하지 않았습니다.<br />
              나중에 다시 확인해보세요!
            </p>
            <button
              onClick={() => navigate(`/userpage/${nickname}`)}
              style={{
                padding: '12px 24px',
                backgroundColor: darkMode ? '#7e57c2' : '#7e57c2',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              프로필로 돌아가기
            </button>
          </div>
        )}
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

export default UserRecordings; 