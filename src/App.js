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
import logo from "./assets/logo.png";
import EvaluatePage from "./pages/EvaluatePage";
import AdminEvalPage from "./pages/AdminEvalPage";
import AdminUserPage from "./pages/AdminUserPage";
import Header from "./components/Header";
import RequireAuth from "./components/RequireAuth";
import Signup from "./components/Signup";
import PostDetail from "./components/PostDetail";
import { darkInputStyle, textareaStyle, purpleBtn, smallBtn, menuStyle, containerStyle, darkContainerStyle, titleStyle, inputStyle } from "./components/style";

import { DEFAULT_AVATAR } from "./components/style";
import MyPage from "./components/MyPage";
import SearchBar from "./components/SearchBar";
import PostList from "./components/PostList";
import SongPostList from "./components/SongPostList";
import AdvicePostList from "./components/AdvicePostList";
import WritePost from "./components/WritePost";
import FreePostList from "./components/FreePostList";
import Login from "./components/Login";
import EditPost from "./components/EditPost";
import { CommentSystem, EditCommentPage } from "./components/CommentSystem";
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

import { getAuth, onAuthStateChanged } from "firebase/auth";

const menuItem = {
  padding: "8px 12px",
  cursor: "pointer",
  borderRadius: 6,
  fontSize: 14,
  transition: "background 0.2s",
  marginBottom: 4
};

function App() {

  useEffect(() => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    console.log("🔥 현재 로그인된 UID:", user.uid);
  }
}, []);

  const [dark, setDark] = useState(localStorage.getItem("darkMode") === "true");
  const [pics, setPics] = useState({});
  const [intros, setIntros] = useState({});
  const [grades, setGrades] = useState({});
  const [unread, setUnread] = useState(0);
  const nick = localStorage.getItem("nickname");
  const [role, setRole] = useState(localStorage.getItem("role") || "");

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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const gradeMap = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.nickname && data.grade) {
          gradeMap[data.nickname] = data.grade;
        }
      });
      setGrades(gradeMap);
    });
  
    return () => unsubscribe();
  }, []);
  
  const logout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      localStorage.removeItem("nickname");
      window.location.href = "/login";
    }
  };

  return (
    <Router>
      <Header
        dark={dark}
        toggleDark={toggleDark}
        nick={nick}
        grades={grades}
        unread={unread}
        logout={logout}
        purpleBtn={purpleBtn}
        globalProfilePics={pics}
        role={role}
      />

      <Routes>
        <Route path="/" element={nick ? 
          <><MainBoardList darkMode={dark} /><ActivityHistory darkMode={dark} /></> 
          : <Login darkMode={dark} />} />
        <Route path="/login" element={<Login darkMode={dark} />} />
        <Route path="/signup" element={<Signup darkMode={dark} />} />
        <Route path="/write/:category" element={<RequireAuth><WritePost darkMode={dark} /></RequireAuth>} />
        <Route path="/freeboard" element={<RequireAuth><FreePostList darkMode={dark} globalProfilePics={pics} globalGrades={grades} /></RequireAuth>} />
        <Route path="/post/:type/:id" element={<RequireAuth><PostDetail darkMode={dark} globalProfilePics={pics} globalGrades={grades} /></RequireAuth>} />
        <Route path="/edit/:type/:id" element={<RequireAuth><EditPost darkMode={dark} /></RequireAuth>} />
<Route path="/comment-edit/:type/:postId/:commentId" element={<RequireAuth><EditCommentPage darkMode={dark} /></RequireAuth>} />        <Route path="/notice" element={<RequireAuth><WriteNotice darkMode={dark} /></RequireAuth>} />
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
        <Route path="/inbox" element={<RequireAuth><MessageBox darkMode={dark} mode="inbox" /></RequireAuth>} />
        <Route path="/outbox" element={<RequireAuth><MessageBox darkMode={dark} mode="outbox" /></RequireAuth>} />
        <Route path="/send-message/:receiverNickname" element={<RequireAuth><SendMessage darkMode={dark} /></RequireAuth>} />
        <Route path="/send-notification" element={<RequireAuth><SendNotification darkMode={dark} /></RequireAuth>} />
        <Route path="/notification" element={<RequireAuth><Notification darkMode={dark} /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPanel darkMode={dark} /></RequireAuth>} />
        <Route path="/stats" element={<RequireAuth><StatsPage darkMode={dark} /></RequireAuth>} />
        <Route path="/popular" element={<RequireAuth><PopularPosts darkMode={dark} /></RequireAuth>} />
        <Route path="/mypage" element={<RequireAuth><MyPage darkMode={dark} globalProfilePics={pics} globalIntroductions={intros} globalGrades={grades} /></RequireAuth>} />
        <Route path="/duet" element={<RequireAuth><PostList darkMode={dark} globalProfilePics={pics} globalGrades={grades} /></RequireAuth>} />
        <Route path="/songs" element={<RequireAuth><SongPostList darkMode={dark} globalProfilePics={pics} globalGrades={grades} /></RequireAuth>} />
        <Route path="/advice" element={<RequireAuth><AdvicePostList darkMode={dark} globalProfilePics={pics} globalGrades={grades} /></RequireAuth>} />
        <Route path="/userpage/:nickname" element={<RequireAuth><UserPage darkMode={dark} globalProfilePics={pics} globalIntroductions={intros} globalGrades={grades} /></RequireAuth>} />
        <Route path="/edit-entry/:entryId" element={<RequireAuth><EditEntry darkMode={dark} /></RequireAuth>} />
        <Route path="*" element={<NotFound darkMode={dark} />} />
        <Route path="/evaluate" element={<RequireAuth><EvaluatePage darkMode={dark} /></RequireAuth>} />
        <Route path="/admin-eval" element={<RequireAuth><AdminEvalPage darkMode={dark} /></RequireAuth>} />
        <Route path="/admin-user" element={
          (role === "운영진" || role === "리더" || localStorage.getItem("nickname") === "너래")
            ? <AdminUserPage darkMode={dark} globalGrades={grades} setGrades={setGrades} />
            : <div style={{ padding: "2rem", textAlign: "center" }}>⛔ 접근 권한이 없습니다.</div>
        } />
      </Routes>
    </Router>
  );
}

export default App;
