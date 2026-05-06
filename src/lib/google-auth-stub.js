// Browser-side stub for google-auth-library. The real package depends on
// node:events / node:https / etc. Our reverse Claude proxy handles auth, so
// the SDK never actually needs Google credentials — we replace the package
// with this no-op shim via vite.config.js `resolve.alias`.
export class GoogleAuth {
  constructor() {}
  async getClient() {
    return {
      async getRequestHeaders() { return {}; },
      projectId: null,
    };
  }
}
