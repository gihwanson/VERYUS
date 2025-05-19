import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, where, onSnapshot, getDocs, doc, getDoc, limit,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc // addDoc 추가
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, smallBtn, purpleBtn
} from "../components/style";
import CustomLink from "./CustomLink";
import Avatar from "./Avatar";

function UserProfile({ darkMode, globalProfilePics, globalGrades, currentUser }) {
  const { userNickname } = useParams();
  const [posts, setPosts] = useState([]);
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [commentedPosts, setCommentedPosts] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  const [userStats, setUserStats] = useState({ posts: 0, comments: 0, likes: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [showFollowerModal, setShowFollowerModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [activePostsCollection, setActivePostsCollection] = useState("all");
  const limitPerPage = 10;
  const observerRef = useRef();
  const nav = useNavigate();
  const me = localStorage.getItem("nickname");

  // 사용자 정보 로드
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        const userQuery = query(
          collection(db, "users"), 
          where("nickname", "==", userNickname),
          limit(1)
        );
        
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
          setError("사용자를 찾을 수 없습니다");
        } else {
          const user = {
            id: userSnapshot.docs[0].id,
            ...userSnapshot.docs[0].data()
          };
          setUserData(user);
          
          // 팔로워/팔로잉 상태 가져오기
          if (user.followers) {
            setFollowers(user.followers);
            setIsFollowing(user.followers.includes(me));
          }
          
          if (user.following) {
            setFollowing(user.following);
          }
        }
      } catch (err) {
        console.error("사용자 정보 로드 중 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다");
      } finally {
        setIsLoading(false);
      }
    };
    
    if (userNickname) {
      fetchUserData();
      setPage(1); // 새 프로필을 볼 때 페이지 초기화
      setIsLastPage(false);
    }
  }, [userNickname, me]);

  // 사용자 통계 업데이트
  useEffect(() => {
    setUserStats({
      posts: posts.length,
      comments: commentedPosts.length,
      likes: likedPosts.length
    });
  }, [posts.length, commentedPosts.length, likedPosts.length]);

  // Intersection Observer 설정 (무한 스크롤)
  useEffect(() => {
    if (!isLastPage && !isLoading) {
      const observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) {
            setPage(prev => prev + 1);
          }
        }, 
        { threshold: 0.5 }
      );
      
      if (observerRef.current) {
        observer.observe(observerRef.current);
      }
      
      return () => observer.disconnect();
    }
  }, [isLastPage, isLoading]);
  
  // 컬렉션에 따른 게시글 로드
  const fetchPosts = useCallback(async (collectionFilter = "all") => {
    setIsLoading(true);
    setPosts([]);
    setPage(1);
    setIsLastPage(false);
    setActivePostsCollection(collectionFilter);
    
    try {
      // 컬렉션 설정
      const collections = collectionFilter === "all" 
        ? ["posts", "freeposts", "songs", "advice"] 
        : [collectionFilter];
      
      const allPosts = [];
      
      for (const collectionName of collections) {
        const q = query(
          collection(db, collectionName),
          where("nickname", "==", userNickname),
          orderBy("createdAt", "desc"),
          limit(limitPerPage)
        );
        
        const snapshot = await getDocs(q);
        const postsFromCollection = snapshot.docs.map(doc => ({
          id: doc.id,
          collectionType: collectionName,
          ...doc.data()
        }));
        
        allPosts.push(...postsFromCollection);
      }
      
      const sortedPosts = allPosts.sort((a, b) => 
        b.createdAt?.seconds - a.createdAt?.seconds
      );
      
      setPosts(sortedPosts);
      if (sortedPosts.length < limitPerPage) {
        setIsLastPage(true);
      }
    } catch (err) {
      console.error("게시글 로드 중 오류:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userNickname, limitPerPage]);

  // 첫 게시글 로드
  useEffect(() => {
    if (activeTab === "posts") {
      fetchPosts(activePostsCollection);
    }
  }, [userNickname, activeTab, fetchPosts, activePostsCollection]);
  
  // 페이지 변경 시 추가 게시글 로드
  useEffect(() => {
    const loadMorePosts = async () => {
      if (page > 1 && activeTab === "posts" && !isLastPage) {
        try {
          setIsLoading(true);
          const collections = activePostsCollection === "all" 
            ? ["posts", "freeposts", "songs", "advice"] 
            : [activePostsCollection];
          
          const newPosts = [];
          
          for (const collectionName of collections) {
            const q = query(
              collection(db, collectionName),
              where("nickname", "==", userNickname),
              orderBy("createdAt", "desc"),
              limit(page * limitPerPage)
            );
            
            const snapshot = await getDocs(q);
            const postsFromCollection = snapshot.docs.map(doc => ({
              id: doc.id,
              collectionType: collectionName,
              ...doc.data()
            }));
            
            newPosts.push(...postsFromCollection);
          }
          
          const sortedPosts = newPosts.sort((a, b) => 
            b.createdAt?.seconds - a.createdAt?.seconds
          );
          
          // 이미 로드된 항목 제외
          const existingIds = new Set(posts.map(post => `${post.collectionType}-${post.id}`));
          const uniqueNewPosts = sortedPosts.filter(
            post => !existingIds.has(`${post.collectionType}-${post.id}`)
          );
          
          setPosts(prev => [...prev, ...uniqueNewPosts]);
          
          if (uniqueNewPosts.length < limitPerPage) {
            setIsLastPage(true);
          }
        } catch (err) {
          console.error("더 많은 게시글 로드 중 오류:", err);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    loadMorePosts();
  }, [page, posts, activeTab, userNickname, isLastPage, limitPerPage, activePostsCollection]);

  // 사용자가 댓글을 작성한 게시글 로드 (탭이 활성화되었을 때)
  useEffect(() => {
    if (activeTab !== "comments") return;
    
    const fetchCommentedPosts = async () => {
      try {
        setIsLoading(true);
        const allCommentedPosts = [];
        const collections = ["posts", "freeposts", "songs", "advice"];
        
        for (const collectionName of collections) {
          const commentCollectionName = `${collectionName}-comments`;
          
          // 사용자가 작성한 댓글 검색
          const commentsQuery = query(
            collection(db, commentCollectionName),
            where("nickname", "==", userNickname),
            orderBy("createdAt", "desc"),
            limit(limitPerPage * page)
          );
          
          const commentsSnapshot = await getDocs(commentsQuery);
          const commentDocs = commentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            collectionType: collectionName
          }));
          
          // 각 댓글의 원본 게시글 찾기
          for (const comment of commentDocs) {
            try {
              const postId = comment.postId;
              if (!postId) continue;
              
              const postDoc = await getDoc(doc(db, collectionName, postId));
              
              if (postDoc.exists()) {
                allCommentedPosts.push({
                  id: postDoc.id,
                  ...postDoc.data(),
                  collectionType: collectionName,
                  commentContent: comment.text,
                  commentDate: comment.createdAt,
                  commentId: comment.id
                });
              }
            } catch (err) {
              console.error(`댓글 ${comment.id}의 게시글을 찾는 중 오류:`, err);
            }
          }
        }
        
        // 댓글 작성 시간 기준 정렬
        const sortedPosts = allCommentedPosts.sort((a, b) => 
          b.commentDate?.seconds - a.commentDate?.seconds
        );
        
        setCommentedPosts(sortedPosts);
        
        if (sortedPosts.length < limitPerPage * page) {
          setIsLastPage(true);
        } else {
          setIsLastPage(false);
        }
      } catch (err) {
        console.error("댓글 게시글 로드 중 오류:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCommentedPosts();
  }, [userNickname, activeTab, page]);

  // 사용자가 좋아요한 게시글 로드 (탭이 활성화되었을 때)
  useEffect(() => {
    if (activeTab !== "likes") return;
    
    const fetchLikedPosts = async () => {
      try {
        setIsLoading(true);
        const collections = ["posts", "freeposts", "songs", "advice"];
        const allLikedPosts = [];
        
        for (const collectionName of collections) {
          // 좋아요를 수가 있고 사용자 닉네임이 포함된 게시글만 가져오기 위한 쿼리
          // Firebase는 배열 내 특정 값 포함 검색을 직접 지원함
          const postsQuery = query(
            collection(db, collectionName),
            where("likedBy", "array-contains", userNickname),
            orderBy("createdAt", "desc"),
            limit(limitPerPage * page)
          );
          
          const postsSnapshot = await getDocs(postsQuery);
          
          postsSnapshot.forEach(postDoc => {
            allLikedPosts.push({
              id: postDoc.id,
              ...postDoc.data(),
              collectionType: collectionName
            });
          });
        }
        
        // 게시글 생성 시간 기준 정렬
        const sortedPosts = allLikedPosts.sort((a, b) => 
          b.createdAt?.seconds - a.createdAt?.seconds
        );
        
        setLikedPosts(sortedPosts);
        
        if (sortedPosts.length < limitPerPage * page) {
          setIsLastPage(true);
        } else {
          setIsLastPage(false);
        }
      } catch (err) {
        console.error("좋아요 게시글 로드 중 오류:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchLikedPosts();
  }, [userNickname, activeTab, page]);

  // 팔로우/언팔로우 기능
  const handleFollowToggle = async () => {
    if (!me || !userData?.id) return;
    
    try {
      const userRef = doc(db, "users", userData.id);
      const myUserQuery = query(
        collection(db, "users"),
        where("nickname", "==", me),
        limit(1)
      );
      
      const myUserSnapshot = await getDocs(myUserQuery);
      
      if (myUserSnapshot.empty) {
        console.error("본인 사용자 정보를 찾을 수 없습니다.");
        return;
      }
      
      const myUserRef = doc(db, "users", myUserSnapshot.docs[0].id);
      
      if (isFollowing) {
        // 팔로우 해제
        await updateDoc(userRef, {
          followers: arrayRemove(me)
        });
        
        await updateDoc(myUserRef, {
          following: arrayRemove(userNickname)
        });
        
        setIsFollowing(false);
        setFollowers(prev => prev.filter(follower => follower !== me));
      } else {
        // 팔로우 추가
        await updateDoc(userRef, {
          followers: arrayUnion(me)
        });
        
        await updateDoc(myUserRef, {
          following: arrayUnion(userNickname)
        });
        
        setIsFollowing(true);
        setFollowers(prev => [...prev, me]);
        
        // 알림 생성 (알림 기능이 있을 경우)
        const notificationsRef = collection(db, "notifications");
        await addDoc(notificationsRef, {
          type: "follow",
          from: me,
          to: userNickname,
          createdAt: serverTimestamp(),
          read: false
        });
      }
    } catch (err) {
      console.error("팔로우 상태 변경 중 오류:", err);
    }
  };

  // 게시글 종류별 아이콘 및 텍스트
  const getPostTypeInfo = (type) => {
    switch (type) {
      case "posts":
        return { icon: "🎤", text: "듀엣/합창" };
      case "songs":
        return { icon: "🎵", text: "노래 추천" };
      case "advice":
        return { icon: "💬", text: "고민 상담" };
      case "freeposts":
        return { icon: "📝", text: "자유 게시판" };
      default:
        return { icon: "📄", text: "게시글" };
    }
  };

  // 날짜 포맷팅
  const formatDate = (timestamp) => {
    if (!timestamp) return "날짜 없음";
    
    const date = new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return "오늘";
    } else if (diffDays === 1) {
      return "어제";
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)}주 전`;
    } else if (diffDays < 365) {
      return `${Math.floor(diffDays / 30)}개월 전`;
    } else {
      return `${Math.floor(diffDays / 365)}년 전`;
    }
  };

  // 등급 이모지 가져오기
  const getGradeEmoji = (nickname) => {
    if (!globalGrades || !globalGrades[nickname]) return "";
    
    const gradeEmojis = {
      "체리": "🍒",
      "블루베리": "🫐",
      "키위": "🥝",
      "사과": "🍎",
      "멜론": "🍈",
      "수박": "🍉",
      "지구": "🌏",
      "토성": "🪐",
      "태양": "🌞"
    };
    
    return gradeEmojis[globalGrades[nickname]] || "";
  };

  // 스타일 정의
  const tabStyle = {
    display: "flex",
    gap: 2,
    marginBottom: 20,
    borderBottom: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    overflowX: "auto",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    "-webkit-overflow-scrolling": "touch"
  };
  
  const tabItemStyle = (isActive) => ({
    padding: "12px 20px",
    cursor: "pointer",
    borderBottom: isActive 
      ? `3px solid ${darkMode ? "#bb86fc" : "#7e57c2"}` 
      : "3px solid transparent",
    fontWeight: isActive ? "bold" : "normal",
    color: isActive 
      ? (darkMode ? "#bb86fc" : "#7e57c2") 
      : (darkMode ? "#bbb" : "#777"),
    whiteSpace: "nowrap"
  });
  
  const cardStyle = (isPrivate) => ({
    margin: "16px 0",
    padding: 16,
    borderRadius: 12,
    background: isPrivate
      ? (darkMode ? "#333" : "#f0f0f0")
      : (darkMode ? "#424242" : "#f3e7ff"),
    border: `1px solid ${isPrivate 
      ? (darkMode ? "#555" : "#ddd") 
      : (darkMode ? "#666" : "#b49ddb")}`,
    color: darkMode ? "#fff" : "#000",
    position: "relative",
    transition: "transform 0.2s, box-shadow 0.2s",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: `0 4px 8px rgba(0, 0, 0, ${darkMode ? "0.4" : "0.2"})`
    }
  });
  
  const linkStyle = {
    textDecoration: "none",
    color: darkMode ? "#bb86fc" : "#7e57c2",
    fontWeight: "bold"
  };
  
  const userCardStyle = {
    display: "flex",
    flexDirection: "column",
    borderRadius: 12,
    background: darkMode ? "#333" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#555" : "#b49ddb"}`,
    marginBottom: 30,
    overflow: "hidden"
  };
  
  const userHeaderStyle = {
    padding: "30px 20px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: darkMode 
      ? "linear-gradient(135deg, #2d2d2d, #333)" 
      : "linear-gradient(135deg, #e8ddf8, #f3e7ff)",
    position: "relative"
  };
  
  const profileImageStyle = {
    width: 100,
    height: 100,
    borderRadius: "50%",
    objectFit: "cover",
    border: `3px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`,
    boxShadow: `0 4px 10px rgba(0, 0, 0, ${darkMode ? "0.4" : "0.2"})`
  };
  
  const userInfoStyle = {
    padding: "0 20px 20px",
    textAlign: "center"
  };
  
  const userStatsStyle = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: "10px 20px",
    borderTop: `1px solid ${darkMode ? "#444" : "#dfd4ef"}`,
    borderBottom: `1px solid ${darkMode ? "#444" : "#dfd4ef"}`,
    background: darkMode ? "#2a2a2a" : "#e8ddf8",
    flexWrap: "wrap"
  };
  
  const statItemStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "8px 15px",
    cursor: "pointer",
    borderRadius: 8,
    transition: "background-color 0.2s",
    ":hover": {
      background: darkMode ? "#3a3a3a" : "#dfd4ef"
    }
  };
  
  const userActionStyle = {
    padding: 20,
    display: "flex",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap"
  };
  
  const buttonStyle = (primary = true) => ({
    padding: "10px 20px",
    background: primary
      ? (darkMode ? "#bb86fc" : "#7e57c2")
      : (darkMode ? "#555" : "#e0e0e0"),
    color: primary
      ? "#fff"
      : (darkMode ? "#ddd" : "#333"),
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "transform 0.2s, background-color 0.2s",
    ":hover": {
      transform: "translateY(-2px)",
      background: primary
        ? (darkMode ? "#c597fc" : "#8e68d1")
        : (darkMode ? "#666" : "#d0d0d0")
    },
    ":active": {
      transform: "translateY(0)"
    }
  });
  
  const postTypeLabel = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 12,
    fontSize: 12,
    marginRight: 8,
    color: "#fff",
    fontWeight: "normal"
  };
  
  const emptyStateStyle = {
    textAlign: "center",
    padding: "40px 20px",
    background: darkMode ? "#333" : "#f5f0ff",
    borderRadius: 12,
    color: darkMode ? "#aaa" : "#666",
    margin: "20px 0"
  };
  
  const filterBarStyle = {
    display: "flex",
    overflowX: "auto",
    gap: 8,
    padding: "0 0 10px",
    marginBottom: 10,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    "-webkit-overflow-scrolling": "touch"
  };
  
  const filterButtonStyle = (isActive) => ({
    padding: "6px 12px",
    borderRadius: 16,
    fontSize: 13,
    background: isActive 
      ? (darkMode ? "#9c27b0" : "#7e57c2")
      : (darkMode ? "#444" : "#e0e0e0"),
    color: isActive
      ? "#fff"
      : (darkMode ? "#ccc" : "#666"),
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap"
  });
  
  const modalOverlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000
  };
  
  const modalContentStyle = {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80vh",
    background: darkMode ? "#333" : "#fff",
    borderRadius: 12,
    padding: 20,
    overflow: "auto"
  };
  
  const userListItemStyle = {
    display: "flex",
    alignItems: "center",
    padding: 10,
    borderBottom: `1px solid ${darkMode ? "#444" : "#eee"}`,
    cursor: "pointer",
    transition: "background-color 0.2s",
    ":hover": {
      background: darkMode ? "#444" : "#f5f0ff"
    }
  };

  // 에러 발생 시
  if (error) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{
          padding: 30,
          textAlign: "center",
          background: darkMode ? "#333" : "#f3e7ff",
          borderRadius: 12,
          border: `1px solid ${darkMode ? "#555" : "#b49ddb"}`
        }}>
          <h2 style={{ color: darkMode ? "#bb86fc" : "#7e57c2" }}>🔍 사용자를 찾을 수 없습니다</h2>
          <p style={{ margin: "20px 0", color: darkMode ? "#ccc" : "#666" }}>
            {error}
          </p>
          <button 
            onClick={() => nav("/")} 
            style={buttonStyle()}
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      {/* 사용자 정보 카드 */}
      {userData ? (
        <div style={userCardStyle}>
          {/* 사용자 헤더 */}
          <div style={userHeaderStyle}>
            <img 
              src={globalProfilePics[userNickname] || userData.profilePicUrl || "https://via.placeholder.com/100"} 
              alt={`${userNickname}의 프로필 사진`}
              style={profileImageStyle}
            />
            
            <h2 style={{ 
              margin: "15px 0 5px", 
              color: darkMode ? "#fff" : "#333",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              {userNickname}
              {getGradeEmoji(userNickname) && (
                <span style={{ fontSize: 24 }}>{getGradeEmoji(userNickname)}</span>
              )}
            </h2>
            
            {userData.role && (
              <span style={{
                background: userData.role === "운영진" ? "#ff5722" :
                          userData.role === "리더" ? "#f44336" :
                          userData.role === "부운영진" ? "#ff9800" :
                          userData.role === "조장" ? "#4caf50" : "#9e9e9e",
                color: "#fff",
                padding: "3px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: "bold",
                marginTop: 5
              }}>
                {userData.role}
              </span>
            )}
          </div>
          
          {/* 사용자 소개 */}
          <div style={userInfoStyle}>
            <p style={{ 
              margin: "10px 0", 
              color: darkMode ? "#ddd" : "#555",
              fontSize: 15,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap"
            }}>
              {userData.introduction || "소개글이 없습니다."}
            </p>
            
            <div style={{ 
              fontSize: 13, 
              color: darkMode ? "#aaa" : "#777",
              marginTop: 10
            }}>
              가입일: {userData.createdAt 
                ? new Date(userData.createdAt.seconds * 1000).toLocaleDateString() 
                : "알 수 없음"}
            </div>
          </div>
          
          {/* 사용자 통계 */}
          <div style={userStatsStyle}>
                        <div style={statItemStyle} onClick={() => setActiveTab("posts")}>
              <span style={{ 
                fontWeight: "bold", 
                fontSize: 18,
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                {userStats.posts}
              </span>
              <span style={{ fontSize: 14 }}>게시글</span>
            </div>
            
            <div style={statItemStyle} onClick={() => setActiveTab("comments")}>
              <span style={{ 
                fontWeight: "bold", 
                fontSize: 18,
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                {userStats.comments}
              </span>
              <span style={{ fontSize: 14 }}>댓글</span>
            </div>
            
            <div style={statItemStyle} onClick={() => setActiveTab("likes")}>
              <span style={{ 
                fontWeight: "bold", 
                fontSize: 18,
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                {userStats.likes}
              </span>
              <span style={{ fontSize: 14 }}>좋아요</span>
            </div>
            
            <div style={statItemStyle} onClick={() => setShowFollowerModal(true)}>
              <span style={{ 
                fontWeight: "bold", 
                fontSize: 18,
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                {followers.length}
              </span>
              <span style={{ fontSize: 14 }}>팔로워</span>
            </div>
            
            <div style={statItemStyle} onClick={() => setShowFollowingModal(true)}>
              <span style={{ 
                fontWeight: "bold", 
                fontSize: 18,
                color: darkMode ? "#bb86fc" : "#7e57c2" 
              }}>
                {following.length}
              </span>
              <span style={{ fontSize: 14 }}>팔로잉</span>
            </div>
          </div>
          
          {/* 사용자 프로필 관련 액션 버튼 */}
          <div style={userActionStyle}>
            {userNickname === me ? (
              <>
                <button 
                  onClick={() => nav("/edit-profilepic")} 
                  style={buttonStyle(false)}
                >
                  <span role="img" aria-label="camera">📷</span> 프로필 사진 변경
                </button>
                <button 
                  onClick={() => nav("/edit-introduction")} 
                  style={buttonStyle(false)}
                >
                  <span role="img" aria-label="edit">✏️</span> 소개글 수정
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={handleFollowToggle} 
                  style={{
                    ...buttonStyle(true),
                    background: isFollowing 
                      ? (darkMode ? "#666" : "#999") 
                      : (darkMode ? "#bb86fc" : "#7e57c2")
                  }}
                >
                  <span role="img" aria-label="follow">
                    {isFollowing ? "✓" : "➕"}
                  </span>
                  {isFollowing ? "팔로잉" : "팔로우"}
                </button>
                <button 
                  onClick={() => nav(`/send-message/${userNickname}`)} 
                  style={buttonStyle(true)}
                >
                  <span role="img" aria-label="message">💌</span> 쪽지 보내기
                </button>
                <button 
                  onClick={() => nav(`/guestbook/${userNickname}`)} 
                  style={buttonStyle(false)}
                >
                  <span role="img" aria-label="guestbook">📝</span> 방명록 보기
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        !error && isLoading && (
          <div style={{ 
            textAlign: "center", 
            padding: 30,
            background: darkMode ? "#333" : "#f3e7ff",
            borderRadius: 12,
            margin: "20px 0"
          }}>
            <p>사용자 정보를 로드하는 중...</p>
          </div>
        )
      )}
      
      {/* 탭 메뉴 */}
      <div style={tabStyle}>
        <div 
          style={tabItemStyle(activeTab === "posts")}
          onClick={() => {
            setActiveTab("posts");
            setPage(1);
            setIsLastPage(false);
          }}
        >
          📄 작성한 글 ({userStats.posts})
        </div>
        <div 
          style={tabItemStyle(activeTab === "comments")}
          onClick={() => {
            setActiveTab("comments");
            setPage(1);
            setIsLastPage(false);
          }}
        >
          💬 댓글 단 글 ({userStats.comments})
        </div>
        <div 
          style={tabItemStyle(activeTab === "likes")}
          onClick={() => {
            setActiveTab("likes");
            setPage(1);
            setIsLastPage(false);
          }}
        >
          ❤️ 좋아요한 글 ({userStats.likes})
        </div>
      </div>
      
      {/* 게시글 필터 (작성한 글 탭에서만 표시) */}
      {activeTab === "posts" && (
        <div style={filterBarStyle}>
          <button
            style={filterButtonStyle(activePostsCollection === "all")}
            onClick={() => fetchPosts("all")}
          >
            📑 전체 ({posts.length})
          </button>
          <button
            style={filterButtonStyle(activePostsCollection === "posts")}
            onClick={() => fetchPosts("posts")}
          >
            🎤 듀엣/합창
          </button>
          <button
            style={filterButtonStyle(activePostsCollection === "freeposts")}
            onClick={() => fetchPosts("freeposts")}
          >
            📝 자유게시판
          </button>
          <button
            style={filterButtonStyle(activePostsCollection === "songs")}
            onClick={() => fetchPosts("songs")}
          >
            🎵 노래추천
          </button>
          <button
            style={filterButtonStyle(activePostsCollection === "advice")}
            onClick={() => fetchPosts("advice")}
          >
            💬 고민상담
          </button>
        </div>
      )}
      
      {/* 선택된 탭에 따른 내용 표시 */}
      {isLoading && page === 1 ? (
        <div style={{ 
          textAlign: "center", 
          padding: 20,
          background: darkMode ? "#333" : "#f5f0ff",
          borderRadius: 12,
          margin: "20px 0"
        }}>
          <p>게시글을 불러오는 중...</p>
        </div>
      ) : (
        <>
          {/* 작성한 글 */}
          {activeTab === "posts" && (
            <>
              {posts.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p style={{ fontSize: 18, marginBottom: 10 }}>📄 작성한 게시글이 없습니다</p>
                  {userNickname === me && (
                    <p style={{ fontSize: 14 }}>
                      첫 게시글을 작성해보세요!
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {posts.map(post => (
                    <div key={`${post.collectionType}-${post.id}`} style={cardStyle(post.isPrivate)}>
                      {post.isPrivate && (
                        <div style={{ 
                          position: "absolute", 
                          top: 12, 
                          right: 12,
                          background: "#ff9800",
                          color: "#fff",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}>
                          <span role="img" aria-label="private">🔒</span> 비공개
                        </div>
                      )}
                      
                      <div style={{ marginBottom: 8 }}>
                        <span 
                          style={{ 
                            ...postTypeLabel,
                            background: post.collectionType === "posts" ? "#9c27b0" :
                                      post.collectionType === "freeposts" ? "#2196f3" :
                                      post.collectionType === "songs" ? "#e91e63" : 
                                      "#4caf50"
                          }}
                        >
                          {getPostTypeInfo(post.collectionType).icon} {getPostTypeInfo(post.collectionType).text}
                        </span>
                        <span style={{ 
                          fontSize: 13, 
                          color: darkMode ? "#aaa" : "#666",
                          marginLeft: 4
                        }}>
                          {formatDate(post.createdAt)}
                        </span>
                      </div>
                      
                      <CustomLink
                        to={`/post/${post.collectionType === "posts" ? "duet" : 
                              post.collectionType === "freeposts" ? "free" :
                              post.collectionType === "songs" ? "song" : "advice"}/${post.id}`}
                        style={linkStyle}
                      >
                        <h3 style={{ 
                          margin: "8px 0", 
                          color: darkMode ? "#ddd" : "#333"
                        }}>
                          {post.title}
                        </h3>
                      </CustomLink>
                      
                      {/* 게시글 미리보기 */}
                      {!post.isPrivate && (
                        <p style={{ 
                          margin: "8px 0", 
                          color: darkMode ? "#bbb" : "#555",
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}>
                          {post.content}
                        </p>
                      )}
                      
                      {/* 게시글 통계 및 액션 */}
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between",
                        alignItems: "center", 
                        marginTop: 10 
                      }}>
                        <div style={{ 
                          fontSize: 13,
                          color: darkMode ? "#aaa" : "#777",
                          display: "flex",
                          gap: 10
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span role="img" aria-label="likes">❤️</span> {post.likes || 0}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span role="img" aria-label="comments">💬</span> {post.commentCount || 0}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span role="img" aria-label="views">👁️</span> {post.viewCount || 0}
                          </span>
                        </div>
                        
                        {/* 본인 게시글인 경우 수정/삭제 버튼 */}
                        {me === post.nickname && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              style={{
                                padding: "6px 10px",
                                background: darkMode ? "#555" : "#e0e0e0",
                                color: darkMode ? "#ddd" : "#333",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                nav(`/edit/${post.collectionType === "posts" ? "duet" : 
                                     post.collectionType === "freeposts" ? "free" :
                                     post.collectionType === "songs" ? "song" : "advice"}/${post.id}`);
                              }}
                            >
                              <span role="img" aria-label="edit">✏️</span> 수정
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* 무한 스크롤 로딩 지점 */}
                  {!isLastPage && (
                    <div 
                      ref={observerRef} 
                      style={{ 
                        height: 20, 
                        margin: "20px 0", 
                        textAlign: "center" 
                      }}
                    >
                      {isLoading && page > 1 && "더 불러오는 중..."}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          
          {/* 댓글 단 글 */}
          {activeTab === "comments" && (
            <>
              {commentedPosts.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p>💬 댓글을 작성한 게시글이 없습니다</p>
                </div>
              ) : (
                <>
                  {commentedPosts.map(post => (
                    <div key={`${post.collectionType}-${post.id}-${post.commentId}`} style={cardStyle(false)}>
                      <div style={{ marginBottom: 8 }}>
                        <span 
                          style={{ 
                            ...postTypeLabel,
                            background: post.collectionType === "posts" ? "#9c27b0" :
                                      post.collectionType === "freeposts" ? "#2196f3" :
                                      post.collectionType === "songs" ? "#e91e63" : 
                                      "#4caf50"
                          }}
                        >
                          {getPostTypeInfo(post.collectionType).icon} {getPostTypeInfo(post.collectionType).text}
                        </span>
                        <span style={{ 
                          fontSize: 13, 
                          color: darkMode ? "#aaa" : "#666",
                          marginLeft: 4
                        }}>
                          {formatDate(post.commentDate)}
                        </span>
                      </div>
                      
                      <CustomLink
                        to={`/post/${post.collectionType === "posts" ? "duet" : 
                              post.collectionType === "freeposts" ? "free" :
                              post.collectionType === "songs" ? "song" : "advice"}/${post.id}`}
                        style={linkStyle}
                      >
                        <h3 style={{ 
                          margin: "8px 0", 
                          color: darkMode ? "#ddd" : "#333"
                        }}>
                          {post.title}
                        </h3>
                      </CustomLink>
                      
                      {/* 작성한 댓글 내용 */}
                      <div style={{ 
                        margin: "10px 0", 
                        padding: 12,
                        borderRadius: 8,
                        background: darkMode ? "#444" : "#e9e1f7",
                        fontSize: 14
                      }}>
                        <div style={{ 
                          fontSize: 12, 
                          color: darkMode ? "#aaa" : "#666",
                          marginBottom: 6,
                          display: "flex",
                          justifyContent: "space-between"
                        }}>
                          <span>내가 작성한 댓글:</span>
                          <span>{formatDate(post.commentDate)}</span>
                        </div>
                        <div style={{ 
                          color: darkMode ? "#ddd" : "#333",
                          whiteSpace: "pre-wrap"
                        }}>
                          {post.commentContent}
                        </div>
                      </div>
                      
                      {/* 게시글 작성자 정보 */}
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        marginTop: 10,
                        fontSize: 13
                      }}>
                        <span style={{ color: darkMode ? "#aaa" : "#666" }}>
                          작성자: 
                        </span>
                        <CustomLink
                          to={`/profile/${post.nickname}`}
                          style={{
                            ...linkStyle,
                            fontSize: 13,
                            marginLeft: 5,
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          {post.nickname} {getGradeEmoji(post.nickname)}
                        </CustomLink>
                      </div>
                    </div>
                  ))}
                  
                  {/* 무한 스크롤 로딩 지점 */}
                  {!isLastPage && (
                    <div 
                      ref={observerRef} 
                      style={{ 
                        height: 20, 
                        margin: "20px 0", 
                        textAlign: "center" 
                      }}
                    >
                      {isLoading && page > 1 && "더 불러오는 중..."}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          
          {/* 좋아요한 글 */}
          {activeTab === "likes" && (
            <>
              {likedPosts.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p>❤️ 좋아요한 게시글이 없습니다</p>
                </div>
              ) : (
                <>
                  {likedPosts.map(post => (
                    <div key={`${post.collectionType}-${post.id}`} style={cardStyle(false)}>
                      <div style={{ marginBottom: 8 }}>
                        <span 
                          style={{ 
                            ...postTypeLabel,
                            background: post.collectionType === "posts" ? "#9c27b0" :
                                      post.collectionType === "freeposts" ? "#2196f3" :
                                      post.collectionType === "songs" ? "#e91e63" : 
                                      "#4caf50"
                          }}
                        >
                          {getPostTypeInfo(post.collectionType).icon} {getPostTypeInfo(post.collectionType).text}
                        </span>
                        <span style={{ 
                          fontSize: 13, 
                          color: darkMode ? "#aaa" : "#666",
                          marginLeft: 4
                        }}>
                          {formatDate(post.createdAt)}
                        </span>
                      </div>
                      
                      <CustomLink
                        to={`/post/${post.collectionType === "posts" ? "duet" : 
                              post.collectionType === "freeposts" ? "free" :
                              post.collectionType === "songs" ? "song" : "advice"}/${post.id}`}
                        style={linkStyle}
                      >
                        <h3 style={{ 
                          margin: "8px 0", 
                          color: darkMode ? "#ddd" : "#333"
                        }}>
                          {post.title}
                        </h3>
                      </CustomLink>
                      
                      <div style={{ 
                        margin: "8px 0", 
                        color: darkMode ? "#bbb" : "#555",
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {post.content}
                      </div>
                      
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        marginTop: 10,
                        justifyContent: "space-between"
                      }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <Avatar 
                            src={globalProfilePics[post.nickname] || "https://via.placeholder.com/30"}
                            size={24}
                            alt={post.nickname}
                          />
                          <CustomLink
                            to={`/profile/${post.nickname}`}
                            style={{
                              marginLeft: 8, 
                              fontSize: 14,
                              textDecoration: "none",
                              color: darkMode ? "#ccc" : "#666",
                              display: "flex",
                              alignItems: "center",
                              gap: 4
                            }}
                          >
                            {post.nickname} {getGradeEmoji(post.nickname)}
                          </CustomLink>
                        </div>
                        <span style={{ 
                          fontSize: 13,
                          color: darkMode ? "#e91e63" : "#d81b60",
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}>
                          <span role="img" aria-label="heart">❤️</span> {post.likes || 0}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {/* 무한 스크롤 로딩 지점 */}
                  {!isLastPage && (
                    <div 
                      ref={observerRef} 
                      style={{ 
                        height: 20, 
                        margin: "20px 0", 
                        textAlign: "center" 
                      }}
                    >
                      {isLoading && page > 1 && "더 불러오는 중..."}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      
      {/* 팔로워 모달 */}
      {showFollowerModal && (
        <div style={modalOverlayStyle} onClick={() => setShowFollowerModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: 15
            }}>
              <h3 style={{ margin: 0 }}>팔로워 목록</h3>
              <button 
                onClick={() => setShowFollowerModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: darkMode ? "#ccc" : "#666"
                }}
              >
                ×
              </button>
            </div>
            
            {followers.length === 0 ? (
              <p style={{ textAlign: "center", color: darkMode ? "#aaa" : "#666" }}>
                팔로워가 없습니다.
              </p>
            ) : (
              followers.map((follower, index) => (
                <div 
                  key={`follower-${index}`} 
                  style={userListItemStyle}
                  onClick={() => {
                    nav(`/profile/${follower}`);
                    setShowFollowerModal(false);
                  }}
                >
                  <Avatar 
                    src={globalProfilePics[follower] || "https://via.placeholder.com/40"}
                    size={40}
                    alt={follower}
                  />
                  <div style={{ marginLeft: 10 }}>
                    <div style={{ 
                      fontWeight: "bold", 
                      color: darkMode ? "#ddd" : "#333",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}>
                      {follower} {getGradeEmoji(follower)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* 팔로잉 모달 */}
      {showFollowingModal && (
        <div style={modalOverlayStyle} onClick={() => setShowFollowingModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: 15
            }}>
              <h3 style={{ margin: 0 }}>팔로잉 목록</h3>
              <button 
                onClick={() => setShowFollowingModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: darkMode ? "#ccc" : "#666"
                }}
              >
                ×
              </button>
            </div>
            
            {following.length === 0 ? (
              <p style={{ textAlign: "center", color: darkMode ? "#aaa" : "#666" }}>
                팔로잉하는 사용자가 없습니다.
              </p>
            ) : (
              following.map((followingUser, index) => (
                <div 
                  key={`following-${index}`} 
                  style={userListItemStyle}
                  onClick={() => {
                    nav(`/profile/${followingUser}`);
                    setShowFollowingModal(false);
                  }}
                >
                  <Avatar 
                    src={globalProfilePics[followingUser] || "https://via.placeholder.com/40"}
                    size={40}
                    alt={followingUser}
                  />
                  <div style={{ marginLeft: 10 }}>
                    <div style={{ 
                      fontWeight: "bold", 
                      color: darkMode ? "#ddd" : "#333",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}>
                      {followingUser} {getGradeEmoji(followingUser)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

UserProfile.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired,
  currentUser: PropTypes.string
};

UserProfile.defaultProps = {
  darkMode: false,
  currentUser: ""
};

export default UserProfile;
