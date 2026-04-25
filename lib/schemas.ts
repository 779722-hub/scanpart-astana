import { z } from "zod";

/** +7 7XX XXX XX XX or local 8 7XX …; allow spaces, dashes, parens. */
const phoneRegex = /^(?:\+?7|8)[\s\-()]*7\d[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}$/;

export const orderSchema = z
  .object({
    kind: z.enum(["express", "pickup"]),
    name: z.string().min(2, { message: "required" }).max(80),
    phone: z.string().regex(phoneRegex, { message: "invalidPhone" }),
    whatsapp: z
      .string()
      .regex(phoneRegex, { message: "invalidPhone" })
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
  // local 8… → 7…
  if (digits.startsWith("8") && digits.length === 11) return "7" + digits.slice(1);
  return digits;
}
