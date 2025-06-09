import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface User {
  uid: string;
  nickname: string;
  email: string;
  grade?: string;
  role?: string;
}

interface ActivityRow {
  uid: string;
  nickname: string;
  email: string;
  postCount: number;
  commentCount: number;
  likeGiven: number;
  score: number;
  grade?: string;
  role?: string;
}

const UserActivityBoard: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // 1. 모든 유저
      const usersSnap = await getDocs(collection(db, 'users'));
      const users: User[] = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
      // 2. 모든 게시글
      const postsSnap = await getDocs(collection(db, 'posts'));
      const postCounts: Record<string, number> = {};
      // 좋아요 집계용
      const likeGivenCounts: Record<string, number> = {};
      postsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.writerUid) {
          postCounts[data.writerUid] = (postCounts[data.writerUid] || 0) + 1;
        }
        // 좋아요: 본인 게시글 제외, likes 배열에 있는 uid별로 카운트
        if (Array.isArray(data.likes) && data.writerUid) {
          data.likes.forEach((uid: string) => {
            if (uid !== data.writerUid) {
              likeGivenCounts[uid] = (likeGivenCounts[uid] || 0) + 1;
            }
          });
        }
      });
      // 3. 모든 댓글
      const commentsSnap = await getDocs(collection(db, 'comments'));
      const commentCounts: Record<string, number> = {};
      commentsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.writerUid) {
          commentCounts[data.writerUid] = (commentCounts[data.writerUid] || 0) + 1;
        }
      });
      // 4. 합산
      const activityRows: ActivityRow[] = users.map(user => {
        const postCount = postCounts[user.uid] || 0;
        const commentCount = commentCounts[user.uid] || 0;
        const likeGiven = likeGivenCounts[user.uid] || 0;
        return {
          uid: user.uid,
          nickname: user.nickname,
          email: user.email,
          postCount,
          commentCount,
          likeGiven,
          score: postCount * 2 + commentCount + likeGiven,
          grade: user.grade,
          role: user.role,
        };
      });
      // 5. 점수순 정렬
      activityRows.sort((a, b) => b.score - a.score);
      setRows(activityRows);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24, marginBottom: 24 }}>유저 활동 점수판</h2>
      {loading ? (
        <div style={{ textAlign: 'center', color: '#8A55CC', fontWeight: 600 }}>불러오는 중...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
          <thead>
            <tr style={{ background: '#F6F2FF' }}>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>닉네임</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>등급</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>역할</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>게시글</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>댓글</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>좋아요</th>
              <th style={{ padding: 8, borderBottom: '2px solid #E5DAF5' }}>활동점수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.uid}>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5' }}>{row.nickname}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5' }}>{row.grade || '-'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5' }}>{row.role || '-'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5', textAlign: 'right' }}>{row.postCount}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5', textAlign: 'right' }}>{row.commentCount}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5', textAlign: 'right' }}>{row.likeGiven}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #E5DAF5', textAlign: 'right', fontWeight: 700, color: '#8A55CC' }}>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UserActivityBoard; 