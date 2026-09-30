// ========================================================
// 🌿 효명고 전학공 방명록 클라이언트 로직 (app.js)
// ========================================================

// 1. Firebase SDK 모듈 임포트 (CDN 방식)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========================================================
// 2. Firebase 설정 템플릿 (3단계에서 선생님의 키를 여기에 쏙 넣을 예정입니다!)
// ========================================================
const firebaseConfig = {
  apiKey: "AIzaSyDAeiQ2UUUOiU2Nc0TIXke_sPC3oO_p5VQ",
  authDomain: "guestbook2-ff28c.firebaseapp.com",
  projectId: "guestbook2-ff28c",
  storageBucket: "guestbook2-ff28c.firebasestorage.app",
  messagingSenderId: "297044368645",
  appId: "1:297044368645:web:08c94dab886384842a6b6c"
};

// Firebase 초기화 여부 플래그
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let app, auth, db, provider;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
  // hmh.or.kr 도메인 힌트 부여
  provider.setCustomParameters({
    hd: "hmh.or.kr"
  });
}

// ========================================================
// 3. 화면 UI 요소 가져오기
// ========================================================
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loggedOutView = document.getElementById("loggedOutView");
const loggedInView = document.getElementById("loggedInView");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userPhoto = document.getElementById("userPhoto");

const guestbookForm = document.getElementById("guestbookForm");
const nicknameInput = document.getElementById("nicknameInput");
const messageInput = document.getElementById("messageInput");
const charCount = document.getElementById("charCount");
const submitBtn = document.getElementById("submitBtn");
const entriesList = document.getElementById("entriesList");
const entryCount = document.getElementById("entryCount");

// 허용 도메인
const ALLOWED_DOMAIN = "hmh.or.kr";

// 현재 로그인한 사용자 정보 저장
let currentUser = null;

// ========================================================
// 4. 글자수 카운터 이벤트
// ========================================================
messageInput.addEventListener("input", () => {
  const currentLen = messageInput.value.length;
  charCount.textContent = currentLen;
  if (currentLen >= 300) {
    charCount.style.color = "#E53E3E";
  } else {
    charCount.style.color = "";
  }
});

// ========================================================
// 5. 로그인 / 로그아웃 처리 (현재 창 이동 방식)
// ========================================================
loginBtn.addEventListener("click", async () => {
  if (!isFirebaseConfigured) {
    alert("📢 [안내] 1차 기본 화면 테스트 중입니다!\n\n다음 3단계에서 Firebase를 연결하면 실제 구글 로그인이 시작됩니다.");
    return;
  }

  try {
    // 팝업 대신 현재 창에서 구글 로그인 화면으로 이동
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error("로그인 에러:", error);
    alert("로그인 중 오류가 발생했습니다: " + error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  } else {
    updateAuthUI(null);
  }
});

// UI 상태 갱신 함수
function updateAuthUI(user) {
  currentUser = user;
  if (user) {
    loggedOutView.classList.add("hidden");
    loggedInView.classList.remove("hidden");
    userName.textContent = user.displayName || "선생님";
    userEmail.textContent = user.email;
    userPhoto.src = user.photoURL || "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(user.email);
    
    // 작성 폼에 닉네임 자동 입력 (미입력 상태일 때)
    if (!nicknameInput.value) {
      nicknameInput.value = user.displayName || "";
    }
  } else {
    loggedOutView.classList.remove("hidden");
    loggedInView.classList.add("hidden");
    userName.textContent = "";
    userEmail.textContent = "";
    userPhoto.src = "";
  }
}

// Firebase Auth 상태 감지 및 리다이렉트 로그인 결과 처리
if (isFirebaseConfigured && auth) {
  // 현재 창 로그인 후 복귀 시 결과 검증
  getRedirectResult(auth)
    .then((result) => {
      if (result && result.user) {
        const user = result.user;
        if (!user.email || !user.email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          alert(`⚠️ 접근 제한 안내\n\n효명고 교직원 계정(@${ALLOWED_DOMAIN})으로만 로그인하실 수 있습니다.\n(현재 로그인 시도: ${user.email})`);
          signOut(auth);
        }
      }
    })
    .catch((error) => {
      console.error("리다이렉트 로그인 결과 처리 에러:", error);
    });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (user.email && user.email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        updateAuthUI(user);
      } else {
        signOut(auth);
        updateAuthUI(null);
      }
    } else {
      updateAuthUI(null);
    }
  });
}

// ========================================================
// 6. 방명록 글 등록 처리
// ========================================================
guestbookForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nickname = nicknameInput.value.trim();
  const message = messageInput.value.trim();

  if (!nickname || !message) {
    alert("작성자 닉네임과 메시지를 모두 입력해 주세요.");
    return;
  }

  // Firebase 연결 전 로컬 테스트일 경우
  if (!isFirebaseConfigured) {
    addLocalSampleCard(nickname, message);
    messageInput.value = "";
    charCount.textContent = "0";
    alert("✨ 로컬 화면 테스트 등록 완료!\n(3단계에서 Firebase를 연결하면 인터넷에 실제 저장됩니다)");
    return;
  }

  // Firebase Firestore 실제 저장 로직
  if (!currentUser) {
    alert("방명록을 작성하시려면 먼저 상단에서 @hmh.or.kr 구글 계정으로 로그인해 주세요.");
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span>⏳ 등록 중...</span>";

    await addDoc(collection(db, "guestbook"), {
      nickname: nickname,
      message: message,
      authorEmail: currentUser.email,
      authorPhoto: currentUser.photoURL || "",
      createdAt: serverTimestamp()
    });

    messageInput.value = "";
    charCount.textContent = "0";
  } catch (error) {
    console.error("방명록 저장 에러:", error);
    alert("방명록 저장 중 오류가 발생했습니다: " + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = "<span>💌 방명록 등록하기</span>";
  }
});

// 로컬 테스트용 카드 추가 함수
function addLocalSampleCard(nickname, message) {
  const card = document.createElement("div");
  card.className = "entry-card";
  card.innerHTML = `
    <div class="entry-card-header">
      <div class="entry-author-info">
        <span class="avatar-badge">🌿</span>
        <div>
          <strong class="entry-author">${escapeHtml(nickname)}</strong>
          <span class="entry-time">방금 전 (로컬 미리보기)</span>
        </div>
      </div>
      <span class="entry-tag">테스트</span>
    </div>
    <p class="entry-content">${escapeHtml(message)}</p>
  `;
  entriesList.prepend(card);
  updateCountDisplay();
}

// ========================================================
// 7. 실시간 Firestore 방명록 구독 (onSnapshot)
// ========================================================
if (isFirebaseConfigured && db) {
  const q = query(collection(db, "guestbook"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    entriesList.innerHTML = "";
    
    if (snapshot.empty) {
      entriesList.innerHTML = `
        <div class="entry-card sample-card">
          <p class="entry-content" style="text-align: center; color: #718096;">
            아직 등록된 이야기가 없습니다. 첫 번째 응원의 글을 남겨보세요! 🌱
          </p>
        </div>
      `;
      entryCount.textContent = "총 0개의 이야기";
      return;
    }

    entryCount.textContent = `총 ${snapshot.size}개의 이야기`;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const card = createEntryElement(data);
      entriesList.appendChild(card);
    });
  }, (error) => {
    console.error("Firestore 실시간 동기화 에러:", error);
  });
}

function createEntryElement(data) {
  const card = document.createElement("div");
  card.className = "entry-card";

  const timeString = formatTimestamp(data.createdAt);
  const avatarUrl = data.authorPhoto || "";
  const avatarEl = avatarUrl 
    ? `<img src="${avatarUrl}" alt="아바타" class="user-avatar" style="width: 36px; height: 36px;">`
    : `<span class="avatar-badge">🌱</span>`;

  card.innerHTML = `
    <div class="entry-card-header">
      <div class="entry-author-info">
        ${avatarEl}
        <div>
          <strong class="entry-author">${escapeHtml(data.nickname || "선생님")}</strong>
          <span class="entry-time">${timeString}</span>
        </div>
      </div>
    </div>
    <p class="entry-content">${escapeHtml(data.message || "")}</p>
  `;
  return card;
}

// 시간 포맷 헬퍼
function formatTimestamp(timestamp) {
  if (!timestamp) return "방금 전";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// HTML 이스케이프 (XSS 방지)
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateCountDisplay() {
  const count = entriesList.querySelectorAll(".entry-card").length;
  entryCount.textContent = `총 ${count}개의 이야기`;
}
