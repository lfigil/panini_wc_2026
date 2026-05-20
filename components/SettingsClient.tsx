"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";

interface Props {
  email: string;
  displayName: string;
  stats: { packs: number; stickers: number; boxes: number };
}

type ResetStep = "idle" | "confirm1" | "confirm2" | "deleting" | "done";

export default function SettingsClient({ email, displayName, stats }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<ResetStep>("idle");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function executeReset() {
    setStep("deleting");
    setError(null);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setStep("done");
      // Redirect to dashboard after 2 seconds
      setTimeout(() => router.push("/dashboard"), 2000);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
      setStep("confirm2");
    }
  }

  const ss = { background: "#27272a", borderRadius: "16px", padding: "16px", marginBottom: "12px" };
  const inputCls = "w-full text-sm px-3 py-2.5 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono tracking-widest";

  return (
    <div style={{ padding: "16px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Profile info */}
      <div style={ss}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#f4f4f5", marginBottom: "12px" }}>Account</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#71717a" }}>Display name</span>
            <span style={{ fontSize: "12px", color: "#f4f4f5", fontWeight: 500 }}>{displayName}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#71717a" }}>Email</span>
            <span style={{ fontSize: "12px", color: "#f4f4f5" }}>{email}</span>
          </div>
        </div>
      </div>

      {/* Data summary */}
      <div style={ss}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#f4f4f5", marginBottom: "12px" }}>Your data</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          {[
            { label: "Packs logged", value: stats.packs, color: "#60a5fa" },
            { label: "Sticker entries", value: stats.stickers, color: "#4ade80" },
            { label: "Boxes", value: stats.boxes, color: "#f97316" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#18181b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <p style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</p>
              <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reset section */}
      <div style={{ ...ss, border: "1px solid #7f1d1d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <AlertTriangle size={15} color="#f87171" />
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#f87171" }}>Reset collection data</p>
        </div>
        <p style={{ fontSize: "12px", color: "#71717a", marginBottom: "16px", lineHeight: 1.6 }}>
          Permanently deletes all your packs, boxes, and collection entries.
          Sticker master data and other users are not affected. This cannot be undone.
        </p>

        {/* Step 0 — idle */}
        {step === "idle" && (
          <button
            onClick={() => setStep("confirm1")}
            style={{
              width: "100%", padding: "11px", borderRadius: "10px",
              background: "transparent", border: "1px solid #7f1d1d",
              color: "#f87171", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}
          >
            <Trash2 size={14} />
            Reset my data
          </button>
        )}

        {/* Step 1 — first confirmation */}
        {step === "confirm1" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ background: "#450a0a", borderRadius: "10px", padding: "12px" }}>
              <p style={{ fontSize: "12px", color: "#fca5a5", fontWeight: 600, marginBottom: "4px" }}>
                ⚠️ This will delete:
              </p>
              <ul style={{ fontSize: "12px", color: "#f87171", paddingLeft: "16px", margin: 0, lineHeight: 2 }}>
                <li>{stats.packs} pack logs</li>
                <li>{stats.boxes} boxes</li>
                <li>{stats.stickers} collection entries</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setStep("idle")}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", background: "#3f3f46", border: "none", color: "#a1a1aa", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("confirm2")}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", background: "#7f1d1d", border: "none", color: "#fca5a5", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — type RESET */}
        {step === "confirm2" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "12px", color: "#a1a1aa" }}>
              Type <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#f87171" }}>RESET</span> to confirm permanent deletion:
            </p>
            <input
              type="text"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value.toUpperCase())}
              placeholder="Type RESET here"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="characters"
              className={inputCls}
            />
            {error && (
              <p style={{ fontSize: "12px", color: "#f87171" }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { setStep("idle"); setTypedConfirm(""); setError(null); }}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", background: "#3f3f46", border: "none", color: "#a1a1aa", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={executeReset}
                disabled={typedConfirm !== "RESET"}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  background: typedConfirm === "RESET" ? "#dc2626" : "#3f3f46",
                  border: "none",
                  color: typedConfirm === "RESET" ? "white" : "#52525b",
                  fontSize: "13px", fontWeight: 600,
                  cursor: typedConfirm === "RESET" ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  transition: "background 0.15s",
                }}
              >
                <Trash2 size={13} />
                Delete everything
              </button>
            </div>
          </div>
        )}

        {/* Deleting */}
        {step === "deleting" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", color: "#f87171" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "13px" }}>Deleting your data…</span>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "12px" }}>
            <p style={{ fontSize: "20px", marginBottom: "6px" }}>✅</p>
            <p style={{ fontSize: "13px", color: "#4ade80", fontWeight: 600 }}>Data deleted successfully</p>
            <p style={{ fontSize: "11px", color: "#52525b", marginTop: "4px" }}>Redirecting to dashboard…</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
