"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Box, BOX_TYPE_LABELS, BOX_TYPE_PACKS, BoxType, parseStickerRef } from "@/lib/types";
import { Package, Plus, Camera, List, Hash, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

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

  async function submitPack() {
    setError(null);
    setSuccess(null);
    const stickersToLog = getStickersFromMode();

    if (stickersToLog.length !== 7) {
      setError(`Need exactly 7 stickers. You have ${stickersToLog.length}.`);
      return;
    }

    const { valid, invalid } = validateIds(stickersToLog);
    if (invalid.length > 0) {
      setError(`Unknown sticker IDs: ${invalid.join(", ")}`);
      return;
    }

    setSaving(true);

    try {
      const packNumber = getNextPackNumber();

      // Insert pack log
      const { data: packLog, error: packErr } = await supabase
        .from("pack_logs")
        .insert({
          user_id: userId,
          box_id: selectedBoxId || null,
          pack_number: packNumber,
          input_method: mode,
          sticker_ids: valid,
          new_count: 0,
        })
        .select()
        .single();

      if (packErr) throw packErr;

      // Upsert collection rows
      for (const raw of valid) {
        const ref = parseStickerRef(raw);
        // Check if exists
        const { data: existing } = await supabase
          .from("collections")
          .select("id, quantity")
          .eq("user_id", userId)
          .eq("sticker_id", ref.id)
          .eq("variant", ref.variant)
          .single();

        if (existing) {
          await supabase
            .from("collections")
            .update({ quantity: existing.quantity + 1 })
            .eq("id", existing.id);
        } else {
          await supabase.from("collections").insert({
            user_id: userId,
            sticker_id: ref.id,
            variant: ref.variant,
            quantity: 1,
          });
        }
      }

      // Compute new_count (stickers not previously owned)
      const newCount = valid.filter((raw) => {
        const ref = parseStickerRef(raw);
        return !logs.some((l) =>
          l.sticker_ids.some((s) => parseStickerRef(s).id === ref.id)
        );
      }).length;

      await supabase
        .from("pack_logs")
        .update({ new_count: newCount })
        .eq("id", packLog.id);

      // Update local state
      setLogs((prev) => [{ ...packLog, new_count: newCount }, ...prev]);
      setSuccess(`Pack logged! ${newCount} new stickers.`);

      // Reset inputs
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
                Paste 7 IDs separated by spaces, commas, or newlines.
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
              <p className="text-xs text-gray-400 mt-1">
                {bulkText.split(/[\s,\n]+/).filter(Boolean).length}/7 stickers
              </p>
            </div>
          )}

          {/* Scan mode */}
          {mode === "scan" && (
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-3">
              <p className="text-xs text-gray-500">
                Photograph the back of your 7 stickers. Claude will extract the IDs automatically.
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
                  <div className="grid grid-cols-1 gap-1.5">
                    {Array.from({ length: 7 }, (_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                        <input
                          type="text"
                          value={scanPreview[i] ?? ""}
                          onChange={(e) => {
                            const next = [...scanPreview];
                            next[i] = e.target.value.toUpperCase();
                            while (next.length < 7) next.push("");
                            setScanPreview(next.slice(0, 7));
                          }}
                          className={`flex-1 px-3 py-1.5 text-sm rounded-lg border font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-gray-900 ${
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
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {scanPreview.filter((s) => s && stickerIds.has(parseStickerRef(s).id)).length}/7 valid
                  </p>
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
              <><Package size={16} /> Log pack</>
            )}
          </button>
        </div>
      )}

      {/* Boxes Tab */}
      {tab === "boxes" && (
        <div className="px-4 py-5 space-y-3">
          {boxes.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Package size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No boxes yet</p>
              <p className="text-xs mt-1">Add one in the Log tab</p>
            </div>
          ) : (
            boxes.map((box) => {
              const count = logs.filter((l) => l.box_id === box.id).length;
              const pct = Math.round((count / box.total_packs) * 100);
              return (
                <div key={box.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {BOX_TYPE_LABELS[box.box_type]}
                      </p>
                      {box.notes && (
                        <p className="text-xs text-gray-500">{box.notes}</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-blue-600">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">{count}/{box.total_packs} packs opened</p>
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
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No packs logged yet</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {log.boxes?.box_type
                        ? BOX_TYPE_LABELS[log.boxes.box_type as BoxType]
                        : "Loose pack"}
                      {log.pack_number ? ` · #${log.pack_number}` : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(log.opened_at).toLocaleDateString()} ·{" "}
                      <span className="capitalize">{log.input_method}</span>
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      log.new_count > 4
                        ? "bg-green-100 text-green-700"
                        : log.new_count > 2
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {log.new_count} new
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {log.sticker_ids.map((sid, i) => {
                    const parts = sid.split("-");
                    const variant = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "standard";
                    // All 6 parallels + standard
                    const variantStyle: Record<string, string> = {
                      standard: "bg-gray-50 border-gray-200 text-gray-700",
                      orange:   "bg-orange-100 border-orange-400 text-orange-900",
                      blue:     "bg-blue-100 border-blue-400 text-blue-900",
                      red:      "bg-red-100 border-red-400 text-red-900",
                      green:    "bg-green-100 border-green-400 text-green-900",
                      purple:   "bg-purple-100 border-purple-400 text-purple-900",
                      black:    "bg-gray-800 border-gray-900 text-white",
                    };
                    const cls = variantStyle[variant] ?? "bg-gray-100 border-gray-300 text-gray-700";
                    return (
                      <span
                        key={i}
                        className={`font-mono text-xs border rounded px-1.5 py-0.5 font-medium ${cls}`}
                      >
                        {sid}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
