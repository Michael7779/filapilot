import type { WishlistItem, WishlistOrderCost } from "./schemas/wishlist.js";

const MAX_PRICE_CENTS = 1_000_000;

export type EuroInput = { kind: "empty" } | { kind: "ok"; cents: number } | { kind: "invalid" };

// Betragseingabe in Euro (Komma oder Punkt, optional mit Euro-Zeichen) -> Cent. Leer ist erlaubt (= kein Betrag).
export function parseEuroInput(text: string): EuroInput {
  const cleaned = text.replaceAll("€", "").trim();
  if (cleaned === "") {
    return { kind: "empty" };
  }
  const parts = cleaned.split(/[.,]/);
  const [whole = "", fraction] = parts;
  if (parts.length > 2 || !/^\d{1,5}$/.test(whole) || (fraction !== undefined && !/^\d{1,2}$/.test(fraction))) {
    return { kind: "invalid" };
  }
  const cents = Number(whole) * 100 + Number((fraction ?? "").padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? { kind: "ok", cents } : { kind: "invalid" };
}

// Cent als Zahl mit zwei Nachkommastellen und frei waehlbarem Dezimaltrenner (CSV/Text; die Oberflaeche nutzt Intl).
export function formatCentsPlain(cents: number, decimalSeparator: string): string {
  const absolute = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  return `${sign}${Math.floor(absolute / 100)}${decimalSeparator}${String(absolute % 100).padStart(2, "0")}`;
}

// Verteilt einen Cent-Betrag proportional auf Gewichte, so dass die Summe exakt stimmt (Methode des groessten Rests).
// Sind alle Gewichte 0, wird gleichmaessig geteilt.
export function distributeCents(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) {
    return [];
  }
  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const divisor = weightSum > 0 ? weightSum : weights.length;
  const shares = effective.map((weight) => Math.floor((absolute * weight) / divisor));
  const order = effective
    .map((weight, index) => ({ index, remainder: (absolute * weight) % divisor }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  let left = absolute - shares.reduce((sum, share) => sum + share, 0);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares.map((share) => (share === 0 ? 0 : sign * share));
}

export type SettlementItem = Pick<
  WishlistItem,
  "id" | "title" | "quantity" | "unitPriceCents" | "addedByName" | "manufacturerId" | "manufacturerName" | "inOrder"
>;
export type SettlementCost = Pick<WishlistOrderCost, "manufacturerId" | "shippingCents" | "discountCents">;

export interface SettlementLine {
  itemId: string;
  title: string;
  manufacturerName: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineCents: number;
}

export interface SettlementExtra {
  manufacturerId: string | null;
  manufacturerName: string | null;
  cents: number;
}

export interface PersonSettlement {
  name: string;
  lines: SettlementLine[];
  goodsCents: number;
  extras: SettlementExtra[];
  extrasCents: number;
  totalCents: number;
}

export interface ManufacturerSettlement {
  manufacturerId: string | null;
  manufacturerName: string | null;
  goodsCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
}

export interface Settlement {
  persons: PersonSettlement[];
  manufacturers: ManufacturerSettlement[];
  goodsCents: number;
  extrasCents: number;
  totalCents: number;
  // Eintraege der Bestellliste ohne Preis - sie zaehlen als 0, die Abrechnung ist dann unvollstaendig.
  missingPriceCount: number;
}

function compareName(a: string | null, b: string | null, locale: string): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return a.localeCompare(b, locale, { sensitivity: "base" });
}

function groupByManufacturer(items: readonly SettlementItem[]): Map<string, SettlementItem[]> {
  const groups = new Map<string, SettlementItem[]>();
  for (const item of items) {
    const key = item.manufacturerId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

// Abrechnung der Sammelbestellung aus den ausgewaehlten Eintraegen (inOrder) und den Nebenkosten je Hersteller.
// Versand minus Rabatt eines Herstellers wird nach Warenwert auf die Personen verteilt, die dort etwas bestellt haben;
// Eintraege ohne Hersteller haben keine Nebenkosten. Person = Name der Person, die den Wunsch hinzugefuegt hat.
export function computeSettlement(items: readonly SettlementItem[], costs: readonly SettlementCost[], locale: string): Settlement {
  const selected = items.filter((item) => item.inOrder);
  const persons = new Map<string, PersonSettlement>();
  const manufacturers: ManufacturerSettlement[] = [];
  const groups = [...groupByManufacturer(selected).values()].sort((a, b) => compareName(a[0]?.manufacturerName ?? null, b[0]?.manufacturerName ?? null, locale));
  let missingPriceCount = 0;

  for (const group of groups) {
    const first = group[0];
    const manufacturerId = first?.manufacturerId ?? null;
    const manufacturerName = first?.manufacturerName ?? null;
    const goodsByPerson = new Map<string, number>();

    for (const item of [...group].sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: "base" }))) {
      const lineCents = item.quantity * (item.unitPriceCents ?? 0);
      if (item.unitPriceCents === null) {
        missingPriceCount += 1;
      }
      const person = persons.get(item.addedByName) ?? { name: item.addedByName, lines: [], goodsCents: 0, extras: [], extrasCents: 0, totalCents: 0 };
      person.lines.push({ itemId: item.id, title: item.title, manufacturerName, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineCents });
      person.goodsCents += lineCents;
      persons.set(item.addedByName, person);
      goodsByPerson.set(item.addedByName, (goodsByPerson.get(item.addedByName) ?? 0) + lineCents);
    }

    const cost = manufacturerId ? costs.find((entry) => entry.manufacturerId === manufacturerId) : undefined;
    const shippingCents = cost?.shippingCents ?? 0;
    const discountCents = cost?.discountCents ?? 0;
    const names = [...goodsByPerson.keys()];
    const shares = distributeCents(shippingCents - discountCents, names.map((name) => goodsByPerson.get(name) ?? 0));
    names.forEach((name, index) => {
      const person = persons.get(name);
      const share = shares[index] ?? 0;
      if (person && share !== 0) {
        person.extras.push({ manufacturerId, manufacturerName, cents: share });
        person.extrasCents += share;
      }
    });

    const goodsCents = [...goodsByPerson.values()].reduce((sum, value) => sum + value, 0);
    manufacturers.push({ manufacturerId, manufacturerName, goodsCents, shippingCents, discountCents, totalCents: goodsCents + shippingCents - discountCents });
  }

  const personList = [...persons.values()].sort((a, b) => compareName(a.name, b.name, locale));
  for (const person of personList) {
    person.totalCents = person.goodsCents + person.extrasCents;
  }
  const goodsCents = manufacturers.reduce((sum, group) => sum + group.goodsCents, 0);
  const extrasCents = manufacturers.reduce((sum, group) => sum + group.shippingCents - group.discountCents, 0);
  return { persons: personList, manufacturers, goodsCents, extrasCents, totalCents: goodsCents + extrasCents, missingPriceCount };
}

// Beschriftungen fuer Export und Text kommen aus den Uebersetzungen der Oberflaeche.
export interface SettlementLabels {
  person: string;
  manufacturer: string;
  item: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  extras: string;
  total: string;
  noManufacturer: string;
  missingPrice: string;
}

// Zellen mit Nutzertext (Namen, Titel): beginnt eine Zelle mit = + - @ (Tab/Zeilenumbruch), wuerde Excel sie als Formel
// ausfuehren - ein vorangestelltes ' verhindert das. Felder mit ; " oder Zeilenumbruch werden in Anfuehrungszeichen gesetzt.
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// CSV fuer Excel (Semikolon, Dezimalkomma). Das BOM fuer Umlaute haengt der Aufrufer beim Speichern an.
export function buildSettlementCsv(settlement: Settlement, labels: SettlementLabels): string {
  const money = (cents: number): string => formatCentsPlain(cents, ",");
  const rows: string[] = [[labels.person, labels.manufacturer, labels.item, labels.quantity, labels.unitPrice, labels.amount].join(";")];
  for (const person of settlement.persons) {
    const name = csvText(person.name);
    for (const line of person.lines) {
      const unit = line.unitPriceCents === null ? labels.missingPrice : money(line.unitPriceCents);
      rows.push([name, csvText(line.manufacturerName ?? labels.noManufacturer), csvText(line.title), String(line.quantity), unit, money(line.lineCents)].join(";"));
    }
    for (const extra of person.extras) {
      rows.push([name, csvText(extra.manufacturerName ?? labels.noManufacturer), labels.extras, "", "", money(extra.cents)].join(";"));
    }
    rows.push([name, "", labels.total, "", "", money(person.totalCents)].join(";"));
  }
  rows.push(["", "", labels.total, "", "", money(settlement.totalCents)].join(";"));
  return rows.join("\r\n");
}

// Kurzer Text zum Weiterschicken (Messenger): eine Zeile je Person mit Summe, darunter die Positionen.
export function buildSettlementText(settlement: Settlement, labels: SettlementLabels, decimalSeparator: string): string {
  const money = (cents: number): string => `${formatCentsPlain(cents, decimalSeparator)} €`;
  const blocks = settlement.persons.map((person) => {
    const lines = person.lines.map((line) =>
      line.unitPriceCents === null
        ? `  ${line.quantity}x ${line.title} (${labels.missingPrice})`
        : `  ${line.quantity}x ${line.title} à ${money(line.unitPriceCents)} = ${money(line.lineCents)}`
    );
    const extras = person.extras.map((extra) => `  ${labels.extras} ${extra.manufacturerName ?? labels.noManufacturer}: ${money(extra.cents)}`);
    return [`${person.name}: ${money(person.totalCents)}`, ...lines, ...extras].join("\n");
  });
  return [...blocks, `${labels.total}: ${money(settlement.totalCents)}`].join("\n\n");
}
