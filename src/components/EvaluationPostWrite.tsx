import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc as firestoreDoc, query, where, getDocs } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { ArrowLeft, Mic, StopCircle, Save, X, Upload, Play, Pause } from 'lucide-react';
import { startOfWeek, endOfWeek, format as formatDate } from 'date-fns';
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

const EvaluationPostWrite: React.FC = () => {
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
  const [category, setCategory] = useState('busking');
  const [members, setMembers] = useState<string[]>(['']);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const categoryOptions = [
    { id: 'busking', name: '버스킹심사곡' },
    { id: 'feedback', name: '피드백요청' }
  ];

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // 오디오 파일만 허용 (영상 파일 차단)
    const audioMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/aac', 'audio/x-aac', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/x-ogg', 'audio/webm', 'audio/x-ms-wma', 'audio/caf', 'audio/amr', 'audio/x-amr', 'audio/3gpp', 'audio/x-3gpp'];
    const videoMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/webm', 'video/ogg', 'video/3gpp', 'video/x-flv', 'video/x-matroska'];
    
    // MIME 타입 확인
    const fileType = file.type.toLowerCase();
    const isAudio = audioMimeTypes.some(type => fileType.includes(type));
    const isVideo = videoMimeTypes.some(type => fileType.includes(type));
    
    // 확장자 확인 (MIME 타입이 없는 경우 대비)
    const fileName = file.name.toLowerCase();
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.aac', '.caf', '.amr', '.flac', '.ogg', '.wma', '.webm', '.3gp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm', '.3gp'];
    
    const hasAudioExt = audioExtensions.some(ext => fileName.endsWith(ext));
    const hasVideoExt = videoExtensions.some(ext => fileName.endsWith(ext));
    
    // 영상 파일이면 차단
    if (isVideo || hasVideoExt) {
      alert('영상 파일은 업로드할 수 없습니다. 오디오 파일만 업로드 가능합니다.');
      e.target.value = ''; // input 초기화
      return;
    }
    
    // 오디오 파일이 아니면 차단
    if (!isAudio && !hasAudioExt) {
      alert('오디오 파일만 업로드 가능합니다. (mp3, m4a, wav, aac, caf, amr, flac, ogg, wma 등)');
      e.target.value = ''; // input 초기화
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setDisplayFileName(null);
    setFileName(null);
    try {
      const fileRef = storageRef(storage, `evaluations/${user.uid}/${Date.now()}_${file.name}`);
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
          extractDuration(url);
        }
      );
    } catch (error) {
      alert('파일 업로드 중 오류가 발생했습니다.');
      setUploading(false);
      setUploadProgress(null);
    }
  };

  useEffect(() => {
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

  const handleSubmit = async () => {
    if (!user || !audioBlob) return;
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (category === 'busking' && (members.length === 0 || members.every(m => !m.trim()))) {
      alert('닉네임을 1명 이상 입력해주세요.');
      return;
    }
    
    // 버스킹심사곡만 주당 2곡 제한 체크
    if (category === 'busking') {
      try {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // 월요일 시작
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // 일요일 끝
        const userDoc = await getDoc(firestoreDoc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        const limitOverride = userData?.evaluationBuskingWeeklyLimit;
        const effectiveLimit = Number.isInteger(limitOverride) ? limitOverride : 2;
        
        console.log('');
        console.log('📊 ===== 버스킹심사곡 주간 제한 체크 =====');
        console.log('👤 사용자:', user.nickname, '(', user.uid, ')');
        console.log('📅 주 기간:', formatDate(weekStart, 'yyyy-MM-dd'), '~', formatDate(weekEnd, 'yyyy-MM-dd'));
        
        // 이번 주에 작성한 버스킹심사곡 개수 확인 (삭제된 글은 제외됨)
        const q = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
          where('writerUid', '==', user.uid)
        );
        
        const snapshot = await getDocs(q);
        
        const buskingCategoryValues = ['busking', '버스킹심사곡'];
        const thisWeekPosts = snapshot.docs.filter(doc => {
          const data = doc.data();
          if (!data.createdAt) return false;
          if (!buskingCategoryValues.includes(data.category)) return false;
          
          // Firestore Timestamp를 Date로 변환
          const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          
          return createdDate >= weekStart && createdDate <= weekEnd;
        });
        
        console.log('📊 이번 주 작성한 버스킹심사곡:', thisWeekPosts.length, `/ ${effectiveLimit}곡`);
        
        if (thisWeekPosts.length >= effectiveLimit) {
          console.log('🚫 주간 제한 초과!');
          console.log('');
          alert(`버스킹심사곡은 주당 최대 ${effectiveLimit}곡까지만 업로드 가능합니다.\n\n이번 주 업로드: ${thisWeekPosts.length}/${effectiveLimit}곡`);
          return;
        }
        
        console.log('✅ 주간 제한 통과');
        console.log('');
      } catch (error) {
        console.error('❌ 주간 제한 체크 실패:', error);
      }
    }
    
    try {
      setLoading(true);
      let audioDownloadUrl = '';
      if (audioBlob instanceof File) {
        const fileRef = storageRef(storage, `evaluations/${user.uid}/${Date.now()}_${audioBlob instanceof File ? audioBlob.name : 'audio.wav'}`);
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
        const fileRef = storageRef(storage, `evaluations/${user.uid}/${filename}`);
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
        type: 'evaluation',
        category,
        status: '대기',
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
        likes: [],
        members: category === 'busking' ? members.filter(m => m.trim()) : [],
      });
      
      // 업로드 후 안내
      if (category === 'busking') {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // 월요일 시작
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // 일요일 끝
        const userDoc = await getDoc(firestoreDoc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        const limitOverride = userData?.evaluationBuskingWeeklyLimit;
        const effectiveLimit = Number.isInteger(limitOverride) ? limitOverride : 2;
        const q = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
          where('writerUid', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const buskingCategoryValues = ['busking', '버스킹심사곡'];
        const thisWeekPosts = snapshot.docs.filter(doc => {
          const data = doc.data();
          if (!data.createdAt) return false;
          if (!buskingCategoryValues.includes(data.category)) return false;
          const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          return createdDate >= weekStart && createdDate <= weekEnd;
        });
        
        alert(`버스킹심사곡이 업로드되었습니다!\n\n이번 주 업로드: ${thisWeekPosts.length}/${effectiveLimit}곡`);
      } else {
        alert('피드백심사 글이 업로드되었습니다!');
      }
      navigate('/evaluation');
    } catch (error) {
      console.error('평가글 업로드 오류:', error);
      alert('평가글 업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="board-container">
      <div className="board-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', width: '100%' }}>
        <button 
          className="back-button" 
          onClick={() => navigate('/evaluation')}
          style={{ position: 'static' }}
        >
          <ArrowLeft size={20} />
          목록으로
        </button>
        <h1 className="board-title" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
          <Mic size={28} />
          평가글 작성
        </h1>
      </div>

      <div className="write-form recording-form">
        {/* 카테고리 선택 - 버튼 그룹, 가운데 정렬 */}
        <div className="form-group" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label className="form-label" style={{ marginBottom: 6, textAlign: 'center' }}>카테고리</label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {categoryOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`category-button${category === opt.id ? ' active' : ''}`}
                onClick={() => setCategory(opt.id)}
                style={{
                  minWidth: 90,
                  padding: '7px 16px',
                  fontSize: '1rem',
                  borderRadius: 10,
                  fontWeight: 600,
                  background: category === opt.id ? '#8A55CC' : '#f6f2ff',
                  color: category === opt.id ? 'white' : '#8A55CC',
                  border: category === opt.id ? '2px solid #8A55CC' : '2px solid #e3d0ff',
                  transition: 'all 0.15s'
                }}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="곡제목(곡제목만 써주세요!)"
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

        {/* 듀엣/합창 멤버 입력 (버스킹심사곡 선택 시만) */}
        {category === 'busking' && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ marginBottom: 6, textAlign: 'center', whiteSpace: 'normal' }}>
               듀엣/합창멤버 닉네임기입 필수!(본인포함)<br/>
               <span style={{ color: '#8A55CC', fontWeight: 500 }}>*솔로인 경우 본인 닉네임만 적어주세요.</span>
             </label>
            {members.map((member, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input
                  value={member}
                  onChange={e => setMembers(members => members.map((m, i) => i === idx ? e.target.value : m))}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }}
                  placeholder={`멤버 닉네임 ${idx + 1}`}
                />
                {members.length > 1 && (
                  <button type="button" onClick={() => setMembers(members => members.filter((_, i) => i !== idx))} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>삭제</button>
                )}
                {idx === members.length - 1 && (
                  <button type="button" onClick={() => setMembers(members => [...members, ''])} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>추가</button>
                )}
              </div>
            ))}
          </div>
        )}

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
              accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <Upload size={20} style={{ marginRight: 4 }} /> 파일 업로드
          </label>
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
                작성하기
              </>
            )}
          </button>
          <button 
            className="cancel-button"
            onClick={() => navigate('/evaluation')}
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
            {/* 업로드 중... 문구를 파일명/진행률 아래에만 표시 */}
            {uploading && <span className="uploading-text" style={{ marginTop: 8, color: '#8A55CC', fontWeight: 500 }}>업로드 중...</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaluationPostWrite; 