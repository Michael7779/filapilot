import { z } from "zod";

export const BAMBU_MAX_SPOOLS = 1000;
export const BAMBU_MAX_IMPORT = 500;

export const bambuRegionSchema = z.enum(["global", "china"]);
export type BambuRegion = z.infer<typeof bambuRegionSchema>;

export const bambuLoginInputSchema = z.object({
  account: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
  region: bambuRegionSchema,
  // Verbindung fuer dieses Lager merken (nur Besitzer)
  remember: z.boolean().default(false)
});
export type BambuLoginInput = z.infer<typeof bambuLoginInputSchema>;

export const bambuVerifyInputSchema = z.object({
  sessionId: z.string().min(10).max(100),
  code: z.string().trim().min(4).max(12)
});
export type BambuVerifyInput = z.infer<typeof bambuVerifyInputSchema>;

export const bambuResendInputSchema = z.object({ sessionId: z.string().min(10).max(100) });
export type BambuResendInput = z.infer<typeof bambuResendInputSchema>;

// Ausweichweg: die Filamentliste (Antwort von .../my/filament/v2 oder nur das "hits"-Feld) als JSON.
export const bambuFileInputSchema = z.object({ hits: z.array(z.unknown()).max(BAMBU_MAX_SPOOLS) });
export type BambuFileInput = z.infer<typeof bambuFileInputSchema>;

export const bambuImportInputSchema = z.object({
  cloudIds: z.array(z.string().min(1).max(64)).min(1).max(BAMBU_MAX_IMPORT),
  updateExisting: z.boolean().default(false)
});
export type BambuImportInput = z.infer<typeof bambuImportInputSchema>;

// Eine Spule der Bambu-Cloud, nur die Felder, die FilaPilot braucht. Alles andere wird ignoriert.
export const bambuSpoolSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1).max(64)]).transform((value) => String(value)),
  filamentVendor: z.string().max(120).nullish(),
  filamentType: z.string().max(60).nullish(),
  filamentName: z.string().max(120).nullish(),
  color: z.string().max(20).nullish(),
  netWeight: z.number().finite().nullish(),
  totalNetWeight: z.number().finite().nullish(),
  status: z.number().int().nullish(),
  inPrinter: z.boolean().nullish(),
  deviceName: z.string().max(120).nullish()
});
export type BambuSpool = z.infer<typeof bambuSpoolSchema>;

export interface BambuConnectionInfo {
  connected: boolean;
  region: BambuRegion | null;
  connectedByName: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncSummary: string | null;
}

export interface BambuSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  restored: number;
  archived: number;
  skipped: number;
  // true = ungewoehnlich viele oder alle Spulen fehlten in der Cloud, es wurde bewusst nichts archiviert
  archiveBlocked: boolean;
  manufacturersCreated: number;
  materialsCreated: number;
}

export interface BambuLoginResult {
  status: "ok" | "code_required" | "tfa_unsupported";
  sessionId: string | null;
}

export interface BambuPreviewRow {
  cloudId: string;
  vendor: string;
  materialName: string;
  colorHex: string | null;
  colorName: string;
  remainingG: number;
  totalG: number;
  status: number | null;
  inPrinter: boolean;
  deviceName: string | null;
  alreadyImported: boolean;
  manufacturerExists: boolean;
  materialExists: boolean;
}

export interface BambuPreview {
  rows: BambuPreviewRow[];
  // Eintraege der Quelle, die kein gueltiges Spulen-Format hatten
  skipped: number;
}

export interface BambuImportSummary {
  created: number;
  updated: number;
  skipped: number;
  manufacturersCreated: number;
  materialsCreated: number;
}
