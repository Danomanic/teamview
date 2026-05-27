import { defineConfig } from 'vite';

// `base: './'` keeps asset URLs relative so the site works when GitLab serves
// project Pages from a sub-path (https://<group>.gitlab.io/<project>/).
// `publicDir: 'static'` avoids a clash with `build.outDir: 'public'` — the build
// script writes static/org.json, which Vite then copies into the published public/.
export default defineConfig({
  base: './',
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
});
