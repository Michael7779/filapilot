import type { BambuRegion } from "@filapilot/shared";
import { BAMBU_MAX_SPOOLS } from "@filapilot/shared";
import { logger } from "../logger.js";

// Zugriff auf die inoffizielle Bambu-Cloud-Schnittstelle (dieselbe, die Bambu Studio nutzt). Die Ziel-Adressen sind fest
// (nie vom Client) - es gibt nur die Auswahl global/china. Antwort-Inhalte, Passwort und Token werden nie geloggt.

const BASE_URL: Record<BambuRegion, string> = {
  global: "https://api.bambulab.com",
  china: "https://api.bambulab.cn"
};
const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const USER_AGENT = "bambu_network_agent/01.09.05.01";

export type BambuErrorKind = "credentials" | "unauthorized" | "blocked" | "network" | "invalid_response";

// Diagnose-Angaben zu einem Fehler: in welchem Schritt, mit welchem HTTP-Status und welche Feldnamen (nie Werte) die Antwort hatte.
export interface BambuErrorDetail {
  step: string;
  status?: number;
  keys?: string[];
}

// Bewusst ohne Antwort-Text: nur die Art des Fehlers und die Diagnose-Angaben.
export class BambuCloudError extends Error {
  constructor(
    public readonly kind: BambuErrorKind,
    public readonly detail?: BambuErrorDetail
  ) {
    super(`Bambu-Cloud: ${kind}`);
    this.name = "BambuCloudError";
  }
}

export type BambuLoginOutcome = { kind: "ok"; token: string } | { kind: "code_required" } | { kind: "tfa_required" };

export interface BambuCloudClient {
  login(region: BambuRegion, account: string, password: string): Promise<BambuLoginOutcome>;
  sendCode(region: BambuRegion, account: string): Promise<void>;
  loginWithCode(region: BambuRegion, account: string, code: string): Promise<string>;
  // Roh-Eintraege der Spulenliste (werden vom Aufrufer per Zod geprueft)
  listFilaments(region: BambuRegion, token: string): Promise<unknown[]>;
}

interface RawResponse {
  status: number;
  json: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface RequestOptions {
  step: string;
  body?: unknown;
  token?: string;
  // Antworten ohne (oder mit nicht lesbarem) JSON-Inhalt gelten dann als leer, statt als Fehler
  lenient?: boolean;
}

async function request(method: "GET" | "POST", url: string, options: RequestOptions): Promise<RawResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    throw new BambuCloudError("network", { step: options.step });
  }
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  // Cloudflare (Bot-Schutz) antwortet mit einer HTML-Seite oder 403 statt mit JSON.
  if (response.status === 403 || contentType.includes("text/html")) {
    throw new BambuCloudError("blocked", { step: options.step, status: response.status });
  }
  let parsed: unknown = {};
  try {
    parsed = text.trim() === "" && options.lenient ? {} : JSON.parse(text);
  } catch {
    if (!options.lenient) {
      throw new BambuCloudError("invalid_response", { step: options.step, status: response.status });
    }
  }
  return { status: response.status, json: asRecord(parsed) };
}

function invalid(step: string, status: number, json: Record<string, unknown>): BambuCloudError {
  return new BambuCloudError("invalid_response", { step, status, keys: Object.keys(json).slice(0, 12) });
}

function tokenFrom(json: Record<string, unknown>): string | null {
  return typeof json.accessToken === "string" && json.accessToken.length > 0 ? json.accessToken : null;
}

export const httpBambuCloudClient: BambuCloudClient = {
  async login(region, account, password) {
    const { status, json } = await request("POST", `${BASE_URL[region]}/v1/user-service/user/login`, {
      step: "Anmeldung",
      body: { account, password }
    });
    const token = tokenFrom(json);
    if (token) {
      return { kind: "ok", token };
    }
    if (json.loginType === "verifyCode") {
      return { kind: "code_required" };
    }
    if (json.loginType === "tfa") {
      return { kind: "tfa_required" };
    }
    throw new BambuCloudError("credentials", { step: "Anmeldung", status, keys: Object.keys(json).slice(0, 12) });
  },

  async sendCode(region, account) {
    // Erfolg heisst HTTP 2xx - der Inhalt der Antwort ist leer oder uneinheitlich (die Schnittstelle ist nicht dokumentiert).
    const { status, json } = await request("POST", `${BASE_URL[region]}/v1/user-service/user/sendemail/code`, {
      step: "E-Mail-Code senden",
      body: { email: account, type: "codeLogin" },
      lenient: true
    });
    if (status >= 400 || json.success === false) {
      throw invalid("E-Mail-Code senden", status, json);
    }
  },

  async loginWithCode(region, account, code) {
    const { status, json } = await request("POST", `${BASE_URL[region]}/v1/user-service/user/login`, {
      step: "Anmeldung mit Code",
      body: { account, code }
    });
    const token = tokenFrom(json);
    if (!token) {
      throw new BambuCloudError("credentials", { step: "Anmeldung mit Code", status, keys: Object.keys(json).slice(0, 12) });
    }
    return token;
  },

  async listFilaments(region, token) {
    const collected: unknown[] = [];
    let total = 0;
    for (let offset = 0; offset < BAMBU_MAX_SPOOLS; offset += PAGE_SIZE) {
      const { status, json } = await request(
        "GET",
        `${BASE_URL[region]}/v1/design-user-service/my/filament/v2?offset=${offset}&limit=${PAGE_SIZE}`,
        { step: "Spulenliste", token }
      );
      if (status === 401) {
        throw new BambuCloudError("unauthorized", { step: "Spulenliste", status });
      }
      if (status >= 400 || !Array.isArray(json.hits)) {
        throw invalid("Spulenliste", status, json);
      }
      collected.push(...json.hits);
      total = typeof json.total === "number" ? json.total : collected.length;
      if (json.hits.length < PAGE_SIZE || collected.length >= total) {
        break;
      }
    }
    // Eine unvollstaendige Liste darf nie als vollstaendig gelten (der Abgleich archiviert sonst zu Unrecht).
    if (collected.length < total) {
      throw new BambuCloudError("invalid_response", { step: "Spulenliste (unvollständig)" });
    }
    return collected;
  }
};

let activeClient: BambuCloudClient = httpBambuCloudClient;

export function getBambuCloudClient(): BambuCloudClient {
  return activeClient;
}

// Nur fuer Tests: ersetzt den echten Zugriff durch einen Mock.
export function setBambuCloudClientForTests(client: BambuCloudClient | null): void {
  activeClient = client ?? httpBambuCloudClient;
}

// Nur Art, Schritt, HTTP-Status und Feldnamen - nie Inhalte der Antwort, Passwort oder Token.
export function logBambuFailure(err: unknown): void {
  logger.warn("Bambu-Cloud-Anfrage fehlgeschlagen", {
    kind: err instanceof BambuCloudError ? err.kind : "unbekannt",
    step: err instanceof BambuCloudError ? err.detail?.step : undefined,
    status: err instanceof BambuCloudError ? err.detail?.status : undefined,
    keys: err instanceof BambuCloudError ? err.detail?.keys : undefined
  });
}
