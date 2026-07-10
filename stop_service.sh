#!/bin/bash
# Shero-TTS Stop Service Script

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo -e "${BOLD}${CYAN}===================================================${NC}"
echo -e "${BOLD}${CYAN}       SHERO-TTS SERVICE TERMINATION BROADCAST      ${NC}"
echo -e "${BOLD}${CYAN}===================================================${NC}"

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

# Stop backend
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -n -e " ${YELLOW}⚙${NC} Terminating backend server (PID: ${BOLD}$BACKEND_PID${NC})..."
        kill $BACKEND_PID &
        show_spinner $!
        echo -e " [ ${GREEN}✔${NC} ] Stopped."
    fi
    rm -f backend.pid
fi

# Stop frontend
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -n -e " ${YELLOW}⚙${NC} Terminating Next.js frontend (PID: ${BOLD}$FRONTEND_PID${NC})...."
        kill $FRONTEND_PID &
        show_spinner $!
        echo -e " [ ${GREEN}✔${NC} ] Stopped."
    fi
    rm -f frontend.pid
fi

# Clean up lingering processes on ports 6767/6768
echo -n -e " ${YELLOW}⚙${NC} Cleaning up lingering TCP ports 6767 & 6768..."
(
    fuser -k 6767/tcp 2>/dev/null || true
    fuser -k 6768/tcp 2>/dev/null || true
) &
show_spinner $!
echo -e " [ ${GREEN}✔${NC} ] Cleared."

echo -e "${BOLD}${GREEN}===================================================${NC}"
echo -e "${BOLD}${GREEN}  SHERO-TTS Mini-Service Suite stopped successfully.${NC}"
echo -e "${BOLD}${GREEN}===================================================${NC}"
