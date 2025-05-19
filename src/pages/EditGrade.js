import React, { useState } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";

function EditGrade({ darkMode }) {
  const nickname = localStorage.getItem("nickname");
  const [newGrade, setNewGrade] = useState("");

  const handleSave = async () => {
    const q = query(collection(db, "users"), where("nickname", "==", nickname));
    const snap = await getDocs(q);
    snap.forEach(async d => {
      await updateDoc(doc(db, "users", d.id), { grade: newGrade });
    });
    alert("등급이 수정되었습니다");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>등급 수정</h2>
      <select value={newGrade} onChange={e => setNewGrade(e.target.value)}>
        <option value="">선택</option>
        <option value="🍒">🍒</option>
        <option value="🍎">🍎</option>
        <option value="🍉">🍉</option>
        <option value="🌏">🌏</option>
        <option value="🪐">🪐</option>
        <option value="🌞">🌞</option>
        <option value="🌌">🌌</option>
      </select>
      <button onClick={handleSave}>저장</button>
    </div>
  );
}

export default EditGrade;
