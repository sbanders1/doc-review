import { AVAILABLE_MODELS, DEFAULT_MODEL } from './chat.js';

const STORAGE_KEY = 'checkmate_model';

let selectedModel = $state(localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL);

export function getModel() {
  return selectedModel;
}

export function setModel(id) {
  selectedModel = id;
  localStorage.setItem(STORAGE_KEY, id);
}

export function getModelLabel() {
  const m = AVAILABLE_MODELS.find(m => m.id === selectedModel);
  return m?.label ?? selectedModel;
}

export { AVAILABLE_MODELS };
