# 📻 ZoneShuffle 

**Signal from the outworld.** 
ZoneShuffle is a dynamic, full-stack synchronized online radio broadcasting platform. Built with a deeply nostalgic yet modernized **Windows Media Player 2008 aesthetic**, the UI features real-time fluid oscilloscope waveforms, glassmorphism ("Aero Glass") components, and dynamic ambient lighting that synchronizes the entire screen to the heartbeat of the music.

## ✨ Features

* **Global Synchronized Playback:** Powered by Server-Sent Events (SSE). No matter where they are, all active listeners are tuned into the exact same timestamp of the same song simultaneously. 
* **Retro-Modern Visualizer:** Features an HTML Canvas-based visualizer rendering multiple overlapping sine waves and background equalizers mimicking the iconic "Bars and Waves" style of 2000s media players.
* **Dynamic Ambient Glow:** The DOM smoothly reacts in real-time to the current color phase of the canvas using dynamic CSS variables, bathing the viewport in atmospheric light.
* **DJ Panel (Admin Area):** 
  * Secured via JWT authentication.
  * Native support to upload `.zip` archives directly to the server; it recurses into the directories to magically extract, read metadata from, and insert audio files (MP3, WAV, FLAC, OGG, AAC) into the active radio playlist.
  * Manage tracks, toggle visibility, and "skip" the current worldwide broadcast.
  * Real-time listeners statistics natively tracked via heartbeats.
* **Self-Hosted Ready:** Comes with a bundled Express.js core that serves the React frontend statically out of the box, making deployment an absolute breeze on platforms like Render or Railway.

## 🛠️ Stack

* **Frontend:** React, Vite, CSS3 (Custom Properties & Glassmorphism design), HTML5 Canvas.
* **Backend:** Node.js, Express.js.
* **Database:** SQLite (`better-sqlite3` for blazing fast WAL-mode queries).
* **Utilities:** `music-metadata` (for automatic ID3 parsing), `multer`, `jsonwebtoken`.

