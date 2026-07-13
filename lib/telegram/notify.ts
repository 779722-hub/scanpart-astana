import { readSetting } from "@/lib/sheets/client";

/**
 * Telegram notifications. The bot token comes from the admin Settings
 * (`telegram_bot_token`) or, as a fallback, the TELEGRAM_BOT_TOKEN env var.
 * The destination chat is `telegram_chat_id` in Settings. Settings are read
 * FRESH (not the 60s cache) so a token just saved in the panel works
 * immediately. Raw Bot API via fetch.
 */
async function creds(): Promise<{ token: string; chatId: string }> {
  const s = await readSetting().catch(() => ({}) as Record<string, string>);
  const token = ((s.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN) ?? "").trim();
  const chatId = (s.telegram_chat_id ?? "").trim();
  return { token, chatId };
}

export async function getTelegramToken(): Promise<string> {
  return (await creds()).token;
}
export async function getTelegramChatId(): Promise<string> {
  return (await creds()).chatId;
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramHtml(
  html: string,
  chatId?: string
): Promise<TelegramSendResult> {
  const { token, chatId: cfgChat } = await creds();
  const chat = (chatId || cfgChat).trim();
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
  const { token } = await creds();
  if (!token) return { error: "no_token" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: Array<Record<string, { chat?: { id?: number; title?: string; first_name?: string; username?: string } }>>;
    };
    if (!j.ok) {
      // 401/404 from Telegram means the token itself is wrong.
      const bad = /not found|unauthorized/i.test(j.description ?? "");
      return { error: bad ? "bad_token" : j.description || "getUpdates_failed" };
    }
    const updates = j.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
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
