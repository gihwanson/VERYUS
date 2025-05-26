import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { storage, db, auth } from '../firebase';

function UploadRecording({ darkMode }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [category, setCategory] = useState('');
  const [allowFeedback, setAllowFeedback] = useState(false);
  const [categoryInfo, setCategoryInfo] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  
  const currentUser = localStorage.getItem("nickname");
  
  // URL 경로에 따라 업로드 목적지 결정
  const isFromMyPage = location.state?.from === "mypage" || 
                      location.pathname.includes("mypage") || 
                      location.search.includes("from=mypage");
  
  // 실제 업로드 목적지 결정 - 마이페이지에서 온 경우에만 마이페이지에 저장
  const uploadDestination = isFromMyPage ? "mypage" : "board";
  
  // 카테고리 선택 시 안내문구 업데이트
  const handleCategoryChange = (selectedCategory) => {
    setCategory(selectedCategory);
    
    if (selectedCategory === 'work') {
      setCategoryInfo('마스터링까지 완료된 작업물, 또는 연습이 끝난 최종 결과물만 올려주세요.\n긴 여정 끝에 완성된 작품, 정말 수고 많으셨습니다. 👏');
    } else if (selectedCategory === 'confidence') {
      setCategoryInfo('이 카테고리는 피드백 없이, 자존감을 높여주는 \'칭찬 전용 공간\'입니다.\n마음껏 자랑해주세요. 여러분의 노력과 열정을 응원합니다! 🌟');
    } else {
      setCategoryInfo('');
    }
  };

  // 카테고리 옵션
  const categoryOptions = [
    { value: 'feedback', label: '피드백 요청 🎯' },
    { value: 'work', label: '작업물 공유 🎨' },
    { value: 'confidence', label: '자존감 지킴이 💝' }
  ];

  // Firebase Auth 상태 확인 및 익명 로그인
  const ensureAuthenticated = async () => {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        if (user) {
          console.log("Firebase Auth 사용자 인증됨:", user.uid);
          resolve(user);
        } else {
          try {
            console.log("Firebase Auth 익명 로그인 시도...");
            const result = await signInAnonymously(auth);
            console.log("Firebase Auth 익명 로그인 성공:", result.user.uid);
            resolve(result.user);
          } catch (error) {
            console.error("Firebase Auth 익명 로그인 실패:", error);
            reject(error);
          }
        }
      });
    });
  };

  // Firebase Auth 인증 없이 업로드 진행 (storage.rules 수정 필요)
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      // 오디오 파일인지 확인
      if (!selectedFile.type.startsWith('audio/')) {
        alert('오디오 파일만 업로드 가능합니다.');
        return;
      }
      
      // 파일 크기 제한 (50MB)
      if (selectedFile.size > 50 * 1024 * 1024) {
        alert('파일 크기는 50MB를 초과할 수 없습니다.');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      alert('파일과 제목을 모두 입력해주세요.');
      return;
    }

    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      console.log("업로드 시작 - Current User:", currentUser);
      console.log("업로드 목적지:", uploadDestination);
      
      // 파일명 생성 (중복 방지) - 안전한 파일명 생성
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop().toLowerCase();
      // 한글 파일명을 안전한 형태로 변환
      const safeUserName = currentUser.replace(/[^a-zA-Z0-9가-힣]/g, '_');
      const safeFileName = `${safeUserName}_${timestamp}_recording.${fileExtension}`;
      const fileName = `recordings/${safeFileName}`;
      const storageRef = ref(storage, fileName);

      console.log("업로드 경로:", fileName);

      // 파일 업로드 (업로드 진행률 추적)
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(Math.round(progress));
          },
          (error) => {
            console.error('업로드 오류:', error);
            reject(error);
          },
          async () => {
            console.log("업로드 완료:", uploadTask.snapshot.metadata.name);
            
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              console.log("다운로드 URL 획득:", downloadURL);
              
              // 업로드 목적지에 따라 다른 컬렉션에 저장
              const collectionName = uploadDestination === "mypage" ? 'mypage_recordings' : 'recordings';
              
              const docData = {
                title: title.trim(),
                content: description.trim(),
                description: description.trim(),
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                recordingURL: downloadURL,
                downloadURL: downloadURL,
                nickname: currentUser,
                uploaderNickname: currentUser,
                createdAt: Timestamp.now(),
                likes: 0,
                downloads: 0,
                commentCount: 0,
                viewCount: 0,
                isPrivate: !isPublic,
                category: category,
                allowFeedback: category === 'feedback' ? allowFeedback : false,
                categoryInfo: categoryInfo
              };
              
              await addDoc(collection(db, collectionName), docData);
              
              alert('녹음 파일이 성공적으로 업로드되었습니다!');
              
              // 업로드 목적지에 따라 다른 페이지로 리디렉션
              if (uploadDestination === "mypage") {
                navigate('/mypage');
              } else if (uploadDestination === "board") {
                navigate('/recordings');
              }
              
              resolve();
            } catch (firestoreError) {
              console.error('Firestore 저장 오류:', firestoreError);
              reject(firestoreError);
            }
          }
        );
      });
      
    } catch (error) {
      console.error('업로드 오류:', error);
      
      // 더 자세한 에러 메시지 제공
      let errorMessage = '업로드 중 오류가 발생했습니다.';
      if (error.code === 'storage/unauthorized') {
        errorMessage = '업로드 권한이 없습니다. 관리자에게 문의하세요.';
      } else if (error.code === 'storage/canceled') {
        errorMessage = '업로드가 취소되었습니다.';
      } else if (error.code === 'storage/quota-exceeded') {
        errorMessage = '스토리지 용량이 부족합니다.';
      } else if (error.message) {
        errorMessage += ` (${error.message})`;
      }
      
      alert(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const containerStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "12px",
    padding: "30px",
    margin: "20px auto",
    maxWidth: "600px",
    boxShadow: `0 4px 12px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };

  const titleStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "30px",
    textAlign: "center"
  };

  const inputStyle = {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    backgroundColor: darkMode ? "#3d3d3d" : "#fff",
    color: darkMode ? "#fff" : "#333",
    fontSize: "14px",
    marginBottom: "20px",
    boxSizing: "border-box"
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "100px",
    resize: "vertical",
    fontFamily: "inherit"
  };

  const fileInputStyle = {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: `2px dashed ${darkMode ? "#555" : "#ddd"}`,
    backgroundColor: darkMode ? "#333" : "#f9f9f9",
    color: darkMode ? "#ccc" : "#666",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.3s ease",
    marginBottom: "20px"
  };

  const buttonStyle = {
    padding: "12px 24px",
    backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
    color: darkMode ? "#000" : "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: "10px",
    transition: "background-color 0.3s ease",
    opacity: isUploading ? 0.7 : 1
  };

  const cancelButtonStyle = {
    ...buttonStyle,
    backgroundColor: darkMode ? "#555" : "#e0e0e0",
    color: darkMode ? "#e0e0e0" : "#333"
  };

  const progressBarStyle = {
    width: "100%",
    height: "8px",
    backgroundColor: darkMode ? "#555" : "#e0e0e0",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "20px"
  };

  const progressFillStyle = {
    height: "100%",
    backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
    width: `${uploadProgress}%`,
    transition: "width 0.3s ease"
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>🎵 녹음 파일 업로드</h2>
      
      <div>
        <label style={{ 
          display: "block", 
          marginBottom: "8px", 
          color: darkMode ? "#e0e0e0" : "#333",
          fontWeight: "500"
        }}>
          제목 *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
          placeholder="녹음 파일의 제목을 입력하세요"
          disabled={isUploading}
          maxLength={100}
        />
      </div>

      <div>
        <label style={{ 
          display: "block", 
          marginBottom: "8px", 
          color: darkMode ? "#e0e0e0" : "#333",
          fontWeight: "500"
        }}>
          설명
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={textareaStyle}
          placeholder="녹음 파일에 대한 설명을 입력하세요 (선택사항)"
          disabled={isUploading}
          maxLength={500}
        />
      </div>

      <div>
        <label style={{ 
          display: "block", 
          marginBottom: "8px", 
          color: darkMode ? "#e0e0e0" : "#333",
          fontWeight: "500"
        }}>
          오디오 파일 *
        </label>
        <div 
          style={fileInputStyle}
          onClick={() => document.getElementById('file-input').click()}
        >
          {file ? (
            <div>
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>✅ 선택된 파일:</p>
              <p style={{ margin: "0", fontSize: "14px" }}>{file.name}</p>
              <p style={{ margin: "8px 0 0 0", fontSize: "12px", opacity: 0.7 }}>
                크기: {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <p style={{ margin: "0 0 8px 0" }}>📁 오디오 파일을 선택하세요</p>
              <p style={{ margin: "0", fontSize: "12px", opacity: 0.7 }}>
                지원 형식: MP3, WAV, M4A, AAC 등 (최대 50MB)
              </p>
            </div>
          )}
        </div>
        <input
          id="file-input"
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
          disabled={isUploading}
        />
      </div>

      {isUploading && (
        <div>
          <div style={progressBarStyle}>
            <div style={progressFillStyle}></div>
          </div>
          <p style={{ 
            textAlign: "center", 
            color: darkMode ? "#bb86fc" : "#7e57c2",
            fontSize: "14px",
            margin: "0 0 20px 0"
          }}>
            업로드 중... {uploadProgress}%
          </p>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: "30px" }}>
        <button
          onClick={handleUpload}
          style={buttonStyle}
          disabled={isUploading || !file || !title.trim()}
        >
          {isUploading ? "업로드 중..." : "업로드"}
        </button>
        <button
          onClick={() => {
            if (uploadDestination === "mypage") {
              navigate('/mypage');
            } else {
              navigate('/recordings');
            }
          }}
          style={cancelButtonStyle}
          disabled={isUploading}
        >
          취소
        </button>
      </div>

      <div style={{ 
        marginTop: "30px", 
        padding: "15px", 
        backgroundColor: darkMode ? "#333" : "#f5f0ff",
        borderRadius: "8px",
        fontSize: "13px",
        color: darkMode ? "#ccc" : "#666"
      }}>
        <h4 style={{ margin: "0 0 8px 0", color: darkMode ? "#bb86fc" : "#7e57c2" }}>
          📝 업로드 안내
        </h4>
        <ul style={{ margin: "0", paddingLeft: "20px" }}>
          <li>오디오 파일만 업로드 가능합니다 (MP3, WAV, M4A, AAC 등)</li>
          <li>파일 크기는 최대 50MB까지 가능합니다</li>
          <li>업로드된 파일은 마이페이지에서 관리할 수 있습니다</li>
          <li>부적절한 내용의 파일은 삭제될 수 있습니다</li>
        </ul>
      </div>
    </div>
  );
}

export default UploadRecording; 