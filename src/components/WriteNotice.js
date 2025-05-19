import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, serverTimestamp, updateDoc, doc, getDoc,
  query, where, orderBy, getDocs
} from "firebase/firestore";
import { db, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function WriteNotice({ darkMode }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [filePreviewNames, setFilePreviewNames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [characterCount, setCharacterCount] = useState(0);
  const [isPinned, setIsPinned] = useState(false);
  const [category, setCategory] = useState("general"); // 일반, 이벤트, 업데이트, 긴급
  const nav = useNavigate();
  const nick = localStorage.getItem("nickname");
  const role = localStorage.getItem("role");
  
  // 글자 수 제한
  const MAX_TITLE_LENGTH = 100;
  const MAX_CONTENT_LENGTH = 10000;
  
  // 관리자 권한 확인
  useEffect(() => {
    if (!nick) {
      alert("로그인이 필요합니다");
      nav("/login");
      return;
    }
    
    // 관리자 권한 체크
    if (role !== "운영진" && role !== "리더" && nick !== "너래") {
      alert("공지사항 작성은 관리자만 가능합니다");
      nav("/");
    }
  }, [nick, role, nav]);
  
  // 내용 변경 시 글자 수 업데이트
  useEffect(() => {
    setCharacterCount(content.length);
  }, [content]);
  
  // 파일 업로드 처리
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    
    // 최대 5개까지 첨부 가능
    if (attachedFiles.length + files.length > 5) {
      alert("파일은 최대 5개까지 첨부할 수 있습니다");
      return;
    }
    
    // 파일 크기 체크 (각 파일 10MB 이하)
    const oversizedFiles = files.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      alert("파일 크기는 각각 10MB 이하여야 합니다");
      return;
    }
    
    // 파일 목록 업데이트
    const newFiles = [...attachedFiles, ...files];
    setAttachedFiles(newFiles);
    
    // 파일 이름 목록 업데이트
    const newFileNames = [...filePreviewNames];
    files.forEach(file => {
      newFileNames.push({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + " KB" // KB 단위로 표시
      });
    });
    setFilePreviewNames(newFileNames);
  };
  
  // 첨부 파일 제거
  const removeFile = (index) => {
    const newFiles = [...attachedFiles];
    const newFileNames = [...filePreviewNames];
    
    newFiles.splice(index, 1);
    newFileNames.splice(index, 1);
    
    setAttachedFiles(newFiles);
    setFilePreviewNames(newFileNames);
  };
  
  // 파일 업로드 및 URL 획득
  const uploadFiles = async () => {
    if (attachedFiles.length === 0) return [];
    
    const fileUrls = [];
    const fileInfos = [];
    
    for (const file of attachedFiles) {
      const timestamp = new Date().getTime();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileName = `${timestamp}_${randomString}_${file.name}`;
      const filePath = `notices/${fileName}`;
      
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      
      fileUrls.push(downloadUrl);
      fileInfos.push({
        name: file.name,
        url: downloadUrl,
        size: file.size,
        type: file.type,
        uploadedAt: timestamp
      });
    }
    
    return fileInfos;
  };
  
  // 폼 유효성 검사
  const validateForm = () => {
    if (!title.trim()) {
      alert("제목을 입력하세요");
      return false;
    }
    
    if (title.length > MAX_TITLE_LENGTH) {
      alert(`제목은 ${MAX_TITLE_LENGTH}자 이내로 작성해주세요`);
      return false;
    }
    
    if (!content.trim()) {
      alert("내용을 입력하세요");
      return false;
    }
    
    if (content.length > MAX_CONTENT_LENGTH) {
      alert(`내용은 ${MAX_CONTENT_LENGTH}자 이내로 작성해주세요`);
      return false;
    }
    
    if (isPinned && !expiryDate) {
      alert("상단 고정 공지의 경우 만료일을 설정해주세요");
      return false;
    }
    
    return true;
  };
  
  // 공지사항 저장
  const save = async () => {
    if (!validateForm()) return;
    
    try {
      setIsLoading(true);
      
      // 파일 업로드
      const fileInfos = await uploadFiles();
      
      // 현재 날짜 정보
      const now = new Date();
      
      // 만료일 설정 (지정된 경우 해당 날짜, 아니면 30일 후)
      const expiry = expiryDate 
        ? new Date(expiryDate) 
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      // 공지사항 데이터 저장
      const noticeData = {
        nickname: nick,
        title,
        content,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isImportant,
        isPinned,
        pinExpiry: isPinned ? expiry : null,
        category,
        attachments: fileInfos,
        viewCount: 0,
        isVisible: true,
        authorRole: role || "관리자"
      };
      
      const noticeRef = await addDoc(collection(db, "notices"), noticeData);
      
      // 고정 공지인 경우 다른 고정 공지 상태 확인 및 업데이트
      if (isPinned) {
        // 최대 3개까지만 고정 (이전 것 해제)
        const pinnedQuery = query(
          collection(db, "notices"), 
          where("isPinned", "==", true),
          orderBy("createdAt", "asc")
        );
        
        const pinnedSnap = await getDocs(pinnedQuery);
        const pinnedNotices = pinnedSnap.docs.filter(d => d.id !== noticeRef.id);
        
        if (pinnedNotices.length >= 3) {
          // 가장 오래된 고정 공지를 해제
          const oldestPinned = pinnedNotices[0];
          await updateDoc(doc(db, "notices", oldestPinned.id), {
            isPinned: false,
            pinExpiry: null
          });
        }
      }
      
      alert("공지사항이 등록되었습니다");
      nav("/notices");
    } catch (error) {
      console.error("공지사항 저장 오류:", error);
      alert("공지사항 등록 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryLabel = (categoryValue) => {
    const categories = {
      general: "일반",
      event: "이벤트",
      update: "업데이트",
      urgent: "중요"
    };
    return categories[categoryValue] || "일반";
  };
  
  // 게시물 미리보기 스타일 계산
  const getPreviewStyle = () => {
    let style = {
      marginTop: 30,
      padding: 20,
      border: "1px solid #ddd",
      borderRadius: 8,
      background: darkMode ? "#333" : "#f9f9f9"
    };
    
    // 중요 공지인 경우
    if (isImportant) {
      style = {
        ...style,
        borderLeft: "4px solid #f44336",
        background: darkMode ? "#3e2723" : "#ffebee"
      };
    }
    
    // 고정 공지인 경우
    if (isPinned) {
      style = {
        ...style,
        borderTop: "4px solid #7e57c2",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      };
    }
    
    return style;
  };
  
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📢 공지사항 작성</h1>
      
      {/* 공지사항 옵션 */}
      <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <div>
          <label style={{ 
            display: "block", 
            marginBottom: 8, 
            fontSize: 16,
            color: darkMode ? "#fff" : "#333"
          }}>
            카테고리
          </label>
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
              background: darkMode ? "#333" : "#fff",
              color: darkMode ? "#fff" : "#333",
              fontSize: 14
            }}
          >
            <option value="general">일반 공지</option>
            <option value="event">이벤트</option>
            <option value="update">업데이트</option>
            <option value="urgent">중요</option>
          </select>
        </div>
        
        <label style={{ 
          display: "flex", 
          alignItems: "center",
          gap: 8,
          cursor: "pointer"
        }}>
          <input
            type="checkbox"
            checked={isImportant}
            onChange={(e) => setIsImportant(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ color: darkMode ? "#fff" : "#333" }}>
            중요 공지로 표시
          </span>
        </label>
        
        <label style={{ 
          display: "flex", 
          alignItems: "center",
          gap: 8,
          cursor: "pointer"
        }}>
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ color: darkMode ? "#fff" : "#333" }}>
            상단 고정 공지
          </span>
        </label>
      </div>
      
      {/* 고정 공지 만료일 설정 */}
      {isPinned && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ 
            display: "block", 
            marginBottom: 8, 
            fontSize: 16,
            color: darkMode ? "#fff" : "#333"
          }}>
            고정 만료일 설정
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]} // 오늘 이후만 선택 가능
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
              background: darkMode ? "#333" : "#fff",
              color: darkMode ? "#fff" : "#333",
              width: "100%",
              maxWidth: 300
            }}
          />
          <div style={{ 
            marginTop: 4, 
            fontSize: 12, 
            color: darkMode ? "#aaa" : "#666"
          }}>
            * 설정하지 않을 경우 30일 후 자동으로 고정 해제됩니다
          </div>
        </div>
      )}
      
      {/* 제목 입력 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ 
          display: "block", 
          marginBottom: 8, 
          fontSize: 16,
          color: darkMode ? "#fff" : "#333"
        }}>
          제목
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지사항 제목을 입력하세요"
          maxLength={MAX_TITLE_LENGTH}
          style={darkMode ? darkInputStyle : inputStyle}
        />
        <div style={{ 
          textAlign: "right", 
          fontSize: 12, 
          color: title.length > MAX_TITLE_LENGTH * 0.8 
            ? "#f44336" 
            : (darkMode ? "#aaa" : "#777"),
          marginTop: 4
        }}>
          {title.length}/{MAX_TITLE_LENGTH}
        </div>
      </div>
      
      {/* 내용 입력 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ 
          display: "block", 
          marginBottom: 8, 
          fontSize: 16,
          color: darkMode ? "#fff" : "#333"
        }}>
          내용
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="공지사항 내용을 입력하세요"
          style={{
            ...(darkMode ? darkInputStyle : textareaStyle),
            height: 350,
            lineHeight: 1.6
          }}
        />
        <div style={{ 
          textAlign: "right", 
          fontSize: 12, 
          color: characterCount > MAX_CONTENT_LENGTH * 0.8 
            ? "#f44336" 
            : (darkMode ? "#aaa" : "#777"),
          marginTop: 4
        }}>
          {characterCount}/{MAX_CONTENT_LENGTH}
        </div>
      </div>
      
      {/* 파일 첨부 */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ 
          display: "block", 
          marginBottom: 8, 
          fontSize: 16,
          color: darkMode ? "#fff" : "#333"
        }}>
          파일 첨부 (최대 5개, 각 10MB 이하)
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileUpload}
          style={{ 
            display: "block", 
            marginBottom: 10,
            color: darkMode ? "#fff" : "#333"
          }}
          disabled={isLoading || attachedFiles.length >= 5}
        />
        
        {/* 파일 목록 */}
        {filePreviewNames.length > 0 && (
          <div style={{ 
            marginTop: 10,
            padding: 12,
            background: darkMode ? "#333" : "#f5f5f5",
            borderRadius: 6
          }}>
            <h4 style={{ 
              margin: "0 0 10px 0",
              color: darkMode ? "#ddd" : "#333" 
            }}>
              첨부 파일 목록
            </h4>
            <ul style={{ 
              listStyle: "none", 
              padding: 0, 
              margin: 0 
            }}>
              {filePreviewNames.map((file, index) => (
                <li 
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom: `1px solid ${darkMode ? "#444" : "#ddd"}`
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ 
                      marginRight: 8,
                      color: darkMode ? "#ddd" : "#333"
                    }}>
                      📎
                    </span>
                    <div>
                      <div style={{ color: darkMode ? "#ddd" : "#333" }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: darkMode ? "#aaa" : "#777" }}>{file.size}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: darkMode ? "#ff6e6e" : "#f44336",
                      cursor: "pointer",
                      fontSize: 16,
                      fontWeight: "bold"
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* 미리보기 */}
      {title && content && (
        <div style={getPreviewStyle()}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 8, 
            marginBottom: 12 
          }}>
            {isImportant && (
              <span style={{ 
                padding: "4px 8px", 
                background: "#f44336", 
                color: "#fff", 
                borderRadius: 4,
                fontSize: 12,
                fontWeight: "bold"
              }}>
                중요
              </span>
            )}
            <span style={{ 
              padding: "4px 8px", 
              background: category === "event" ? "#2196f3" : 
                         category === "update" ? "#4caf50" : 
                         category === "urgent" ? "#ff9800" : "#9c27b0", 
              color: "#fff", 
              borderRadius: 4,
              fontSize: 12,
              fontWeight: "bold"
            }}>
              {getCategoryLabel(category)}
            </span>
            {isPinned && (
              <span style={{ 
                padding: "4px 8px", 
                background: "#7e57c2", 
                color: "#fff", 
                borderRadius: 4,
                fontSize: 12,
                fontWeight: "bold"
              }}>
                고정
              </span>
            )}
          </div>
          <h2 style={{ 
            margin: "0 0 16px 0", 
            color: darkMode ? "#eee" : "#333"
          }}>
            {title}
          </h2>
          <div style={{
            fontSize: 14,
            color: darkMode ? "#aaa" : "#666",
            marginBottom: 16,
            borderBottom: `1px solid ${darkMode ? "#444" : "#ddd"}`,
            paddingBottom: 8
          }}>
            <div>{role || "관리자"} · {new Date().toLocaleDateString()}</div>
            {isPinned && expiryDate && (
              <div style={{ 
                marginTop: 4, 
                fontSize: 13, 
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                고정 만료일: {new Date(expiryDate).toLocaleDateString()}
              </div>
            )}
          </div>
          <div style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
            color: darkMode ? "#ddd" : "#333",
            fontSize: 15
          }}>
            {content}
          </div>
          {filePreviewNames.length > 0 && (
            <div style={{ 
              marginTop: 24,
              borderTop: `1px solid ${darkMode ? "#444" : "#ddd"}`,
              paddingTop: 16
            }}>
              <h4 style={{ 
                margin: "0 0 10px 0",
                color: darkMode ? "#ddd" : "#333" 
              }}>
                첨부 파일 ({filePreviewNames.length})
              </h4>
              <div style={{ color: darkMode ? "#aaa" : "#666", fontSize: 14 }}>
                {filePreviewNames.map((file, i) => (
                  <div key={i} style={{ marginBottom: 5 }}>
                    📎 {file.name} ({file.size})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 버튼 영역 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        marginTop: 30
      }}>
        <button 
          onClick={() => {
            if (window.confirm("작성을 취소하시겠습니까? 작성 중인 내용은 저장되지 않습니다.")) {
              nav("/notices");
            }
          }}
          style={{
            padding: "12px 16px",
            background: darkMode ? "#555" : "#eee",
            color: darkMode ? "#fff" : "#333",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            width: "48%"
          }}
          disabled={isLoading}
        >
          취소
        </button>
        
        <button 
          onClick={save} 
          style={{
            ...purpleBtn,
            width: "48%"
          }}
          disabled={isLoading}
        >
          {isLoading ? "등록 중..." : "공지사항 등록"}
        </button>
      </div>
    </div>
  );
}

WriteNotice.propTypes = {
  darkMode: PropTypes.bool
};

WriteNotice.defaultProps = {
  darkMode: false
};

export default WriteNotice;
