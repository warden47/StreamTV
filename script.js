// ====================== CONFIGURATION ======================
const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

// ====================== GLOBALS ======================
let allChannels = [];          // raw parsed
let filteredChannels = [];     // after search/category/language
let currentPage = 1;
const pageSize = 40;
let activeCategory = '';      // 'Sports', etc.
let activeLanguage = '';      // 'English', etc.
let pingStatusMap = new Map();
let favorites = JSON.parse(localStorage.getItem('streamtv_favs') || '[]');

// DOM elements
const $ = (id) => document.getElementById(id);
const homeView = $('homeView');
const searchView = $('searchView');
const profileView = $('profileView');
const featuredCategories = $('featuredCategories');
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
const closePlayerBtn = $('closePlayer');
const themeToggle = $('themeToggle');

let hls = null;
let currentQualityIndex = -1;

// ====================== THEME ======================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('streamtv_theme', theme);
  themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}
applyTheme(localStorage.getItem('streamtv_theme') || 'dark');
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ====================== NAVIGATION ======================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    homeView.classList.toggle('active', view === 'home');
    searchView.classList.toggle('active', view === 'search');
    profileView.classList.toggle('active', view === 'profile');
    if (view === 'search') applyFilters();
    if (view === 'profile') renderFavorites();
  });
});

// ====================== DATA FETCHING ======================
async function fetchPlaylistText() {
  // Direct
  try {
    const resp = await fetch(PLAYLIST_URL);
    if (resp.ok) return await resp.text();
  } catch (e) {}
  // Proxies
  for (const proxy of PROXY_URLS) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(PLAYLIST_URL));
      if (resp.ok) return await resp.text();
    } catch (e) {}
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
        tvgId: ga('tvg-id'),
        tvgName: ga('tvg-name'),
        tvgLogo: ga('tvg-logo'),
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

// Simple language extraction based on group-title or explicit tag
function extractLanguage(raw) {
  raw = raw.toLowerCase();
  const langMap = {
    'english': 'English', 'french': 'French', 'spanish': 'Spanish',
    'german': 'German', 'italian': 'Italian', 'portuguese': 'Portuguese',
    'russian': 'Russian', 'arabic': 'Arabic', 'hindi': 'Hindi',
    'turkish': 'Turkish', 'dutch': 'Dutch', 'polish': 'Polish',
    'indonesian': 'Indonesian', 'thai': 'Thai', 'vietnamese': 'Vietnamese',
  };
  for (const [key, val] of Object.entries(langMap)) {
    if (raw.includes(key)) return val;
  }
  return ''; // unknown
}

async function loadChannels() {
  try {
    statusText.textContent = 'Loading channels…';
    const text = await fetchPlaylistText();
    allChannels = parseM3U(text);
    statusText.textContent = `${allChannels.length} channels ready`;
    buildHomeRows();
    setupFilters();
  } catch (e) {
    statusText.textContent = 'Error: ' + e.message;
  }
}

// ====================== CATEGORIES & LANGUAGES ======================
const CATEGORY_MAP = {
  'Sports': ['sports', 'sport'],
  'Movies': ['movies', 'movie', 'film'],
  'Kids': ['kids', 'child', 'cartoon'],
  'Music': ['music', 'musical'],
  'News': ['news', 'information'],
  'Documentary': ['documentary', 'docu'],
  'Religion': ['religion', 'religious', 'faith'],
};

function getChannelsByCategory(cat) {
  const keys = CATEGORY_MAP[cat] || [cat.toLowerCase()];
  return allChannels.filter(ch => {
    const g = (ch.groupTitle || '').toLowerCase();
    return keys.some(k => g.includes(k));
  });
}

function getUniqueLanguages() {
  const set = new Set();
  allChannels.forEach(ch => { if (ch.language) set.add(ch.language); });
  return [...set].sort();
}

// ====================== CARD BUILDER ======================
function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card glass';
  const isFav = favorites.includes(channel.url);
  card.innerHTML = `
    <div class="live-badge">LIVE</div>
    <div class="viewer-count">${Math.floor(Math.random()*800)+10}K</div>
    <img class="card-img" src="${channel.tvgLogo || 'load.png'}" 
         onerror="this.onerror=null;this.src='load.png';">
    <div class="card-body">
      <div class="card-name">${channel.displayName || 'Unknown'}</div>
      <div class="card-meta">
        <span class="ping-status"></span>
        <button class="fav-btn ${isFav?'liked':''}" data-url="${channel.url}"><i class="fas fa-heart"></i></button>
        <button class="ping-btn" data-url="${channel.url}"><i class="fas fa-sync-alt"></i></button>
      </div>
    </div>
  `;
  // Click to play
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openPlayer(channel);
  });
  // Heart
  card.querySelector('.fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(channel.url, card.querySelector('.fav-btn'));
  });
  // Ping
  card.querySelector('.ping-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    pingChannel(channel.url, card.querySelector('.ping-status'));
  });
  return card;
}

// ====================== FAVORITES ======================
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
  if (favorites.length === 0) {
    list.innerHTML = '<p>No favorites yet.</p>';
    return;
  }
  list.innerHTML = '';
  favorites.forEach(url => {
    const ch = allChannels.find(c => c.url === url);
    if (ch) {
      const chip = document.createElement('span');
      chip.className = 'fav-chip';
      chip.textContent = ch.displayName;
      chip.addEventListener('click', () => openPlayer(ch));
      list.appendChild(chip);
    }
  });
}

// ====================== PING ======================
async function pingChannel(url, el) {
  if (!el) return;
  if (pingStatusMap.has(url) && !pingStatusMap.get(url).checking) {
    updatePing(el, pingStatusMap.get(url).status);
    return;
  }
  pingStatusMap.set(url, { checking: true, status: null });
  el.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://corsproxy.io/?' + encodeURIComponent(url), { method:'HEAD', signal:controller.signal });
    const ok = resp.ok;
    pingStatusMap.set(url, { checking: false, status: ok ? 'available' : 'unavailable' });
    updatePing(el, ok ? 'available' : 'unavailable');
  } catch (e) {
    pingStatusMap.set(url, { checking: false, status: 'unavailable' });
    updatePing(el, 'unavailable');
  }
}
function updatePing(el, status) {
  if (status === 'available') el.innerHTML = '<span class="status-available">✔</span>';
  else el.innerHTML = '<span class="status-unavailable">✘</span>';
}

// ====================== HOME ROWS ======================
function buildHomeRows() {
  featuredCategories.innerHTML = '';
  const cats = ['News','Sports','Movies','Music','Kids','Documentary','Religion'];
  cats.forEach(cat => {
    const chs = getChannelsByCategory(cat);
    if (!chs.length) return;
    const section = document.createElement('div');
    section.className = 'category-section';
    section.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div>`;
    const row = document.createElement('div');
    row.className = 'scroll-row';
    chs.slice(0, 35).forEach(ch => row.appendChild(createChannelCard(ch)));
    section.appendChild(row);
    featuredCategories.appendChild(section);
  });
}

// ====================== FILTERS ======================
function setupFilters() {
  // Category pills
  categoryPills.innerHTML = '';
  const allCatBtn = document.createElement('button');
  allCatBtn.className = 'pill active'; allCatBtn.textContent = 'All';
  allCatBtn.addEventListener('click', () => { activeCategory=''; currentPage=1; applyFilters(); });
  categoryPills.appendChild(allCatBtn);
  ['Sports','Movies','Kids','Music','News','Documentary','Religion'].forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'pill'; btn.textContent = cat;
    btn.addEventListener('click', () => { activeCategory=cat; currentPage=1; applyFilters(); });
    categoryPills.appendChild(btn);
  });

  // Language pills
  languagePills.innerHTML = '';
  const allLangBtn = document.createElement('button');
  allLangBtn.className = 'pill active'; allLangBtn.textContent = 'All';
  allLangBtn.addEventListener('click', () => { activeLanguage=''; currentPage=1; applyFilters(); });
  languagePills.appendChild(allLangBtn);
  getUniqueLanguages().forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'pill'; btn.textContent = lang;
    btn.addEventListener('click', () => { activeLanguage=lang; currentPage=1; applyFilters(); });
    languagePills.appendChild(btn);
  });

  searchBox.addEventListener('input', () => { currentPage=1; applyFilters(); });
}

function applyFilters() {
  const q = searchBox.value.toLowerCase();
  filteredChannels = allChannels.filter(ch => {
    if (q && !ch.displayName.toLowerCase().includes(q)) return false;
    if (activeCategory) {
      const keys = CATEGORY_MAP[activeCategory] || [activeCategory.toLowerCase()];
      const g = (ch.groupTitle || '').toLowerCase();
      if (!keys.some(k => g.includes(k))) return false;
    }
    if (activeLanguage && ch.language !== activeLanguage) return false;
    return true;
  });
  renderSearchGrid();
}

function renderSearchGrid() {
  if (!searchView.classList.contains('active')) return;
  const totalPages = Math.ceil(filteredChannels.length / pageSize);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  const start = (currentPage-1)*pageSize;
  const pageChannels = filteredChannels.slice(start, start+pageSize);
  channelGrid.innerHTML = '';
  pageChannels.forEach(ch => channelGrid.appendChild(createChannelCard(ch)));
  paginationDiv.innerHTML = '';
  if (totalPages > 1) {
    const prev = document.createElement('button'); prev.textContent='Previous'; prev.disabled=currentPage===1;
    prev.addEventListener('click', ()=>{ if(currentPage>1){ currentPage--; renderSearchGrid(); } });
    const next = document.createElement('button'); next.textContent='Next'; next.disabled=currentPage===totalPages;
    next.addEventListener('click', ()=>{ if(currentPage<totalPages){ currentPage++; renderSearchGrid(); } });
    const info = document.createElement('span'); info.textContent = `Page ${currentPage}/${totalPages}`;
    paginationDiv.append(prev, info, next);
  }
}

// ====================== VLC PLAYER ======================
function openPlayer(channel) {
  channelTitle.textContent = channel.displayName;
  playerModal.classList.add('active');
  if (Hls.isSupported()) {
    if (hls) hls.destroy();
    hls = new Hls();
    hls.loadSource(channel.url);
    hls.attachMedia(videoPlayer);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoPlayer.play();
      qualityLevelsSetup();
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
    alert('HLS playback not supported.');
  }
  bindPlayerControls();
}

function qualityLevelsSetup() {
  if (!hls || !hls.levels.length) { qualityBtn.style.display='none'; return; }
  qualityBtn.style.display = 'inline';
  qualityBtn.textContent = 'Auto';
  currentQualityIndex = -1;
  qualityBtn.onclick = () => {
    if (currentQualityIndex === -1) {
      const hdIdx = hls.levels.length - 1;
      hls.currentLevel = hdIdx;
      currentQualityIndex = hdIdx;
      qualityBtn.textContent = 'HD';
    } else if (currentQualityIndex === hls.levels.length-1) {
      hls.currentLevel = 0;
      currentQualityIndex = 0;
      qualityBtn.textContent = 'SD';
    } else {
      hls.currentLevel = -1;
      currentQualityIndex = -1;
      qualityBtn.textContent = 'Auto';
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
    currentTimeSpan.textContent = formatTime(videoPlayer.currentTime);
  };
  videoPlayer.ondurationchange = () => {
    durationSpan.textContent = formatTime(videoPlayer.duration);
  };
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  });

  volumeSlider.oninput = () => videoPlayer.volume = volumeSlider.value;
  videoPlayer.onvolumechange = () => volumeSlider.value = videoPlayer.volume;

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

function formatTime(sec) {
  if (isNaN(sec)) return '0:00';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// ====================== INIT ======================
loadChannels();