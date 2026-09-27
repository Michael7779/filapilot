import type { PrintJobListQuery, PrintJobListResult, PrintJobWithNames } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/apiResult.js";
import { accessibleInventoryIds, requireInventoryRole } from "./inventoryAccess.js";

interface PrintJobRow {
  id: string;
  printerId: string;
  spoolId: string;
  name: string;
  filamentUsedG: number;
  costCents: number | null;
  succeeded: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  printer: { name: string; inventoryId: string | null; inventory: { name: string } | null };
  spool: { colorName: string; material: { name: string } };
}

function toPublic(job: PrintJobRow): PrintJobWithNames {
  return {
    id: job.id,
    printerId: job.printerId,
    spoolId: job.spoolId,
    name: job.name,
    filamentUsedG: job.filamentUsedG,
    costCents: job.costCents,
    succeeded: job.succeeded,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    printerName: job.printer.name,
    spoolLabel: `${job.spool.material.name} ${job.spool.colorName}`,
    inventoryName: job.printer.inventory?.name ?? null
  };
}

// Nur eigene Lager (bzw. das explizit angefragte, wenn erlaubt); Drucker/Spulen-Filter werden auf denselben Bereich begrenzt.
export async function listPrintJobs(user: { id: string; role: "ADMIN" | "USER" }, query: PrintJobListQuery): Promise<PrintJobListResult> {
  let scopeIds: string[];
  if (query.inventoryId === "all") {
    scopeIds = await accessibleInventoryIds(user);
  } else {
    await requireInventoryRole(user, query.inventoryId, "VIEWER");
    scopeIds = [query.inventoryId];
  }

  if (query.printerId) {
    const printer = await prisma.printer.findUnique({ where: { id: query.printerId }, select: { inventoryId: true } });
    if (!printer || printer.inventoryId === null || !scopeIds.includes(printer.inventoryId)) {
      throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
    }
  }
  if (query.spoolId) {
    const spool = await prisma.spool.findUnique({ where: { id: query.spoolId }, select: { inventoryId: true } });
    if (!spool || spool.inventoryId === null || !scopeIds.includes(spool.inventoryId)) {
      throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
    }
  }

  const rows = await prisma.printJob.findMany({
    where: {
      printer: { inventoryId: { in: scopeIds } },
      ...(query.printerId && { printerId: query.printerId }),
      ...(query.spoolId && { spoolId: query.spoolId })
    },
    include: { printer: { select: { name: true, inventoryId: true, inventory: { select: { name: true } } } }, spool: { select: { colorName: true, material: { select: { name: true } } } } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 })
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return { jobs: page.map(toPublic), nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}
