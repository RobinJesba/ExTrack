# ExTrack 🎵

> **6-Stem AI Audio Separation & Interactive Rehearsal Studio**  
> High-performance, self-hosted web studio for musicians and producers. Powered by **BS-RoFormer-SW**, **Web Audio API**, and **Next.js**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-ee4c2c)](https://pytorch.org/)
[![Apple Silicon Metal](https://img.shields.io/badge/Metal-MPS%20Accelerated-brightgreen)](https://developer.apple.com/metal/)

---

## ✨ Features

- 🎧 **State-of-the-Art 6-Stem Separation**:
  - Isolates **Vocals**, **Drums**, **Bass**, **Guitar**, **Piano**, and **Other (Synths/FX)** using the top-ranking **BS-RoFormer-SW** deep neural model.
- 🎛️ **Synchronized Multi-Track Studio**:
  - Sample-accurate playback synchronization across all 6 stems.
  - Individual channel faders, Mute / Solo toggles, panning, and live RMS VU meters.
  - **Minus-One Practice**: Instantly mute your instrument stem to play along with the band.
- ⏱️ **Independent Tempo & Key Control**:
  - **Pitch Transposition** (-6 to +6 semitones) without altering playback speed.
  - **Tempo Scaling** (50% to 150%) powered by time-stretching (**SoundTouch AudioWorklet WSOLA**), preserving original pitch.
- 🎸 **Interactive Bass Fretboard & Note Tracking**:
  - Sub-bass fundamental pitch tracking mapped to a 4-string bass neck (E-A-D-G).
  - Real-time fret positioning (0–24 frets) and legato slide detection.
- 🎹 **Chords, Piano, & Guitar Visualizers**:
  - **Chord Ribbon**: Dynamic chord and section tracker synchronized to the beat.
  - **Piano Voicing**: Real-time single-octave keyboard highlighting.
  - **Guitar Chords**: Standard fretboard fingering diagrams.
- 💾 **Export Master Mix**:
  - Render and download your custom mixdown as a high-fidelity `.wav` file, baking in all fader gains, mute/solo states, pitch transposition, and tempo scaling.
- 📥 **Flexible Audio Ingestion**:
  - Direct local file upload (`.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.ogg`).
  - Seamless YouTube URL audio extraction via `yt-dlp`.
- ⚡ **Local Hardware Acceleration**:
  - Native **Apple Silicon Metal (MPS)** acceleration.
  - **NVIDIA CUDA** GPU support or high-speed CPU fallback.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Next.js 15 Web App                   │
│   (React 19, Tailwind CSS, Lucide, Web Audio API)      │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / Server-Sent Events
┌──────────────────────────▼─────────────────────────────┐
│                    API Route Layer                     │
│    - /api/upload          - /api/youtube               │
│    - /api/process         - /api/export-mix            │
│    - /api/tracks          - /api/stream                │
└──────────────────────────┬─────────────────────────────┘
                           │ SQLite (WAL mode)
                           │ Subprocess Pipeline
┌──────────────────────────▼─────────────────────────────┐
│             Python AI Processing Engine                │
│    - BS-RoFormer-SW 6-Stem Audio Separation            │
│    - Dual-Register CQT / HPCP Chroma Analysis          │
│    - Sub-Bass Fundamental Extraction                   │
│    - Ellis Dynamic Programming Beat Tracking           │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: v18.17+ or v20+
- **Python**: 3.10 or 3.11
- **ffmpeg**: Installed and available in your `PATH`
  ```bash
  # macOS
  brew install ffmpeg yt-dlp

  # Ubuntu/Debian
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
# Create virtual environment
python3 -m venv backend/.venv

# Activate virtual environment
source backend/.venv/bin/activate  # macOS / Linux
# or: backend\.venv\Scripts\activate  # Windows

# Install required Python packages
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 5. Download Model Weights

ExTrack uses the **BS-RoFormer-SW** checkpoint (~700MB) for 6-stem separation.

The processing engine will automatically download required weights on the first run, or you can place `BS-Roformer-SW.ckpt` and `BS-Roformer-SW.yaml` directly inside:
```
backend/models/BS-Roformer-SW.ckpt
backend/models/BS-Roformer-SW.yaml
```

### 6. Run the Application

```bash
# Development mode
npm run dev

# Or build for production
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎛️ How It Works

### Stem Separation
The audio input is processed in sliding chunks through **BS-RoFormer-SW** (Band-Split RoFormer by Viperx/SW), extracting:
1. `vocals.wav`
2. `drums.wav`
3. `bass.wav`
4. `guitar.wav`
5. `piano.wav`
6. `other.wav`

### Pitch & Harmonic Analysis
- **Tonnetz Tonal Centroids**: 6-dimensional projection over the circle of fifths and minor/major thirds.
- **HPCP Harmonic Pitch-Class Profile**: Filtered Constant-Q Transform (CQT) across octaves to extract clean chord progressions.
- **Sub-Bass Pitch Tracking**: Analyzes the isolated bass stem fundamental frequency ($f_0$) to map exact string and fret coordinates.

### Audio Engine
- Built with the browser **Web Audio API** and a custom **AudioWorklet**.
- Uses **SoundTouch WSOLA** (Waveform Similarity Overlap-Add) to stretch audio buffers smoothly without pitch distortion or artifacts.

---

## 💻 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- **UI & Styling**: React 19, [Tailwind CSS](https://tailwindcss.com/), Radix UI / Base UI, Lucide Icons
- **Database**: SQLite with [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (WAL concurrency)
- **Audio Worklet**: [`@soundtouchjs/audio-worklet`](https://github.com/soundtouch-js/soundtouchjs)
- **AI / ML**: PyTorch, `audio-separator`, Librosa, NumPy

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
