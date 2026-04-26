import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { getMarkupPercent } from "@/lib/sheets/settings";
import { applyMarkup } from "@/lib/markup";

export const runtime = "nodejs";

const schema = z.object({
  items: z
    .array(
      z.object({
        article: z.string().min(1).max(120),
        brand: z.string().min(1).max(120),
        partName: z.string().min(1).max(300).optional(),
        quantity: z.coerce.number().int().positive().max(99).default(1),
      })
    )
    .min(1)
    .max(50),
});

export interface ReorderItem {
  brand: string;
  article: string;
  name: string;
  price: number;
  availableQty: number;
  found: boolean;
  warehouse?: string;
}

/**
 * Resolve current Phaeton prices for each requested (brand, article). For each
 * input item we run searchPrices and pick the cheapest in-stock Astana row.
 * Returns one entry per input item — including ones we couldn't find ("found:
 * false"), so the client can show what's missing.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const [warehouseIds, markupPct] = await Promise.all([
      getAstanaWarehouseIds().catch(() => [] as string[]),
      getMarkupPercent(),
    ]);

    const out: ReorderItem[] = await Promise.all(
      parsed.data.items.map(async (it) => {
        try {
          const prices = await searchPrices({
            article: it.article,
            brand: it.brand,
            warehouseIds,
            includeAnalogs: false,
          });
          if (prices.IsError || !prices.Items?.length) {
            return reorderMiss(it);
          }
          const inAstana = prices.Items.filter(
            (i) =>
              (i.AvailableCount ?? 0) > 0 &&
              (i.Price ?? 0) > 0 &&
              /астана|astana/i.test(i.Warehouse ?? "")
          ).sort((a, b) => (a.Price ?? 0) - (b.Price ?? 0));
          if (!inAstana.length) {
            // Try to fetch brand list to refresh the part name at least.
            return reorderMiss(it);
          }
          const top = inAstana[0];
          return {
            brand: top.Brand,
            article: top.Article,
            name: top.Name ?? it.partName ?? "",
            price: applyMarkup(top.Price, markupPct),
            availableQty: top.AvailableCount ?? 0,
            found: true,
            warehouse: top.Warehouse,
          };
        } catch {
          return reorderMiss(it);
        }
      })
    );

    return NextResponse.json({ ok: true, items: out });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}

function reorderMiss(it: {
  brand: string;
  article: string;
  partName?: string;
  quantity: number;
}): ReorderItem {
  // searchBrands isn't strictly needed but we keep import to allow future expansion.
  void searchBrands;
  return {
    brand: it.brand,
    article: it.article,
    name: it.partName ?? "",
    price: 0,
    availableQty: 0,
    found: false,
  };
}
