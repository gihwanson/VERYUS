import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, where, writeBatch, getDocs, addDoc, limit
} from "firebase/firestore";
import { db } from "../firebase";
import { useGrades } from "../contexts/GradeContext";
import {
  containerStyle, darkContainerStyle, titleStyle, smallBtn, purpleBtn
} from "../components/style";
import sha256 from "crypto-js/sha256";
import { Timestamp } from "firebase/firestore";

function NewAdminPanel({ darkMode }) {
  // 기본 상태 관리
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  
  // 콘테스트 관련 상태
  const [contests, setContests] = useState([]);
  const [selectedContest, setSelectedContest] = useState(null);
  const [contestTeams, setContestTeams] = useState([]);
  const [contestRecords, setContestRecords] = useState([]);
  const [showScoreStats, setShowScoreStats] = useState(false);
  
  // 사용자 관리 관련 상태
  const [pendingUsers, setPendingUsers] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    nickname: "",
    password: "",
    grade: "체리",
    role: "일반회원",
    joinDate: new Date().toISOString().split('T')[0]
  });
  
  // 게시글 관리 관련 상태
  const [postsTab, setPostsTab] = useState("all");
  const [postsList, setPostsList] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [newAuthorNickname, setNewAuthorNickname] = useState("");
  const [postAuthorEdit, setPostAuthorEdit] = useState({
    isEditing: false,
    currentNickname: "",
    newNickname: ""
  });

  // 현재 사용자 권한 확인
  const currentUserRole = localStorage.getItem("role");
  const hasAdminAccess = currentUserRole === "리더" || currentUserRole === "운영진";

  // Context에서 등급 정보 가져오기
  const { grades } = useGrades();

  // 등급 옵션
  const GRADE_OPTIONS = [
    { value: "체리", label: "🍒 체리" },
    { value: "블루베리", label: "🫐 블루베리" },
    { value: "키위", label: "🥝 키위" },
    { value: "사과", label: "🍎 사과" },
    { value: "멜론", label: "🍈 멜론" },
    { value: "수박", label: "🍉 수박" },
    { value: "지구", label: "🌏 지구" },
    { value: "토성", label: "🪐 토성" },
    { value: "태양", label: "🌞 태양" },
    { value: "은하", label: "🌌 은하" },
    { value: "맥주", label: "🍺 맥주" },
    { value: "번개", label: "⚡ 번개" },
    { value: "달", label: "🌙 달" },
    { value: "별", label: "⭐ 별" }
  ];

  const ROLE_OPTIONS = [
    { value: "일반회원", label: "일반회원" },
    { value: "부운영진", label: "부운영진" },
    { value: "운영진", label: "운영진" },
    { value: "리더", label: "리더" }
  ];

  // 기본 데이터 로드
  useEffect(() => {
    console.log("새 관리자 패널 초기화...");
    
    // 사용자 실시간 리스너
    const usersUnsubscribe = onSnapshot(
      query(collection(db, "users"), orderBy("nickname", "asc")),
      (snapshot) => {
        const userData = snapshot.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          firebaseId: d.id
        }));
        setUsers(userData);
        console.log("관리자 패널 - 사용자 데이터 업데이트:", userData.length, "명");
      },
      (error) => {
        console.error("사용자 데이터 로드 오류:", error);
      }
    );

    // 신고된 게시글 실시간 리스너
    const postsUnsubscribe = onSnapshot(
      query(collection(db, "posts"), where("reports", ">=", 2), orderBy("reports", "desc")),
      (snapshot) => {
        const postData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(postData);
        console.log("관리자 패널 - 신고된 게시글:", postData.length, "개");
      },
      (error) => {
        console.error("게시글 데이터 로드 오류:", error);
      }
    );

    // 콘테스트 실시간 리스너
    const contestsUnsubscribe = onSnapshot(
      query(collection(db, "contests"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const contestData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setContests(contestData);
        console.log("관리자 패널 - 콘테스트:", contestData.length, "개");
      },
      (error) => {
        console.error("콘테스트 데이터 로드 오류:", error);
      }
    );

    setLoading(false);

    return () => {
      usersUnsubscribe();
      postsUnsubscribe();
      contestsUnsubscribe();
    };
  }, []);

  // 승인 대기 중인 사용자 목록 가져오기
  useEffect(() => {
    if (activeTab !== "pending") return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, "users"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      ),
      (snapshot) => {
        const pendingUsersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPendingUsers(pendingUsersData);
      },
      (error) => {
        console.error("승인 대기 사용자 로드 오류:", error);
      }
    );

    return () => unsubscribe();
  }, [activeTab]);

  // 게시글 목록 가져오기
  useEffect(() => {
    if (activeTab !== "posts") return;

    const collections = ["posts", "freeposts", "songs", "advice", "recordings"];
    const unsubscribes = [];

    collections.forEach(collectionName => {
      const q = query(
        collection(db, collectionName),
        orderBy("createdAt", "desc"),
        limit(20)
      );

      const unsubscribe = onSnapshot(q, snapshot => {
        const posts = snapshot.docs.map(doc => ({
          id: doc.id,
          collection: collectionName,
          ...doc.data()
        }));
        setPostsList(prev => [...prev, ...posts]);
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
      setPostsList([]); // 컴포넌트 언마운트 시 목록 초기화
    };
  }, [activeTab]);

  // 권한이 없는 경우 접근 거부 화면 표시
  if (!hasAdminAccess) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          backgroundColor: darkMode ? "#2a2a2a" : "#fff",
          borderRadius: "12px",
          boxShadow: darkMode 
            ? "0 4px 20px rgba(0, 0, 0, 0.3)" 
            : "0 4px 20px rgba(0, 0, 0, 0.1)",
          border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
        }}>
          <div style={{
            fontSize: "64px",
            marginBottom: "20px"
          }}>
            🚫
          </div>
          <h2 style={{
            color: darkMode ? "#bb86fc" : "#7e57c2",
            marginBottom: "15px"
          }}>
            접근 권한이 없습니다
          </h2>
          <p style={{
            color: darkMode ? "#ccc" : "#666",
            marginBottom: "20px",
            lineHeight: "1.6"
          }}>
            관리자 패널은 리더 또는 운영진만 접근할 수 있습니다.<br />
            현재 권한: {currentUserRole || "일반회원"}
          </p>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: "12px 24px",
              backgroundColor: darkMode ? "#7e57c2" : "#7e57c2",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold"
            }}
          >
            이전 페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 사용자 삭제 (완전한 삭제) - 최종 강화 버전
  const deleteUser = async (userId, nickname) => {
    if (!window.confirm(`정말로 "${nickname}" 사용자를 완전히 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없으며, 해당 사용자의 모든 데이터가 삭제됩니다.`)) {
      return;
    }

    try {
      console.log("=== 사용자 완전 삭제 시작 ===");
      console.log("삭제 대상:", { userId, nickname });
      
      // 현재 사용자 목록에서 해당 사용자 찾기
      const targetUser = users.find(user => user.id === userId || user.nickname === nickname);
      if (!targetUser) {
        console.log("삭제할 사용자를 찾을 수 없음");
        alert("삭제할 사용자를 찾을 수 없습니다.");
        return;
      }

      console.log("삭제 대상 사용자:", targetUser);
      let deleteCount = 0;
      
      // === 1단계: Users 컬렉션에서 완전 삭제 ===
      console.log("1단계: Users 컬렉션 삭제");
      try {
        await deleteDoc(doc(db, "users", targetUser.id));
        console.log("✅ Users 컬렉션에서 삭제 완료:", targetUser.id);
        deleteCount++;
      } catch (error) {
        console.error("❌ Users 문서 삭제 오류:", error);
      }

      // 닉네임으로도 찾아서 삭제 (중복 문서 방지)
      try {
        const duplicateQuery = query(collection(db, "users"), where("nickname", "==", nickname));
        const duplicateSnapshot = await getDocs(duplicateQuery);
        
        for (const duplicateDoc of duplicateSnapshot.docs) {
          if (duplicateDoc.id !== targetUser.id) {
            await deleteDoc(duplicateDoc.ref);
            console.log("✅ 중복 Users 문서 삭제:", duplicateDoc.id);
            deleteCount++;
          }
        }
      } catch (error) {
        console.error("❌ 중복 Users 문서 삭제 오류:", error);
      }
      
      // === 2단계: 모든 게시글 삭제 ===
      console.log("2단계: 모든 게시글 삭제");
      const postCollections = [
        "posts", "freeposts", "songs", "advice", "recordingPosts"
      ];
      
      const postBatch = writeBatch(db);
      
      for (const collectionName of postCollections) {
        try {
          console.log(`${collectionName} 검색 중...`);
          
          // nickname으로 검색
          const nicknameQuery = query(collection(db, collectionName), where("nickname", "==", nickname));
          const nicknameSnapshot = await getDocs(nicknameQuery);
          
          nicknameSnapshot.docs.forEach(postDoc => {
            postBatch.delete(postDoc.ref);
            deleteCount++;
          });
          console.log(`✅ ${collectionName}에서 ${nicknameSnapshot.docs.length}개 게시글 삭제 예정`);
          
          // author 필드로도 검색 (다양한 필드명 대응)
          try {
            const authorQuery = query(collection(db, collectionName), where("author", "==", nickname));
            const authorSnapshot = await getDocs(authorQuery);
            
            authorSnapshot.docs.forEach(postDoc => {
              postBatch.delete(postDoc.ref);
              deleteCount++;
            });
            console.log(`✅ ${collectionName}에서 author 필드로 ${authorSnapshot.docs.length}개 추가 삭제 예정`);
          } catch (error) {
            console.log(`${collectionName}에 author 필드 없음`);
          }
          
        } catch (error) {
          console.error(`❌ ${collectionName} 게시글 삭제 오류:`, error);
        }
      }
      
      // === 3단계: 모든 댓글 삭제 ===
      console.log("3단계: 모든 댓글 삭제");
      const commentCollections = [
        "comments", "freecomments", "songcomments", "advicecomments", "recordingcomments"
      ];
      
      for (const collectionName of commentCollections) {
        try {
          console.log(`${collectionName} 검색 중...`);
          
          // author 필드로 검색
          const authorQuery = query(collection(db, collectionName), where("author", "==", nickname));
          const authorSnapshot = await getDocs(authorQuery);
          
          authorSnapshot.docs.forEach(commentDoc => {
            postBatch.delete(commentDoc.ref);
            deleteCount++;
          });
          console.log(`✅ ${collectionName}에서 ${authorSnapshot.docs.length}개 댓글 삭제 예정`);
          
          // nickname 필드로도 검색
          try {
            const nicknameQuery = query(collection(db, collectionName), where("nickname", "==", nickname));
            const nicknameSnapshot = await getDocs(nicknameQuery);
            
            nicknameSnapshot.docs.forEach(commentDoc => {
              postBatch.delete(commentDoc.ref);
              deleteCount++;
            });
            console.log(`✅ ${collectionName}에서 nickname 필드로 ${nicknameSnapshot.docs.length}개 추가 삭제 예정`);
          } catch (error) {
            console.log(`${collectionName}에 nickname 필드 없음`);
          }
          
        } catch (error) {
          console.error(`❌ ${collectionName} 댓글 삭제 오류:`, error);
        }
      }
      
      // 배치 실행 (게시글 + 댓글)
      if (deleteCount > 1) {
        console.log("배치 삭제 실행 중...");
        await postBatch.commit();
        console.log("✅ 배치 삭제 완료");
      }
      
      // === 4단계: 개별 컬렉션 삭제 ===
      console.log("4단계: 개별 컬렉션 삭제");
      
      // 방명록 삭제
      try {
        console.log("방명록 삭제 중...");
        const guestbookSnapshot = await getDocs(collection(db, `guestbook-${nickname}`));
        const guestbookBatch = writeBatch(db);
        
        guestbookSnapshot.docs.forEach(guestDoc => {
          guestbookBatch.delete(guestDoc.ref);
          deleteCount++;
        });
        
        if (guestbookSnapshot.docs.length > 0) {
          await guestbookBatch.commit();
          console.log(`✅ 방명록 ${guestbookSnapshot.docs.length}개 항목 삭제 완료`);
        }
      } catch (error) {
        console.error("❌ 방명록 삭제 오류:", error);
      }
      
      // 녹음 파일 삭제
      try {
        console.log("녹음 파일 삭제 중...");
        const recordingsQuery = query(collection(db, "recordings"), where("uploaderNickname", "==", nickname));
        const recordingsSnapshot = await getDocs(recordingsQuery);
        const recordingsBatch = writeBatch(db);
        
        recordingsSnapshot.docs.forEach(recordingDoc => {
          recordingsBatch.delete(recordingDoc.ref);
          deleteCount++;
        });
        
        if (recordingsSnapshot.docs.length > 0) {
          await recordingsBatch.commit();
          console.log(`✅ 녹음 파일 ${recordingsSnapshot.docs.length}개 항목 삭제 완료`);
        }
      } catch (error) {
        console.error("❌ 녹음 파일 삭제 오류:", error);
      }
      
      // === 5단계: 기타 연관 데이터 삭제 ===
      console.log("5단계: 기타 연관 데이터 삭제");
      
      // 좋아요, 신고 등 연관 데이터 삭제
      const otherCollections = ["likes", "reports", "follows", "messages"];
      for (const collectionName of otherCollections) {
        try {
          const userDataQuery = query(collection(db, collectionName), where("user", "==", nickname));
          const userDataSnapshot = await getDocs(userDataQuery);
          const otherBatch = writeBatch(db);
          
          userDataSnapshot.docs.forEach(dataDoc => {
            otherBatch.delete(dataDoc.ref);
            deleteCount++;
          });
          
          if (userDataSnapshot.docs.length > 0) {
            await otherBatch.commit();
            console.log(`✅ ${collectionName}에서 ${userDataSnapshot.docs.length}개 항목 삭제 완료`);
          }
        } catch (error) {
          console.log(`${collectionName} 컬렉션 처리 중 오류:`, error);
        }
      }
      
      // === 6단계: 로컬 상태에서 즉시 제거 ===
      console.log("6단계: 로컬 상태 업데이트");
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.filter(user => 
          user.id !== targetUser.id && user.nickname !== nickname
        );
        console.log(`로컬 상태 업데이트: ${prevUsers.length} → ${updatedUsers.length}`);
        return updatedUsers;
      });
      
      // 선택된 사용자 목록에서도 제거
      setSelectedUsers(prevSelected => 
        prevSelected.filter(id => id !== targetUser.id)
      );
      
      console.log("=== 사용자 완전 삭제 완료 ===");
      console.log(`총 삭제된 데이터: ${deleteCount}개`);
      
      alert(`✅ "${nickname}" 사용자 완전 삭제 완료!\n\n삭제된 관련 데이터: ${deleteCount}개\n\n새로고침 후에도 목록에서 사라집니다.`);
      
    } catch (error) {
      console.error("❌ 사용자 삭제 중 치명적 오류:", error);
      alert(`❌ 사용자 삭제 중 오류가 발생했습니다:\n${error.message}\n\n다시 시도해주세요.`);
    }
  };

  // 비밀번호 초기화
  const resetPassword = async (userId, nickname) => {
    if (!window.confirm(`"${nickname}" 사용자의 비밀번호를 111111로 초기화하시겠습니까?`)) {
      return;
    }

    try {
      // 비밀번호 해싱
      const hashedPassword = sha256("111111").toString();
      
      await updateDoc(doc(db, "users", userId), {
        password: hashedPassword,
        passwordResetAt: new Date(),
        updatedAt: new Date()
      });
      
      alert(`"${nickname}" 사용자의 비밀번호가 111111로 초기화되었습니다.`);
    } catch (error) {
      console.error("비밀번호 초기화 오류:", error);
      alert("비밀번호 초기화 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 신규 가입자 추가
  const addNewUser = async () => {
    if (!newUserForm.nickname || !newUserForm.password) {
      alert("닉네임과 비밀번호를 모두 입력해주세요.");
      return;
    }

    try {
      // 닉네임 중복 확인
      const nicknameCheck = query(collection(db, "users"), where("nickname", "==", newUserForm.nickname));
      const nicknameSnapshot = await getDocs(nicknameCheck);
      
      if (!nicknameSnapshot.empty) {
        alert("이미 존재하는 닉네임입니다.");
        return;
      }

      // 비밀번호 해싱
      const hashedPassword = sha256(newUserForm.password).toString();

      await addDoc(collection(db, "users"), {
        nickname: newUserForm.nickname,
        password: hashedPassword,
        grade: newUserForm.grade,
        role: newUserForm.role,
        joinDate: new Date(newUserForm.joinDate),
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      });

      alert("신규 사용자가 성공적으로 추가되었습니다.");
      setShowAddUser(false);
      setNewUserForm({
        nickname: "",
        password: "",
        grade: "체리",
        role: "일반회원",
        joinDate: new Date().toISOString().split('T')[0]
      });

    } catch (error) {
      console.error("사용자 추가 오류:", error);
      alert("사용자 추가 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 사용자 정보 수정 (간단한 업데이트)
  const updateUser = async (userId, userData) => {
    try {
      console.log("사용자 정보 업데이트:", userId, userData);
      
      const userExists = users.find(user => user.id === userId);
      
      if (!userExists) {
        alert("수정할 사용자를 찾을 수 없습니다.");
        return;
      }
      
      // 업데이트할 데이터만 포함하여 중복 방지
      const updateData = {};
      
      if (userData.nickname && userData.nickname !== userExists.nickname) {
        updateData.nickname = userData.nickname;
      }
      
      if (userData.grade && userData.grade !== userExists.grade) {
        updateData.grade = userData.grade;
      }
      
      if (userData.role && userData.role !== userExists.role) {
        updateData.role = userData.role;
      }
      
      if (userData.joinDate && userData.joinDate !== userExists.joinDate) {
        updateData.joinDate = new Date(userData.joinDate);
      }
      
      // 업데이트할 데이터가 없으면 종료
      if (Object.keys(updateData).length === 0) {
        alert("변경사항이 없습니다.");
        setEditingUser(null);
        setEditForm({});
        return;
      }
      
      // 항상 업데이트 시간 추가
      updateData.updatedAt = new Date();
      
      // 기존 사용자 정보 업데이트 (단일 문서 업데이트)
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, updateData);
      
      console.log("사용자 정보 업데이트 완료", updateData);
      alert("사용자 정보가 성공적으로 업데이트되었습니다.");
      
      // 편집 상태 초기화
      setEditingUser(null);
      setEditForm({});
      
      // 로컬 상태도 즉시 업데이트하여 UI 동기화
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId 
            ? { ...user, ...updateData }
            : user
        )
      );
      
    } catch (error) {
      console.error("사용자 업데이트 오류:", error);
      alert("사용자 정보 업데이트 중 오류가 발생했습니다: " + error.message);
      
      // 오류 발생 시에도 편집 상태 초기화
      setEditingUser(null);
      setEditForm({});
    }
  };

  // 게시글 삭제
  const deletePost = async (postId, title) => {
    if (!window.confirm(`"${title}" 게시글을 삭제하시겠습니까?`)) return;

    try {
      await deleteDoc(doc(db, "posts", postId));
      alert("게시글이 삭제되었습니다.");
    } catch (error) {
      console.error("게시글 삭제 오류:", error);
      alert("게시글 삭제 중 오류가 발생했습니다.");
    }
  };

  // 신고 초기화
  const clearReports = async (postId, title) => {
    if (!window.confirm(`"${title}" 게시글의 신고를 초기화하시겠습니까?`)) return;

    try {
      await updateDoc(doc(db, "posts", postId), { reports: 0 });
      alert("신고가 초기화되었습니다.");
    } catch (error) {
      console.error("신고 초기화 오류:", error);
      alert("신고 초기화 중 오류가 발생했습니다.");
    }
  };

  // 일괄 삭제 - 개선된 버전
  const bulkDeleteUsers = async () => {
    if (selectedUsers.length === 0) {
      alert("삭제할 사용자를 선택해주세요.");
      return;
    }

    // 선택된 사용자들의 정보 가져오기
    const selectedUserData = users.filter(user => selectedUsers.includes(user.id));
    const userNames = selectedUserData.map(user => user.nickname).join(", ");

    if (!window.confirm(`선택된 ${selectedUsers.length}명의 사용자를 모두 삭제하시겠습니까?\n\n사용자: ${userNames}\n\n⚠️ 이 작업은 되돌릴 수 없으며, 모든 관련 데이터가 삭제됩니다.`)) {
      return;
    }

    try {
      console.log("일괄 삭제 시작:", selectedUserData);
      
      let totalDeleteCount = 0;
      
      // 각 사용자별로 삭제 처리
      for (const user of selectedUserData) {
        console.log(`사용자 삭제 처리: ${user.nickname} (${user.id})`);
        
        // 1. Users 컬렉션에서 삭제
        try {
          await deleteDoc(doc(db, "users", user.id));
          console.log(`Users 문서 삭제: ${user.id}`);
        } catch (error) {
          console.error(`Users 문서 삭제 오류 (${user.nickname}):`, error);
        }
        
        // 2. 관련 데이터 삭제를 위한 배치 작업
        const batch = writeBatch(db);
        let userDeleteCount = 0;
        
        // 게시글 삭제
        const collections = ["posts", "freeposts", "songs", "advice", "recordingPosts"];
        for (const collectionName of collections) {
          try {
            const userPosts = query(collection(db, collectionName), where("nickname", "==", user.nickname));
            const postsSnapshot = await getDocs(userPosts);
            postsSnapshot.docs.forEach(postDoc => {
              batch.delete(postDoc.ref);
              userDeleteCount++;
            });
          } catch (error) {
            console.error(`${collectionName} 게시글 삭제 오류 (${user.nickname}):`, error);
          }
        }
        
        // 댓글 삭제
        const commentCollections = ["comments", "freecomments", "songcomments", "advicecomments", "recordingcomments"];
        for (const collectionName of commentCollections) {
          try {
            const userComments = query(collection(db, collectionName), where("author", "==", user.nickname));
            const commentsSnapshot = await getDocs(userComments);
            commentsSnapshot.docs.forEach(commentDoc => {
              batch.delete(commentDoc.ref);
              userDeleteCount++;
            });
          } catch (error) {
            console.error(`${collectionName} 댓글 삭제 오류 (${user.nickname}):`, error);
          }
        }
        
        // 방명록 삭제
        try {
          const guestbookSnapshot = await getDocs(collection(db, `guestbook-${user.nickname}`));
          guestbookSnapshot.docs.forEach(guestDoc => {
            batch.delete(guestDoc.ref);
            userDeleteCount++;
          });
        } catch (error) {
          console.log(`방명록 삭제 오류 (${user.nickname}):`, error);
        }
        
        // 녹음 파일 삭제
        try {
          const recordingsQuery = query(collection(db, "recordings"), where("uploaderNickname", "==", user.nickname));
          const recordingsSnapshot = await getDocs(recordingsQuery);
          recordingsSnapshot.docs.forEach(recordingDoc => {
            batch.delete(recordingDoc.ref);
            userDeleteCount++;
          });
        } catch (error) {
          console.log(`녹음 파일 삭제 오류 (${user.nickname}):`, error);
        }
        
        // 배치 실행
        if (userDeleteCount > 0) {
          await batch.commit();
          console.log(`${user.nickname} 관련 데이터 ${userDeleteCount}개 삭제 완료`);
        }
        
        totalDeleteCount += userDeleteCount;
      }
      
      // 로컬 상태에서 즉시 제거
      setUsers(prevUsers => prevUsers.filter(user => !selectedUsers.includes(user.id)));
      setSelectedUsers([]);
      
      console.log(`일괄 삭제 완료: ${selectedUserData.length}명, 관련 데이터 ${totalDeleteCount}개`);
      alert(`${selectedUserData.length}명의 사용자와 관련 데이터 ${totalDeleteCount}개가 삭제되었습니다.`);
      
    } catch (error) {
      console.error("일괄 삭제 오류:", error);
      alert("일괄 삭제 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 검색 필터링
  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      (user.nickname || "").toLowerCase().includes(search) ||
      (user.email || "").toLowerCase().includes(search) ||
      (user.grade || "").toLowerCase().includes(search) ||
      (user.role || "").toLowerCase().includes(search)
    );
  });

  // 수정 폼 핸들러
  const handleEditStart = (user) => {
    setEditingUser(user.id);
    setEditForm({
      nickname: user.nickname || "",
      grade: user.grade || "",
      role: user.role || "일반회원",
      email: user.email || "",
      joinDate: user.joinDate ? 
        (user.joinDate.toDate ? user.joinDate.toDate().toISOString().split('T')[0] : 
         new Date(user.joinDate).toISOString().split('T')[0]) : 
        new Date().toISOString().split('T')[0]
    });
  };

  const handleEditSave = () => {
    if (!editForm.nickname.trim()) {
      alert("닉네임을 입력해주세요.");
      return;
    }
    updateUser(editingUser, editForm);
  };

  const handleEditCancel = () => {
    setEditingUser(null);
    setEditForm({});
  };

  // 스타일
  const tabStyle = {
    display: "flex",
    marginBottom: 20,
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: darkMode ? "#333" : "#f0f0f0"
  };

  const tabItemStyle = (isActive) => ({
    flex: 1,
    padding: "12px 20px",
    cursor: "pointer",
    background: isActive 
      ? (darkMode ? "#7e57c2" : "#9c68e6") 
      : "transparent",
    color: isActive 
      ? "#fff" 
      : (darkMode ? "#ccc" : "#666"),
    borderRadius: 0,
    border: "none",
    fontWeight: isActive ? "bold" : "normal",
    textAlign: "center",
    transition: "all 0.3s ease"
  });

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    overflow: "hidden"
  };

  const thStyle = {
    padding: "12px",
    background: darkMode ? "#444" : "#f5f5f5",
    color: darkMode ? "#fff" : "#333",
    textAlign: "left",
    fontWeight: "bold",
    borderBottom: `1px solid ${darkMode ? "#555" : "#ddd"}`
  };

  const tdStyle = {
    padding: "12px",
    borderBottom: `1px solid ${darkMode ? "#555" : "#eee"}`,
    color: darkMode ? "#fff" : "#333"
  };

  const buttonStyle = {
    padding: "6px 12px",
    margin: "0 2px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold"
  };

  const deleteButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#f44336",
    color: "white"
  };

  const editButtonStyle = {
    ...buttonStyle,
    backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
    color: "white"
  };

  const saveButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#4caf50",
    color: "white"
  };

  const cancelButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#666",
    color: "white"
  };

  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "12px",
    padding: "25px",
    marginBottom: "20px",
    boxShadow: darkMode 
      ? "0 4px 20px rgba(126, 87, 194, 0.3)" 
      : "0 4px 20px rgba(126, 87, 194, 0.1)",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
    background: darkMode 
      ? "linear-gradient(135deg, #2a1b3d 0%, #1a1530 100%)"
      : "linear-gradient(135deg, #f8f5ff 0%, #f0ebff 100%)"
  };

  // 콘테스트 마감 함수
  const endContest = async (contestId, title) => {
    if (!window.confirm(`"${title}" 콘테스트를 마감하시겠습니까?\n마감 후에는 더 이상 점수를 등록할 수 없습니다.`)) {
      return;
    }

    try {
      await updateDoc(doc(db, "contests", contestId), {
        status: "종료"
      });
      alert("콘테스트가 마감되었습니다.");
    } catch (error) {
      console.error("콘테스트 마감 오류:", error);
      alert("콘테스트 마감 중 오류가 발생했습니다.");
    }
  };

  // 콘테스트 삭제 함수
  const deleteContest = async (contestId, title) => {
    if (!window.confirm(`"${title}" 콘테스트를 삭제하시겠습니까?\n관련된 모든 데이터가 삭제됩니다.`)) {
      return;
    }

    try {
      // 콘테스트 문서 삭제
      await deleteDoc(doc(db, "contests", contestId));

      // contestTeams 컬렉션에서 관련 팀 데이터 삭제
      const teamsQuery = query(
        collection(db, "contestTeams"),
        where("contestId", "==", contestId)
      );
      const teamsSnapshot = await getDocs(teamsQuery);
      const batch = writeBatch(db);
      
      teamsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // contestRecords 컬렉션에서 관련 기록 삭제
      const recordsQuery = query(
        collection(db, "contestRecords"),
        where("contestId", "==", contestId)
      );
      const recordsSnapshot = await getDocs(recordsQuery);
      
      recordsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      alert("콘테스트가 성공적으로 삭제되었습니다.");
    } catch (error) {
      console.error("콘테스트 삭제 오류:", error);
      alert("콘테스트 삭제 중 오류가 발생했습니다.");
    }
  };

  // 콘테스트 점수 통계 가져오기
  const fetchContestStats = async (contestId) => {
    try {
      // 팀 정보 가져오기
      const teamsQuery = query(
        collection(db, "contestTeams"),
        where("contestId", "==", contestId)
      );
      const teamsSnapshot = await getDocs(teamsQuery);
      const teamsData = teamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestTeams(teamsData);

      // 점수 기록 가져오기
      const recordsQuery = query(
        collection(db, "contestRecords"),
        where("contestId", "==", contestId)
      );
      const recordsSnapshot = await getDocs(recordsQuery);
      const recordsData = recordsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestRecords(recordsData);

      // 선택된 콘테스트 정보 설정
      const selectedContestData = contests.find(c => c.id === contestId);
      setSelectedContest(selectedContestData);
      setShowScoreStats(true);
    } catch (error) {
      console.error("콘테스트 통계 로딩 오류:", error);
      alert("통계 데이터를 불러오는 중 오류가 발생했습니다.");
    }
  };

  // 팀별 평균 점수 계산 (심사위원/일반 구분)
  const calculateTeamStats = (teamId) => {
    const teamRecords = contestRecords.filter(record => record.teamId === teamId);
    if (teamRecords.length === 0) return { average: 0, count: 0, judgeAverage: 0, normalAverage: 0 };

    // 심사위원 점수와 일반 점수 분리
    const judgeRecords = teamRecords.filter(record => 
      selectedContest.judges?.some(judge => judge.id === record.evaluatorId)
    );
    const normalRecords = teamRecords.filter(record => 
      !selectedContest.judges?.some(judge => judge.id === record.evaluatorId)
    );

    // 전체 평균
    const totalSum = teamRecords.reduce((acc, curr) => acc + curr.record, 0);
    const totalAverage = teamRecords.length > 0 ? (totalSum / teamRecords.length).toFixed(1) : 0;

    // 심사위원 평균
    const judgeSum = judgeRecords.reduce((acc, curr) => acc + curr.record, 0);
    const judgeAverage = judgeRecords.length > 0 ? (judgeSum / judgeRecords.length).toFixed(1) : 0;

    // 일반 평가자 평균
    const normalSum = normalRecords.reduce((acc, curr) => acc + curr.record, 0);
    const normalAverage = normalRecords.length > 0 ? (normalSum / normalRecords.length).toFixed(1) : 0;

    return {
      average: totalAverage,
      count: teamRecords.length,
      judgeAverage,
      judgeCount: judgeRecords.length,
      normalAverage,
      normalCount: normalRecords.length
    };
  };

  // 회원가입 승인 처리
  const approveUser = async (userId) => {
    try {
      await updateDoc(doc(db, "users"), {
        isApproved: true,
        status: "approved",
        approvedAt: Timestamp.now(),
        approvedBy: localStorage.getItem("nickname")
      });
      alert("회원가입이 승인되었습니다.");
    } catch (error) {
      console.error("회원가입 승인 오류:", error);
      alert("회원가입 승인 중 오류가 발생했습니다.");
    }
  };

  // 회원가입 반려 처리
  const rejectUser = async (userId) => {
    if (!window.confirm("정말 이 사용자의 회원가입을 반려하시겠습니까?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", userId));
      alert("회원가입이 반려되었습니다.");
    } catch (error) {
      console.error("회원가입 반려 오류:", error);
      alert("회원가입 반려 중 오류가 발생했습니다.");
    }
  };

  // 게시글 작성자 닉네임 변경 함수
  const changePostAuthor = async (postId, currentNickname, newNickname, collectionName) => {
    try {
      const postRef = doc(db, collectionName, postId);
      await updateDoc(postRef, {
        nickname: newNickname,
        updatedAt: Timestamp.now(),
        updatedBy: localStorage.getItem("nickname")
      });

      // 댓글 컬렉션의 작성자 닉네임도 업데이트
      const commentsQuery = query(
        collection(db, `${collectionName}-comments-${postId}`),
        where("nickname", "==", currentNickname)
      );
      const commentsSnapshot = await getDocs(commentsQuery);
      
      const batch = writeBatch(db);
      commentsSnapshot.docs.forEach(commentDoc => {
        batch.update(doc(db, `${collectionName}-comments-${postId}`, commentDoc.id), {
          nickname: newNickname,
          updatedAt: Timestamp.now(),
          updatedBy: localStorage.getItem("nickname")
        });
      });
      await batch.commit();

      alert("작성자 닉네임이 변경되었습니다.");
    } catch (error) {
      console.error("작성자 닉네임 변경 오류:", error);
      alert("작성자 닉네임 변경 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid #f3e7ff", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>관리자 패널 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: darkMode ? "#1a1a1a" : "#f5f0ff",
      padding: "0",
      color: darkMode ? "#e0e0e0" : "#333"
    }}>
      <div style={{
        backgroundColor: darkMode ? "#1a1a1a" : "#f5f0ff",
        padding: "20px",
        minHeight: "100vh"
      }}>
        <h1 style={{
          ...titleStyle,
          background: darkMode 
            ? "linear-gradient(135deg, #bb86fc 0%, #7e57c2 100%)"
            : "linear-gradient(135deg, #7e57c2 0%, #5e35b1 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          textAlign: "center",
          marginBottom: "30px",
          fontSize: "28px",
          fontWeight: "bold"
        }}>
          🛠️ 관리자 패널
        </h1>
        
        {/* 탭 메뉴 */}
        <div style={tabStyle}>
          <button 
            style={tabItemStyle(activeTab === "users")} 
            onClick={() => setActiveTab("users")}
          >
            👥 회원 관리 ({filteredUsers.length})
          </button>
          <button 
            style={tabItemStyle(activeTab === "reported")} 
            onClick={() => setActiveTab("reported")}
          >
            🚨 신고된 게시글 ({posts.length})
          </button>
          <button 
            style={tabItemStyle(activeTab === "stats")} 
            onClick={() => setActiveTab("stats")}
          >
            📊 통계
          </button>
          <button 
            style={tabItemStyle(activeTab === "contests")} 
            onClick={() => setActiveTab("contests")}
          >
            🏆 콘테스트 ({contests.length})
          </button>
          <button 
            style={tabItemStyle(activeTab === "pending")} 
            onClick={() => setActiveTab("pending")}
          >
            🔄 회원가입 승인
            {pendingUsers.length > 0 && (
              <span style={{
                backgroundColor: "red",
                color: "white",
                borderRadius: "50%",
                padding: "2px 6px",
                fontSize: "12px",
                marginLeft: "5px"
              }}>
                {pendingUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("posts")}
            style={{
              ...smallBtn,
              backgroundColor: activeTab === "posts" ? "#7e57c2" : "#e0e0e0"
            }}
          >
            게시글 관리
          </button>
        </div>

        {/* 신규 가입자 추가 */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            style={{
              ...purpleBtn,
              padding: "10px 20px",
              marginBottom: showAddUser ? "15px" : "0"
            }}
          >
            {showAddUser ? "❌ 취소" : "➕ 신규 가입자 추가"}
          </button>
          
          {showAddUser && (
            <div style={{
              backgroundColor: darkMode ? "#333" : "#f8f9fa",
              padding: "20px",
              borderRadius: "8px",
              border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "15px"
            }}>
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>닉네임 *</label>
                <input
                  type="text"
                  value={newUserForm.nickname}
                  onChange={(e) => setNewUserForm({...newUserForm, nickname: e.target.value})}
                  placeholder="닉네임 입력"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                    color: darkMode ? "#fff" : "#333"
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>비밀번호 *</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({...newUserForm, password: e.target.value})}
                  placeholder="비밀번호 입력"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                    color: darkMode ? "#fff" : "#333"
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>등급</label>
                <select
                  value={newUserForm.grade}
                  onChange={(e) => setNewUserForm({...newUserForm, grade: e.target.value})}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                    color: darkMode ? "#fff" : "#333"
                  }}
                >
                  {GRADE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>역할</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({...newUserForm, role: e.target.value})}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                    color: darkMode ? "#fff" : "#333"
                  }}
                >
                  {ROLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>가입일</label>
                <input
                  type="date"
                  value={newUserForm.joinDate}
                  onChange={(e) => setNewUserForm({...newUserForm, joinDate: e.target.value})}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                    color: darkMode ? "#fff" : "#333"
                  }}
                />
              </div>
              
              <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px" }}>
                <button
                  onClick={addNewUser}
                  style={{
                    ...saveButtonStyle,
                    padding: "10px 30px",
                    marginRight: "10px"
                  }}
                >
                  가입자 추가
                </button>
                <button
                  onClick={() => {
                    setShowAddUser(false);
                    setNewUserForm({
                      nickname: "",
                      password: "",
                      grade: "체리",
                      role: "일반회원",
                      joinDate: new Date().toISOString().split('T')[0]
                    });
                  }}
                  style={{
                    ...cancelButtonStyle,
                    padding: "10px 30px"
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 회원 관리 탭 */}
        {activeTab === "users" && (
          <div>
            {/* 검색 및 제어 */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "10px"
            }}>
              <input
                type="text"
                placeholder="닉네임, 이메일, 등급, 역할로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "300px",
                  padding: "10px 15px",
                  borderRadius: "8px",
                  border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                  backgroundColor: darkMode ? "#333" : "#fff",
                  color: darkMode ? "#fff" : "#333"
                }}
              />
              
              {selectedUsers.length > 0 && (
                <button 
                  onClick={bulkDeleteUsers}
                  style={{
                    ...deleteButtonStyle,
                    padding: "10px 20px"
                  }}
                >
                  선택된 {selectedUsers.length}명 삭제
                </button>
              )}
            </div>

            {/* 사용자 테이블 */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers(filteredUsers.map(u => u.id));
                        } else {
                          setSelectedUsers([]);
                        }
                      }}
                    />
                  </th>
                  <th style={thStyle}>닉네임</th>
                  <th style={thStyle}>등급</th>
                  <th style={thStyle}>역할</th>
                  <th style={thStyle}>가입일</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers([...selectedUsers, user.id]);
                          } else {
                            setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                          }
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      {editingUser === user.id ? (
                        <input
                          type="text"
                          value={editForm.nickname}
                          onChange={(e) => setEditForm({...editForm, nickname: e.target.value})}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                            backgroundColor: darkMode ? "#333" : "#fff",
                            color: darkMode ? "#fff" : "#333",
                            width: "120px"
                          }}
                        />
                      ) : (
                        user.nickname || "알 수 없음"
                      )}
                    </td>
                    <td style={tdStyle}>
                      {editingUser === user.id ? (
                        <select
                          value={editForm.grade}
                          onChange={(e) => setEditForm({...editForm, grade: e.target.value})}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                            backgroundColor: darkMode ? "#333" : "#fff",
                            color: darkMode ? "#fff" : "#333"
                          }}
                        >
                          <option value="">등급 선택</option>
                          {GRADE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {user.grade ? GRADE_OPTIONS.find(g => g.value === user.grade)?.label.split(' ')[0] : "미설정"}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {editingUser === user.id ? (
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                            backgroundColor: darkMode ? "#333" : "#fff",
                            color: darkMode ? "#fff" : "#333"
                          }}
                        >
                          {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        user.role || "일반회원"
                      )}
                    </td>
                    <td style={tdStyle}>
                      {editingUser === user.id ? (
                        <input
                          type="date"
                          value={editForm.joinDate}
                          onChange={(e) => setEditForm({...editForm, joinDate: e.target.value})}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                            backgroundColor: darkMode ? "#333" : "#fff",
                            color: darkMode ? "#fff" : "#333"
                          }}
                        />
                      ) : (
                        user.joinDate 
                          ? (user.joinDate.toDate ? user.joinDate.toDate().toLocaleDateString() : new Date(user.joinDate).toLocaleDateString())
                          : (user.createdAt 
                              ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() 
                              : "알 수 없음")
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {editingUser === user.id ? (
                          <>
                            <button onClick={handleEditSave} style={saveButtonStyle}>
                              저장
                            </button>
                            <button onClick={handleEditCancel} style={cancelButtonStyle}>
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleEditStart(user)} 
                              style={editButtonStyle}
                            >
                              수정
                            </button>
                            <button 
                              onClick={() => resetPassword(user.id, user.nickname)} 
                              style={{
                                ...buttonStyle,
                                backgroundColor: "#ff9800",
                                color: "white"
                              }}
                            >
                              PW초기화
                            </button>
                            <button 
                              onClick={() => deleteUser(user.id, user.nickname)} 
                              style={deleteButtonStyle}
                            >
                              강제삭제
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredUsers.length === 0 && (
              <div style={{ 
                textAlign: "center", 
                padding: "40px",
                color: darkMode ? "#aaa" : "#666"
              }}>
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        )}

        {/* 신고된 게시글 탭 */}
        {activeTab === "reported" && (
          <div>
            <h2>신고 2회 이상 게시글</h2>
            {posts.length === 0 ? (
              <p>신고된 게시글이 없습니다.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>제목</th>
                    <th style={thStyle}>작성자</th>
                    <th style={thStyle}>신고수</th>
                    <th style={thStyle}>작성일</th>
                    <th style={thStyle}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map(post => (
                    <tr key={post.id}>
                      <td style={tdStyle}>{post.title}</td>
                      <td style={tdStyle}>{post.nickname || "알 수 없음"}</td>
                      <td style={tdStyle}>{post.reports || 0}</td>
                      <td style={tdStyle}>
                        {post.createdAt 
                          ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() 
                          : "알 수 없음"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button 
                            onClick={() => clearReports(post.id, post.title)} 
                            style={editButtonStyle}
                          >
                            신고 초기화
                          </button>
                          <button 
                            onClick={() => deletePost(post.id, post.title)} 
                            style={deleteButtonStyle}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 통계 탭 */}
        {activeTab === "stats" && (
          <div>
            <h2>사이트 통계</h2>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
              gap: 20,
              marginTop: 20 
            }}>
              <div style={{ 
                padding: 20, 
                background: darkMode ? "#444" : "#f3e7ff", 
                borderRadius: 8,
                textAlign: "center"
              }}>
                <h3>총 회원수</h3>
                <p style={{ fontSize: 28, fontWeight: "bold" }}>{users.length}</p>
              </div>
              
              <div style={{ 
                padding: 20, 
                background: darkMode ? "#444" : "#f3e7ff", 
                borderRadius: 8,
                textAlign: "center"
              }}>
                <h3>신고된 게시글</h3>
                <p style={{ fontSize: 28, fontWeight: "bold" }}>{posts.length}</p>
              </div>
              
              <div style={{ 
                padding: 20, 
                background: darkMode ? "#444" : "#f3e7ff", 
                borderRadius: 8,
                textAlign: "center"
              }}>
                <h3>등급 설정된 회원</h3>
                <p style={{ fontSize: 28, fontWeight: "bold" }}>
                  {users.filter(u => u.grade).length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 콘테스트 관리 탭 */}
        {activeTab === "contests" && !showScoreStats && (
          <div>
            <h2 style={{ marginBottom: "20px", color: darkMode ? "#fff" : "#333" }}>
              콘테스트 관리
            </h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>제목</th>
                  <th style={thStyle}>카테고리</th>
                  <th style={thStyle}>주최자</th>
                  <th style={thStyle}>참가자 수</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>생성일</th>
                  <th style={thStyle}>종료일</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {contests.map(contest => (
                  <tr key={contest.id}>
                    <td style={tdStyle}>{contest.title}</td>
                    <td style={tdStyle}>
                      {contest.category === "grade" ? "등급전" : "일반 콘테스트"}
                    </td>
                    <td style={tdStyle}>{contest.organizer}</td>
                    <td style={tdStyle}>{contest.participantCount || 0}명</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: contest.status === "진행중" ? "#4caf50" : "#ff9800",
                        color: "white",
                        fontSize: "12px"
                      }}>
                        {contest.status || "진행중"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {contest.createdAt ? new Date(contest.createdAt.seconds * 1000).toLocaleDateString() : "-"}
                    </td>
                    <td style={tdStyle}>
                      {contest.endDate ? new Date(contest.endDate.seconds * 1000).toLocaleDateString() : "-"}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={() => fetchContestStats(contest.id)}
                          style={{
                            ...buttonStyle,
                            backgroundColor: "#7e57c2",
                            color: "white"
                          }}
                        >
                          점수통계
                        </button>
                        {contest.status !== "종료" && (
                          <button
                            onClick={() => endContest(contest.id, contest.title)}
                            style={{
                              ...buttonStyle,
                              backgroundColor: "#ff9800",
                              color: "white"
                            }}
                          >
                            마감
                          </button>
                        )}
                        <button
                          onClick={() => deleteContest(contest.id, contest.title)}
                          style={deleteButtonStyle}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contests.length === 0 && (
              <div style={{ 
                textAlign: "center", 
                padding: "40px",
                color: darkMode ? "#aaa" : "#666"
              }}>
                등록된 콘테스트가 없습니다.
              </div>
            )}
          </div>
        )}

        {/* 회원가입 승인 탭 */}
        {activeTab === "pending" && (
          <div>
            <h2 style={{
              fontSize: "20px",
              marginBottom: "20px",
              color: darkMode ? "#e0e0e0" : "#333"
            }}>
              🔄 회원가입 승인 대기 목록
            </h2>

            {pendingUsers.length === 0 ? (
              <p style={{
                textAlign: "center",
                padding: "20px",
                color: darkMode ? "#aaa" : "#666"
              }}>
                승인 대기 중인 회원가입 요청이 없습니다.
              </p>
            ) : (
              <div>
                {pendingUsers.map(user => (
                  <div key={user.id} style={{
                    padding: "15px",
                    marginBottom: "10px",
                    backgroundColor: darkMode ? "#333" : "#f5f5f5",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <h3 style={{
                        margin: "0 0 5px 0",
                        color: darkMode ? "#e0e0e0" : "#333"
                      }}>
                        {user.nickname}
                      </h3>
                      <p style={{
                        margin: "0",
                        fontSize: "14px",
                        color: darkMode ? "#aaa" : "#666"
                      }}>
                        가입일: {new Date(user.createdAt.seconds * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <button
                        onClick={() => approveUser(user.id)}
                        style={{
                          ...purpleBtn,
                          marginRight: "10px",
                          backgroundColor: "#4caf50"
                        }}
                      >
                        승인
                      </button>
                      <button
                        onClick={() => rejectUser(user.id)}
                        style={{
                          ...purpleBtn,
                          backgroundColor: "#f44336"
                        }}
                      >
                        반려
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 콘테스트 점수 통계 */}
        {activeTab === "contests" && showScoreStats && selectedContest && (
          <div>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "20px" 
            }}>
              <h2 style={{ color: darkMode ? "#fff" : "#333" }}>
                {selectedContest.title} - 점수 통계
              </h2>
              <button
                onClick={() => {
                  setShowScoreStats(false);
                  setSelectedContest(null);
                  setContestTeams([]);
                  setContestRecords([]);
                }}
                style={{
                  ...buttonStyle,
                  backgroundColor: "#666",
                  color: "white",
                  padding: "8px 16px"
                }}
              >
                목록으로 돌아가기
              </button>
            </div>

            <div style={{ marginBottom: "30px" }}>
              <p style={{ color: darkMode ? "#ccc" : "#666" }}>
                카테고리: {selectedContest.category === "grade" ? "등급전" : "일반 콘테스트"} |
                주최자: {selectedContest.organizer} |
                참가자: {selectedContest.participantCount || 0}명
              </p>
            </div>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>팀 번호</th>
                  <th style={thStyle}>팀원</th>
                  <th style={thStyle}>전체 평균</th>
                  {selectedContest.judges && selectedContest.judges.length > 0 && (
                    <th style={thStyle}>심사위원 평균</th>
                  )}
                  <th style={thStyle}>일반 평균</th>
                  <th style={thStyle}>평가 횟수</th>
                  <th style={thStyle}>상세 정보</th>
                </tr>
              </thead>
              <tbody>
                {contestTeams.sort((a, b) => a.teamNumber - b.teamNumber).map(team => {
                  const stats = calculateTeamStats(team.id);
                  const teamRecords = contestRecords.filter(record => record.teamId === team.id);
                  return (
                    <tr key={team.id}>
                      <td style={tdStyle}>{team.teamNumber}</td>
                      <td style={tdStyle}>{team.members.join(", ")}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontWeight: "bold",
                          color: darkMode ? "#bb86fc" : "#7e57c2"
                        }}>
                          {stats.average}점
                        </span>
                      </td>
                      {selectedContest.judges && selectedContest.judges.length > 0 && (
                        <td style={tdStyle}>
                          <span style={{
                            fontWeight: "bold",
                            color: "#4caf50"
                          }}>
                            {stats.judgeAverage}점
                            <small style={{ 
                              display: "block", 
                              fontSize: "12px", 
                              color: darkMode ? "#aaa" : "#666" 
                            }}>
                              ({stats.judgeCount}명 평가)
                            </small>
                          </span>
                        </td>
                      )}
                      <td style={tdStyle}>
                        <span style={{
                          fontWeight: "bold",
                          color: "#ff9800"
                        }}>
                          {stats.normalAverage}점
                          <small style={{ 
                            display: "block", 
                            fontSize: "12px", 
                            color: darkMode ? "#aaa" : "#666" 
                          }}>
                            ({stats.normalCount}명 평가)
                          </small>
                        </span>
                      </td>
                      <td style={tdStyle}>{stats.count}회</td>
                      <td style={tdStyle}>
                        <div style={{ marginBottom: "10px" }}>
                          <strong style={{ 
                            display: "block", 
                            marginBottom: "5px",
                            color: darkMode ? "#bb86fc" : "#7e57c2"
                          }}>
                            점수 목록
                          </strong>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {teamRecords.map(record => {
                              const isJudge = selectedContest.judges?.some(
                                judge => judge.id === record.evaluatorId
                              );
                              return (
                                <span key={record.id} style={{
                                  padding: "2px 6px",
                                  backgroundColor: isJudge 
                                    ? (darkMode ? "#1b5e20" : "#c8e6c9")
                                    : (darkMode ? "#444" : "#f0f0f0"),
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                  color: darkMode 
                                    ? (isJudge ? "#fff" : "#eee")
                                    : (isJudge ? "#1b5e20" : "#333")
                                }}>
                                  {record.record}점
                                  {isJudge && " (심사위원)"}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <strong style={{ 
                            display: "block", 
                            marginBottom: "5px",
                            color: darkMode ? "#bb86fc" : "#7e57c2"
                          }}>
                            리뷰
                          </strong>
                          <div style={{ 
                            maxHeight: "100px", 
                            overflowY: "auto",
                            fontSize: "12px"
                          }}>
                            {teamRecords.map(record => {
                              if (!record.review) return null;
                              const isJudge = selectedContest.judges?.some(
                                judge => judge.id === record.evaluatorId
                              );
                              return (
                                <div key={record.id} style={{
                                  padding: "4px 8px",
                                  marginBottom: "4px",
                                  backgroundColor: isJudge 
                                    ? (darkMode ? "#1b5e20" : "#c8e6c9")
                                    : (darkMode ? "#444" : "#f0f0f0"),
                                  borderRadius: "4px",
                                  color: darkMode ? "#fff" : "#333"
                                }}>
                                  <div style={{ 
                                    fontSize: "11px", 
                                    color: darkMode ? "#aaa" : "#666",
                                    marginBottom: "2px"
                                  }}>
                                    {isJudge ? "심사위원" : "일반"} 평가 - {record.record}점
                                  </div>
                                  {record.review}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {selectedContest.judges && selectedContest.judges.length > 0 && (
              <div style={{
                marginTop: "30px",
                padding: "20px",
                backgroundColor: darkMode ? "#333" : "#f5f5f5",
                borderRadius: "8px"
              }}>
                <h3 style={{ color: darkMode ? "#bb86fc" : "#7e57c2", marginBottom: "15px" }}>
                  심사위원 목록
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {selectedContest.judges.map(judge => (
                    <div key={judge.id} style={{
                      padding: "8px 12px",
                      backgroundColor: darkMode ? "#444" : "#fff",
                      borderRadius: "6px",
                      fontSize: "14px"
                    }}>
                      {judge.nickname}
                      <span style={{ 
                        marginLeft: "8px",
                        fontSize: "12px",
                        color: darkMode ? "#aaa" : "#666"
                      }}>
                        ({judge.role})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 게시글 관리 탭 */}
        {activeTab === "posts" && (
          <div>
            <h2 style={{
              fontSize: "20px",
              marginBottom: "20px",
              color: darkMode ? "#e0e0e0" : "#333"
            }}>
              📝 게시글 관리
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <input
                type="text"
                placeholder="게시글 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                  backgroundColor: darkMode ? "#333" : "#fff",
                  color: darkMode ? "#fff" : "#333"
                }}
              />
            </div>

            <div>
              {postsList
                .filter(post => 
                  post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  post.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  post.nickname?.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map(post => (
                  <div key={post.id} style={{
                    padding: "15px",
                    marginBottom: "10px",
                    backgroundColor: darkMode ? "#333" : "#f5f5f5",
                    borderRadius: "8px",
                    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px"
                    }}>
                      <div>
                        <h3 style={{
                          margin: "0 0 5px 0",
                          color: darkMode ? "#e0e0e0" : "#333"
                        }}>
                          {post.title}
                        </h3>
                        <p style={{
                          margin: "0",
                          fontSize: "14px",
                          color: darkMode ? "#aaa" : "#666"
                        }}>
                          작성자: {post.nickname} | 게시판: {post.collection}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPost(post);
                          setNewAuthorNickname(post.nickname);
                        }}
                        style={{
                          ...purpleBtn,
                          padding: "6px 12px",
                          fontSize: "14px"
                        }}
                      >
                        작성자 변경
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* 작성자 변경 모달 */}
            {selectedPost && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000
              }}>
                <div style={{
                  backgroundColor: darkMode ? "#2a2a2a" : "#fff",
                  padding: "20px",
                  borderRadius: "12px",
                  width: "90%",
                  maxWidth: "500px"
                }}>
                  <h3 style={{
                    margin: "0 0 20px 0",
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    작성자 닉네임 변경
                  </h3>
                  <input
                    type="text"
                    value={newAuthorNickname}
                    onChange={(e) => setNewAuthorNickname(e.target.value)}
                    placeholder="새로운 닉네임 입력"
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "20px",
                      borderRadius: "8px",
                      border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
                      backgroundColor: darkMode ? "#333" : "#fff",
                      color: darkMode ? "#fff" : "#333"
                    }}
                  />
                  <div style={{
                    display: "flex",
                    gap: "10px",
                    justifyContent: "flex-end"
                  }}>
                    <button
                      onClick={() => {
                        changePostAuthor(
                          selectedPost.id,
                          selectedPost.nickname,
                          newAuthorNickname,
                          selectedPost.collection
                        );
                        setSelectedPost(null);
                      }}
                      style={{
                        ...purpleBtn,
                        backgroundColor: "#4caf50"
                      }}
                    >
                      변경
                    </button>
                    <button
                      onClick={() => setSelectedPost(null)}
                      style={{
                        ...purpleBtn,
                        backgroundColor: "#f44336"
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

NewAdminPanel.propTypes = {
  darkMode: PropTypes.bool
};

NewAdminPanel.defaultProps = {
  darkMode: false
};

export default NewAdminPanel; 