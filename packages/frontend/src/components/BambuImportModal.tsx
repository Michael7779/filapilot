import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BambuImportSummary, BambuLoginResult, BambuPreview, BambuRegion } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

type Step = "login" | "code" | "preview" | "result";

interface BambuImportModalProps {
  inventoryId: string;
  inventoryName: string;
  onClose: () => void;
  // Nach einem Import, damit die Spulenliste neu geladen wird
  onImported: () => void;
}

const REGIONS: BambuRegion[] = ["global", "china"];
const inputClass = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

// Liest eine gespeicherte Filamentliste: entweder das Feld "hits" oder direkt eine Liste (auch in "data" verpackt).
function hitsFromJson(text: string): unknown[] | null {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    const inner = typeof record.data === "object" && record.data !== null ? (record.data as Record<string, unknown>) : record;
    return Array.isArray(inner.hits) ? inner.hits : null;
  }
  return null;
}

export function BambuImportModal({ inventoryId, inventoryName, onClose, onImported }: BambuImportModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const base = `/inventories/${inventoryId}/bambu-import`;
  const [step, setStep] = useState<Step>("login");
  const [region, setRegion] = useState<BambuRegion>("global");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<BambuPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updateExisting, setUpdateExisting] = useState(false);
  const [summary, setSummary] = useState<BambuImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;

  // Beim Schliessen die Sitzung (und damit das Bambu-Token) auf dem Server verwerfen.
  function close(): void {
    if (sessionRef.current && step !== "result") {
      apiRequest(`${base}/${sessionRef.current}`, { method: "DELETE" }).catch(() => undefined);
    }
    onClose();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("bambu.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(id: string): Promise<void> {
    const data = await apiRequest<BambuPreview>(`${base}/${id}/preview`);
    setSessionId(id);
    setPreview(data);
    setSelected(new Set(data.rows.filter((row) => !row.alreadyImported && (row.status === 0 || row.status === null)).map((row) => row.cloudId)));
    setStep("preview");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await run(async () => {
      const result = await apiRequest<BambuLoginResult>(`${base}/login`, {
        method: "POST",
        body: JSON.stringify({ account: account.trim(), password, region })
      });
      // Das Passwort wird sofort verworfen - der Server speichert es nie.
      setPassword("");
      if (result.status === "tfa_unsupported") {
        setError(t("bambu.tfaUnsupported"));
      } else if (result.status === "code_required" && result.sessionId) {
        setSessionId(result.sessionId);
        setStep("code");
      } else if (result.sessionId) {
        await loadPreview(result.sessionId);
      }
    });
  }

  async function handleCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId) {
      return;
    }
    await run(async () => {
      await apiRequest<BambuLoginResult>(`${base}/verify`, { method: "POST", body: JSON.stringify({ sessionId, code: code.trim() }) });
      await loadPreview(sessionId);
    });
  }

  async function handleResend(): Promise<void> {
    if (!sessionId) {
      return;
    }
    await run(async () => {
      await apiRequest(`${base}/resend`, { method: "POST", body: JSON.stringify({ sessionId }) });
      setNotice(t("bambu.resent"));
    });
  }

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    await run(async () => {
      let hits: unknown[] | null;
      try {
        hits = hitsFromJson(await file.text());
      } catch {
        hits = null;
      }
      if (!hits) {
        throw new ApiRequestError("VALIDATION_ERROR", t("bambu.fileInvalid"));
      }
      const result = await apiRequest<BambuLoginResult>(`${base}/file`, { method: "POST", body: JSON.stringify({ hits }) });
      if (result.sessionId) {
        await loadPreview(result.sessionId);
      }
    });
  }

  async function handleImport(): Promise<void> {
    if (!sessionId) {
      return;
    }
    await run(async () => {
      setSummary(
        await apiRequest<BambuImportSummary>(`${base}/${sessionId}/import`, {
          method: "POST",
          body: JSON.stringify({ cloudIds: [...selected], updateExisting })
        })
      );
      setStep("result");
      onImported();
    });
  }

  function toggle(cloudId: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cloudId)) {
        next.delete(cloudId);
      } else {
        next.add(cloudId);
      }
      return next;
    });
  }

  const regionLabel = (value: BambuRegion): string => t(`bambu.region.${value}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[640px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("bambu.title", { name: inventoryName })}</h2>

        {step === "login" && (
          <form onSubmit={(event) => void handleLogin(event)} className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-secondary)]">{t("bambu.intro")}</p>
            <label className={labelClass}>
              {t("bambu.account")}
              <input type="text" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              {t("bambu.password")}
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              {t("bambu.regionLabel")}
              <select value={region} onChange={(event) => setRegion(event.target.value as BambuRegion)} className={inputClass}>
                {sortAlphabetically(REGIONS, regionLabel, i18n.language).map((value) => (
                  <option key={value} value={value}>
                    {regionLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">{t("bambu.privacy")}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                {t("bambu.useFile")}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy || !account.trim() || !password}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {busy ? t("common.loading") : t("bambu.signIn")}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={(event) => void handleCode(event)} className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-secondary)]">{t("bambu.codeHint")}</p>
            <label className={labelClass}>
              {t("bambu.code")}
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className={inputClass} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResend()}
                className="text-xs font-medium disabled:opacity-60"
                style={{ color: "var(--accent)" }}
              >
                {t("bambu.resend")}
              </button>
              <div className="flex gap-2">
              <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy || code.trim().length < 4}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {t("bambu.continue")}
              </button>
              </div>
            </div>
          </form>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t("bambu.found", { count: preview.rows.length })}
              {preview.skipped > 0 && ` ${t("bambu.skippedEntries", { count: preview.skipped })}`}
            </p>
            <div className="flex gap-3 text-xs font-medium" style={{ color: "var(--accent)" }}>
              <button type="button" onClick={() => setSelected(new Set(preview.rows.filter((row) => !row.alreadyImported).map((row) => row.cloudId)))}>
                {t("bambu.selectNew")}
              </button>
              <button type="button" onClick={() => setSelected(new Set())}>
                {t("bambu.selectNone")}
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {preview.rows.map((row) => (
                <li key={row.cloudId} className="border-t border-[var(--color-border)] first:border-t-0">
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                    <input type="checkbox" checked={selected.has(row.cloudId)} onChange={() => toggle(row.cloudId)} />
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]"
                      style={{ backgroundColor: row.colorHex ?? "#cccccc" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {row.vendor} {row.materialName} · {row.colorName}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-text-muted)]">
                        {row.remainingG} g / {row.totalG} g
                        {row.deviceName && row.inPrinter ? ` · ${row.deviceName}` : ""}
                        {!row.manufacturerExists ? ` · ${t("bambu.newManufacturer")}` : ""}
                        {row.status !== null && row.status !== 0 ? ` · ${t("bambu.otherStatus", { status: row.status })}` : ""}
                      </span>
                    </span>
                    {row.alreadyImported && (
                      <span className="shrink-0 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">{t("bambu.alreadyImported")}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} />
              {t("bambu.updateExisting")}
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">{t("bambu.mappingHint")}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void handleImport()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {t("bambu.importCount", { count: selected.size })}
              </button>
            </div>
          </div>
        )}

        {step === "result" && summary && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t("bambu.result", { created: summary.created, updated: summary.updated, skipped: summary.skipped })}</p>
            {(summary.manufacturersCreated > 0 || summary.materialsCreated > 0) && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {t("bambu.createdCatalog", { manufacturers: summary.manufacturersCreated, materials: summary.materialsCreated })}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
                {t("common.close")}
              </button>
            </div>
          </div>
        )}

        {notice && <p className="text-sm text-[var(--color-text-secondary)]">{notice}</p>}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </div>
  );
}
