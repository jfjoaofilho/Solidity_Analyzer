import React, { useState, useEffect } from "react";

// Solidity-IA-Analyzer
// Single-file React component using Tailwind CSS for styling.
// Features implemented:
// - Upload or paste Solidity contract code
// - Simple IA-like static analysis (pattern based) to detect common issues
// - Vulnerability cards categorized by severity (High, Medium, Low, Informational)
// - Report generation and download (JSON)
// - Analysis history persisted in localStorage
// - Dark professional theme (#0f0f10) with green (#10b981) and red (#ef4444) accents

export default function SolidityIAAnalyzer() {
  const [code, setCode] = useState("// Paste or upload your Solidity contract here\n");
  const [filename, setFilename] = useState("contract.sol");
  const [vulns, setVulns] = useState([]);
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sia_history_v1");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("sia_history_v1", JSON.stringify(history));
  }, [history]);

  const severityMeta = {
    High: { color: "#ef4444", rank: 3 },
    Medium: { color: "#f59e0b", rank: 2 },
    Low: { color: "#10b981", rank: 1 },
    Informational: { color: "#94a3b8", rank: 0 },
  };

  // A simple rule-based analyzer to simulate static analysis.
  // In production, you'd call a backend LLM / symbolic analyzer and replace this.
  function analyzeCode(source) {
    const results = [];
    const lines = source.split("\n");

    // Helper
    const push = (title, description, severity, location) =>
      results.push({ title, description, severity, location });

    // 1. Reentrancy-ish patterns (use of call.value / transfer after external calls)
    lines.forEach((l, idx) => {
      if (/\.call\(/.test(l) && /value/.test(l)) {
        push(
          "Potential reentrancy via low-level call with value",
          "Use of low-level .call{value:...}() can enable reentrancy if state updates occur after the call. Consider Checks-Effects-Interactions and ReentrancyGuard.",
          "High",
          `line ${idx + 1}`
        );
      }
      if (/transfer\(|send\(/.test(l)) {
        push(
          "Use of send/transfer",
          "transfer/send can fail with increased gas costs or in some EVM upgrades; prefer using call with proper checks and pull-payments pattern.",
          "Medium",
          `line ${idx + 1}`
        );
      }
      if (/tx\.origin/.test(l)) {
        push(
          "Use of tx.origin",
          "Using tx.origin for authentication is insecure — it can be spoofed via intermediary contracts. Use msg.sender instead.",
          "High",
          `line ${idx + 1}`
        );
      }
      if (/delegatecall\(/.test(l)) {
        push(
          "delegatecall used",
          "delegatecall executes code in the context of the caller and can change storage; ensure trusted target and upgrades pattern is secure.",
          "High",
          `line ${idx + 1}`
        );
      }
      if (/pragma solidity\s+\^?0\.[0-7]+\./i.test(l)) {
        push(
          "Outdated pragma (pre-0.8.x)",
          "Solidity versions before 0.8.x do not have built-in overflow checks. Consider using ^0.8.0 or adding SafeMath.",
          "High",
          `line ${idx + 1}`
        );
      }
      if (/assembly\b/.test(l)) {
        push(
          "Inline assembly present",
          "Inline assembly can bypass safety checks — ensure correctness and add comments/tests covering behavior.",
          "Medium",
          `line ${idx + 1}`
        );
      }
    });

    // 2. Patterns across the file: missing ownership checks, open access
    if (/function\s+.*public\s*/.test(source) && /onlyOwner|owner\b/.test(source) === false) {
      push(
        "Public functions without ownership checks",
        "Public or external functions that modify state should be protected with access control where appropriate (Ownable, AccessControl).",
        "Medium",
        "file"
      );
    }

    // 3. Math issues - search for unchecked arithmetic or absence of SafeMath in pre-0.8
    if (/\b\+\+|\-\-/.test(source) && /unchecked\b/.test(source)) {
      push(
        "Unchecked arithmetic block",
        "Found 'unchecked' usage — verify that overflow/underflow is intentional and covered by tests.",
        "Low",
        "file"
      );
    }

    // 4. Events not emitted on sensitive actions
    if (/transfer\(|mint\(|burn\(/i.test(source) && /event\s+/i.test(source) === false) {
      push(
        "No events for token operations",
        "Consider emitting events for transfers, mints, burns, and important state changes to improve auditability.",
        "Informational",
        "file"
      );
    }

    // 5. Known insecure constructs
    if (/selfdestruct\(/i.test(source)) {
      push(
        "selfdestruct usage",
        "selfdestruct (formerly suicide) permanently removes contract code — usually dangerous and can open funds loss or upgrade issues.",
        "High",
        "file"
      );
    }

    // 6. Gas/Loop concerns
    const forLoopMatches = source.match(/for\s*\([^\)]*\)\s*\{/g);
    if (forLoopMatches && forLoopMatches.length > 2) {
      push(
        "Multiple loops",
        "Multiple or deep loops may hit gas limits—consider bounding iterations or moving heavy work off-chain.",
        "Low",
        "file"
      );
    }

    // 7. Heuristic: large contract size
    const byteSize = new Blob([source]).size;
    if (byteSize > 24576) {
      push(
        "Large contract size",
        "Contract size exceeds typical limits for deployment in a single file — consider splitting or using proxies.",
        "Informational",
        "file"
      );
    }

    // Deduplicate by title/location
    const dedup = [];
    const seen = new Set();
    for (const r of results) {
      const key = `${r.title}|${r.location}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(r);
      }
    }

    // Sort by severity rank
    dedup.sort((a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank);
    return dedup;
  }

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const findings = analyzeCode(code);
        setVulns(findings);
        const entry = {
          id: Date.now(),
          filename,
          timestamp: new Date().toISOString(),
          codeSnippet: code.slice(0, 400),
          findings,
          notes,
        };
        setHistory((h) => [entry, ...h].slice(0, 50));
      } finally {
        setIsAnalyzing(false);
      }
    }, 400); // simulate async work
  };

  const handleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCode(String(ev.target.result));
    reader.readAsText(f);
  };

  const severityColor = (sev) => severityMeta[sev]?.color || "#94a3b8";

  const downloadReport = () => {
    const payload = { filename, timestamp: new Date().toISOString(), findings: vulns, notes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename || "report"}-sia-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
  if (!window.confirm("Clear saved analysis history?")) return;
  setHistory([]);
};

  return (
    <div className="min-h-screen p-6" style={{ background: "#0f0f10", color: "#e6eef8" }}>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Solidity IA Analyzer</h1>
            <p className="text-sm text-gray-400">Static vulnerability analysis + report generator</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="px-3 py-2 rounded bg-gray-800 text-sm cursor-pointer border border-gray-700">
              Upload
              <input type="file" accept=".sol" className="hidden" onChange={handleUpload} />
            </label>
            <button
              onClick={handleAnalyze}
              className="px-4 py-2 rounded bg-gradient-to-r from-green-600 to-green-500 text-black font-medium"
            >
              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
            </button>
            <button onClick={downloadReport} className="px-3 py-2 rounded border border-gray-700 text-sm">
              Download Report
            </button>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-6">
          {/* Editor + Controls */}
          <section className="col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">File</span>
                <input
                  className="bg-transparent border-b border-gray-700 text-sm outline-none px-2 py-1 w-48"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Notes</span>
                <input
                  className="bg-transparent border-b border-gray-700 text-sm outline-none px-2 py-1 w-64"
                  placeholder="Optional notes about this analysis"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 overflow-hidden" style={{ background: "#09090a" }}>
              <textarea
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-[480px] p-4 font-mono text-sm bg-transparent text-gray-100 placeholder-gray-600"
              />
            </div>

            <div className="mt-3 flex gap-3">
              <button onClick={() => { setCode(""); setVulns([]); }} className="px-3 py-2 rounded border border-gray-700 text-sm">Clear</button>
              <button onClick={() => { navigator.clipboard.writeText(code); }} className="px-3 py-2 rounded border border-gray-700 text-sm">Copy</button>
            </div>
          </section>

          {/* Right column: Vulnerabilities + History */}
          <aside className="col-span-5">
            <div className="rounded-xl p-4 border border-gray-800 mb-4" style={{ background: "#0b0b0c" }}>
              <h2 className="text-lg font-medium mb-2">Vulnerabilities</h2>
              {vulns.length === 0 ? (
                <div className="text-sm text-gray-400">No findings yet. Run analysis to populate the report.</div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-auto pr-2">
                  {vulns.map((v, i) => (
                    <div key={i} className="p-3 rounded-lg border" style={{ borderColor: '#1f2937', background: '#071014' }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: severityColor(v.severity) }} />
                            <div className="font-semibold">{v.title}</div>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{v.location}</div>
                        </div>
                        <div className="text-sm font-medium" style={{ color: severityColor(v.severity) }}>{v.severity}</div>
                      </div>
                      <div className="mt-2 text-sm text-gray-300">{v.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Severity legend */}
              <div className="mt-4 flex gap-3 text-xs text-gray-400">
                <LegendDot color="#ef4444" label="High" />
                <LegendDot color="#f59e0b" label="Medium" />
                <LegendDot color="#10b981" label="Low" />
                <LegendDot color="#94a3b8" label="Informational" />
              </div>

            </div>

            <div className="rounded-xl p-4 border border-gray-800" style={{ background: '#071018' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">History</h3>
                <div className="text-sm text-gray-400">{history.length} saved</div>
              </div>

              <div className="max-h-56 overflow-auto space-y-2">
                {history.length === 0 && <div className="text-sm text-gray-400">No past analyses saved.</div>}
                {history.map((h) => (
                  <div key={h.id} className="p-3 rounded border border-gray-800 hover:bg-gray-900 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{h.filename}</div>
                        <div className="text-xs text-gray-400">{new Date(h.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="text-xs text-gray-400">{h.findings.length} findings</div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="px-2 py-1 rounded border border-gray-700 text-xs" onClick={() => { setCode(h.codeSnippet); setVulns(h.findings); setFilename(h.filename); }}>Load</button>
                      <button className="px-2 py-1 rounded border border-gray-700 text-xs" onClick={() => { const blob = new Blob([JSON.stringify(h, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${h.filename}-${h.id}.json`; a.click(); URL.revokeObjectURL(url); }}>Export</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex justify-end">
                <button onClick={clearHistory} className="px-3 py-2 rounded border border-gray-700 text-sm">Clear history</button>
              </div>
            </div>
          </aside>

          {/* Full-width report preview */}
          <section className="col-span-12 mt-6">
            <div className="rounded-xl border border-gray-800 p-4" style={{ background: '#081018' }}>
              <h2 className="text-lg font-medium mb-2">Detailed Report</h2>
              <div className="text-sm text-gray-300 mb-3">Summary for: <span className="font-mono">{filename}</span></div>

              <div className="grid grid-cols-3 gap-4">
                <StatCard label="High" value={vulns.filter(v=>v.severity==='High').length} color="#ef4444" />
                <StatCard label="Medium" value={vulns.filter(v=>v.severity==='Medium').length} color="#f59e0b" />
                <StatCard label="Low" value={vulns.filter(v=>v.severity==='Low').length} color="#10b981" />
              </div>

              <div className="mt-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-200 font-mono p-3 rounded border border-gray-800 bg-[#061017]">{vulns.length === 0 ? 'No findings to display.' : vulns.map((v,i)=>`[${v.severity}] ${v.title} (${v.location})\n  - ${v.description}\n`).join('\n')}</pre>
              </div>

            </div>
          </section>
        </main>

      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 12, height: 12, background: color }} className="rounded-full" />
      <div>{label}</div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="p-3 rounded border" style={{ borderColor: '#12202b', background: '#07131a' }}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}
