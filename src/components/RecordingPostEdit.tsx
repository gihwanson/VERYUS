import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ArrowLeft,
  Save,
  X,
  Play,
  Pause
} from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface User {
  uid: string;
  email: string;
  nickname: string;
}

interface RecordingPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
  audioUrl: string;
  duration: number;
}

const RecordingPostEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<RecordingPost | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState<number>(0);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userString));
  }, [navigate]);

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;

      try {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (!postDoc.exists()) {
          setError('게시글을 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        const postData = {
          id: postDoc.id,
          ...postDoc.data()
        } as RecordingPost;

        setPost(postData);
        setTitle(postData.title);
        setDescription(postData.description);
        setLoading(false);
      } catch (error) {
        console.error('게시글 로딩 오류:', error);
        setError('게시글을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    };

    fetchPost();
  }, [id]);

  useEffect(() => {
    if (post?.audioUrl) {
      setAudioUrl(post.audioUrl);
      setDuration(post.duration);
      audioRef.current = new Audio(post.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [post?.audioUrl, post?.duration]);

  const handlePlayPause = () => {
    if (!audioRef.current || !post?.audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSubmit = async () => {
    if (!user || !post) return;

    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      await updateDoc(doc(db, 'posts', post.id), {
        title,
        description
      });

      alert('게시글이 수정되었습니다.');
      navigate(`/recording/${post.id}`);
    } catch (error) {
      console.error('게시글 수정 오류:', error);
      alert('게시글 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !post) return;

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
    try {
      const fileRef = storageRef(storage, `recordings/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setAudioUrl(url);
      setAudioFileName(file.name);
      // duration 추출
      const audio = new Audio(url);
      audio.onloadedmetadata = async () => {
        setDuration(audio.duration);
        await updateDoc(doc(db, 'posts', post.id), {
          audioUrl: url,
          duration: audio.duration
        });
        alert('오디오 파일이 업로드 및 교체되었습니다.');
      };
    } catch (err) {
      alert('오디오 파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => navigate('/recording')}>목록으로 돌아가기</button>
      </div>
    );
  }

  if (loading || !post) {
    return (
      <div className="loading-container">
        <span>게시글을 불러오는 중...</span>
      </div>
    );
  }

  if (!user || user.uid !== post.writerUid) {
    return (
      <div className="error-container">
        <p>수정 권한이 없습니다.</p>
        <button onClick={() => navigate('/recording')}>목록으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div className="board-header">
        <h1 className="board-title">녹음 수정</h1>
        <button 
          className="back-button" 
          onClick={() => navigate(`/recording/${post.id}`)}
        >
          <ArrowLeft size={20} />
          돌아가기
        </button>
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

        <div className="form-group">
          <label style={{ fontWeight: 600, color: '#8A55CC', marginBottom: 8 }}>오디오 파일 업로드</label>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ marginBottom: 8 }}
          />
          {uploading && <span style={{ color: '#8A55CC' }}>업로드 중...</span>}
          {audioFileName && <div style={{ color: '#8A55CC', fontWeight: 500 }}>파일명: {audioFileName}</div>}
        </div>

        <div className="recording-player">
          <button
            className="play-button"
            onClick={handlePlayPause}
            disabled={!audioUrl}
          >
            {isPlaying ? (
              <Pause size={40} />
            ) : (
              <Play size={40} />
            )}
          </button>
          <span className="duration">{formatDuration(duration)}</span>
          <audio ref={audioRef} src={audioUrl || ''} preload="auto" />
        </div>

        <div className="form-actions">
          <button 
            className="submit-button" 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              '수정 중...'
            ) : (
              <>
                <Save size={16} />
                수정하기
              </>
            )}
          </button>
          <button 
            className="cancel-button"
            onClick={() => navigate(`/recording/${post.id}`)}
            disabled={loading}
          >
            <X size={16} />
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingPostEdit; 