import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSizzleSettlementCsv,
  buildSizzleSettlementText,
  computeSizzleSettlement,
  groupSizzleOrderLines,
  sizzleProductLabel,
  sizzleWishPriceCents,
  type SizzleSettlementLabels
} from "@filapilot/shared";

type Wish = Parameters<typeof computeSizzleSettlement>[0][number];

let counter = 0;
function wish(over: Partial<Wish> & { productTitle?: string; productId?: string; shopCents?: number; variant?: string | null }): Wish {
  counter += 1;
  const { productTitle, productId, shopCents, variant, ...rest } = over;
  return {
    id: `w-${counter}`,
    product: {
      id: productId ?? "p1",
      title: productTitle ?? "Burger & Ribs BBQ-Sauce",
      variantTitle: variant === undefined ? "500 ml" : variant,
      imageUrl: null,
      priceCents: shopCents ?? 720
    },
    quantity: 1,
    status: "OPEN",
    inOrder: true,
    unitPriceCents: null,
    addedByName: "anna",
    ...rest
  };
}

const LABELS: SizzleSettlementLabels = { person: "Person", item: "Produkt", quantity: "Menge", unitPrice: "Preis", amount: "Betrag", total: "Summe" };

describe("sizzleProductLabel / sizzleWishPriceCents", () => {
  it("haengt die Variante an den Titel, ausser es gibt keine", () => {
    assert.equal(sizzleProductLabel({ title: "Sauce", variantTitle: "500 ml" }), "Sauce (500 ml)");
    assert.equal(sizzleProductLabel({ title: "E-Book", variantTitle: null }), "E-Book");
  });

  it("nimmt den eingefrorenen Preis, sonst den Shop-Preis", () => {
    assert.equal(sizzleWishPriceCents(wish({ unitPriceCents: 500, shopCents: 720 })), 500);
    assert.equal(sizzleWishPriceCents(wish({ unitPriceCents: null, shopCents: 720 })), 720);
    assert.equal(sizzleWishPriceCents(wish({ unitPriceCents: 0, shopCents: 720 })), 0);
  });
});

describe("computeSizzleSettlement", () => {
  it("rechnet nur Wuensche der Bestellliste und summiert je Person Menge mal Preis", () => {
    const settlement = computeSizzleSettlement(
      [
        wish({ addedByName: "anna", quantity: 2, unitPriceCents: 700 }),
        wish({ addedByName: "anna", productId: "p2", productTitle: "Alter Pfeffer", variant: null, quantity: 1, unitPriceCents: 1299 }),
        wish({ addedByName: "ben", quantity: 3, unitPriceCents: 700 }),
        wish({ addedByName: "ben", inOrder: false, quantity: 9, unitPriceCents: 700 })
      ],
      "de"
    );
    assert.deepEqual(
      settlement.persons.map((person) => [person.name, person.totalCents]),
      [
        ["anna", 2 * 700 + 1299],
        ["ben", 3 * 700]
      ]
    );
    assert.equal(settlement.totalCents, 2 * 700 + 1299 + 3 * 700);
    assert.equal(settlement.itemCount, 2 + 1 + 3);
  });

  it("nutzt den angepassten Preis der Bestellliste statt des Shop-Preises (Rabatt)", () => {
    const settlement = computeSizzleSettlement([wish({ quantity: 2, shopCents: 1000, unitPriceCents: 800 })], "de");
    assert.equal(settlement.totalCents, 1600);
    assert.equal(settlement.persons[0]?.lines[0]?.unitPriceCents, 800);
  });

  it("faellt ohne eingefrorenen Preis auf den Shop-Preis zurueck", () => {
    const settlement = computeSizzleSettlement([wish({ quantity: 2, shopCents: 1000, unitPriceCents: null })], "de");
    assert.equal(settlement.totalCents, 2000);
  });

  it("ist leer, wenn nichts in der Bestellliste steht", () => {
    const settlement = computeSizzleSettlement([wish({ inOrder: false })], "de");
    assert.deepEqual(settlement.persons, []);
    assert.equal(settlement.totalCents, 0);
  });

  it("sortiert Personen und Positionen alphabetisch", () => {
    const settlement = computeSizzleSettlement(
      [wish({ addedByName: "zoe", productTitle: "B" }), wish({ addedByName: "anna", productTitle: "Z" }), wish({ addedByName: "anna", productTitle: "A" })],
      "de"
    );
    assert.deepEqual(
      settlement.persons.map((person) => person.name),
      ["anna", "zoe"]
    );
    assert.deepEqual(
      settlement.persons[0]?.lines.map((line) => line.title),
      ["A (500 ml)", "Z (500 ml)"]
    );
  });
});

describe("groupSizzleOrderLines", () => {
  it("fasst gleiche Varianten mehrerer Personen zu einer Position zusammen", () => {
    const lines = groupSizzleOrderLines(
      [
        wish({ productId: "p1", addedByName: "anna", quantity: 2, unitPriceCents: 700 }),
        wish({ productId: "p1", addedByName: "ben", quantity: 1, unitPriceCents: 700 }),
        wish({ productId: "p2", productTitle: "Alter Pfeffer", addedByName: "ben", quantity: 4, unitPriceCents: 299 }),
        wish({ productId: "p3", addedByName: "ben", inOrder: false })
      ],
      "de"
    );
    assert.equal(lines.length, 2);
    const sauce = lines.find((line) => line.productId === "p1");
    assert.equal(sauce?.totalQuantity, 3);
    assert.equal(sauce?.priceCents, 700);
    assert.equal(sauce?.priceMixed, false);
    assert.deepEqual(sauce?.contributors, [
      { name: "anna", quantity: 2 },
      { name: "ben", quantity: 1 }
    ]);
  });

  it("meldet verschiedene Preise und gemischten Status einer Position", () => {
    const [line] = groupSizzleOrderLines(
      [wish({ addedByName: "anna", unitPriceCents: 700, status: "OPEN" }), wish({ addedByName: "ben", unitPriceCents: 650, status: "ORDERED" })],
      "de"
    );
    assert.equal(line?.priceMixed, true);
    assert.equal(line?.priceCents, null);
    assert.equal(line?.status, "MIXED");
  });

  it("zeigt den gemeinsamen Status, wenn alle gleich sind", () => {
    const [line] = groupSizzleOrderLines([wish({ status: "ORDERED" }), wish({ status: "ORDERED", addedByName: "ben" })], "de");
    assert.equal(line?.status, "ORDERED");
  });
});

describe("Export der Sizzle-Abrechnung", () => {
  const settlement = computeSizzleSettlement(
    [wish({ addedByName: "anna", quantity: 2, unitPriceCents: 700 }), wish({ addedByName: "=HYPERLINK(1)", productTitle: "Sauce; scharf", unitPriceCents: 500 })],
    "de"
  );

  it("schreibt CSV mit Semikolon, Dezimalkomma und entschaerft Formeln", () => {
    const csv = buildSizzleSettlementCsv(settlement, LABELS);
    const rows = csv.split("\r\n");
    assert.equal(rows[0], "Person;Produkt;Menge;Preis;Betrag");
    assert.ok(rows.includes("anna;Burger & Ribs BBQ-Sauce (500 ml);2;7,00;14,00"));
    assert.ok(rows.some((row) => row.startsWith("'=HYPERLINK(1);\"Sauce; scharf (500 ml)\";1;5,00;5,00")));
    assert.equal(rows.at(-1), ";Summe;;;19,00");
  });

  it("baut einen Text fuer den Messenger mit Summe je Person", () => {
    const text = buildSizzleSettlementText(settlement, LABELS, ",");
    assert.ok(text.includes("anna: 14,00 €"));
    assert.ok(text.includes("  2x Burger & Ribs BBQ-Sauce (500 ml) à 7,00 € = 14,00 €"));
    assert.ok(text.endsWith("Summe: 19,00 €"));
  });
});
