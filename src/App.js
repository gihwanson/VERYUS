// App.js
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes, Route
} from "react-router-dom";
import {
  collection, getDocs, query,
  onSnapshot, where
} from "firebase/firestore";
import { db } from './firebase';
import EvaluatePage from "./pages/EvaluatePage";
import AdminEvalPage from "./pages/AdminEvalPage";
import Header from "./components/Header";
import RequireAuth from "./components/RequireAuth";
import Signup from "./components/Signup";
import PostDetail from "./components/PostDetail";
import { GradeProvider, useGrades } from "./contexts/GradeContext";
import { purpleBtn } from "./components/style";

import MyPage from "./components/MyPage";
import PostList from "./components/PostList";
import SongPostList from "./components/SongPostList";
import AdvicePostList from "./components/AdvicePostList";
import WritePost from "./components/WritePost";
import FreePostList from "./components/FreePostList";
import Login from "./components/Login";
import EditPost from "./components/EditPost";
import { EditCommentPage } from "./components/CommentSystem";
import NoticeList from "./components/NoticeList";
import NoticeDetail from "./components/NoticeDetail";
import WriteNotice from "./components/WriteNotice";
import UserProfile from "./components/UserProfile";
import Guestbook from "./components/Guestbook";
import EditEntry from "./components/EditEntry";
import SendMessage from "./components/SendMessage";
import MessageBox from "./components/MessageBox";

// 프로필 관련 컴포넌트
import EditProfilePic from "./components/EditProfilePic";
import EditIntroduction from "./components/EditIntroduction";
import EditGrade from "./components/EditGrade";
import EditNickname from "./components/EditNickname";
import EditPassword from "./components/EditPassword";
import DeleteAccount from "./components/DeleteAccount";

// 알림 관련 컴포넌트
import Notification from "./components/Notification";
import SendNotification from "./components/SendNotification";

// 관리자 관련 컴포넌트
import AdminPanel from "./components/AdminPanel";
import StatsPage from "./components/StatsPage";

// 기타 컴포넌트
import PopularPosts from "./components/PopularPosts";
import NotFound from "./components/NotFound";
import MainBoardList from "./components/MainBoardList";
import ActivityHistory from "./components/ActivityHistory";
import UserPage from "./components/UserPage";
import MemberList from "./components/MemberList";
import MyPosts from "./components/MyPosts";
import MyComments from "./components/MyComments";
import MyLikes from "./components/MyLikes";
import NewAdminPanel from "./components/NewAdminPanel";
import UploadRecording from "./components/UploadRecording";
import RecordingBoard from "./components/RecordingBoard";
import UserRecordings from "./components/UserRecordings";
import RecordingComments from "./components/RecordingComments";
import ScoreBoard from "./components/ScoreBoard";
import SpecialMoments from "./components/SpecialMoments";
import CreateContest from "./components/CreateContest";
import RegisterScore from "./components/RegisterScore";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { globalBackgroundStyle, darkGlobalBackgroundStyle, sectionContainerStyle, darkSectionContainerStyle } from './components/style';

function AppContent() {
  const [dark, setDark] = useState(localStorage.getItem("darkMode") === "true");
  const [userStats, setUserStats] = useState({});
  const nick = localStorage.getItem("nickname");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  
  // GradeContext에서 등급 정보 가져오기
  const { grades, profilePics, introductions, setGrades } = useGrades();

  const toggleDark = () => {
    setDark(prev => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  useEffect(() => {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("🔥 현재 로그인된 UID:", user.uid);
      } else {
        console.log("❌ 로그인된 사용자가 없습니다.");
      }
    });
  }, []);

  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) return;
  
    const q = query(collection(db, "users"), where("nickname", "==", nickname));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.role) {
          localStorage.setItem("role", data.role);
          setRole(data.role);
        }
      });
    });
  
    return () => unsubscribe();
  }, []);

  const logout = () => {
    // 중복 실행 방지
    if (window.logoutInProgress) return;
    
    if (window.confirm("로그아웃 하시겠습니까?")) {
      window.logoutInProgress = true;
      localStorage.removeItem("nickname");
      localStorage.removeItem("role");
      localStorage.removeItem("autoLogin");
      
      setTimeout(() => {
        window.logoutInProgress = false;
        window.location.href = "/login";
      }, 100);
    }
  };

  // 사용자 통계 실시간 계산
  useEffect(() => {
    const calculateUserStats = async () => {
      try {
        const statsMap = {};
        
        // 모든 사용자 가져오기
        const usersSnapshot = await getDocs(collection(db, "users"));
        const userNicknames = usersSnapshot.docs.map(doc => doc.data().nickname).filter(Boolean);
        
        for (const nickname of userNicknames) {
          // 게시물 수 계산 (모든 게시판)
          const [duetPosts, freePosts, songPosts, advicePosts] = await Promise.all([
            getDocs(query(collection(db, "posts"), where("nickname", "==", nickname))),
            getDocs(query(collection(db, "freeposts"), where("nickname", "==", nickname))),
            getDocs(query(collection(db, "songs"), where("nickname", "==", nickname))),
            getDocs(query(collection(db, "advice"), where("nickname", "==", nickname)))
          ]);
          
          const postCount = duetPosts.size + freePosts.size + songPosts.size + advicePosts.size;
          
          // 댓글 수 계산 (모든 댓글 컬렉션)
          const commentCollections = await Promise.all([
            getDocs(query(collection(db, "comments"), where("author", "==", nickname))),
            getDocs(query(collection(db, "freecomments"), where("author", "==", nickname))),
            getDocs(query(collection(db, "songcomments"), where("author", "==", nickname))),
            getDocs(query(collection(db, "advicecomments"), where("author", "==", nickname)))
          ]);
          
          const commentCount = commentCollections.reduce((total, collection) => total + collection.size, 0);
          
          // 방명록 방문자 수 계산
          const guestbookSnapshot = await getDocs(collection(db, `guestbook-${nickname}`));
          const visitorCount = guestbookSnapshot.size;
          
          // 받은 좋아요 수 계산 (추후 구현 가능)
          const likesReceived = 0; // 임시값
          
          statsMap[nickname] = {
            postCount,
            commentCount,
            likesReceived,
            visitorCount
          };
        }
        
        setUserStats(statsMap);
        console.log("사용자 통계 업데이트 완료:", Object.keys(statsMap).length, "명");
      } catch (error) {
        console.error("사용자 통계 계산 오류:", error);
      }
    };
    
    // 초기 계산
    calculateUserStats();
    
    // 5분마다 통계 업데이트 (더 자주 업데이트)
    const interval = setInterval(calculateUserStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <div style={dark ? darkGlobalBackgroundStyle : globalBackgroundStyle}>
        <Header
          dark={dark}
          toggleDark={toggleDark}
          nick={nick}
          grades={grades}
          unread={0}
          logout={logout}
          purpleBtn={purpleBtn}
          globalProfilePics={profilePics}
          role={role}
        />
        <div style={{
          margin: "20px 0",
          padding: "0",
          boxSizing: "border-box",
          width: "100%"
        }}>
          <div style={dark ? darkSectionContainerStyle : sectionContainerStyle}>
            <Routes>
              <Route path="/" element={nick ? 
                <><MainBoardList darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /><SpecialMoments darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} showOnlyPreview={true} /><ActivityHistory darkMode={dark} /><MemberList darkMode={dark} /></> 
                : <Login darkMode={dark} />} />
              <Route path="/login" element={<Login darkMode={dark} />} />
              <Route path="/signup" element={<Signup darkMode={dark} />} />
              <Route path="/write/:category" element={<RequireAuth><WritePost darkMode={dark} /></RequireAuth>} />
              <Route path="/freeboard" element={<RequireAuth><FreePostList darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/post/:type/:id" element={<RequireAuth><PostDetail darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/edit/:type/:id" element={<RequireAuth><EditPost darkMode={dark} /></RequireAuth>} />
              <Route path="/comment-edit/:type/:postId/:commentId" element={<RequireAuth><EditCommentPage darkMode={dark} /></RequireAuth>} />
              <Route path="/notice" element={<RequireAuth><WriteNotice darkMode={dark} /></RequireAuth>} />
              <Route path="/notices" element={<RequireAuth><NoticeList darkMode={dark} /></RequireAuth>} />
              <Route path="/notice/:id" element={<RequireAuth><NoticeDetail darkMode={dark} /></RequireAuth>} />
              <Route path="/user/:userNickname" element={<RequireAuth><UserProfile darkMode={dark} /></RequireAuth>} />
              <Route path="/guestbook/:owner" element={<RequireAuth><Guestbook darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-profilepic" element={<RequireAuth><EditProfilePic darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-introduction" element={<RequireAuth><EditIntroduction darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-grade" element={<RequireAuth><EditGrade darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-nickname" element={<RequireAuth><EditNickname darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-password" element={<RequireAuth><EditPassword darkMode={dark} /></RequireAuth>} />
              <Route path="/delete-account" element={<RequireAuth><DeleteAccount darkMode={dark} /></RequireAuth>} />
              <Route path="/inbox" element={<RequireAuth><MessageBox darkMode={dark} /></RequireAuth>} />
              <Route path="/messages" element={<RequireAuth><MessageBox darkMode={dark} /></RequireAuth>} />
              <Route path="/send-message/:nickname" element={<RequireAuth><SendMessage darkMode={dark} /></RequireAuth>} />
              <Route path="/send-notification" element={<RequireAuth><SendNotification darkMode={dark} /></RequireAuth>} />
              <Route path="/notification" element={<RequireAuth><Notification darkMode={dark} /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth><AdminPanel darkMode={dark} /></RequireAuth>} />
              <Route path="/stats" element={<RequireAuth><StatsPage darkMode={dark} /></RequireAuth>} />
              <Route path="/popular" element={<RequireAuth><PopularPosts darkMode={dark} /></RequireAuth>} />
              <Route path="/mypage" element={<RequireAuth><MyPage darkMode={dark} userStats={userStats} /></RequireAuth>} />
              <Route path="/duet" element={<RequireAuth><PostList darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/songs" element={<RequireAuth><SongPostList darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/advice" element={<RequireAuth><AdvicePostList darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/userpage/:nickname" element={<RequireAuth><UserPage darkMode={dark} globalProfilePics={profilePics} globalIntroductions={introductions} globalGrades={grades} /></RequireAuth>} />
              <Route path="/my-posts" element={<RequireAuth><MyPosts darkMode={dark} /></RequireAuth>} />
              <Route path="/my-comments" element={<RequireAuth><MyComments darkMode={dark} /></RequireAuth>} />
              <Route path="/edit-entry/:entryId" element={<RequireAuth><EditEntry darkMode={dark} /></RequireAuth>} />
              <Route path="/my-likes" element={<RequireAuth><MyLikes darkMode={dark} /></RequireAuth>} />
              <Route path="/scores" element={<RequireAuth><ScoreBoard darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/create-contest" element={<RequireAuth><CreateContest darkMode={dark} /></RequireAuth>} />
              <Route path="/register-score/:contestId" element={<RequireAuth><RegisterScore darkMode={dark} /></RequireAuth>} />
              <Route path="*" element={<NotFound darkMode={dark} />} />
              <Route path="/evaluate" element={<RequireAuth><EvaluatePage darkMode={dark} /></RequireAuth>} />
              <Route path="/admin-eval" element={<RequireAuth><AdminEvalPage darkMode={dark} /></RequireAuth>} />
              <Route path="/new-admin-panel" element={<RequireAuth><NewAdminPanel darkMode={dark} /></RequireAuth>} />
              <Route path="/upload-recording" element={<RequireAuth><UploadRecording darkMode={dark} /></RequireAuth>} />
              <Route path="/recordings" element={<RequireAuth><RecordingBoard darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/user-recordings/:nickname" element={<RequireAuth><UserRecordings darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
              <Route path="/recording-comments/:recordingId" element={<RequireAuth><RecordingComments darkMode={dark} /></RequireAuth>} />
              <Route path="/special-moments" element={<RequireAuth><SpecialMoments darkMode={dark} globalProfilePics={profilePics} globalGrades={grades} /></RequireAuth>} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

function App() {
  return (
    <GradeProvider>
      <AppContent />
    </GradeProvider>
  );
}

export default App;
