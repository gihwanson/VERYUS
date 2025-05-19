// EditEntry.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function EditEntry({ darkMode }) {
  const { entryId } = useParams();
  const [msg, setMsg] = useState("");
  const [secret, setSecret] = useState(false);
  const [owner, setOwner] = useState("");
  const nav = useNavigate();
  const me = localStorage.getItem("nickname");

  useEffect(() => {
    // 이 부분은 개선이 필요합니다. owner를 URL에서 가져오거나 다른 방법으로 확인해야 합니다.
    // 임시로 사용자가 접근할 수 있는 모든 guestbook 컬렉션을 확인합니다
    const fetchEntry = async () => {
      // owners 목록을 가져오는 방법이 없으므로 더 좋은 방법이 필요합니다
      // 임시로 entries에서 writer 필드를 확인하여 owner를 찾습니다
      const usersSnap = await getDocs(collection(db, "users"));
      const users = usersSnap.docs.map(d => d.data().nickname).filter(Boolean);
      
      for (const potentialOwner of users) {
        try {
          const guestbookRef = collection(db, `guestbook-${potentialOwner}`);
          const snap = await getDocs(guestbookRef);
          const entry = snap.docs.find(doc => doc.id === entryId);
          
          if (entry && entry.data().writer === me) {
            setMsg(entry.data().text);
            setSecret(entry.data().isSecret);
            setOwner(potentialOwner);
            break;
          }
        } catch (error) {
          console.error(`Error checking guestbook-${potentialOwner}:`, error);
        }
      }
    };

    fetchEntry();
  }, [entryId, me]);

  const save = async () => {
    if (!msg.trim()) return alert("내용을 입력하세요");
    if (!owner) return alert("방명록 주인을 찾을 수 없습니다");
    
    await updateDoc(doc(db, `guestbook-${owner}`, entryId), { 
      text: msg, 
      isSecret: secret 
    });
    
    alert("수정되었습니다");
    nav(`/guestbook/${owner}`);
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📖 방명록 수정</h1>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="수정할 메시지"
        style={darkMode ? darkInputStyle : textareaStyle}
      />
      <label>
        <input
          type="checkbox"
          checked={secret}
          onChange={e => setSecret(e.target.checked)}
        /> 비밀글
      </label>
      <button onClick={save} style={{ ...purpleBtn, marginTop: 10 }}>수정 저장</button>
    </div>
  );
}

EditEntry.propTypes = {
  darkMode: PropTypes.bool
};

EditEntry.defaultProps = {
  darkMode: false
};

export default EditEntry;
