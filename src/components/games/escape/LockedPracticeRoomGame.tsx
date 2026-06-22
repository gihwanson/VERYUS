import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  CODES,
  HINTS,
  HOTSPOTS,
  INTRO_CARDS,
  ITEMS,
  type HotspotId,
  type ItemId,
  calcGrade,
  calcRankScore,
  formatElapsed,
  LOCKED_PRACTICE_ROOM_AVAILABLE,
} from '../../../data/lockedPracticeRoom';
import { detectGamePlatform, type GamePlatform } from '../../../utils/gamePlatform';
import {
  saveEscapeRoomBestScore,
  type EscapeRoomBestScore,
} from '../../../utils/escapeRoomScores';
import { setLastPlayedGame } from '../../../utils/lastPlayedGame';
import { playGameComplete, playNewRecord, unlockGameAudio } from '../../../utils/gameSounds';

type Phase = 'intro' | 'play' | 'cleared';
type CodeTarget = 'bag' | 'drawer' | 'door' | null;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

interface InspectState {
  title: string;
  body: string;
}

const CODE_LENGTH: Record<Exclude<CodeTarget, null>, number> = {
  bag: 2,
  drawer: 4,
  door: 4,
};

const LockedPracticeRoomUnavailable: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="games-page">
      <div className="games-content">
        <header className="games-header">
          <button type="button" className="games-back-btn" onClick={() => navigate('/games')}>
            ← 게임 목록
          </button>
        </header>
        <div className="typing-game-panel escape-panel">
          <div className="escape-intro-card">
            <p className="escape-intro-step">🔐 잠긴 연습실</p>
            <p className="escape-intro-text">
              이 협동전은 아직 개발 중입니다.
              <br />
              오픈되면 게임 목록에서 다시 도전할 수 있어요.
            </p>
            <div className="typing-actions">
              <button
                type="button"
                className="typing-btn typing-btn-primary"
                onClick={() => navigate('/games')}
              >
                게임 목록으로
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LockedPracticeRoomGameContent: React.FC = () => {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [platform] = useState<GamePlatform>(detectGamePlatform);
  const [phase, setPhase] = useState<Phase>('intro');
  const [introStep, setIntroStep] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [clearedAt, setClearedAt] = useState(0);

  const [inventory, setInventory] = useState<ItemId[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemId | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ampMoved, setAmpMoved] = useState(false);
  const [whiteboardMemo, setWhiteboardMemo] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);

  const [metronomeFlipped, setMetronomeFlipped] = useState(false);

  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [usedHintIds, setUsedHintIds] = useState<string[]>([]);
  const [showHintPicker, setShowHintPicker] = useState(false);

  const [inspect, setInspect] = useState<InspectState | null>(null);
  const [codeTarget, setCodeTarget] = useState<CodeTarget>(null);
  const [codeInput, setCodeInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [bestScores, setBestScores] = useState<EscapeRoomBestScore[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<GamePlatform>(platform);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConfettiMsg, setShowConfettiMsg] = useState(false);

  const clearTimeSec = useMemo(() => {
    if (!startedAt || !clearedAt) return 0;
    return Math.max(1, Math.round((clearedAt - startedAt) / 1000));
  }, [clearedAt, startedAt]);

  const rankScore = useMemo(
    () => calcRankScore(clearTimeSec, hintsUsed, wrongAttempts),
    [clearTimeSec, hintsUsed, wrongAttempts]
  );

  const grade = useMemo(
    () => calcGrade(hintsUsed, wrongAttempts),
    [hintsUsed, wrongAttempts]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const addWrong = useCallback(() => {
    setWrongAttempts((n) => n + 1);
  }, []);

  const hasItem = useCallback((id: ItemId) => inventory.includes(id), [inventory]);

  const addItem = useCallback((id: ItemId) => {
    setInventory((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  useEffect(() => {
    setLastPlayedGame('locked-practice-room');
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'escapeRoom', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<EscapeRoomBestScore, 'id'>),
          }))
        );
      },
      (err) => {
        console.error('순위표 불러오기 실패:', err);
        setLoadError('순위표를 불러오지 못했습니다.');
      }
    );
    return () => unsub();
  }, []);

  const leaderboard = useMemo(
    () =>
      bestScores
        .filter((s) => s.platform === leaderboardTab)
        .sort((a, b) => a.rankScore - b.rankScore),
    [bestScores, leaderboardTab]
  );

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user?.uid]);

  const resetGame = useCallback(() => {
    setPhase('intro');
    setIntroStep(0);
    setStartedAt(0);
    setClearedAt(0);
    setInventory([]);
    setSelectedItem(null);
    setBagOpen(false);
    setDrawerOpen(false);
    setAmpMoved(false);
    setWhiteboardMemo(false);
    setFlashlightOn(false);
    setMetronomeFlipped(false);
    setWrongAttempts(0);
    setHintsUsed(0);
    setUsedHintIds([]);
    setInspect(null);
    setCodeTarget(null);
    setCodeInput('');
    setSaveStatus('idle');
    setSaveDetail(null);
    setShowConfettiMsg(false);
  }, []);

  const saveScore = useCallback(async () => {
    if (!user?.uid || !user?.nickname) {
      setSaveStatus('skipped');
      setSaveDetail('로그인 정보가 없어 기록을 저장하지 못했습니다.');
      return;
    }

    setSaveStatus('saving');
    try {
      const result = await saveEscapeRoomBestScore({
        uid: user.uid,
        nickname: user.nickname,
        rankScore,
        clearTimeSec,
        hintsUsed,
        wrongAttempts,
        grade,
        platform,
      });
      setSaveStatus('saved');
      setLeaderboardTab(platform);
      if (result.isNewBest) {
        playNewRecord();
        setShowConfettiMsg(true);
      }
      setSaveDetail(
        result.isNewBest
          ? `${platform === 'pc' ? 'PC' : '모바일'} 최고 점수 갱신!`
          : `최고 점수 ${result.bestRankScore}점 유지`
      );
    } catch (e) {
      console.error('기록 저장 실패:', e);
      setSaveStatus('error');
      setSaveDetail(
        e instanceof Error ? e.message : '기록 저장에 실패했습니다.'
      );
    }
  }, [clearTimeSec, grade, hintsUsed, platform, rankScore, user, wrongAttempts]);

  const finishClear = useCallback(() => {
    const now = Date.now();
    setClearedAt(now);
    setPhase('cleared');
    playGameComplete();
    void saveScore();
  }, [saveScore]);

  const startPlay = useCallback(() => {
    unlockGameAudio();
    setStartedAt(Date.now());
    setPhase('play');
    setInspect({
      title: '연습실',
      body: '비상등만 켜진 어두운 연습실이다. 뭔가를 조사해 보자.',
    });
  }, []);

  const openCodeModal = (target: CodeTarget) => {
    setCodeTarget(target);
    setCodeInput('');
  };

  const submitCode = () => {
    if (!codeTarget) return;
    const answer = codeInput.trim();

    if (codeTarget === 'bag') {
      if (answer === CODES.bag) {
        setBagOpen(true);
        addItem('metronome_card');
        setCodeTarget(null);
        showToast('가방이 열렸다! 메트로놈 카드를 얻었다.');
      } else {
        addWrong();
        showToast('자물쇠가 열리지 않는다.');
      }
      return;
    }

    if (codeTarget === 'drawer') {
      if (answer === CODES.drawer) {
        setDrawerOpen(true);
        addItem('magnet_key');
        setCodeTarget(null);
        showToast('서랍이 열렸다! 자석 열쇠를 얻었다.');
      } else {
        addWrong();
        showToast('서랍이 열리지 않는다.');
      }
      return;
    }

    if (codeTarget === 'door') {
      if (answer === CODES.door) {
        setCodeTarget(null);
        finishClear();
        return;
      }
      if (answer === CODES.fakeChair) {
        addWrong();
        showToast('…누가 장난으로 붙여 둔 메모였다.');
        return;
      }
      if (answer === CODES.trapDoor) {
        addWrong();
        showToast('전자록: 「코드 불완전」');
        return;
      }
      addWrong();
      showToast('전자록이 빨갛게 깜빡인다. 틀린 코드다.');
    }
  };

  const useHint = (hintId: string, text: string) => {
    if (usedHintIds.includes(hintId)) return;
    setUsedHintIds((prev) => [...prev, hintId]);
    setHintsUsed((n) => n + 1);
    setShowHintPicker(false);
    setInspect({ title: '힌트', body: text });
  };

  const inspectHotspot = (id: HotspotId) => {
    setInspect(null);

    if (selectedItem === 'magnet_key' && id === 'whiteboard') {
      setSelectedItem(null);
      if (!whiteboardMemo) {
        setWhiteboardMemo(true);
        setInspect({
          title: '화이트보드 — 떨어진 메모',
          body:
            '자석 열쇠로 클립에 붙어 있던 메모가 떨어졌다.\n\n' +
            '「문은 시계를 봐.\n' +
            '① 시침이 가리키는 시 = 첫째\n' +
            '② 분 ÷ 5 = 둘째\n' +
            '③ BPM 끝자리 = 셋째\n' +
            '④ 서랍 비번 끝자리 = 넷째」\n\n' +
            '…7328? 문에 넣어 보면 반응이 있을지도.',
        });
      }
      return;
    }

    switch (id) {
      case 'door':
        openCodeModal('door');
        break;

      case 'bag':
        if (bagOpen) {
          setInspect({
            title: '가방',
            body: '이미 열린 가방이다. 안은 비어 있다.',
          });
        } else {
          setInspect({
            title: '가방',
            body:
              '잠긴 가방이다. 옆 메모: 「오늘 연습 곡 템포. 가방 비번은 BPM 두 자리야.」\n\n가방을 눌러 비밀번호를 입력해 보자.',
          });
          openCodeModal('bag');
        }
        break;

      case 'desk':
        if (drawerOpen) {
          setInspect({
            title: '책상',
            body:
              '서랍은 열려 있다. 책상 가장자리 스티커: 「연습실 No.9」\n\n앰프 뒤 단서와 함께 생각해 보자.',
          });
        } else {
          setInspect({
            title: '책상 · 서랍',
            body: '서랍이 잠겨 있다. 4자리 비밀번호가 필요하다.',
          });
          openCodeModal('drawer');
        }
        break;

      case 'keyboard':
        setInspect({
          title: '키보드',
          body:
            '건반에 스티커가 붙어 있다.\n\n' +
            '왼쪽부터: [9] · [1] · [8] · [?] [?]\n' +
            '가운데 점(·)은 빈 칸을 뜻한다.\n\n' +
            '메트로놈 카드 뒷면 힌트와 함께 보면 좋겠다.',
        });
        break;

      case 'whiteboard':
        if (whiteboardMemo) {
          setInspect({
            title: '화이트보드',
            body: '메모는 이미 떨어뜨렸다. 시계와 앰프 단서를 이어 보자.',
          });
        } else if (hasItem('magnet_key')) {
          setInspect({
            title: '화이트보드',
            body: '지워진 흔적이 보인다. 인벤토리에서 자석 열쇠를 선택한 뒤 다시 눌러 보자.',
          });
        } else {
          setInspect({
            title: '화이트보드',
            body: '마커로 뭔가 썼던 흔적이 있다. 거의 안 보인다.',
          });
        }
        break;

      case 'clock':
        setInspect({
          title: '시계',
          body: '시계가 멈춰 있다.\n\n시침: 7시 방향\n분침: 15분 (3시 방향)\n\n화이트보드 메모의 ①②에 해당한다.',
        });
        break;

      case 'amp':
        if (!drawerOpen) {
          setInspect({
            title: '앰프',
            body: '무겁게 고정되어 있다. 당장은 옮길 수 없을 것 같다.',
          });
        } else if (!ampMoved) {
          setAmpMoved(true);
          setInspect({
            title: '앰프',
            body: '앰프를 살짝 옮겼다. 뒤에 반쩍 찢긴 스티커가 있다.\n\n[7] [3] [?] [1]\n「마지막 자리 = 연습실 번호」\n\n책상의 No.9와 연결해 보자.',
          });
        } else {
          setInspect({
            title: '앰프 뒤',
            body: '스티커: [7] [3] [?] [1]\n연습실 번호는 책상에 있다.',
          });
        }
        break;

      case 'chair':
        setInspect({
          title: '의자',
          body:
            '의자 밑에 누군가 붙여 둔 메모: 「4382」\n\n…문에 써 볼 수는 있겠다. 진짜일까?',
        });
        break;

      case 'trash':
        setInspect({
          title: '휴지통',
          body: '찢어진 영수증에 「9210」이라고 적혀 있다. 서랍 비번과 비슷해 보이지만 다르다.',
        });
        break;

      case 'phone':
        setFlashlightOn((on) => {
          const next = !on;
          setInspect({
            title: '핸드폰',
            body: next
              ? '손전등을 켰다. 어두운 곳 조사에 도움이 될 것 같다.'
              : '손전등을 껐다.',
          });
          return next;
        });
        break;

      default:
        break;
    }
  };

  const inspectItem = (itemId: ItemId) => {
    const item = ITEMS[itemId];
    if (itemId === 'metronome_card') {
      setInspect({
        title: item.label,
        body: metronomeFlipped
          ? '뒷면: 「서랍 비번은 앞두 자리 + 뒤두 자리. BPM은 가운데에 끼워 넣어.」\n\n앞면으로 뒤집기를 눌러 보세요.'
          : '앞면: BPM 92 · 4/4\n\n뒷면을 보려면 아래 버튼을 누르세요.',
      });
      return;
    }
    setInspect({ title: item.label, body: item.inspect });
  };

  const appendCodeDigit = (digit: string) => {
    if (!codeTarget) return;
    const max = CODE_LENGTH[codeTarget];
    setCodeInput((prev) => (prev.length >= max ? prev : prev + digit));
  };

  return (
    <div className={`games-page escape-room-page${flashlightOn ? ' escape-room-page--flashlight' : ''}`}>
      <div className="games-content">
        <header className="games-header">
          <button type="button" className="games-back-btn" onClick={() => navigate('/games')}>
            ← 게임 목록
          </button>
        </header>

        <h1 className="games-title" style={{ marginBottom: 8 }}>
          잠긴 연습실
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 16 }}>
          단서를 모아 문을 열어라. 시간 제한 없음.
        </p>

        {toast && (
          <div className="escape-toast" role="status">
            {toast}
          </div>
        )}

        {phase === 'intro' && (
          <div className="typing-game-panel escape-panel">
            <div className="escape-intro-card">
              <p className="escape-intro-step">
                {introStep + 1} / {INTRO_CARDS.length}
              </p>
              <p className="escape-intro-text">{INTRO_CARDS[introStep]}</p>
              <div className="typing-actions">
                {introStep > 0 && (
                  <button
                    type="button"
                    className="typing-btn typing-btn-secondary"
                    onClick={() => setIntroStep((s) => s - 1)}
                  >
                    이전
                  </button>
                )}
                {introStep < INTRO_CARDS.length - 1 ? (
                  <button
                    type="button"
                    className="typing-btn typing-btn-primary"
                    onClick={() => setIntroStep((s) => s + 1)}
                  >
                    다음
                  </button>
                ) : (
                  <button type="button" className="typing-btn typing-btn-primary" onClick={startPlay}>
                    조사 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'play' && (
          <div className="typing-game-panel escape-panel">
            <div className="escape-status-bar">
              <span className="escape-status-pill">💡 비상등</span>
              <button
                type="button"
                className="escape-status-pill escape-status-pill--btn"
                onClick={() => setShowHintPicker(true)}
              >
                ? 힌트 {hintsUsed}/{HINTS.length}
              </button>
              <span className="escape-status-pill">오답 {wrongAttempts}</span>
            </div>

            <div className="escape-inventory" aria-label="인벤토리">
              {[0, 1, 2, 3].map((slot) => {
                const itemId = inventory[slot];
                const item = itemId ? ITEMS[itemId] : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`escape-inv-slot${selectedItem === itemId ? ' escape-inv-slot--selected' : ''}${item ? '' : ' escape-inv-slot--empty'}`}
                    disabled={!item}
                    onClick={() => {
                      if (!itemId) return;
                      setSelectedItem((cur) => (cur === itemId ? null : itemId));
                      inspectItem(itemId);
                    }}
                    title={item?.label}
                  >
                    {item ? item.emoji : '·'}
                  </button>
                );
              })}
            </div>

            {selectedItem && (
              <p className="escape-selected-hint">
                선택: {ITEMS[selectedItem].label} — 사용할 곳을 누르세요
              </p>
            )}

            <div className="escape-room-grid">
              {HOTSPOTS.map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  className={`escape-hotspot${spot.id === 'door' && drawerOpen ? ' escape-hotspot--goal' : ''}${spot.id === 'amp' && ampMoved ? ' escape-hotspot--found' : ''}`}
                  onClick={() => inspectHotspot(spot.id)}
                >
                  <span className="escape-hotspot-emoji">{spot.emoji}</span>
                  <span className="escape-hotspot-label">{spot.label}</span>
                </button>
              ))}
            </div>

            {inspect && (
              <div className="escape-inspect">
                <h3>{inspect.title}</h3>
                <p>{inspect.body}</p>
                {inspect.title === ITEMS.metronome_card.label && (
                  <button
                    type="button"
                    className="typing-btn typing-btn-secondary"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setMetronomeFlipped((f) => {
                        const next = !f;
                        setInspect({
                          title: ITEMS.metronome_card.label,
                          body: next
                            ? '뒷면: 「서랍 비번은 앞두 자리 + 뒤두 자리. BPM은 가운데에 끼워 넣어.」'
                            : '앞면: BPM 92 · 4/4',
                        });
                        return next;
                      });
                    }}
                  >
                    {metronomeFlipped ? '앞면 보기' : '뒷면 보기'}
                  </button>
                )}
              </div>
            )}

            <div className="typing-actions">
              <button type="button" className="typing-btn typing-btn-secondary" onClick={resetGame}>
                포기
              </button>
            </div>
          </div>
        )}

        {phase === 'cleared' && (
          <div className="typing-game-panel escape-panel">
            <div className="typing-result typing-result--pop">
              <h4>탈출 성공!</h4>
              <p className="escape-grade">등급 {grade}</p>
              <p>소요 {formatElapsed(clearTimeSec)} · 점수 {rankScore}점 (낮을수록 좋음)</p>
              <p>
                힌트 {hintsUsed}회 · 오답 {wrongAttempts}회
                {saveDetail ? ` · ${saveDetail}` : ''}
              </p>
              {showConfettiMsg && (
                <p style={{ color: '#fde68a', fontWeight: 700 }}>🎉 신기록!</p>
              )}
              <p className="escape-ending">
                문이 열리자 복도에서 「아, 또 전기 나갔어?」 하는 목소리가 들린다…
              </p>
            </div>
            <div className="typing-actions">
              <button type="button" className="typing-btn typing-btn-primary" onClick={resetGame}>
                다시 플레이
              </button>
              <button
                type="button"
                className="typing-btn typing-btn-secondary"
                onClick={() => navigate('/games')}
              >
                게임 목록
              </button>
            </div>
          </div>
        )}

        {codeTarget && (
          <div className="escape-modal-backdrop" role="presentation" onClick={() => setCodeTarget(null)}>
            <div
              className="escape-code-modal"
              role="dialog"
              aria-label="비밀번호 입력"
              onClick={(e) => e.stopPropagation()}
            >
              <h3>
                {codeTarget === 'bag' && '가방 자물쇠'}
                {codeTarget === 'drawer' && '서랍 자물쇠'}
                {codeTarget === 'door' && '문 전자록'}
              </h3>
              <div className="escape-code-display" aria-live="polite">
                {codeInput.padEnd(CODE_LENGTH[codeTarget], '○').split('').map((ch, i) => (
                  <span key={i} className="escape-code-char">
                    {ch}
                  </span>
                ))}
              </div>
              <div className="escape-keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="escape-keypad-btn"
                    onClick={() => {
                      if (key === '⌫') setCodeInput((p) => p.slice(0, -1));
                      else if (key === '✓') submitCode();
                      else appendCodeDigit(key);
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showHintPicker && (
          <div className="escape-modal-backdrop" role="presentation" onClick={() => setShowHintPicker(false)}>
            <div className="escape-hint-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
              <h3>힌트 (+60점 패널티)</h3>
              <ul className="escape-hint-list">
                {HINTS.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="escape-hint-btn"
                      disabled={usedHintIds.includes(h.id)}
                      onClick={() => useHint(h.id, h.text)}
                    >
                      {h.label}
                      {usedHintIds.includes(h.id) ? ' (사용함)' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <section className="typing-leaderboard">
          <h3>탈출 순위</h3>
          <p className="games-category-subtitle" style={{ marginBottom: 12 }}>
            점수가 낮을수록 좋습니다 (시간 + 힌트·오답 패널티)
          </p>
          <div className="typing-platform-tabs">
            <button
              type="button"
              className={`typing-platform-tab${leaderboardTab === 'pc' ? ' active' : ''}`}
              onClick={() => setLeaderboardTab('pc')}
            >
              🖥️ PC
            </button>
            <button
              type="button"
              className={`typing-platform-tab${leaderboardTab === 'mobile' ? ' active' : ''}`}
              onClick={() => setLeaderboardTab('mobile')}
            >
              📱 모바일
            </button>
          </div>
          {loadError && <p className="typing-empty" style={{ color: '#fecaca' }}>{loadError}</p>}
          {!loadError && leaderboard.length === 0 ? (
            <p className="typing-empty">아직 기록이 없습니다. 첫 탈출에 도전해 보세요!</p>
          ) : (
            !loadError && (
              <ul className="typing-rank-list">
                {leaderboard.slice(0, 15).map((entry, idx) => {
                  const isMe = user?.uid === entry.uid;
                  const rankClass = idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
                  return (
                    <li key={entry.id} className={`typing-rank-item${isMe ? ' is-me' : ''}`}>
                      <span className={`typing-rank-num ${rankClass}`}>{idx + 1}</span>
                      <div className="typing-rank-info">
                        <div className="typing-rank-name">
                          {entry.nickname}
                          {isMe ? ' (나)' : ''}
                        </div>
                        <div className="typing-rank-meta">
                          {formatElapsed(entry.clearTimeSec)} · 힌트 {entry.hintsUsed} · 등급 {entry.grade}
                        </div>
                      </div>
                      <span className="typing-rank-score">{entry.rankScore}점</span>
                    </li>
                  );
                })}
              </ul>
            )
          )}
          {saveStatus === 'saved' && myRank && leaderboardTab === platform && phase === 'cleared' && (
            <p className="typing-empty">현재 순위: {myRank}위</p>
          )}
        </section>
      </div>
    </div>
  );
};

const LockedPracticeRoomGame: React.FC = () => {
  if (!LOCKED_PRACTICE_ROOM_AVAILABLE) {
    return <LockedPracticeRoomUnavailable />;
  }
  return <LockedPracticeRoomGameContent />;
};

export default LockedPracticeRoomGame;
