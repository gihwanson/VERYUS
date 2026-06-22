import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc as firestoreDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { ArrowLeft, Mic, X, FileAudio, Send } from 'lucide-react';
import '../styles/RecordingPostWrite.css';

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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userString));
  }, [navigate]);

  const extractDuration = (url: string, tryCount = 0) => {
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (tryCount < 5) {
        setTimeout(() => extractDuration(url, tryCount + 1), 200);
      } else {
        setDuration(0);
      }
    });
  };

  const formatDurationLabel = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const audioMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/aac',
      'audio/x-aac',
      'audio/flac',
      'audio/x-flac',
      'audio/ogg',
      'audio/x-ogg',
      'audio/webm',
      'audio/x-ms-wma',
      'audio/caf',
      'audio/amr',
      'audio/x-amr',
      'audio/3gpp',
      'audio/x-3gpp'
    ];
    const videoMimeTypes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/webm',
      'video/ogg',
      'video/3gpp',
      'video/x-flv',
      'video/x-matroska'
    ];

    const fileType = file.type.toLowerCase();
    const isAudio = audioMimeTypes.some((type) => fileType.includes(type));
    const isVideo = videoMimeTypes.some((type) => fileType.includes(type));

    const lowerName = file.name.toLowerCase();
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.aac', '.caf', '.amr', '.flac', '.ogg', '.wma', '.webm', '.3gp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm', '.3gp'];

    const hasAudioExt = audioExtensions.some((ext) => lowerName.endsWith(ext));
    const hasVideoExt = videoExtensions.some((ext) => lowerName.endsWith(ext));

    if (isVideo || hasVideoExt) {
      alert('영상 파일은 업로드할 수 없습니다. 오디오 파일만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }

    if (!isAudio && !hasAudioExt) {
      alert('오디오 파일만 업로드 가능합니다. (mp3, m4a, wav, aac, caf, amr, flac, ogg, wma 등)');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setDisplayFileName(null);
    setFileName(null);
    try {
      const fileRef = storageRef(storage, `recordings/${user.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        () => {
          alert('파일 업로드 중 오류가 발생했습니다.');
          setUploading(false);
          setUploadProgress(null);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setAudioBlob(file);
          setFileName(file.name);
          setUploading(false);
          setUploadProgress(null);
          setDisplayFileName(file.name);
          extractDuration(url);
        }
      );
    } catch {
      alert('파일 업로드 중 오류가 발생했습니다.');
      setUploading(false);
      setUploadProgress(null);
    }
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
        const wavName = `${y}${m}${d}_${hh}${mm}${ss}.wav`;
        const fileRef = storageRef(storage, `recordings/${user.uid}/${wavName}`);
        await uploadBytes(fileRef, audioBlob);
        audioDownloadUrl = await getDownloadURL(fileRef);
      }

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

  return (
    <div className="board-container rec-post-write-page">
      <div className="rec-post-write">
        <header className="rec-post-write__top">
          <button type="button" className="rec-post-write__back" onClick={() => navigate('/recording')}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            목록으로
          </button>
          <div className="rec-post-write__title-wrap">
            <Mic className="rec-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="rec-post-write__title">녹음하기</h1>
              <p className="rec-post-write__subtitle">
                오디오 파일을 선택한 뒤 제목과 설명을 입력하고 등록하면 녹음 게시판에 올라갑니다.
              </p>
            </div>
          </div>
        </header>

        <main className="write-form rec-post-write__form">
          <section className="rec-post-write__section">
            <label htmlFor="rec-post-title" className="rec-post-write__section-label">
              제목
            </label>
            <input
              id="rec-post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="title-input rec-post-write__title-input"
              autoComplete="off"
            />
          </section>

          <section className="rec-post-write__section">
            <label htmlFor="rec-post-desc" className="rec-post-write__section-label">
              설명 <span className="rec-post-write__optional">(선택)</span>
            </label>
            <textarea
              id="rec-post-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="곡이나 녹음에 대해 짧게 적어 주세요. (Shift+Enter로 줄바꿈)"
              className="content-textarea rec-post-write__textarea"
              rows={4}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(Math.max(target.scrollHeight, 120), 360) + 'px';
              }}
            />
          </section>

          <section className="rec-post-write__section">
            <span className="rec-post-write__section-label">오디오 파일</span>
            <label className={`rec-post-write__upload${uploading ? ' rec-post-write__upload--busy' : ''}`}>
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <div className="rec-post-write__upload-inner">
                <FileAudio className="rec-post-write__upload-icon" size={36} strokeWidth={1.5} aria-hidden />
                <strong>탭하여 오디오 파일 선택</strong>
                <span>MP3 · M4A · WAV 등 (영상 파일은 업로드할 수 없습니다)</span>
              </div>
            </label>

            {(displayFileName || (uploading && uploadProgress !== null)) && (
              <div className="rec-post-write__file-status">
                {displayFileName && <div className="rec-post-write__file-name">{displayFileName}</div>}
                {duration > 0 && displayFileName && !uploading && (
                  <div className="rec-post-write__file-meta">재생 길이 약 {formatDurationLabel(duration)}</div>
                )}
                {uploading && uploadProgress !== null && (
                  <div
                    className="rec-post-write__progress-track"
                    role="progressbar"
                    aria-valuenow={Math.round(uploadProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="rec-post-write__progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                {uploading && <span className="rec-post-write__uploading-label">업로드 중…</span>}
              </div>
            )}
          </section>

          <div className="rec-post-write__actions">
            <button
              type="button"
              className="submit-button rec-post-write__submit"
              onClick={handleSubmit}
              disabled={loading || !audioBlob}
            >
              {loading ? (
                '처리 중…'
              ) : (
                <>
                  <Send size={18} aria-hidden />
                  등록하기
                </>
              )}
            </button>
            <button
              type="button"
              className="cancel-button rec-post-write__cancel"
              onClick={() => navigate('/recording')}
              disabled={loading}
            >
              <X size={18} aria-hidden />
              취소
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default RecordingPostWrite;
