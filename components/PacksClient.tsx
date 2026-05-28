"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Box, BOX_TYPE_LABELS, BOX_TYPE_PACKS, BoxType, parseStickerRef } from "@/lib/types";
import { Package, Plus, Camera, List, Hash, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import BoxesDetail from "@/components/BoxesDetail";

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

  // Pack logging state
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

  // New box state
  const [showNewBox, setShowNewBox] = useState(false);
  const [newBoxType, setNewBoxType] = useState<BoxType>("regular");
  const [newBoxNotes, setNewBoxNotes] = useState("");
  const [creatingBox, setCreatingBox] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedBoxId, setExpandedBoxId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const stickerIds = new Set(stickers.map((s) => s.id));

  // Validate sticker IDs (strip variant suffix for validation)
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
    if (mode === "bulk") {
      return bulkText
        .split(/[\s,\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    if (mode === "scan") return scanPreview;
    return [];
  }

  // Get next pack number for selected box
  function getNextPackNumber(): number | null {
    if (!selectedBoxId) return null;
    const boxLogs = logs.filter((l) => l.box_id === selectedBoxId);
    if (boxLogs.length === 0) return 1;
    const max = Math.max(...boxLogs.map((l) => l.pack_number ?? 0));
    return max + 1;
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

  // Helper: upsert a single sticker into collection
  async function upsertSticker(raw: string) {
    const ref = parseStickerRef(raw);
    const { data: existing } = await supabase
      .from("collections")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sticker_id", ref.id)
      .eq("variant", ref.variant)
      .maybeSingle();
    if (existing) {
      await supabase.from("collections").update({ quantity: existing.quantity + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("collections").insert({ user_id: userId, sticker_id: ref.id, variant: ref.variant, quantity: 1 });
    }
  }

  async function submitPack() {
    setError(null);
    setSuccess(null);
    const stickersToLog = getStickersFromMode();
    const count = stickersToLog.length;

    // Must be a multiple of 7
    if (count === 0) {
      setError("No stickers entered.");
      return;
    }
    if (count % 7 !== 0) {
      setError(`${count} stickers entered — needs to be a multiple of 7. Add ${7 - (count % 7)} more.`);
      return;
    }

    const { valid, invalid } = validateIds(stickersToLog);
    if (invalid.length > 0) {
      setError(`Unknown sticker IDs: ${invalid.join(", ")}`);
      return;
    }

    setSaving(true);

    try {
      const packCount = valid.length / 7;
      const newLogs: typeof logs = [];

      // Track already-owned IDs before this session for new_count calculation
      const alreadyOwned = new Set(
        logs.flatMap((l) => l.sticker_ids.map((s) => parseStickerRef(s).id))
      );
      // Also track what we've inserted THIS session (so pack 2 sees pack 1's stickers)
      const seenThisSession = new Set<string>();

      // Get starting pack number for box
      let nextPackNum = getNextPackNumber();

      for (let p = 0; p < packCount; p++) {
        const packStickers = valid.slice(p * 7, p * 7 + 7);

        // Insert pack log
        const { data: packLog, error: packErr } = await supabase
          .from("pack_logs")
          .insert({
            user_id: userId,
            box_id: selectedBoxId || null,
            pack_number: nextPackNum !== null ? nextPackNum + p : null,
            input_method: mode,
            sticker_ids: packStickers,
            new_count: 0,
          })
          .select()
          .single();

        if (packErr) throw packErr;

        // Upsert collection for each sticker in this pack
        for (const raw of packStickers) {
          await upsertSticker(raw);
        }

        // Compute new_count: new if not previously owned AND not seen this session
        const newCount = packStickers.filter((raw) => {
          const id = parseStickerRef(raw).id;
          return !alreadyOwned.has(id) && !seenThisSession.has(id);
        }).length;

        // Add this pack's stickers to session tracking
        packStickers.forEach((raw) => seenThisSession.add(parseStickerRef(raw).id));

        await supabase.from("pack_logs").update({ new_count: newCount }).eq("id", packLog.id);
        newLogs.push({ ...packLog, new_count: newCount });
      }

      // Update local state — prepend all new logs
      setLogs((prev) => [...newLogs.reverse(), ...prev]);
      const totalNew = newLogs.reduce((s, l) => s + l.new_count, 0);
      setSuccess(
        packCount === 1
          ? `Pack logged! ${totalNew} new stickers.`
          : `${packCount} packs logged! ${totalNew} new stickers total.`
      );

      // Reset inputs
      setManualInputs(Array(7).fill(""));
      setBulkText("");
      setScanPreview([]);
      setScanImage(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save packs");
    } finally {
      setSaving(false);
    }
  }

  async function createBox() {
    setCreatingBox(true);
    const { data, error } = await supabase
      .from("boxes")
      .insert({
        user_id: userId,
        box_type: newBoxType,
        total_packs: BOX_TYPE_PACKS[newBoxType],
        notes: newBoxNotes || null,
      })
      .select()
      .single();

    if (!error && data) {
      setBoxes((prev) => [data, ...prev]);
      setSelectedBoxId(data.id);
      setShowNewBox(false);
      setNewBoxNotes("");
    }
    setCreatingBox(false);
  }

  async function deletePackLog(logId: string) {
    setDeletingId(logId);
    const log = logs.find((l) => l.id === logId);
    if (!log) { setDeletingId(null); return; }

    try {
      // Decrement collection for each sticker in this pack
      for (const raw of log.sticker_ids) {
        const ref = parseStickerRef(raw);
        const { data: existing } = await supabase
          .from("collections")
          .select("id, quantity")
          .eq("user_id", userId)
          .eq("sticker_id", ref.id)
          .eq("variant", ref.variant)
          .maybeSingle();
        if (existing) {
          if (existing.quantity <= 1) {
            await supabase.from("collections").delete().eq("id", existing.id);
          } else {
            await supabase.from("collections").update({ quantity: existing.quantity - 1 }).eq("id", existing.id);
          }
        }
      }
      // Delete the pack log
      await supabase.from("pack_logs").delete().eq("id", logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete pack");
    } finally {
      setDeletingId(null);
    }
  }

  const selectedBox = boxes.find((b) => b.id === selectedBoxId);
  const boxPackCount = selectedBox
    ? logs.filter((l) => l.box_id === selectedBoxId).length
    : 0;

  return (
    <div className="max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white sticky top-14 z-10">
        {(["log", "boxes", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
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
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Box (optional)
            </label>
            <select
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 text-gray-900"
            >
              <option value="">— Loose pack (no box) —</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {BOX_TYPE_LABELS[b.box_type]} ·{" "}
                  {logs.filter((l) => l.box_id === b.id).length}/{b.total_packs} opened
                </option>
              ))}
            </select>
            {selectedBox && (
              <p className="text-xs text-gray-500">
                Next pack: #{boxPackCount + 1} of {selectedBox.total_packs}
              </p>
            )}
            <button
              onClick={() => setShowNewBox(!showNewBox)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2"
            >
              <Plus size={12} />
              Add new box
              {showNewBox ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showNewBox && (
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <select
                  value={newBoxType}
                  onChange={(e) => setNewBoxType(e.target.value as BoxType)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  {Object.entries(BOX_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Notes (optional — retailer, batch…)"
                  value={newBoxNotes}
                  onChange={(e) => setNewBoxNotes(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                />
                <button
                  onClick={createBox}
                  disabled={creatingBox}
                  className="w-full bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
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
                  mode === m
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
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
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 mb-3">Enter each sticker ID. Add variant with a dash: <code className="bg-gray-100 px-1 rounded">ARG2-ORANGE</code></p>
              <div className="grid grid-cols-1 gap-2">
                {manualInputs.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => {
                        const next = [...manualInputs];
                        next[i] = e.target.value.toUpperCase();
                        setManualInputs(next);
                      }}
                      placeholder={`Sticker ${i + 1} e.g. ARG17`}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="characters"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-gray-900 placeholder-gray-400 bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk mode */}
          {mode === "bulk" && (
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 mb-2">
                Paste stickers separated by spaces, commas, or newlines. Must be a multiple of 7 (14, 21, 28...).
                Use <code className="bg-gray-100 px-1 rounded">ARG2-ORANGE</code> for variants.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value.toUpperCase())}
                placeholder={"ARG17 ESP15 MEX3 BRA8-ORANGE\nARG2 FRA7 GER11"}
                rows={5}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 placeholder-gray-400 bg-white"
              />
              {(() => {
                const count = bulkText.split(/[\s,\n]+/).filter(Boolean).length;
                const packs = Math.floor(count / 7);
                const rem = count % 7;
                const isValid = count > 0 && rem === 0;
                const color = count === 0 ? "#9ca3af" : isValid ? "#4ade80" : "#f87171";
                return (
                  <p className="text-xs mt-1" style={{ color }}>
                    {count} stickers
                    {count > 0 && (
                      <span> · {isValid
                        ? `${packs} pack${packs > 1 ? "s" : ""} ✓`
                        : `needs ${7 - rem} more to complete pack ${packs + 1}`}
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Scan mode */}
          {mode === "scan" && (
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-3">
              <p className="text-xs text-gray-500">
                Photograph sticker backs — up to 4 packs (28 stickers) per photo. Must be a multiple of 7. Claude extracts the IDs automatically.
              </p>
              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 transition-colors bg-gray-50">
                <Camera size={24} className="text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Tap to take photo or upload</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScan}
                />
              </label>

              {scanLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 size={16} className="animate-spin" />
                  Scanning stickers…
                </div>
              )}

              {scanPreview.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Extracted IDs — tap to correct:
                  </p>
                  {(() => {
                    // Round up to next multiple of 7 for slot count (min 7, max 28)
                    const filled = scanPreview.filter(s => s.trim()).length;
                    const slotCount = Math.min(28, Math.max(7, Math.ceil(filled / 7) * 7));
                    const packs = slotCount / 7;
                    const validCount = scanPreview.filter((s) => s && stickerIds.has(parseStickerRef(s).id)).length;
                    const rem = filled % 7;
                    const isValid = filled > 0 && rem === 0;
                    return (
                      <>
                        {Array.from({ length: packs }, (_, packIdx) => (
                          <div key={packIdx} className="mb-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1.5">Pack {packIdx + 1}</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {Array.from({ length: 7 }, (_, j) => {
                                const i = packIdx * 7 + j;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 w-5 text-right">{j + 1}</span>
                                    <input
                                      type="text"
                                      value={scanPreview[i] ?? ""}
                                      onChange={(e) => {
                                        const next = [...scanPreview];
                                        while (next.length <= i) next.push("");
                                        next[i] = e.target.value.toUpperCase();
                                        setScanPreview(next);
                                      }}
                                      spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                                      className={`flex-1 px-3 py-1.5 text-base rounded-lg border font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-gray-900 ${
                                        scanPreview[i]
                                          ? stickerIds.has(parseStickerRef(scanPreview[i]).id)
                                            ? "border-green-300 bg-green-50"
                                            : "border-red-300 bg-red-50"
                                          : "border-gray-200"
                                      }`}
                                    />
                                    {scanPreview[i] && (
                                      <span className="text-xs">
                                        {stickerIds.has(parseStickerRef(scanPreview[i]).id) ? "✅" : "❌"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <p className="text-xs mt-1" style={{ color: isValid ? "#4ade80" : filled > 0 ? "#f87171" : "#9ca3af" }}>
                          {validCount} valid · {filled} filled
                          {filled > 0 && !isValid && ` · needs ${7 - rem} more for pack ${Math.floor(filled / 7) + 1}`}
                          {isValid && ` · ${filled / 7} pack${filled / 7 > 1 ? "s" : ""} ✓`}
                        </p>
                        {filled > 0 && filled < 28 && isValid && (
                          <button
                            onClick={() => setScanPreview(prev => [...prev, ...Array(7).fill("")])}
                            className="text-xs text-blue-500 hover:text-blue-400 mt-1"
                          >
                            + Add another pack slot
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Errors / success */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submitPack}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : (
              <><Package size={16} /> {mode === "manual" ? "Log pack" : `Log ${Math.floor((mode === "bulk" ? bulkText.split(/[\s,\n]+/).filter(Boolean).length : scanPreview.filter(s=>s.trim()).length) / 7) || 1} pack${Math.floor((mode === "bulk" ? bulkText.split(/[\s,\n]+/).filter(Boolean).length : scanPreview.filter(s=>s.trim()).length) / 7) > 1 ? "s" : ""}`}</>
            )}
          </button>
        </div>
      )}

            {tab === "boxes" && (
        <BoxesDetail
          boxes={boxes}
          logs={logs}
          stickers={stickers}
          expandedBoxId={expandedBoxId}
          setExpandedBoxId={setExpandedBoxId}
        />
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="px-4 py-5 space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <p className="text-sm">No packs logged yet</p>
            </div>
          ) : (
            logs.map((log) => {
              const isConfirming = confirmDeleteId === log.id;
              const isDeleting = deletingId === log.id;
              const variantStyle: Record<string, string> = {
                standard: "bg-zinc-800 border-zinc-600 text-zinc-200",
                orange:   "bg-orange-900/50 border-orange-500 text-orange-300",
                blue:     "bg-blue-900/50 border-blue-500 text-blue-300",
                red:      "bg-red-900/50 border-red-500 text-red-300",
                green:    "bg-green-900/50 border-green-500 text-green-300",
                purple:   "bg-purple-900/50 border-purple-500 text-purple-300",
                black:    "bg-zinc-900 border-zinc-500 text-zinc-300",
              };
              return (
                <div key={log.id} className={`rounded-xl p-4 border shadow-sm transition-all ${
                  isConfirming ? "bg-red-950 border-red-800" : "bg-zinc-800 border-zinc-700"
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">
                        {log.boxes?.box_type
                          ? BOX_TYPE_LABELS[log.boxes.box_type as BoxType]
                          : "Loose pack"}
                        {log.pack_number ? ` · #${log.pack_number}` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(log.opened_at).toLocaleDateString()} ·{" "}
                        <span className="capitalize">{log.input_method}</span>
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
                      {!isConfirming && (
                        <button
                          onClick={() => setConfirmDeleteId(log.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sticker chips */}
                  {!isConfirming && (
                    <div className="flex flex-wrap gap-1">
                      {log.sticker_ids.map((sid, i) => {
                        const parts = sid.split("-");
                        const variant = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "standard";
                        const cls = variantStyle[variant] ?? variantStyle.standard;
                        return (
                          <span key={i} className={`font-mono text-xs border rounded px-1.5 py-0.5 font-medium ${cls}`}>
                            {sid}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Delete confirmation */}
                  {isConfirming && (
                    <div>
                      <p className="text-xs text-red-300 mb-3">
                        Delete this pack log? Collection quantities will be decremented for all {log.sticker_ids.length} stickers.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 py-2 rounded-lg bg-zinc-700 text-zinc-300 text-xs font-semibold hover:bg-zinc-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deletePackLog(log.id)}
                          disabled={isDeleting}
                          className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      </div>
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
