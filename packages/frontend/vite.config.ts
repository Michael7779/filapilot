import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { parseChangelog } from "@filapilot/shared";

// Fester, relativer Pfad zur Root-package.json - kein User-Input, kein Path-Traversal-Risiko.
const rootPackageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
// eslint-disable-next-line security/detect-non-literal-fs-filename
const appVersion = (JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as { version: string })
  .version;

// Aenderungsverlauf der App: wird beim Bauen aus dem CHANGELOG.md im Projektstamm erzeugt (fester relativer Pfad).
const changelogPath = fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url));
// eslint-disable-next-line security/detect-non-literal-fs-filename
const changelog = parseChangelog(readFileSync(changelogPath, "utf8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CHANGELOG__: JSON.stringify(changelog)
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "FilaPilot",
        short_name: "FilaPilot",
        description: "Filament-Verwaltung fuer 3D-Drucker",
        theme_color: "#2F6FED",
        background_color: "#FAFAF8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": { target: "http://localhost:4000", ws: true }
    }
  }
});
