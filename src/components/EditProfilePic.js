import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { db, storage } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn
} from "../components/style";



function EditProfilePic({ darkMode, globalProfilePics }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [currentProfilePic, setCurrentProfilePic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [oldStoragePath, setOldStoragePath] = useState(null);
  
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const nick = localStorage.getItem("nickname");
  
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  
  // 현재 프로필 사진 및 사용자 정보 가져오기
  useEffect(() => {
    const fetchUserData = async () => {
      if (!nick) {
        navigate("/login", { state: { from: "/edit-profilepic" } });
        return;
      }
      
      try {
        setLoading(true);
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError("사용자 정보를 찾을 수 없습니다.");
          setLoading(false);
          return;
        }
        
        const userData = snapshot.docs[0].data();
        const userDocId = snapshot.docs[0].id;
        
        setUserId(userDocId);
        
        // 기존 프로필 사진이 있으면 설정
        if (userData.profilePicUrl) {
          setCurrentProfilePic(userData.profilePicUrl);
          
          // Storage 경로 추출 (옵션)
          if (userData.profilePicUrl.includes("firebase") && userData.profilePicUrl.includes("profiles")) {
            const pathMatch = userData.profilePicUrl.match(/profiles\/[^?]+/);
            if (pathMatch) {
              setOldStoragePath(pathMatch[0]);
            }
          }
        } else if (globalProfilePics && globalProfilePics[nick]) {
          setCurrentProfilePic(globalProfilePics[nick]);
        }
      } catch (err) {
        console.error("사용자 정보 불러오기 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
      }
      
      setLoading(false);
    };
    
    fetchUserData();
  }, [nick, navigate, globalProfilePics]);
  
  // 파일 선택 핸들러
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    // 파일 유효성 검사
    if (selectedFile) {
      // 파일 크기 검사
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError("파일 크기는 5MB 이하여야 합니다.");
        setFile(null);
        setPreview(null);
        // 파일 input 초기화
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      
      // 파일 타입 검사
      if (!selectedFile.type.startsWith("image/")) {
        setError("이미지 파일만 업로드 가능합니다.");
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selectedFile);
    } else {
      setFile(null);
      setPreview(null);
    }
  };
  
const saveProfilePicture = async () => {
  if (!file) {
    setError("이미지를 선택해주세요.");
    return;
  }

  if (!userId) {
    setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
    return;
  }

  try {
    setLoading(true);
    setError(null);

    // 🔁 파일을 Firebase Storage에 업로드
    const storageRef = ref(storage, `profiles/${uuidv4()}_${file.name}`);
    await uploadBytes(storageRef, file);

    // 🔁 다운로드 URL 받아오기
    const downloadURL = await getDownloadURL(storageRef);

    // 🔁 기존 프로필 이미지 삭제 (옵션)
    if (oldStoragePath) {
      const oldRef = ref(storage, oldStoragePath);
      await deleteObject(oldRef).catch(() => {});
    }

    // 🔁 Firestore 업데이트
    await updateDoc(doc(db, "users", userId), {
      profilePicUrl: downloadURL,
      updatedAt: new Date()
    });

    // 로컬 스토리지에 새 프로필 이미지 URL 저장 (임시)
    localStorage.setItem(`profilePic_${nick}`, downloadURL);

    alert("프로필 사진이 성공적으로 변경되었습니다.");
    
    // 페이지를 새로고침하여 변경된 프로필을 반영
    window.location.href = "/mypage";

  } catch (err) {
    console.error("프로필 사진 변경 오류:", err);
    setError("프로필 사진 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
    setLoading(false);
  }
};

  
  // 파일 선택 취소
  const cancelFileSelection = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // 프로필 편집 취소
  const cancelEdit = () => {
    navigate("/mypage");
  };
  
  // 기본 프로필 이미지 경로
  const DEFAULT_PROFILE = "/path/to/default-avatar.png"; // 기본 이미지 경로를 적절히 변경해주세요
  
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>프로필 사진 변경</h1>
      
      {/* 에러 메시지 */}
      {error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "#ffebee",
          color: "#f44336", 
          borderRadius: "4px", 
          marginBottom: "20px",
          fontSize: "14px"
        }}>
          {error}
        </div>
      )}
      
      {/* 현재/새 프로필 사진 비교 */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        gap: "40px",
        marginBottom: "30px",
        flexWrap: "wrap"
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}>
          <div style={{ 
            width: "150px", 
            height: "150px", 
            borderRadius: "50%", 
            overflow: "hidden",
            border: `3px solid ${darkMode ? "#513989" : "#b49ddb"}`,
            boxShadow: `0 3px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
            marginBottom: "10px",
            backgroundColor: darkMode ? "#333" : "#f0f0f0"
          }}>
            <img 
              src={currentProfilePic || DEFAULT_PROFILE} 
              alt="현재 프로필" 
              style={{
                width: "100%", 
                height: "100%", 
                objectFit: "cover"
              }} 
            />
          </div>
          <span style={{ 
            color: darkMode ? "#bbb" : "#666",
            fontSize: "14px"
          }}>
            현재 프로필
          </span>
        </div>
        
        <div style={{ 
          fontSize: "24px", 
          color: darkMode ? "#666" : "#999" 
        }}>
          →
        </div>
        
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}>
          <div style={{ 
            width: "150px", 
            height: "150px", 
            borderRadius: "50%", 
            overflow: "hidden",
            border: `3px solid ${darkMode ? "#7e57c2" : "#7e57c2"}`,
            boxShadow: `0 3px 8px rgba(126, 87, 194, ${darkMode ? 0.4 : 0.2})`,
            marginBottom: "10px",
            backgroundColor: darkMode ? "#333" : "#f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            {preview ? (
              <img 
                src={preview} 
                alt="새 프로필 미리보기" 
                style={{
                  width: "100%", 
                  height: "100%", 
                  objectFit: "cover"
                }} 
              />
            ) : (
              <div style={{ 
                textAlign: "center", 
                color: darkMode ? "#666" : "#999",
                padding: "0 10px",
                fontSize: "14px"
              }}>
                새 프로필 이미지를<br />선택해주세요
              </div>
            )}
          </div>
          <span style={{ 
            color: darkMode ? "#d4c2ff" : "#7e57c2",
            fontSize: "14px"
          }}>
            {preview ? "새 프로필" : "미선택"}
          </span>
        </div>
      </div>
      
      {/* 파일 선택 UI */}
      <div style={{
        backgroundColor: darkMode ? "#333" : "#f5f5f5",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        border: `1px solid ${darkMode ? "#444" : "#ddd"}`
      }}>
        <div style={{ 
          marginBottom: "15px",
          fontSize: "16px",
          color: darkMode ? "#d4c2ff" : "#7e57c2",
          fontWeight: "bold"
        }}>
          새 프로필 이미지 선택
        </div>
        
        <div style={{ marginBottom: "15px" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
            id="profile-pic-input"
            disabled={loading}
          />
          <label 
            htmlFor="profile-pic-input"
            style={{
              display: "inline-block",
              padding: "10px 15px",
              backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
              color: darkMode ? "#d4c2ff" : "#7e57c2",
              border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              transition: "background-color 0.2s"
            }}
          >
            파일 선택
          </label>


          
          {file && (
            <span style={{ 
              marginLeft: "10px", 
              fontSize: "14px",
              color: darkMode ? "#bbb" : "#666"
            }}>
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>
        
        <div style={{ 
          fontSize: "13px", 
          color: darkMode ? "#999" : "#777",
          marginBottom: "10px"
        }}>
          <div>• 최대 파일 크기: 5MB</div>
          <div>• 지원 형식: JPG, PNG, GIF 등</div>
          <div>• 권장 비율: 정사각형 (1:1)</div>
        </div>
        
        {file && (
          <button 
            onClick={cancelFileSelection}
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: darkMode ? "#bbb" : "#666",
              cursor: "pointer",
              fontSize: "14px",
              textDecoration: "underline"
            }}
          >
            파일 선택 취소
          </button>
        )}
      </div>
      
      {/* 버튼 영역 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center",
        gap: "10px"
      }}>
        <button 
          onClick={cancelEdit}
          style={{
            padding: "10px 20px",
            backgroundColor: darkMode ? "#555" : "#e0e0e0",
            color: darkMode ? "#fff" : "#333",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px"
          }}
          disabled={loading}
        >
          취소
        </button>
        
        <button 
          onClick={saveProfilePicture}
          style={{
            ...purpleBtn,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.7 : 1
          }}
          disabled={!file || loading}
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
                marginRight: "10px"
              }}></span>
              저장 중...
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </>
          ) : "저장"}
        </button>
      </div>
    </div>
  );
}

EditProfilePic.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object
};

EditProfilePic.defaultProps = {
  darkMode: false,
  globalProfilePics: {}
};

export default EditProfilePic;
