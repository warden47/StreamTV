# 📺 StreamTV

A modern, web-based streaming application that allows you to browse, search, and watch live TV channels from an IPTV playlist. Built with vanilla JavaScript, featuring a sleek dark/light theme and VLC-style player controls.

## ✨ Features

- **🏠 Home View**: Featured categories with popular channels (Sports, Movies, News, Music, Kids, Documentary, Religion)
- **⚡ Available Scan**: Discover live channels with real-time availability checking
- **🔍 Search & Filter**: Search channels by name, filter by category and language
- **❤️ Favorites**: Save your favorite channels for quick access
- **🎬 VLC-Style Player**: Full-featured video player with quality selection, progress bar, and volume control
- **🌙 Theme Toggle**: Switch between dark and light modes
- **📱 Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **💬 Social Integration**: Quick links to WhatsApp and Telegram

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- No backend server required - runs entirely in the browser

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/warden47/StreamTV.git
   ```

2. Open in your browser:
   - Navigate to the repository folder
   - Open `index.html` in your web browser
   - Or use a local server: `python -m http.server 8000`

### Live Demo
Visit: `https://github.com/warden47/StreamTV`
*(If hosted on GitHub Pages, update with your actual URL)*

## 📋 How to Use

### Home Tab
- Browse featured channels organized by category
- Click any channel card to start playing

### Available Tab
- Click **"Scan for available channels"** to check which channels are currently live
- The scan runs concurrently (5 channels at a time) to save time
- Available channels are displayed by category

### Search Tab
- Type to search for channels by name
- Filter by **Category** (Sports, Movies, News, etc.)
- Filter by **Language** (English, French, Spanish, etc.)
- Use pagination to browse through results

### Profile Tab
- View and manage your **Favorite Channels**
- Click the ❤️ icon on any channel to add/remove from favorites
- Favorites are saved in your browser's local storage

### Player Controls
- **Play/Pause**: Toggle playback
- **Volume**: Adjust with the slider or button
- **Quality**: Switch video quality (if available)
- **Fullscreen**: Expand to full screen
- **Progress Bar**: Click to seek through the video

## 🛠️ Technical Details

### Technologies Used
- **HTML5**: Semantic markup and video player
- **CSS3**: Glassmorphism design, animations, responsive layout
- **JavaScript (Vanilla)**: No frameworks - pure ES6+
- **HLS.js**: HLS (HTTP Live Streaming) protocol support
- **Font Awesome**: Icon library

### Key Files
- `index.html` - Main HTML structure
- `script.js` - All JavaScript logic (19KB)
- `style.css` - Styling and theme system (10KB)
- `logo.png`, `background.png`, `load.png` - Asset images

### Data Source
Channels are fetched from:
- **Primary**: `https://iptv-org.github.io/iptv/index.m3u`
- **Fallback Proxies**: CORS proxies for reliability

### Browser Storage
- **Theme preference**: Saved in localStorage
- **Favorite channels**: Saved in localStorage under `streamtv_favs`
- **Ping status**: Cached during session for performance

## ⚙️ Configuration

### Modify Playlist URL
Edit line 2 in `script.js`:
```javascript
const PLAYLIST_URL = 'your-playlist-url-here';
```

### Adjust Scan Settings
In `script.js`, around line 298:
```javascript
const MAX_SCAN = 1000; // Limit channels to scan (default: 1000)
const BATCH_SIZE = 5;  // Concurrent pings (default: 5)
```

### Add Custom Categories
Edit `CATEGORY_MAP` in `script.js` (lines 153-161):
```javascript
const CATEGORY_MAP = {
  'CustomCategory': ['keyword1', 'keyword2'],
  // ... more categories
};
```

## 🔒 Notes & Limitations

- **CORS Requirements**: Channels must support CORS or use a proxy
- **Channel Availability**: Depends on playlist freshness and channel status
- **Streaming Quality**: Determined by the channel stream quality
- **Offline Mode**: Requires internet connection for streaming

## 📝 License

This project is open source and available on GitHub.

## 🤝 Contribution

Feel free to fork, modify, and enhance this project!

### Contact
- 📱 WhatsApp: [wa.link/s8bcwl](https://wa.link/s8bcwl)
- 💬 Telegram: [@blackeye47](https://t.me/blackeye47)

---

**Made with ❤️ by [warden47](https://github.com/warden47)**
