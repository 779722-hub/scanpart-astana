import { z } from "zod";

/**
 * Accept any plausible phone shape: +77051112233, 8-705-111-22-33, 7 (705)
 * 111 22 33, etc. We just count digits — 10–12 of them is a phone number.
 */
const phoneOk = (raw: string): boolean => {
  const d = raw.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 12;
};

const phoneSchema = z
  .string()
  .min(7)
  .max(30)
  .refine(phoneOk, { message: "invalidPhone" });

export const orderSchema = z
  .object({
    kind: z.enum(["express", "pickup"]),
    name: z.string().min(2, { message: "required" }).max(80),
    phone: phoneSchema,
    whatsapp: z
      .string()
      .max(30)
      .refine((s) => s === "" || phoneOk(s), { message: "invalidPhone" })
      .optional()
      .or(z.literal("")),
    address: z.string().max(200).optional().or(z.literal("")),
    brand: z.string().min(1),
    article: z.string().min(1),
    partName: z.string().min(1),
    price: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().max(99),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "express" && !data.address?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "required",
      });
    }
  });

export type OrderInput = z.infer<typeof orderSchema>;

export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Local "8…" → "7…" for KZ/RU 11-digit numbers.
  if (digits.startsWith("8") && digits.length === 11) return "7" + digits.slice(1);
  // Bare "7XX…" 10 digits → assume KZ mobile, prepend 7.
  if (digits.length === 10 && digits.startsWith("7")) return "7" + digits;
  return digits;
}

export function formatPhonePretty(raw: string): string {
  const digits = normalizePhoneE164(raw);
  if (digits.length !== 11) return raw;
  // 7 705 111 22 33 → +7 (705) 111-22-33
  return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(
    7,
    9
  )}-${digits.slice(9, 11)}`;
}
