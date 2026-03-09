# Plate

macOS desktop app that records lectures (in-person and Zoom), transcribes them, and generates high-yield memorization notes using Claude.

## Features

- **Microphone recording** — capture IRL lectures via system mic (cpal + CoreAudio)
- **System audio capture** — capture Zoom/online lectures via ScreenCaptureKit (no BlackHole needed)
- **Local transcription** — offline speech-to-text with whisper.cpp (whisper-rs)
- **Cloud transcription** — OpenAI Whisper API as optional alternative
- **AI note generation** — high-yield memorization notes via Claude (session token or API key)
- **SQLite storage** — recordings, transcripts, notes, and settings all stored locally

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Tauri v2 (Rust + WebView) |
| Frontend | React 19, TailwindCSS v4, Zustand, React Router v7 |
| Audio (mic) | cpal |
| Audio (system) | ScreenCaptureKit via screencapturekit crate |
| Transcription | whisper-rs (local), OpenAI Whisper API (cloud) |
| LLM | Anthropic Claude — session token or API key |
| Storage | SQLite via tauri-plugin-sql |

## Prerequisites

- **macOS 13+** (required for ScreenCaptureKit)
- **Rust** — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** — v18+
- **Tauri CLI** — `cargo install tauri-cli --version "^2"`

## Getting Started

```bash
# Install dependencies
npm install

# Start the app (dev mode with hot reload)
npm run tauri dev
```

## Commands

| Command | Description |
|---|---|
| `npm run tauri dev` | Start the app in development mode (Vite HMR + Rust hot rebuild) |
| `npm run tauri build` | Build the production .app bundle + DMG |
| `npm run dev` | Start only the Vite frontend dev server (no Tauri) |
| `npm run build` | Build only the frontend |
| `npx tsc --noEmit` | Type-check the frontend |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Type-check the Rust backend |

## Stopping a Running Dev Server

```bash
# Option 1: Ctrl+C in the terminal running tauri dev

# Option 2: Kill from another terminal
pkill -f "target/debug/plate"
lsof -ti:1420 | xargs kill
```

## Project Structure

```
plate/
├── src/                          # React frontend
│   ├── pages/                    # Route pages (Record, Library, Notes, Settings)
│   ├── components/
│   │   ├── layout/               # Sidebar, Layout
│   │   ├── recording/            # RecordingControls, AudioSourcePicker, Waveform, LiveTranscript
│   │   ├── transcripts/          # TranscriptList, TranscriptViewer
│   │   ├── notes/                # NotesList, NoteViewer, GenerateNotesButton
│   │   └── settings/             # SettingsPage, ModelProviderConfig, TranscriptionConfig
│   ├── hooks/                    # useRecording, useTranscript, useNotes, useSettings
│   ├── stores/                   # Zustand store (recording state, audio source, UI state)
│   └── lib/                      # Typed Tauri invoke/listen wrappers, TypeScript interfaces
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── audio/                # Microphone (cpal), system audio (ScreenCaptureKit), recorder
│   │   ├── transcription/        # TranscriptionEngine trait, whisper-rs, OpenAI Whisper API, model manager
│   │   ├── llm/                  # LlmProvider trait, Claude session token client, Claude API client, prompts
│   │   ├── db/                   # SQLite schema, CRUD for recordings/transcripts/notes/settings
│   │   ├── commands/             # Tauri command handlers (recording, transcript, notes, settings, audio)
│   │   ├── state.rs              # AppState (recording state, data dir, settings cache)
│   │   └── lib.rs                # App builder, plugin + command registration
│   ├── Cargo.toml
│   └── tauri.conf.json
│
└── migrations/                   # SQLite migrations
    └── 001_initial.sql
```

## Architecture

```
┌─────────────────────────────────────┐
│         React Frontend (WebView)    │
│  Record │ Library │ Notes │ Settings│
└────────────────┬────────────────────┘
                 │ invoke() / listen()
┌────────────────▼────────────────────┐
│         Tauri Commands (Rust)       │
├─────────────────────────────────────┤
│ audio/         │ Mic (cpal) + System audio (ScreenCaptureKit) → WAV │
│ transcription/ │ whisper-rs (local) or OpenAI API (cloud) → Transcript │
│ llm/           │ Claude session token or API → Memorization notes │
│ db/            │ SQLite: recordings, transcripts, notes, settings │
└─────────────────────────────────────┘
```

## Configuration

All configuration is done in the **Settings** page within the app:

**LLM Provider (Claude)**
- **Session Token mode** — paste your `sessionKey` from claude.ai browser cookies (Developer Tools > Application > Cookies). Uses your existing Claude subscription, no API key needed.
- **API Key mode** — paste your Anthropic API key (`sk-ant-...`). Select model (Sonnet 4, Opus 4, Haiku 3.5).

**Transcription**
- **Local (Whisper)** — runs whisper.cpp offline. Choose model size: tiny (39MB, fastest) through large (1.5GB, most accurate). Models download on first use.
- **OpenAI API** — requires OpenAI API key. Faster and more accurate, but requires internet.

**Audio**
- Sample rate: 16kHz (recommended), 44.1kHz, or 48kHz.

## macOS Permissions

On first use, the app will request:
- **Microphone access** — for recording IRL lectures
- **Screen Recording permission** — for capturing system audio from Zoom/other apps (uses ScreenCaptureKit, not actual screen recording)

Grant these in **System Settings > Privacy & Security**.

## License

Private project.
