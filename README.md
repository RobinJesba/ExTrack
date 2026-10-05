# ExTrack 🎵

> **6-Stem AI Audio Separation & Interactive Rehearsal Studio**  
> High-performance audio workstation for musicians and producers. Available as a **Native Desktop App (Tauri v2 / Rust)** and **Self-Hosted Web Studio**. Powered by **BS-RoFormer-SW**, **Apple Silicon Metal (MPS)**, **Web Audio API**, and **Next.js**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white)](https://tauri.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Rust](https://img.shields.io/badge/Rust-2024_Edition-orange?logo=rust)](https://www.rust-lang.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-ee4c2c?logo=pytorch)](https://pytorch.org/)
[![Apple Silicon Metal](https://img.shields.io/badge/Metal-MPS%20Accelerated-brightgreen?logo=apple)](https://developer.apple.com/metal/)

---

## ✨ Features

- 🎧 **State-of-the-Art 6-Stem Neural Separation**:
  - Isolates **Vocals**, **Drums**, **Bass**, **Guitar**, **Piano**, and **Other (Synths/FX)** using the top-ranking **BS-RoFormer-SW** neural model.
  - Zero lossy fallback: strict stem verification ensures every track is genuinely isolated.
- 🖥️ **Native Desktop App & Web Studio**:
  - **Tauri v2 Desktop App**: Lightweight Rust shell, embedded SQLite database, zero-latency binary IPC audio reading, and native file dialogs.
  - **Web Studio**: Self-hosted Next.js web application with Server-Sent Events (SSE) progress tracking.
  - **Unified Adapter**: Automatically detects environment and switches between desktop IPC and web REST APIs.
- 🎛️ **Synchronized Multi-Track Studio**:
  - Sample-accurate playback synchronization across all 6 stems.
  - Channel faders, Mute / Solo toggles, panning, and live RMS VU peak meters.
  - **Minus-One Practice**: Instantly mute your instrument stem to play along with the band.
- ⏱️ **Independent Tempo & Key Control**:
  - **Pitch Transposition** (-6 to +6 semitones) without altering playback speed.
  - **Tempo Scaling** (50% to 150%) powered by time-stretching (**SoundTouch AudioWorklet WSOLA**), preserving original pitch.
- 🎸 **Interactive Bass Fretboard & Note Tracking**:
  - Sub-bass fundamental pitch tracking mapped to a 4-string bass neck (E-A-D-G).
  - Real-time fret positioning (0–24 frets) and legato slide detection.
- 🎹 **Chords, Piano, & Guitar Visualizers**:
  - **Chord Ribbon**: Dynamic chord and section tracker synchronized to downbeats.
  - **Piano Voicing**: Real-time single-octave keyboard highlighting.
  - **Guitar Chords**: Standard fretboard fingering diagrams.
- 💾 **Export Master Mix**:
  - Render and download your custom mixdown as a high-fidelity `.wav` file, baking in all fader gains, mute/solo states, pitch transposition, and tempo scaling.
- 📥 **Flexible Audio Ingestion**:
  - Direct local file import (`.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.ogg`).
  - Seamless YouTube URL audio extraction via `yt-dlp` with debounced, non-blocking metadata fetching.
- ⚡ **Local Hardware Acceleration**:
  - Native **Apple Silicon Metal (MPS)** acceleration.
  - **NVIDIA CUDA** GPU support or multi-core CPU fallback.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Frontend UI                          │
│     (Next.js 16, React 19, Tailwind CSS v4, Web Audio API)      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
               ┌────────────────┴────────────────┐
               │ Unified Client Adapter          │
               │ (src/lib/api/trackClient.ts)    │
               └───────┬─────────────────┬───────┘
                       │                 │
           Tauri IPC   │                 │ HTTP / REST / SSE
      (Desktop Mode)   │                 │ (Web Mode)
                       ▼                 ▼
 ┌───────────────────────────┐     ┌───────────────────────────┐
 │   Tauri v2 Desktop App    │     │   Next.js API Server      │
 │   - Rust IPC Commands     │     │   - REST API Routes       │
 │   - Embedded SQLite       │     │   - Server-Sent Events    │
 │   - Native Audio Protocol │     │   - better-sqlite3 (WAL)  │
 └─────────────┬─────────────┘     └─────────────┬─────────────┘
               │                                 │
               └────────────────┬────────────────┘
                                │ Subprocess Execution
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │               Python AI Processing Engine                   │
 │   - BS-RoFormer-SW 6-Stem Neural Audio Separation           │
 │   - Apple Silicon Metal (MPS) / NVIDIA CUDA Acceleration    │
 │   - Dynamic Programming (Ellis) Beat & Downbeat Tracking    │
 │   - Dual-Register CQT / Tonnetz / HPCP Harmonic Consensus   │
 │   - Sub-Bass Pitch & Legato Slide Extraction                │
 └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: v20+
- **Rust**: Latest stable (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Python**: 3.11 recommended
- **ffmpeg & yt-dlp**:
  ```bash
  # macOS (Homebrew)
  brew install ffmpeg yt-dlp

  # Ubuntu / Debian
  sudo apt update && sudo apt install -y ffmpeg
  pip install yt-dlp
  ```

### 2. Clone the Repository

```bash
git clone https://github.com/RobinJesba/ExTrack.git
cd ExTrack
```

### 3. Install Node.js Dependencies

```bash
npm install
```

### 4. Setup Python Environment & Dependencies

```bash
# Create Python 3.11 virtual environment
python3.11 -m venv backend/.venv

# Activate virtual environment
source backend/.venv/bin/activate  # macOS / Linux
# or: backend\.venv\Scripts\activate  # Windows

# Install AI dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 5. Download Model Weights

ExTrack uses the **BS-RoFormer-SW** checkpoint (~700MB) for 6-stem neural separation.

Download or place `BS-Roformer-SW.ckpt` and `BS-Roformer-SW.yaml` inside:
```
data/models/BS-Roformer-SW.ckpt
data/models/BS-Roformer-SW.yaml
```

---

## 🖥️ Running the Application

### Option A: Native Desktop App (Recommended)

Run ExTrack as a desktop application with native hardware access:

```bash
# Run in desktop development mode (with hot reloading)
npm run tauri dev

# Package production macOS .app bundle
npm run tauri build -- --bundles app --no-sign
```

The compiled application will be generated at:
`src-tauri/target/release/bundle/macos/ExTrack.app`

### Option B: Web Studio

Run ExTrack as a self-hosted browser application:

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎛️ How It Works

### Neural Stem Separation
Audio is processed in overlapping sliding windows through **BS-RoFormer-SW** (Band-Split RoFormer), producing 6 isolated 24-bit PCM stems:
1. `vocals.wav`
2. `drums.wav`
3. `bass.wav`
4. `guitar.wav`
5. `piano.wav`
6. `other.wav`

### Pitch & Harmonic Analysis
- **Tonnetz Tonal Centroids**: 6-dimensional projection over the circle of fifths and minor/major thirds.
- **HPCP Harmonic Pitch-Class Profile**: Filtered Constant-Q Transform (CQT) across octaves to extract clean chord progressions.
- **Sub-Bass Fundamental Tracking**: Analyzes the isolated bass stem fundamental frequency ($f_0$) to map exact string and fret coordinates with legato slide direction.

### Web Audio Engine
- Built on the **Web Audio API** and a custom **AudioWorklet**.
- Uses **SoundTouch WSOLA** (Waveform Similarity Overlap-Add) to stretch audio buffers smoothly without pitch distortion or artifacts.
- Zero-latency stem buffer streaming via native Tauri IPC in desktop mode.

---

## 💻 Tech Stack

- **Desktop Shell**: [Tauri v2](https://tauri.app/) (Rust 2024 edition, `rusqlite`, native webview)
- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/), Radix UI / Base UI, Lucide Icons
- **Database**: SQLite (embedded in Desktop via `rusqlite`, `better-sqlite3` in Web)
- **Audio DSP**: `@soundtouchjs/audio-worklet`, Web Audio API
- **AI / ML**: PyTorch 2.0+, `audio-separator`, Librosa, NumPy, Apple Silicon Metal (MPS)

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
