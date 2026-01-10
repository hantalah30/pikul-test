import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  orderBy,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
function rupiah(n) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

let state = {
  vendor: null,
  watchId: null,
  map: null,
  marker: null,
  locMode: "gps",
  activeChatId: null,
  unsubMsg: null,
  orders: [],
  editingMenuIndex: null,
  tempMenuImage: null,
  tempPayProof: null, // Bukti bayar premium
  pendingSub: null,
  approvedSub: null,
};

// --- GLOBAL EXPORTS (FIX TOMBOL TIDAK BERFUNGSI) ---
window.triggerPayProofUpload = () => {
  $("#payProofInput").click();
};
window.closePayModal = () => {
  $("#payModal").classList.add("hidden");
};
window.triggerMenuImageUpload = () => {
  $("#mImageInput").click();
};
window.closeModal = () => $("#menuModal").classList.add("hidden");

// --- HELPER ---
function compressImage(file, maxWidth = 500, quality = 0.7) {
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
function formatWA(phone) {
  if (!phone) return "";
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("08")) p = "62" + p.substring(1);
  if (p.startsWith("8")) p = "62" + p;
  return p;
}

// --- AUTH ---
window.switchAuthMode = (mode) => {
  const tabs = $$(".auth-tab");
  const forms = $$(".auth-form");
  if (mode === "login") {
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
    forms[0].classList.remove("hidden");
    forms[1].classList.add("hidden");
  } else {
    tabs[1].classList.add("active");
    tabs[0].classList.remove("active");
    forms[1].classList.remove("hidden");
    forms[0].classList.add("hidden");
  }
};
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim(),
    password = $("#password").value,
    btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const q = query(collection(db, "vendors"), where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) {
      alert("Email tidak ditemukan.");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    const vData = snap.docs[0].data();
    if (vData.password && vData.password !== password) {
      alert("Password salah!");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    state.vendor = { id: snap.docs[0].id, ...vData };
    localStorage.setItem("pikul_seller_id", state.vendor.id);
    initApp();
  } catch (err) {
    alert("Error: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Masuk Dashboard";
});
$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#regName").value.trim(),
    type = $("#regType").value,
    email = $("#regEmail").value.trim(),
    password = $("#regPass").value,
    btn = e.target.querySelector("button");
  if (password.length < 6) return alert("Password minimal 6 karakter");
  btn.disabled = true;
  btn.textContent = "Mendaftar...";
  try {
    const q = query(collection(db, "vendors"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert("Email sudah terdaftar.");
      btn.disabled = false;
      btn.textContent = "Daftar";
      return;
    }
    const newVendor = {
      email,
      password,
      name,
      type,
      ico: "🏪",
      rating: 5.0,
      busy: "Buka",
      lat: -6.2,
      lon: 106.8,
      menu: [],
      subscriptionExpiry: 0,
      isLive: false,
      locationMode: "gps",
      paymentMethods: ["cash"],
      qrisImage: null,
      logo: null,
    };
    const ref = await addDoc(collection(db, "vendors"), newVendor);
    state.vendor = { id: ref.id, ...newVendor };
    localStorage.setItem("pikul_seller_id", state.vendor.id);
    initApp();
  } catch (err) {
    alert("Gagal daftar: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Daftar Sekarang";
});
window.logout = () => {
  if (confirm("Keluar dari Mitra?")) {
    localStorage.removeItem("pikul_seller_id");
    location.reload();
  }
};

// --- INIT APP ---
async function initApp() {
  const vid = localStorage.getItem("pikul_seller_id");
  if (!vid) return $("#auth").classList.remove("hidden");
  try {
    const docSnap = await getDoc(doc(db, "vendors", vid));
    if (!docSnap.exists()) {
      localStorage.removeItem("pikul_seller_id");
      return $("#auth").classList.remove("hidden");
    }
    state.vendor = { id: docSnap.id, ...docSnap.data() };
    $("#auth").classList.add("hidden");
    $(".app-layout").classList.remove("hidden");

    onSnapshot(doc(db, "vendors", state.vendor.id), (doc) => {
      if (doc.exists()) {
        state.vendor = { id: doc.id, ...doc.data() };
        renderUI();
        renderPaymentSettings();
      }
    });

    // Check Pending Subs
    onSnapshot(
      query(
        collection(db, "subscriptions"),
        where("vendorId", "==", state.vendor.id),
        where("status", "==", "pending")
      ),
      (snap) => {
        state.pendingSub = !snap.empty;
        renderUI();
      }
    );

    // Check Approved Subs (Waiting for Code Input)
    onSnapshot(
      query(
        collection(db, "subscriptions"),
        where("vendorId", "==", state.vendor.id),
        where("status", "==", "approved")
      ),
      (snap) => {
        if (!snap.empty) {
          state.approvedSub = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } else {
          state.approvedSub = null;
        }
        renderUI();
      }
    );

    const qOrd = query(
      collection(db, "orders"),
      where("vendorId", "==", state.vendor.id)
    );
    onSnapshot(qOrd, (snap) => {
      state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderOrdersList();
      calculateStats();
    });
  } catch (e) {
    console.error(e);
    $("#auth").classList.remove("hidden");
  }
}

function renderUI() {
  if (!state.vendor) return;
  $("#vName").textContent = state.vendor.name;
  $("#vNameDisplay").textContent = state.vendor.name;
  if (state.vendor.logo) {
    $("#shopLogoPreview").src = state.vendor.logo;
    $("#shopLogoPreview").classList.remove("hidden");
    $("#shopLogoPlaceholder").classList.add("hidden");
  }

  // --- LOGIC STATUS ---
  const isExpired = state.vendor.subscriptionExpiry < Date.now();

  // Reset all Alerts
  $("#subAlert").classList.add("hidden");
  $("#subPending").classList.add("hidden");
  $("#subActivation").classList.add("hidden");
  $("#subActive").classList.add("hidden");

  if (state.pendingSub) {
    // 1. Pending (Menunggu Admin)
    $("#subPending").classList.remove("hidden");
    disableShop();
  } else if (
    isExpired &&
    state.approvedSub &&
    state.approvedSub.method === "cash"
  ) {
    // 2. Approved Cash (Butuh Kode)
    $("#subActivation").classList.remove("hidden");
    disableShop();
  } else if (isExpired) {
    // 3. Expired (Belum Bayar)
    $("#subAlert").classList.remove("hidden");
    disableShop();
  } else {
    // 4. Active
    $("#subActive").classList.remove("hidden");
    $("#expDate").textContent = new Date(
      state.vendor.subscriptionExpiry
    ).toLocaleDateString();
    enableShop();
  }

  $("#menuList").innerHTML =
    (state.vendor.menu || [])
      .map(
        (m, idx) => `
    <div class="menu-card">
      <div style="display:flex; align-items:center;">
        ${
          m.image
            ? `<img src="${m.image}" class="menu-thumb" />`
            : '<div class="menu-thumb" style="display:flex;align-items:center;justify-content:center;">🍲</div>'
        }
        <div><div style="font-weight:700">${
          m.name
        }</div><div style="color:var(--text-muted); font-size:13px;">${rupiah(
          m.price
        )}</div></div>
      </div>
      <div class="menu-actions">
        <button class="btn-icon-action btn-edit" onclick="openEditMenu(${idx})">✎</button>
        <button class="btn-icon-action btn-del" onclick="deleteMenu(${idx})">🗑</button>
      </div>
    </div>`
      )
      .join("") || `<div class="empty-state-box">Belum ada menu.</div>`;
}

function disableShop() {
  $("#statusToggle").disabled = true;
  $("#statusToggle").checked = false;
  $("#locationControls").classList.add("hidden");
  $("#statusText").textContent = "Tidak Aktif";
  $("#statusText").className = "status-indicator offline";
  stopGPS();
}

function enableShop() {
  $("#statusToggle").disabled = false;
  $("#statusToggle").checked = state.vendor.isLive;
  if (state.vendor.isLive) {
    $("#statusText").textContent = "Toko Buka (Online)";
    $("#statusText").className = "status-indicator online";
    $("#locationControls").classList.remove("hidden");
    if (!state.map) initMap();
    state.locMode = state.vendor.locationMode || "gps";
    updateModeButtons();
    handleLocationLogic();
  } else {
    $("#statusText").textContent = "Toko Tutup (Offline)";
    $("#statusText").className = "status-indicator offline";
    $("#locationControls").classList.add("hidden");
    stopGPS();
  }
}

// --- REDEEM CODE ---
window.redeemCode = async () => {
  const inputCode = parseInt($("#activationCode").value);

  if (!state.approvedSub || !state.approvedSub.activationCode) {
    alert("Data kode tidak ditemukan. Hubungi admin.");
    return;
  }

  if (inputCode === state.approvedSub.activationCode) {
    const now = Date.now();
    // 1. Activate Vendor
    await updateDoc(doc(db, "vendors", state.vendor.id), {
      subscriptionExpiry: now + 30 * 24 * 60 * 60 * 1000,
    });
    // 2. Mark Redeemed
    await updateDoc(doc(db, "subscriptions", state.approvedSub.id), {
      status: "redeemed",
    });
    alert("Kode Benar! Akun Anda aktif.");
  } else {
    alert("Kode Salah!");
  }
};

// --- PAY MODAL ---
$("#payBtn").addEventListener("click", () => {
  $("#payModal").classList.remove("hidden");
});
window.selectPayMethod = (method) => {
  if (method === "cash") {
    $("#payCash").classList.remove("hidden");
    $("#payQris").classList.add("hidden");
  } else {
    $("#payCash").classList.add("hidden");
    $("#payQris").classList.remove("hidden");
  }
};
window.handlePayProof = async (input) => {
  if (input.files && input.files[0]) {
    try {
      state.tempPayProof = await compressImage(input.files[0], 500, 0.6);
      $("#payProofText").textContent = "✅ Bukti Siap";
    } catch (e) {
      alert("Gagal proses gambar");
    }
  }
};
window.submitSubscription = async (method) => {
  if (method === "qris" && !state.tempPayProof) {
    alert("Mohon upload bukti transfer dulu.");
    return;
  }

  await addDoc(collection(db, "subscriptions"), {
    vendorId: state.vendor.id,
    vendorName: state.vendor.name,
    amount: 5000,
    timestamp: Date.now(),
    type: "Premium Bulanan",
    method: method,
    proof: state.tempPayProof || null,
    status: "pending",
  });

  $("#payModal").classList.add("hidden");
  alert("Permintaan dikirim! Tunggu validasi Admin.");
};

// ... (Rest of functions) ...
window.triggerLogoUpload = () => {
  $("#shopLogoInput").click();
};
window.handleLogoUpload = async (input) => {
  if (input.files && input.files[0]) {
    try {
      const compressed = await compressImage(input.files[0], 300, 0.7);
      await updateDoc(doc(db, "vendors", state.vendor.id), {
        logo: compressed,
      });
      alert("Logo Updated!");
    } catch (e) {
      alert("Error: " + e.message);
    }
    input.value = "";
  }
};
$("#addMenuBtn").addEventListener("click", () => {
  state.editingMenuIndex = null;
  state.tempMenuImage = null;
  $("#menuModalTitle").textContent = "Tambah Menu";
  $("#mName").value = "";
  $("#mPrice").value = "";
  $("#mImagePreview").classList.add("hidden");
  $("#mImagePlaceholder").classList.remove("hidden");
  $("#menuModal").classList.remove("hidden");
});
window.openEditMenu = (idx) => {
  state.editingMenuIndex = idx;
  const item = state.vendor.menu[idx];
  state.tempMenuImage = item.image || null;
  $("#menuModalTitle").textContent = "Edit Menu";
  $("#mName").value = item.name;
  $("#mPrice").value = item.price;
  if (state.tempMenuImage) {
    $("#mImagePreview").src = state.tempMenuImage;
    $("#mImagePreview").classList.remove("hidden");
    $("#mImagePlaceholder").classList.add("hidden");
  } else {
    $("#mImagePreview").classList.add("hidden");
    $("#mImagePlaceholder").classList.remove("hidden");
  }
  $("#menuModal").classList.remove("hidden");
};
window.handleMenuImageUpload = async (input) => {
  if (input.files && input.files[0]) {
    try {
      const c = await compressImage(input.files[0], 500, 0.8);
      state.tempMenuImage = c;
      $("#mImagePreview").src = c;
      $("#mImagePreview").classList.remove("hidden");
      $("#mImagePlaceholder").classList.add("hidden");
    } catch (e) {
      alert(e.message);
    }
    input.value = "";
  }
};
$("#menuForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#mName").value,
    price = parseInt($("#mPrice").value);
  let updMenu = [...(state.vendor.menu || [])];
  const newItem = {
    id:
      state.editingMenuIndex !== null
        ? updMenu[state.editingMenuIndex].id
        : "m" + Date.now(),
    name,
    price,
    image: state.tempMenuImage,
  };
  if (state.editingMenuIndex !== null) {
    updMenu[state.editingMenuIndex] = newItem;
  } else {
    updMenu.push(newItem);
  }
  await updateDoc(doc(db, "vendors", state.vendor.id), { menu: updMenu });
  window.closeModal();
});
window.deleteMenu = async (idx) => {
  if (confirm("Hapus?")) {
    const upd = [...state.vendor.menu];
    upd.splice(idx, 1);
    await updateDoc(doc(db, "vendors", state.vendor.id), { menu: upd });
  }
};
function renderPaymentSettings() {
  const methods = state.vendor.paymentMethods || ["cash"];
  const hasQris = methods.includes("qris");
  $("#chkCash").checked = methods.includes("cash");
  $("#chkQris").checked = hasQris;
  const qrisConfig = $("#qrisConfig");
  const qrisStatus = $("#qrisStatus");
  const qrisImg = $("#qrisImg");
  const qrisPh = $("#qrisPlaceholder");
  if (hasQris) {
    qrisConfig.classList.remove("hidden");
    if (state.vendor.qrisImage) {
      qrisStatus.textContent = "✅ Aktif";
      qrisStatus.style.color = "#10b981";
      qrisImg.src = state.vendor.qrisImage;
      qrisImg.classList.remove("hidden");
      qrisPh.classList.add("hidden");
      $(".qris-preview").classList.add("has-image");
    } else {
      qrisStatus.textContent = "⚠️ Upload Gambar";
      qrisStatus.style.color = "#f59e0b";
      qrisImg.classList.add("hidden");
      qrisPh.classList.remove("hidden");
      $(".qris-preview").classList.remove("has-image");
    }
  } else {
    qrisConfig.classList.add("hidden");
    qrisStatus.textContent = "Belum Aktif";
    qrisStatus.style.color = "#94a3b8";
  }
}
window.updatePaymentMethod = async () => {
  const cash = $("#chkCash").checked;
  const qris = $("#chkQris").checked;
  let newMethods = [];
  if (cash) newMethods.push("cash");
  if (qris) newMethods.push("qris");
  if (newMethods.length === 0) {
    alert("Minimal satu metode aktif.");
    $("#chkCash").checked = true;
    return;
  }
  await updateDoc(doc(db, "vendors", state.vendor.id), {
    paymentMethods: newMethods,
  });
};
window.triggerQrisUpload = () => {
  $("#qrisInput").click();
};
window.handleQrisUpload = async (input) => {
  if (input.files && input.files[0]) {
    try {
      const c = await compressImage(input.files[0], 500, 0.7);
      await updateDoc(doc(db, "vendors", state.vendor.id), { qrisImage: c });
      alert("QRIS Uploaded!");
    } catch (e) {
      alert(e.message);
    }
    input.value = "";
  }
};
function renderOrdersList() {
  const list = state.orders.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const activeOrders = list.filter(
    (o) => o.status !== "Selesai" && !o.status.includes("Dibatalkan")
  );
  const historyOrders = list.filter(
    (o) => o.status === "Selesai" || o.status.includes("Dibatalkan")
  );
  $("#incomingCount").textContent = activeOrders.length;
  const renderItem = (o, active) => {
    const itemsUI = (o.items || [])
      .map((i) => `${i.qty}x ${i.name}`)
      .join(", ");
    let stCls =
      o.status === "Diproses"
        ? "status-process"
        : o.status === "Siap Diambil/Diantar"
        ? "status-deliv"
        : "status-done";
    if (o.status.includes("Dibatalkan")) stCls = "status-cancel";
    let btn = "";
    if (active) {
      if (o.status === "Menunggu Konfirmasi Bayar") {
        btn = `<div style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:10px;"><p style="margin:0 0 5px 0; font-size:12px;"><b>Bukti Transfer:</b></p><img src="${o.paymentProof}" style="width:100%; border-radius:8px; margin-bottom:8px; border:1px solid #ccc; cursor:pointer;" onclick="window.open(this.src)" /><div style="display:flex; gap:8px;"><button class="btn full" style="background:#ef4444; color:white;" onclick="updStat('${o.id}','Dibatalkan (Bukti Salah)')">Tolak</button><button class="btn primary full" onclick="updStat('${o.id}','Diproses')">Terima</button></div></div>`;
      } else if (o.status === "Diproses") {
        btn = `<button class="btn primary full" onclick="updStat('${o.id}','Siap Diambil/Diantar')">✅ Selesai Masak</button>`;
      } else if (o.status === "Siap Diambil/Diantar") {
        btn = `<div style="display:flex; gap:8px;"><input id="pin-${o.id}" placeholder="PIN (4 digit)" style="width:100px; padding:8px; border:1px solid #ccc; border-radius:8px; font-size:14px;" maxlength="4" /><button class="btn full" style="background:#10b981; color:white;" onclick="verifyPin('${o.id}', '${o.securePin}')">Verifikasi</button></div>`;
      }
    }
    const waNum = formatWA(o.userPhone);
    const waLink = waNum ? `https://wa.me/${waNum}?text=Halo` : "#";
    const waBtn = waNum
      ? `<a href="${waLink}" target="_blank" style="font-size:12px; color:#22c55e; text-decoration:none; font-weight:600; background:#f0fdf4; padding:4px 8px; border-radius:6px; border:1px solid #22c55e;">📞 WhatsApp</a>`
      : `<span class="muted" style="font-size:12px">No WA Tidak Ada</span>`;
    const deleteBtn = `<button onclick="deleteOrder('${o.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px; text-decoration:underline; margin-left:auto;">🗑️ Hapus Pesanan</button>`;
    return `<div class="order-item"><div class="ord-head"><div><b>${
      o.userName
    }</b> <span style="color:#94a3b8; font-size:12px;">• ${new Date(
      o.createdAt
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}</span><div style="margin-top:6px;">${waBtn}</div></div><span class="ord-status ${stCls}">${
      o.status
    }</span></div><div class="ord-body"><p style="margin:0 0 10px 0; font-size:14px; line-height:1.5;">${itemsUI}</p>${
      o.note
        ? `<div style="background:#fff1f2; color:#be123c; padding:8px; border-radius:8px; font-size:12px; margin-bottom:10px;">📝 ${o.note}</div>`
        : ""
    }<div class="rowBetween"><span class="muted">Total (${
      o.paymentMethod === "qris" ? "QRIS" : "Tunai"
    })</span><b style="font-size:16px;">${rupiah(
      o.total
    )}</b></div><div style="display:flex; margin-top:8px;">${deleteBtn}</div></div>${
      btn ? `<div class="ord-foot">${btn}</div>` : ""
    }</div>`;
  };
  $("#incomingOrdersList").innerHTML =
    activeOrders.map((o) => renderItem(o, true)).join("") ||
    `<div class="empty-state-box">Tidak ada pesanan aktif.</div>`;
  $("#historyOrdersList").innerHTML = historyOrders
    .map((o) => renderItem(o, false))
    .join("");
}
window.updStat = async (oid, st) => {
  if (confirm("Update status pesanan?"))
    await updateDoc(doc(db, "orders", oid), { status: st });
};
window.verifyPin = async (oid, correctPin) => {
  const inputPin = document.getElementById(`pin-${oid}`).value;
  if (inputPin === correctPin) {
    if (confirm("PIN Benar! Selesaikan pesanan?"))
      await updateDoc(doc(db, "orders", oid), { status: "Selesai" });
  } else {
    alert("PIN SALAH!");
  }
};
window.deleteOrder = async (oid) => {
  if (confirm("HAPUS PERMANEN?")) {
    await deleteDoc(doc(db, "orders", oid));
  }
};
$("#statusToggle").addEventListener("change", async (e) => {
  if (state.vendor.subscriptionExpiry < Date.now()) {
    e.target.checked = false;
    alert("Masa aktif habis.");
    return;
  }
  await updateDoc(doc(db, "vendors", state.vendor.id), {
    isLive: e.target.checked,
  });
});
function loadChatList() {
  const q = query(
    collection(db, "chats"),
    where("vendorId", "==", state.vendor.id)
  );
  onSnapshot(q, (snap) => {
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => b.lastUpdate - a.lastUpdate);
    $("#chatList").innerHTML =
      list
        .map(
          (c) =>
            `<div class="chat-entry" onclick="openChat('${c.id}', '${
              c.userName
            }')"><div style="width:40px; height:40px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px;">👤</div><div style="flex:1; min-width:0;"><div style="display:flex; justify-content:space-between; margin-bottom:2px;"><b style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${
              c.userName
            }</b><span style="font-size:11px; color:#94a3b8;">${new Date(
              c.lastUpdate || Date.now()
            ).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}</span></div><div style="font-size:13px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${
              c.lastMessage
            }</div></div></div>`
        )
        .join("") ||
      '<div style="text-align:center; padding:40px; color:#94a3b8;"><div style="font-size:40px; margin-bottom:10px;">💬</div>Belum ada chat.</div>';
  });
}
window.openChat = (chatId, userName) => {
  state.activeChatId = chatId;
  $("#chatRoom").classList.add("active");
  $("#chattingWith").textContent = userName;
  $$(".chat-entry").forEach((el) => el.classList.remove("active"));
  if (state.unsubMsg) state.unsubMsg();
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("ts", "asc")
  );
  state.unsubMsg = onSnapshot(q, (snap) => {
    $("#msgBox").innerHTML = snap.docs
      .map((d) => {
        const m = d.data();
        const isMe = m.from === state.vendor.id;
        let contentHtml = "";
        if (m.type === "image")
          contentHtml = `<div class="bubble image ${
            isMe ? "me" : "them"
          }"><img src="${m.text}" loading="lazy" /></div>`;
        else if (m.type === "location")
          contentHtml = `<a href="${
            m.text
          }" target="_blank" class="bubble location ${
            isMe ? "me" : "them"
          }"><span>📍</span> Lacak Lokasi</a>`;
        else if (m.type === "sticker")
          contentHtml = `<div class="bubble sticker ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        else
          contentHtml = `<div class="bubble ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        return `<div style="display:flex; justify-content:${
          isMe ? "flex-end" : "flex-start"
        }; margin-bottom: 6px;">${contentHtml}</div>`;
      })
      .join("");
    $("#msgBox").scrollTop = $("#msgBox").scrollHeight;
  });
};
window.closeChat = () => {
  state.activeChatId = null;
  $("#chatRoom").classList.remove("active");
  if (state.unsubMsg) state.unsubMsg();
};
window.toggleAttachMenu = () => {
  $("#attachMenu").classList.toggle("visible");
};
window.toggleSticker = () => {
  $("#attachMenu").classList.remove("visible");
  $("#stickerSheet").classList.toggle("visible");
  renderStickers("emoji");
};
window.triggerImage = () => {
  $("#attachMenu").classList.remove("visible");
  $("#imageInput").click();
};
window.handleImageUpload = async (input) => {
  if (input.files && input.files[0]) {
    try {
      const compressed = await compressImage(input.files[0], 500, 0.7);
      await sendMessage(compressed, "image");
      showToast("Foto terkirim!");
    } catch (e) {
      alert("Gagal kirim: " + e.message);
    }
    input.value = "";
  }
};
window.sendLocation = async () => {
  $("#attachMenu").classList.remove("visible");
  const lat = state.vendor.lat;
  const lon = state.vendor.lon;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  await sendMessage(mapsUrl, "location");
};
window.renderStickers = (type) => {
  const grid = $("#stickerGrid");
  if (type === "emoji") {
    const emojis = [
      "😀",
      "😂",
      "😍",
      "👍",
      "🙏",
      "🔥",
      "❤️",
      "🎉",
      "👋",
      "📦",
      "🥘",
      "🚲",
    ];
    grid.innerHTML = emojis
      .map(
        (e) =>
          `<div class="sticker-item" onclick="sendSticker('${e}', 'emoji')">${e}</div>`
      )
      .join("");
  } else {
    const stickers = [
      "🍔",
      "🍕",
      "🍜",
      "☕",
      "🛵",
      "✅",
      "❌",
      "⏳",
      "🏠",
      "💵",
      "😋",
      "🥡",
    ];
    grid.innerHTML = stickers
      .map(
        (s) =>
          `<div class="sticker-item" style="font-size:50px" onclick="sendSticker('${s}', 'sticker')">${s}</div>`
      )
      .join("");
  }
};
window.sendSticker = async (content, type) => {
  $("#stickerSheet").classList.remove("visible");
  await sendMessage(content, type === "emoji" ? "text" : "sticker");
};
async function sendMessage(content, type = "text") {
  if (!state.activeChatId || !content) return;
  await addDoc(collection(db, "chats", state.activeChatId, "messages"), {
    text: content,
    type: type,
    from: state.vendor.id,
    ts: Date.now(),
  });
  let preview =
    type === "text"
      ? content
      : type === "image"
      ? "📷 Foto"
      : type === "location"
      ? "📍 Lokasi"
      : "😊 Stiker";
  await updateDoc(doc(db, "chats", state.activeChatId), {
    lastMessage: "Anda: " + preview,
    lastUpdate: Date.now(),
  });
}
$("#sendReplyBtn").addEventListener("click", () => {
  const t = $("#replyInput").value.trim();
  if (t) {
    sendMessage(t, "text");
    $("#replyInput").value = "";
  }
});
window.goSeller = (screen) => {
  $$(".nav-item").forEach((n) => n.classList.remove("active"));
  $$(".sb-item").forEach((n) => n.classList.remove("active"));
  $("#sellerHome").classList.add("hidden");
  $("#sellerChat").classList.add("hidden");
  $("#sellerOrders").classList.add("hidden");
  if (screen === "Home") {
    $$(".nav-item")[0].classList.add("active");
    $$(".sb-item")[0].classList.add("active");
    $("#sellerHome").classList.remove("hidden");
  } else if (screen === "Orders") {
    $$(".nav-item")[1].classList.add("active");
    $$(".sb-item")[1].classList.add("active");
    $("#sellerOrders").classList.remove("hidden");
  } else {
    $$(".nav-item")[2].classList.add("active");
    $$(".sb-item")[2].classList.add("active");
    $("#sellerChat").classList.remove("hidden");
    loadChatList();
  }
};
function calculateStats() {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const w = new Date(now.setDate(now.getDate() - now.getDay())).setHours(
    0,
    0,
    0,
    0
  );
  const m = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).getTime();
  let today = 0,
    week = 0,
    month = 0,
    total = 0,
    itemCounts = {};
  state.orders.forEach((o) => {
    if (o.status === "Selesai") {
      const t = new Date(o.createdAt).getTime();
      const val = o.total || 0;
      if (t >= d) today += val;
      if (t >= w) week += val;
      if (t >= m) month += val;
      total += val;
      (o.items || []).forEach(
        (i) => (itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty)
      );
    }
  });
  $("#statToday").textContent = rupiah(today);
  $("#statWeek").textContent = rupiah(week);
  $("#statMonth").textContent = rupiah(month);
  $("#statTotal").textContent = rupiah(total);
  let bestName = "-",
    bestQty = 0;
  for (const [name, qty] of Object.entries(itemCounts)) {
    if (qty > bestQty) {
      bestName = name;
      bestQty = qty;
    }
  }
  $("#bestSellerName").textContent = bestName;
  $("#bestSellerCount").textContent = `${bestQty} Terjual`;
}
function initMap() {
  if (state.map) return;
  state.map = L.map("sellerMap").setView(
    [state.vendor.lat, state.vendor.lon],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OSM",
  }).addTo(state.map);
  const icon = L.divIcon({
    className: "vendor-pin",
    html: `<div style="background:white; padding:4px; border-radius:8px; border:2px solid #ff7a00; font-size:20px; text-align:center; width:40px;">${
      state.vendor.ico || "🏪"
    }</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
  state.marker = L.marker([state.vendor.lat, state.vendor.lon], {
    icon: icon,
    draggable: false,
  }).addTo(state.map);
  state.marker.on("dragend", async (e) => {
    const { lat, lng } = e.target.getLatLng();
    await updateDoc(doc(db, "vendors", state.vendor.id), {
      lat: lat,
      lon: lng,
    });
  });
}
window.setLocMode = async (mode) => {
  state.locMode = mode;
  updateModeButtons();
  await updateDoc(doc(db, "vendors", state.vendor.id), { locationMode: mode });
  handleLocationLogic();
};
function updateModeButtons() {
  $$(".mode-tab").forEach((b) => b.classList.remove("active"));
  state.locMode === "gps"
    ? $$(".mode-tab")[0].classList.add("active")
    : $$(".mode-tab")[1].classList.add("active");
  $("#manualHint").classList.toggle("hidden", state.locMode !== "manual");
}
function handleLocationLogic() {
  if (!state.map || !state.marker) return;
  if (state.locMode === "gps") {
    state.marker.dragging.disable();
    startGPS();
  } else {
    stopGPS();
    state.marker.dragging.enable();
  }
}
function startGPS() {
  if (!navigator.geolocation) return;
  if (state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      await updateDoc(doc(db, "vendors", state.vendor.id), { lat, lon });
      if (state.marker) state.marker.setLatLng([lat, lon]);
      if (state.map) state.map.setView([lat, lon], 16);
    },
    null,
    { enableHighAccuracy: true }
  );
}
function stopGPS() {
  if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", window.closeModal)
);

initApp();
