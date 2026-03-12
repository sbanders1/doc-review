---
name: launch
description: Launch the application dev server in the current directory. Use when the user wants to start, run, or launch the app.
user-invocable: true
allowed-tools: Bash
---

# Launch Dev Server

Start the Vite dev server for this project. Run it in the background so the conversation can continue.

## Steps

1. First check if a dev server is already running on port 5173:
   ```bash
   lsof -i :5173 2>/dev/null
   ```
   If something is already running, inform the user and ask if they want to restart it.

2. Launch the dev server in the background using Bash with `run_in_background: true`:
   ```bash
   source ~/.nvm/nvm.sh && npm run dev
   ```

3. Remind the user they can access the app via SSH port forwarding:
   `ssh -L 5173:localhost:5173 sanderson@<host>`
