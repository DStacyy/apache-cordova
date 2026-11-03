// =======================
// KONFIGURASI SUPABASE
// =======================
const SUPABASE_URL = "https://catpincjeferfdrwclyp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdHBpbmNqZWZlcmZkcndjbHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTA0ODYsImV4cCI6MjEwNTYyNjQ4Nn0.sOQ8LZ3--z4CBMpAAEMQn7shDZokq2m7zqwunCpzSQk";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PLACEHOLDER_IMG = "img/logo.png";
const GRADIENTS = [
    "linear-gradient(135deg,#1db954,#0b6b33)",
    "linear-gradient(135deg,#ff9f43,#b5472b)",
    "linear-gradient(135deg,#6c5ce7,#2d1b69)",
    "linear-gradient(135deg,#00b4d8,#023e8a)",
    "linear-gradient(135deg,#f72585,#7209b7)"
];

let currentUserProfile = null;
let currentBase64Photo = null;
let allBooks = [];
let activeCategory = 'Semua';

// =======================
// CORDOVA & INISIALISASI
// =======================
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    setTimeout(checkSession, 2000); // splash 2 detik

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('guest-form').addEventListener('submit', handleCheckIn);
}

// =======================
// NAVIGASI
// =======================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function backToMain() {
    showScreen('main-screen');
}

function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo(0, 0);

    if (name === 'catalog' && allBooks.length === 0) loadCatalog();
    if (name === 'loans') loadLoans();
}

// =======================
// AUTH & PROFIL
// =======================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await loadUserData(session.user.id);
        showScreen('main-screen');
    } else {
        showScreen('login-screen');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert('Login gagal: ' + error.message);
    } else {
        await loadUserData(data.user.id);
        showScreen('main-screen');
    }
}

async function loadUserData(userId) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('profiles:', error.message);
        return;
    }

    currentUserProfile = data;
    document.body.classList.toggle('is-anggota', data.role === 'anggota');

    setText('user-name', data.full_name);
    setText('user-role', data.role);
    setText('card-user-name', data.full_name);
    setText('card-user-id', 'ID: ' + data.id.substring(0, 8));
    setText('profile-name', data.full_name);
    setText('profile-role', data.role);
    setText('profile-phone', data.phone_number || 'Belum diisi');
    setText('profile-address', data.address || 'Belum diisi');
    setAvatar(data.photo_url || PLACEHOLDER_IMG);

    loadLoans();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUserProfile = null;
    document.body.classList.remove('is-anggota');
    switchTab('home');
    showScreen('login-screen');
}

function setAvatar(url) {
    document.getElementById('user-avatar').src = url;
    document.getElementById('profile-avatar').src = url;
}

// =======================
// FOTO PROFIL
// =======================
function takePhotoAndUpload() {
    if (!navigator.camera || typeof Camera === 'undefined') {
        alert("Fitur kamera hanya tersedia di perangkat/emulator!");
        return;
    }
    if (!currentUserProfile) {
        alert('Silakan login terlebih dahulu.');
        return;
    }

    const options = {
        quality: 50,
        destinationType: Camera.DestinationType.DATA_URL,
        sourceType: Camera.PictureSourceType.CAMERA,
        encodingType: Camera.EncodingType.JPEG,
        mediaType: Camera.MediaType.PICTURE,
        correctOrientation: true
    };

    navigator.camera.getPicture(async (base64Image) => {
        try {
            const blob = base64ToBlob(base64Image, 'image/jpeg');
            const fileName = `${currentUserProfile.role}/${currentUserProfile.id}_${Date.now()}.jpg`;

            const { error } = await supabaseClient.storage
                .from('avatars')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) throw error;

            const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;

            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({ photo_url: publicUrl })
                .eq('id', currentUserProfile.id);
            if (updateError) throw updateError;

            setAvatar(publicUrl);
            alert("Foto profil berhasil diperbarui!");
        } catch (err) {
            alert("Gagal mengunggah foto: " + err.message);
        }
    }, (error) => {
        console.log("Kamera dibatalkan: " + error);
    }, options);
}

// =======================
// BERANDA & PINJAMAN
// =======================
async function loadLoans() {
    if (!currentUserProfile) return;

    const { data, error } = await supabaseClient
        .from('loans')
        .select('id, due_date, books(title, author, cover_photo_url)')
        .eq('member_id', currentUserProfile.id)
        .is('return_date', null)
        .order('due_date', { ascending: true });

    if (error) {
        console.error('loans:', error.message);
        return;
    }

    const loans = data || [];
    renderLoanList('home-loans', loans.slice(0, 2));
    renderLoanList('loan-list', loans);

    setText('stat-active', loans.length);
    if (loans.length) {
        const info = dueInfo(loans[0].due_date);
        setText('stat-due', info.days < 0 ? 'Lewat' : info.days + ' hari');
        setText('stat-due-sub', info.days < 0 ? `${-info.days} hari terlambat` : 'buku terdekat');
    } else {
        setText('stat-due', '-');
        setText('stat-due-sub', 'tidak ada');
    }
}

function renderLoanList(containerId, loans) {
    const el = document.getElementById(containerId);
    if (!loans.length) {
        el.innerHTML = `<div class="empty">Tidak ada buku yang sedang dipinjam 🎉</div>`;
        return;
    }

    el.innerHTML = loans.map((l, i) => {
        const b = l.books || {};
        const info = dueInfo(l.due_date);
        return `
            <div class="loan-item">
                <div class="mini-cover">${coverHtml(b, i)}</div>
                <div class="loan-info">
                    <h4>${escapeHtml(b.title || 'Buku')}</h4>
                    <p class="muted">${escapeHtml(b.author || '')}</p>
                    <span class="due ${info.cls}">${info.text}</span>
                </div>
            </div>`;
    }).join('');
}

function dueInfo(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const days = Math.round((due - today) / 86400000);

    if (days < 0)   return { days, cls: 'late', text: `Terlambat ${-days} hari` };
    if (days === 0) return { days, cls: 'soon', text: 'Jatuh tempo hari ini' };
    if (days <= 2)  return { days, cls: 'soon', text: `Jatuh tempo ${days} hari lagi` };
    return { days, cls: 'ok', text: `Jatuh tempo ${days} hari lagi` };
}

// =======================
// KATALOG BUKU
// =======================
async function loadCatalog() {
    const { data, error } = await supabaseClient
        .from('books')
        .select('*')
        .order('title', { ascending: true });

    if (error) {
        console.error('books:', error.message);
        return;
    }

    allBooks = data || [];
    renderChips();
    renderCatalog();
}

function renderChips() {
    const wrap = document.getElementById('category-chips');
    const cats = ['Semua', ...new Set(allBooks.map(b => b.category).filter(Boolean))];

    wrap.innerHTML = '';
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'chip-btn' + (cat === activeCategory ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => {
            activeCategory = cat;
            renderChips();
            renderCatalog();
        };
        wrap.appendChild(btn);
    });
}

function renderCatalog() {
    const keyword = document.getElementById('search-book').value.trim().toLowerCase();
    const list = allBooks.filter(b =>
        (activeCategory === 'Semua' || b.category === activeCategory) &&
        (!keyword ||
            (b.title || '').toLowerCase().includes(keyword) ||
            (b.author || '').toLowerCase().includes(keyword))
    );

    const grid = document.getElementById('catalog-grid');
    if (!list.length) {
        grid.innerHTML = `<div class="empty" style="grid-column: 1 / -1">Buku tidak ditemukan</div>`;
        return;
    }

    grid.innerHTML = list.map((b, i) => {
        const stockClass = b.stock > 0 ? 'stock-ok' : 'stock-empty';
        const stockText = b.stock > 0 ? `Tersedia ${b.stock}` : 'Habis';
        return `
            <div class="book-card">
                <div class="cover">${coverHtml(b, i)}</div>
                <h4>${escapeHtml(b.title)}</h4>
                <p class="muted">${escapeHtml(b.author)}</p>
                <span class="stock ${stockClass}">${stockText}</span>
            </div>`;
    }).join('');
}

function coverHtml(book, index) {
    if (book.cover_photo_url) {
        return `<img src="${escapeHtml(book.cover_photo_url)}" alt="">`;
    }
    const letter = escapeHtml((book.title || '?').charAt(0).toUpperCase());
    return `<div class="cover-fallback" style="background:${GRADIENTS[index % GRADIENTS.length]}">${letter}</div>`;
}

// =======================
// BUKU TAMU (PETUGAS)
// =======================
async function openGuestForm() {
    if (!currentUserProfile) {
        alert('Silakan login terlebih dahulu.');
        return;
    }
    if (currentUserProfile.role === 'anggota') {
        alert('Buku Tamu hanya untuk petugas.');
        return;
    }

    setText('staff-name', currentUserProfile.full_name);
    showScreen('guest-screen');
    await loadGuestDropdowns();
}

async function loadGuestDropdowns() {
    const { data: categories, error: e1 } = await supabaseClient.from('guest_categories').select('*');
    if (e1) console.error('guest_categories:', e1.message);
    populateSelect('select-category', categories, 'id', 'name', '-- Pilih Kategori --');

    const { data: purposes, error: e2 } = await supabaseClient.from('visit_purposes').select('*');
    if (e2) console.error('visit_purposes:', e2.message);
    populateSelect('select-purpose', purposes, 'id', 'name', '-- Pilih Tujuan --');

    const { data: locations, error: e3 } = await supabaseClient.from('locations').select('*');
    if (e3) console.error('locations:', e3.message);
    const locationOptions = locations?.map(l => ({ id: l.id, text: `${l.building_name} - ${l.room_name}` }));
    populateSelect('select-location', locationOptions, 'id', 'text', '-- Pilih Lokasi --');

    const { data: hosts, error: e4 } = await supabaseClient.from('profiles').select('id, full_name');
    if (e4) console.error('profiles:', e4.message);
    populateSelect('select-host', hosts, 'id', 'full_name', '-- Pilih Staf --');

    const { data: badges, error: e5 } = await supabaseClient.from('guest_badges').select('*').eq('status', 'tersedia');
    if (e5) console.error('guest_badges:', e5.message);
    populateSelect('select-badge', badges, 'id', 'badge_code', '-- Tanpa Badge / Pilih Badge --');
}

function populateSelect(elementId, items, valueKey, textKey, defaultText) {
    const select = document.getElementById(elementId);
    select.innerHTML = `<option value="">${defaultText}</option>`;
    if (items) {
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            select.appendChild(option);
        });
    }
}

function takeGuestPhoto() {
    if (!navigator.camera || typeof Camera === 'undefined') {
        alert("Fitur kamera hanya berjalan pada perangkat mobile/emulator.");
        return;
    }

    const options = {
        quality: 60,
        destinationType: Camera.DestinationType.DATA_URL,
        sourceType: Camera.PictureSourceType.CAMERA,
        encodingType: Camera.EncodingType.JPEG,
        targetWidth: 600,
        targetHeight: 600,
        correctOrientation: true
    };

    navigator.camera.getPicture((base64Image) => {
        currentBase64Photo = base64Image;
        document.getElementById('photo-preview').src = "data:image/jpeg;base64," + base64Image;
    }, (error) => {
        console.log("Pengambilan foto dibatalkan: " + error);
    }, options);
}

async function handleCheckIn(e) {
    e.preventDefault();

    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Menyimpan...";

    try {
        // 1. Upload foto tamu jika ada
        let photoPublicUrl = null;
        if (currentBase64Photo) {
            const blob = base64ToBlob(currentBase64Photo, 'image/jpeg');
            const fileName = `guests/guest_${Date.now()}.jpg`;

            const { error: uploadErr } = await supabaseClient.storage
                .from('avatars')
                .upload(fileName, blob, { contentType: 'image/jpeg' });
            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
            photoPublicUrl = urlData.publicUrl;
        }

        // 2. Simpan kunjungan ke tabel visits
        const badgeId = valOrNull('select-badge');
        const visitPayload = {
            category_id: valOrNull('select-category'),
            purpose_id: valOrNull('select-purpose'),
            location_id: valOrNull('select-location'),
            host_id: valOrNull('select-host'),
            security_id: currentUserProfile ? currentUserProfile.id : null,
            badge_id: badgeId,
            guest_name: valOrNull('guest-name'),
            guest_phone: valOrNull('guest-phone'),
            guest_company: valOrNull('guest-company'),
            photo_url: photoPublicUrl,
            notes: valOrNull('guest-notes'),
            status: 'aktif'
        };

        const { data: visitData, error: visitErr } = await supabaseClient
            .from('visits')
            .insert([visitPayload])
            .select()
            .single();
        if (visitErr) throw visitErr;

        // 3. Tandai badge sebagai dipakai
        if (badgeId) {
            const { error: badgeErr } = await supabaseClient
                .from('guest_badges')
                .update({ status: 'dipakai' })
                .eq('id', badgeId);
            if (badgeErr) throw badgeErr;
        }

        // 4. Catat barang bawaan jika diisi
        const itemName = valOrNull('item-name');
        if (itemName) {
            const { error: itemErr } = await supabaseClient
                .from('guest_belongings')
                .insert([{
                    visit_id: visitData.id,
                    item_name: itemName,
                    locker_number: valOrNull('locker-number')
                }]);
            if (itemErr) throw itemErr;
        }

        // 5. Notifikasi untuk staf yang dituju
        const { error: notifErr } = await supabaseClient
            .from('notifications')
            .insert([{
                recipient_id: visitPayload.host_id,
                visit_id: visitData.id,
                message: `Tamu baru (${visitPayload.guest_name}) telah check-in untuk menemui Anda.`
            }]);
        if (notifErr) throw notifErr;

        alert("Check-in tamu berhasil!");
        resetGuestForm();
    } catch (err) {
        alert("Gagal memproses check-in: " + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "PROSES CHECK-IN TAMU";
    }
}

function resetGuestForm() {
    document.getElementById('guest-form').reset();
    document.getElementById('photo-preview').src = PLACEHOLDER_IMG;
    currentBase64Photo = null;
    loadGuestDropdowns();
}

// =======================
// HELPER
// =======================
// Ambil nilai input; kosong dikirim sebagai null (kolom UUID menolak string kosong)
function valOrNull(id) {
    const v = document.getElementById(id).value.trim();
    return v === '' ? null : v;
}

function setText(id, text) {
    document.getElementById(id).innerText = text;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}