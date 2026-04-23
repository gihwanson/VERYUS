import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, limit, Timestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { List } from 'lucide-react';
import { db } from '../firebase';
import './AnonymousNoteBubble.css';
import { canManageAnonymousNotes } from './AdminTypes';

// 욕설 필터링 기본 금칙어 배열
const PROFANITY_FILTER = [
  '시발', '씨발', '개새끼', '병신', '미친', '좆', '젓', '좃', '지랄', '닥쳐',
  '죽어', '뒤져', '엿', '개같', '개돼지', '씹', '새끼', '놈', '년', '농',
  'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard', 'piss', 'crap'
];

// 하루 쿨다운 시간 (밀리초)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface AnonymousNote {
  id: string;
  text: string;
  createdAt: any;
  isActive: boolean;
  authorUid?: string;
  authorNickname?: string;
  publicNickname?: string;
}

/** 활성(24시간 이내)·비활성 쪽지 목록 — 만료 쪽지는 DB에서 비활성화 처리 */
async function fetchAnonymousNotesCatalog(): Promise<{
  active: AnonymousNote[];
  inactive: AnonymousNote[];
}> {
  const activeNotesQuery = query(
    collection(db, 'anonymousNotes'),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
    limit(500)
  );

  const inactiveNotesQuery = query(
    collection(db, 'anonymousNotes'),
    where('isActive', '==', false),
    orderBy('createdAt', 'desc'),
    limit(500)
  );

  const [activeSnapshot, inactiveSnapshot] = await Promise.all([
    getDocs(activeNotesQuery),
    getDocs(inactiveNotesQuery)
  ]);

  const allActiveNotes: AnonymousNote[] = [];
  const notesToDeactivate: string[] = [];

  activeSnapshot.docs.forEach(docSnapshot => {
    const data = docSnapshot.data();
    const note: AnonymousNote = {
      id: docSnapshot.id,
      ...data
    } as AnonymousNote;

    if (note.createdAt) {
      const createdAt = note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt);
      const diffMs = Date.now() - createdAt.getTime();

      if (diffMs > ONE_DAY_MS) {
        notesToDeactivate.push(docSnapshot.id);
      } else {
        allActiveNotes.push(note);
      }
    } else {
      notesToDeactivate.push(docSnapshot.id);
    }
  });

  if (notesToDeactivate.length > 0) {
    await Promise.all(
      notesToDeactivate.map(noteId =>
        updateDoc(doc(db, 'anonymousNotes', noteId), { isActive: false })
      )
    );
  }

  const allInactiveNotes: AnonymousNote[] = inactiveSnapshot.docs.map(docSnapshot => ({
    id: docSnapshot.id,
    ...docSnapshot.data()
  } as AnonymousNote));

  notesToDeactivate.forEach(noteId => {
    const deactivatedNote = activeSnapshot.docs.find(d => d.id === noteId);
    if (deactivatedNote) {
      allInactiveNotes.unshift({
        id: deactivatedNote.id,
        ...deactivatedNote.data()
      } as AnonymousNote);
    }
  });

  allInactiveNotes.sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return bDate.getTime() - aDate.getTime();
  });

  return { active: allActiveNotes, inactive: allInactiveNotes };
}

async function fetchAnonymousNotesCatalogFallback(): Promise<{
  active: AnonymousNote[];
  inactive: AnonymousNote[];
}> {
  const [activeQuery, inactiveQuery] = await Promise.all([
    getDocs(query(collection(db, 'anonymousNotes'), where('isActive', '==', true), limit(500))),
    getDocs(query(collection(db, 'anonymousNotes'), where('isActive', '==', false), limit(500)))
  ]);

  const validActiveNotes: AnonymousNote[] = [];
  activeQuery.docs.forEach(docSnapshot => {
    const data = docSnapshot.data();
    if (data.createdAt) {
      const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      const diffMs = Date.now() - createdAt.getTime();
      if (diffMs <= ONE_DAY_MS) {
        validActiveNotes.push({
          id: docSnapshot.id,
          ...data
        } as AnonymousNote);
      }
    }
  });

  const validInactiveNotes: AnonymousNote[] = inactiveQuery.docs.map(docSnapshot => ({
    id: docSnapshot.id,
    ...docSnapshot.data()
  } as AnonymousNote));

  return { active: validActiveNotes, inactive: validInactiveNotes };
}

async function loadNotesCatalogWithFallback(): Promise<{
  active: AnonymousNote[];
  inactive: AnonymousNote[];
}> {
  try {
    return await fetchAnonymousNotesCatalog();
  } catch (err: any) {
    console.error('쪽지 카탈로그 조회 실패:', err);
    if (err?.code === 'failed-precondition') {
      try {
        return await fetchAnonymousNotesCatalogFallback();
      } catch (err2) {
        console.error('간단 쿼리도 실패:', err2);
        return { active: [], inactive: [] };
      }
    }
    return { active: [], inactive: [] };
  }
}

const AnonymousNoteBubble: React.FC = () => {
  const [currentNote, setCurrentNote] = useState<AnonymousNote | null>(null);
  const [allNotes, setAllNotes] = useState<AnonymousNote[]>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminNotes, setAdminNotes] = useState<AnonymousNote[]>([]);
  const [adminInactiveNotes, setAdminInactiveNotes] = useState<AnonymousNote[]>([]);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [adminViewMode, setAdminViewMode] = useState<'active' | 'inactive' | 'all'>('active');
  const [showListModal, setShowListModal] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listActiveNotes, setListActiveNotes] = useState<AnonymousNote[]>([]);
  const [listInactiveNotes, setListInactiveNotes] = useState<AnonymousNote[]>([]);
  const [listError, setListError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rotationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 사용자 정보 가져오기
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const userData = JSON.parse(userString);
        setUser(userData);
        setIsAdmin(canManageAnonymousNotes(userData));
      } catch (err) {
        console.error('사용자 정보 파싱 실패:', err);
      }
    }
  }, []);

  // 하루가 지난 쪽지 비활성화 및 랜덤 쪽지 가져오기
  useEffect(() => {
    const fetchRandomNote = async () => {
      try {
        setLoading(true);
        
        // 24시간 이내의 쪽지만 가져오기
        const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - ONE_DAY_MS));
        
        // 먼저 모든 활성 쪽지를 가져와서 날짜 필터링
        const allNotesQuery = query(
          collection(db, 'anonymousNotes'),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          limit(500)
        );
        
        const snapshot = await getDocs(allNotesQuery);
        const allNotes: AnonymousNote[] = [];
        const notesToDeactivate: string[] = [];
        
        snapshot.docs.forEach(docSnapshot => {
          const data = docSnapshot.data();
          const note: AnonymousNote = {
            id: docSnapshot.id,
            ...data
          } as AnonymousNote;
          
          // createdAt이 있는 경우만 처리
          if (note.createdAt) {
            const createdAt = note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt);
            const now = new Date();
            const diffMs = now.getTime() - createdAt.getTime();
            
            // 24시간이 지났으면 비활성화 대상에 추가
            if (diffMs > ONE_DAY_MS) {
              notesToDeactivate.push(docSnapshot.id);
            } else {
              // 24시간 이내의 쪽지만 추가
              allNotes.push(note);
            }
          } else {
            // createdAt이 없으면 비활성화
            notesToDeactivate.push(docSnapshot.id);
          }
        });
        
        // 하루가 지난 쪽지들 비활성화
        if (notesToDeactivate.length > 0) {
          await Promise.all(
            notesToDeactivate.map(noteId => 
              updateDoc(doc(db, 'anonymousNotes', noteId), { isActive: false })
            )
          );
        }
        
        // 24시간 이내의 쪽지들을 배열로 저장
        if (allNotes.length > 0) {
          // 배열을 랜덤하게 섞기
          const shuffledNotes = [...allNotes].sort(() => Math.random() - 0.5);
          setAllNotes(shuffledNotes);
          setCurrentNoteIndex(0);
          setCurrentNote(shuffledNotes[0]);
        } else {
          // 기본 문구
          setAllNotes([]);
          setCurrentNoteIndex(0);
          setCurrentNote(null);
        }
      } catch (err: any) {
        console.error('익명 쪽지 가져오기 실패:', err);
        // 인덱스 에러인 경우 createdAt 없이 시도
        if (err?.code === 'failed-precondition') {
          try {
            const simpleQuery = query(
              collection(db, 'anonymousNotes'),
              where('isActive', '==', true),
              limit(200)
            );
            const snapshot = await getDocs(simpleQuery);
            const notes: AnonymousNote[] = [];
            
            snapshot.docs.forEach(docSnapshot => {
              const data = docSnapshot.data();
              const note: AnonymousNote = {
                id: docSnapshot.id,
                ...data
              } as AnonymousNote;
              
              if (note.createdAt) {
                const createdAt = note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt);
                const now = new Date();
                const diffMs = now.getTime() - createdAt.getTime();
                
                if (diffMs <= ONE_DAY_MS) {
                  notes.push(note);
                }
              }
            });
            
            if (notes.length > 0) {
              const shuffledNotes = [...notes].sort(() => Math.random() - 0.5);
              setAllNotes(shuffledNotes);
              setCurrentNoteIndex(0);
              setCurrentNote(shuffledNotes[0]);
            } else {
              setAllNotes([]);
              setCurrentNoteIndex(0);
              setCurrentNote(null);
            }
          } catch (err2) {
            console.error('간단 쿼리도 실패:', err2);
            setCurrentNote(null);
          }
        } else {
          setCurrentNote(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRandomNote();
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // 쪽지 자동 순환 (5초마다)
  useEffect(() => {
    if (allNotes.length > 1) {
      // 기존 인터벌 정리
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
      }

      // 5초마다 다음 쪽지로 변경
      rotationIntervalRef.current = setInterval(() => {
        setCurrentNoteIndex(prevIndex => {
          const nextIndex = (prevIndex + 1) % allNotes.length;
          setCurrentNote(allNotes[nextIndex]);
          return nextIndex;
        });
      }, 5000);

      return () => {
        if (rotationIntervalRef.current) {
          clearInterval(rotationIntervalRef.current);
        }
      };
    }
  }, [allNotes]);

  // 욕설 필터링 함수
  const containsProfanity = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return PROFANITY_FILTER.some(word => lowerText.includes(word.toLowerCase()));
  };

  // 입력 검증
  const validateInput = (text: string): string | null => {
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
      return '내용을 입력해주세요.';
    }
    
    if (trimmed.length > 50) {
      return '최대 50자까지 입력 가능합니다.';
    }
    
    // 공백만 있는지 확인
    if (trimmed.replace(/\s/g, '').length === 0) {
      return '공백만 입력할 수 없습니다.';
    }
    
    // 줄바꿈 제거
    if (text.includes('\n')) {
      return '줄바꿈은 사용할 수 없습니다.';
    }
    
    // 욕설 필터링
    if (containsProfanity(trimmed)) {
      return '부적절한 단어가 포함되어 있습니다.';
    }
    
    return null;
  };

  // 하루 쿨다운 체크
  const checkCooldown = (): boolean => {
    const lastSubmitTime = localStorage.getItem('anonymousNote_lastSubmit');
    const lastSubmitDate = localStorage.getItem('anonymousNote_lastSubmitDate');
    
    if (lastSubmitTime && lastSubmitDate) {
      const now = new Date();
      const lastDate = new Date(lastSubmitDate);
      
      // 같은 날인지 확인
      const isSameDay = 
        now.getFullYear() === lastDate.getFullYear() &&
        now.getMonth() === lastDate.getMonth() &&
        now.getDate() === lastDate.getDate();
      
      if (isSameDay) {
        const elapsed = Date.now() - parseInt(lastSubmitTime);
        if (elapsed < ONE_DAY_MS) {
          const remainingHours = Math.ceil((ONE_DAY_MS - elapsed) / (60 * 60 * 1000));
          setError(`하루에 한 번만 작성할 수 있습니다. ${remainingHours}시간 후에 다시 시도해주세요.`);
          return false;
        }
      }
    }
    return true;
  };

  // 중복 체크
  const checkDuplicate = async (text: string): Promise<boolean> => {
    try {
      const lastNote = localStorage.getItem('anonymousNote_lastText');
      if (lastNote === text.trim()) {
        setError('동일한 내용은 연속으로 등록할 수 없습니다.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('중복 체크 실패:', err);
      return true; // 에러 시 통과
    }
  };

  // 쪽지 등록
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 입력 검증
    const validationError = validateInput(inputText);
    if (validationError) {
      setError(validationError);
      return;
    }

    // 쿨다운 체크
    if (!checkCooldown()) {
      return;
    }

    // 중복 체크
    const trimmedText = inputText.trim();
    const isNotDuplicate = await checkDuplicate(trimmedText);
    if (!isNotDuplicate) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Firestore에 저장
      // 관리자만 볼 수 있도록 authorUid, authorNickname 저장 (일반 사용자에게는 보이지 않음)
      const noteData: any = {
        text: trimmedText,
        createdAt: serverTimestamp(),
        isActive: true
      };

      // 로그인한 사용자 정보가 있으면 작성자 정보 저장 (관리자 확인용)
      if (user?.uid && user?.nickname) {
        noteData.authorUid = user.uid;
        noteData.authorNickname = user.nickname;
        // 기존 쪽지와 구분하기 위해 신규 등록분만 공개 닉네임 필드를 기록한다.
        noteData.publicNickname = user.nickname;
      }

      await addDoc(collection(db, 'anonymousNotes'), noteData);

      // localStorage에 마지막 등록 시각, 날짜 및 텍스트 저장
      const now = Date.now();
      localStorage.setItem('anonymousNote_lastSubmit', now.toString());
      localStorage.setItem('anonymousNote_lastSubmitDate', new Date().toISOString());
      localStorage.setItem('anonymousNote_lastText', trimmedText);

      // 성공 처리
      setInputText('');
      setShowModal(false);
      setError('');
      
      // 랜덤 쪽지 다시 가져오기 (새로고침 효과)
      const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - ONE_DAY_MS));
      
      try {
        const notesQuery = query(
          collection(db, 'anonymousNotes'),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        
        const snapshot = await getDocs(notesQuery);
        const validNotes: AnonymousNote[] = [];
        
        snapshot.docs.forEach(docSnapshot => {
          const data = docSnapshot.data();
          if (data.createdAt) {
            const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const diffMs = Date.now() - createdAt.getTime();
            if (diffMs <= ONE_DAY_MS) {
              validNotes.push({
                id: docSnapshot.id,
                ...data
              } as AnonymousNote);
            }
          }
        });

        if (validNotes.length > 0) {
          const shuffledNotes = [...validNotes].sort(() => Math.random() - 0.5);
          setAllNotes(shuffledNotes);
          setCurrentNoteIndex(0);
          setCurrentNote(shuffledNotes[0]);
        }
      } catch (err) {
        console.error('쪽지 새로고침 실패:', err);
      }
    } catch (err) {
      console.error('쪽지 등록 실패:', err);
      setError('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // 쪽지 삭제 함수
  const handleDeleteNote = async (noteId: string) => {
    if (!isAdmin) return;
    
    if (!window.confirm('정말 이 쪽지를 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'anonymousNotes', noteId));
      
      // 목록에서 제거
      setAdminNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      
      // allNotes에서도 제거 (표시 중인 쪽지 목록)
      setAllNotes(prevNotes => {
        const updated = prevNotes.filter((note) => note.id !== noteId);
        
        // 현재 표시 중인 쪽지가 삭제된 경우 다음 쪽지로 변경
        if (updated.length > 0 && currentNote?.id === noteId) {
          setCurrentNoteIndex(0);
          setCurrentNote(updated[0]);
        } else if (updated.length === 0) {
          setCurrentNote(null);
        }
        
        return updated;
      });
    } catch (err) {
      console.error('쪽지 삭제 실패:', err);
      alert('쪽지 삭제 중 오류가 발생했습니다.');
    }
  };

  // 관리자 모달 열기
  const handleAdminModalOpen = async () => {
    if (!isAdmin) return;

    setShowAdminModal(true);
    setAdminLoading(true);
    setAdminViewMode('active');

    try {
      const { active, inactive } = await loadNotesCatalogWithFallback();
      setAdminNotes(active);
      setAdminInactiveNotes(inactive);
    } catch (err) {
      console.error('관리자 쪽지 목록 가져오기 실패:', err);
      setAdminNotes([]);
      setAdminInactiveNotes([]);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleOpenListModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowListModal(true);
    setListLoading(true);
    setListError('');
    try {
      const { active, inactive } = await loadNotesCatalogWithFallback();
      setListActiveNotes(active);
      setListInactiveNotes(inactive);
    } catch (err) {
      console.error('익명 쪽지 목록 로드 실패:', err);
      setListError('목록을 불러오지 못했습니다.');
      setListActiveNotes([]);
      setListInactiveNotes([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleCloseListModal = () => {
    setShowListModal(false);
    setListError('');
  };

  // 다음 쪽지로 변경 (클릭 시)
  const handleNextNote = () => {
    if (allNotes.length > 1) {
      setCurrentNoteIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % allNotes.length;
        setCurrentNote(allNotes[nextIndex]);
        return nextIndex;
      });
    }
  };

  // 모달 열기
  const handleBubbleClick = (e: React.MouseEvent) => {
    // 우클릭이면 관리자 모달 (관리자만)
    if (e.button === 2 || (e.ctrlKey && isAdmin)) {
      e.preventDefault();
      handleAdminModalOpen();
      return;
    }
    
    // 일반 클릭 시 다음 쪽지로 변경 (모달 열기 전)
    if (allNotes.length > 1) {
      handleNextNote();
    }
    
    setShowModal(true);
    setInputText('');
    setError('');
    // 모달 열릴 때 입력창에 포커스
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setShowModal(false);
    setInputText('');
    setError('');
  };

  // Enter 키 처리 (Shift+Enter는 막기)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 입력 변경 시 줄바꿈 자동 제거
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\n/g, '');
    if (value.length <= 50) {
      setInputText(value);
      setError(''); // 입력 시 에러 메시지 초기화
    }
  };

  return (
    <>
      <div className="anonymous-note-bubble-row">
        {/* 말풍선 */}
        <div
          className="anonymous-note-bubble"
          onClick={handleBubbleClick}
          onContextMenu={(e) => {
            if (isAdmin) {
              e.preventDefault();
              handleAdminModalOpen();
            }
          }}
          title={isAdmin ? "클릭: 쪽지 남기기 | 우클릭: 관리자 뷰" : "쪽지 남기기"}
        >
          <div className="bubble-content">
            {loading ? (
              <span className="bubble-loading">...</span>
            ) : (
              <>
                <span className="bubble-label">{currentNote?.publicNickname ? `${currentNote.publicNickname} 님이 보낸 쪽지입니다` : '익명이 보낸 쪽지입니다'}</span>
                <span className="bubble-text">{currentNote?.text || '익명 쪽지 남겨줘 🙂'}</span>
                <span className="bubble-hint">&lt;말풍선을 클릭하여 쪽지를 작성하세요&gt;</span>
              </>
            )}
          </div>
          <div className="bubble-tail"></div>
        </div>
        <button
          type="button"
          className="anonymous-note-list-toggle"
          onClick={handleOpenListModal}
          onMouseDown={(e) => e.stopPropagation()}
          title="활성·비활성 익명 쪽지 목록"
          aria-expanded={showListModal}
          aria-label="익명 쪽지 목록 보기"
        >
          <List size={20} strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {/* 모달 - Portal로 body에 직접 렌더링 */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="anonymous-note-modal-overlay" onClick={handleCloseModal}>
          <div className="anonymous-note-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>쪽지 남기기</h3>
              <button 
                className="modal-close-btn"
                onClick={handleCloseModal}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="input-container">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="남기고 싶은 말을 적어주세요 (최대 50자)"
                  maxLength={50}
                  className="note-input"
                  disabled={submitting}
                />
                <div className="char-count">
                  {inputText.length}/50
                </div>
              </div>
              
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              <div className="modal-buttons">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowModal(false);
                      handleAdminModalOpen();
                    }}
                    className="btn-admin"
                  >
                    관리자 뷰
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn-cancel"
                  disabled={submitting}
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={submitting || inputText.trim().length === 0}
                >
                  {submitting ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 익명 쪽지 목록 (일반 사용자) */}
      {showListModal && typeof document !== 'undefined' && createPortal(
        <div className="anonymous-note-modal-overlay" onClick={handleCloseListModal}>
          <div className="anonymous-note-modal user-notes-list-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>익명 쪽지 목록</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseListModal}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="user-notes-list-body">
              {listLoading ? (
                <div className="admin-loading">불러오는 중...</div>
              ) : listError ? (
                <div className="error-message user-notes-list-error">{listError}</div>
              ) : (
                <>
                  <section className="user-notes-section" aria-labelledby="user-notes-active-heading">
                    <h4 id="user-notes-active-heading" className="user-notes-section-title">
                      활성 쪽지
                      <span className="user-notes-count">({listActiveNotes.length})</span>
                    </h4>
                    {listActiveNotes.length === 0 ? (
                      <p className="user-notes-empty">현재 올라온 활성 쪽지가 없습니다.</p>
                    ) : (
                      <ul className="user-notes-ul">
                        {listActiveNotes.map(note => (
                          <li key={note.id} className="user-note-li user-note-li--active">
                            <p className="user-note-text">{note.text}</p>
                            <div className="user-note-footer">
                              <span className="user-note-anon">{note.publicNickname || '익명'}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="user-notes-section" aria-labelledby="user-notes-inactive-heading">
                    <h4 id="user-notes-inactive-heading" className="user-notes-section-title">
                      비활성 쪽지
                      <span className="user-notes-count">({listInactiveNotes.length})</span>
                    </h4>
                    {listInactiveNotes.length === 0 ? (
                      <p className="user-notes-empty">아직 비활성 쪽지가 없습니다.</p>
                    ) : (
                      <ul className="user-notes-ul">
                        {listInactiveNotes.map(note => (
                          <li key={note.id} className="user-note-li user-note-li--inactive">
                            <p className="user-note-text">{note.text}</p>
                            <div className="user-note-footer">
                              <span className="user-note-anon">{note.publicNickname || '익명'}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 관리자 모달 - Portal로 body에 직접 렌더링 */}
      {showAdminModal && isAdmin && typeof document !== 'undefined' && createPortal(
        <div className="anonymous-note-modal-overlay" onClick={() => setShowAdminModal(false)}>
          <div className="anonymous-note-modal admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>익명 쪽지 관리자 뷰</h3>
              <button 
                className="modal-close-btn"
                onClick={() => setShowAdminModal(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            
            {/* 뷰 모드 선택 탭 */}
            <div className="admin-view-tabs">
              <button
                className={`admin-tab ${adminViewMode === 'active' ? 'active' : ''}`}
                onClick={() => setAdminViewMode('active')}
              >
                활성 쪽지 ({adminNotes.length})
              </button>
              <button
                className={`admin-tab ${adminViewMode === 'inactive' ? 'active' : ''}`}
                onClick={() => setAdminViewMode('inactive')}
              >
                비활성 쪽지 ({adminInactiveNotes.length})
              </button>
              <button
                className={`admin-tab ${adminViewMode === 'all' ? 'active' : ''}`}
                onClick={() => setAdminViewMode('all')}
              >
                전체 ({adminNotes.length + adminInactiveNotes.length})
              </button>
            </div>
            
            <div className="admin-notes-list">
              {adminLoading ? (
                <div className="admin-loading">로딩 중...</div>
              ) : (() => {
                const notesToShow = adminViewMode === 'active' 
                  ? adminNotes 
                  : adminViewMode === 'inactive' 
                  ? adminInactiveNotes 
                  : [...adminNotes, ...adminInactiveNotes];
                
                if (notesToShow.length === 0) {
                  return <div className="admin-empty">등록된 쪽지가 없습니다.</div>;
                }
                
                return (
                  <div className="admin-notes-container">
                    {notesToShow.map((note) => {
                      const isInactive = !note.isActive || adminInactiveNotes.some(n => n.id === note.id);
                      return (
                        <div key={note.id} className={`admin-note-item ${isInactive ? 'inactive' : ''}`}>
                          {isInactive && <div className="admin-note-badge">비활성</div>}
                          <div className="admin-note-text">{note.text}</div>
                          <div className="admin-note-meta">
                            <div className="admin-note-meta-left">
                              {note.authorNickname ? (
                                <span className="admin-note-author">
                                  작성자: <strong>{note.authorNickname}</strong>
                                  {note.authorUid && <span className="admin-note-uid"> ({note.authorUid.substring(0, 8)}...)</span>}
                                </span>
                              ) : (
                                <span className="admin-note-author anonymous">익명</span>
                              )}
                              {note.createdAt && (
                                <span className="admin-note-date">
                                  {note.createdAt.toDate ? 
                                    new Date(note.createdAt.toDate()).toLocaleString('ko-KR') : 
                                    '날짜 없음'}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="admin-note-delete-btn"
                              title="쪽지 삭제"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default AnonymousNoteBubble;
