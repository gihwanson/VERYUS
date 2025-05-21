import React, { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { 
  collection, getDocs, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
  limit, startAfter, orderBy, writeBatch, serverTimestamp, Timestamp, setDoc, getDoc
} from "firebase/firestore";
import { db } from "../firebase";

// 페이지당 유저 수
const USERS_PER_PAGE = 10;

// 등급 정보
const GRADES = [
  { value: "🍒", label: "🍒 체리", level: 1 },
  { value: "🫐", label: "🫐 블루베리", level: 2 },
  { value: "🥝", label: "🥝 키위", level: 3 },
  { value: "🍎", label: "🍎 사과", level: 4 },
  { value: "🍈", label: "🍈 멜론", level: 5 },
  { value: "🍉", label: "🍉 수박", level: 6 },
  { value: "🌏", label: "🌏 지구", level: 7 },
  { value: "🪐", label: "🪐 토성", level: 8 },
  { value: "🌞", label: "🌞 태양", level: 9 },
  { value: "🌌", label: "🌌 은하", level: 10 }
];

// 직책 정보
const ROLES = [
  { value: "일반", label: "일반", level: 1 },
  { value: "조장", label: "조장", level: 2 },
  { value: "부운영진", label: "부운영진", level: 3 },
  { value: "운영진", label: "운영진", level: 4 },
  { value: "리더", label: "리더", level: 5 }
];

// 활동 타입 정의
const ACTIVITY_TYPES = {
  LOGIN: "로그인",
  SIGNUP: "회원가입",
  POST: "게시글 작성",
  COMMENT: "댓글 작성",
  DELETE: "게시글 삭제",
  UPDATE: "정보 수정",
  ADMIN_ACTION: "관리자 조치"
};

function AdminUserPage({ darkMode, globalGrades, setGrades }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("nickname");
  const [sortDirection, setSortDirection] = useState("asc");
  const [nicknameInputs, setNicknameInputs] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all"); // all, admin, recent
  const [bulkAction, setBulkAction] = useState("");
  const [bulkGrade, setBulkGrade] = useState("🍒");
  const [bulkRole, setBulkRole] = useState("일반");
  const [processing, setProcessing] = useState(false);
  const [processingNickname, setProcessingNickname] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(() => {});
  const [confirmMessage, setConfirmMessage] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState(""); // success, error, info
  const [userActivities, setUserActivities] = useState({});
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedUserActivity, setSelectedUserActivity] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState(null);
  const [importData, setImportData] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [addUserMode, setAddUserMode] = useState(false);
  const [newUser, setNewUser] = useState({
    nickname: "",
    email: "",
    grade: "🍒",
    role: "일반",
    introduction: ""
  });
  
  // 스타일 정의
  const theme = useMemo(() => {
    return darkMode ? {
      background: "#121212",
      surface: "#1e1e1e",
      surfaceHighlight: "#2a2a2a",
      primary: "#bb86fc",
      primaryDark: "#9969da",
      secondary: "#03dac6",
      text: "#e0e0e0",
      textSecondary: "#ababab",
      error: "#cf6679",
      border: "#333333",
      inputBg: "#2c2c2c",
      success: "#4caf50",
      warning: "#ff9800"
    } : {
      background: "#f3e5f5",
      surface: "#ffffff",
      surfaceHighlight: "#f8f0ff", 
      primary: "#8e24aa",
      primaryDark: "#6a1b9a",
      secondary: "#ce93d8",
      text: "#4a148c",
      textSecondary: "#673ab7",
      error: "#d32f2f",
      border: "#e0e0e0",
      inputBg: "#ede7f6",
      success: "#4caf50",
      warning: "#ff9800"
    };
  }, [darkMode]);

  // 사용자 수 카운트 가져오기
  useEffect(() => {
    const getUserCount = async () => {
      try {
        const userQuery = query(collection(db, "users"));
        const snapshot = await getDocs(userQuery);
        setUserCount(snapshot.size);
      } catch (error) {
        console.error("사용자 수 로드 오류:", error);
        showAlert("사용자 수를 가져오는 중 오류가 발생했습니다", "error");
      }
    };
    
    getUserCount();
  }, []);

  // 초기 사용자 로드 및 실시간 업데이트
  useEffect(() => {
    setLoading(true);
    
    let baseQuery;
    
    switch (activeFilter) {
      case "admin":
        baseQuery = query(
          collection(db, "users"),
          where("role", "in", ["운영진", "리더", "부운영진"]),
          orderBy(sortBy, sortDirection),
          limit(USERS_PER_PAGE)
        );
        break;
      case "recent":
        baseQuery = query(
          collection(db, "users"),
          orderBy("createdAt", "desc"),
          limit(USERS_PER_PAGE)
        );
        break;
      default:
        baseQuery = query(
          collection(db, "users"),
          orderBy(sortBy, sortDirection),
          limit(USERS_PER_PAGE)
        );
    }
    
    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      const updatedUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        originalData: { ...doc.data() }, // 원본 데이터 저장
        ...doc.data()
      }));

      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setHasMore(false);
      }
      
      setUsers(updatedUsers);
      
      const nickMap = {};
      const gradeMap = {};
      updatedUsers.forEach(user => {
        nickMap[user.id] = user.nickname || "";
        if (user.nickname && user.grade) {
          gradeMap[user.nickname] = user.grade;
        }
      });
      
      setNicknameInputs(nickMap);
      if (setGrades) setGrades(gradeMap);
      setLoading(false);
    }, (error) => {
      console.error("사용자 데이터 로드 오류:", error);
      showAlert("사용자 데이터를 불러오는 중 오류가 발생했습니다", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setGrades, sortBy, sortDirection, activeFilter]);

  // 사용자 필터링 및 정렬
  useEffect(() => {
    let result = [...users];
    
    // 검색어로 필터링
    if (searchTerm) {
      result = result.filter(user => 
        (user.nickname && user.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    setFilteredUsers(result);
  }, [users, searchTerm]);

  // 더 많은 사용자 로드
  const loadMoreUsers = async () => {
    if (!lastVisible || loadingMore) return;
    
    setLoadingMore(true);
    
    try {
      let nextQuery;
      
      switch (activeFilter) {
        case "admin":
          nextQuery = query(
            collection(db, "users"),
            where("role", "in", ["운영진", "리더", "부운영진"]),
            orderBy(sortBy, sortDirection),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
          break;
        case "recent":
          nextQuery = query(
            collection(db, "users"),
            orderBy("createdAt", "desc"),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
          break;
        default:
          nextQuery = query(
            collection(db, "users"),
            orderBy(sortBy, sortDirection),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
      }
      
      const snapshot = await getDocs(nextQuery);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }
      
      const newUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        originalData: { ...doc.data() },
        ...doc.data()
      }));
      
      setUsers(prevUsers => [...prevUsers, ...newUsers]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      
      // 닉네임 입력값 업데이트
      const updatedNicknameInputs = { ...nicknameInputs };
      newUsers.forEach(user => {
        updatedNicknameInputs[user.id] = user.nickname || "";
      });
      setNicknameInputs(updatedNicknameInputs);
      
    } catch (error) {
      console.error("추가 사용자 로드 오류:", error);
      showAlert("추가 사용자 로드 중 오류가 발생했습니다", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  // 정렬 방향 토글
  const toggleSortDirection = () => {
    setSortDirection(prev => prev === "asc" ? "desc" : "asc");
  };

  // 필터 변경
  const changeFilter = (filter) => {
    if (filter === activeFilter) return;
    
    setActiveFilter(filter);
    setUsers([]);
    setLastVisible(null);
    setHasMore(true);
  };

  // 닉네임 입력값 변경 핸들러
  const handleNicknameInputChange = (id, value) => {
    setNicknameInputs(prev => ({ ...prev, [id]: value }));
  };

  // 등급 변경 핸들러
  const handleGradeChange = (id, newGrade) => {
    setUsers(users.map(user => 
      user.id === id ? { ...user, grade: newGrade } : user
    ));
  };

  // 직책 변경 핸들러
  const handleRoleChange = (id, newRole) => {
    setUsers(users.map(user => 
      user.id === id ? { ...user, role: newRole } : user
    ));
  };

  // 활동 로그 조회
  const fetchUserActivity = async (userId, nickname) => {
    if (userActivities[userId]) {
      setSelectedUserActivity({ userId, nickname, activities: userActivities[userId] });
      setShowActivityModal(true);
      return;
    }
    
    setLoadingActivity(true);
    
    try {
      const activitiesRef = collection(db, "activities");
      const q = query(
        activitiesRef,
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      const activities = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        formattedTime: doc.data().timestamp ? doc.data().timestamp.toDate().toLocaleString() : "시간 정보 없음"
      }));
      
      setUserActivities(prev => ({
        ...prev,
        [userId]: activities
      }));
      
      setSelectedUserActivity({ userId, nickname, activities });
      setShowActivityModal(true);
    } catch (error) {
      console.error("활동 로그 조회 오류:", error);
      showAlert("활동 로그를 가져오는 중 오류가 발생했습니다", "error");
    } finally {
      setLoadingActivity(false);
    }
  };

  // 새 사용자 추가
  const addNewUser = async () => {
    if (!newUser.nickname.trim()) {
      showAlert("닉네임은 필수 입력 항목입니다", "error");
      return;
    }
    
    setProcessing(true);
    
    try {
      // 닉네임 중복 확인
      const nicknameCheck = query(
        collection(db, "users"),
        where("nickname", "==", newUser.nickname)
      );
      const nickSnapshot = await getDocs(nicknameCheck);
      
      if (!nickSnapshot.empty) {
        showAlert(`닉네임 '${newUser.nickname}'은(는) 이미 사용 중입니다`, "error");
        setProcessing(false);
        return;
      }
      
      // 이메일이 있는 경우 중복 확인
      if (newUser.email) {
        const emailCheck = query(
          collection(db, "users"),
          where("email", "==", newUser.email)
        );
        const emailSnapshot = await getDocs(emailCheck);
        
        if (!emailSnapshot.empty) {
          showAlert(`이메일 '${newUser.email}'은(는) 이미 사용 중입니다`, "error");
          setProcessing(false);
          return;
        }
      }
      
      // 새 사용자 문서 생성
      const userRef = doc(collection(db, "users"));
      await setDoc(userRef, {
        nickname: newUser.nickname,
        email: newUser.email || null,
        grade: newUser.grade || "🍒",
        role: newUser.role || "일반",
        introduction: newUser.introduction || "",
        createdAt: serverTimestamp(),
        createdBy: localStorage.getItem("nickname") || "관리자",
        profilePicUrl: "", // 기본 빈 프로필 이미지
        isActive: true
      });
      
      // 활동 기록 추가
      const activityRef = doc(collection(db, "activities"));
      await setDoc(activityRef, {
        userId: userRef.id,
        nickname: newUser.nickname,
        type: ACTIVITY_TYPES.SIGNUP,
        description: "관리자에 의한 계정 생성",
        timestamp: serverTimestamp(),
        performedBy: localStorage.getItem("nickname") || "관리자"
      });
      
      showAlert(`사용자 '${newUser.nickname}'이(가) 추가되었습니다`, "success");
      
      // 폼 초기화
      setNewUser({
        nickname: "",
        email: "",
        grade: "🍒",
        role: "일반",
        introduction: ""
      });
      
      setAddUserMode(false);
      
      // 사용자 카운트 업데이트
      setUserCount(prev => prev + 1);
      
    } catch (error) {
      console.error("사용자 추가 오류:", error);
      showAlert("사용자 추가 중 오류가 발생했습니다", "error");
    } finally {
      setProcessing(false);
    }
  };

  // 사용자 상세정보 열기
  const viewUserDetails = (user) => {
    setSelectedUserDetails(user);
    setShowUserDetails(true);
  };

  // 단일 사용자 변경사항 저장
  const saveChanges = async (id) => {
    setProcessing(true);
    const user = users.find(u => u.id === id);
    if (!user) {
      showAlert("사용자를 찾을 수 없습니다", "error");
      setProcessing(false);
      return;
    }

    try {
      setProcessingNickname(user.nickname);
      
      const newNick = nicknameInputs[id];
      
      // 변경사항이 없는지 확인
      if (
        newNick === user.originalData.nickname &&
        user.grade === user.originalData.grade &&
        user.role === user.originalData.role
      ) {
        showAlert("변경된 내용이 없습니다", "info");
        setProcessing(false);
        return;
      }
      
      // 닉네임 중복 확인 (변경된 경우에만)
      if (newNick !== user.originalData.nickname) {
        const duplicateCheck = query(
          collection(db, "users"),
          where("nickname", "==", newNick)
        );
        const dupSnapshot = await getDocs(duplicateCheck);
        
        if (!dupSnapshot.empty) {
          showAlert(`닉네임 '${newNick}'은(는) 이미 사용 중입니다`, "error");
          setProcessing(false);
          return;
        }
      }
      
      const userRef = doc(db, "users", id);
      const updateData = {
        nickname: newNick,
        grade: user.grade || "🍒",
        role: user.role || "일반",
        updatedAt: serverTimestamp(),
        updatedBy: localStorage.getItem("nickname") || "관리자"
      };
      
      await updateDoc(userRef, updateData);
      
      // 활동 로그 추가
      const activityRef = doc(collection(db, "activities"));
      await setDoc(activityRef, {
        userId: id,
        nickname: newNick,
        type: ACTIVITY_TYPES.ADMIN_ACTION,
        description: `관리자에 의한 정보 수정 (등급: ${user.grade}, 직책: ${user.role})`,
        timestamp: serverTimestamp(),
        performedBy: localStorage.getItem("nickname") || "관리자"
      });
      
      // 닉네임이 변경된 경우 관련 컬렉션도 업데이트
      if (newNick !== user.originalData.nickname) {
        const updateCollections = ["posts", "comments", "messages", "freeposts", "songs", "advice"];
        const batch = writeBatch(db);
        let batchCount = 0;
        const MAX_BATCH_SIZE = 500;
        
        for (let col of updateCollections) {
          const q = query(collection(db, col), where("uid", "==", id));
          const snap = await getDocs(q);
          
          snap.forEach(docSnap => {
            if (batchCount >= MAX_BATCH_SIZE) {
              // 배치 크기 제한에 도달하면 커밋하고 새 배치 시작
              batch.commit();
              batchCount = 0;
            }
            
            batch.update(doc(db, col, docSnap.id), { 
              nickname: newNick,
              updatedAt: serverTimestamp()
            });
            batchCount++;
          });
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
      }
      
      // 사용자 목록 및 데이터 업데이트
      setUsers(users.map(u => {
        if (u.id === id) {
          return {
            ...u, 
            nickname: newNick, 
            originalData: {
              ...u.originalData,
              nickname: newNick,
              grade: user.grade || "🍒",
              role: user.role || "일반"
            }
          };
        }
        return u;
      }));
      
      // 전역 등급 정보 업데이트
      if (setGrades) {
        setGrades(prev => ({
          ...prev,
          [newNick]: user.grade || "🍒"
        }));
      }
      
      showAlert("변경사항이 저장되었습니다", "success");
    } catch (error) {
      console.error("사용자 정보 업데이트 오류:", error);
      showAlert("사용자 정보 저장 중 오류가 발생했습니다", "error");
    } finally {
      setProcessing(false);
      setProcessingNickname("");
    }
  };

  // 사용자 삭제
  const deleteUser = (id) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    
    setConfirmMessage(`정말 '${user.nickname}' 사용자를 탈퇴시키겠습니까? 이 작업은 되돌릴 수 없습니다.`);
    setConfirmAction(() => async () => {
      setProcessing(true);
      try {
        setProcessingNickname(user.nickname);
        await deleteDoc(doc(db, "users", id));
        
        // 활동 기록 추가
        const activityRef = doc(collection(db, "activities"));
        await setDoc(activityRef, {
          userId: id,
          nickname: user.nickname,
          type: ACTIVITY_TYPES.ADMIN_ACTION,
          description: "관리자에 의한 계정 삭제",
          timestamp: serverTimestamp(),
          performedBy: localStorage.getItem("nickname") || "관리자"
        });
        
        setUsers(users.filter(u => u.id !== id));
        showAlert(`${user.nickname} 사용자가 탈퇴 처리되었습니다`, "success");
        
        // 사용자 카운트 업데이트
        setUserCount(prev => prev - 1);
      } catch (error) {
        console.error("사용자 삭제 오류:", error);
        showAlert("사용자 삭제 중 오류가 발생했습니다", "error");
      } finally {
        setProcessing(false);
        setProcessingNickname("");
      }
    });
    setShowConfirmModal(true);
  };

  // 선택된 사용자 일괄 처리
const executeBulkAction = () => {
  if (!bulkAction || selectedUsers.length === 0) {
    showAlert("작업과 사용자를 선택해주세요", "info");
    return;
  }
  
  const selectedCount = selectedUsers.length;
  let confirmMsg = "";
  
  switch (bulkAction) {
    case "grade":
      confirmMsg = `선택한 ${selectedCount}명의 사용자 등급을 '${GRADES.find(g => g.value === bulkGrade)?.label}'로 변경하시겠습니까?`;
      break;
    case "role":
      confirmMsg = `선택한 ${selectedCount}명의 사용자 직책을 '${bulkRole}'로 변경하시겠습니까?`;
      break;
    case "delete":
      confirmMsg = `선택한 ${selectedCount}명의 사용자를 탈퇴시키겠습니까? 이 작업은 되돌릴 수 없습니다.`;
      break;
    default:
      return;
  }
  
  setConfirmMessage(confirmMsg);
  setConfirmAction(() => async () => {
    setProcessing(true);
    try {
      let batch = writeBatch(db);
      let activityBatch = writeBatch(db);
      let batchCount = 0;
      const MAX_BATCH_SIZE = 500;
      
      for (const userId of selectedUsers) {
        const user = users.find(u => u.id === userId);
        if (!user) continue;
        
        const userRef = doc(db, "users", userId);
        
        switch (bulkAction) {
          case "grade":
            batch.update(userRef, { 
              grade: bulkGrade,
              updatedAt: serverTimestamp(),
              updatedBy: localStorage.getItem("nickname") || "관리자"
            });
            
            // 활동 로그 추가
            const gradeActivityRef = doc(collection(db, "activities"));
            activityBatch.set(gradeActivityRef, {
              userId,
              nickname: user.nickname,
              type: ACTIVITY_TYPES.ADMIN_ACTION,
              description: `관리자에 의한 등급 변경: ${user.grade || "없음"} → ${bulkGrade}`,
              timestamp: serverTimestamp(),
              performedBy: localStorage.getItem("nickname") || "관리자"
            });
            break;
            
          case "role":
            batch.update(userRef, { 
              role: bulkRole,
              updatedAt: serverTimestamp(),
              updatedBy: localStorage.getItem("nickname") || "관리자"
            });
            
            // 활동 로그 추가
            const roleActivityRef = doc(collection(db, "activities"));
            activityBatch.set(roleActivityRef, {
              userId,
              nickname: user.nickname,
              type: ACTIVITY_TYPES.ADMIN_ACTION,
              description: `관리자에 의한 직책 변경: ${user.role || "없음"} → ${bulkRole}`,
              timestamp: serverTimestamp(),
              performedBy: localStorage.getItem("nickname") || "관리자"
            });
            break;
            
          case "delete":
            batch.delete(userRef);
            
            // 활동 로그 추가
            const deleteActivityRef = doc(collection(db, "activities"));
            activityBatch.set(deleteActivityRef, {
              userId,
              nickname: user.nickname,
              type: ACTIVITY_TYPES.ADMIN_ACTION,
              description: "관리자에 의한 일괄 계정 삭제",
              timestamp: serverTimestamp(),
              performedBy: localStorage.getItem("nickname") || "관리자"
            });
            break;
        }
        
        batchCount++;
        
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          await activityBatch.commit();
          batch = writeBatch(db);
          activityBatch = writeBatch(db);
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
        await activityBatch.commit();
      }
      
      // UI 업데이트
      if (bulkAction === "delete") {
        setUsers(users.filter(u => !selectedUsers.includes(u.id)));
        
        // 사용자 카운트 업데이트
        setUserCount(prev => prev - selectedUsers.length);
      } else {
        setUsers(users.map(u => {
          if (selectedUsers.includes(u.id)) {
            const updates = bulkAction === "grade" 
              ? { grade: bulkGrade }
              : { role: bulkRole };
              
            return {
              ...u,
              ...updates,
              originalData: {
                ...u.originalData,
                ...updates
              }
            };
          }
          return u;
        }));
        
        // 전역 등급 정보 업데이트 (등급 변경 시)
        if (bulkAction === "grade" && setGrades) {
          const updatedGrades = { ...globalGrades };
          users.forEach(u => {
            if (selectedUsers.includes(u.id) && u.nickname) {
              updatedGrades[u.nickname] = bulkGrade;
            }
          });
          setGrades(updatedGrades);
        }
      }
      
      setSelectedUsers([]);
      showAlert(`${selectedCount}명의 사용자에 대한 일괄 처리가 완료되었습니다`, "success");
    } catch (error) {
      console.error("일괄 처리 오류:", error);
      showAlert("일괄 처리 중 오류가 발생했습니다", "error");
    } finally {
      setProcessing(false);
    }
  });
  setShowConfirmModal(true);
};

  // 사용자 선택 토글
  const toggleUserSelection = (id) => {
    setSelectedUsers(prev => 
      prev.includes(id) 
        ? prev.filter(userId => userId !== id) 
        : [...prev, id]
    );
  };

 // 모든 사용자 선택/해제 토글
  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(user => user.id));
    }
  };

  // 전체 게시글 닉네임 복구
const fixAllMissingNicknames = () => {
  setConfirmMessage("모든 게시글의 누락된 닉네임을 복구하시겠습니까? 이 작업은 시간이 오래 걸릴 수 있습니다.");
  setConfirmAction(() => async () => {
    setProcessing(true);
    try {
      const collections = ["posts", "freeposts", "songs", "advice", "comments", "messages"];
      let fixedCount = 0;

      // 사용자 UID -> 닉네임 매핑 생성
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
        let batch = writeBatch(db);
        let batchCount = 0;
        const MAX_BATCH_SIZE = 500;
        
        for (const docSnap of postSnap.docs) {
          const data = docSnap.data();
          const uid = data.uid;
          
          if ((!data.nickname || data.nickname.trim() === "") && uid && uidToNick[uid]) {
            if (batchCount >= MAX_BATCH_SIZE) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
            
            batch.update(doc(db, col, docSnap.id), {
              nickname: uidToNick[uid],
              updatedAt: serverTimestamp()
            });
            
            batchCount++;
            fixedCount++;
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
      }

      // 활동 로그 추가
      const activityRef = doc(collection(db, "activities"));
      await setDoc(activityRef, {
        type: ACTIVITY_TYPES.ADMIN_ACTION,
        description: `누락된 닉네임 일괄 복구 (${fixedCount}개 항목)`,
        timestamp: serverTimestamp(),
        performedBy: localStorage.getItem("nickname") || "관리자"
      });

      showAlert(`✅ ${fixedCount}개의 게시글 닉네임을 복구했습니다.`, "success");
    } catch (error) {
      console.error("닉네임 복구 오류:", error);
      showAlert("닉네임 복구 중 오류가 발생했습니다", "error");
    } finally {
      setProcessing(false);
    }
  });
  setShowConfirmModal(true);
};


  // 사용자 데이터 내보내기
  const exportUsersData = async () => {
    setProcessing(true);
    try {
      // 모든 사용자 가져오기
      const userSnap = await getDocs(collection(db, "users"));
      const userData = userSnap.docs.map(doc => {
        const data = doc.data();
        // 민감한 정보 제외
        const { password, passwordHash, ...safeData } = data;
        
        // Timestamp 객체를 변환
        const formattedData = { ...safeData, id: doc.id };
        if (formattedData.createdAt) {
          try {
            formattedData.createdAt = formattedData.createdAt.toDate().toISOString();
          } catch (e) {
            formattedData.createdAt = null;
          }
        }
        if (formattedData.updatedAt) {
          try {
            formattedData.updatedAt = formattedData.updatedAt.toDate().toISOString();
          } catch (e) {
            formattedData.updatedAt = null;
          }
        }
        
        return formattedData;
      });
      
      // 형식에 따라 다른 방식으로 내보내기
      if (exportFormat === "json") {
        const jsonData = JSON.stringify(userData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else if (exportFormat === "csv") {
        // 모든 가능한 키 수집
        const allKeys = new Set();
        userData.forEach(user => {
          Object.keys(user).forEach(key => allKeys.add(key));
        });
        
        const keys = Array.from(allKeys);
        
        // CSV 헤더 행
        let csvContent = keys.join(',') + '\n';
        
        // 데이터 행 추가
        userData.forEach(user => {
          const row = keys.map(key => {
            const value = user[key] !== undefined ? user[key] : '';
            // 콤마가 있는 경우 값을 따옴표로 감싸기
            if (value !== null && typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          });
          csvContent += row.join(',') + '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
      
      showAlert("사용자 데이터를 내보냈습니다", "success");
    } catch (error) {
      console.error("데이터 내보내기 오류:", error);
      showAlert("데이터 내보내기 중 오류가 발생했습니다", "error");
    } finally {
      setProcessing(false);
    }
  };

  // 사용자 일괄 가져오기
  const importUsersData = async () => {
    if (!importData.trim()) {
      showAlert("가져올 데이터를 입력해주세요", "error");
      return;
    }
    
    try {
      let parsedData = JSON.parse(importData);
      if (!Array.isArray(parsedData)) {
        showAlert("올바른 형식의 데이터를 입력해주세요 (JSON 배열)", "error");
        return;
      }
      
      setConfirmMessage(`${parsedData.length}명의 사용자 데이터를 가져오시겠습니까?`);
      setConfirmAction(() => async () => {
        setProcessing(true);
        try {
          let importedCount = 0;
          let updatedCount = 0;
          let errorCount = 0;
          
          const batch = writeBatch(db);
          const activityBatch = writeBatch(db);
          let batchCount = 0;
          const MAX_BATCH_SIZE = 500;
          
          for (const userData of parsedData) {
            try {
              // 필수 필드 확인
              if (!userData.nickname) {
                errorCount++;
                continue;
              }
              
              // createdAt, updatedAt 필드 변환
              const processedData = { ...userData };
              if (typeof processedData.createdAt === 'string') {
                processedData.createdAt = Timestamp.fromDate(new Date(processedData.createdAt));
              } else if (!processedData.createdAt) {
                processedData.createdAt = serverTimestamp();
              }
              
              if (typeof processedData.updatedAt === 'string') {
                processedData.updatedAt = Timestamp.fromDate(new Date(processedData.updatedAt));
              } else {
                processedData.updatedAt = serverTimestamp();
              }
              
              // ID 추출 및 제거
              const { id, ...dataWithoutId } = processedData;
              
              // 기존 사용자 확인
              let userExists = false;
              if (id) {
                const userRef = doc(db, "users", id);
                const userSnap = await getDoc(userRef);
                userExists = userSnap.exists();
              }
              
              if (userExists) {
                // 기존 사용자 업데이트
                const userRef = doc(db, "users", id);
                batch.update(userRef, {
                  ...dataWithoutId,
                  updatedAt: serverTimestamp(),
                  updatedBy: localStorage.getItem("nickname") || "관리자"
                });
                
                const activityRef = doc(collection(db, "activities"));
                activityBatch.set(activityRef, {
                  userId: id,
                  nickname: dataWithoutId.nickname,
                  type: ACTIVITY_TYPES.ADMIN_ACTION,
                  description: "관리자에 의한 데이터 가져오기 업데이트",
                  timestamp: serverTimestamp(),
                  performedBy: localStorage.getItem("nickname") || "관리자"
                });
                
                updatedCount++;
              } else {
                // 새 사용자 생성
                const userRef = doc(collection(db, "users"));
                batch.set(userRef, {
                  ...dataWithoutId,
                  createdAt: serverTimestamp(),
                  createdBy: localStorage.getItem("nickname") || "관리자",
                  isActive: true
                });
                
                const activityRef = doc(collection(db, "activities"));
                activityBatch.set(activityRef, {
                  userId: userRef.id,
                  nickname: dataWithoutId.nickname,
                  type: ACTIVITY_TYPES.ADMIN_ACTION,
                  description: "관리자에 의한 데이터 가져오기 생성",
                  timestamp: serverTimestamp(),
                  performedBy: localStorage.getItem("nickname") || "관리자"
                });
                
                importedCount++;
              }
              
              batchCount++;
              
              if (batchCount >= MAX_BATCH_SIZE) {
                await batch.commit();
                await activityBatch.commit();
                batch = writeBatch(db);
                activityBatch = writeBatch(db);
                batchCount = 0;
              }
            } catch (error) {
              console.error("사용자 가져오기 오류:", error);
              errorCount++;
            }
          }
          
          if (batchCount > 0) {
            await batch.commit();
            await activityBatch.commit();
          }
          
          showAlert(`✅ ${importedCount}명 생성, ${updatedCount}명 업데이트, ${errorCount}개 오류`, "success");
          setShowImportModal(false);
          setImportData("");
          
          // 사용자 카운트 업데이트
          setUserCount(prev => prev + importedCount);
          
        } catch (error) {
          console.error("데이터 가져오기 오류:", error);
          showAlert("데이터 가져오기 중 오류가 발생했습니다", "error");
        } finally {
          setProcessing(false);
        }
      });
      setShowConfirmModal(true);
    } catch (error) {
      console.error("JSON 파싱 오류:", error);
      showAlert("올바른 JSON 형식이 아닙니다", "error");
    }
  };

  // 사용자 편집 모드 토글
  const toggleEditMode = (userId) => {
    setEditingUser(editingUser === userId ? null : userId);
  };

  // 알림 메시지 표시
  const showAlert = (message, type) => {
    setAlertMessage(message);
    setAlertType(type);
    
    setTimeout(() => {
      setAlertMessage("");
      setAlertType("");
    }, 3000);
  };

  // 확인 창 닫기
  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setConfirmMessage("");
    setConfirmAction(() => {});
  };

  // 확인 창에서 확인 클릭
  const handleConfirm = () => {
    closeConfirmModal();
    confirmAction();
  };

  // 스타일 정의
  const styles = {
    container: {
      backgroundColor: theme.background,
      minHeight: "100vh",
      padding: "2rem",
      fontFamily: "sans-serif",
      color: theme.text,
      transition: "background-color 0.3s"
    },
    header: {
      marginBottom: "1.5rem",
      fontSize: "1.8rem",
      color: theme.primary
    },
    searchContainer: {
      display: "flex",
      flexWrap: "wrap",
      gap: "1rem",
      marginBottom: "1.5rem",
      alignItems: "center"
    },
    input: {
      padding: "0.6rem",
      width: "250px",
      borderRadius: "8px",
      border: `1px solid ${theme.secondary}`,
      backgroundColor: theme.inputBg,
      color: theme.text
    },
    select: {
      padding: "0.6rem",
      borderRadius: "8px",
      border: `1px solid ${theme.secondary}`,
      backgroundColor: theme.inputBg,
      color: theme.text
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      backgroundColor: theme.surface,
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
    },
    tableHead: {
      backgroundColor: theme.secondary,
      color: darkMode ? theme.text : "#fff",
      textAlign: "left"
    },
    th: {
      padding: "0.8rem",
      fontWeight: "bold",
      position: "relative"
    },
    tr: {
      borderBottom: `1px solid ${theme.border}`,
      transition: "background-color 0.2s"
    },
    trSelected: {
      backgroundColor: darkMode ? "#3a1f5d" : "#f0e6ff"
    },
    td: {
      padding: "0.6rem",
      verticalAlign: "middle"
    },
    smallInput: {
      border: `1px solid ${theme.secondary}`,
      borderRadius: "6px",
      padding: "0.3rem",
      width: "120px",
      marginRight: "0.5rem",
      color: theme.text,
      backgroundColor: theme.inputBg
    },
    saveButton: {
      backgroundColor: theme.primary,
      border: "none",
      borderRadius: "6px",
      padding: "0.3rem 0.7rem",
      color: "#fff",
      cursor: "pointer",
      transition: "background-color 0.2s"
    },
    smallSelect: {
      border: `1px solid ${theme.secondary}`,
      borderRadius: "6px",
      padding: "0.3rem",
      width: "100px",
      color: theme.text,
      backgroundColor: theme.inputBg
    },
    logButton: {
      backgroundColor: darkMode ? "#333" : theme.secondary,
      border: "none",
      borderRadius: "6px",
      padding: "0.4rem 0.7rem",
      cursor: "pointer",
      color: darkMode ? theme.primary : theme.primaryDark
    },
    deleteButton: {
      backgroundColor: theme.error,
      border: "none",
      borderRadius: "6px",
      padding: "0.4rem 0.7rem",
      color: "white",
      cursor: "pointer"
    },
    bulkActionContainer: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5rem",
      alignItems: "center",
      marginTop: "1rem",
      marginBottom: "1rem",
      padding: "1rem",
      borderRadius: "8px",
      backgroundColor: theme.surfaceHighlight
    },
    bulkActionButton: {
      backgroundColor: theme.primary,
      color: "#fff",
      padding: "0.5rem 1rem",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      transition: "background-color 0.2s"
    },
     loadMoreButton: {
      width: "100%",
      padding: "0.8rem",
      marginTop: "1rem",
      backgroundColor: theme.primary,
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "background-color 0.2s"
    },
    actionButton: {
      backgroundColor: theme.primaryDark,
      color: "#fff",
      padding: "0.7rem 1.2rem",
      borderRadius: "8px",
      fontWeight: "bold",
      fontSize: "14px",
      border: "none",
      cursor: "pointer",
      transition: "background-color 0.2s",
      marginRight: "0.5rem",
      marginBottom: "0.5rem"
    },
    filterTabs: {
      display: "flex",
      gap: "0.5rem",
      marginBottom: "1rem"
    },
    filterTab: {
      padding: "0.5rem 1rem",
      borderRadius: "8px",
      cursor: "pointer",
      backgroundColor: theme.surfaceHighlight,
      color: theme.text,
      transition: "all 0.2s"
    },
    activeFilterTab: {
      backgroundColor: theme.primary,
      color: "#fff"
    },
    sortButton: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: darkMode ? "#fff" : "#000",
      display: "flex",
      alignItems: "center",
      padding: "0 4px"
    },
    modalOverlay: {
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
    },
    modalContent: {
      width: "400px",
      padding: "2rem",
      backgroundColor: theme.surface,
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
    },
    largeModalContent: {
      width: "800px",
      maxWidth: "90vw",
      maxHeight: "90vh",
      overflow: "auto",
      padding: "2rem",
      backgroundColor: theme.surface,
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
    },
    modalButtons: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "1rem",
      marginTop: "1.5rem"
    },
    cancelButton: {
      padding: "0.6rem 1.2rem",
      borderRadius: "6px",
      border: "none",
      backgroundColor: darkMode ? "#444" : "#e0e0e0",
      color: darkMode ? "#fff" : "#333",
      cursor: "pointer"
    },
    confirmButton: {
      padding: "0.6rem 1.2rem",
      borderRadius: "6px",
      border: "none",
      backgroundColor: theme.error,
      color: "#fff",
      cursor: "pointer"
    },
    primaryButton: {
      padding: "0.6rem 1.2rem",
      borderRadius: "6px",
      border: "none",
      backgroundColor: theme.primary,
      color: "#fff",
      cursor: "pointer"
    },
    alertContainer: {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "1rem",
      borderRadius: "8px",
      zIndex: 1001,
      animation: "fadeIn 0.3s, fadeOut 0.3s 2.7s",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      maxWidth: "400px"
    },
    statusIndicator: {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      padding: "0.5rem 1rem",
      borderRadius: "20px",
      backgroundColor: theme.primary,
      color: "#fff",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
    },
    checkbox: {
      cursor: "pointer",
      width: "18px",
      height: "18px"
    },
    editIcon: {
      cursor: "pointer",
      marginLeft: "0.5rem",
      fontSize: "16px",
      color: theme.primary
    },
    pagination: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "1rem"
    },
    userCount: {
      fontSize: "14px",
      color: theme.textSecondary
    },
    loadingContainer: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "200px"
    },
    loadingSpinner: {
      border: `4px solid ${theme.background}`,
      borderTop: `4px solid ${theme.primary}`,
      borderRadius: "50%",
      width: "40px",
      height: "40px",
      animation: "spin 1s linear infinite"
    },
    activityItem: {
      padding: "12px",
      marginBottom: "8px",
      borderRadius: "8px",
      backgroundColor: darkMode ? "#2d2d30" : "#f5f5f5"
    },
    textarea: {
      width: "100%",
      minHeight: "200px",
      padding: "12px",
      borderRadius: "8px",
      border: `1px solid ${theme.border}`,
      backgroundColor: theme.inputBg,
      color: theme.text,
      fontFamily: "monospace",
      resize: "vertical",
      marginBottom: "1rem"
    },
    userDetailsList: {
      margin: "0",
      padding: "0",
      listStyle: "none"
    },
    userDetailsItem: {
      padding: "8px 0",
      borderBottom: `1px solid ${theme.border}`
    },
    addUserForm: {
      padding: "1.5rem",
      backgroundColor: theme.surfaceHighlight,
      borderRadius: "12px",
      marginBottom: "1.5rem"
    },
    formRow: {
      marginBottom: "1rem"
    },
    formLabel: {
      display: "block",
      marginBottom: "0.5rem",
      fontWeight: "bold"
    }
  };

  return (
    <div style={styles.container}>
      {/* 알림 메시지 */}
      {alertMessage && (
        <div style={{
          ...styles.alertContainer,
          backgroundColor: alertType === "success" ? theme.success : 
                          alertType === "error" ? theme.error : 
                          theme.secondary
        }}>
          <div style={{ color: "#fff" }}>{alertMessage}</div>
        </div>
      )}
      
      {/* 처리 중 상태 표시 */}
      {processing && (
        <div style={styles.statusIndicator}>
          <span>⚙️ 처리 중...</span>
          {processingNickname && <span>{processingNickname}</span>}
        </div>
      )}
      
      {/* 확인 모달 */}
      {showConfirmModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: theme.text, marginTop: 0 }}>확인</h3>
            <p style={{ color: theme.text }}>{confirmMessage}</p>
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={closeConfirmModal}>취소</button>
              <button style={styles.confirmButton} onClick={handleConfirm}>확인</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 사용자 활동 로그 모달 */}
      {showActivityModal && selectedUserActivity && (
        <div style={styles.modalOverlay}>
          <div style={styles.largeModalContent}>
            <h3 style={{ color: theme.text, marginTop: 0 }}>
              {selectedUserActivity.nickname}님의 활동 기록
            </h3>
            
            {loadingActivity ? (
              <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
              </div>
            ) : (
              <>
                {selectedUserActivity.activities && selectedUserActivity.activities.length > 0 ? (
                  <div style={{ maxHeight: "500px", overflow: "auto" }}>
                    {selectedUserActivity.activities.map((activity, idx) => (
                      <div key={idx} style={styles.activityItem}>
                        <div style={{ fontWeight: "bold" }}>
                          {activity.type || "활동"} - {activity.formattedTime}
                        </div>
                        <div>{activity.description || "세부 정보 없음"}</div>
                        {activity.performedBy && (
                          <div style={{ fontSize: "12px", color: theme.textSecondary }}>
                            수행자: {activity.performedBy}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: theme.text }}>활동 기록이 없습니다.</p>
                )}
              </>
            )}
            
            <div style={styles.modalButtons}>
              <button 
                style={styles.cancelButton} 
                onClick={() => setShowActivityModal(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 사용자 상세 정보 모달 */}
      {showUserDetails && selectedUserDetails && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: theme.text, marginTop: 0 }}>
              {selectedUserDetails.nickname}님의 상세 정보
            </h3>
            
            <ul style={styles.userDetailsList}>
              <li style={styles.userDetailsItem}>
                <strong>닉네임:</strong> {selectedUserDetails.nickname || "없음"}
              </li>
              <li style={styles.userDetailsItem}>
                <strong>이메일:</strong> {selectedUserDetails.email || "없음"}
              </li>
              <li style={styles.userDetailsItem}>
                <strong>등급:</strong> {selectedUserDetails.grade || "없음"}
              </li>
              <li style={styles.userDetailsItem}>
                <strong>직책:</strong> {selectedUserDetails.role || "없음"}
              </li>
              <li style={styles.userDetailsItem}>
                <strong>소개:</strong> {selectedUserDetails.introduction || "없음"}
              </li>
              <li style={styles.userDetailsItem}>
                <strong>가입일:</strong> {
                  selectedUserDetails.createdAt 
                    ? (selectedUserDetails.createdAt.toDate 
                        ? selectedUserDetails.createdAt.toDate().toLocaleString() 
                        : "날짜 정보 없음") 
                    : "날짜 정보 없음"
                }
              </li>
              <li style={styles.userDetailsItem}>
                <strong>최근 수정일:</strong> {
                  selectedUserDetails.updatedAt 
                    ? (selectedUserDetails.updatedAt.toDate 
                        ? selectedUserDetails.updatedAt.toDate().toLocaleString() 
                        : "날짜 정보 없음") 
                    : "날짜 정보 없음"
                }
              </li>
              {selectedUserDetails.createdBy && (
                <li style={styles.userDetailsItem}>
                  <strong>생성자:</strong> {selectedUserDetails.createdBy}
                </li>
              )}
              {selectedUserDetails.updatedBy && (
                <li style={styles.userDetailsItem}>
                  <strong>수정자:</strong> {selectedUserDetails.updatedBy}
                </li>
              )}
              <li style={styles.userDetailsItem}>
                <strong>ID:</strong> {selectedUserDetails.id || "없음"}
              </li>
            </ul>
            
            <div style={styles.modalButtons}>
              <button 
                style={styles.cancelButton} 
                onClick={() => setShowUserDetails(false)}
              >
                닫기
              </button>
              <button 
                style={styles.primaryButton} 
                onClick={() => {
                  setShowUserDetails(false);
                  fetchUserActivity(selectedUserDetails.id, selectedUserDetails.nickname);
                }}
              >
                활동 기록 보기
              </button>
            </div>
          </div>
        </div>
      )}
      
            {/* 일괄 가져오기 모달 */}
      {showImportModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.largeModalContent}>
            <h3 style={{ color: theme.text, marginTop: 0 }}>사용자 데이터 일괄 가져오기</h3>
            <p style={{ color: theme.text }}>
              JSON 형식의 사용자 데이터를 아래에 붙여넣으세요. 배열 형태로 여러 사용자를 한 번에 가져올 수 있습니다.
            </p>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder='[{"nickname": "사용자1", "grade": "🍒", "role": "일반"}, {"nickname": "사용자2", "grade": "🍒", "role": "일반"}]'
              style={styles.textarea}
            />
            <div style={styles.modalButtons}>
              <button 
                style={styles.cancelButton} 
                onClick={() => setShowImportModal(false)}
              >
                취소
              </button>
              <button 
                style={styles.primaryButton} 
                onClick={importUsersData}
                disabled={processing || !importData.trim()}
              >
                가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={styles.header}>👑 관리자 회원 관리</h2>
      
      {/* 새 사용자 추가 폼 */}
      {addUserMode && (
        <div style={styles.addUserForm}>
          <h3 style={{ marginTop: 0, color: theme.primary }}>새 사용자 추가</h3>
          
          <div style={styles.formRow}>
            <label style={styles.formLabel}>닉네임 *</label>
            <input
              type="text"
              value={newUser.nickname}
              onChange={(e) => setNewUser({...newUser, nickname: e.target.value})}
              placeholder="필수 입력"
              style={styles.input}
              required
            />
          </div>
          
          <div style={styles.formRow}>
            <label style={styles.formLabel}>이메일</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              placeholder="선택 사항"
              style={styles.input}
            />
          </div>
          
          <div style={styles.formRow}>
            <label style={styles.formLabel}>등급</label>
            <select
              value={newUser.grade}
              onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
              style={styles.select}
            >
              {GRADES.map(grade => (
                <option key={grade.value} value={grade.value}>{grade.label}</option>
              ))}
            </select>
          </div>
          
          <div style={styles.formRow}>
            <label style={styles.formLabel}>직책</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({...newUser, role: e.target.value})}
              style={styles.select}
            >
              {ROLES.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
          
          <div style={styles.formRow}>
            <label style={styles.formLabel}>소개</label>
            <textarea
              value={newUser.introduction}
              onChange={(e) => setNewUser({...newUser, introduction: e.target.value})}
              placeholder="선택 사항"
              style={{...styles.input, height: "80px", resize: "vertical"}}
            />
          </div>
          
          <div style={{display: "flex", gap: "1rem", marginTop: "1.5rem"}}>
            <button 
              style={{...styles.cancelButton, flex: 1}}
              onClick={() => setAddUserMode(false)}
            >
              취소
            </button>
            <button 
              style={{...styles.primaryButton, flex: 2}}
              onClick={addNewUser}
              disabled={processing || !newUser.nickname.trim()}
            >
              새 사용자 추가
            </button>
          </div>
        </div>
      )}
      
      {/* 필터 탭 */}
      <div style={styles.filterTabs}>
        <div 
          style={{
            ...styles.filterTab,
            ...(activeFilter === "all" ? styles.activeFilterTab : {})
          }}
          onClick={() => changeFilter("all")}
        >
          전체 회원
        </div>
        <div 
          style={{
            ...styles.filterTab,
            ...(activeFilter === "admin" ? styles.activeFilterTab : {})
          }}
          onClick={() => changeFilter("admin")}
        >
          관리자
        </div>
        <div 
          style={{
            ...styles.filterTab,
            ...(activeFilter === "recent" ? styles.activeFilterTab : {})
          }}
          onClick={() => changeFilter("recent")}
        >
          최근 가입
        </div>
      </div>
      
      {/* 작업 버튼 영역 */}
      <div style={{ marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button 
          style={styles.actionButton}
          onClick={() => setAddUserMode(!addUserMode)}
        >
          {addUserMode ? "➖ 사용자 추가 닫기" : "➕ 새 사용자 추가"}
        </button>
        
        <button 
          style={styles.actionButton}
          onClick={() => setShowImportModal(true)}
          disabled={processing}
        >
          📥 사용자 일괄 가져오기
        </button>
        
        <div style={{ display: "flex", alignItems: "center" }}>
          <select 
            value={exportFormat} 
            onChange={(e) => setExportFormat(e.target.value)}
            style={{...styles.select, marginRight: "0.5rem"}}
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
          <button 
            style={styles.actionButton}
            onClick={exportUsersData}
            disabled={processing}
          >
            📤 사용자 내보내기
          </button>
        </div>
      </div>

      {/* 검색 및 정렬 영역 */}
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="닉네임 또는 이메일 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.input}
        />
        
        <select
          onChange={(e) => setSortBy(e.target.value)}
          value={sortBy}
          style={styles.select}
        >
          <option value="nickname">닉네임순</option>
          <option value="grade">등급순</option>
          <option value="role">직책순</option>
          <option value="createdAt">가입일순</option>
        </select>
        
        <button 
          onClick={toggleSortDirection}
          style={{
            ...styles.saveButton,
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}
        >
          {sortDirection === "asc" ? "오름차순" : "내림차순"}
          {sortDirection === "asc" ? " ↑" : " ↓"}
        </button>
        
        <div style={styles.userCount}>
          전체 사용자: {userCount}명
        </div>
      </div>
      
      {/* 일괄 작업 영역 */}
      {selectedUsers.length > 0 && (
        <div style={styles.bulkActionContainer}>
          <span style={{ fontWeight: "bold" }}>
            {selectedUsers.length}명의 사용자 선택됨
          </span>
          
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            style={styles.select}
          >
            <option value="">작업 선택</option>
            <option value="grade">등급 변경</option>
            <option value="role">직책 변경</option>
            <option value="delete">일괄 탈퇴</option>
          </select>
          
          {bulkAction === "grade" && (
            <select
              value={bulkGrade}
              onChange={(e) => setBulkGrade(e.target.value)}
              style={styles.select}
            >
              {GRADES.map(grade => (
                <option key={grade.value} value={grade.value}>{grade.label}</option>
              ))}
            </select>
          )}
          
          {bulkAction === "role" && (
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              style={styles.select}
            >
              {ROLES.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          )}
          
          <button 
            onClick={executeBulkAction}
            style={{
              ...styles.bulkActionButton,
              backgroundColor: bulkAction === "delete" ? theme.error : theme.primary
            }}
            disabled={!bulkAction || processing}
          >
            {bulkAction === "delete" ? "일괄 탈퇴 실행" : "일괄 적용"}
          </button>
        </div>
      )}

      {/* 사용자 테이블 */}
      {loading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
        </div>
      ) : filteredUsers.length > 0 ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHead}>
                  <th style={{ ...styles.th, width: "40px" }}>
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleSelectAll}
                      style={styles.checkbox}
                    />
                  </th>
                  <th style={styles.th}>
                    닉네임
                    <button 
                      onClick={() => { 
                        setSortBy("nickname");
                        toggleSortDirection();
                      }}
                      style={styles.sortButton}
                      title="닉네임으로 정렬"
                    >
                      {sortBy === "nickname" ? (sortDirection === "asc" ? "↑" : "↓") : "⇵"}
                    </button>
                  </th>
                  <th style={styles.th}>닉네임 수정</th>
                  <th style={styles.th}>
                    등급
                    <button 
                      onClick={() => { 
                        setSortBy("grade");
                        toggleSortDirection();
                      }}
                      style={styles.sortButton}
                      title="등급으로 정렬"
                    >
                      {sortBy === "grade" ? (sortDirection === "asc" ? "↑" : "↓") : "⇵"}
                    </button>
                  </th>
                  <th style={styles.th}>
                    직책
                    <button 
                      onClick={() => { 
                        setSortBy("role");
                        toggleSortDirection();
                      }}
                      style={styles.sortButton}
                      title="직책으로 정렬"
                    >
                      {sortBy === "role" ? (sortDirection === "asc" ? "↑" : "↓") : "⇵"}
                    </button>
                  </th>
                  <th style={styles.th}>활동</th>
                  <th style={styles.th}>작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr 
                    key={user.id} 
                    style={{
                      ...styles.tr,
                      ...(selectedUsers.includes(user.id) ? styles.trSelected : {})
                    }}
                  >
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        style={styles.checkbox}
                      />
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span 
                          style={{ cursor: "pointer" }}
                          onClick={() => viewUserDetails(user)}
                          title="사용자 상세정보 보기"
                        >
                          {user.nickname || "이름 없음"}
                        </span>
                        <span title="사용자 편집" style={styles.editIcon} onClick={() => toggleEditMode(user.id)}>
                          ✏️
                        </span>
                      </div>
                      {user.email && <div style={{ fontSize: "12px", color: theme.textSecondary }}>{user.email}</div>}
                      {user.createdAt && (
                        <div style={{ fontSize: "12px", color: theme.textSecondary }}>
                          가입: {user.createdAt.toDate ? user.createdAt.toDate().toLocaleDateString() : "날짜 없음"}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <input
                        value={nicknameInputs[user.id] || ""}
                        onChange={(e) => handleNicknameInputChange(user.id, e.target.value)}
                        style={styles.smallInput}
                      />
                    </td>
                    <td style={styles.td}>
                      <select 
                        value={user.grade || "🍒"} 
                        onChange={(e) => handleGradeChange(user.id, e.target.value)} 
                        style={styles.smallSelect}
                      >
                        {GRADES.map(grade => (
                          <option key={grade.value} value={grade.value}>{grade.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <select 
                        value={user.role || "일반"} 
                        onChange={(e) => handleRoleChange(user.id, e.target.value)} 
                        style={styles.smallSelect}
                      >
                        {ROLES.map(role => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <button 
                        onClick={() => fetchUserActivity(user.id, user.nickname)} 
                        style={styles.logButton}
                      >
                        보기
                      </button>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button 
                          onClick={() => saveChanges(user.id)} 
                          style={styles.saveButton}
                          disabled={processing}
                        >
                          저장
                        </button>
                        <button 
                          onClick={() => deleteUser(user.id)} 
                          style={styles.deleteButton}
                          disabled={processing}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        
          {/* 사용자 추가 로드 */}
          {hasMore && (
            <button 
              onClick={loadMoreUsers} 
              style={styles.loadMoreButton}
              disabled={loadingMore || processing}
            >
              {loadingMore ? "불러오는 중..." : "더 많은 사용자 불러오기"}
            </button>
          )}
        </>
      ) : (
        <div style={{ 
          textAlign: "center", 
          padding: "3rem", 
          background: theme.surfaceHighlight,
          borderRadius: "8px",
          marginTop: "1rem" 
        }}>
          {searchTerm ? "검색 결과가 없습니다." : "표시할 사용자가 없습니다."}
        </div>
      )}

      {/* 추가 기능 버튼 */}
      <div style={{ marginTop: "2rem" }}>
        <button 
          onClick={fixAllMissingNicknames} 
          style={styles.actionButton}
          disabled={processing}
        >
          🛠 전체 게시글 닉네임 복구 실행
        </button>
      </div>
      
      {/* CSS 애니메이션 추가 */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          button:hover {
            filter: brightness(1.1);
          }
          
          button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            filter: brightness(1) !important;
          }
        `}
      </style>
    </div>
  );
}

AdminUserPage.propTypes = {
  darkMode: PropTypes.bool,
  globalGrades: PropTypes.object,
  setGrades: PropTypes.func
};

AdminUserPage.defaultProps = {
  darkMode: false,
  globalGrades: {}
};

export default AdminUserPage;
