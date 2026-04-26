"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { cldUrl } from "@/lib/cloudinary-url";

interface ImageRow {
  slot: string;
  publicId: string;
  altRu: string;
  altKk: string;
  altEn: string;
}

const KNOWN_SLOTS = [
  { slot: "hero_light", title: "Главная — фон для светлой темы" },
  { slot: "hero_dark", title: "Главная — фон для тёмной темы" },
  { slot: "hero", title: "Главная — fallback фон (если светлый/тёмный не заданы)" },
  { slot: "info-illustration", title: "Страница «Доп. информация»" },
  { slot: "og-default", title: "OpenGraph для соцсетей (1200×630)" },
];

export function TabImages() {
  const [rows, setRows] = useState<ImageRow[] | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const j = await fetch("/api/admin/images").then((r) => r.json());
    setRows(j.ok ? j.rows : []);
  }

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const slotMap = new Map(rows.map((r) => [r.slot, r]));
  const customSlots = rows
    .map((r) => r.slot)
    .filter((s) => !KNOWN_SLOTS.some((k) => k.slot === s));
  const allSlots = [...KNOWN_SLOTS, ...customSlots.map((s) => ({ slot: s, title: s }))];

  return (
    <div className="space-y-4">
      {allSlots.map(({ slot, title }) => (
        <SlotCard
          key={slot}
          slot={slot}
          title={title}
          row={slotMap.get(slot)}
          onChanged={refresh}
        />
      ))}
      <AddCustomSlot onCreated={refresh} />
    </div>
  );
}

function SlotCard({
  slot,
  title,
  row,
  onChanged,
}: {
  slot: string;
  title: string;
  row?: ImageRow;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [savingAlt, setSavingAlt] = useState(false);
  const [altRu, setAltRu] = useState(row?.altRu ?? "");
  const [altKk, setAltKk] = useState(row?.altKk ?? "");
  const [altEn, setAltEn] = useState(row?.altEn ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const upJson = await up.json();
      if (!up.ok || !upJson.ok) {
        alert(`Не удалось загрузить: ${upJson.error}`);
        return;
      }
      const res = await fetch("/api/admin/images", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slot,
          publicId: upJson.image.publicId,
          removePreviousPublicId: row?.publicId || undefined,
        }),
      });
      if (!res.ok) {
        alert("Загружено в Cloudinary, но не записалось в Sheets");
      }
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  async function saveAlt() {
    setSavingAlt(true);
    try {
      await fetch("/api/admin/images", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot, altRu, altKk, altEn }),
      });
      onChanged();
    } finally {
      setSavingAlt(false);
    }
  }

  async function clearImage() {
    if (!row?.publicId) return;
    if (!confirm("Удалить картинку из этого слота?")) return;
    await fetch("/api/admin/images", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slot,
        publicId: "",
        removePreviousPublicId: row.publicId,
      }),
    });
    onChanged();
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold">
            <ImageIcon className="h-4 w-4 text-brand" />
            {title}
          </div>
          <code className="mt-1 inline-block rounded bg-paper-soft px-2 py-0.5 text-xs dark:bg-ink-mute">
            slot: {slot}
          </code>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button
            className="btn-secondary !px-3 !py-2 text-sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {row?.publicId ? "Заменить" : "Загрузить"}
          </button>
          {row?.publicId && (
            <button
              className="btn-secondary !px-3 !py-2 text-sm text-brand"
              onClick={clearImage}
              title="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {row?.publicId ? (
        <div className="overflow-hidden rounded-2xl border border-paper-mute dark:border-ink-mute">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cldUrl(row.publicId, { width: 800 })}
            alt={altRu || slot}
            className="h-48 w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-paper-mute text-sm text-ink-mute dark:border-ink-mute dark:text-paper-mute">
          Нет картинки
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="label">alt RU</label>
          <input className="input" value={altRu} onChange={(e) => setAltRu(e.target.value)} />
        </div>
        <div>
          <label className="label">alt KK</label>
          <input className="input" value={altKk} onChange={(e) => setAltKk(e.target.value)} />
        </div>
        <div>
          <label className="label">alt EN</label>
          <input className="input" value={altEn} onChange={(e) => setAltEn(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={saveAlt} disabled={savingAlt} className="btn-primary !px-4 !py-2 text-sm">
          {savingAlt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить alt
        </button>
      </div>
    </div>
  );
}

function AddCustomSlot({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const slot = name.trim();
    if (!/^[a-z0-9-]{2,40}$/.test(slot)) {
      alert("Имя слота: латиница, цифры, дефис, 2–40 символов");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/admin/images", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot, publicId: "" }),
      });
      setName("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-wrap items-center gap-2">
      <input
        className="input flex-1 min-w-[12rem]"
        placeholder="Новый слот (например, banner-promo)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={add} disabled={busy || !name} className="btn-secondary !px-4 !py-2 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить слот"}
      </button>
    </div>
  );
}
