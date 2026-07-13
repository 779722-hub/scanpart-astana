import { getSetting } from "@/lib/sheets/settings";

/**
 * Telegram notifications. The bot token comes from the admin Settings
 * (`telegram_bot_token`) or, as a fallback, the TELEGRAM_BOT_TOKEN env var.
 * The destination chat is `telegram_chat_id` in Settings. Raw Bot API (fetch)
 * so a token changed in the admin takes effect immediately.
 */
export async function getTelegramToken(): Promise<string> {
  const fromSettings = await getSetting("telegram_bot_token").catch(() => "");
  return ((fromSettings || process.env.TELEGRAM_BOT_TOKEN) ?? "").trim();
}

export async function getTelegramChatId(): Promise<string> {
  return ((await getSetting("telegram_chat_id").catch(() => "")) ?? "").trim();
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramHtml(
  html: string,
  chatId?: string
): Promise<TelegramSendResult> {
  const token = await getTelegramToken();
  const chat = (chatId || (await getTelegramChatId())).trim();
  if (!token) return { ok: false, error: "no_token" };
  if (!chat) return { ok: false, error: "no_chat" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !j.ok) return { ok: false, error: j.description || `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Read the latest chat that messaged the bot — used to auto-fill chat_id. */
export async function detectTelegramChatId(): Promise<{
  chatId?: string;
  title?: string;
  error?: string;
}> {
  const token = await getTelegramToken();
  if (!token) return { error: "no_token" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const j = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: Array<Record<string, { chat?: { id?: number; title?: string; first_name?: string; username?: string } }>>;
    };
    if (!j.ok) return { error: j.description || "getUpdates_failed" };
    const updates = j.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat =
        u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
      if (chat?.id != null) {
        return {
          chatId: String(chat.id),
          title: chat.title || chat.first_name || chat.username || "",
        };
      }
    }
    return { error: "no_messages" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
