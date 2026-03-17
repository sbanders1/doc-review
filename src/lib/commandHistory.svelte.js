let history = $state([]);
let undoToast = $state(null);
let toastTimer = null;

/**
 * Execute a command and push it to the history stack.
 * @param {Object} command
 * @param {string} command.description - Human-readable description (e.g., "Deleted citation: 42 U.S.C. § 1983")
 * @param {Function} command.execute - Function to perform the action
 * @param {Function} command.undo - Function to reverse the action
 */
export function executeCommand(command) {
  command.execute();
  history = [...history, command];

  // Show undo toast for a limited time
  showUndoToast(command.description);
}

/**
 * Undo the most recent command.
 */
export function undo() {
  if (history.length === 0) return;
  const command = history[history.length - 1];
  command.undo();
  history = history.slice(0, -1);
  hideUndoToast();
}

/**
 * Get the current undo toast (reactive).
 */
export function getUndoToast() {
  return undoToast;
}

/**
 * Get whether undo is available.
 */
export function canUndo() {
  return history.length > 0;
}

/**
 * Clear the history (e.g., on session switch).
 */
export function clearHistory() {
  history = [];
  hideUndoToast();
}

function showUndoToast(description) {
  clearTimeout(toastTimer);
  undoToast = { description };
  // Auto-hide after 8 seconds
  toastTimer = setTimeout(() => {
    undoToast = null;
  }, 8000);
}

function hideUndoToast() {
  clearTimeout(toastTimer);
  undoToast = null;
}
