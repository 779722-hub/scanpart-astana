import { sealData } from "iron-session";
const sealed = await sealData({ user: { email: "claude-code@agent", role: "owner", loggedInAt: new Date().toISOString() } }, { password: process.env.PW, ttl: 0 });
for (const article of ["GDB1330","0451103316"]) {
  const r = await fetch("https://scanpart.kz/api/admin/diag/phaeton-photo", {
    method: "POST", headers: { cookie: `scanpart_sess=${sealed}`, "content-type": "application/json" },
    body: JSON.stringify({ article }),
  });
  const j = await r.json();
  console.log(`\n=== ${article} brand=${j.brand} ItemId=${j.itemId} Cat=${j.categoryId} Sup=${j.supplierId} ===`);
  for (const res of j.results ?? []) console.log(`  ${res.status} ${res.type} ${res.len}  ${res.url}`);
}
