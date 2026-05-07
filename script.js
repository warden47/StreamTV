// ====================== CONFIGURATION ======================
const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

// ====================== GLOBALS ======================
let allChannels = [];
let filteredChannels = [];
let currentPage = 1;
const pageSize = 40;
let activeCategory = '';
let activeLanguage = '';
let pingStatusMap = new Map();         // url -> {status, checking}
let availableChannelsSet = new Set();   // urls that are confirmed available
let favorites = JSON.parse(localStorage.getItem('streamtv_favs') || '[]');
let scanningActive = false;
let scanAbortController = null;

// DOM elements
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
function showView(viewId) {
  [homeView, availableView, searchView, profileView].forEach(v => v.classList.remove('active'));
  document.getElementById(viewId + 'View').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');

  if (viewId === 'search') applyFilters();
  if (viewId === 'profile') renderFavorites();
  if (viewId === 'available') {
    // if scan not done and not running, prompt
    if (availableChannelsSet.size === 0 && !scanningActive) {
      availableCategories.innerHTML = '<p style="text-align:center;padding:2rem;">Click "Scan" to find live channels.</p>';
    } else {
      buildAvailableRows();
    }
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ====================== DATA FETCHING ======================
async function fetchPlaylistText() {
  try { const resp = await fetch(PLAYLIST_URL); if (resp.ok) return await resp.text(); } catch(e) {}
  for (const proxy of PROXY_URLS) {
    try { const resp = await fetch(proxy + encodeURIComponent(PLAYLIST_URL)); if (resp.ok) return await resp.text(); } catch(e) {}
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

function extractLanguage(raw) {
  raw = raw.toLowerCase();
  const lmap = {'english':'English','french':'French','spanish':'Spanish','german':'German','italian':'Italian','portuguese':'Portuguese','russian':'Russian','arabic':'Arabic','hindi':'Hindi','turkish':'Turkish','dutch':'Dutch','polish':'Polish','indonesian':'Indonesian','thai':'Thai','vietnamese':'Vietnamese'};
  for (const [k,v] of Object.entries(lmap)) if (raw.includes(k)) return v;
  return '';
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
  'Sports': ['sports','sport'],
  'Movies': ['movies','movie','film'],
  'Kids': ['kids','child','cartoon'],
  'Music': ['music','musical'],
  'News': ['news','information'],
  'Documentary': ['documentary','docu'],
  'Religion': ['religion','religious','faith'],
};

function getChannelsByCategory(cat, source = allChannels) {
  const keys = CATEGORY_MAP[cat] || [cat.toLowerCase()];
  return source.filter(ch => {
    const g = (ch.groupTitle || '').toLowerCase();
    return keys.some(k => g.includes(k));
  });
}

function getUniqueLanguages() {
  const set = new Set();
  allChannels.forEach(ch => { if (ch.language) set.add(ch.language); });
  return [...set].sort();
}

// ====================== CHANNEL CARD (same as before) ======================
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
        <button class="fav-btn ${isFav?'liked':''}" data-url="${channel.url}"><i class="fas fa-heart"></i></button>
        <button class="ping-btn" data-url="${channel.url}"><i class="fas fa-sync-alt"></i></button>
      </div>
    </div>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openPlayer(channel);
  });
  card.querySelector('.fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(channel.url, card.querySelector('.fav-btn'));
  });
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
  if (favorites.length === 0) { list.innerHTML = '<p>No favorites yet.</p>'; return; }
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

// ====================== PING (enhanced with callback) ======================
function updatePing(el, status) {
  if (!el) return;
  el.innerHTML = status === 'available' ? '<span class="status-available">✔</span>' : '<span class="status-unavailable">✘</span>';
}

async function pingChannel(url, el, callback) {
  if (!url) return;
  // if we already have a cached result, use it
  if (pingStatusMap.has(url) && !pingStatusMap.get(url).checking) {
    const status = pingStatusMap.get(url).status;
    if (el) updatePing(el, status);
    if (callback) callback(url, status);
    return;
  }
  pingStatusMap.set(url, { checking: true, status: null });
  if (el) el.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://corsproxy.io/?' + encodeURIComponent(url), { method:'HEAD', signal:controller.signal });
    clearTimeout(timeout);
    const ok = resp.ok;
    pingStatusMap.set(url, { checking: false, status: ok ? 'available' : 'unavailable' });
    if (el) updatePing(el, ok ? 'available' : 'unavailable');
    if (callback) callback(url, ok ? 'available' : 'unavailable');
  } catch (e) {
    pingStatusMap.set(url, { checking: false, status: 'unavailable' });
    if (el) updatePing(el, 'unavailable');
    if (callback) callback(url, 'unavailable');
  }
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

// ====================== AVAILABLE SCANNING ======================
async function startScan() {
  if (scanningActive) return;
  scanningActive = true;
  scanBtn.style.display = 'none';
  stopScanBtn.style.display = 'inline-flex';
  availableChannelsSet.clear();
  availableCategories.innerHTML = '';
  scanProgress.textContent = 'Starting scan...';

  const MAX_SCAN = 1000; // limit to first 1000 channels (you can increase)
  const channelsToScan = allChannels.slice(0, MAX_SCAN);
  let scanned = 0;
  let found = 0;
  const BATCH_SIZE = 5; // concurrent pings
  let index = 0;

  const updateProgress = () => {
    scanProgress.textContent = `Scanned ${scanned}/${channelsToScan.length} – Found ${found} live`;
  };

  const processBatch = async () => {
    while (index < channelsToScan.length && scanningActive) {
      const batch = channelsToScan.slice(index, index + BATCH_SIZE);
      index += BATCH_SIZE;
      const promises = batch.map(ch => {
        return new Promise(resolve => {
          pingChannel(ch.url, null, (url, status) => {
            scanned++;
            if (status === 'available') {
              found++;
              availableChannelsSet.add(url);
              // Add card to the appropriate category row
              addToAvailableRow(ch);
            }
            resolve();
          });
        });
      });
      await Promise.all(promises);
      updateProgress();
      // small delay to avoid overwhelming
      await new Promise(r => setTimeout(r, 100));
    }
    // finish
    scanningActive = false;
    scanBtn.style.display = 'inline-flex';
    stopScanBtn.style.display = 'none';
    updateProgress();
    if (availableChannelsSet.size === 0) {
      availableCategories.innerHTML = '<p style="text-align:center;">No available channels found right now.</p>';
    }
  };

  processBatch();
}

function stopScan() {
  scanningActive = false;
}

scanBtn.addEventListener('click', startScan);
stopScanBtn.addEventListener('click', stopScan);

// Dynamically add card to the right category row
function addToAvailableRow(channel) {
  // Determine category
  let cat = null;
  for (const [catName, keys] of Object.entries(CATEGORY_MAP)) {
    const g = (channel.groupTitle || '').toLowerCase();
    if (keys.some(k => g.includes(k))) { cat = catName; break; }
  }
  if (!cat) cat = 'Other';

  let section = availableCategories.querySelector(`[data-category="${cat}"]`);
  if (!section) {
    section = document.createElement('div');
    section.className = 'category-section';
    section.dataset.category = cat;
    section.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div>`;
    const row = document.createElement('div');
    row.className = 'scroll-row';
    section.appendChild(row);
    availableCategories.appendChild(section);
  }
  const row = section.querySelector('.scroll-row');
  // Avoid duplicates
  if (row.querySelector(`[data-url="${channel.url}"]`)) return;
  const card = createChannelCard(channel);
  card.dataset.url = channel.url;
  row.appendChild(card);
}

function buildAvailableRows() {
  // Rebuild entire available view from the set
  availableCategories.innerHTML = '';
  const availableChannels = allChannels.filter(ch => availableChannelsSet.has(ch.url));
  const cats = ['News','Sports','Movies','Music','Kids','Documentary','Religion'];
  cats.forEach(cat => {
    const chs = getChannelsByCategory(cat, availableChannels);
    if (!chs.length) return;
    const section = document.createElement('div');
    section.className = 'category-section';
    section.innerHTML = `<div class="category-header"><i class="fas fa-tv"></i> ${cat}</div>`;
    const row = document.createElement('div');
    row.className = 'scroll-row';
    chs.forEach(ch => row.appendChild(createChannelCard(ch)));
    section.appendChild(row);
    availableCategories.appendChild(section);
  });
  if (availableChannelsSet.size === 0) {
    availableCategories.innerHTML = '<p style="text-align:center;">No available channels yet. Start a scan.</p>';
  }
}

// ====================== FILTERS (Search) ======================
function setupFilters() {
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

// ====================== VLC PLAYER (unchanged) ======================
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
function qualityLevelsSetup() { /* same as before, unchanged */ }
function closePlayer() { /* same */ }
function bindPlayerControls() { /* same */ }
// (Include the existing player functions exactly as before – I'm omitting them here for brevity, but keep them from previous version)

// ====================== INIT ======================
loadChannels();