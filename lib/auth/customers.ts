import bcrypt from "bcryptjs";
import {
  appendCustomer,
  findCustomer,
  updateCustomerProfile,
  updateCustomerVins,
  type CustomerRow,
} from "@/lib/sheets/client";

const COST = 12;
const pepper = () => process.env.BCRYPT_PEPPER ?? "";

async function hash(plain: string): Promise<string> {
  return bcrypt.hash(plain + pepper(), COST);
}

export async function verifyCustomerPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await bcrypt.compare(plain + pepper(), hashed);
  } catch {
    return false;
  }
}

export async function getCustomerForLogin(email: string): Promise<CustomerRow | null> {
  return findCustomer(email);
}

export async function registerCustomer(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  whatsapp?: string;
}): Promise<void> {
  const existing = await findCustomer(input.email);
  if (existing) throw new Error("email_taken");
  await appendCustomer({
    email: input.email,
    passwordHash: await hash(input.password),
    name: input.name,
    phone: input.phone,
    whatsapp: input.whatsapp ?? "",
    vins: [],
    createdAt: new Date().toISOString(),
  });
}

export async function changeCustomerPassword(
  email: string,
  newPassword: string
): Promise<void> {
  await updateCustomerProfile(email, { passwordHash: await hash(newPassword) });
}

export async function updateCustomerProfileFields(
  email: string,
  patch: { name?: string; phone?: string; whatsapp?: string }
): Promise<void> {
  await updateCustomerProfile(email, patch);
}

export async function saveCustomerVin(email: string, vin: string): Promise<void> {
  const c = await findCustomer(email);
  if (!c) return;
  const v = vin.trim().toUpperCase();
  if (!v) return;
  if (c.vins.includes(v)) return;
  await updateCustomerVins(email, [v, ...c.vins].slice(0, 50));
}

export async function removeCustomerVin(email: string, vin: string): Promise<void> {
  const c = await findCustomer(email);
  if (!c) return;
  await updateCustomerVins(
    email,
    c.vins.filter((x) => x !== vin.trim().toUpperCase())
  );
}

export async function replaceCustomerVin(
  email: string,
  oldVin: string,
  newVin: string
): Promise<void> {
  const c = await findCustomer(email);
  if (!c) return;
  const old = oldVin.trim().toUpperCase();
  const next = newVin.trim().toUpperCase();
  if (!next) return;
  const idx = c.vins.indexOf(old);
  let vins: string[];
  if (idx === -1) {
    vins = [next, ...c.vins.filter((v) => v !== next)];
  } else {
    vins = c.vins.map((v, i) => (i === idx ? next : v));
    vins = vins.filter((v, i) => vins.indexOf(v) === i);
  }
  await updateCustomerVins(email, vins.slice(0, 50));
}
