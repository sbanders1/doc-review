import { AVAILABLE_MODELS, DEFAULT_MODEL, migrateModelId } from './chat.js';

const STORAGE_KEY = 'checkmate_model';

let selectedModel = $state(migrateModelId(localStorage.getItem(STORAGE_KEY)));

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
