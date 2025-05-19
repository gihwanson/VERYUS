import React, { useState } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";

function EditNickname({ darkMode }) {
  const oldNickname = localStorage.getItem("nickname");
  const [newNickname, setNewNickname] = useState("");

  const handleSave = async () => {
    const q = query(collection(db, "users"), where("nickname", "==", oldNickname));
    const snap = await getDocs(q);
    snap.forEach(async d => {
      await updateDoc(doc(db, "users", d.id), { nickname: newNickname });
    });
    localStorage.setItem("nickname", newNickname);
    alert("닉네임이 수정되었습니다");
    window.location.reload();
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>닉네임 수정</h2>
      <input value={newNickname} onChange={e => setNewNickname(e.target.value)} />
      <button onClick={handleSave}>저장</button>
    </div>
  );
}

export default EditNickname;
