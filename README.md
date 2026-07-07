<p align="center">
  <img src="public/favicon.svg" width="64" height="64" alt="Sticherr Logo" />
</p>

<h1 align="center">Sticherr</h1>

<p align="center">
  <b>AI-Powered Image Editor with Non-Destructive Layer Compositing</b>
  <b>https://sticherr.netlify.app/</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express" />
  <img src="https://img.shields.io/badge/License-Source_Available-blue?style=flat-square" />
</p>

<p align="center">
  A browser-based image editing workspace that combines AI generation with a full-featured canvas editor.<br/>
  Select a region, describe what you want, and Sticherr seamlessly composites AI-generated edits into your image.
</p>

---

## ✨ Features

### 🎨 Canvas Editor
- **Region Selection** — Click and drag to define edit areas with visual dimension labels
- **Zoom & Pan** — Scroll to zoom, space+drag to pan, fit-to-screen button
- **Live Preview** — Real-time composited preview of all layers and edits

### 🧠 AI Generation
- **3 Model Tiers** — Choose from NB (fast), NB 2 (high fidelity), or NB PRO (studio-quality 4K)
- **Smart Prompting** — Built-in system prompt enforces seamless in-place editing (matches lighting, perspective, textures)
- **Resolution Control** — Auto, 1K, 2K, or 4K output
- **Reference Images** — Upload entity references (characters, assets, logos, locations) and `@mention` them in prompts

### 🔲 Non-Destructive Layer System
- **Layer Stack** — Each generation creates a new layer; reorder, show/hide, or delete freely
- **Per-Layer Controls:**
  - Opacity & feather radius
  - Brightness, contrast, saturation adjustments
  - Horizontal/vertical flip
  - Transform (move & resize)
  - Crop insets (top, bottom, left, right)
- **Alpha Masking** — Mask/unmask tools for per-layer visibility with quick-mask red overlay

### 🖌️ Paint Tools
- **Brush** — Adjustable size, color, opacity, and hardness falloff
- **Eraser** — Reduce alpha with configurable settings
- **Mask / Unmask** — Edit layer visibility masks directly on canvas
- **Undo/Redo** — 50-level undo stack with Ctrl+Z / Ctrl+Y

### 📁 Project Management
- **Auto-Save** — 3-second debounced saves after any change
- **Project Browser** — Create, rename, duplicate, search, and switch between projects
- **Import/Export** — Portable `.dmd` project files with all images embedded as base64
- **Dual Storage** — Works client-side only (IndexedDB) or with the Express server (filesystem)

### 🎛️ Advanced Settings
- **Seed Control** — Set specific seeds for reproducible generations
- **Safety Tolerance** — 4-level content filter (Block Most → Allow Most)
- **Web Search Grounding** — Enable live search to guide generation context

### 🌓 Theming
- **Dark & Light Mode** — Full theme system with smooth transitions
- **Theme-Aware UI** — All toolbars, modals, and controls adapt to the active theme

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ 
- An API key from [Floyo AI](https://floyo.ai)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/Bexx1107/sticherr.git
cd sticherr

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The editor opens at **http://localhost:3002**

> **Tip:** You can also run `./start.sh` which auto-installs dependencies if missing.

### Enter Your API Key

Paste your Floyo API key in the sidebar input. It's stored locally in your browser's `localStorage` — never sent anywhere except Floyo's API with your requests.

---

## 🏗️ Architecture

```
sticherr/
├── index.html                        # SPA entry point
├── server.js                         # Express 5 production server
├── start.sh                          # Auto-install + launch script
├── vite.config.js                    # Dev server, proxies, plugins
│
├── src/
│   ├── App.jsx                       # Root layout: sidebar + workspace
│   ├── main.jsx                      # React entry + error boundary
│   ├── index.css                     # Design system: tokens, themes, components
│   │
│   ├── lib/
│   │   ├── api.js                    # IndexedDB client-side storage (serverless mode)
│   │   ├── floyo.js                  # Floyo API: submit → poll → download pipeline
│   │   ├── workflows.js             # ComfyUI workflow graph builders
│   │   ├── constants.js             # Model definitions & entity prompt templates
│   │   ├── imageUtils.js            # Resize, download, aspect ratio detection
│   │   ├── useStitcherProject.js    # Project lifecycle hook (CRUD, auto-save, import/export)
│   │   ├── usePersistedState.js     # localStorage & IndexedDB persistence hooks
│   │   └── usageTracker.js          # API call logging
│   │
│   └── components/
│       ├── Shared.jsx                # ImageUpload, ApiKeyInput, ErrorBanner, LoadingButton
│       ├── ErrorBoundary.jsx         # React error boundary wrapper
│       └── studio/
│           ├── StitcherSubTab.jsx    # Main canvas editor (layers, paint, compositing, zoom)
│           ├── AdvancedSettings.jsx  # Seed, safety, web search config panel
│           ├── MentionTextarea.jsx   # @mention autocomplete with syntax highlighting
│           └── ProjectBrowser.jsx    # Project list, search, load/delete modal
│
└── public/
    ├── favicon.svg
    └── _redirects                    # SPA routing for static hosts
```

---

## 🔧 Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Dev** | `npm run dev` | Start Vite dev server with HMR on port 3002 |
| **Build** | `npm run build` | Production build to `dist/` |
| **Server** | `npm run server` | Start Express production server |
| **Lint** | `npm run lint` | Run ESLint |

---

## 🖥️ Production Server

The Express server (`server.js`) provides filesystem-based project storage for production deployments:

- **Project CRUD API** — Full REST endpoints for create, read, update, delete
- **Image Serving** — Streams source images, layers, references, and auto-generated thumbnails
- **Import/Export** — Upload and download `.dmd` project bundles
- **Session Management** — File-based sessions with auto-generated crypto secrets
- **Thumbnail Generation** — Server-side 400px JPEG thumbnails via [Sharp](https://sharp.pixelplumbing.com/)

```bash
# Build + serve in production
npm run build
npm run server
```

> **Note:** Without the Express server, the app runs fully client-side using IndexedDB for storage.

---

## 📐 How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Upload      │     │  Select      │     │  Prompt          │
│  Source      │────▶│  Edit        │────▶│  & Generate      │
│  Image       │     │  Region      │     │  (AI fills area) │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                                   ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │  Composite    │◀────│  New Layer       │
                    │  & Export     │     │  Created         │
                    └──────────────┘     └─────────────────┘
```

1. **Upload** a source image
2. **Select** the region you want to edit by dragging on the canvas
3. **Write a prompt** describing the desired change — use `@mentions` to reference uploaded entities
4. **Generate** — the AI creates an edit that matches the style, lighting, and perspective of your image
5. **Refine** — adjust opacity, feathering, masking, and color correction per layer
6. **Export** — download the final composited result or save the project for later

---

## 🔑 Reference Images & @Mentions

Upload reference images to maintain visual consistency across edits. Name them, and then `@mention` them directly in your prompt:

- **Upload** a reference image and give it a name (e.g. "RedCar", "John", "CompanyLogo")
- **Mention** it in your prompt: *"Add @John sitting on the bench"* or *"Place @RedCar in the driveway"*
- The AI receives the reference image alongside your prompt to preserve the exact appearance

References work great for characters, objects, logos, environments — anything you want the AI to reproduce faithfully.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 19 |
| **Build Tool** | Vite 8 |
| **Styling** | Tailwind CSS 4 + custom design tokens |
| **Icons** | Lucide React |
| **Canvas** | HTML5 Canvas 2D API |
| **Client Storage** | IndexedDB + localStorage |
| **Server** | Express 5 |
| **Image Processing** | Sharp (server), Canvas API (client) |
| **AI Backend** | Floyo AI API |

---

## 📄 License

Source available — free to download and use, but modifications and redistribution are not permitted. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ✂️ by the Sticherr team</sub>
</p>
