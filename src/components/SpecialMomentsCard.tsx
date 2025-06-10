import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, limit, addDoc, Timestamp } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Moment {
  id: string;
  url: string;
  type: 'image' | 'video';
  description?: string;
  createdAt?: any;
  uploadedBy?: string;
}

const SpecialMomentsCard: React.FC = () => {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Moment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && (user.role === '리더' || user.role === '운영진');

  const fetchMoments = async () => {
    const q = query(collection(db, 'specialMoments'), orderBy('createdAt', 'desc'), limit(6));
    const snap = await getDocs(q);
    setMoments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Moment[]);
  };

  useEffect(() => {
    fetchMoments();
  }, []);

  // Storage 업로드 및 Firestore 저장
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const description = window.prompt('사진/영상에 대한 간단한 설명을 입력하세요 (선택)') || '';
    setUploading(true);
    try {
      // 1. Storage 업로드
      const storageRef = ref(storage, `specialMoments/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // 2. Firestore 저장
      await addDoc(collection(db, 'specialMoments'), {
        url,
        type,
        description,
        createdAt: Timestamp.now(),
        uploadedBy: user.nickname || user.email || '',
      });
      await fetchMoments();
      alert('업로드가 완료되었습니다!');
    } catch (err) {
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="special-moments-card" style={{ background: '#F6F2FF', borderRadius: 18, boxShadow: '0 2px 12px #E5DAF5', padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, margin: 0 }}>베리어스의 특별한 순간들</h3>
        {isAdmin && (
          <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', color: '#8A55CC', fontWeight: 600, fontSize: 15, opacity: uploading ? 0.5 : 1 }}>
            {uploading ? '업로드 중...' : '+ 업로드'}
            <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
      <div className="moments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
        {moments.length === 0 ? (
          <div style={{ color: '#B497D6', textAlign: 'center', gridColumn: '1/-1', padding: 24 }}>아직 등록된 순간이 없습니다.</div>
        ) : (
          <>
            {moments.slice(0, 4).map(m => (
              <div key={m.id} className="moment-thumb" style={{ cursor: 'pointer', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 4px #E5DAF5', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={() => { setSelected(m); setModalOpen(true); }}>
                {m.type === 'image' ? (
                  <img src={m.url} alt={m.description || '특별한 순간'} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <video src={m.url} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} muted />
                )}
                <div style={{ fontSize: 13, color: '#7C4DBC', marginTop: 4, width: '100%', textAlign: 'center', minHeight: 18 }}>{m.description || ''}</div>
              </div>
            ))}
            {moments.length > 4 && (
              <button
                onClick={() => setShowAllModal(true)}
                style={{ gridColumn: '1/-1', marginTop: 8, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              >
                전체보기
              </button>
            )}
          </>
        )}
      </div>
      {/* 개별 사진 모달 */}
      {modalOpen && selected && (
        <div className="moments-modal" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, maxWidth: 420, width: '90vw', maxHeight: '80vh', overflow: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalOpen(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: 22, color: '#8A55CC', cursor: 'pointer' }}>×</button>
            {selected.type === 'image' ? (
              <img src={selected.url} alt={selected.description || '특별한 순간'} style={{ width: '100%', borderRadius: 12, marginBottom: 10 }} />
            ) : (
              <video src={selected.url} controls style={{ width: '100%', borderRadius: 12, marginBottom: 10 }} />
            )}
            <div style={{ color: '#7C4DBC', fontWeight: 500, fontSize: 15, marginTop: 6 }}>{selected.description || ''}</div>
          </div>
        </div>
      )}
      {/* 전체보기 모달 */}
      {showAllModal && (
        <div className="moments-modal" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAllModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, maxWidth: 600, width: '95vw', maxHeight: '85vh', overflow: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowAllModal(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: 22, color: '#8A55CC', cursor: 'pointer' }}>×</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              {moments.map(m => (
                <div key={m.id} style={{ width: 220, marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {m.type === 'image' ? (
                    <img src={m.url} alt={m.description || '특별한 순간'} style={{ width: '100%', borderRadius: 12, marginBottom: 8, maxHeight: 160, objectFit: 'cover' }} />
                  ) : (
                    <video src={m.url} controls style={{ width: '100%', borderRadius: 12, marginBottom: 8, maxHeight: 160, objectFit: 'cover' }} />
                  )}
                  <div style={{ color: '#7C4DBC', fontWeight: 500, fontSize: 15, textAlign: 'center', minHeight: 18 }}>{m.description || ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecialMomentsCard; 