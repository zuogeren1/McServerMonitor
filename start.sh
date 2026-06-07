#!/usr/bin/env bash
set -e

PID=$(lsof -ti :9000 2>/dev/null || true)
if [ -n "$PID" ]; then
    echo -e "\033[33mPort 9000 is in use by PID $PID, killing...\033[0m"
    kill -9 $PID 2>/dev/null || true
    sleep 1
    echo -e "\033[32mOld process terminated.\033[0m"
fi

VENV=".venv"
if [ ! -d "$VENV" ]; then
    echo -e "\033[36mCreating venv...\033[0m"
    python3 -m venv "$VENV"
fi

if [ -f "$VENV/bin/python" ]; then
    PY="$VENV/bin/python"
    PIP="$VENV/bin/pip"
else
    PY="$VENV/Scripts/python"
    PIP="$VENV/Scripts/pip"
fi

echo -e "\033[36mChecking dependencies...\033[0m"
$PY -c "import flask" 2>/dev/null || {
    echo -e "\033[36mInstalling dependencies...\033[0m"
    $PIP install -r requirements.txt
}

echo ""
echo -e "\033[32mMC Server Monitor\033[0m"
echo -e "\033[33mURL: http://localhost:9000\033[0m"
echo ""
echo "[1] Foreground (console stays open with logs)"
echo "[2] Background  (close console, server keeps running)"
echo ""

read -p "Select (1/2): " choice
case "$choice" in
    1)
        echo -e "\033[90mStarting in foreground... Press Ctrl+C to stop.\033[0m"
        exec $PY app.py
        ;;
    2)
        echo -e "\033[36mStarting in background...\033[0m"
        nohup $PY app.py > /dev/null 2>&1 &
        echo -e "\033[32mServer started (PID: $!). You may close this terminal.\033[0m"
        ;;
    *)
        echo -e "\033[31mInvalid choice.\033[0m"
        exit 1
        ;;
esac
