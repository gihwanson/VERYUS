import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const ContestResults: React.FC = () => {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => setContest(snap.exists() ? { id: snap.id, ...snap.data() } : null));
    // 전체 심사결과 불러오기
    getDocs(collection(db, 'contests', id, 'grades')).then(snap => setGrades(snap.docs.map(doc => doc.data())));
  }, [id]);

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  if (contest?.type === '등급평가' && (!user || user.role !== '리더' || user.nickname !== '너래')) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>등급전 결과는 리더(너래)만 확인할 수 있습니다.</div>;
  }

  // 참가자별 평균점수/등급/코멘트 계산
  const participantMap: Record<string, { scores: number[], comments: string[] }> = {};
  grades.forEach(g => {
    if (!participantMap[g.target]) participantMap[g.target] = { scores: [], comments: [] };
    participantMap[g.target].scores.push(Number(g.score));
    if (g.comment) participantMap[g.target].comments.push(g.comment);
  });
  const getGrade = (avg: number) => {
    if (avg >= 1 && avg <= 30) return '🫐 블루베리';
    if (avg <= 40) return '🥝 키위';
    if (avg <= 50) return '🍎 사과';
    if (avg <= 60) return '🍈 멜론';
    if (avg <= 70) return '🍉 수박';
    if (avg <= 80) return '🌍 지구';
    if (avg <= 90) return '🪐 토성';
    if (avg <= 100) return '☀️ 태양';
    return '';
  };

  // 부운영진 평가만 모으기
  const subAdmins = grades.filter(g => g.evaluatorRole === '부운영진');

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24 }}>{contest.title} 결과</h2>
      <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 12 }}>{contest.type}</div>
      <div style={{ color: '#B497D6', fontSize: 14, marginBottom: 24 }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
      <div style={{ marginBottom: 24 }}>
        {/* 참가자별 평균점수/등급/코멘트 구조만 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, overflowX: 'auto', display: 'block' }}>
          <thead>
            <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>닉네임</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평균점수</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(participantMap).map(([nickname, { scores, comments }]) => {
              const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
              return (
                <tr key={nickname}>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{nickname}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? avg.toFixed(1) : '-'}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? getGrade(avg) : '-'}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{comments.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contest.type === '경연' && <div style={{ color: '#7C4DBC', fontWeight: 600 }}>※ 경연 모드: 점수순 랭킹/등급 부여 안내</div>}
      </div>
      {grades.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>전체 심사결과</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, overflowX: 'auto', display: 'block' }}>
            <thead>
              <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g, i) => (
                <tr key={i}>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.evaluator}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.target}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.score}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{g.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 부운영진 평가 결과 별도 표 */}
          {subAdmins.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h3 style={{ color: '#F43F5E', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>부운영진 평가 결과</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, overflowX: 'auto', display: 'block' }}>
                <thead>
                  <tr style={{ background: '#F6F2FF', color: '#F43F5E' }}>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>부운영진</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {subAdmins.map((g, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.evaluator}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.target}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.score}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{g.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {isAdmin && <div style={{ marginTop: 24, color: '#8A55CC', fontWeight: 600 }}>관리자: 전체 평가내역 확인 기능 예정</div>}
    </div>
  );
};

export default ContestResults; 