import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sizzleProductLabel, type SizzleWish } from "@filapilot/shared";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";
import { SizzleThumb } from "./SizzleThumb.js";

interface SizzleWishEditModalProps {
  wish: SizzleWish;
  onSave: (quantity: number, note: string | null) => Promise<void>;
  onClose: () => void;
}

const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

// Menge und Notiz eines Wunsches aendern (das Produkt selbst bleibt; dafuer den Wunsch loeschen und neu waehlen).
export function SizzleWishEditModal({ wish, onSave, onClose }: SizzleWishEditModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(String(wish.quantity));
  const [note, setNote] = useState(wish.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
      setError(t("sizzle.quantityInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed, note.trim() === "" ? null : note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wishlist.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form onSubmit={(event) => void submit(event)} className="flex max-h-[90dvh] w-full max-w-[380px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("sizzle.editWish")}</h2>
        <div className="flex items-center gap-3">
          <SizzleThumb src={wish.product.imageUrl} />
          <span className="font-medium">{sizzleProductLabel(wish.product)}</span>
        </div>
        <label className={LABEL_CLASS}>
          {t("sizzle.quantity")}
          <input type="number" min={1} max={999} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={WISHLIST_INPUT_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          {t("wishlist.note")}
          <input type="text" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className={WISHLIST_INPUT_CLASS} />
        </label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "var(--accent)" }}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
