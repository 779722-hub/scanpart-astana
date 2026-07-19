import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getDelivery, upsertDelivery, readDeliveries } from "@/lib/sheets/client";
import { canTransition, type DeliveryStatus } from "@/lib/delivery/types";
import { codesMatch } from "@/lib/delivery/handover";
import { sendHandoverCode } from "@/lib/delivery/notify";
import { notifyDelivery } from "@/lib/delivery/notify-telegram";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "start", "enroute", "deliver", "cancel"]),
  code: z.string().optional(),
});

const TARGET: Record<z.infer<typeof schema>["action"], DeliveryStatus> = {
  accept: "accepted",
  start: "picking",
  enroute: "en_route",
  deliver: "delivered",
  cancel: "canceled",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  const courier = session.courier;
  if (!courier) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const d = await getDelivery(params.id);
  if (!d || d.courierId !== courier.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // One order at a time: can't start the next while another is being handled.
  if (parsed.data.action === "start") {
    const all = await readDeliveries().catch(() => []);
    const busy = all.some(
      (x) =>
        x.courierId === courier.id &&
        x.id !== d.id &&
        (x.status === "picking" || x.status === "en_route")
    );
    if (busy) {
      return NextResponse.json({ ok: false, error: "finish_current_first" }, { status: 409 });
    }
  }

  const target = TARGET[parsed.data.action];
  if (!canTransition(d.status, target)) {
    return NextResponse.json(
      { ok: false, error: "bad_transition", from: d.status, to: target },
      { status: 409 }
    );
  }

  let codeSent: boolean | undefined;
  let waLink: string | undefined;

  if (parsed.data.action === "enroute") {
    // Issue a fresh 4-digit code and send it to the customer. Range 1000–9999
    // (never a leading zero): Google Sheets stores the code as a number and
    // would strip a leading zero ("0123" → 123), breaking the later match.
    const code = String(randomInt(1000, 10000));
    d.handoverCode = code;
    const sent = await sendHandoverCode(d, code);
    codeSent = sent.sent;
    waLink = sent.link;
  }

  if (parsed.data.action === "deliver") {
    // Require the customer's code to confirm the handover.
    if (!codesMatch(parsed.data.code ?? "", d.handoverCode)) {
      return NextResponse.json({ ok: false, error: "bad_code" }, { status: 403 });
    }
    d.deliveredAt = new Date().toISOString();
  }

  d.status = target;
  await upsertDelivery(d);

  // Best-effort manager notification for the two key moments.
  if (parsed.data.action === "enroute") {
    await notifyDelivery("en_route", d, { courierName: courier.name }).catch(() => {});
  } else if (parsed.data.action === "deliver") {
    await notifyDelivery("delivered", d, { courierName: courier.name }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: d.status, codeSent, waLink });
}
