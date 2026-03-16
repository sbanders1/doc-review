const STORAGE_KEY = 'checkmate_mock_mode';

let mockMode = $state(
  typeof window !== 'undefined'
    ? (localStorage.getItem(STORAGE_KEY) ?? 'true') === 'true'
    : true
);

export function getMockMode() {
  return mockMode;
}

export function setMockMode(bool) {
  mockMode = bool;
  localStorage.setItem(STORAGE_KEY, String(bool));
}

export function toggleMockMode() {
  setMockMode(!mockMode);
}
