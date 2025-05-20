import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import DEFAULT_AVATAR from "../assets/default-avatar.png"; // 기본 프로필 이미지 경로
import {
  containerStyle,
  darkContainerStyle,
  titleStyle,
  purpleBtn
} from "../components/style";

function MyPage({ 
  darkMode, 
  globalProfilePics, 
  globalIntroductions, 
  globalGrades,
  userStats = {} // 기본값 추가
}) {
  const navigate = useNavigate();
  const [nick, setNick] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // 컴포넌트 마운트 시 로그인 체크
  useEffect(() => {
    const storedNickname = localStorage.getItem("nickname");
    if (storedNickname) {
      setNick(storedNickname);
      setIsLoggedIn(true);
    } else {
      // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
      navigate("/login", { state: { from: "/mypage", message: "마이페이지는 로그인 후 이용 가능합니다." } });
    }
  }, [navigate]);

  // ✅ 이모지 → 등급명 매핑
  const gradeNames = {
    "🍒": "체리",
    "🫐": "블루베리",
    "🥝": "키위",
    "🍎": "사과",
    "🍈": "멜론",
    "🍉": "수박",
    "🌏": "지구",
    "🪐": "토성",
    "🌞": "태양",
    "🌌": "은하",
  };

  const gradeEmoji = globalGrades[nick];
  const gradeName = gradeNames[gradeEmoji];
  
  // 기본 유저 통계
  const { postCount = 0, commentCount = 0, likesReceived = 0, visitorCount = 0 } = userStats[nick] || {};
  
  // 회원 탈퇴 확인 핸들러
  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };
  
  // 회원 탈퇴 취소 핸들러
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };
  
  // 회원 탈퇴 확정 핸들러
  const handleConfirmDelete = () => {
    // 실제 회원 탈퇴 로직은 해당 페이지에서 처리
    navigate("/delete-account");
  };
  
  // 탭 데이터
  const tabs = [
    { icon: "👤", label: "프로필 관리", color: "#7e57c2" },
    { icon: "🔒", label: "계정 설정", color: "#5e35b1" },
    { icon: "📊", label: "활동 내역", color: "#3949ab" },
  ];
  
  // 현재 선택된 탭
  const [selectedTab, setSelectedTab] = useState(0);
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    transition: "all 0.3s ease"
  };
  
  // 통계 카드 스타일
  const statCardStyle = {
    padding: "15px",
    borderRadius: "8px",
    textAlign: "center",
    backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
    transition: "transform 0.2s ease",
    cursor: "pointer",
    "&:hover": {
      transform: "translateY(-5px)"
    }
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    marginTop: 20
  };
  
  // 로딩 중이거나 로그인하지 않은 경우
  if (!isLoggedIn) {
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
          <p>로그인 정보를 확인하는 중...</p>
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

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        maxWidth: "900px", 
        margin: "0 auto" 
      }}>
        {/* 프로필 헤더 */}
        <div style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "30px",
          position: "relative",
          marginBottom: "30px",
          background: darkMode ? 
            "linear-gradient(135deg, #2a1b3d 0%, #3a2a5a 100%)" : 
            "linear-gradient(135deg, #f3e7ff 0%, #e8daff 100%)"
        }}>
          <img
            src={globalProfilePics[nick] || DEFAULT_AVATAR}
            alt="프로필"
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: "50%",
              border: `3px solid ${darkMode ? "#7e57c2" : "#7e57c2"}`,
              boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
              marginBottom: "15px"
            }}
          />
          
          <h1 style={{
            ...titleStyle,
            marginBottom: "5px",
            fontSize: "28px",
            color: darkMode ? "#e0e0e0" : "#333"
          }}>
            {nick}님의 마이페이지
          </h1>
          
          <div style={{
            display: "inline-block",
            padding: "4px 12px",
            backgroundColor: darkMode ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)",
            borderRadius: "20px",
            color: darkMode ? "#d4c2ff" : "#7e57c2",
            marginBottom: "15px",
            fontSize: "14px",
            fontWeight: "bold"
          }}>
            {gradeEmoji ? `${gradeName} ${gradeEmoji}` : "등급 미설정"}
          </div>
          
          <p style={{
            margin: "5px 0 15px",
            color: darkMode ? "#bbb" : "#666",
            maxWidth: "600px",
            lineHeight: "1.5"
          }}>
            {globalIntroductions[nick] || "작성된 자기소개가 없습니다. '자기소개 수정' 버튼을 눌러 자기소개를 작성해보세요!"}
          </p>
          
          {/* 통계 요약 */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            marginTop: "10px",
            flexWrap: "wrap"
          }}>
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{postCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>게시물</div>
            </div>
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{commentCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>댓글</div>
            </div>
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{likesReceived}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>받은 좋아요</div>
            </div>
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{visitorCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>방문자</div>
            </div>
          </div>
          
          {/* 빠른 액션 버튼 */}
          <div style={{
            display: "flex",
            gap: "10px",
            marginTop: "20px",
            flexWrap: "wrap",
            justifyContent: "center"
          }}>
            <button 
              onClick={() => navigate("/edit-profilepic")} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              📷 프로필 변경
            </button>
            <button 
              onClick={() => navigate(`/guestbook/${nick}`)} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              📖 방명록
            </button>
            <button 
              onClick={() => navigate("/edit-introduction")} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              ✏️ 소개 수정
            </button>
          </div>
        </div>
        
        {/* 탭 네비게이션 */}
        <div style={{
          display: "flex",
          marginBottom: "20px",
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: darkMode ? "#333" : "#f0f0f0"
        }}>
          {tabs.map((tab, index) => (
            <button
              key={index}
              onClick={() => setSelectedTab(index)}
              style={{
                flex: 1,
                padding: "12px",
                border: "none",
                backgroundColor: selectedTab === index 
                  ? (darkMode ? tab.color : tab.color) 
                  : (darkMode ? "#333" : "#f0f0f0"),
                color: selectedTab === index ? "#fff" : (darkMode ? "#ccc" : "#666"),
                cursor: "pointer",
                transition: "all 0.3s ease",
                fontSize: "15px",
                fontWeight: selectedTab === index ? "bold" : "normal"
              }}
            >
              <span style={{ marginRight: "8px" }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* 탭 콘텐츠 */}
        <div style={{ minHeight: "300px" }}>
          {/* 프로필 관리 탭 */}
          {selectedTab === 0 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  프로필 정보 관리
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/edit-profilepic")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📷
                    </span>
                    프로필사진 변경
                  </button>
                  <button onClick={() => navigate("/edit-introduction")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ✏️
                    </span>
                    자기소개 수정
                  </button>
                  <button onClick={() => navigate("/edit-grade")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🏆
                    </span>
                    등급 수정
                  </button>
                  <button onClick={() => navigate(`/guestbook/${nick}`)} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📖
                    </span>
                    내 방명록
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* 계정 설정 탭 */}
          {selectedTab === 1 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  계정 설정
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/edit-nickname")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      👤
                    </span>
                    닉네임 변경
                  </button>
                  <button onClick={() => navigate("/edit-password")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔒
                    </span>
                    비밀번호 변경
                  </button>
                  <button onClick={() => navigate("/notification")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔔
                    </span>
                    알림 설정
                  </button>
                  <button onClick={handleDeleteAccount} style={{
                    ...purpleBtn,
                    background: darkMode ? "#d32f2f" : "#f44336",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(244, 67, 54, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ⚠️
                    </span>
                    회원 탈퇴
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* 활동 내역 탭 */}
          {selectedTab === 2 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "15px",
                marginBottom: "25px"
              }}>
                <div style={statCardStyle}>
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>📝</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {postCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    작성한 게시물
                  </div>
                </div>
                
                <div style={statCardStyle}>
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>💬</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {commentCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    작성한 댓글
                  </div>
                </div>
                
                <div style={statCardStyle}>
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>❤️</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {likesReceived}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    받은 좋아요
                  </div>
                </div>
                
                <div style={statCardStyle}>
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>👥</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {visitorCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    방명록 방문자
                  </div>
                </div>
              </div>
              
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  내 활동
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/my-posts")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📝
                    </span>
                    내가 쓴 글
                  </button>
                  <button onClick={() => navigate("/my-comments")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      💬
                    </span>
                    내가 쓴 댓글
                  </button>
                  <button onClick={() => navigate("/my-likes")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ❤️
                    </span>
                    좋아요한 글
                  </button>
                  <button onClick={() => navigate("/popular")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔥
                    </span>
                    인기글
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* 회원 탈퇴 확인 모달 */}
        {showDeleteConfirm && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000
          }}>
            <div style={{
              width: "90%",
              maxWidth: "400px",
              backgroundColor: darkMode ? "#333" : "#fff",
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
            }}>
              <h3 style={{ 
                color: "#f44336", 
                margin: "0 0 15px 0" 
              }}>
                ⚠️ 회원 탈퇴 확인
              </h3>
                            <p style={{ 
                marginBottom: "20px",
                lineHeight: "1.5",
                color: darkMode ? "#e0e0e0" : "#333"
              }}>
                정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴하시면 모든 개인정보와 작성한 게시물, 댓글 등이 삭제될 수 있으며 이 작업은 되돌릴 수 없습니다.
              </p>
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px"
              }}>
                <button 
                  onClick={handleCancelDelete}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: darkMode ? "#555" : "#e0e0e0",
                    color: darkMode ? "#fff" : "#333",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  취소
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 애니메이션 스타일 */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

MyPage.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalIntroductions: PropTypes.object,
  globalGrades: PropTypes.object,
  userStats: PropTypes.object
};

MyPage.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalIntroductions: {},
  globalGrades: {},
  userStats: {}
};

export default MyPage;
