// ====================== GLOBALS ======================
const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

let allChannels = [];
let filteredChannels = [];
let currentPage = 1;
const pageSize = 36;
let activeCategory = '';
let pingStatusMap = new Map();
let favorites = JSON.parse(localStorage.getItem('streamtv_favs') || '[]');

// ====================== DOM Refs ======================
const statusText = document.getElementById('statusText');
const homeView = document.getElementById('homeView');
const searchView = document.getElementById('searchView');
const profileView = document.getElementById('profileView');
const featuredCategories = document.getElementById('featuredCategories');
const searchBox = document.getElementById('searchBox');
const categoryPills = document.getElementById('categoryPills');
const channelGrid = document.getElementById('channelGrid');
const paginationDiv = document.getElementById('pagination');
const playerModal = document.getElementById('playerModal');
const videoPlayer = document.getElementById('videoPlayer');
const channelTitle = document.getElementById('channelTitle');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const currentTimeSpan = document.getElementById('currentTime');
const durationSpan = document.getElementById('duration');
const volumeSlider = document.getElementById('volumeSlider');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const qualityBtn = document.getElementById('qualityBtn');
const closePlayerBtn = document.getElementById('closePlayer');
const themeToggle = document.getElementById('themeToggle');

let hls = null;
let currentQualityIndex = -1;

// ====================== Theme ======================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('streamtv_theme', theme);
  const icon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
  themeToggle.innerHTML = `<i class="fas ${icon}"></i>`;
}
const savedTheme = localStorage.getItem('streamtv_theme') || 'dark';
applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ====================== Navigation ======================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    homeView.classList.toggle('active', view === 'home');
    searchView.classList.toggle('active', view === 'search');
    profileView.classList.toggle('active', view === 'profile');
    if (view === 'search') applySearchFilters();
    if (view === 'profile') renderFavorites();
  });
});

// ====================== Fetch & Parse ======================
async function fetchPlaylistText() {
  // direct then proxies
  try {
    const resp = await fetch(PLAYLIST_URL);
    if (resp.ok) return await resp.text();
  } catch (e) {}
  for (const proxy of PROXY_URLS) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(PLAYLIST_URL));
      if (resp.ok) return await resp.text();
    } catch (e) {}
  }
  throw new Error('Could not load playlist.');
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
      const ga = (a) => { const m = meta.match(new RegExp(`${a}="([^"]*)"`)); return m ? m[1] : ''; };
      current = { displayName: name, tvgId: ga('tvg-id'), tvgName: ga('tvg-name'), tvgLogo: ga('tvg-logo'), groupTitle: ga('group-title') };
    } else if (t && !t.startsWith('#') && current) {
      current.url = t; channels.push(current); current = null;
    }
  }
  if (current) channels.push(current);
  return channels;
}

async function loadChannels() {
  try {
    statusText.textContent = 'Loading channels…';
    const text = await fetchPlaylistText();
    allChannels = parseM3U(text);
    statusText.textContent = `${allChannels.length} channels loaded`;
    buildHomeRows();
    setupSearchFilters();
  } catch (e) {
    statusText.textContent = 'Error: ' + e.message;
  }
}

// ====================== Category Map ======================
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
    const group = (ch.groupTitle || '').toLowerCase();
    return keys.some(k => group.includes(k));
  });
}

// Fake viewer counts
function randomViewers() { return Math.floor(Math.random() * 500) + 5 + 'K viewers'; }

// ====================== Card Creation ======================
function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card';
  const isFav = favorites.includes(channel.url);
  card.innerHTML = `
    <div class="live-badge">LIVE</div>
    <div class="viewer-count">${randomViewers()}</div>
    <img class="card-img" src="${channel.tvgLogo || 'https://via.placeholder.com/200x130/1e3a8a/ffffff?text=TV'}" 
         onerror="this.src='https://via.placeholder.com/200x130/1e3a8a/ffffff?text=TV'">
    <div class="card-body">
      <div class="card-name">${channel.displayName || 'Unknown'}</div>
      <div class="card-meta">
        <span class="ping-status" id="ping-${btoa(channel.url)}"></span>
        <button class="fav-btn ${isFav ? 'liked' : ''}" data-url="${channel.url}"><i class="fas fa-heart"></i></button>
        <button class="ping-btn" data-url="${channel.url}"><i class="fas fa-sync-alt"></i></button>
      </div>
    </div>
  `;
  // Click to play (not on buttons)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openPlayer(channel);
  });
  // Heart favorite
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

// ====================== Favorites ======================
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
  const favList = document.getElementById('favList');
  if (favorites.length === 0) {
    favList.innerHTML = '<p>No favorites yet. Click the heart on any channel.</p>';
    return;
  }
  favList.innerHTML = '';
  favorites.forEach(url => {
    const ch = allChannels.find(c => c.url === url);
    if (ch) {
      const chip = document.createElement('span');
      chip.className = 'fav-chip';
      chip.textContent = ch.displayName;
      chip.addEventListener('click', () => openPlayer(ch));
      favList.appendChild(chip);
    }
  });
}

// ====================== Ping ======================
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

// ====================== Home Rows ======================
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
    chs.slice(0, 30).forEach(ch => row.appendChild(createChannelCard(ch)));
    section.appendChild(row);
    featuredCategories.appendChild(section);
  });
}

// ====================== Search ======================
function setupSearchFilters() {
  categoryPills.innerHTML = '';
  const allPill = document.createElement('button');
  allPill.className = 'pill active'; allPill.textContent = 'All';
  allPill.addEventListener('click', () => { activeCategory=''; currentPage=1; applySearchFilters(); });
  categoryPills.appendChild(allPill);
  ['Sports','Movies','Kids','Music','News','Documentary','Religion'].forEach(cat => {
    const p = document.createElement('button');
    p.className = 'pill'; p.textContent = cat;
    p.addEventListener('click', () => { activeCategory=cat; currentPage=1; applySearchFilters(); });
    categoryPills.appendChild(p);
  });
  searchBox.addEventListener('input', () => { currentPage=1; applySearchFilters(); });
}

function applySearchFilters() {
  const q = searchBox.value.toLowerCase();
  filteredChannels = allChannels.filter(ch => {
    if (q && !ch.displayName.toLowerCase().includes(q)) return false;
    if (activeCategory) {
      const keys = CATEGORY_MAP[activeCategory] || [activeCategory.toLowerCase()];
      const group = (ch.groupTitle||'').toLowerCase();
      if (!keys.some(k => group.includes(k))) return false;
    }
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

// ====================== VLC Player ======================
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
      setupQualityLevels();
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      }
    });
    window.hls = hls;
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    videoPlayer.src = channel.url;
    videoPlayer.play();
  } else {
    alert('HLS not supported.');
  }
  // Custom controls
  bindPlayerEvents();
}

function setupQualityLevels() {
  if (!hls) return;
  const levels = hls.levels;
  if (levels.length > 1) {
    qualityBtn.style.display = 'inline-block';
    qualityBtn.textContent = 'Auto';
    qualityBtn.onclick = () => {
      if (currentQualityIndex === -1) {
        // switch to first HD-like level (highest)
        const hdIdx = levels.length - 1;
        hls.currentLevel = hdIdx;
        currentQualityIndex = hdIdx;
        qualityBtn.textContent = 'HD';
      } else if (currentQualityIndex === levels.length-1) {
        // switch to SD (lowest)
        hls.currentLevel = 0;
        currentQualityIndex = 0;
        qualityBtn.textContent = 'SD';
      } else {
        hls.currentLevel = -1; // auto
        currentQualityIndex = -1;
        qualityBtn.textContent = 'Auto';
      }
    };
  } else {
    qualityBtn.style.display = 'none';
  }
}

function closePlayer() {
  playerModal.classList.remove('active');
  if (hls) { hls.destroy(); hls = null; }
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
}

closePlayerBtn.addEventListener('click', closePlayer);
// Also close on Esc
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlayer(); });

// Custom controls logic
function bindPlayerEvents() {
  // Play/pause
  playPauseBtn.onclick = () => {
    if (videoPlayer.paused) videoPlayer.play();
    else videoPlayer.pause();
  };
  videoPlayer.onplay = () => playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
  videoPlayer.onpause = () => playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  // Time update
  videoPlayer.ontimeupdate = () => {
    const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100 || 0;
    progressFill.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    currentTimeSpan.textContent = formatTime(videoPlayer.currentTime);
  };
  videoPlayer.ondurationchange = () => {
    durationSpan.textContent = formatTime(videoPlayer.duration);
  };
  // Progress bar click
  progressBar.onclick = (e) => {
    const rect = progressBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  };
  // Volume
  volumeSlider.oninput = () => videoPlayer.volume = volumeSlider.value;
  videoPlayer.onvolumechange = () => volumeSlider.value = videoPlayer.volume;
  // Fullscreen
  fullscreenBtn.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else playerModal.requestFullscreen();
  };
}

function formatTime(sec) {
  if (isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// ====================== Init ======================
loadChannels();