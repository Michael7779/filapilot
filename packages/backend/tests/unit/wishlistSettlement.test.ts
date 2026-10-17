import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSettlementCsv,
  buildSettlementText,
  computeSettlement,
  distributeCents,
  formatCentsPlain,
  parseEuroInput,
  type SettlementLabels
} from "@filapilot/shared";

type Item = Parameters<typeof computeSettlement>[0][number];

let itemCounter = 0;
function item(over: Partial<Item>): Item {
  itemCounter += 1;
  return {
    id: `id-${itemCounter}`,
    title: "Irgendwas",
    quantity: 1,
    unitPriceCents: 1000,
    addedByName: "anna",
    manufacturerId: "m1",
    manufacturerName: "Bambu Lab",
    inOrder: true,
    ...over
  };
}

const LABELS: SettlementLabels = {
  person: "Person",
  manufacturer: "Hersteller",
  item: "Artikel",
  quantity: "Menge",
  unitPrice: "Einzelpreis",
  amount: "Betrag",
  extras: "Versand/Rabatt",
  total: "Summe",
  noManufacturer: "Ohne Hersteller",
  missingPrice: "Preis fehlt"
};

describe("parseEuroInput", () => {
  it("liest Komma und Punkt, mit oder ohne Euro-Zeichen und Leerzeichen", () => {
    assert.deepEqual(parseEuroInput("12,50"), { kind: "ok", cents: 1250 });
    assert.deepEqual(parseEuroInput("12.5"), { kind: "ok", cents: 1250 });
    assert.deepEqual(parseEuroInput(" 9 € "), { kind: "ok", cents: 900 });
    assert.deepEqual(parseEuroInput("0"), { kind: "ok", cents: 0 });
    assert.deepEqual(parseEuroInput("0,05"), { kind: "ok", cents: 5 });
  });

  it("erkennt leere Eingaben und weist Ungueltiges ab", () => {
    assert.deepEqual(parseEuroInput("   "), { kind: "empty" });
    for (const bad of ["abc", "-5", "1,234", "1,2,3", "12e3", "100000"]) {
      assert.deepEqual(parseEuroInput(bad), { kind: "invalid" }, bad);
    }
  });
});

describe("formatCentsPlain", () => {
  it("formatiert Cent mit waehlbarem Dezimaltrenner und zwei Nachkommastellen", () => {
    assert.equal(formatCentsPlain(1250, ","), "12,50");
    assert.equal(formatCentsPlain(5, "."), "0.05");
    assert.equal(formatCentsPlain(-250, ","), "-2,50");
    assert.equal(formatCentsPlain(0, ","), "0,00");
  });
});

describe("distributeCents", () => {
  it("verteilt so, dass die Summe exakt stimmt (groesster Rest bekommt den Rest-Cent)", () => {
    assert.deepEqual(distributeCents(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(distributeCents(-100, [1, 1, 1]), [-34, -33, -33]);
    const shares = distributeCents(799, [2000, 6000, 333]);
    assert.equal(shares.reduce((sum, value) => sum + value, 0), 799);
  });

  it("verteilt proportional zu den Gewichten", () => {
    assert.deepEqual(distributeCents(800, [2000, 6000]), [200, 600]);
  });

  it("teilt gleichmaessig, wenn alle Gewichte 0 sind, und liefert bei keinen Gewichten nichts", () => {
    assert.deepEqual(distributeCents(10, [0, 0]), [5, 5]);
    assert.deepEqual(distributeCents(10, []), []);
    assert.deepEqual(distributeCents(0, [3, 1]), [0, 0]);
  });
});

describe("computeSettlement", () => {
  const items = [
    item({ id: "a1", title: "PLA Schwarz", quantity: 1, unitPriceCents: 2000, addedByName: "anna" }),
    item({ id: "b1", title: "PLA Weiss", quantity: 3, unitPriceCents: 2000, addedByName: "ben" }),
    item({ id: "b2", title: "PETG Orange", quantity: 2, unitPriceCents: 3000, addedByName: "ben", manufacturerId: "m2", manufacturerName: "Prusa" })
  ];
  const costs = [
    { manufacturerId: "m1", shippingCents: 800, discountCents: 0 },
    { manufacturerId: "m2", shippingCents: 500, discountCents: 100 }
  ];

  it("rechnet Ware, anteiligen Versand/Rabatt und Summe je Person", () => {
    const result = computeSettlement(items, costs, "de");
    const anna = result.persons.find((person) => person.name === "anna");
    const ben = result.persons.find((person) => person.name === "ben");
    assert.equal(anna?.goodsCents, 2000);
    assert.equal(anna?.extrasCents, 200);
    assert.equal(anna?.totalCents, 2200);
    // ben: Bambu 6000 + 600 Versandanteil, Prusa 6000 + (500 - 100) = 400
    assert.equal(ben?.goodsCents, 12000);
    assert.equal(ben?.extrasCents, 1000);
    assert.equal(ben?.totalCents, 13000);
    assert.equal(ben?.lines.length, 2);
    assert.deepEqual(ben?.extras.map((extra) => [extra.manufacturerName, extra.cents]).sort(), [["Bambu Lab", 600], ["Prusa", 400]]);
  });

  it("Gesamtsumme = Summe der Personen = Summe der Hersteller (nichts geht beim Runden verloren)", () => {
    const odd = [
      item({ addedByName: "anna", unitPriceCents: 333 }),
      item({ addedByName: "ben", unitPriceCents: 333 }),
      item({ addedByName: "cara", unitPriceCents: 334 })
    ];
    const result = computeSettlement(odd, [{ manufacturerId: "m1", shippingCents: 799, discountCents: 0 }], "de");
    const sumPersons = result.persons.reduce((sum, person) => sum + person.totalCents, 0);
    const sumManufacturers = result.manufacturers.reduce((sum, group) => sum + group.totalCents, 0);
    assert.equal(result.totalCents, 1000 + 799);
    assert.equal(sumPersons, result.totalCents);
    assert.equal(sumManufacturers, result.totalCents);
  });

  it("beruecksichtigt nur Eintraege der Bestellliste und ignoriert Kosten fuer Hersteller ohne Auswahl", () => {
    const result = computeSettlement(
      [item({ addedByName: "anna", unitPriceCents: 1000 }), item({ addedByName: "ben", inOrder: false, unitPriceCents: 9999 })],
      [
        { manufacturerId: "m1", shippingCents: 0, discountCents: 0 },
        { manufacturerId: "m9", shippingCents: 5000, discountCents: 0 }
      ],
      "de"
    );
    assert.deepEqual(result.persons.map((person) => person.name), ["anna"]);
    assert.equal(result.totalCents, 1000);
  });

  it("zaehlt fehlende Preise (Preis zaehlt als 0) und teilt Versand dann gleichmaessig", () => {
    const result = computeSettlement(
      [item({ addedByName: "anna", unitPriceCents: null }), item({ addedByName: "ben", unitPriceCents: null })],
      [{ manufacturerId: "m1", shippingCents: 500, discountCents: 0 }],
      "de"
    );
    assert.equal(result.missingPriceCount, 2);
    assert.deepEqual(result.persons.map((person) => person.totalCents), [250, 250]);
  });

  it("kennt keine Nebenkosten fuer Eintraege ohne Hersteller und sortiert Hersteller alphabetisch, ohne Hersteller zuletzt", () => {
    const result = computeSettlement(
      [
        item({ manufacturerId: null, manufacturerName: null, unitPriceCents: 500 }),
        item({ manufacturerId: "m2", manufacturerName: "Prusa" }),
        item({ manufacturerId: "m1", manufacturerName: "Bambu Lab" })
      ],
      [],
      "de"
    );
    assert.deepEqual(result.manufacturers.map((group) => group.manufacturerName), ["Bambu Lab", "Prusa", null]);
    assert.equal(result.extrasCents, 0);
  });

  it("liefert ohne ausgewaehlte Eintraege eine leere Abrechnung", () => {
    const result = computeSettlement([item({ inOrder: false })], [], "de");
    assert.deepEqual(result.persons, []);
    assert.equal(result.totalCents, 0);
  });
});

describe("Abrechnung als CSV und Text", () => {
  const settlement = computeSettlement(
    [
      item({ addedByName: "anna", title: "PLA Schwarz", quantity: 2, unitPriceCents: 2000 }),
      item({ addedByName: "ben", title: "=HYPERLINK(\"http://boese.example\")", unitPriceCents: null })
    ],
    [{ manufacturerId: "m1", shippingCents: 400, discountCents: 0 }],
    "de"
  );

  it("schreibt CSV mit Semikolon und Dezimalkomma, Kopfzeile und Summenzeilen je Person", () => {
    const csv = buildSettlementCsv(settlement, LABELS);
    const lines = csv.split("\r\n");
    assert.equal(lines[0], "Person;Hersteller;Artikel;Menge;Einzelpreis;Betrag");
    assert.ok(lines.includes("anna;Bambu Lab;PLA Schwarz;2;20,00;40,00"));
    assert.ok(lines.some((line) => line.startsWith("anna;Bambu Lab;Versand/Rabatt;;;")));
    assert.ok(lines.includes("anna;;Summe;;;44,00"));
  });

  it("entschaerft Formeln (Zellen, die mit = + - @ beginnen) und markiert fehlende Preise", () => {
    const csv = buildSettlementCsv(settlement, LABELS);
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.ok(!/;=HYPERLINK/.test(csv));
    assert.ok(csv.includes("Preis fehlt"));
  });

  it("setzt Felder mit Semikolon oder Anfuehrungszeichen in Anfuehrungszeichen", () => {
    const csv = buildSettlementCsv(
      computeSettlement([item({ title: 'PLA; "Matt"', unitPriceCents: 100 })], [], "de"),
      LABELS
    );
    assert.ok(csv.includes('"PLA; ""Matt"""'));
  });

  it("erzeugt einen Text zum Weiterschicken mit Summe je Person", () => {
    const text = buildSettlementText(settlement, LABELS, ",");
    assert.ok(text.includes("anna: 44,00 €"));
    assert.ok(text.includes("2x PLA Schwarz"));
    assert.ok(text.includes("ben:"));
  });
});
