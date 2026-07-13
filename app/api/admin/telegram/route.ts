import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { writeSetting } from "@/lib/sheets/client";
import {
  getTelegramToken,
  getTelegramChatId,
  sendTelegramHtml,
  detectTelegramChatId,
} from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status: does a token exist (settings or env) and is a chat set? */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const [token, chatId] = await Promise.all([getTelegramToken(), getTelegramChatId()]);
  return NextResponse.json({
    ok: true,
    hasToken: Boolean(token),
    chatId,
    fromEnv: !process.env.TELEGRAM_BOT_TOKEN ? false : true,
  });
}

/** Actions: "test" (send a message) or "detect" (auto-fill chat_id). */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  if (action === "detect") {
    const res = await detectTelegramChatId();
    if (res.chatId) await writeSetting("telegram_chat_id", res.chatId);
    return NextResponse.json({ ok: Boolean(res.chatId), ...res });
  }

  // default: test
  const res = await sendTelegramHtml(
    `🔔 <b>Тест уведомлений</b> · SCANPART.ASTANA\nЕсли вы видите это сообщение — бот подключён и заказы будут приходить сюда.`
  );
  return NextResponse.json(res);
}
