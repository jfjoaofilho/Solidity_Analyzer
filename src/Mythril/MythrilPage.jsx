// MythrilPageIntegration.jsx
import React, { useState } from "react";

export default function MythrilPageIntegration({ goHome }) {
  const [code, setCode] = useState("// Cole seu contrato Solidity aqui\n");
  const [maxDepth, setMaxDepth] = useState(5);
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState("");
  const [issues, setIssues] = useState([]);

  async function runRealAnalysis() {
    setIsRunning(true);
    setProgress(5);
    setLogs("Enviando contrato para análise Mythril...\n");
    setIssues([]);

    try {
      const resp = await fetch("http://localhost:8000/analyze-mythril", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          contract_name: null,
          max_depth: Number(maxDepth),
          timeout_sec: Number(timeoutSec),
        }),
      });

      setProgress(30);
      const json = await resp.json();
      setProgress(70);

      if (!json.success) {
        setLogs((l) => l + "Resposta sem formato esperado. Ver logs.\n");
        setLogs((l) => l + JSON.stringify(json, null, 2) + "\n");
        setIsRunning(false);
        setProgress(100);
        return;
      }

      setIssues(json.issues || []);
      const out = `=== STDOUT ===\n${json.stdout || ""}\n\n=== STDERR ===\n${json.stderr || ""}\n`;
      setLogs((l) => l + out);
      setProgress(100);
    } catch (err) {
      setLogs((l) => l + `Erro ao conectar ao backend: ${String(err)}\n`);
    } finally {
      setIsRunning(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  return (
    <div style={{ background: "#0a0a0b", color: "#e6e6e6", fontFamily: "monospace", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h1 style={{ color: "#10b981" }}>Mythril — Análise Simbólica</h1>
          <button onClick={goHome} style={{ background: "transparent", border: "1px solid #2b2b2b", color: "#ddd", padding: "6px 10px", borderRadius: 6 }}>Voltar</button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 18 }}>
          <div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} style={{ width: "100%", height: 420, background: "#090909", color: "#e6e6e6", padding: 12, borderRadius: 8, border: "1px solid #222", fontFamily: "monospace" }} />
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <label>Profundidade:</label>
              <input type="number" value={maxDepth} min={1} max={20} onChange={(e) => setMaxDepth(e.target.value)} style={{ width: 80, padding: 6, borderRadius: 6, background: "#111", color: "#eee", border: "1px solid #2b2b2b" }} />
              <label>Timeout (s):</label>
              <input type="number" value={timeoutSec} min={10} max={600} onChange={(e) => setTimeoutSec(e.target.value)} style={{ width: 100, padding: 6, borderRadius: 6, background: "#111", color: "#eee", border: "1px solid #2b2b2b" }} />
              <button
                onClick={runRealAnalysis}
                disabled={isRunning}
                style={{
                  marginLeft: "auto",
                  background: isRunning ? "#333" : "#10b981",
                  color: isRunning ? "#999" : "#000",
                  padding: "8px 12px",
                  borderRadius: 6,
                  transition: "all 0.2s ease",
                  cursor: isRunning ? "not-allowed" : "pointer"
                }}
              >
                {isRunning ? "⏳ Analisando..." : "▶️ Executar Mythril"}
              </button>

            </div>

            <div style={{ marginTop: 12, height: 8, background: "#111", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#10b981,#06b6d4)", transition: "width 300ms" }} />
            </div>
          </div>

          <aside style={{ background: "#0b0b0c", padding: 12, borderRadius: 8, border: "1px solid #222", height: 520, overflowY: "auto" }}>
            <h3 style={{ color: "#10b981" }}>Vulnerabilidades</h3>
            {issues.length === 0 ? (
              <div style={{ color: "#9ca3af", marginTop: 8 }}>Nenhuma issue retornada.</div>
            ) : (
              issues.map((it, idx) => (
                <div key={idx} style={{ border: "1px solid #202020", padding: 10, marginTop: 10, borderRadius: 6, background: "#080808" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700 }}>{it.title || it.extra?.title || "Vulnerability"}</div>
                    <div style={{ color: it.severity === "High" ? "#ef4444" : it.severity === "Medium" ? "#f59e0b" : "#10b981", fontWeight: 700 }}>{it.severity || "Unknown"}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>{it.id || it.extra?.swc_id || ""}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#d1d5db" }}>{it.description || it.extra?.description || ""}</div>

                  {it.locations && Array.isArray(it.locations) && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Locations:</div>
                      {it.locations.map((loc, i) => (
                        <pre key={i} style={{ background: "#060606", padding: 8, borderRadius: 6, fontSize: 12, color: "#cbd5e1" }}>{JSON.stringify(loc, null, 2)}</pre>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <a target="_blank" rel="noreferrer" href={`https://swcregistry.io/docs/${it.id || ''}`} style={{ color: "#10b981", marginRight: 8 }}>SWC</a>
                    <a target="_blank" rel="noreferrer" href="https://consensys.github.io/smart-contract-best-practices/known_attacks/" style={{ color: "#10b981" }}>Consensys</a>
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 18 }}>
              <h4 style={{ color: "#10b981" }}>Logs</h4>
              <pre style={{ background: "#050505", color: "#cbd5e1", padding: 8, borderRadius: 6, fontSize: 12, height: 220, overflow: "auto" }}>{logs}</pre>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
