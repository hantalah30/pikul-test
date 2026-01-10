import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
function rupiah(n) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

// --- STATE ---
const screens = {
  Home: $("#screenHome"),
  Map: $("#screenMap"),
  Orders: $("#screenOrders"),
  Messages: $("#screenMessages"),
  Profile: $("#screenProfile"),
};
let state = {
  user: null,
  you: { ok: false, lat: -6.2, lon: 106.816666 },
  vendors: [],
  cart: [],
  orders: [],
  banners: [],
  selectedVendorId: null,
  chatWithVendorId: null,
  activeMapVendorId: null,
  activeCategory: "Semua",
  mapCategory: "Semua",
  firstLoad: true,
  unsubChats: null,
  activeOrderTab: "active",
  map: null,
  markers: {},
  userMarker: null,
  routeLine: null,
  trackingVendorId: null,
  lastNearestId: null,
  tempPaymentProof: null,
};

// State Variables for Chat UI
let isIslandExpanded = false;

// --- HELPER: IMAGE COMPRESSOR ---
function compressImage(file, maxWidth = 600, quality = 0.6) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height *= maxWidth / width));
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
    };
  });
}
function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
function getDistanceVal(v) {
  if (!state.you.ok) return 999999;
  return Math.sqrt(
    Math.pow(v.lat - state.you.lat, 2) + Math.pow(v.lon - state.you.lon, 2)
  );
}

// --- AUTH LOGIC ---
window.switchAuthMode = (mode) => {
  if (mode === "login") {
    $("#loginForm").classList.remove("hidden");
    $("#registerForm").classList.add("hidden");
  } else {
    $("#loginForm").classList.add("hidden");
    $("#registerForm").classList.remove("hidden");
  }
};
window.requireLogin = () => {
  showToast("Silakan login terlebih dahulu.");
  showAuth();
};
window.closeAuth = () => {
  showApp();
};

// >>> TAMBAHAN: FUNGSI MASUK SEBAGAI TAMU <<<
window.continueGuest = () => {
  state.user = null;
  localStorage.removeItem("pikul_user_id");
  showApp();
  bootApp();
  showToast("Masuk sebagai Tamu");
};

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(),
    pass = $("#loginPass").value,
    btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const s = await getDocs(q);
    if (s.empty) {
      alert("Email tidak ditemukan.");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    const uData = s.docs[0].data();
    if (uData.password && uData.password !== pass) {
      alert("Password salah!");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    state.user = { id: s.docs[0].id, ...uData };
    localStorage.setItem("pikul_user_id", state.user.id);
    showApp();
    bootApp();
  } catch (err) {
    alert("Error: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Masuk";
});
$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#regName").value.trim(),
    email = $("#regEmail").value.trim(),
    phone = $("#regPhone").value.trim(),
    pass = $("#regPass").value,
    btn = e.target.querySelector("button");
  if (pass.length < 6) return alert("Password min 6 karakter");
  if (phone.length < 9) return alert("Nomor WA tidak valid");
  btn.disabled = true;
  btn.textContent = "Mendaftar...";
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const s = await getDocs(q);
    if (!s.empty) {
      alert("Email sudah terdaftar.");
      btn.disabled = false;
      btn.textContent = "Daftar";
      return;
    }
    const newUser = {
      name,
      email,
      phone,
      password: pass,
      wallet: 0,
      createdAt: Date.now(),
    };
    const ref = await addDoc(collection(db, "users"), newUser);
    state.user = { id: ref.id, ...newUser };
    localStorage.setItem("pikul_user_id", ref.id);
    showApp();
    bootApp();
  } catch (err) {
    alert("Gagal daftar: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Daftar";
});
async function initAuth() {
  const uid = localStorage.getItem("pikul_user_id");
  if (uid) {
    try {
      const { getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) state.user = { id: snap.id, ...snap.data() };
      else localStorage.removeItem("pikul_user_id");
    } catch (e) {
      state.user = null;
    }
  }
  showApp();
  bootApp();
}

// --- BOOT & NAV AUTO HIDE ---
function initAutoHideNav() {
  let lastScroll = 0;
  const content = document.querySelector(".content");
  const nav = document.querySelector(".bottomNav");
  if (content) {
    content.addEventListener("scroll", () => {
      const currentScroll = content.scrollTop;
      if (currentScroll > lastScroll && currentScroll > 50) {
        nav.classList.add("nav-hidden");
      } else {
        nav.classList.remove("nav-hidden");
      }
      lastScroll = currentScroll;
    });
  }
}

async function bootApp() {
  $("#userName").textContent = state.user ? state.user.name : "Tamu";
  initTheme();
  initAutoHideNav();
  onSnapshot(collection(db, "vendors"), (s) => {
    state.vendors = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMapChips();
    if (!$("#screenHome").classList.contains("hidden")) renderVendors();
    if (!$("#screenMap").classList.contains("hidden") || state.trackingVendorId)
      updateMapMarkers();
    if (
      !$("#vendorModal").classList.contains("hidden") &&
      state.selectedVendorId
    )
      openVendor(state.selectedVendorId);
  });
  onSnapshot(collection(db, "banners"), (s) => {
    state.banners = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!$("#screenHome").classList.contains("hidden")) renderHome();
  });
  if (state.user) {
    onSnapshot(
      query(collection(db, "orders"), where("userId", "==", state.user.id)),
      (s) => {
        let raw = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        state.orders = raw.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        state.firstLoad = false;
        renderOrders();
      }
    );
  } else {
    state.orders = [];
    renderOrders();
  }
  renderProfile();
  window.go("Home");
  startGPS();
  updateFab();
}

// --- DYNAMIC ISLAND CHAT LOGIC ---

// 1. Fungsi Membuka & Menutup Island
window.expandIsland = () => {
  if (isIslandExpanded || !state.chatWithVendorId) return;
  const island = document.getElementById("dynamicIsland");

  island.classList.remove("hidden");
  // Small delay for CSS transition
  requestAnimationFrame(() => {
    island.classList.add("expanded");
    isIslandExpanded = true;
    scrollToBottom();
  });
};

window.collapseIsland = (e) => {
  if (e) e.stopPropagation();
  const island = document.getElementById("dynamicIsland");
  island.classList.remove("expanded");
  isIslandExpanded = false;

  // Reset Menus
  document.getElementById("attachMenu").classList.remove("active");
  document.getElementById("emojiPanel").classList.remove("active");
};

// 2. Select Chat (Trigger Utama)
window.selectChat = (vid) => {
  if (!state.user) return requireLogin();

  state.chatWithVendorId = vid;
  const vendor = state.vendors.find((v) => v.id === vid) || {
    name: "Mitra Pikul",
  };

  // Update Nama Toko di Header
  document.getElementById("diChatName").innerText = vendor.name;

  const island = document.getElementById("dynamicIsland");
  island.classList.remove("hidden");

  // Render chat
  renderChatInsideIsland();

  // Auto expand setelah delay kecil
  setTimeout(() => {
    island.classList.add("expanded");
    isIslandExpanded = true;
  }, 100);

  closeModal("vendorModal");
};

async function renderChatInsideIsland() {
  const vid = state.chatWithVendorId;
  const v = state.vendors.find((x) => x.id === vid);
  const chatBox = $("#diChatBox");
  chatBox.innerHTML = "";

  if (state.unsubChats) state.unsubChats();
  const q = query(
    collection(db, "chats", `${state.user.id}_${vid}`, "messages"),
    orderBy("ts", "asc")
  );

  state.unsubChats = onSnapshot(q, (s) => {
    let lastDate = "";
    chatBox.innerHTML = s.docs
      .map((d) => {
        const m = d.data();
        const dateObj = new Date(m.ts);
        const isMe = m.from === state.user.id;
        const timeStr = dateObj.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        let contentHtml = "";
        if (m.type === "image") {
          contentHtml = `<div class="bubble me"><img src="${m.text}" loading="lazy" /></div>`;
        } else if (m.type === "sticker") {
          contentHtml = `<div class="bubble sticker me"><img src="${m.text}" style="width:100px; height:auto; border:none;" /></div>`;
        } else if (m.type === "location") {
          // UPDATE: Render Link Google Maps yang Valid
          const link = m.text.startsWith("http") ? m.text : "#";
          contentHtml = `<a href="${link}" target="_blank" class="bubble location me" style="text-decoration:none; color:white; display:flex; align-items:center; gap:8px;">
                            <div style="background:rgba(255,255,255,0.2); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px;">📍</div>
                            <div style="display:flex; flex-direction:column;">
                                <b style="font-size:13px; color:white;">Lokasi Saya</b>
                                <span style="font-size:10px; opacity:0.8; color:rgba(255,255,255,0.7);">Klik untuk buka Maps</span>
                            </div>
                          </a>`;
        } else {
          contentHtml = `<div class="bubble ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        }

        return `<div style="display:flex; justify-content:${
          isMe ? "flex-end" : "flex-start"
        }; margin-bottom:4px;">${contentHtml}</div>`;
      })
      .join("");
    scrollToBottom();
  });
}

function scrollToBottom() {
  const chatBox = document.getElementById("diChatBox");
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

// 3. Kirim Pesan Universal
// (Dipanggil oleh Text, Image, dan Sticker)
window.sendMessage = async (content = null, type = "text") => {
  if (!state.user) return requireLogin();
  if (!state.chatWithVendorId) return;

  // Jika content null, ambil dari input text
  if (!content) {
    const input = document.getElementById("diChatInput");
    content = input.value.trim();
    input.value = "";
    input.focus();
  }

  if (!content) return;

  const cid = `${state.user.id}_${state.chatWithVendorId}`;
  const vid = state.chatWithVendorId;

  await addDoc(collection(db, "chats", cid, "messages"), {
    text: content,
    type: type,
    from: state.user.id,
    ts: Date.now(),
  });

  // Update Last Message Summary
  let preview =
    type === "text"
      ? content
      : type === "image"
      ? "📷 Foto"
      : type === "sticker"
      ? "😊 Stiker"
      : "📍 Lokasi";
  const v = state.vendors.find((x) => x.id === vid);

  await setDoc(
    doc(db, "chats", cid),
    {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: vid,
      vendorName: v ? v.name : "Unknown",
      lastMessage: preview,
      lastUpdate: Date.now(),
    },
    { merge: true }
  );

  scrollToBottom();
};

/* --- ATTACHMENT & MEDIA LOGIC --- */

// Toggle Menu Attachment (+)
window.toggleAttachMenu = () => {
  const menu = document.getElementById("attachMenu");
  menu.classList.toggle("active");
  // Tutup emoji jika terbuka agar tidak tumpang tindih
  document.getElementById("emojiPanel").classList.remove("active");
};

// 1. Fitur KIRIM FOTO
window.triggerImageInput = () => {
  document.getElementById("imageInput").click();
  toggleAttachMenu(); // Tutup menu setelah klik
};

window.handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (file) {
    // Compress gambar sebelum kirim (biar ringan di firebase)
    const base64 = await compressImage(file, 500, 0.7);
    sendMessage(base64, "image");
  }
};

// 2. Fitur KIRIM LOKASI (FIXED)
window.sendLocation = () => {
  toggleAttachMenu();

  if (!state.you || !state.you.ok) {
    return showToast("⚠️ GPS belum aktif / Lokasi belum ditemukan");
  }

  // Generate Google Maps URL
  const mapsUrl = `https://www.google.com/maps?q=${state.you.lat},${state.you.lon}`;
  sendMessage(mapsUrl, "location");
};

/* --- EMOJI & STICKER SYSTEM --- */

// Toggle Panel Emoji
window.toggleEmojiPanel = () => {
  const panel = document.getElementById("emojiPanel");
  panel.classList.toggle("active");
  document.getElementById("attachMenu").classList.remove("active"); // Tutup attach menu

  // Populate Emojis jika kosong
  const emojiGrid = document.getElementById("tabEmoji");
  if (emojiGrid.children.length === 0) {
    const emojis = [
      "😀",
      "😁",
      "😂",
      "😍",
      "😎",
      "😭",
      "😡",
      "👍",
      "👎",
      "🙏",
      "🔥",
      "✨",
      "❤️",
      "🛒",
      "📦",
      "🏍️",
    ];
    emojis.forEach((e) => {
      const span = document.createElement("div");
      span.className = "emoji-item";
      span.innerText = e;
      span.onclick = () => {
        document.getElementById("diChatInput").value += e;
      };
      emojiGrid.appendChild(span);
    });
  }
};

// Switch Tab (Emoji vs Sticker)
window.showTab = (type) => {
  document.getElementById("tabEmoji").style.display =
    type === "emoji" ? "grid" : "none";
  document.getElementById("tabSticker").style.display =
    type === "sticker" ? "grid" : "none";

  // Update Style Active Tab
  const tabs = document.querySelectorAll(".panel-tab");
  tabs[0].classList.toggle("active", type === "emoji");
  tabs[1].classList.toggle("active", type === "sticker");
};

// Kirim Stiker
window.sendSticker = (src) => {
  sendMessage(src, "sticker");
  document.getElementById("emojiPanel").classList.remove("active"); // Tutup panel
};

// Enter key untuk kirim pesan
document
  .getElementById("diChatInput")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
  });

// --- INBOX LIST (Screen Messages) ---
function renderInbox() {
  if (!state.user) {
    $(
      "#inboxList"
    ).innerHTML = `<div class="empty-state-box">Login untuk melihat pesan.</div>`;
    return;
  }

  // Simulasi inbox list dari daftar vendor (biar bisa mulai chat)
  const list = state.vendors
    .map((v) => {
      return `<div class="listItem" onclick="selectChat('${v.id}')" style="cursor:pointer; display:flex; align-items:center; gap:12px;">
            <div style="width:45px; height:45px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px;">${v.ico}</div>
            <div style="flex:1;">
                <b style="font-size:15px;">${v.name}</b>
                <div class="muted" style="font-size:13px;">Klik untuk chat</div>
            </div>
            <button class="btn small ghost">Chat</button>
        </div>`;
    })
    .join("");

  $("#inboxList").innerHTML =
    list || `<div class="empty-state-box">Belum ada pedagang.</div>`;
}

// --- STANDARD APP FUNCTIONS (Home, Map, etc) ---
let bannerInterval;
function renderHome() {
  let promoData =
    state.banners.length > 0
      ? state.banners
      : [
          {
            t: "Diskon 50%",
            d: "Pengguna Baru",
            c: "linear-gradient(135deg, #ff7a00, #ff4d00)",
            vid: null,
          },
        ];
  $("#promoList").innerHTML = promoData
    .map(
      (p) =>
        `<div class="promo-card" style="background: ${p.c};" onclick="${
          p.vid ? `openVendor('${p.vid}')` : ""
        }"><div class="promo-decor decor-1"></div><div class="promo-decor decor-2"></div><div class="promo-content">${
          p.vName
            ? `<div class="promo-tag">Promosi: ${p.vName}</div>`
            : `<div class="promo-tag">Info Promo</div>`
        }<h3 class="promo-title">${p.t}</h3><p class="promo-desc">${
          p.d
        }</p></div></div>`
    )
    .join("");
  $("#promoDots").innerHTML = promoData
    .map(
      (_, i) =>
        `<div class="dot ${i === 0 ? "active" : ""}" id="dot-${i}"></div>`
    )
    .join("");
  setupBannerScroll(promoData.length);
}
function setupBannerScroll(count) {
  const slider = $("#promoList");
  if (bannerInterval) clearInterval(bannerInterval);
  slider.addEventListener("scroll", () => {
    const activeIndex = Math.round(
      slider.scrollLeft / (slider.offsetWidth * 0.9)
    );
    for (let i = 0; i < count; i++) {
      const dot = $(`#dot-${i}`);
      if (dot)
        i === activeIndex
          ? dot.classList.add("active")
          : dot.classList.remove("active");
    }
  });
}
window.setCategory = (c) => {
  state.activeCategory = c;
  renderVendors();
};
function renderVendors() {
  const q = ($("#search").value || "").toLowerCase();
  const cat = state.activeCategory.toLowerCase();
  let list = state.vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(q) &&
      (cat === "semua" || v.type.includes(cat))
  );
  if (state.you.ok) list.sort((a, b) => getDistanceVal(a) - getDistanceVal(b));
  $("#vendorList").innerHTML =
    list
      .map((v) => {
        const isClosed = !v.isLive;
        const statusBadge = isClosed
          ? `<span class="chip closed">🔴 Tutup</span>`
          : `<span class="chip">📍 ${distText(v)}</span>`;
        const cardClass = isClosed ? "vendorCard closed" : "vendorCard";
        const logoDisplay = v.logo ? `<img src="${v.logo}" />` : v.ico;
        return `<div class="${cardClass}" onclick="openVendor('${
          v.id
        }')"><div class="vIco">${logoDisplay}</div><div class="vMeta"><b>${
          v.name
        }</b><div class="muted">⭐ ${
          v.rating ? v.rating.toFixed(1) : "New"
        } • ${
          v.busy
        }</div><div class="chips"><span class="chip">${v.type.toUpperCase()}</span>${statusBadge}</div></div><b style="color:var(--primary)">Lihat</b></div>`;
      })
      .join("") || `<div class="card muted">Tidak ada pedagang aktif.</div>`;
}
$("#search").addEventListener("input", renderVendors);

// --- MAP ---
function initMap() {
  if (state.map) return;
  if (!$("#map")) return;
  state.map = L.map("map", { zoomControl: false }).setView(
    [state.you.lat, state.you.lon],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OSM",
  }).addTo(state.map);
  const userIcon = L.divIcon({ className: "user-pulse", iconSize: [20, 20] });
  state.userMarker = L.marker([state.you.lat, state.you.lon], {
    icon: userIcon,
  }).addTo(state.map);
  L.circle([state.you.lat, state.you.lon], {
    color: "#3b82f6",
    fillColor: "#3b82f6",
    fillOpacity: 0.1,
    radius: 300,
    weight: 1,
  }).addTo(state.map);
  updateMapMarkers();
}
function getEmojiForType(t) {
  t = t.toLowerCase();
  if (t === "semua") return "♾️";
  if (t.includes("bakso") || t.includes("mie")) return "🍜";
  if (t.includes("kopi") || t.includes("es") || t.includes("minum"))
    return "☕";
  if (t.includes("nasi") || t.includes("ayam") || t.includes("bebek"))
    return "🍚";
  if (t.includes("sate")) return "🍢";
  if (t.includes("snack") || t.includes("cemilan") || t.includes("roti"))
    return "🥪";
  return "🍴";
}
function renderMapChips() {
  const rawTypes = state.vendors.map((v) => v.type);
  const uniqueTypes = ["Semua", ...new Set(rawTypes)];
  const container = $("#mapChipsContainer");
  if (container) {
    container.innerHTML = uniqueTypes
      .map((type) => {
        const isActive = state.mapCategory.toLowerCase() === type.toLowerCase();
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const emoji = getEmojiForType(type);
        return `<div class="map-chip ${
          isActive ? "active" : ""
        }" onclick="filterMap('${type}')">${emoji} ${label}</div>`;
      })
      .join("");
  }
}
window.filterMap = (cat) => {
  state.mapCategory = cat;
  renderMapChips();
  updateMapMarkers(true);
  closeMapCard();
};
function updateMapMarkers(fitBounds = false) {
  if (!state.map) return;
  const cat = state.mapCategory.toLowerCase();
  let filtered = state.vendors.filter(
    (v) => cat === "semua" || v.type.toLowerCase().includes(cat)
  );
  if (state.you.ok)
    filtered.sort((a, b) => getDistanceVal(a) - getDistanceVal(b));
  if (filtered.length > 0 && state.you.ok) {
    const nearest = filtered[0];
    if (state.lastNearestId !== nearest.id && !state.activeMapVendorId) {
      state.lastNearestId = nearest.id;
      showToast(
        `📍 Terdekat: <b>${nearest.name}</b> (${distText(nearest)})`,
        "info"
      );
    }
  }
  $("#realtimeList").innerHTML = filtered
    .map((v, idx) => {
      const isClosed = !v.isLive;
      const statusText = isClosed ? "🔴 Tutup" : `📍 ${distText(v)}`;
      const isNearest = idx === 0 && !isClosed && state.you.ok;
      const itemClass = isNearest
        ? "listItem nearest"
        : isClosed
        ? "listItem closed"
        : "listItem";
      return `<div class="${itemClass}" onclick="openVendor('${
        v.id
      }')" style="cursor:pointer"><div class="rowBetween"><div><b>${v.ico} ${
        v.name
      }</b><div class="muted" style="font-size:12px">(${v.lat.toFixed(
        4
      )}, ${v.lon.toFixed(
        4
      )})</div></div><div class="pill small">${statusText}</div></div></div>`;
    })
    .join("");
  const bounds = L.latLngBounds();
  if (state.you.ok) bounds.extend([state.you.lat, state.you.lon]);
  Object.keys(state.markers).forEach((id) => {
    const v = filtered.find((x) => x.id === id);
    if (!v) {
      state.map.removeLayer(state.markers[id]);
      delete state.markers[id];
    }
  });
  filtered.forEach((v) => {
    bounds.extend([v.lat, v.lon]);
    if (state.markers[v.id]) {
      state.markers[v.id].setLatLng([v.lat, v.lon]);
    } else {
      const html = `<div class="vendor-marker-custom" id="mark-${v.id}"><div class="vm-bubble">${v.ico}</div><div class="vm-arrow"></div></div>`;
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: html,
        iconSize: [40, 50],
        iconAnchor: [20, 50],
      });
      const m = L.marker([v.lat, v.lon], { icon: icon }).addTo(state.map);
      m.on("click", () => selectVendorOnMap(v));
      state.markers[v.id] = m;
    }
  });
  if (fitBounds && filtered.length > 0) {
    state.map.fitBounds(bounds, { padding: [50, 50] });
  }
  if (state.activeMapVendorId) {
    const v = state.vendors.find((x) => x.id === state.activeMapVendorId);
    if (v) {
      $("#mvcDist").textContent = distText(v) + " dari Anda";
      if (!v.isLive) {
        $("#mvcType").textContent = "🔴 TUTUP";
        $("#mvcType").style.color = "red";
        $("#mvcType").style.background = "#fee2e2";
      } else {
        $("#mvcType").textContent = v.type.toUpperCase();
        $("#mvcType").style.color = "#666";
        $("#mvcType").style.background = "#eee";
      }
      if (state.routeLine && state.you.ok)
        state.routeLine.setLatLngs([
          [state.you.lat, state.you.lon],
          [v.lat, v.lon],
        ]);
    }
  }
  if (state.trackingVendorId) {
    const v = state.vendors.find((x) => x.id === state.trackingVendorId);
    if (v && state.markers[v.id]) {
      selectVendorOnMap(v);
      showToast(`Melacak ${v.name}...`);
    }
    state.trackingVendorId = null;
  }
}
function selectVendorOnMap(v) {
  state.activeMapVendorId = v.id;
  $$(".vm-bubble").forEach((b) => b.classList.remove("active"));
  const el = document.querySelector(`#mark-${v.id} .vm-bubble`);
  if (el) el.classList.add("active");
  $("#mvcIcon").textContent = v.ico;
  $("#mvcName").textContent = v.name;
  $("#mvcDist").textContent = distText(v) + " dari Anda";
  if (!v.isLive) {
    $("#mvcType").textContent = "🔴 TUTUP";
    $("#mvcType").style.color = "red";
    $("#mvcType").style.background = "#fee2e2";
  } else {
    $("#mvcType").textContent = v.type.toUpperCase();
    $("#mvcType").style.color = "#666";
    $("#mvcType").style.background = "#eee";
  }
  $("#mvcBtn").onclick = () => openVendor(v.id);
  const card = $("#mapCard");
  card.classList.remove("hidden");
  void card.offsetWidth;
  card.classList.add("visible");
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  if (state.you.ok) {
    state.routeLine = L.polyline(
      [
        [state.you.lat, state.you.lon],
        [v.lat, v.lon],
      ],
      {
        color: "#ff7a00",
        weight: 4,
        opacity: 0.7,
        dashArray: "10, 10",
        lineCap: "round",
      }
    ).addTo(state.map);
    state.map.fitBounds(state.routeLine.getBounds(), {
      padding: [50, 150],
      maxZoom: 16,
    });
  } else {
    state.map.setView([v.lat, v.lon], 16);
  }
}
window.closeMapCard = () => {
  state.activeMapVendorId = null;
  $("#mapCard").classList.remove("visible");
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }
  $$(".vm-bubble").forEach((b) => b.classList.remove("active"));
};
window.trackOrder = (vid) => {
  state.trackingVendorId = vid;
  state.mapCategory = "Semua";
  renderMapChips();
  window.go("Map");
};

// --- MENU & CART ---
const MENU_DEFAULTS = {
  bakso: [{ id: "m1", name: "Bakso Urat", price: 15000 }],
  kopi: [{ id: "k1", name: "Kopi Susu", price: 12000 }],
  nasi: [{ id: "n1", name: "Nasi Goreng", price: 18000 }],
};
window.openVendor = (id) => {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;
  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = v.type;
  const isClosed = !v.isLive;
  let banner = "";
  if (isClosed) {
    banner = `<div class="shop-closed-banner">🔒 Maaf, Toko Sedang Tutup</div>`;
  }
  let menuData =
    v.menu && v.menu.length > 0 ? v.menu : MENU_DEFAULTS[v.type] || [];
  $("#menuList").innerHTML =
    banner +
    menuData
      .map((m) => {
        const btnState = isClosed ? "disabled" : "";
        const btnText = isClosed ? "Tutup" : "+ Tambah";
        const btnClass = isClosed ? "btn small" : "btn small primary";
        const imgDisplay = m.image
          ? `<img src="${m.image}" class="menu-img" loading="lazy" />`
          : `<div class="menu-img">🍲</div>`;
        return `
    <div class="menu-item-card">
      ${imgDisplay}
      <div class="menu-info">
        <b>${m.name}</b>
        <div class="muted">${rupiah(m.price)}</div>
      </div>
      <div class="menu-btn-container">
        <button class="${btnClass}" ${btnState} onclick="addToCart('${id}', '${
          m.id
        }', '${m.name}', ${m.price})">${btnText}</button>
      </div>
    </div>`;
      })
      .join("");
  openModal("vendorModal");
};
window.addToCart = (vid, mid, mName, mPrice) => {
  if (!state.user) return requireLogin();
  const v = state.vendors.find((x) => x.id === vid);
  if (v && !v.isLive) {
    return alert("Maaf, toko ini sedang tutup. Tidak bisa memesan.");
  }
  if (!mName) {
    const type = v ? v.type : "bakso";
    const item = MENU_DEFAULTS[type].find((x) => x.id === mid);
    if (item) {
      mName = item.name;
      mPrice = item.price;
    }
  }
  const ex = state.cart.find((x) => x.itemId === mid && x.vendorId === vid);
  if (ex) ex.qty++;
  else
    state.cart.push({
      vendorId: vid,
      vendorName: v ? v.name : "Vendor",
      itemId: mid,
      name: mName,
      price: parseInt(mPrice),
      qty: 1,
    });
  updateFab();
  showToast("Masuk keranjang");
};
function updateFab() {
  const t = state.cart.reduce((a, b) => a + b.qty, 0);
  $("#cartBadge").textContent = t;
  t > 0
    ? $("#fabCart").classList.remove("hidden")
    : $("#fabCart").classList.add("hidden");
}
window.openGlobalCart = () => {
  if (!state.user) return requireLogin();
  if (!state.cart.length) return showToast("Keranjang kosong");
  renderCartModal();
  openModal("checkoutModal");
};
window.triggerProofUpload = () => {
  $("#paymentProofInput").click();
};
window.handleProofUpload = async (input) => {
  if (input.files && input.files[0]) {
    $("#proofText").textContent = "⏳ Mengompres...";
    try {
      const compressed = await compressImage(input.files[0], 600, 0.6);
      state.tempPaymentProof = compressed;
      $("#proofText").textContent = "✅ Bukti Siap (Klik Ganti)";
      $(".proof-upload").style.borderColor = "#22c55e";
      $(".proof-upload").style.background = "#f0fdf4";
    } catch (e) {
      alert("Gagal proses gambar. Coba lagi.");
      $("#proofText").textContent = "📷 Klik untuk upload bukti";
    }
    input.value = "";
  }
};
function renderCartModal() {
  $("#checkoutItems").innerHTML = state.cart
    .map(
      (i, idx) =>
        `<div class="cart-item-row"><div style="flex:1"><div style="font-weight:bold; font-size:14px">${
          i.name
        }</div><div class="muted" style="font-size:12px">${rupiah(i.price)} • ${
          i.vendorName
        }</div></div><div class="cart-controls"><button class="ctrl-btn" onclick="updateCartQty(${idx}, -1)">-</button><span class="ctrl-qty">${
          i.qty
        }</span><button class="ctrl-btn add" onclick="updateCartQty(${idx}, 1)">+</button></div><button class="iconBtn" style="width:30px; height:30px; margin-left:10px; border-color:#fee; color:red; background:#fff5f5" onclick="deleteCartItem(${idx})">🗑</button></div>`
    )
    .join("");
  $("#checkoutTotal").textContent = rupiah(
    state.cart.reduce((a, b) => a + b.price * b.qty, 0)
  );
  const vendorId = state.cart[0].vendorId;
  const vendor = state.vendors.find((v) => v.id === vendorId);
  const paySelect = $("#payMethod");
  const qrisCont = $("#qrisContainer");
  const qrisImg = $("#qrisImageDisplay");
  paySelect.innerHTML = "";
  qrisCont.classList.add("hidden");
  if (vendor && vendor.paymentMethods) {
    if (vendor.paymentMethods.includes("cash")) {
      paySelect.innerHTML += `<option value="cash">💵 Tunai</option>`;
    }
    if (vendor.paymentMethods.includes("qris") && vendor.qrisImage) {
      paySelect.innerHTML += `<option value="qris">📱 QRIS</option>`;
    }
  } else {
    paySelect.innerHTML = `<option value="cash">💵 Tunai</option>`;
  }
  paySelect.onchange = () => {
    if (paySelect.value === "qris") {
      qrisImg.src = vendor.qrisImage;
      qrisCont.classList.remove("hidden");
      state.tempPaymentProof = null;
      $("#proofText").textContent = "📷 Klik untuk upload bukti";
      $(".proof-upload").style.borderColor = "#cbd5e1";
      $(".proof-upload").style.background = "#f8fafc";
    } else {
      qrisCont.classList.add("hidden");
      state.tempPaymentProof = null;
    }
  };
}
$("#placeOrderBtn").addEventListener("click", async () => {
  if (!state.user) return requireLogin();
  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    let phone = state.user.phone;
    if (!phone || phone.length < 9) {
      phone = prompt(
        "Wajib isi Nomor WhatsApp aktif untuk konfirmasi pesanan:"
      );
      if (!phone || phone.length < 9) {
        alert("Nomor WA tidak valid. Pesanan dibatalkan.");
        btn.disabled = false;
        btn.textContent = "Pesan & Verifikasi";
        return;
      }
      await updateDoc(doc(db, "users", state.user.id), { phone: phone });
      state.user.phone = phone;
    }
    const total = state.cart.reduce((a, b) => a + b.price * b.qty, 0);
    const vName = state.cart[0].vendorName;
    const vId = state.cart[0].vendorId;
    const payment = $("#payMethod").value;
    if (payment === "qris" && !state.tempPaymentProof) {
      alert("Wajib upload bukti transfer untuk pembayaran QRIS!");
      btn.disabled = false;
      btn.textContent = "Pesan & Verifikasi";
      return;
    }
    const securePin = generatePin();
    await addDoc(collection(db, "orders"), {
      userId: state.user.id,
      userName: state.user.name,
      userPhone: phone,
      vendorId: vId,
      vendorName: vName,
      items: state.cart,
      total: total,
      note: $("#orderNote").value,
      paymentMethod: payment,
      paymentProof: state.tempPaymentProof || null,
      isPaymentVerified: payment === "cash",
      securePin: securePin,
      status: payment === "qris" ? "Menunggu Konfirmasi Bayar" : "Diproses",
      createdAt: new Date().toISOString(),
    });
    state.cart = [];
    state.tempPaymentProof = null;
    updateFab();
    closeModal("checkoutModal");
    window.go("Orders");
    showToast("Pesanan dibuat!");
  } catch (e) {
    alert(e.message);
  }
  btn.disabled = false;
  btn.textContent = "Pesan & Verifikasi";
});
window.updateCartQty = (idx, change) => {
  const item = state.cart[idx];
  item.qty += change;
  if (item.qty <= 0) {
    if (confirm("Hapus?")) state.cart.splice(idx, 1);
    else item.qty = 1;
  }
  updateFab();
  if (!state.cart.length) closeModal("checkoutModal");
  else renderCartModal();
};
window.deleteCartItem = (idx) => {
  if (confirm("Hapus?")) {
    state.cart.splice(idx, 1);
    updateFab();
    if (!state.cart.length) closeModal("checkoutModal");
    else renderCartModal();
  }
};
window.switchOrderTab = (tab) => {
  state.activeOrderTab = tab;
  $$(".segment-btn").forEach((b) => b.classList.remove("active"));
  tab === "active"
    ? $$(".segment-btn")[0].classList.add("active")
    : $$(".segment-btn")[1].classList.add("active");
  renderOrders();
};
function renderOrders() {
  const list = $("#ordersList");
  if (!state.user) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Login untuk melihat pesanan.</p><button class="btn small primary" onclick="requireLogin()">Login Disini</button></div>`;
    return;
  }
  const filtered = state.orders.filter((o) =>
    state.activeOrderTab === "active"
      ? o.status !== "Selesai" && !o.status.includes("Dibatalkan")
      : o.status === "Selesai" || o.status.includes("Dibatalkan")
  );
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${
      state.activeOrderTab === "active" ? "🥘" : "🧾"
    }</span><p>Kosong.</p><button class="btn small primary" onclick="go('Home')">Jajan Yuk</button></div>`;
    return;
  }
  list.innerHTML = filtered
    .map((o) => {
      const items = (o.items || [])
        .map((i) => `${i.qty}x ${i.name}`)
        .join(", ");
      let statusBadge = "",
        statusIcon = "⏳",
        statusDesc = "Menunggu...",
        actionButtons = "";
      if (o.status === "Menunggu Konfirmasi Bayar") {
        statusBadge = "orange";
        statusIcon = "💰";
        statusDesc = "Penjual sedang cek bukti transfer...";
      } else if (o.status === "Diproses") {
        statusBadge = "blue";
        statusIcon = "👨‍🍳";
        statusDesc = "Sedang dimasak...";
      } else if (
        o.status === "Siap Diambil/Diantar" ||
        o.status === "Dalam perjalanan"
      ) {
        statusBadge = "orange";
        statusIcon = "🛵";
        statusDesc = "Pesanan siap! Tunjukkan PIN.";
        actionButtons = `<div style="background:#f0fdf4; border:1px solid #22c55e; color:#15803d; padding:8px; border-radius:8px; text-align:center; margin-top:8px;"><small>PIN Keamanan:</small><br><b style="font-size:18px; letter-spacing:2px;">${o.securePin}</b><div style="font-size:10px;">Berikan ke penjual saat terima pesanan</div></div><button class="btn small ghost" onclick="trackOrder('${o.vendorId}')" style="width:100%; margin-top:5px;">🗺️ Lacak Posisi</button>`;
      } else if (o.status === "Selesai") {
        statusBadge = "green";
        statusIcon = "✅";
        statusDesc = "Selesai.";
        const rateBtn = !o.rating
          ? `<button class="btn small primary" onclick="rate('${o.id}','${o.vendorId}')" style="flex:1">⭐ Nilai</button>`
          : `<div class="pill" style="flex:1; text-align:center">Rating: ${o.rating}⭐</div>`;
        actionButtons = `${rateBtn}<button class="btn small ghost" onclick="reorder('${o.id}')" style="flex:1">🔄 Pesan Lagi</button>`;
      } else if (o.status.includes("Dibatalkan")) {
        statusBadge = "red";
        statusIcon = "❌";
        statusDesc = o.status;
      }
      return `<div class="order-card"><div class="oc-header"><div><b style="font-size:15px">${
        o.vendorName
      }</b><div class="muted" style="font-size:11px">${new Date(
        o.createdAt
      ).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}</div></div><span class="badge ${statusBadge}">${
        o.status
      }</span></div><div class="oc-body"><div style="font-size:13px; margin-bottom:12px">${items}</div>${
        state.activeOrderTab === "active"
          ? `<div class="step-compact"><div class="step-icon">${statusIcon}</div><div><b style="font-size:13px; display:block">${o.status}</b><span class="muted" style="font-size:11px">${statusDesc}</span></div></div>`
          : `<div class="rowBetween"><span class="muted" style="font-size:12px">Total Bayar</span><b style="font-size:16px">${rupiah(
              o.total
            )}</b></div>`
      }</div>${
        actionButtons
          ? `<div class="oc-footer" style="display:block">${actionButtons}</div>`
          : ""
      }</div>`;
    })
    .join("");
}
$("#chatVendorBtn").addEventListener("click", () => {
  if (!state.user) return requireLogin();
  if (state.selectedVendorId) {
    state.chatWithVendorId = state.selectedVendorId;
    closeModal("vendorModal");
    window.selectChat(state.selectedVendorId);
  } else {
    showToast("Error: ID Vendor");
  }
});
function getChatId() {
  return `${state.user.id}_${state.chatWithVendorId}`;
}
window.go = (n) => {
  if ((n === "Orders" || n === "Messages") && !state.user) {
    requireLogin();
    return;
  }
  Object.values(screens).forEach((e) => e.classList.add("hidden"));
  screens[n].classList.remove("hidden");
  if (n === "Messages" && window.innerWidth < 768)
    $("#mainHeader").classList.add("hidden");
  else $("#mainHeader").classList.remove("hidden");
  $$(".nav").forEach((b) => b.classList.toggle("active", b.dataset.go === n));
  if (n === "Map") {
    initMap();
    setTimeout(() => state.map.invalidateSize(), 300);
  }
  if (n === "Messages") renderInbox();
};
$$(".nav").forEach((b) =>
  b.addEventListener("click", () => window.go(b.dataset.go))
);
function renderProfile() {
  const container = $("#profileContent");
  if (state.user) {
    container.innerHTML = `<div class="card"><div class="rowBetween"><div style="display: flex; gap: 12px; align-items: center"><div style="width: 50px; height: 50px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div><div><b id="pName" style="display: block">${
      state.user.name
    }</b><span id="pEmail" class="muted" style="font-size: 12px">${
      state.user.email
    }</span></div></div></div><hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;" /><div class="rowBetween" style="margin-bottom: 10px"><span class="muted">Saldo</span><b class="big" style="color: var(--primary)" id="wallet">${rupiah(
      state.user.wallet
    )}</b></div><button id="topupBtn" class="btn primary" onclick="doTopup()" style="width: 100%">Isi Saldo (+50k)</button></div>`;
    $("#mobileProfileLogout").textContent = "Keluar Akun";
    $("#mobileProfileLogout").onclick = () => {
      if (confirm("Keluar?")) {
        localStorage.removeItem("pikul_user_id");
        location.reload();
      }
    };
    $("#logoutBtn").style.display = "flex";
  } else {
    container.innerHTML = `<div class="card"><div style="text-align:center; padding:20px;"><div style="font-size:40px; margin-bottom:10px;">👋</div><b>Halo, Tamu!</b><p class="muted" style="margin:5px 0 20px;">Masuk untuk melihat saldo dan profil.</p><button class="btn primary full" onclick="requireLogin()">Masuk / Daftar</button></div></div>`;
    $("#mobileProfileLogout").style.display = "none";
    $("#logoutBtn").style.display = "none";
  }
}
window.doTopup = async () => {
  if (!state.user) return;
  await updateDoc(doc(db, "users", state.user.id), {
    wallet: (state.user.wallet || 0) + 50000,
  });
  state.user.wallet += 50000;
  renderProfile();
  showToast("Saldo bertambah!");
};
function showToast(m, type = "info") {
  let c = $(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  const e = document.createElement("div");
  e.className = "toast";
  e.innerHTML = m;
  c.appendChild(e);
  setTimeout(() => e.remove(), 3000);
}
function initTheme() {
  const d = localStorage.getItem("pikul_theme") === "dark";
  if (d) document.body.setAttribute("data-theme", "dark");
  if ($("#themeSwitch")) {
    $("#themeSwitch").checked = d;
    $("#themeSwitch").addEventListener("change", (e) => {
      e.target.checked
        ? (document.body.setAttribute("data-theme", "dark"),
          localStorage.setItem("pikul_theme", "dark"))
        : (document.body.removeAttribute("data-theme"),
          localStorage.setItem("pikul_theme", "light"));
    });
  }
}
function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  setTimeout(() => $("#splash").remove(), 500);
}
function startGPS() {
  if (navigator.geolocation)
    navigator.geolocation.watchPosition((p) => {
      state.you = { ok: true, lat: p.coords.latitude, lon: p.coords.longitude };
      $("#gpsStatus").textContent = "GPS ON";
      $("#gpsStatus").className = "pill";
      if (state.map && state.userMarker) {
        state.userMarker.setLatLng([state.you.lat, state.you.lon]);
        updateMapMarkers();
      }
    });
}
function distText(v) {
  if (!state.you.ok) return "? km";
  const d =
    Math.sqrt(
      Math.pow(v.lat - state.you.lat, 2) + Math.pow(v.lon - state.you.lon, 2)
    ) * 111;
  return d.toFixed(1) + " km";
}
function openModal(id) {
  $("#" + id).classList.remove("hidden");
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
}
$$("[data-close]").forEach((el) =>
  el.addEventListener("click", () => closeModal(el.dataset.close))
);
initAuth();
