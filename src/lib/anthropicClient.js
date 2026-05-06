import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// The Cornerstone Claude proxy fronts Vertex AI and handles auth itself, so
// no Google credentials are needed. We pass a no-op authClient to keep the
// SDK from trying to mint a Google access token. (The google-auth-library
// import is also aliased to a stub in vite.config.js so its Node-only deps
// don't end up in the browser bundle.)
const NOOP_AUTH_CLIENT = {
  async getRequestHeaders() { return {}; },
  projectId: null,
};

export function createClient() {
  return new AnthropicVertex({
    region: 'us',
    projectId: 'cr-data-science-dev-gemini-01',
    baseURL: `${window.location.origin}/claude-proxy`,
    authClient: NOOP_AUTH_CLIENT,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      'x-cr-username': 'test@cornerstone.com',
      'x-cr-project': 'checkmate-grandmaster',
      'x-cr-tool': 'checkmate-grandmaster',
    },
  });
}
