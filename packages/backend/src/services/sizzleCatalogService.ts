import { z } from "zod";
import type { SizzleProduct as PrismaSizzleProduct } from "@prisma/client";
import type { SizzleCatalog, SizzleProduct } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { AppError } from "../lib/apiResult.js";

// Threat-Model (siehe docs/requirements/sizzle.md): Der Abruf nutzt eine feste Adresse ohne Anteil aus Nutzereingaben (kein
// SSRF). Die Antwort ist fremde Daten: jedes Produkt wird per Zod geprueft und ein kaputtes uebersprungen; Bild-URLs muessen
// https sein, der Handle darf nur [a-z0-9-] enthalten (kommt in einen Link), Preise werden exakt aus dem Text gelesen. Ein
// leerer oder kaputter Abruf aendert den Katalog nie (sonst wuerde ein Shop-Ausfall alle Produkte deaktivieren).

export const SHOP_ORIGIN = "https://sizzlebrothers.de";
const PRODUCTS_URL = `${SHOP_ORIGIN}/collections/all/products.json`;
const PAGE_SIZE = 250;
const MAX_PAGES = 10;
const FETCH_TIMEOUT_MS = 20_000;
// Kleines Bild fuer die Listen (die Shopify-CDN skaliert per ?width=)
const THUMBNAIL_WIDTH = 160;

const shopImageSchema = z.object({ src: z.string() });
const shopVariantSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  price: z.string(),
  available: z.boolean().optional().default(true),
  featured_image: shopImageSchema.nullable().optional()
});
const shopProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  handle: z.string().regex(/^[a-z0-9-]+$/i).max(200),
  product_type: z.string().optional().default(""),
  variants: z.array(shopVariantSchema).min(1),
  images: z.array(shopImageSchema).optional().default([])
});

export interface ParsedVariant {
  shopifyVariantId: string;
  shopifyProductId: string;
  handle: string;
  title: string;
  variantTitle: string | null;
  productType: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
}

// "14.70" -> 1470; nur Euro mit hoechstens zwei Nachkommastellen, nie ueber Gleitkomma gerechnet.
export function priceToCents(text: string): number | null {
  const [whole = "", fraction, ...rest] = text.trim().split(".");
  if (rest.length > 0 || !/^\d{1,6}$/.test(whole) || (fraction !== undefined && !/^\d{1,2}$/.test(fraction))) {
    return null;
  }
  return Number(whole) * 100 + Number((fraction ?? "").padEnd(2, "0"));
}

function httpsImage(src: string | undefined): string | null {
  if (!src) {
    return null;
  }
  try {
    return new URL(src).protocol === "https:" ? src : null;
  } catch {
    return null;
  }
}

// Liest die Antwort des Shops (products.json) in eine Zeile je Variante. Ungueltige Produkte/Varianten werden gezaehlt und
// uebersprungen; ist die Antwort als Ganzes unbrauchbar (kein products-Feld), wird geworfen.
export function parseShopifyProducts(json: unknown): { variants: ParsedVariant[]; skipped: number } {
  const container = z.object({ products: z.array(z.unknown()) }).parse(json);
  const variants: ParsedVariant[] = [];
  let skipped = 0;
  for (const raw of container.products) {
    const parsed = shopProductSchema.safeParse(raw);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const product = parsed.data;
    for (const variant of product.variants) {
      const priceCents = priceToCents(variant.price);
      if (priceCents === null) {
        skipped += 1;
        continue;
      }
      variants.push({
        shopifyVariantId: String(variant.id),
        shopifyProductId: String(product.id),
        handle: product.handle,
        title: product.title,
        variantTitle: variant.title.trim() === "" || variant.title === "Default Title" ? null : variant.title.trim(),
        productType: product.product_type.trim() === "" ? null : product.product_type.trim(),
        imageUrl: httpsImage(variant.featured_image?.src) ?? httpsImage(product.images[0]?.src),
        priceCents,
        available: variant.available
      });
    }
  }
  return { variants, skipped };
}

export type PageFetcher = (page: number) => Promise<unknown>;

async function fetchShopPage(page: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${PRODUCTS_URL}?limit=${PAGE_SIZE}&page=${page}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": "FilaPilot (self-hosted)" }
    });
  } catch (err) {
    logger.warn("SizzleBrothers-Shop nicht erreichbar", { err });
    throw new AppError("UPSTREAM_ERROR", "Der SizzleBrothers-Shop ist gerade nicht erreichbar.");
  }
  if (!response.ok) {
    logger.warn("SizzleBrothers-Shop antwortet mit einem Fehler", { status: response.status });
    throw new AppError("UPSTREAM_ERROR", `Der SizzleBrothers-Shop antwortet mit Fehler ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (err) {
    logger.warn("SizzleBrothers-Shop lieferte kein lesbares JSON", { err });
    throw new AppError("UPSTREAM_ERROR", "Die Antwort des SizzleBrothers-Shops ist nicht lesbar.");
  }
}

let pageFetcher: PageFetcher = fetchShopPage;

// Nur fuer Tests: ersetzt den Abruf beim Shop (nie gegen den echten Shop testen); null = zurueck zum echten Abruf.
export function setCatalogFetcherForTests(fetcher: PageFetcher | null): void {
  pageFetcher = fetcher ?? fetchShopPage;
}

async function fetchAllVariants(fetchPage: PageFetcher): Promise<ParsedVariant[]> {
  const all: ParsedVariant[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { variants, skipped } = parseShopifyProducts(await fetchPage(page));
    if (skipped > 0) {
      logger.warn("Einige Shop-Produkte waren unbrauchbar und wurden uebersprungen", { page, skipped });
    }
    all.push(...variants);
    // Mehr als eine Seite gibt es nur, wenn die Seite voll war (Produkte, nicht Varianten, zaehlen)
    const productCount = new Set(variants.map((variant) => variant.shopifyProductId)).size;
    if (productCount < PAGE_SIZE) {
      break;
    }
  }
  return all;
}

export interface SyncResult {
  total: number;
  deactivated: number;
}

let running: Promise<SyncResult> | null = null;
let lastAttemptAt: Date | null = null;

// Gleicht den Katalog mit dem Shop ab: neue/geaenderte Varianten werden gespeichert, nicht mehr gelieferte auf inaktiv gesetzt
// (nie geloescht, bestehende Wuensche bleiben lesbar). Gleichzeitige Aufrufe teilen sich einen Lauf.
export function syncCatalog(): Promise<SyncResult> {
  running ??= runSync(pageFetcher, new Date()).finally(() => {
    running = null;
  });
  return running;
}

async function runSync(fetchPage: PageFetcher, now: Date): Promise<SyncResult> {
  lastAttemptAt = now;
  const variants = await fetchAllVariants(fetchPage);
  if (variants.length === 0) {
    throw new AppError("UPSTREAM_ERROR", "Der SizzleBrothers-Shop lieferte keine Produkte.");
  }
  const fields = (variant: ParsedVariant) => ({
    shopifyProductId: variant.shopifyProductId,
    handle: variant.handle,
    title: variant.title,
    variantTitle: variant.variantTitle,
    productType: variant.productType,
    imageUrl: variant.imageUrl,
    priceCents: variant.priceCents,
    available: variant.available,
    active: true,
    syncedAt: now
  });
  const deactivated = await prisma.$transaction(
    async (tx) => {
      for (const variant of variants) {
        await tx.sizzleProduct.upsert({
          where: { shopifyVariantId: variant.shopifyVariantId },
          create: { shopifyVariantId: variant.shopifyVariantId, ...fields(variant) },
          update: fields(variant),
          select: { id: true }
        });
      }
      return tx.sizzleProduct.updateMany({
        where: { active: true, shopifyVariantId: { notIn: variants.map((variant) => variant.shopifyVariantId) } },
        data: { active: false, syncedAt: now }
      });
    },
    { timeout: 60_000 }
  );
  logger.info("SizzleBrothers-Katalog abgeglichen", { total: variants.length, deactivated: deactivated.count });
  return { total: variants.length, deactivated: deactivated.count };
}

// Faellig, wenn der letzte Abgleich (oder Versuch - auch ein fehlgeschlagener) laenger als die Mindestpause zurueckliegt.
export function isCatalogDue(lastSyncedAt: Date | null, lastAttempt: Date | null, now: Date, minIntervalMs: number): boolean {
  const latest = Math.max(lastSyncedAt?.getTime() ?? 0, lastAttempt?.getTime() ?? 0);
  return latest === 0 || now.getTime() - latest >= minIntervalMs;
}

export async function lastCatalogSyncAt(): Promise<Date | null> {
  const result = await prisma.sizzleProduct.aggregate({ _max: { syncedAt: true } });
  return result._max.syncedAt;
}

// Gleicht nur ab, wenn es faellig ist; liefert, ob abgeglichen wurde. Fehler des Shops werden weitergeworfen.
export async function refreshCatalogIfDue(minIntervalMs: number): Promise<boolean> {
  if (!isCatalogDue(await lastCatalogSyncAt(), lastAttemptAt, new Date(), minIntervalMs)) {
    return false;
  }
  await syncCatalog();
  return true;
}

// Nach einem Neustart weiss der Speicher nichts mehr vom letzten Versuch (Tests).
export function resetCatalogAttemptForTests(): void {
  lastAttemptAt = null;
}

function smallImage(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const small = new URL(url);
    small.searchParams.set("width", String(THUMBNAIL_WIDTH));
    return small.toString();
  } catch {
    return null;
  }
}

export function toPublicProduct(row: PrismaSizzleProduct): SizzleProduct {
  return {
    id: row.id,
    productKey: row.shopifyProductId,
    title: row.title,
    variantTitle: row.variantTitle,
    productType: row.productType,
    imageUrl: smallImage(row.imageUrl),
    url: `${SHOP_ORIGIN}/products/${row.handle}`,
    priceCents: row.priceCents,
    available: row.available,
    active: row.active
  };
}

export async function loadCatalog(): Promise<SizzleCatalog> {
  const [rows, syncedAt] = await Promise.all([
    prisma.sizzleProduct.findMany({ where: { active: true }, orderBy: [{ title: "asc" }, { priceCents: "asc" }], take: 1000 }),
    lastCatalogSyncAt()
  ]);
  return { products: rows.map(toPublicProduct), syncedAt };
}
