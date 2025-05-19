// UserPage.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn, DEFAULT_AVATAR
} from "../components/style";
import { FaEdit, FaBookOpen, FaMicrophone, FaHeart, FaShare } from "react-icons/fa";

// gradeEmojis 객체
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

function UserPage({ 
  darkMode, 
  globalProfilePics, 
  globalIntroductions, 
  globalGrades,
  globalUserStats,
  isOwnProfile,
  onFollowUser
}) {
  const { nickname } = useParams();
  const nav = useNavigate();
  const [isFollowing, setIsFollowing] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  
  const grade = globalGrades[nickname] || "";
  const emoji = gradeEmojis[grade] || "";
  const stats = globalUserStats?.[nickname] || { duets: 0, followers: 0, following: 0, recordings: 0 };
  
  useEffect(() => {
    // 여기에 프로필 데이터 로딩 로직을 추가할 수 있습니다
    // 팔로우 여부를 확인하는 로직도 여기에 구현 가능합니다
  }, [nickname]);

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    if (onFollowUser) {
      onFollowUser(nickname, !isFollowing);
    }
  };
  
  const handleShare = () => {
    setShowShareOptions(!showShareOptions);
  };

  const copyProfileLink = () => {
    const profileUrl = `${window.location.origin}/user/${nickname}`;
    navigator.clipboard.writeText(profileUrl);
    alert("프로필 링크가 클립보드에 복사되었습니다!");
    setShowShareOptions(false);
  };
  
  const navigateToRecordings = () => {
    nav(`/recordings/${nickname}`);
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center" 
      }}>
        <h1 style={titleStyle}>{nickname}님의 마이페이지</h1>
        
        {isOwnProfile ? (
          <button
            style={{...purpleBtn, padding: "8px 15px"}}
            onClick={() => nav('/edit-profile')}
          >
            <FaEdit style={{ marginRight: 5 }} /> 수정
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button 
              style={{
                ...purpleBtn,
                backgroundColor: isFollowing ? "#6c757d" : "#8a2be2",
                padding: "8px 15px"
              }}
              onClick={handleFollow}
            >
              <FaHeart style={{ marginRight: 5 }} /> 
              {isFollowing ? "팔로잉" : "팔로우"}
            </button>
            
            <button
              style={{...purpleBtn, padding: "8px 15px"}}
              onClick={handleShare}
            >
              <FaShare />
            </button>
            
            {showShareOptions && (
              <div style={{
                position: "absolute",
                right: 20,
                backgroundColor: darkMode ? "#333" : "white",
                boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                padding: 10,
                borderRadius: 5,
                zIndex: 100
              }}>
                <button onClick={copyProfileLink} style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  margin: "5px 0",
                  backgroundColor: "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  color: darkMode ? "white" : "black"
                }}>
                  프로필 링크 복사
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        marginBottom: 30 
      }}>
        <img
          src={globalProfilePics[nickname] || DEFAULT_AVATAR}
          alt="프로필"
          style={{
            width: 150,
            height: 150,
            objectFit: "cover",
            display: "block",
            margin: "0 auto 20px",
            border: "1px solid #999",
            borderRadius: "50%"
          }}
        />
        
        <div style={{ 
          display: "flex", 
          alignItems: "center",
          marginBottom: 10
        }}>
          <span style={{ 
            fontSize: 18, 
            fontWeight: "bold",
            marginRight: 8
          }}>
            {emoji} {grade || "미입력"}
          </span>
        </div>
      </div>
      
      <div style={{
        backgroundColor: darkMode ? "#2a2a2a" : "#f5f5f5",
        borderRadius: 10,
        padding: 15,
        marginBottom: 20
      }}>
        <h3 style={{ marginTop: 0 }}>자기소개</h3>
        <p style={{ 
          whiteSpace: "pre-wrap", 
          margin: 0,
          color: darkMode ? "#e0e0e0" : "#333"
        }}>
          {globalIntroductions[nickname] || "작성된 자기소개가 없습니다."}
        </p>
      </div>
      
      <div style={{
        display: "flex",
        justifyContent: "space-around",
        marginBottom: 30,
        backgroundColor: darkMode ? "#2a2a2a" : "#f5f5f5",
        borderRadius: 10,
        padding: "15px 10px"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold" }}>{stats.duets}</div>
          <div>듀엣</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold" }}>{stats.recordings}</div>
          <div>녹음</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold" }}>{stats.followers}</div>
          <div>팔로워</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold" }}>{stats.following}</div>
          <div>팔로잉</div>
        </div>
      </div>

      <div style={{ 
        display: "flex", 
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 15,
        marginTop: 20
      }}>
        <button
          style={{...purpleBtn, flex: "1 1 45%", minWidth: "140px"}}
          onClick={() => nav(`/guestbook/${nickname}`)}
        >
          <FaBookOpen style={{ marginRight: 5 }} /> 방명록 보기
        </button>
        
        <button
          style={{...purpleBtn, flex: "1 1 45%", minWidth: "140px"}}
          onClick={navigateToRecordings}
        >
          <FaMicrophone style={{ marginRight: 5 }} /> 녹음 목록
        </button>
      </div>
    </div>
  );
}

UserPage.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalIntroductions: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired,
  globalUserStats: PropTypes.object,
  isOwnProfile: PropTypes.bool,
  onFollowUser: PropTypes.func
};

UserPage.defaultProps = {
  darkMode: false,
  globalUserStats: {},
  isOwnProfile: false
};

export default UserPage;
