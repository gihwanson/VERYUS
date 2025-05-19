import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

function getGrade(score) {
  if (score >= 90) return "🌞 태양";
  if (score >= 80) return "🪐 토성";
  if (score >= 70) return "🌏 지구";
  if (score >= 60) return "🍉 수박";
  if (score >= 50) return "🍈 멜론";
  if (score >= 40) return "🍎 사과";
  if (score >= 30) return "🥝 키위";
  return "🫐 블루베리";
}

function AdminEvalPage() {
  const [results, setResults] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [rawEntries, setRawEntries] = useState([]);

  const fetchUserRoles = async () => {
    const snap = await getDocs(collection(db, "users"));
    const roles = {};
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.nickname && data.role) {
        roles[data.nickname] = data.role;
      }
    });
    setUserRoles(roles);
  };

  const fetchResults = async () => {
    const snap = await getDocs(collection(db, "scores"));
    const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setRawEntries(raw);

    const grouped = {};
    raw.forEach(r => {
      if (!grouped[r.target]) grouped[r.target] = [];
      grouped[r.target].push(r);
    });

    const formatted = Object.entries(grouped).map(([target, entries]) => {
      const total = entries.reduce((sum, e) => sum + e.score, 0);
      const avg = (total / entries.length).toFixed(1);
      const grade = getGrade(avg);
      return { target, entries, total, avg, grade };
    });

    setResults(formatted);
  };

  const resetAll = async () => {
    const ok = window.confirm("정말 모든 평가 결과를 초기화하시겠습니까?\n(부운영진 평가 포함)");
    if (!ok) return;
  
    const snap = await getDocs(collection(db, "scores"));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "scores", d.id))));
    setResults([]);
    alert("모든 평가 결과가 초기화되었습니다. (부운영진 평가 포함)");
  };

  useEffect(() => {
    fetchUserRoles();
    fetchResults();
  }, []);

  const subAdmins = Object.entries(userRoles)
    .filter(([_, role]) => role === "부운영진")
    .map(([nickname]) => nickname);

  const subAdminEntries = rawEntries.filter(entry => subAdmins.includes(entry.evaluator));

  const subAdminGrouped = {};
  subAdminEntries.forEach(entry => {
    if (!subAdminGrouped[entry.target]) subAdminGrouped[entry.target] = [];
    subAdminGrouped[entry.target].push(entry);
  });

  return (
    <div style={{
      maxWidth: 800,
      margin: "40px auto",
      padding: 30,
      borderRadius: 16,
      background: "#fff5ff",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
    }}>
      <h1 style={{ textAlign: "center", color: "#7e57c2", marginBottom: 30 }}>
        👑 등급 평가 결과
      </h1>

      <button
  onClick={resetAll}
  style={{
    background: "red",
    color: "#fff",
    padding: "10px 20px",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    marginBottom: 30,
    cursor: "pointer"
  }}
>
  🗑 모든 평가 (부운영진 포함) 초기화
</button>

      {results.length === 0 ? (
        <p style={{ textAlign: "center", color: "#888" }}>평가 결과가 없습니다.</p>
      ) : (
        results.map(({ target, entries, total, avg, grade }) => (
          <div key={target} style={{
            border: "2px solid #b49ddb",
            borderRadius: 12,
            padding: 20,
            marginBottom: 30,
            background: "#f3e7ff"
          }}>
            <h2 style={{ marginBottom: 10 }}>🎯 피평가자: {target}</h2>
            {entries.map((e, i) => {
              const role = userRoles[e.evaluator];
              return (
                <div key={i} style={{
                  background: "#fff",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 8,
                  fontSize: 14
                }}>
                  {role === "부운영진" && (
                    <p style={{ color: "#7b1fa2" }}>👤 평가자: <strong>{e.evaluator}</strong></p>
                  )}
                  <p>점수: <strong>{e.score}</strong></p>
                  <p>코멘트: {e.comment || "없음"}</p>
                  <p>부여한 등급: {getGrade(e.score)}</p>
                </div>
              );
            })}
            <hr style={{ margin: "20px 0" }} />
            <p><strong>총합:</strong> {total}점</p>
            <p><strong>평균:</strong> {avg}점</p>
            <p><strong>최종 등급:</strong> {grade}</p>
          </div>
        ))
      )}

      {/* 🟣 부운영진 평가 모아보기 (리더 전용) */}
      {localStorage.getItem("role") === "리더" && subAdminEntries.length > 0 && (
        <div style={{
          marginTop: 50,
          paddingTop: 30,
          borderTop: "2px dashed #7e57c2"
        }}>
          <h2 style={{ color: "#6a1b9a", marginBottom: 20 }}>🟣 부운영진 평가 모아보기 (리더 전용)</h2>

          {Object.entries(subAdminGrouped).map(([target, records]) => {
            const total = records.reduce((sum, r) => sum + r.score, 0);
            const avg = (total / records.length).toFixed(1);
            const grade = getGrade(avg);
            return (
              <div key={target} style={{
                background: "#fbe9f5",
                border: "1px solid #ce93d8",
                padding: 20,
                marginBottom: 30,
                borderRadius: 10
              }}>
                <h3>🎯 피평가자: <strong>{target}</strong></h3>
                {records.map((r, i) => (
                  <div key={i} style={{
                    background: "#fff",
                    padding: 10,
                    borderRadius: 6,
                    marginTop: 10,
                    fontSize: 14
                  }}>
                    <p>👤 부운영진: {r.evaluator}</p>
                    <p>점수: {r.score}</p>
                    <p>코멘트: {r.comment || "없음"}</p>
                    <p>추천 등급: {getGrade(r.score)}</p>
                  </div>
                ))}
                <hr style={{ margin: "16px 0" }} />
                <p><strong>부운영진 평균:</strong> {avg}점</p>
                <p><strong>부운영진 결과 등급:</strong> {grade}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminEvalPage;
