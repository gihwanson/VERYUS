import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc as firestoreDoc, query, where, getDocs } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { ArrowLeft, Mic, X, FileAudio, Send } from 'lucide-react';
import { startOfWeek, endOfWeek, format as formatDate } from 'date-fns';
import '../styles/EvaluationPostWrite.css';
import { rejectBoardAttachmentIfTooLarge } from '../utils/boardAttachmentLimits';
import EvaluationWriteNoticeModal, { isEvalWriteNoticeHidden } from './EvaluationWriteNoticeModal';
import NicknameSuggestInput, {
  findInvalidMemberNicknames,
  normalizeMemberNicknames,
} from './NicknameSuggestInput';
import { getUserMentions } from '../utils/getUserMentions';
import type { UserMention } from '../utils/getUserMentions';

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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [category, setCategory] = useState('busking');
  const [members, setMembers] = useState<string[]>(['']);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [memberCandidates, setMemberCandidates] = useState<UserMention[]>([]);

  const categoryOptions = [
    { id: 'busking', name: '버스킹심사곡' },
    { id: 'rejudge', name: '재심사' },
    { id: 'feedback', name: '피드백요청' }
  ];
  const requiresMembers = category === 'busking' || category === 'rejudge';

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
    getUserMentions()
      .then(setMemberCandidates)
      .catch(() => setMemberCandidates([]));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (rejectBoardAttachmentIfTooLarge(file, file.name, e.target)) return;

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
          console.error('평가게시판 파일 업로드 오류:', error);
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
    } catch (error) {
      alert('파일 업로드 중 오류가 발생했습니다.');
      setUploading(false);
      setUploadProgress(null);
    }
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

  const formatDurationLabel = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /** 등록하기 클릭 → 기본 검증 후 안내 모달 */
  const handleRegisterClick = async () => {
    if (!user || !audioBlob || loading || uploading) return;
    const attachmentName = fileName || (audioBlob instanceof File ? audioBlob.name : 'audio.wav');
    if (rejectBoardAttachmentIfTooLarge(audioBlob, attachmentName)) return;

    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (requiresMembers && (members.length === 0 || members.every(m => !m.trim()))) {
      alert('닉네임을 1명 이상 입력해주세요.');
      return;
    }

    if (requiresMembers) {
      if (memberCandidates.length === 0) {
        alert('회원 목록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const invalidNicknames = findInvalidMemberNicknames(members, memberCandidates);
      if (invalidNicknames.length > 0) {
        alert(
          `앱에 없는 닉네임이 있습니다.\n드롭다운에서 정확한 회원 닉네임을 선택해 주세요.\n\n잘못된 닉네임: ${invalidNicknames.join(', ')}`
        );
        return;
      }
      const normalized = normalizeMemberNicknames(members, memberCandidates);
      if (normalized.length === 0) {
        alert('닉네임을 1명 이상 입력해주세요.');
        return;
      }
      setMembers(normalized);
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

    if (isEvalWriteNoticeHidden()) {
      void handleSubmit();
      return;
    }

    setShowNoticeModal(true);
  };

  /** 안내 확인 후 실제 등록 */
  const handleSubmit = async () => {
    if (!user || !audioBlob) return;
    const attachmentName = fileName || (audioBlob instanceof File ? audioBlob.name : 'audio.wav');
    if (rejectBoardAttachmentIfTooLarge(audioBlob, attachmentName)) return;

    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    let membersToSave: string[] = [];
    if (requiresMembers) {
      if (members.length === 0 || members.every((m) => !m.trim())) {
        alert('닉네임을 1명 이상 입력해주세요.');
        return;
      }
      const invalidNicknames = findInvalidMemberNicknames(members, memberCandidates);
      if (invalidNicknames.length > 0) {
        alert(
          `앱에 없는 닉네임이 있습니다.\n드롭다운에서 정확한 회원 닉네임을 선택해 주세요.\n\n잘못된 닉네임: ${invalidNicknames.join(', ')}`
        );
        return;
      }
      membersToSave = normalizeMemberNicknames(members, memberCandidates);
      if (membersToSave.length === 0) {
        alert('닉네임을 1명 이상 입력해주세요.');
        return;
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
        members: requiresMembers ? membersToSave : [],
      });
      
      setShowNoticeModal(false);

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
      } else if (category === 'rejudge') {
        alert('재심사 글이 업로드되었습니다!');
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
    <div className="board-container eval-post-write-page">
      <div className="eval-post-write">
        <header className="eval-post-write__top">
          <button type="button" className="eval-post-write__back" onClick={() => navigate('/evaluation')}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            목록으로
          </button>
          <div className="eval-post-write__title-wrap">
            <Mic className="eval-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="eval-post-write__title">평가글 작성</h1>
              <p className="eval-post-write__subtitle">오디오 파일과 곡 정보를 입력한 뒤 등록하면 심사 대기 상태로 올라갑니다.</p>
            </div>
          </div>
        </header>

        <main className="write-form eval-post-write__form">
          <section className="eval-post-write__section" aria-labelledby="eval-type-label">
            <span id="eval-type-label" className="eval-post-write__section-label">
              유형
            </span>
            <div className="eval-post-write__segment" role="tablist" aria-label="평가 유형">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={category === opt.id}
                  className={`eval-post-write__segment-btn${category === opt.id ? ' eval-post-write__segment-btn--active' : ''}`}
                  onClick={() => setCategory(opt.id)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </section>

          <section className="eval-post-write__section">
            <label htmlFor="eval-post-title" className="eval-post-write__section-label">
              곡 제목
            </label>
            <input
              id="eval-post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="곡 제목만 입력해 주세요"
              className="title-input eval-post-write__title-input"
              autoComplete="off"
            />
          </section>

          <section className="eval-post-write__section">
            <label htmlFor="eval-post-desc" className="eval-post-write__section-label">
              설명 <span className="eval-post-write__optional">(선택)</span>
            </label>
            <textarea
              id="eval-post-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="곡이나 녹음에 대해 짧게 적어 주세요. (Shift+Enter로 줄바꿈)"
              className="content-textarea eval-post-write__textarea"
              rows={4}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(Math.max(target.scrollHeight, 120), 360) + 'px';
              }}
            />
          </section>

          {requiresMembers && (
            <section className="eval-post-write__section" aria-labelledby="eval-members-label">
              <span id="eval-members-label" className="eval-post-write__section-label">
                참여 멤버
              </span>
              <p className="eval-post-write__hint">
                {category === 'rejudge'
                  ? '이미 합격된 곡의 듀엣·합창 멤버를 모두 적어 주세요. 솔로는 본인 닉네임만 입력하면 됩니다. 반드시 앱 회원 닉네임을 목록에서 선택해 주세요.'
                  : <>듀엣·합창은 <strong>모든 멤버 닉네임</strong>을 적어 주세요. 솔로는 <strong>본인 닉네임만</strong> 입력하면 됩니다. <strong>앱에 등록된 닉네임만</strong> 선택할 수 있습니다.</>}
              </p>
              {members.map((member, idx) => (
                <div key={idx} className="eval-post-write__member-row">
                  <NicknameSuggestInput
                    className="eval-post-write__member-suggest"
                    value={member}
                    onChange={(next) =>
                      setMembers((prev) => prev.map((m, i) => (i === idx ? next : m)))
                    }
                    placeholder={`멤버 닉네임 ${idx + 1}`}
                    candidates={memberCandidates}
                    excludeNicknames={members.filter((_, i) => i !== idx)}
                  />
                  {members.length > 1 && (
                    <button
                      type="button"
                      className="eval-post-write__member-btn eval-post-write__member-btn--remove"
                      onClick={() => setMembers((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      삭제
                    </button>
                  )}
                  {idx === members.length - 1 && (
                    <button
                      type="button"
                      className="eval-post-write__member-btn eval-post-write__member-btn--add"
                      onClick={() => setMembers((prev) => [...prev, ''])}
                    >
                      추가
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="eval-post-write__section">
            <span className="eval-post-write__section-label">오디오 파일</span>
            <label
              className={`eval-post-write__upload${uploading ? ' eval-post-write__upload--busy' : ''}`}
            >
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <div className="eval-post-write__upload-inner">
                <FileAudio className="eval-post-write__upload-icon" size={36} strokeWidth={1.5} aria-hidden />
                <strong>탭하여 오디오 파일 선택</strong>
                <span>MP3 · M4A · WAV 등 · 최대 20MB (영상 파일은 업로드할 수 없습니다)</span>
              </div>
            </label>

            {(displayFileName || (uploading && uploadProgress !== null)) && (
              <div className="eval-post-write__file-status">
                {displayFileName && (
                  <div className="eval-post-write__file-name">{displayFileName}</div>
                )}
                {duration > 0 && displayFileName && !uploading && (
                  <div className="eval-post-write__file-meta">재생 길이 약 {formatDurationLabel(duration)}</div>
                )}
                {uploading && uploadProgress !== null && (
                  <div className="eval-post-write__progress-track" role="progressbar" aria-valuenow={Math.round(uploadProgress)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="eval-post-write__progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                {uploading && <span className="eval-post-write__uploading-label">업로드 중…</span>}
              </div>
            )}
          </section>

          <div className="eval-post-write__actions">
            <button
              type="button"
              className="submit-button eval-post-write__submit"
              onClick={handleRegisterClick}
              disabled={loading || uploading || !audioBlob}
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
              className="cancel-button eval-post-write__cancel"
              onClick={() => navigate('/evaluation')}
              disabled={loading}
            >
              <X size={18} aria-hidden />
              취소
            </button>
          </div>
        </main>
      </div>

      <EvaluationWriteNoticeModal
        open={showNoticeModal}
        loading={loading}
        onClose={() => {
          if (!loading) setShowNoticeModal(false);
        }}
        onConfirm={handleSubmit}
      />
    </div>
  );
};

export default EvaluationPostWrite; 