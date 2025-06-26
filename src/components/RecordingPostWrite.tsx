import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  addDoc,
  serverTimestamp,
  getDoc,
  doc as firestoreDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { 
  ArrowLeft, 
  Mic,
  StopCircle,
  Save,
  X,
  Upload,
  Play,
  Pause
} from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';

interface User {
  uid: string;
  email: string;
  nickname: string;
  grade?: string;
  role?: string;
  position?: string;
}

const RecordingPostWrite: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userString));
  }, [navigate]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(url);
        extractDuration(url);
        // 파일명 생성 및 표시
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const filename = `${y}${m}${d}_${hh}${mm}${ss}.wav`;
        setDisplayFileName(filename);
        setFileName(filename);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('녹음 시작 오류:', error);
      alert('마이크 접근 권한이 필요합니다.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // 스트림 정지
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSubmit = async () => {
    if (!user || !audioBlob) return;
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      let audioDownloadUrl = '';
      if (audioBlob instanceof File) {
        const fileRef = storageRef(storage, `recordings/${user.uid}/${Date.now()}_${audioBlob.name}`);
        await uploadBytes(fileRef, audioBlob);
        audioDownloadUrl = await getDownloadURL(fileRef);
      } else {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const filename = `${y}${m}${d}_${hh}${mm}${ss}.wav`;
        const fileRef = storageRef(storage, `recordings/${user.uid}/${filename}`);
        await uploadBytes(fileRef, audioBlob);
        audioDownloadUrl = await getDownloadURL(fileRef);
      }
      // 작성자 정보 보강: users 컬렉션에서 최신 정보 fetch
      let writerGrade = user.grade;
      let writerRole = user.role;
      let writerPosition = user.position;
      if (!writerGrade || !writerRole || !writerPosition) {
        const userDoc = await getDoc(firestoreDoc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          writerGrade = userData.grade || writerGrade;
          writerRole = userData.role || writerRole;
          writerPosition = userData.position || writerPosition;
        }
      }
      // Firestore에 게시글 저장
      await addDoc(collection(db, 'posts'), {
        type: 'recording',
        title,
        description,
        writerUid: user.uid,
        writerNickname: user.nickname,
        writerGrade: writerGrade || '🍒',
        writerRole: writerRole || '일반',
        writerPosition: writerPosition || '',
        createdAt: serverTimestamp(),
        audioUrl: audioDownloadUrl,
        duration,
        fileName: fileName || '',
        likesCount: 0,
        commentCount: 0,
        views: 0,
        likes: []
      });
      alert('녹음이 성공적으로 업로드되었습니다.');
      navigate('/recording');
    } catch (error) {
      console.error('녹음 업로드 오류:', error);
      alert('녹음 업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 오디오 요소 생성
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 오디오 길이 계산 (재시도 로직 추가)
  const extractDuration = (url: string, tryCount = 0) => {
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (tryCount < 5) {
        setTimeout(() => extractDuration(url, tryCount + 1), 200);
      } else {
        setDuration(0); // 실패 시 0으로 저장
      }
    });
  };

  // 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setUploadProgress(0);
    setDisplayFileName(null);
    setFileName(null);
    try {
      const fileRef = storageRef(storage, `recordings/${user.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          alert('파일 업로드 중 오류가 발생했습니다.');
          setUploading(false);
          setUploadProgress(null);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setAudioUrl(url);
          setAudioBlob(file);
          setUploading(false);
          setUploadProgress(null);
          setDisplayFileName(file.name);
          setFileName(file.name);
          extractDuration(url);
        }
      );
    } catch (err) {
      alert('파일 업로드 중 오류가 발생했습니다.');
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="board-container">

      <div className="board-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', width: '100%' }}>
        <button 
          className="back-button" 
          onClick={() => navigate('/recording')}
          style={{ position: 'static' }}

        >
          <ArrowLeft size={20} />
          목록으로
        </button>

        <h1 className="board-title" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>

          <Mic size={28} />
          녹음하기
        </h1>
      </div>

      <div className="write-form recording-form">
        <div className="form-group">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            className="title-input"
          />
        </div>

        <div className="form-group">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="녹음에 대한 설명을 입력하세요 (Shift+Enter로 줄바꿈)"
            className="content-input"
            rows={4}
            style={{
              resize: 'none',
              overflow: 'hidden',
              minHeight: '100px',
              maxHeight: '400px',
              lineHeight: '1.4'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(Math.max(target.scrollHeight, 100), 400) + 'px';
            }}
          />
        </div>

        <div className="recording-controls" style={{ display: 'flex', flexDirection: 'row', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
          <button
            type="button"
            className={`record-button${isRecording ? ' recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            style={{ minWidth: '160px' }}
          >
            {isRecording ? (
              <>
                <StopCircle size={24} /> 녹음 중지
              </>
            ) : (
              <>
                <Mic size={24} /> 녹음 시작
              </>
            )}
          </button>
          <label className="record-button upload-audio-label" style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.mp4,.mov,.3gp,.amr,.flac,.ogg,.wma"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <Upload size={20} style={{ marginRight: 4 }} /> 파일 업로드
          </label>
          {uploading && <span className="uploading-text">업로드 중...</span>}
        </div>

        <div className="form-actions" style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '32px' }}>
          <button 
            className="submit-button" 
            onClick={handleSubmit}
            disabled={loading || !audioBlob}
          >
            {loading ? (
              '업로드 중...'
            ) : (
              <>
                <Upload size={16} />
                업로드
              </>
            )}
          </button>
          <button 
            className="cancel-button"
            onClick={() => navigate('/recording')}
            disabled={loading}
          >
            <X size={16} />
            취소
          </button>
        </div>

        {/* 파일명/진행률 표시 영역 */}
        {(displayFileName || (uploadProgress !== null && uploading)) && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#F6F2FF', color: '#8A55CC', borderRadius: '12px', padding: '12px 24px', margin: '0 auto 18px auto', maxWidth: 340, minWidth: 220
          }}>
            {displayFileName && (
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: uploadProgress !== null && uploading ? 8 : 0, textAlign: 'center' }}>
                파일명: {displayFileName}
              </div>
            )}
            {uploadProgress !== null && uploading && (
              <div style={{ width: '100%', maxWidth: 280, height: 12, background: '#e9dfff', borderRadius: 6, overflow: 'hidden', marginTop: 2 }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#8A55CC', borderRadius: 6, transition: 'width 0.2s' }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingPostWrite; 