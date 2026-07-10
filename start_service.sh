#!/bin/bash
# Shero-TTS Start Service Script

# Exit immediately if a command exits with a non-zero status
set -e

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo -e "${BOLD}${CYAN}===================================================${NC}"
echo -e "${BOLD}${CYAN}       SHERO-TTS SERVICE LAUNCH BROADCAST          ${NC}"
echo -e "${BOLD}${CYAN}===================================================${NC}"

BUILD_ASSETS=false
HF_ARG_TOKEN=""

# Parse flags
for arg in "$@"; do
    case $arg in
        --build)
            BUILD_ASSETS=true
            ;;
        *)
            if [ -z "$HF_ARG_TOKEN" ]; then
                HF_ARG_TOKEN="$arg"
            fi
            ;;
    esac
done

# Spinner function to run while waiting for background jobs
show_spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    tput civis 2>/dev/null || true
    while ps -p $pid > /dev/null; do
        local temp=${spinstr#?}
        printf " [${CYAN}%c${NC}] " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
    tput cnorm 2>/dev/null || true
}

# 1. Check Virtual Environment
echo -n -e " ${YELLOW}⚙${NC} Verifying Python virtual environment..."
if [ ! -d ".venv" ]; then
    echo -e " [ ${RED}✘${NC} ]"
    echo -e "${BOLD}${RED}Error: .venv virtual environment not found. Please run setup first.${NC}"
    exit 1
fi
echo -e " [ ${GREEN}✔${NC} ] Ready."

# 2. Load .env Configurations
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs 2>/dev/null)
    echo -e " ${GREEN}✔${NC} Loaded environment configurations from .env"
fi

# Override with arg token if provided
if [ ! -z "$HF_ARG_TOKEN" ]; then
    export HF_TOKEN="$HF_ARG_TOKEN"
    echo -e " ${GREEN}✔${NC} HF_TOKEN set from command argument override."
fi

# 3. Report Hugging Face Gated Weights status
if [ -z "$HF_TOKEN" ]; then
    echo -e " ${YELLOW}⚠${NC} ${YELLOW}Warning: HF_TOKEN is not configured.${NC}"
    echo -e "   Zero-shot voice cloning weights will be unavailable."
    echo -e "   To enable, set HF_TOKEN in .env or run: ./start_service.sh <token>"
else
    echo -e " ${GREEN}✔${NC} ${BOLD}HF_TOKEN detected.${NC} Zero-shot voice cloning capabilities armed."
fi

# 4. Optional: Build Production Assets
if [ "$BUILD_ASSETS" = true ]; then
    echo -n -e " ${YELLOW}⚙${NC} Compiling frontend production assets (npm run build)..."
    cd frontend
    npm run build > build.log 2>&1 &
    BUILD_PID=$!
    show_spinner $BUILD_PID
    cd ..
    
    if wait $BUILD_PID; then
        echo -e " [ ${GREEN}✔${NC} ] Assets compiled successfully!"
    else
        echo -e " [ ${RED}✘${NC} ] Compilation failed! View frontend/build.log for details."
        exit 1
    fi
fi

# 5. Start Python FastAPI Backend (Port 6767)
echo -n -e " ${YELLOW}⚙${NC} Starting neural synthesis backend daemon on port 6767..."
nohup .venv/bin/python main.py > backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > backend.pid
echo -e " [ ${GREEN}✔${NC} ] (PID: ${BOLD}$BACKEND_PID${NC})"

# 6. Start Next.js Frontend (Port 6768)
echo -n -e " ${YELLOW}⚙${NC} Starting frontend interface daemon on port 6768..."
cd frontend
nohup npm run start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo $FRONTEND_PID > frontend.pid
echo -e " [ ${GREEN}✔${NC} ] (PID: ${BOLD}$FRONTEND_PID${NC})"

# 7. Wait for endpoints to fully bind and report health status
echo -e " ${YELLOW}⚙${NC} Resolving local model loading and port binds..."

wait_for_backend() {
    local max_attempts=40
    local attempt=0
    tput civis 2>/dev/null || true
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -m 1 http://127.0.0.1:6767/health >/dev/null; then
            tput cnorm 2>/dev/null || true
            return 0
        fi
        
        # Checking spinner animation
        local spinstr='|/-\'
        local idx=$((attempt % 4))
        local char="${spinstr:$idx:1}"
        printf " [${YELLOW}%c${NC}] Synchronizing weights cache ($((attempt+1))/$max_attempts)..." "$char"
        sleep 0.5
        printf "\r\033[K"
        
        attempt=$((attempt+1))
    done
    tput cnorm 2>/dev/null || true
    return 1
}

if wait_for_backend; then
    echo -e " [ ${GREEN}✔${NC} ] Neural network online and responsive!"
    
    # Grab capability details directly from the live API
    CAPABILITY=$(curl -s http://127.0.0.1:6767/health | grep -o '"cloning_capability":"[^"]*"' | cut -d'"' -f4)
    if [ "$CAPABILITY" = "enabled" ]; then
        echo -e "     Status: ${BOLD}${GREEN}CLONING ARMED & OPERATIONAL${NC}"
    else
        echo -e "     Status: ${YELLOW}BUILT-IN ONLY (Gated Weights Unavailable)${NC}"
    fi
else
    echo -e " [ ${RED}✘${NC} ] ${BOLD}${RED}Timeout: Backend failed to bind within threshold.${NC}"
    echo -e "     Please review backend.log for error logs."
    exit 1
fi

echo -e "${BOLD}${GREEN}===================================================${NC}"
echo -e "${BOLD}${GREEN}  SHERO-TTS Mini-Service Suite started successfully! ${NC}"
echo -e "   - Backend Endpoint:  ${CYAN}http://127.0.0.1:6767${NC}"
echo -e "   - Frontend Interface: ${CYAN}http://127.0.0.1:6768${NC}"
echo -e "   - Manage Suite:       ${YELLOW}./stop_service.sh${NC}"
echo -e "${BOLD}${GREEN}===================================================${NC}"
