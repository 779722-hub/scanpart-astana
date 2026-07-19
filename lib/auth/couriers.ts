import bcrypt from "bcryptjs";
import {
  readCouriers,
  findCourierByLogin,
  upsertCourier,
} from "@/lib/sheets/client";
import type { Courier } from "@/lib/delivery/types";

const COST = 12;
const pepper = () => process.env.BCRYPT_PEPPER ?? "";

async function hash(plain: string): Promise<string> {
  return bcrypt.hash(plain + pepper(), COST);
}

export async function verifyCourierPassword(
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

function slugCourierId(name: string, login: string): string {
  const base = (login || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `c-${base.slice(0, 24) || Date.now().toString(36)}`;
}

/** Create or update a courier. Password optional on update. */
export async function saveCourier(input: {
  id?: string;
  name: string;
  phone: string;
  whatsapp?: string;
  login: string;
  password?: string;
  active?: boolean;
}): Promise<Courier> {
  const id = input.id?.trim() || slugCourierId(input.name, input.login);
  const passwordHash = input.password ? await hash(input.password) : "";
  const courier: Courier = {
    id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    whatsapp: input.whatsapp?.trim() ?? "",
    login: input.login.trim(),
    passwordHash,
    active: input.active ?? true,
  };
  await upsertCourier(courier);
  return courier;
}

export async function loginCourier(
  login: string,
  password: string
): Promise<Courier | null> {
  const c = await findCourierByLogin(login);
  if (!c || !c.active) return null;
  const ok = await verifyCourierPassword(password, c.passwordHash);
  return ok ? c : null;
}

export async function listCouriers(): Promise<Array<Omit<Courier, "passwordHash">>> {
  const all = await readCouriers();
  return all.map(({ passwordHash: _ph, ...c }) => c);
}
