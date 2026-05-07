// ====================== CONFIGURATION ======================
const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const PROXY_URLS = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];

// ====================== GLOBALS ======================
let allChannels = [];
let filteredChannels = [];
let currentPage = 1;
const pageSize = 40;
let activeCategory = '';
let activeLanguage = '';
let pingStatusMap = new Map();
let availableChannelsSet = new Set();
let favorites = JSON.parse(localStorage.getItem('streamtv_favs') || '[]');
let scanningActive = false;

// DOM helpers
const $ = (id) => document.getElementById(id);
const homeView = $('homeView');
const availableView = $('availableView');
const searchView = $('searchView');
const profileView = $('profileView');

const featuredCategories = $('featuredCategories');
const availableCategories = $('availableCategories');
const scanBtn = $('scanBtn');
const stopScanBtn = $('stopScanBtn');
const scanProgress = $('scanProgress');

const searchBox = $('searchBox');
const categoryPills = $('categoryPills');
const languagePills = $('languagePills');
const channelGrid = $('channelGrid');
const paginationDiv = $('pagination');
const statusText = $('statusText');

const playerModal = $('playerModal');
const videoPlayer = $('videoPlayer');
const channelTitle = $('channelTitle');
const playPauseBtn = $('playPauseBtn');
const progressBar = $('progressBar');
const progressFill = $('progressFill');
const progressThumb = $('progressThumb');
const currentTimeSpan = $('currentTime');
const durationSpan = $('duration');
const volumeSlider = $('volumeSlider');
const fullscreenBtn = $('fullscreenBtn');
const qualityBtn = $('qualityBtn');
const closePlayerBtn = $('closePlayerBtn');
const themeToggle = $('themeToggle');

let hls = null;
let currentQualityIndex = -1;

// ====================== THEME ======================
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('streamtv_theme', t);
  themeToggle.innerHTML = t === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}
applyTheme(localStorage.getItem('streamtv_theme') || 'dark');
themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ====================== NAVIGATION ======================
function showView(viewId) {
  [homeView, availableView, searchView, profileView].forEach(v => v.classList.remove('active'));
  document.getElementById(viewId + 'View').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
  if (viewId === 'search') applyFilters();
  if (viewId === 'profile') renderFavorites();
  if (viewId === 'available') {
    if (availableChannelsSet.size === 0 && !scanningActive) {
      availableCategories.innerHTML = '<p style="text-align:center">Click "Scan" to find live channels.</p>';
    } else {
      buildAvailableRows();
    }
  }
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ====================== DATA ======================
async function fetchPlaylistText() {
  try { const r = await fetch(PLAYLIST_URL); if (r.ok) return await r.text(); } catch (e) {}
  for (const p of PROXY_URLS) {
    try { const r = await fetch(p + encodeURIComponent(PLAYLIST_URL)); if (r.ok) return await r.text(); } catch (e) {}
  }
  throw new Error('All fetch methods failed.');
}

function parseM3U(text) {
  const lines = text.split('\n');
  const channels = [];
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF')) {
      if (current) channels.push(current);
      const info = t.substring(8);
      const ci = info.indexOf(',');
      let meta = '', name = '';
      if (ci >= 0) { meta = info.substring(0, ci).trim(); name = info.substring(ci+1).trim(); }
      else name = info.trim();
      const ga = (attr) => { const m = meta.match(new RegExp(`${attr}="([^"]*)"`)); return m ? m[1] : ''; };
      current = {
        displayName: name,
        tvgId: ga('tvg-id'), tvgName: ga('tvg-name'), tvgLogo: ga('tvg-logo'),
        groupTitle: ga('group-title'),
        language: extractLanguage(ga('tvg-language') || ga('group-title') || ''),
      };
    } else if (t && !t.startsWith('#') && current) {
      current.url = t;
      channels.push(current);
      current = null;
    }
  }
  if (current) channels.push(current);
  return channels;
}

function extractLanguage(raw) {
  const map = {english:'English',french:'French',spanish:'Spanish',german:'German',italian:'Italian',portuguese:'Portuguese',russian:'Russian',arabic:'Arabic',hindi:'Hindi',turkish:'Turkish'};
  const rawLower = raw.toLowerCase();
  for (const [k,v] of Object.entries(map)) if (rawLower.includes(k)) return v;
  return '';
}

async function loadChannels() {
  try {
    statusText.textContent = 'Loading channels…';
    const text = await fetchPlaylistText();
    allChannels = parseM3U(text);
    statusText.textContent = `${allChannels.length} channels ready`;
    buildHomeRows();
    setupSearchFilters();
  } catch (e) {
    statusText.textContent = 'Error: ' + e.message;
  }
}

// ====================== CATEGORIES ======================
const CATEGORY_MAP = {
  'Sports': ['sports','sport'],
  'Movies': ['movies','movie','film'],
  'Kids': ['kids','child','cartoon'],
  'Music': ['music','musical'],
  'News': ['news','information'],
  'Documentary': ['documentary','docu'],
  'Religion': ['religion','religious','faith'],
};
function getChannelsByCategory(cat, src = allChannels) {
  const keys = CATEGORY_MAP[cat] || [cat.toLowerCase()];
  return src.filter(ch => keys.some(k => (ch.groupTitle||'').toLowerCase().includes(k)));
}

// ====================== CARD BUILDER ======================
function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card glass';
  const isFav = favorites.includes(channel.url);
  card.innerHTML = `
    <div class="live-badge">LIVE</div>
    <div class="viewer-count">${Math.floor(Math.random()*800)+10}K</div>
    <img class="card-img" src="${channel.tvgLogo || 'load.png'}" onerror="this.onerror=null;this.src='load.png';">
    <div class="card-body">
      <div class="card-name">${channel.displayName || 'Unknown'}</div>
      <div class="card-meta">
        <span class="ping-status"></span>
        <button class="fav-btn ${isFav?'liked':''}"><i class="fas fa-heart"></i></button>
        <button class="ping-btn"><i class="fas fa-sync-alt"></i></button>
      </div>
    </div>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    playChannel(channel);
  });
  card.querySelector('.fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('button');
    toggleFavorite(channel.url, btn);
  });
  card.querySelector('.ping-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    pingChannel(channel.url, card.querySelector('.ping-status'));
  });
  return card;
}

function toggleFavorite(url, btn) {
  if (favorites.includes(url)) {
    favorites = favorites.filter(u => u !== url);
    btn.classList.remove('liked');
  } else {
    favorites.push(url);
    btn.classList.add('liked');
  }
  localStorage.setItem('streamtv_favs', JSON.stringify(favorites));
}
function renderFavorites() {
  const list = $('favList');
  if (!favorites.length) { list.innerHTML = '<p>No favorites yet.</p>'; return; }
  list.innerHTML = '';
  favorites.forEach(url => {
    const ch = allChannels.find(c => c.url === url);
    if (ch) {
      const chip = document.createElement('span');
      chip.className = 'fav-chip';
      chip.textContent = ch.displayName;
      chip.addEventListener('click', () => playChannel(ch));
      list.appendChild(chip);
    }
  });
}

// ====================== PING ======================
async function pingChannel(url, el) {
  if (!el) return;
  if (pingStatusMap.has(url) && !pingStatusMap.get(url).checking) {
    el.innerHTML = pingStatusMap.get(url).status === 'available' ? '<span class="status-available">✔</span>' : '<span class="status-unavailable">✘</span>';
    return;
  }
  el.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch('https://corsproxy.io/?' + encodeURIComponent(url), { method: 'HEAD', signal: ctrl.signal });
    const ok = resp.ok;
    pingStatusMap.set(url, { checking: false, status: ok ? 'available' : 'unavailable' });
    el.innerHTML = ok ? '<span class="status-available">✔</span>' : '<span class="status-unavailable">✘</span>';
    return ok ? 'available' : 'unavailable';
  } catch (e) {
    pingStatusMap.set(url, { checking: false, status: 'unavailable' });
    el.innerHTML = '<span class="status-unavailable">✘</span>';
    return 'unavailable';
  }
}

// ====================== HOME ROWS ======================
function buildHomeRows() {
  featuredCategories.innerHTML = '';
  ['News','Sports','Movies','Music','Kids','Documentary','Religion'].forEach(cat => {
    const chs = getChannelsByCategory(cat);
    if (!chs.length) return;
    const sec = document.createElement('div');
    sec.className = 'category-section';
    sec.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div>`;
    const row = document.createElement('div');
    row.className = 'scroll-row';
    chs.slice(0, 35).forEach(ch => row.appendChild(createChannelCard(ch)));
    sec.appendChild(row);
    featuredCategories.appendChild(sec);
  });
}

// ====================== AVAILABLE SCAN ======================
async function startScan() {
  if (scanningActive) return;
  scanningActive = true;
  scanBtn.style.display = 'none';
  stopScanBtn.style.display = 'inline-flex';
  availableChannelsSet.clear();
  availableCategories.innerHTML = '';
  const toScan = allChannels.slice(0, 1000);
  let scanned = 0, found = 0;
  const update = () => { scanProgress.textContent = `Scanned ${scanned}/${toScan.length} – ${found} live`; };
  update();
  for (let i = 0; i < toScan.length; i += 5) {
    if (!scanningActive) break;
    const batch = toScan.slice(i, i+5);
    await Promise.all(batch.map(async ch => {
      if (!scanningActive) return;
      const status = await pingChannel(ch.url, null);
      scanned++;
      if (status === 'available') {
        found++;
        availableChannelsSet.add(ch.url);
        addToAvailableRow(ch);
      }
      update();
    }));
  }
  scanningActive = false;
  scanBtn.style.display = 'inline-flex';
  stopScanBtn.style.display = 'none';
  if (availableChannelsSet.size === 0) availableCategories.innerHTML = '<p>No live channels found.</p>';
}
function stopScan() { scanningActive = false; }
scanBtn.addEventListener('click', startScan);
stopScanBtn.addEventListener('click', stopScan);

function addToAvailableRow(channel) {
  let cat = 'Other';
  for (const [cName, keys] of Object.entries(CATEGORY_MAP)) {
    if (keys.some(k => (channel.groupTitle||'').toLowerCase().includes(k))) { cat = cName; break; }
  }
  let sec = availableCategories.querySelector(`[data-cat="${cat}"]`);
  if (!sec) {
    sec = document.createElement('div');
    sec.className = 'category-section';
    sec.dataset.cat = cat;
    sec.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div><div class="scroll-row"></div>`;
    availableCategories.appendChild(sec);
  }
  const row = sec.querySelector('.scroll-row');
  if (!row.querySelector(`[data-url="${channel.url}"]`)) {
    const card = createChannelCard(channel);
    card.dataset.url = channel.url;
    row.appendChild(card);
  }
}
function buildAvailableRows() {
  availableCategories.innerHTML = '';
  const availChs = allChannels.filter(ch => availableChannelsSet.has(ch.url));
  if (!availChs.length) { availableCategories.innerHTML = '<p>No available channels yet.</p>'; return; }
  ['News','Sports','Movies','Music','Kids','Documentary','Religion'].forEach(cat => {
    const chs = getChannelsByCategory(cat, availChs);
    if (!chs.length) return;
    const sec = document.createElement('div');
    sec.className = 'category-section';
    sec.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div><div class="scroll-row"></div>`;
    const row = sec.querySelector('.scroll-row');
    chs.forEach(ch => row.appendChild(createChannelCard(ch)));
    availableCategories.appendChild(sec);
  });
}

// ====================== SEARCH FILTERS ======================
function setupSearchFilters() {
  categoryPills.innerHTML = '';
  const allCat = document.createElement('button'); allCat.className='pill active'; allCat.textContent='All';
  allCat.addEventListener('click', ()=>{ activeCategory=''; currentPage=1; applyFilters(); setActivePill(allCat); });
  categoryPills.appendChild(allCat);
  ['Sports','Movies','Kids','Music','News','Documentary','Religion'].forEach(cat => {
    const btn = document.createElement('button'); btn.className='pill'; btn.textContent=cat;
    btn.addEventListener('click', ()=>{ activeCategory=cat; currentPage=1; applyFilters(); setActivePill(btn); });
    categoryPills.appendChild(btn);
  });
  languagePills.innerHTML = '';
  const allLang = document.createElement('button'); allLang.className='pill active'; allLang.textContent='All';
  allLang.addEventListener('click', ()=>{ activeLanguage=''; currentPage=1; applyFilters(); setActivePill(allLang); });
  languagePills.appendChild(allLang);
  const langs = [...new Set(allChannels.map(ch=>ch.language).filter(Boolean))].sort();
  langs.forEach(lang => {
    const btn = document.createElement('button'); btn.className='pill'; btn.textContent=lang;
    btn.addEventListener('click', ()=>{ activeLanguage=lang; currentPage=1; applyFilters(); setActivePill(btn); });
    languagePills.appendChild(btn);
  });
  searchBox.addEventListener('input', ()=>{ currentPage=1; applyFilters(); });
}
function setActivePill(active) {
  active.parentElement.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  active.classList.add('active');
}
function applyFilters() {
  const q = searchBox.value.toLowerCase();
  filteredChannels = allChannels.filter(ch => {
    if (q && !ch.displayName.toLowerCase().includes(q)) return false;
    if (activeCategory) {
      const keys = CATEGORY_MAP[activeCategory] || [];
      if (!keys.some(k => (ch.groupTitle||'').toLowerCase().includes(k))) return false;
    }
    if (activeLanguage && ch.language !== activeLanguage) return false;
    return true;
  });
  renderSearchGrid();
}
function renderSearchGrid() {
  if (!searchView.classList.contains('active')) return;
  const total = Math.ceil(filteredChannels.length / pageSize);
  if (currentPage > total) currentPage = total || 1;
  const start = (currentPage-1)*pageSize;
  const pageChs = filteredChannels.slice(start, start+pageSize);
  channelGrid.innerHTML = '';
  pageChs.forEach(ch => channelGrid.appendChild(createChannelCard(ch)));
  paginationDiv.innerHTML = '';
  if (total > 1) {
    const prev = document.createElement('button'); prev.textContent='Previous'; prev.disabled=currentPage===1;
    prev.addEventListener('click', ()=>{ if(currentPage>1){ currentPage--; renderSearchGrid(); } });
    const next = document.createElement('button'); next.textContent='Next'; next.disabled=currentPage===total;
    next.addEventListener('click', ()=>{ if(currentPage<total){ currentPage++; renderSearchGrid(); } });
    paginationDiv.append(prev, ` ${currentPage}/${total} `, next);
  }
}

// ====================== PLAYER ======================
function playChannel(channel) {
  channelTitle.textContent = channel.displayName;
  playerModal.classList.add('active');
  if (Hls.isSupported()) {
    if (hls) hls.destroy();
    hls = new Hls();
    hls.loadSource(channel.url);
    hls.attachMedia(videoPlayer);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoPlayer.play();
      qualitySetup();
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      }
    });
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    videoPlayer.src = channel.url;
    videoPlayer.play();
  } else {
    alert('HLS not supported.');
  }
  bindPlayerControls();
}
function qualitySetup() {
  if (!hls || !hls.levels.length) { qualityBtn.style.display='none'; return; }
  qualityBtn.style.display = 'inline-block';
  qualityBtn.textContent = 'Auto';
  currentQualityIndex = -1;
  qualityBtn.onclick = () => {
    if (currentQualityIndex === -1) {
      const hd = hls.levels.length-1;
      hls.currentLevel = hd; currentQualityIndex = hd; qualityBtn.textContent = 'HD';
    } else if (currentQualityIndex === hls.levels.length-1) {
      hls.currentLevel = 0; currentQualityIndex = 0; qualityBtn.textContent = 'SD';
    } else {
      hls.currentLevel = -1; currentQualityIndex = -1; qualityBtn.textContent = 'Auto';
    }
  };
}
function closePlayer() {
  playerModal.classList.remove('active');
  if (hls) { hls.destroy(); hls = null; }
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
}
closePlayerBtn.addEventListener('click', closePlayer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlayer(); });

function bindPlayerControls() {
  playPauseBtn.onclick = () => videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
  videoPlayer.onplay = () => playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
  videoPlayer.onpause = () => playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  videoPlayer.ontimeupdate = () => {
    const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100 || 0;
    progressFill.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    currentTimeSpan.textContent = fmt(videoPlayer.currentTime);
  };
  videoPlayer.ondurationchange = () => { durationSpan.textContent = fmt(videoPlayer.duration); };
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  });
  volumeSlider.oninput = () => videoPlayer.volume = volumeSlider.value;
  fullscreenBtn.onclick = () => {
    if (!document.fullscreenElement) {
      if (videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
      else if (videoPlayer.webkitRequestFullscreen) videoPlayer.webkitRequestFullscreen();
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{});
    } else {
      document.exitFullscreen();
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    }
  };
}
function fmt(s) {
  if (isNaN(s)) return '0:00';
  const m = Math.floor(s/60), sec = Math.floor(s%60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}

// ====================== INIT ======================
loadChannels();
