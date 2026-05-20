"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Box, BOX_TYPE_LABELS, BOX_TYPE_PACKS, BoxType, parseStickerRef } from "@/lib/types";
import { Package, Plus, Camera, List, Hash, ChevronDown, ChevronUp, Loader2, Pencil, Check, X } from "lucide-react";

interface PackLog {
  id: string;
  box_id: string | null;
  pack_number: number | null;
  input_method: string;
  sticker_ids: string[];
  new_count: number;
  opened_at: string;
  boxes?: { box_type: string } | null;
}

interface Props {
  userId: string;
  boxes: Box[];
  packLogs: PackLog[];
  stickers: { id: string; description: string; team_code: string }[];
}

type InputMode = "manual" | "bulk" | "scan";
type Tab = "log" | "boxes" | "history";

export default function PacksClient({ userId, boxes: initialBoxes, packLogs: initialLogs, stickers }: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("log");
  const [boxes, setBoxes] = useState<Box[]>(initialBoxes);
  const [logs, setLogs] = useState<PackLog[]>(initialLogs);

  const [mode, setMode] = useState<InputMode>("manual");
  const [selectedBoxId, setSelectedBoxId] = useState<string>("");
  const [manualInputs, setManualInputs] = useState<string[]>(Array(7).fill(""));
  const [bulkText, setBulkText] = useState("");
  const [scanImage, setScanImage] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showNewBox, setShowNewBox] = useState(false);
  const [newBoxType, setNewBoxType] = useState<BoxType>("regular");
  const [newBoxNotes, setNewBoxNotes] = useState("");
  const [creatingBox, setCreatingBox] = useState(false);

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<string[]>(Array(7).fill(""));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const stickerIds = new Set(stickers.map((s) => s.id));

  function validateIds(ids: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of ids) {
      const ref = parseStickerRef(raw.trim());
      if (stickerIds.has(ref.id)) valid.push(raw.trim().toUpperCase());
      else invalid.push(raw.trim());
    }
    return { valid, invalid };
  }

  function getStickersFromMode(): string[] {
    if (mode === "manual") return manualInputs.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (mode === "bulk") return bulkText.split(/[\s,\n]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (mode === "scan") return scanPreview;
    return [];
  }

  function getNextPackNumber(): number | null {
    if (!selectedBoxId) return null;
    const boxLogs = logs.filter((l) => l.box_id === selectedBoxId);
    if (boxLogs.length === 0) return 1;
    return Math.max(...boxLogs.map((l) => l.pack_number ?? 0)) + 1;
  }

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanImage(file);
    setScanLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setScanPreview(data.sticker_ids ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanLoading(false);
    }
  }

  async function submitPack() {
    setError(null);
    setSuccess(null);
    const stickersToLog = getStickersFromMode();
    if (stickersToLog.length !== 7) { setError(`Need exactly 7 stickers. You have ${stickersToLog.length}.`); return; }
    const { valid, invalid } = validateIds(stickersToLog);
    if (invalid.length > 0) { setError(`Unknown sticker IDs: ${invalid.join(", ")}`); return; }
    setSaving(true);
    try {
      const packNumber = getNextPackNumber();
      const { data: packLog, error: packErr } = await supabase
        .from("pack_logs")
        .insert({ user_id: userId, box_id: selectedBoxId || null, pack_number: packNumber, input_method: mode, sticker_ids: valid, new_count: 0 })
        .select().single();
      if (packErr) throw packErr;
      for (const raw of valid) {
        const ref = parseStickerRef(raw);
        const { data: existing } = await supabase.from("collections").select("id, quantity").eq("user_id", userId).eq("sticker_id", ref.id).eq("variant", ref.variant).maybeSingle();
        if (existing) { await supabase.from("collections").update({ quantity: existing.quantity + 1 }).eq("id", existing.id); }
        else { await supabase.from("collections").insert({ user_id: userId, sticker_id: ref.id, variant: ref.variant, quantity: 1 }); }
      }
      const newCount = valid.filter((raw) => { const ref = parseStickerRef(raw); return !logs.some((l) => l.sticker_ids.some((s) => parseStickerRef(s).id === ref.id)); }).length;
      await supabase.from("pack_logs").update({ new_count: newCount }).eq("id", packLog.id);
      const selectedBox = boxes.find((b) => b.id === selectedBoxId);
      setLogs((prev) => [{ ...packLog, new_count: newCount, boxes: selectedBox ? { box_type: selectedBox.box_type } : null }, ...prev]);
      setSuccess(`Pack logged! ${newCount} new stickers.`);
      setManualInputs(Array(7).fill(""));
      setBulkText("");
      setScanPreview([]);
      setScanImage(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setSaving(false);
    }
  }

  async function createBox() {
    setCreatingBox(true);
    const { data, error } = await supabase.from("boxes").insert({ user_id: userId, box_type: newBoxType, total_packs: BOX_TYPE_PACKS[newBoxType], notes: newBoxNotes || null }).select().single();
    if (!error && data) { setBoxes((prev) => [data, ...prev]); setSelectedBoxId(data.id); setShowNewBox(false); setNewBoxNotes(""); }
    setCreatingBox(false);
  }

  function startEdit(log: PackLog) {
    setEditingLogId(log.id);
    setEditInputs([...log.sticker_ids, ...Array(7).fill("")].slice(0, 7));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingLogId(null);
    setEditInputs(Array(7).fill(""));
    setEditError(null);
  }

  async function saveEdit(logId: string) {
    setEditError(null);
    const ids = editInputs.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (ids.length !== 7) { setEditError(`Need exactly 7 stickers. You have ${ids.length}.`); return; }
    const { valid, invalid } = validateIds(ids);
    if (invalid.length > 0) { setEditError(`Unknown sticker IDs: ${invalid.join(", ")}`); return; }
    setEditSaving(true);
    try {
      const currentLog = logs.find((l) => l.id === logId);
      const oldIds = currentLog?.sticker_ids ?? [];
      const removed = oldIds.filter((old) => !valid.includes(old));
      const added = valid.filter((n) => !oldIds.includes(n));
      for (const raw of removed) {
        const ref = parseStickerRef(raw);
        const { data: existing } = await supabase.from("collections").select("id, quantity").eq("user_id", userId).eq("sticker_id", ref.id).eq("variant", ref.variant).maybeSingle();
        if (existing) {
          if (existing.quantity <= 1) { await supabase.from("collections").delete().eq("id", existing.id); }
          else { await supabase.from("collections").update({ quantity: existing.quantity - 1 }).eq("id", existing.id); }
        }
      }
      for (const raw of added) {
        const ref = parseStickerRef(raw);
        const { data: existing } = await supabase.from("collections").select("id, quantity").eq("user_id", userId).eq("sticker_id", ref.id).eq("variant", ref.variant).maybeSingle();
        if (existing) { await supabase.from("collections").update({ quantity: existing.quantity + 1 }).eq("id", existing.id); }
        else { await supabase.from("collections").insert({ user_id: userId, sticker_id: ref.id, variant: ref.variant, quantity: 1 }); }
      }
      const otherLogs = logs.filter((l) => l.id !== logId);
      const newCount = valid.filter((raw) => { const ref = parseStickerRef(raw); return !otherLogs.some((l) => l.sticker_ids.some((s) => parseStickerRef(s).id === ref.id)); }).length;
      const { error: updateErr } = await supabase.from("pack_logs").update({ sticker_ids: valid, new_count: newCount }).eq("id", logId);
      if (updateErr) throw updateErr;
      setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, sticker_ids: valid, new_count: newCount } : l));
      cancelEdit();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  const selectedBox = boxes.find((b) => b.id === selectedBoxId);
  const boxPackCount = selectedBox ? logs.filter((l) => l.box_id === selectedBoxId).length : 0;

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const cardCls = "bg-[#27272a] rounded-xl p-4";

  return (
    <div className="max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-zinc-700 bg-[#27272a] sticky top-14 z-10">
        {(["log", "boxes", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-blue-400 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Log Pack Tab */}
      {tab === "log" && (
        <div className="px-4 py-5 space-y-4">
          {/* Box selector */}
          <div className={cardCls}>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
              Box (optional)
            </label>
            <select
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
              className={`${inputCls} mb-2`}
            >
              <option value="">— Loose pack (no box) —</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {BOX_TYPE_LABELS[b.box_type]} · {logs.filter((l) => l.box_id === b.id).length}/{b.total_packs} opened
                </option>
              ))}
            </select>
            {selectedBox && (
              <p className="text-xs text-zinc-500">Next pack: #{boxPackCount + 1} of {selectedBox.total_packs}</p>
            )}
            <button
              onClick={() => setShowNewBox(!showNewBox)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2"
            >
              <Plus size={12} /> Add new box {showNewBox ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showNewBox && (
              <div className="mt-3 space-y-2 border-t border-zinc-700 pt-3">
                <select value={newBoxType} onChange={(e) => setNewBoxType(e.target.value as BoxType)} className={inputCls}>
                  {Object.entries(BOX_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
                <input
                  type="text"
                  placeholder="Notes (optional — retailer, batch…)"
                  value={newBoxNotes}
                  onChange={(e) => setNewBoxNotes(e.target.value)}
                  className={inputCls}
                />
                <button
                  onClick={createBox}
                  disabled={creatingBox}
                  className="w-full bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 text-zinc-100 text-sm py-2 rounded-lg transition-colors"
                >
                  {creatingBox ? "Creating…" : "Create box"}
                </button>
              </div>
            )}
          </div>

          {/* Input mode tabs */}
          <div className="flex gap-2">
            {(["manual", "bulk", "scan"] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 flex flex-col items-center py-2 rounded-xl text-xs font-medium border transition-colors ${
                  mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-[#27272a] text-zinc-400 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                {m === "manual" && <Hash size={16} className="mb-1" />}
                {m === "bulk" && <List size={16} className="mb-1" />}
                {m === "scan" && <Camera size={16} className="mb-1" />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Manual mode */}
          {mode === "manual" && (
            <div className={cardCls}>
              <p className="text-xs text-zinc-500 mb-3">Enter each sticker ID. Add variant with a dash: <code className="bg-zinc-700 px-1 rounded text-zinc-300">ARG2-ORANGE</code></p>
              <div className="grid grid-cols-1 gap-2">
                {manualInputs.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => { const next = [...manualInputs]; next[i] = e.target.value.toUpperCase(); setManualInputs(next); }}
                      placeholder={`Sticker ${i + 1} e.g. ARG17`}
                      spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-600 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-zinc-100 placeholder-zinc-600 bg-zinc-700"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk mode */}
          {mode === "bulk" && (
            <div className={cardCls}>
              <p className="text-xs text-zinc-500 mb-2">
                Paste 7 IDs separated by spaces, commas, or newlines. Use <code className="bg-zinc-700 px-1 rounded text-zinc-300">ARG2-ORANGE</code> for variants.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value.toUpperCase())}
                placeholder={"ARG17 ESP15 MEX3 BRA8-ORANGE\nARG2 FRA7 GER11"}
                rows={5}
                spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-600 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-zinc-100 placeholder-zinc-600 bg-zinc-700"
              />
              <p className="text-xs text-zinc-600 mt-1">{bulkText.split(/[\s,\n]+/).filter(Boolean).length}/7 stickers</p>
            </div>
          )}

          {/* Scan mode */}
          {mode === "scan" && (
            <div className={`${cardCls} space-y-3`}>
              <p className="text-xs text-zinc-500">Photograph the back of your 7 stickers. Claude will extract the IDs automatically.</p>
              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-600 rounded-xl cursor-pointer hover:border-blue-500 transition-colors bg-zinc-800">
                <Camera size={24} className="text-zinc-500 mb-1" />
                <span className="text-xs text-zinc-500">Tap to take photo or upload</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} />
              </label>
              {scanLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-400"><Loader2 size={16} className="animate-spin" /> Scanning stickers…</div>
              )}
              {scanPreview.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-300 mb-2">Extracted IDs — tap to correct:</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {Array.from({ length: 7 }, (_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>
                        <input
                          type="text"
                          value={scanPreview[i] ?? ""}
                          onChange={(e) => { const next = [...scanPreview]; next[i] = e.target.value.toUpperCase(); while (next.length < 7) next.push(""); setScanPreview(next.slice(0, 7)); }}
                          className={`flex-1 px-3 py-1.5 text-sm rounded-lg border font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-zinc-100 bg-zinc-700 ${
                            scanPreview[i] ? stickerIds.has(parseStickerRef(scanPreview[i]).id) ? "border-green-500" : "border-red-500" : "border-zinc-600"
                          }`}
                        />
                        {scanPreview[i] && <span className="text-xs">{stickerIds.has(parseStickerRef(scanPreview[i]).id) ? "✅" : "❌"}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">{scanPreview.filter((s) => s && stickerIds.has(parseStickerRef(s).id)).length}/7 valid</p>
                </div>
              )}
            </div>
          )}

          {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}
          {success && <div className="bg-green-900/30 border border-green-700 text-green-400 text-sm rounded-xl px-4 py-3">{success}</div>}

          <button
            onClick={submitPack}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : (<><Package size={16} /> Log pack</>)}
          </button>
        </div>
      )}

      {/* Boxes Tab */}
      {tab === "boxes" && (
        <div className="px-4 py-5 space-y-3">
          {boxes.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">
              <Package size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No boxes yet</p>
              <p className="text-xs mt-1">Add one in the Log tab</p>
            </div>
          ) : (
            boxes.map((box) => {
              const count = logs.filter((l) => l.box_id === box.id).length;
              const pct = Math.round((count / box.total_packs) * 100);
              return (
                <div key={box.id} className={cardCls}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{BOX_TYPE_LABELS[box.box_type]}</p>
                      {box.notes && <p className="text-xs text-zinc-500">{box.notes}</p>}
                    </div>
                    <span className="text-xs font-bold text-blue-400">{pct}%</span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-1.5 mb-1">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-zinc-500">{count}/{box.total_packs} packs opened</p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="px-4 py-5 space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">
              <p className="text-sm">No packs logged yet</p>
            </div>
          ) : (
            logs.map((log) => {
              const isEditing = editingLogId === log.id;
              return (
                <div key={log.id} className={cardCls}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">
                        {log.boxes?.box_type ? BOX_TYPE_LABELS[log.boxes.box_type as BoxType] : "Loose pack"}
                        {log.pack_number ? ` · #${log.pack_number}` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(log.opened_at).toLocaleDateString()} · <span className="capitalize">{log.input_method}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        log.new_count > 4 ? "bg-green-900/50 text-green-400"
                        : log.new_count > 2 ? "bg-blue-900/50 text-blue-400"
                        : "bg-zinc-700 text-zinc-400"
                      }`}>
                        {log.new_count} new
                      </span>
                      {!isEditing && (
                        <button onClick={() => startEdit(log)} className="text-zinc-600 hover:text-blue-400 transition-colors" aria-label="Edit pack">
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-1.5">
                        {Array.from({ length: 7 }, (_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>
                            <input
                              type="text"
                              value={editInputs[i] ?? ""}
                              onChange={(e) => { const next = [...editInputs]; next[i] = e.target.value.toUpperCase(); setEditInputs(next); }}
                              spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                              className={`flex-1 px-3 py-1.5 text-sm rounded-lg border font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-zinc-100 bg-zinc-700 ${
                                editInputs[i] ? stickerIds.has(parseStickerRef(editInputs[i]).id) ? "border-green-500" : "border-red-500" : "border-zinc-600"
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                      {editError && <p className="text-xs text-red-400">{editError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => saveEdit(log.id)}
                          disabled={editSaving}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                        >
                          {editSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold py-2 rounded-lg transition-colors"
                        >
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {log.sticker_ids.map((sid, i) => {
                        const parts = sid.split("-");
                        const variant = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "standard";
                        const variantStyle: Record<string, string> = {
                          standard: "bg-zinc-700 border-zinc-600 text-zinc-200",
                          orange:   "bg-orange-100 border-orange-400 text-orange-900",
                          blue:     "bg-blue-100 border-blue-400 text-blue-900",
                          red:      "bg-red-100 border-red-400 text-red-900",
                          green:    "bg-green-100 border-green-400 text-green-900",
                          purple:   "bg-purple-100 border-purple-400 text-purple-900",
                          black:    "bg-gray-800 border-gray-600 text-white",
                        };
                        const cls = variantStyle[variant] ?? "bg-zinc-700 border-zinc-600 text-zinc-200";
                        return (
                          <span key={i} className={`font-mono text-xs border rounded px-1.5 py-0.5 font-medium ${cls}`}>
                            {sid}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
