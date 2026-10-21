import { useTranslation } from "react-i18next";
import type { AccessFlags, UserPublic } from "@filapilot/shared";

// Die Freigaben eines Kontos, wie sie in den Benutzer-Dialogen bearbeitet werden. Nur Super-Admins sehen und aendern sie.
export type AccessValues = AccessFlags;

interface UserAccessFieldsProps {
  role: UserPublic["role"];
  values: AccessValues;
  onChange: (values: AccessValues) => void;
}

const CHECKBOX_LABEL = "flex items-start gap-2 text-sm text-[var(--color-text-primary)]";

// Super-Admin sehen immer beides: die beiden Freigaben sind dann angehakt und gesperrt. Ein Super-Admin muss Admin sein.
export function UserAccessFields({ role, values, onChange }: UserAccessFieldsProps): React.JSX.Element {
  const { t } = useTranslation();
  const superAdminPossible = role === "ADMIN";
  const everything = values.isSuperAdmin;

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
      <legend className="px-1 text-sm font-medium text-[var(--color-text-secondary)]">{t("settings.access")}</legend>
      <p className="text-xs text-[var(--color-text-muted)]">{t("settings.accessHint")}</p>
      <label className={CHECKBOX_LABEL}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={values.isSuperAdmin && superAdminPossible}
          disabled={!superAdminPossible}
          onChange={(event) => onChange({ ...values, isSuperAdmin: event.target.checked })}
        />
        <span className="flex flex-col">
          <span className="font-medium">{t("settings.superAdmin")}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{superAdminPossible ? t("settings.superAdminHint") : t("settings.superAdminNeedsAdmin")}</span>
        </span>
      </label>
      <label className={CHECKBOX_LABEL}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={everything || values.canUseFilament}
          disabled={everything}
          onChange={(event) => onChange({ ...values, canUseFilament: event.target.checked })}
        />
        {t("settings.accessFilament")}
      </label>
      <label className={CHECKBOX_LABEL}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={everything || values.canUseSizzle}
          disabled={everything}
          onChange={(event) => onChange({ ...values, canUseSizzle: event.target.checked })}
        />
        {t("settings.accessSizzle")}
      </label>
    </fieldset>
  );
}
