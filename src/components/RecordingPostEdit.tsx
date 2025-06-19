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
import './Board.css';
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
            placeholder="녹음에 대한 설명을 입력하세요"
            className="content-input"
            rows={4}
          />
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600, color: '#8A55CC', marginBottom: 8 }}>오디오 파일 업로드</label>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.mp4,.mov,.3gp,.amr,.flac,.ogg,.wma"
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