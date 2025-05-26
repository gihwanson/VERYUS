import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, addDoc, serverTimestamp
} from "firebase/firestore";
import { db, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";

function WritePost({ darkMode }) {
  const { category } = useParams();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [privatePost, setPrivatePost] = useState(false);
  const [partnerDone, setPartnerDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [characterCount, setCharacterCount] = useState(0);
  const [recordingFile, setRecordingFile] = useState(null);
  const [recordingPreview, setRecordingPreview] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [isNotice, setIsNotice] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [wantFeedback, setWantFeedback] = useState(false);
  const nav = useNavigate();
  
  // 중요: 닉네임 가져오기
  const nick = localStorage.getItem("nickname");
  const role = localStorage.getItem("role");
  
  // 글자 수 제한
  const MAX_TITLE_LENGTH = 50;
  const MAX_CONTENT_LENGTH = 5000;
  
  useEffect(() => {
    if (!nick) {
      alert("로그인이 필요합니다");
      nav("/login");
    }
    
    // 카테고리별 기본 서브카테고리 설정
    if (category) {
      switch (category) {
        case "duet":
          setSelectedCategory("cover");
          break;
        case "song":
          setSelectedCategory("recommend");
          break;
        case "advice":
          setSelectedCategory("relationship");
          break;
        case "free":
          setSelectedCategory("general");
          break;
        case "recording":
          setSelectedCategory("cover");
          break;
        default:
          break;
      }
    }
  }, [nick, nav, category]);
  
  // 내용 변경 시 글자 수 계산
  useEffect(() => {
    setCharacterCount(content.length);
  }, [content]);
  
  const getCollectionName = () => {
    switch (category) {
      case "duet": return "posts";
      case "song": return "songs";
      case "advice": return "advice";
      case "free": return "freeposts";
      case "recording": return "recordingPosts";
      case "special-moments": return "special_moments";
      default: return "posts";
    }
  };
  
  const getCategoryInfo = () => {
    switch (category) {
      case "duet":
        return {
          title: "🎤 듀엣/합창 글쓰기",
          categories: [
            { value: "cover", label: "커버곡" },
            { value: "original", label: "창작곡" },
            { value: "collab", label: "협업" },
            { value: "vocal", label: "보컬레슨" }
          ]
        };
      case "song":
        return {
          title: "🎵 노래 추천 글쓰기",
          categories: [
            { value: "recommend", label: "추천곡" },
            { value: "recent", label: "최신곡" },
            { value: "practice", label: "연습곡" },
            { value: "healing", label: "힐링곡" }
          ]
        };
      case "advice":
        return {
          title: "💬 고민 상담 글쓰기",
          categories: [
            { value: "relationship", label: "인간관계" },
            { value: "study", label: "학업" },
            { value: "career", label: "진로/취업" },
            { value: "health", label: "건강" },
            { value: "mental", label: "정신건강" },
            { value: "finance", label: "재정/경제" },
            { value: "etc", label: "기타" }
          ]
        };
      case "free":
        return {
          title: "📝 자유 게시판 글쓰기",
          categories: [
            { value: "general", label: "일반" },
            { value: "question", label: "질문" },
            { value: "humor", label: "유머" },
            { value: "review", label: "후기" },
            { value: "news", label: "소식" }
          ]
        };
      case "recording":
        return {
          title: "🎤 녹음 게시판 글쓰기",
          categories: [
            { value: "cover", label: "커버곡" },
            { value: "original", label: "창작곡" },
            { value: "practice", label: "연습" },
            { value: "duet", label: "듀엣/합창" },
            { value: "solo", label: "솔로" }
          ]
        };
      case "special-moments":
        return {
          title: "✨ 베리어스의 특별한 순간들",
          categories: [
            { value: "event", label: "이벤트" },
            { value: "activity", label: "활동" },
            { value: "memory", label: "추억" },
            { value: "achievement", label: "성과" },
            { value: "celebration", label: "축하" }
          ]
        };
      default:
        return { title: "글쓰기", categories: [] };
    }
  };
  
  // 이미지 파일 처리 함수
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    // 최대 5개까지만 허용
    if (attachedImages.length + files.length > 5) {
      alert("이미지는 최대 5개까지 첨부할 수 있습니다.");
      return;
    }
    
    // 파일 크기 체크 (각 파일 3MB 이하)
    const oversizedFiles = files.filter(file => file.size > 3 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      alert("이미지 크기는 각각 3MB 이하여야 합니다.");
      return;
    }
    
    // 미리보기 및 파일 목록 업데이트
    const newFiles = [...attachedImages, ...files];
    setAttachedImages(newFiles);
    
    // 미리보기 URL 생성
    const newPreviewUrls = [...imagePreviewUrls];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviewUrls.push(reader.result);
        setImagePreviewUrls([...newPreviewUrls]);
      };
      reader.readAsDataURL(file);
    });
  };
  
  // 첨부 이미지 제거
  const removeImage = (index) => {
    const newFiles = [...attachedImages];
    const newPreviewUrls = [...imagePreviewUrls];
    
    newFiles.splice(index, 1);
    newPreviewUrls.splice(index, 1);
    
    setAttachedImages(newFiles);
    setImagePreviewUrls(newPreviewUrls);
  };
  
  // 이미지 업로드 및 URL 획득
  const uploadImages = async () => {
    if (attachedImages.length === 0) return [];
    
    const imageUrls = [];
    for (const image of attachedImages) {
      const timestamp = new Date().getTime();
      const fileExtension = image.name.split('.').pop();
      const fileName = `${timestamp}_${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;
      const filePath = `posts/${getCollectionName()}/${fileName}`;
      
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, image);
      const downloadUrl = await getDownloadURL(storageRef);
      imageUrls.push(downloadUrl);
    }
    
    return imageUrls;
  };
  
  // 녹음 파일 처리 함수
  const handleRecordingUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 오디오 파일 형식 체크
    if (!file.type.startsWith('audio/')) {
      alert('오디오 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 체크 (50MB 이하)
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기는 50MB를 초과할 수 없습니다.');
      return;
    }

    setRecordingFile(file);
    setRecordingPreview(file.name);
  };

  // 녹음 파일 제거
  const removeRecording = () => {
    setRecordingFile(null);
    setRecordingPreview("");
  };

  // 녹음 파일 업로드 및 URL 획득
  const uploadRecording = async () => {
    if (!recordingFile) return null;

    const timestamp = new Date().getTime();
    const fileExtension = recordingFile.name.split('.').pop().toLowerCase();
    const safeFileName = `${nick}_${timestamp}_recording.${fileExtension}`;
    const filePath = `recordings/${safeFileName}`;

    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, recordingFile);
    const downloadUrl = await getDownloadURL(storageRef);
    
    return downloadUrl;
  };
  
  // 영상 압축 함수
  const compressVideo = async (file) => {
    try {
      // 현재는 압축 기능을 비활성화하고 원본 파일을 반환
      return file;
    } catch (error) {
      console.error('영상 압축 중 오류:', error);
      return file;
    }
  };

  // 영상 파일 처리 함수 수정
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('비디오 파일만 업로드 가능합니다.');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      const compressedFile = await compressVideo(file);
      setVideoFile(compressedFile);
      setVideoPreview(compressedFile.name);
    } else {
      setVideoFile(file);
      setVideoPreview(file.name);
    }
  };

  // 영상 파일 제거
  const removeVideo = () => {
    setVideoFile(null);
    setVideoPreview("");
  };

  // 영상 파일 업로드 및 URL 획득
  const uploadVideo = async () => {
    if (!videoFile) return null;

    // Check if user is authenticated
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Authentication failed:', error);
        throw new Error('Authentication failed. Please try again.');
      }
    }

    const timestamp = new Date().getTime();
    const fileExtension = videoFile.name.split('.').pop().toLowerCase();
    const safeFileName = `${nick}_${timestamp}_video.${fileExtension}`;
    const filePath = `videos/${safeFileName}`;

    const storageRef = ref(storage, filePath);

    // 업로드 진행률 추적을 위한 uploadTask 사용
    const uploadTask = uploadBytesResumable(storageRef, videoFile);
    
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('영상 업로드 오류:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadUrl);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  // 폼 유효성 검사
  const validateForm = () => {
    if (!title.trim()) {
      alert("제목을 입력해주세요");
      return false;
    }
    
    if (title.length > MAX_TITLE_LENGTH) {
      alert(`제목은 ${MAX_TITLE_LENGTH}자 이내로 작성해주세요`);
      return false;
    }
    
    if (!content.trim()) {
      alert("내용을 입력해주세요");
      return false;
    }
    
    if (content.length > MAX_CONTENT_LENGTH) {
      alert(`내용은 ${MAX_CONTENT_LENGTH}자 이내로 작성해주세요`);
      return false;
    }
    
    if (!selectedCategory) {
      alert("카테고리를 선택해주세요");
      return false;
    }

    if (category === "recording" && !wantFeedback) {
      alert("피드백 여부를 선택해주세요");
      return false;
    }
    
    return true;
  };
  
  // 내용에서 해시태그 추출
  const extractTags = (text) => {
    const tagRegex = /#[\w가-힣]+/g;
    const foundTags = text.match(tagRegex) || [];
    // # 제거하고 최대 5개까지만 반환
    return foundTags.map(tag => tag.slice(1)).slice(0, 5);
  };
  
  // 게시글 저장
  const save = async () => {
    if (!nick) {
      alert("로그인 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      nav("/login");
      return;
    }
    
    // 특별한 순간들 게시판 권한 체크
    if (category === "special-moments" && role !== "리더" && role !== "운영진") {
      alert("특별한 순간들 게시판은 리더와 운영진만 글을 작성할 수 있습니다.");
      return;
    }
    
    if (!validateForm()) return;
    
    try {
      setIsLoading(true);
      
      // 이미지 업로드
      const imageUrls = await uploadImages();
      
      // 녹음 파일 업로드
      const recordingUrl = await uploadRecording();
      
      // 영상 파일 업로드
      const videoUrl = await uploadVideo();
      
      // 게시글 데이터 저장 (nickname 필드 확실히 추가)
      await addDoc(collection(db, getCollectionName()), {
        nickname: nick,
        title,
        content,
        isPrivate: privatePost,
        partnerDone: category === "duet" ? partnerDone : false,
        createdAt: serverTimestamp(),
        likes: 0,
        reports: 0,
        likedBy: [],
        category: selectedCategory,
        images: imageUrls,
        recordingUrl: recordingUrl,
        videoUrl: videoUrl,
        viewCount: 0,
        commentCount: 0,
        lastUpdated: serverTimestamp(),
        tags: extractTags(content),  // 내용에서 태그 추출
        isNotice: isNotice && (role === "리더" || role === "운영진"),  // 공지사항 여부
        noticeOrder: isNotice && (role === "리더" || role === "운영진") ? Date.now() : null,  // 공지사항 정렬 우선순위
        wantFeedback: category === "recording" ? wantFeedback : null,
        uploaderNickname: nick  // 업로더 닉네임 추가
      });
      
      alert("게시글이 등록되었습니다");
      
      // 카테고리에 맞는 페이지로 이동
      switch (category) {
        case "duet": nav("/duet"); break;
        case "song": nav("/songs"); break;
        case "advice": nav("/advice"); break;
        case "free": nav("/freeboard"); break;
        case "recording": nav("/recordings"); break;
        case "special-moments": nav("/special-moments"); break;
        default: nav("/");
      }
    } catch (error) {
      console.error("게시글 저장 오류:", error);
      alert("게시글 등록 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 카테고리 정보 가져오기
  const categoryInfo = getCategoryInfo();
  
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={{ ...titleStyle, marginBottom: 30 }}>
        {categoryInfo.title}
      </h1>
      
      {/* 서브카테고리 선택 */}
      {categoryInfo.categories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ 
            display: "block", 
            marginBottom: 8, 
            fontSize: 16, 
            fontWeight: "bold",
            color: darkMode ? "#fff" : "#333"
          }}>
            카테고리 선택
          </label>
          <div style={{ 
            display: "flex", 
            flexWrap: "wrap", 
            gap: 10 
          }}>
            {categoryInfo.categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  border: "none",
                  background: selectedCategory === cat.value
                    ? (darkMode ? "#6a1b9a" : "#7e57c2")
                    : (darkMode ? "#555" : "#eee"),
                  color: selectedCategory === cat.value
                    ? "#fff"
                    : (darkMode ? "#ddd" : "#666"),
                  cursor: "pointer",
                  fontWeight: selectedCategory === cat.value ? "bold" : "normal",
                  transition: "all 0.2s ease"
                }}
              >
                {cat.label}
              </button>
            ))}
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
          onChange={e => setTitle(e.target.value)}
          placeholder="제목을 입력하세요"
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
          onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요 (#해시태그 형태로 태그를 추가할 수 있습니다)"
          style={{
            ...(darkMode ? darkInputStyle : textareaStyle),
            height: 300
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
      
      {/* 이미지 첨부 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ 
          display: "block", 
          marginBottom: 8, 
          fontSize: 16,
          color: darkMode ? "#fff" : "#333"
        }}>
          이미지 첨부 (최대 5개, 각 3MB 이하)
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          style={{ 
            display: "block", 
            marginBottom: 10,
            color: darkMode ? "#fff" : "#333"
          }}
          disabled={isLoading || attachedImages.length >= 5}
        />
        
        {/* 이미지 미리보기 */}
        {imagePreviewUrls.length > 0 && (
          <div style={{ 
            display: "flex", 
            flexWrap: "wrap", 
            gap: 10, 
            marginTop: 10 
          }}>
            {imagePreviewUrls.map((url, index) => (
              <div 
                key={index} 
                style={{ 
                  position: "relative",
                  width: 100,
                  height: 100
                }}
              >
                <img 
                  src={url} 
                  alt={`미리보기 ${index + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 4
                  }}
                />
                <button
                  onClick={() => removeImage(index)}
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(255, 0, 0, 0.7)",
                    color: "white",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 16,
                    fontWeight: "bold",
                    padding: 0
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 영상 파일 첨부 (special-moments 카테고리일 때만 표시) */}
      {category === "special-moments" && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ 
            display: "block", 
            marginBottom: 8, 
            fontSize: 16,
            color: darkMode ? "#fff" : "#333"
          }}>
            영상 파일 첨부 (최대 1개, 100MB 이하)
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            style={{ 
              display: "block", 
              marginBottom: 10,
              color: darkMode ? "#fff" : "#333"
            }}
            disabled={isLoading}
          />
          
          {/* 영상 파일 미리보기 */}
          {videoPreview && (
            <div style={{
              backgroundColor: darkMode ? "#444" : "#f5f5f5",
              padding: "10px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "10px"
            }}>
              <span style={{ 
                color: darkMode ? "#fff" : "#333",
                fontSize: "14px"
              }}>
                🎬 {videoPreview}
              </span>
              <button
                onClick={removeVideo}
                style={{
                  background: "rgba(255, 0, 0, 0.7)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                제거
              </button>
            </div>
          )}
        </div>
      )}

      {/* 녹음 파일 첨부 (recording 카테고리일 때만 표시) */}
      {category === "recording" && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ 
            display: "block", 
            marginBottom: 8, 
            fontSize: 16,
            color: darkMode ? "#fff" : "#333"
          }}>
            녹음 파일 첨부 (최대 1개, 50MB 이하)
          </label>
          <div style={{
            fontSize: "14px",
            color: darkMode ? "#aaa" : "#666",
            marginBottom: "10px"
          }}>
            • 오디오 파일만 업로드 가능합니다 (MP3, WAV, M4A, AAC 등)
            • 파일 크기는 50MB까지 가능합니다
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={handleRecordingUpload}
            style={{ 
              display: "block", 
              marginBottom: 10,
              color: darkMode ? "#fff" : "#333"
            }}
            disabled={isLoading}
          />
          
          {/* 피드백 허용 체크박스 추가 */}
          <div style={{
            marginTop: "15px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <input
              type="checkbox"
              id="wantFeedback"
              checked={wantFeedback}
              onChange={(e) => setWantFeedback(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                cursor: "pointer"
              }}
            />
            <label
              htmlFor="wantFeedback"
              style={{
                color: darkMode ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              다른 사용자의 피드백을 허용합니다
            </label>
          </div>
          
          {/* 녹음 파일 미리보기 */}
          {recordingPreview && (
            <div style={{
              backgroundColor: darkMode ? "#444" : "#f5f5f5",
              padding: "10px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "10px"
            }}>
              <span style={{ 
                color: darkMode ? "#fff" : "#333",
                fontSize: "14px"
              }}>
                🎵 {recordingPreview}
              </span>
              <button
                onClick={removeRecording}
                style={{
                  background: "rgba(255, 0, 0, 0.7)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                제거
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 업로드 진행률 표시 */}
      {isLoading && uploadProgress > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            width: "100%",
            height: "8px",
            backgroundColor: darkMode ? "#444" : "#f5f5f5",
            borderRadius: "4px",
            overflow: "hidden"
          }}>
            <div style={{
              width: `${uploadProgress}%`,
              height: "100%",
              backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
              transition: "width 0.3s ease"
            }} />
          </div>
          <p style={{
            textAlign: "center",
            color: darkMode ? "#bb86fc" : "#7e57c2",
            fontSize: "14px",
            margin: "8px 0 0 0"
          }}>
            업로드 중... {uploadProgress}%
          </p>
        </div>
      )}
      
      {/* 옵션 선택 */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ 
          display: "flex", 
          alignItems: "center", 
          marginBottom: 10,
          gap: 8,
          cursor: "pointer"
        }}>
          <input
            type="checkbox"
            checked={privatePost}
            onChange={e => setPrivatePost(e.target.checked)}
            disabled={isLoading}
            style={{ cursor: "pointer" }}
          />
          <span style={{ color: darkMode ? "#fff" : "#333" }}>
            비공개 글로 작성 (나만 볼 수 있습니다)
          </span>
        </label>
        
        {category === "duet" && !isNotice && (
          <label style={{ 
            display: "flex", 
            alignItems: "center",
            gap: 8,
            cursor: "pointer"
          }}>
            <input
              type="checkbox"
              checked={partnerDone}
              onChange={e => setPartnerDone(e.target.checked)}
              disabled={isLoading}
              style={{ cursor: "pointer" }}
            />
            <span style={{ color: darkMode ? "#fff" : "#333" }}>
              구인완료 (파트너를 모두 찾았습니다)
            </span>
          </label>
        )}
        
        {/* 공지사항 체크박스 - 리더나 운영진만 표시 */}
        {(role === "리더" || role === "운영진") && (
          <label style={{ 
            display: "flex", 
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            marginTop: 10
          }}>
            <input
              type="checkbox"
              checked={isNotice}
              onChange={e => setIsNotice(e.target.checked)}
              disabled={isLoading}
              style={{ cursor: "pointer" }}
            />
            <span style={{ 
              color: darkMode ? "#fff" : "#333",
              fontWeight: "bold",
              background: darkMode ? "rgba(255, 152, 0, 0.2)" : "rgba(255, 152, 0, 0.1)",
              padding: "2px 8px",
              borderRadius: "4px"
            }}>
              📢 공지사항으로 작성
            </span>
          </label>
        )}
      </div>
      
      {/* 버튼 영역 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        marginTop: 30
      }}>
        <button 
          onClick={() => {
            if (window.confirm("작성을 취소하시겠습니까? 작성 중인 내용은 저장되지 않습니다.")) {
              switch (category) {
                case "duet": nav("/duet"); break;
                case "song": nav("/songs"); break;
                case "advice": nav("/advice"); break;
                case "free": nav("/freeboard"); break;
                case "recording": nav("/recordings"); break;
                default: nav("/");
              }
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
          {isLoading ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </div>
  );
}

// Props 검증 추가
WritePost.propTypes = {
  darkMode: PropTypes.bool
};

// 기본값 설정
WritePost.defaultProps = {
  darkMode: false
};

export default WritePost;
