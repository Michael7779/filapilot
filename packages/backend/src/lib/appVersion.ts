import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Fester, relativer Pfad zur Root-package.json (wie vite.config.ts es fuers Frontend macht) - kein User-Input.
const rootPackageJsonPath = fileURLToPath(new URL("../../../../package.json", import.meta.url));
// eslint-disable-next-line security/detect-non-literal-fs-filename
export const APP_VERSION: string = (JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as { version: string }).version;
