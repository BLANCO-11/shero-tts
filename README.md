# Shero-TTS

Shero-TTS is a real-time neural text-to-speech synthesis suite featuring a FastAPI backend and a Next.js frontend interface. It is powered by Kyutai's Pocket-TTS engine (100M parameter CALM model) and supports both high-quality built-in voices and zero-shot voice cloning capabilities.

---

## 🚀 Quick Start with Docker (Recommended)

The easiest way to run the entire suite (FastAPI backend + Next.js frontend) is using Docker Compose.

### Prerequisites
- Docker and Docker Compose installed.
- A Hugging Face token (with access terms accepted at [kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts) to enable zero-shot voice cloning weights).

### Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/BLANCO-11/shero-tts.git
   cd shero-tts
   ```

2. **Configure Environment Variables:**
   Copy the example environment file and add your Hugging Face access token:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and set your `HF_TOKEN`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.

3. **Launch the Suite:**
   ```bash
   docker compose up --build -d
   ```

4. **Verify Application Status:**
   - **Frontend Dashboard:** [http://localhost:6768](http://localhost:6768)
   - **Backend API Docs:** [http://localhost:6767/docs](http://localhost:6767/docs)
   - **Backend Health Check:** [http://localhost:6767/health](http://localhost:6767/health)

---

## 🛠️ Local Development Setup

If you prefer to run the application components natively on your host machine:

### Backend Setup
1. **Initialize Virtual Environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. **Install Dependencies:**
   Ensure system dependencies like `libsndfile` are installed:
   - *Ubuntu/Debian:* `sudo apt-get install -y libsndfile1 ffmpeg`
   - *macOS:* `brew install libsndfile ffmpeg`
   
   Install Python packages:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
3. **Configure Environment:**
   Ensure you have a `.env` file containing your configurations in the root directory (based on `.env.example`).
4. **Run Backend Daemon:**
   ```bash
   python main.py
   ```
   The backend will start listening on port `6767`.

### Frontend Setup
1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```
2. **Install Node Packages:**
   ```bash
   npm install
   ```
3. **Run Development Server:**
   ```bash
   npm run dev
   ```
   The Next.js dashboard will be accessible at [http://localhost:6768](http://localhost:6768).

---

## 📂 Repository Structure

```
shero-tts/
├── .env.example              # Template for environment variables (HF_TOKEN, credentials)
├── .gitignore                # Configured to ignore .venv, node_modules, logs, and database
├── Dockerfile.backend        # CPU-optimized PyTorch container build for the API
├── docker-compose.yml        # Multi-service stack (Frontend + Backend + Volumes)
├── requirements.txt          # Python dependency list
├── main.py                   # FastAPI backend server logic
├── db_manager.py             # SQLite credentials and API key manager
├── api_usage.md              # Backend endpoint specifications & curl examples
├── start_service.sh          # Shell utility to start services locally in the background
├── stop_service.sh           # Shell utility to stop background service daemons
├── voices/                   # Audio profiles directory
│   ├── custom/               # User cloned voice states (kept in Git via .gitkeep)
│   └── voice-zero/           # Pre-cloned references for zero-shot synthesis
└── frontend/                 # Next.js frontend dashboard source
    ├── Dockerfile            # Multi-stage production container build
    ├── next.config.ts        # Next.js configurations with proxy routing
    ├── package.json          # Node scripts and dependency definitions
    └── app/                  # Next.js pages and routes
```

---

## 📤 Publishing to GitHub/Gitlab

To publish this codebase to your own remote repository:

1. **Verify Git Initialization & Files:**
   Since Git is initialized, verify untracked files are correctly ignored:
   ```bash
   git status
   ```

2. **Stage and Commit all files:**
   ```bash
   git add .
   git commit -m "chore: initial commit with dockerization, requirements, and git settings"
   ```

3. **Link your Remote Repository:**
   ```bash
   git remote add origin https://github.com/BLANCO-11/shero-tts.git
   ```

4. **Push to main branch:**
   ```bash
   git branch -M main
   git push -u origin main
   ```

---

## 🔒 Security Note

- **Never commit `.env` or `shero_tts.db`** files as they contain your production database and secret Hugging Face tokens. They are ignored automatically by the `.gitignore` setup.
- Always use the `.env.example` file to configure custom credentials in new environments.
