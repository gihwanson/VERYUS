import React, { useEffect } from 'react';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

const RecordingBoardDetail = () => {
  const recordId = 'your-record-id'; // Replace with actual record ID

  useEffect(() => {
    if (!recordId) return;
    const docRef = doc(db, 'recordings', recordId);
    updateDoc(docRef, { viewCount: increment(1) });
  }, [recordId]);

  return (
    <div>
      {/* Rest of the component code */}
    </div>
  );
};

export default RecordingBoardDetail; 