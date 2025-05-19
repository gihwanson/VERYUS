import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function AdminUserPage({ darkMode, globalGrades, setGrades }) {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("nickname");
  const [nicknameInputs, setNicknameInputs] = useState({});

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(updatedUsers);

      const nickMap = {};
      const gradeMap = {};
      updatedUsers.forEach(user => {
        nickMap[user.id] = user.nickname;
        if (user.nickname && user.grade) {
          gradeMap[user.nickname] = user.grade;
        }
      });
      setNicknameInputs(nickMap);
      if (setGrades) setGrades(gradeMap);
    });

    return () => unsubscribe();
  }, [setGrades]);

  const handleNicknameInputChange = (id, value) => {
    setNicknameInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleGradeChange = (id, newGrade) => {
    setUsers(users.map(user => user.id === id ? { ...user, grade: newGrade } : user));
  };

  const handleRoleChange = (id, newRole) => {
    setUsers(users.map(user => user.id === id ? { ...user, role: newRole } : user));
  };

  const saveChanges = async (id) => {
    const user = users.find(u => u.id === id);
    if (!user) return;

    const newNick = nicknameInputs[id];
    const userRef = doc(db, "users", id);
    const updateData = {
      nickname: newNick,
      grade: user.grade || "🍒",
      role: user.role || "일반",
    };

    await updateDoc(userRef, updateData);

    const updateCollections = ["posts", "comments", "messages"];
    for (let col of updateCollections) {
      const q = query(collection(db, col), where("uid", "==", id));
      const snap = await getDocs(q);
      snap.forEach(async d => {
        await updateDoc(doc(db, col, d.id), { nickname: newNick });
      });
    }

    setUsers(users.map(u => u.id === id ? { ...u, nickname: newNick } : u));
    alert("수정 완료");
  };

  const deleteUser = async (id) => {
    if (!window.confirm("정말 탈퇴시키겠습니까?")) return;
    await deleteDoc(doc(db, "users", id));
    setUsers(users.filter(u => u.id !== id));
  };

  const fixAllMissingNicknames = async () => {
    const collections = ["posts", "freeposts", "songs", "advice"];
    let fixedCount = 0;

    const userSnap = await getDocs(collection(db, "users"));
    const uidToNick = {};
    userSnap.forEach((doc) => {
      const data = doc.data();
      if (data.nickname) {
        uidToNick[doc.id] = data.nickname;
      }
    });

    for (const col of collections) {
      const postSnap = await getDocs(collection(db, col));
      for (const docSnap of postSnap.docs) {
        const data = docSnap.data();
        const uid = data.uid;
        if ((!data.nickname || data.nickname.trim() === "") && uid && uidToNick[uid]) {
          await updateDoc(doc(db, col, docSnap.id), {
            nickname: uidToNick[uid],
          });
          fixedCount++;
        }
      }
    }

    alert(`✅ ${fixedCount}개의 게시글 nickname을 복구했습니다.`);
  };

  const filteredUsers = [...users.filter(user => user.nickname?.includes(searchTerm))]
    .sort((a, b) => a[sortBy]?.localeCompare(b[sortBy]));

  const saveBtnStyle = {
    backgroundColor: "#8e24aa",
    border: "none",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    color: "white",
    cursor: "pointer"
  };

  const selectStyle = {
    border: "1px solid #ce93d8",
    borderRadius: "6px",
    padding: "0.3rem",
    width: "100px",
    color: "#4a148c"
  };

  const logBtnStyle = {
    backgroundColor: "#d1c4e9",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.7rem",
    cursor: "pointer",
    color: "#4a148c"
  };

  const deleteBtnStyle = {
    backgroundColor: "#d32f2f",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.7rem",
    color: "white",
    cursor: "pointer"
  };

  return (
    <div style={{ backgroundColor: "#f3e5f5", minHeight: "100vh", padding: "2rem", fontFamily: "sans-serif", color: "#4a148c" }}>
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.8rem" }}>👑 관리자 회원 관리</h2>

      <div style={{ marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="닉네임 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "0.5rem", width: "250px", borderRadius: "8px", border: "1px solid #7e57c2", backgroundColor: "#ede7f6", color: "#4a148c" }}
        />
        <select
          onChange={(e) => setSortBy(e.target.value)}
          style={{ marginLeft: "1rem", padding: "0.5rem", borderRadius: "8px", border: "1px solid #7e57c2", backgroundColor: "#ede7f6", color: "#4a148c" }}
        >
          <option value="nickname">닉네임순</option>
          <option value="grade">등급순</option>
          <option value="role">직책순</option>
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <thead>
          <tr style={{ backgroundColor: "#ce93d8", color: "#fff", textAlign: "left" }}>
            <th style={{ padding: "0.8rem" }}>닉네임</th>
            <th style={{ padding: "0.8rem" }}>수정</th>
            <th style={{ padding: "0.8rem" }}>등급</th>
            <th style={{ padding: "0.8rem" }}>등급 저장</th>
            <th style={{ padding: "0.8rem" }}>직책</th>
            <th style={{ padding: "0.8rem" }}>직책 저장</th>
            <th style={{ padding: "0.8rem" }}>활동 로그</th>
            <th style={{ padding: "0.8rem" }}>탈퇴</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(user => (
            <tr key={user.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.6rem" }}>{user.nickname}</td>
              <td style={{ padding: "0.6rem" }}>
                <input
                  value={nicknameInputs[user.id] || ""}
                  onChange={(e) => handleNicknameInputChange(user.id, e.target.value)}
                  style={{ border: "1px solid #ce93d8", borderRadius: "6px", padding: "0.3rem", width: "120px", marginRight: "0.5rem", color: "#4a148c" }}
                />
                <button onClick={() => saveChanges(user.id)} style={saveBtnStyle}>저장</button>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <select value={user.grade} onChange={(e) => handleGradeChange(user.id, e.target.value)} style={selectStyle}>
                  <option value="🍒">🍒 체리</option>
                  <option value="🫐">🫐 블루베리</option>
                  <option value="🥝">🥝 키위</option>
                  <option value="🍎">🍎 사과</option>
                  <option value="🍈">🍈 멜론</option>
                  <option value="🍉">🍉 수박</option>
                  <option value="🌏">🌏 지구</option>
                  <option value="🪐">🪐 토성</option>
                  <option value="🌞">🌞 태양</option>
                  <option value="🌌">🌌 은하</option>
                </select>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <button onClick={() => saveChanges(user.id)} style={saveBtnStyle}>저장</button>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <select value={user.role} onChange={(e) => handleRoleChange(user.id, e.target.value)} style={selectStyle}>
                  <option value="일반">일반</option>
                  <option value="조장">조장</option>
                  <option value="부운영진">부운영진</option>
                  <option value="운영진">운영진</option>
                  <option value="리더">리더</option>
                </select>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <button onClick={() => saveChanges(user.id)} style={saveBtnStyle}>저장</button>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <button onClick={() => alert("활동 로그 기능은 추후 구현")} style={logBtnStyle}>보기</button>
              </td>
              <td style={{ padding: "0.6rem" }}>
                <button onClick={() => deleteUser(user.id)} style={deleteBtnStyle}>🗑 탈퇴</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "2rem" }}>
        <button onClick={fixAllMissingNicknames} style={{
          backgroundColor: "#4a148c",
          color: "#fff",
          padding: "0.7rem 1.2rem",
          borderRadius: "8px",
          fontWeight: "bold",
          fontSize: "14px",
          cursor: "pointer"
        }}>
          🛠 전체 게시글 닉네임 복구 실행
        </button>
      </div>
    </div>
  );
}

export default AdminUserPage;
