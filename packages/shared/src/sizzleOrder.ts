import type { WishlistStatus } from "./schemas/wishlist.js";
import type { SizzleProduct, SizzleWish } from "./schemas/sizzle.js";
import type { SizzleOrderCost } from "./schemas/sizzle.js";
import { csvText, distributeCents, formatCentsPlain } from "./wishlistSettlement.js";

const NO_COST: SizzleOrderCost = { shippingCents: 0, discountCents: 0 };

type LabelledProduct = Pick<SizzleProduct, "title" | "variantTitle">;

export type SizzleOrderWish = Pick<SizzleWish, "id" | "quantity" | "status" | "inOrder" | "unitPriceCents" | "addedByName"> & {
  product: Pick<SizzleProduct, "id" | "title" | "variantTitle" | "imageUrl" | "priceCents">;
};

// "Burger & Ribs BBQ-Sauce (500 ml)"; Produkte ohne Variante zeigen nur den Titel.
export function sizzleProductLabel(product: LabelledProduct): string {
  return product.variantTitle ? `${product.title} (${product.variantTitle})` : product.title;
}

// Preis je Stueck, der fuer die Abrechnung gilt: der in der Bestellliste eingefrorene bzw. angepasste Preis, sonst der
// Shop-Preis des Produkts.
export function sizzleWishPriceCents(wish: Pick<SizzleOrderWish, "unitPriceCents" | "product">): number {
  return wish.unitPriceCents ?? wish.product.priceCents;
}

export interface SizzleContributor {
  name: string;
  quantity: number;
}

// Eine Position der Bestellliste: alle Wuensche der Bestellliste fuer dieselbe Produktvariante, auch von mehreren Personen.
export interface SizzleOrderLine<T extends SizzleOrderWish> {
  productId: string;
  product: T["product"];
  wishes: T[];
  totalQuantity: number;
  // Gemeinsamer Status aller Wuensche der Position, sonst MIXED
  status: WishlistStatus | "MIXED";
  // Gemeinsamer Preis je Stueck; priceMixed = die Wuensche haben verschiedene Preise (z.B. Shop-Preis hat sich zwischen zwei
  // Aufnahmen in die Bestellliste geaendert), eine Eingabe gilt dann fuer alle
  priceCents: number | null;
  priceMixed: boolean;
  contributors: SizzleContributor[];
}

function compareText(a: string, b: string, locale: string): number {
  return a.localeCompare(b, locale, { sensitivity: "base", numeric: true });
}

function sharedStatus(wishes: readonly SizzleOrderWish[]): WishlistStatus | "MIXED" {
  const first = wishes[0]?.status ?? "OPEN";
  return wishes.every((wish) => wish.status === first) ? first : "MIXED";
}

function contributorsOf(wishes: readonly SizzleOrderWish[], locale: string): SizzleContributor[] {
  const quantities = new Map<string, number>();
  for (const wish of wishes) {
    quantities.set(wish.addedByName, (quantities.get(wish.addedByName) ?? 0) + wish.quantity);
  }
  return [...quantities.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => compareText(a.name, b.name, locale));
}

// Gruppiert die Wuensche der Bestellliste (inOrder) nach Produktvariante, alphabetisch nach Produktname.
export function groupSizzleOrderLines<T extends SizzleOrderWish>(wishes: readonly T[], locale: string): SizzleOrderLine<T>[] {
  const groups = new Map<string, T[]>();
  for (const wish of wishes.filter((entry) => entry.inOrder)) {
    groups.set(wish.product.id, [...(groups.get(wish.product.id) ?? []), wish]);
  }
  const lines = [...groups.values()].flatMap((group): SizzleOrderLine<T>[] => {
    const first = group[0];
    if (!first) {
      return [];
    }
    const prices = group.map((wish) => sizzleWishPriceCents(wish));
    const priceMixed = prices.some((price) => price !== prices[0]);
    return [
      {
        productId: first.product.id,
        product: first.product,
        wishes: group,
        totalQuantity: group.reduce((sum, wish) => sum + wish.quantity, 0),
        status: sharedStatus(group),
        priceCents: priceMixed ? null : (prices[0] ?? null),
        priceMixed,
        contributors: contributorsOf(group, locale)
      }
    ];
  });
  return lines.sort((a, b) => compareText(sizzleProductLabel(a.product), sizzleProductLabel(b.product), locale));
}

export interface SizzleSettlementLine {
  wishId: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  lineCents: number;
}

export interface SizzlePersonSettlement {
  name: string;
  lines: SizzleSettlementLine[];
  // Ware (Menge mal Preis)
  goodsCents: number;
  // Anteil an Versand minus Rabatt (kann negativ sein)
  extrasCents: number;
  totalCents: number;
}

export interface SizzleSettlement {
  persons: SizzlePersonSettlement[];
  goodsCents: number;
  shippingCents: number;
  discountCents: number;
  // Versand minus Rabatt, soweit er auf Personen verteilt wurde (0, wenn nichts bestellt ist)
  extrasCents: number;
  totalCents: number;
  // Stueckzahl der gesamten Bestellliste
  itemCount: number;
}

// Abrechnung der Sammelbestellung aus den Wuenschen der Bestellliste: je Person Menge mal Preis (der Preis der
// Bestellliste, nicht der aktuelle Shop-Preis). Versand minus Rabatt wird nach Warenwert auf die Personen verteilt, bis auf den
// Cent genau (sind alle Waren 0, gleichmaessig). Person = Name, der beim Hinzufuegen gespeichert wurde.
export function computeSizzleSettlement(wishes: readonly SizzleOrderWish[], locale: string, cost: SizzleOrderCost = NO_COST): SizzleSettlement {
  const persons = new Map<string, SizzlePersonSettlement>();
  let itemCount = 0;
  for (const wish of wishes.filter((entry) => entry.inOrder)) {
    const unitPriceCents = sizzleWishPriceCents(wish);
    const lineCents = wish.quantity * unitPriceCents;
    const person = persons.get(wish.addedByName) ?? { name: wish.addedByName, lines: [], goodsCents: 0, extrasCents: 0, totalCents: 0 };
    person.lines.push({ wishId: wish.id, title: sizzleProductLabel(wish.product), quantity: wish.quantity, unitPriceCents, lineCents });
    person.goodsCents += lineCents;
    persons.set(wish.addedByName, person);
    itemCount += wish.quantity;
  }
  const personList = [...persons.values()].sort((a, b) => compareText(a.name, b.name, locale));
  const shares = distributeCents(cost.shippingCents - cost.discountCents, personList.map((person) => person.goodsCents));
  personList.forEach((person, index) => {
    person.lines.sort((a, b) => compareText(a.title, b.title, locale));
    person.extrasCents = shares[index] ?? 0;
    person.totalCents = person.goodsCents + person.extrasCents;
  });
  const sum = (pick: (person: SizzlePersonSettlement) => number): number => personList.reduce((total, person) => total + pick(person), 0);
  return {
    persons: personList,
    goodsCents: sum((person) => person.goodsCents),
    shippingCents: personList.length > 0 ? cost.shippingCents : 0,
    discountCents: personList.length > 0 ? cost.discountCents : 0,
    extrasCents: sum((person) => person.extrasCents),
    totalCents: sum((person) => person.totalCents),
    itemCount
  };
}

// Beschriftungen fuer Export und Text kommen aus den Uebersetzungen der Oberflaeche.
export interface SizzleSettlementLabels {
  person: string;
  item: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  // "Versand/Rabatt": die Zeile mit dem Anteil der Person
  extras: string;
  total: string;
}

// CSV fuer Excel (Semikolon, Dezimalkomma). Das BOM fuer Umlaute haengt der Aufrufer beim Speichern an.
export function buildSizzleSettlementCsv(settlement: SizzleSettlement, labels: SizzleSettlementLabels): string {
  const money = (cents: number): string => formatCentsPlain(cents, ",");
  const rows: string[] = [[labels.person, labels.item, labels.quantity, labels.unitPrice, labels.amount].join(";")];
  for (const person of settlement.persons) {
    const name = csvText(person.name);
    for (const line of person.lines) {
      rows.push([name, csvText(line.title), String(line.quantity), money(line.unitPriceCents), money(line.lineCents)].join(";"));
    }
    if (person.extrasCents !== 0) {
      rows.push([name, labels.extras, "", "", money(person.extrasCents)].join(";"));
    }
    rows.push([name, labels.total, "", "", money(person.totalCents)].join(";"));
  }
  rows.push(["", labels.total, "", "", money(settlement.totalCents)].join(";"));
  return rows.join("\r\n");
}

// Kurzer Text zum Weiterschicken (Messenger): eine Zeile je Person mit Summe, darunter die Positionen.
export function buildSizzleSettlementText(settlement: SizzleSettlement, labels: SizzleSettlementLabels, decimalSeparator: string): string {
  const money = (cents: number): string => `${formatCentsPlain(cents, decimalSeparator)} €`;
  const blocks = settlement.persons.map((person) => {
    const lines = person.lines.map((line) => `  ${line.quantity}x ${line.title} à ${money(line.unitPriceCents)} = ${money(line.lineCents)}`);
    const extras = person.extrasCents === 0 ? [] : [`  ${labels.extras}: ${money(person.extrasCents)}`];
    return [`${person.name}: ${money(person.totalCents)}`, ...lines, ...extras].join("\n");
  });
  return [...blocks, `${labels.total}: ${money(settlement.totalCents)}`].join("\n\n");
}
