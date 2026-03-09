# Plate

**Get your lecture notes served to you on a plate.**

Plate is a macOS desktop app that records your lectures (in-person or Zoom), transcribes them locally on your machine, and generates study-ready notes using AI. No cloud required for transcription — everything runs on-device with whisper.cpp.

![Tauri](https://img.shields.io/badge/Tauri_v2-24C8D8?logo=tauri&logoColor=fff)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=000)
![Rust](https://img.shields.io/badge/Rust-000?logo=rust)
![macOS](https://img.shields.io/badge/macOS_13+-000?logo=apple&logoColor=fff)

---

## Install

### Download (recommended)

Go to [**Releases**](../../releases/latest) and download `Plate.dmg`. Drag to Applications. Done.

> **Important:** Since the app isn't code-signed, macOS will say it's "damaged". After dragging to Applications, run this in Terminal:
> ```
> xattr -cr /Applications/Plate.app
> ```
> Then open normally. You only need to do this once.

### Build from source

```bash
# Prerequisites: macOS 13+, Rust, Node.js 18+
npm install
npm run tauri build
# .dmg output in src-tauri/target/release/bundle/dmg/
```

---

## Features

- **Record anything** — microphone for IRL lectures, system audio for Zoom/Teams/Meet (via ScreenCaptureKit, no BlackHole needed)
- **Live transcription** — see words appear in real-time as you record
- **Local transcription** — fully offline speech-to-text with whisper.cpp. Choose from Tiny (39MB) to Large (1.5GB) models — auto-downloaded on first use with progress bar
- **Cloud transcription** — OpenAI Whisper API as an alternative
- **AI notes** — generate high-yield study notes from your transcript using Claude or any OpenAI-compatible API
- **Everything local** — recordings, transcripts, notes stored in SQLite on your machine
- **Auto-save settings** — settings save automatically as you change them
- **Dark, compact UI** — Cursor-inspired design, built for keyboard warriors

---

## How it works

1. **Record** — Hit record, pick mic or system audio. Live transcript streams as you go.
2. **Library** — All recordings in one place. Click to view transcript, generate notes. Transcription model downloads automatically if needed (you'll see a progress bar).
3. **Notes** — Pick a prompt style or write your own. AI generates study notes from the transcript.
4. **Settings** — Configure transcription engine, AI provider, audio sample rate. Everything auto-saves.

---

## Configuration

All configuration is in the **Settings** page inside the app.

### AI Provider

| Mode | Setup | Notes |
|---|---|---|
| **Free (Pollinations)** | Nothing needed | Uses free OpenAI-compatible API. No API key required. May be slow or rate-limited. |
| **API Key** | Paste your Anthropic API key (`sk-ant-...`) | Choose model: Sonnet, Opus, Haiku |
| **Session Token** | Paste `sessionKey` from claude.ai cookies | Uses your existing Claude subscription |

### Transcription

| Engine | Setup | Notes |
|---|---|---|
| **Local (Whisper)** | Just select a model size | Runs offline. Models auto-download on first use. Tiny (39MB, fast) → Large (1.5GB, accurate). |
| **OpenAI API** | Paste OpenAI API key | Faster and more accurate, requires internet |

Settings page shows which models are already downloaded.

### macOS Permissions

On first use, grant these in **System Settings > Privacy & Security**:
- **Microphone** — for recording IRL lectures
- **Screen Recording** — for capturing system audio (uses ScreenCaptureKit, not actual screen recording)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Tauri v2 (Rust backend + WebView frontend) |
| Frontend | React 19, TailwindCSS v4, Zustand, React Router v7 |
| Audio | cpal (mic), ScreenCaptureKit (system audio) |
| Transcription | whisper-rs / whisper.cpp (local), OpenAI Whisper API (cloud) |
| AI | Anthropic Claude, OpenAI-compatible APIs |
| Storage | SQLite (rusqlite + tauri-plugin-sql) |

---

## Project Structure

```
plate/
├── src/                        # React frontend
│   ├── pages/                  # RecordPage, LibraryPage, SettingsPage
│   ├── components/
│   │   ├── layout/             # Sidebar, Layout
│   │   ├── recording/          # Controls, AudioSourcePicker, Waveform, LiveTranscript
│   │   ├── transcripts/        # TranscriptViewer
│   │   ├── notes/              # NoteViewer, PromptPicker
│   │   └── settings/           # ModelProviderConfig, TranscriptionConfig
│   ├── hooks/                  # useRecording, useTranscript, useNotes, useSettings
│   ├── stores/                 # Zustand (recording state, audio source)
│   └── lib/                    # Tauri invoke/listen wrappers, types
│
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── audio/              # Mic (cpal), system audio (ScreenCaptureKit), recorder, live transcriber
│       ├── transcription/      # WhisperLocal, WhisperApi, ModelManager (auto-download with progress)
│       ├── llm/                # G4F (free), Claude API, Claude session, prompt templates
│       ├── db/                 # SQLite schema + CRUD
│       ├── commands/           # Tauri command handlers
│       └── state.rs            # AppState
│
└── .github/workflows/          # CI: build + release on tag push
```

---

## Development

```bash
npm install
npm run tauri dev          # Dev mode with hot reload
```

| Command | Description |
|---|---|
| `npm run tauri dev` | Dev mode (Vite HMR + Rust rebuild) |
| `npm run tauri build` | Production .app + DMG |
| `npx tsc --noEmit` | Type-check frontend |
| `cargo check -p plate` | Type-check Rust backend |

---

## Releasing

Push a version tag to trigger a GitHub Actions build that creates a release with DMG downloads:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## License

MIT
