import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
// Full multi-page analyzer: main menu + individual tool pages
// Pages: MenuPage, SlitherPage, MythrilPage, ForgePage

export default function SolidityAnalyzerApp() {
  const [page, setPage] = useState("menu");
  const [code, setCode] = useState("// Paste or upload your Solidity contract here\n");

  const renderPage = () => {
    switch (page) {
      case "slither":
        return <SlitherPage code={code} setCode={setCode} goHome={() => setPage("menu")} />;
      case "mythril":
        return <MythrilPage code={code} setCode={setCode} goHome={() => setPage("menu")} />;
      case "forge":
        return <ForgePage code={code} setCode={setCode} goHome={() => setPage("menu")} />;
      default:
        return <MenuPage setPage={setPage} />;
    }
  };

  return <div>{renderPage()}</div>;
}

// ------------------ Menu Page ------------------
function MenuPage({ setPage }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0f0f10', color: '#e6eef8' }}>
      <h1 className="text-3xl font-bold mb-8">Solidity Analysis Suite</h1>
      <p className="text-gray-400 mb-8">Escolha uma ferramenta de análise abaixo:</p>
      <div className="flex gap-6">
        <MenuButton label="Slither" onClick={() => setPage('slither')} desc="Análise estática de vulnerabilidades" />
        <MenuButton label="Mythril" onClick={() => setPage('mythril')} desc="Análise simbólica e execução simbólica" />
        <MenuButton label="Forge (Foundry)" onClick={() => setPage('forge')} desc="Testes automatizados, fuzzing e gas" />
      </div>
    </div>
  );
}

function MenuButton({ label, desc, onClick }) {
  return (
    <div className="p-6 w-60 rounded-xl border border-gray-700 bg-[#111113] hover:bg-[#17181a] cursor-pointer transition" onClick={onClick}>
      <h2 className="text-xl font-semibold mb-2 text-green-400">{label}</h2>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}

// ------------------ Slither Page ------------------

const severityMeta = {
  High: { color: "#ef4444", rank: 3 },
  Medium: { color: "#f59e0b", rank: 2 },
  Low: { color: "#10b981", rank: 1 },
  Informational: { color: "#94a3b8", rank: 0 },
};
function severityColor(sev) {
  return severityMeta[sev]?.color || "#94a3b8";
}

function mapToSwc(title, description) {
  const text = (title + " " + description).toLowerCase();

  const swcTable = [
    { id: "SWC-100", keywords: ["function default visibility"], category: "Visibility" },
    { id: "SWC-101", keywords: ["integer overflow", "unchecked arithmetic"], category: "Arithmetic" },
    { id: "SWC-102", keywords: ["outdated compiler", "old compiler", "pragma 0.4", "0.5"], category: "Environment" },
    { id: "SWC-103", keywords: ["floating pragma"], category: "Environment" },
    { id: "SWC-104", keywords: ["unchecked call", "external call without check"], category: "External Calls" },
    { id: "SWC-105", keywords: ["unprotected function", "public function", "access control"], category: "Access Control" },
    { id: "SWC-106", keywords: ["selfdestruct", "suicide"], category: "Denial of Service" },
    { id: "SWC-107", keywords: ["reentrancy", "call.value", "call with value"], category: "Reentrancy" },
    { id: "SWC-108", keywords: ["state variable shadowing"], category: "Data Consistency" },
    { id: "SWC-109", keywords: ["uninitialized storage", "storage pointer"], category: "Data Consistency" },
    { id: "SWC-110", keywords: ["assert violation"], category: "Error Handling" },
    { id: "SWC-111", keywords: ["assembly", "yul"], category: "Low-Level Code" },
    { id: "SWC-112", keywords: ["delegatecall"], category: "Low-Level Code" },
    { id: "SWC-113", keywords: ["dos with revert", "loop", "unbounded loop"], category: "Denial of Service" },
    { id: "SWC-114", keywords: ["tx.origin"], category: "Access Control" },
    { id: "SWC-115", keywords: ["authorization through tx.origin"], category: "Access Control" },
    { id: "SWC-116", keywords: ["timestamp", "now", "block.timestamp"], category: "Environment" },
    { id: "SWC-117", keywords: ["signature malleability"], category: "Cryptography" },
    { id: "SWC-118", keywords: ["incorrect constructor"], category: "Initialization" },
    { id: "SWC-119", keywords: ["lack of event", "no events", "no log"], category: "Auditability" },
    { id: "SWC-120", keywords: ["insecure randomness", "keccak256", "blockhash"], category: "Randomness" },
    { id: "SWC-121", keywords: ["signature replay", "nonce"], category: "Authentication" },
    { id: "SWC-122", keywords: ["lack of proper validation", "unvalidated"], category: "Input Validation" },
    { id: "SWC-123", keywords: ["require before transfer", "insufficient gas griefing"], category: "Gas" },
    { id: "SWC-124", keywords: ["write to arbitrary storage"], category: "Access Control" },
    { id: "SWC-125", keywords: ["incorrect inheritance order"], category: "Logic" },
    { id: "SWC-126", keywords: ["insufficient gas griefing"], category: "Gas" },
    { id: "SWC-127", keywords: ["arbitrary jump", "delegatecall"], category: "Low-Level Code" },
    { id: "SWC-128", keywords: ["doS", "loop"], category: "Denial of Service" },
    { id: "SWC-129", keywords: ["typographical error"], category: "Maintainability" },
    { id: "SWC-130", keywords: ["shadowed variable"], category: "Maintainability" },
    { id: "SWC-131", keywords: ["hardcoded address", "magic number"], category: "Maintainability" },
    { id: "SWC-132", keywords: ["fallback"], category: "Access Control" },
    { id: "SWC-133", keywords: ["hash collision", "abi.encodepacked"], category: "Data Integrity" },
    { id: "SWC-134", keywords: ["unexpected ether", "receive"], category: "Access Control" },
  ];

  for (const entry of swcTable) {
    if (entry.keywords.some((kw) => text.includes(kw))) {
      return { swc: entry.id, category: entry.category };
    }
  }
  return { swc: null, category: "Uncategorized" };
}

function analyzeCode(source) {
  const results = [];
  const lines = source.split("\n");

  const push = (title, description, severity, location) => {
    const { swc, category } = mapToSwc(title, description);
    results.push({
      title,
      description,
      severity,
      location,
      swc,
      category,
      businessImpact: null,
    });
  };

  lines.forEach((l, idx) => {
    const line = l.toLowerCase();
    if (/\.\s*call\s*\(/.test(line) && /value/.test(line)) {
      push("Potential Reentrancy via call with value", "Use of .call{value:...}() may enable reentrancy. Apply Checks-Effects-Interactions pattern or ReentrancyGuard.", "High", `line ${idx + 1}`);
    }
    if (/(\.send\s*\(|\.transfer\s*\()/.test(line)) {
      push("Use of send/transfer", "transfer() and send() may fail due to gas cost changes. Prefer call() and verify success with (bool ok,).", "Medium", `line ${idx + 1}`);
    }
    if (/tx\.origin/.test(line)) {
      push("Use of tx.origin for authorization", "tx.origin can be spoofed by intermediate contracts. Always use msg.sender for access control.", "High", `line ${idx + 1}`);
    }
    if (/delegatecall\s*\(/.test(line)) {
      push("delegatecall to external address", "delegatecall executes code of another contract in caller context. Ensure target is trusted and immutable.", "High", `line ${idx + 1}`);
    }
    if (/\bassembly\b/.test(line)) {
      push("Inline Assembly Detected", "Inline assembly can bypass compiler safety checks. Audit manually and test thoroughly.", "Medium", `line ${idx + 1}`);
    }
    if (/selfdestruct\s*\(/.test(line)) {
      push("selfdestruct usage", "Contract can be destroyed, potentially locking or losing funds. Avoid unless strictly necessary.", "High", `line ${idx + 1}`);
    }
    if (/block\.timestamp|now\b/.test(line)) {
      push("Timestamp dependence", "Using block.timestamp or now can be manipulated slightly by miners; unsafe for randomness or critical logic.", "Medium", `line ${idx + 1}`);
    }
    if (/block\.number/.test(line)) {
      push("Block number used for timing", "Block number is not constant time; can vary with network conditions. Use block.timestamp for wall-clock time.", "Low", `line ${idx + 1}`);
    }
    if (/abi\.encodepacked\s*\(.*,(.*string|.*bytes)/.test(line)) {
      push("Potential Hash Collision in abi.encodePacked", "Using abi.encodePacked with dynamic types can cause hash collisions. Prefer abi.encode.", "Medium", `line ${idx + 1}`);
    }
    if (/function\s+receive\s*\(\)\s*external/.test(line) && !/onlyowner|require\s*\(/i.test(source)) {
      push("Unrestricted Ether receive() function", "Ether can be sent directly without validation. Add access control or event logging.", "Low", `line ${idx + 1}`);
    }
    if (/\.staticcall\s*\(/.test(line)) {
      push("Use of staticcall", "Ensure return value of staticcall is validated. Ignoring failures may lead to incorrect assumptions.", "Medium", `line ${idx + 1}`);
    }
    if (/\b\d{5,}\b/.test(line) && !/10{18}/.test(line)) {
      push("Magic Number Detected", "Large hardcoded numeric values can harm readability and maintainability. Use constants.", "Low", `line ${idx + 1}`);
    }
    if (/0x[a-f0-9]{20,}/i.test(line)) {
      push("Hardcoded Address", "Avoid hardcoded contract or wallet addresses. Store them in configurable state variables or constants.", "Low", `line ${idx + 1}`);
    }
    if (/\.call\s*\(/.test(line) && !/require|assert|if\s*\(.*success/i.test(source)) {
      push("External call without success check", "External calls should always verify return status (bool success) to avoid silent failures.", "Medium", `line ${idx + 1}`);
    }
    if (/storage\s+\w+\s*;/.test(line) && /memory|calldata/.test(line) === false) {
      push("Possible Uninitialized Storage Pointer", "Uninitialized storage variables can overwrite existing storage slots accidentally.", "High", `line ${idx + 1}`);
    }
  });

  if (/function\s+.*(public|external)/.test(source) && !/onlyOwner|AccessControl|Ownable/i.test(source)) {
    push("Public function without access control", "Functions exposed publicly can modify state without restriction. Add onlyOwner or role-based access modifiers.", "High", "file");
  }
  if (/unchecked\s*\{/.test(source)) {
    push("Unchecked Arithmetic Block", "Solidity 0.8.x has built-in overflow checks. Using unchecked{...} disables them — review carefully.", "Medium", "file");
  }
  if (/pragma\s+solidity\s+\^?0\.[0-7]+\./.test(source) && !/SafeMath/i.test(source)) {
    push("Unsafe Arithmetic (pre-0.8 without SafeMath)", "Older compilers lack overflow protection. Include SafeMath or upgrade to 0.8.x.", "High", "file");
  }
  const forLoops = source.match(/for\s*\([^)]*\)\s*\{/g);
  if (forLoops && forLoops.length > 3) {
    push("Excessive Loop Complexity", "Nested or multiple loops can hit gas limits. Optimize or refactor into smaller iterations.", "Low", "file");
  }
  if (/set|update|transfer|mint|burn|approve/i.test(source) && !/event\s+/i.test(source)) {
    push("No events for critical state changes", "Emit events for visibility when modifying balances, ownership, or permissions.", "Informational", "file");
  }
  if (/pragma\s+solidity\s+\^/.test(source) === false) {
    push("Floating or missing pragma version", "Use fixed pragma (e.g. pragma solidity ^0.8.20) to avoid accidental compilation with older versions.", "Low", "file");
  }
  if (/keccak256\s*\(\s*abi\.encodepacked\s*\(.*block\.(timestamp|number)/.test(source)) {
    push("Insecure Randomness from Block Data", "Block attributes are predictable. Use Chainlink VRF or commit-reveal schemes for secure randomness.", "High", "file");
  }
  if (/msg\.sender\s*==\s*address\s*\(/.test(source)) {
    push("Weak Authorization Logic", "Comparing msg.sender to a specific address hardcodes logic and reduces flexibility. Prefer role-based access.", "Medium", "file");
  }
  if (/function\s+fallback\s*\(/.test(source) && !/onlyOwner|require\s*\(/i.test(source)) {
    push("Unrestricted fallback function", "Fallback functions can receive data or Ether unexpectedly. Add restrictions or logging.", "Low", "file");
  }
  const byteSize = new Blob([source]).size;
  if (byteSize > 24576) {
    push("Large Contract Size", "Contract exceeds EVM size limits (~24KB). Consider splitting into smaller modules or using proxies.", "Informational", "file");
  }

  const dedup = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.title}|${r.location}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(r);
    }
  }

  dedup.sort((a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank);
  return dedup;
}

async function callLLMInferenceEndpoint(findings, filename, codeSnippet) {
  try {
    const resp = await fetch("http://localhost:5000/api/llm/infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, findings, codeSnippet }),
    });
    if (!resp.ok) throw new Error("LLM endpoint error");
    const data = await resp.json();
    return data.findings || null;
  } catch (err) {
    console.warn("LLM call failed:", err);
    return null;
  }
}

function localHeuristicInference(findings) {
  return findings.map((f) => {
    let impact = "Unknown business impact. Further analysis required.";
    const t = (f.title + " " + f.description).toLowerCase();
    if (t.includes("reentrancy") || t.includes("call{value") || t.includes(".call(")) {
      impact = "An attacker may repeatedly withdraw funds, potentially draining contract balances and causing financial loss.";
    } else if (t.includes("tx.origin")) {
      impact = "Improper authorization may allow attackers to bypass access control leading to unauthorized actions.";
    } else if (t.includes("selfdestruct")) {
      impact = "Contract can be destroyed by unauthorized party causing permanent loss of functionality and funds.";
    } else if (t.includes("unchecked")) {
      impact = "Integer overflow/underflow can corrupt accounting; attackers could mint or steal tokens or manipulate balances.";
    } else if (t.includes("delegatecall")) {
      impact = "Untrusted delegatecall can lead to full takeover of contract storage and logic, allowing theft or loss of control.";
    } else if (t.includes("events")) {
      impact = "Lack of events reduces auditability; harder incident response and forensic analysis.";
    } else if (t.includes("ownership") || t.includes("onlyowner")) {
      impact = "Missing access control could allow anyone to perform privileged operations (e.g., minting, pausing).";
    }
    return { ...f, businessImpact: impact };
  });
}

function generateSarif(filename, vulns) {
  const uniqueRules = {};
  vulns.forEach((v) => {
    const ruleId = v.swc || v.title.replace(/\s+/g, "_").toLowerCase();
    const swcLink = v.swc ? `https://swcregistry.io/docs/${v.swc}` : null;

    if (!uniqueRules[ruleId]) {
      uniqueRules[ruleId] = {
        id: ruleId,
        shortDescription: { text: v.title },
        fullDescription: { text: v.description },
        properties: { category: v.category || "Uncategorized", swc: v.swc, swcLink },
        defaultConfiguration: { level: v.severity.toLowerCase() },
      };
    }
  });

  return {
    $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: { name: "SIA Solidity Analyzer", informationUri: "https://example.com/sia", rules: Object.values(uniqueRules) },
        },
        results: vulns.map((v) => {
          const ruleId = v.swc || v.title.replace(/\s+/g, "_").toLowerCase();
          const line = parseInt((v.location || "").replace(/\D/g, "")) || 1;
          const swcLink = v.swc ? `https://swcregistry.io/docs/${v.swc}` : null;

          return {
            ruleId,
            level: v.severity.toLowerCase(),
            message: { text: v.description },
            locations: [{ physicalLocation: { artifactLocation: { uri: filename }, region: { startLine: line } } }],
            properties: { swc: v.swc, category: v.category, swcLink, businessImpact: v.businessImpact || null },
          };
        }),
      },
    ],
  };
}

function SlitherPage({ code, setCode, goHome }) {
  const [filename, setFilename] = useState("contract.sol");
  const [vulns, setVulns] = useState([]);
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isInferring, setIsInferring] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sia_history_v1");
    if (saved) setHistory(JSON.parse(saved));
  }, []);
  useEffect(() => {
    localStorage.setItem("sia_history_v1", JSON.stringify(history));
  }, [history]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const resp = await fetch("http://localhost:5000/analyze-slither", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      
      const json = await resp.json();
      
      if (!json.success) {
        alert("Erro no backend: " + json.error);
        return;
      }

      // Mapeando a saída REAL do Slither para a nossa UI
      // Mapeando a saída REAL do Slither para a nossa UI e "limpando" o lixo textual
      const rawIssues = json.issues || [];
      const mappedFindings = rawIssues.map(it => {
        // Remove os caminhos de arquivos feios do log (/tmp/slither_run.../) e quebras de linha excessivas
        let cleanDesc = (it.description || "Sem descrição")
          .replace(/\(.*?TargetContract\.sol#[0-9-]+\)/g, '')
          .replace(/\n\s*/g, ' ')
          .trim();

        const title = it.check || "Vulnerabilidade Detectada";
        
        // Melhora a Inteligência Heurística (LLM Local) para os padrões reais do Slither
        let impact = "Impacto de negócio desconhecido. Requer auditoria manual.";
        const t = title.toLowerCase();
        
        if (t.includes("reentrancy")) {
          impact = "Um atacante pode drenar o saldo do contrato realizando chamadas recursivas antes que o estado seja atualizado.";
        } else if (t.includes("arbitrary-send")) {
          impact = "Controles de acesso fracos permitem que qualquer usuário force o contrato a enviar fundos, causando perda financeira.";
        } else if (t.includes("shadowing")) {
          impact = "Ambiguidade no código. Pode levar desenvolvedores a confiarem em variáveis erradas, causando bugs lógicos silenciosos.";
        } else if (t.includes("low-level-calls")) {
          impact = "Chamadas de baixo nível não verificam a existência do contrato de destino, podendo retornar sucesso falso e ignorar erros.";
        } else if (t.includes("naming-convention") || t.includes("solc-version")) {
          impact = "Débito técnico. Dificulta a manutenção e a auditoria por terceiros, reduzindo a confiabilidade do código.";
        }

        return {
          title: title,
          description: cleanDesc,
          severity: it.impact || "Informational",
          location: it.elements && it.elements.length > 0 
              ? `Linha(s): ${it.elements.map(e => e.source_mapping?.lines?.join(', ')).join(' | ')}` 
              : "Desconhecida",
          swc: null,
          category: it.check || "Uncategorized",
          businessImpact: impact,
        };
      });

      setVulns(mappedFindings);
      
      // Opcional: Você pode colocar um console.log(json.raw_output) aqui para ver os erros de compilação
      
      const entry = { id: Date.now(), filename, timestamp: new Date().toISOString(), codeSnippet: code.slice(0, 400), findings: mappedFindings, notes };
      setHistory((h) => [entry, ...h].slice(0, 50));
    } catch (err) {
      alert("Falha de conexão com o backend (porta 5000).");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCode(String(ev.target.result));
    reader.readAsText(f);
  };

  const downloadSARIF = () => {
    const sarif = generateSarif(filename, vulns);
    const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: "application/sarif+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-sia-report.sarif.json`;
    a.click();
  };

  const clearHistory = () => {
    if (!window.confirm("Clear saved analysis history?")) return;
    setHistory([]);
  };

  const runLLMInference = async () => {
    if (vulns.length === 0) {
      alert("Run analysis first.");
      return;
    }
    setIsInferring(true);
    try {
      const remote = await callLLMInferenceEndpoint(vulns, filename, code.slice(0, 2000));
      if (remote && Array.isArray(remote)) {
        const enriched = vulns.map((v, i) => {
          const r = remote[i] || remote.find((x) => x.title === v.title) || {};
          return { ...v, businessImpact: r.businessImpact || r.impact || v.businessImpact || null };
        });
        setVulns(enriched);
      } else {
        const enriched = localHeuristicInference(vulns);
        setVulns(enriched);
      }
      setHistory((h) => {
        if (h.length === 0) return h;
        const newest = { ...h[0], findings: (vulns || []) };
        return [newest, ...h.slice(1)];
      });
    } finally {
      setIsInferring(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "#0f0f10", color: "#e6eef8" }}>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Solidity IA Analyzer</h1>
            <p className="text-sm text-gray-400">Static vulnerability analysis + SWC mapping + LLM contextual inference</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={goHome} className="px-3 py-2 rounded border border-gray-700 text-sm text-gray-300 hover:text-green-400">Voltar ao menu</button>
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
            <button onClick={runLLMInference} className="px-3 py-2 rounded border border-gray-700 text-sm">
              {isInferring ? "Inferring..." : "Run LLM Inference"}
            </button>
            <button
              onClick={async () => {
                if (vulns.length === 0) {
                  alert("Execute a análise antes de gerar o relatório executivo.");
                  return;
                }
                const resp = await fetch("http://localhost:5000/api/llm/report-executivo", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ filename, findings: vulns }),
                });
                const blob = await resp.blob();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${filename.replace(/\.[^/.]+$/, "")}-relatorio-executivo.txt`;
                a.click();
              }}
              className="px-3 py-2 rounded border border-gray-700 text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white"
            >
              Gerar Relatório Executivo
            </button>
            <button onClick={downloadSARIF} className="px-3 py-2 rounded border border-gray-700 text-sm">Export SARIF</button>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-6">
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

          <aside className="col-span-5">
            <div className="rounded-xl p-4 border border-gray-800 mb-4" style={{ background: "#0b0b0c" }}>
              <h2 className="text-lg font-medium mb-2">Vulnerabilities</h2>
              {vulns.length === 0 ? (
                <div className="text-sm text-gray-400">No findings yet. Run analysis.</div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-auto pr-2">
                  {vulns.map((v, i) => (
                      <div key={i} className="p-3 rounded-lg border" style={{ borderColor: '#1f2937', background: '#071014' }}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="w-3 h-3 rounded-full" style={{ background: severityColor(v.severity) }} />
                              <div className="font-semibold">{v.title}</div>
                              {v.swc && (
                                <a href={`https://swcregistry.io/docs/${v.swc}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                                  {v.swc}
                                </a>
                              )}
                              <span className="text-xs text-gray-300 px-2 py-0.5 rounded border border-gray-700" style={{ background: '#0a121a' }}>
                                {v.category || "Uncategorized"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{v.location}</div>
                          </div>
                          <div className="text-sm font-medium" style={{ color: severityColor(v.severity) }}>
                            {v.severity}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-gray-300">{v.description}</div>
                        {v.businessImpact && (
                          <div className="mt-2 text-xs text-yellow-200 bg-black/20 p-2 rounded">
                            <strong>Business Impact:</strong> {v.businessImpact}
                          </div>
                        )}
                      </div>
                  ))}
                </div>
              )}
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
        </main>
      </div>
    </div>
  );
}

// ------------------ Mythril Page ------------------
function MythrilPage({ code, setCode, goHome }) {
  const [depth, setDepth] = useState(5);
  const [timeout, setTimeoutVal] = useState(60);
  const [txCount, setTxCount] = useState(2);
  const [strategy, setStrategy] = useState("bfs");
  const [minSeverity, setMinSeverity] = useState("Info");
  
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mythrilOutput, setMythrilOutput] = useState("");
  const [executionMeta, setExecutionMeta] = useState(null);

  const reportRef = useRef(null);

  // Função fundida: Usa o visual novo, mas bate na SUA API real (localhost:8000)
  const runMythril = async () => {
    setIsRunning(true);
    setResults([]);
    setExecutionMeta(null);
    setMythrilOutput("Enviando contrato para análise Mythril no backend (localhost:8000)...\nIsso pode levar vários segundos...\n\n");

    try {
      const resp = await fetch("http://localhost:5000/analyze-mythril", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          contract_name: null, // Pode ser ajustado se sua API exigir
          max_depth: Number(depth),
          timeout_sec: Number(timeout),
          // Enviando os novos parâmetros caso você queira atualizar sua API depois para aceitá-los
          tx_count: Number(txCount),
          strategy: strategy
        }),
      });

      const json = await resp.json();

      if (!json.success) {
        setMythrilOutput((l) => l + "Resposta sem formato esperado ou erro no backend.\n");
        setMythrilOutput((l) => l + JSON.stringify(json, null, 2) + "\n");
        setIsRunning(false);
        return;
      }

      // Mapeia o formato real que vem da sua API para o formato que a nossa UI bonita espera
      const rawIssues = json.issues || [];
      const mappedIssues = rawIssues.map((it) => ({
        title: it.title || it.extra?.title || "Vulnerabilidade Detectada",
        severity: it.severity || "Unknown",
        swc: it.id || it.extra?.swc_id || "",
        description: it.description || it.extra?.description || "Sem descrição detalhada.",
        recommendation: "Verifique o código fonte e as referências SWC para mitigação.",
        locations: it.locations || null
      }));

      // Filtro de severidade básico no frontend
      const severityOrder = { High: 3, Medium: 2, Low: 1, Info: 0, Unknown: -1 };
      const filtered = mappedIssues.filter((r) => (severityOrder[r.severity] || 0) >= severityOrder[minSeverity]);

      setResults(filtered);

      // Metadados da execução para montar os cards bonitos
      setExecutionMeta({
        strategy: strategy.toUpperCase(),
        depth: Number(depth),
        txCount: Number(txCount),
        timeout: Number(timeout),
        elapsedMs: json.elapsed_ms || "N/A", // Se sua API não mandar o tempo, exibe N/A
        exploredPaths: json.explored_paths || "N/A",
        constraintsSolved: json.constraints_solved || "N/A",
      });

      // Output bruto do terminal
      const out = `=== STDOUT ===\n${json.stdout || ""}\n\n=== STDERR ===\n${json.stderr || ""}\n`;
      setMythrilOutput((l) => l + out);

    } catch (err) {
      setMythrilOutput((l) => l + `\nErro ao conectar ao backend (porta 8000): ${String(err)}\nVerifique se o seu backend Python/Node do Mythril está rodando.`);
    } finally {
      setIsRunning(false);
    }
  };

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { backgroundColor: '#0f0f10', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`relatorio-mythril-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Houve um erro ao gerar o relatório em PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ToolLayout name="Mythril (Execução Simbólica)" goHome={goHome}>
      <div className="text-sm text-gray-400 mb-4">
        Analisa a Máquina Virtual Ethereum (EVM) através de execução simbólica para encontrar falhas matemáticas e lógicas.
      </div>
      
      <div className="grid grid-cols-12 gap-4 mb-4 text-sm text-gray-300">
        <div className="col-span-12 md:col-span-2">
          <label>Profundidade (Depth)</label>
          <input type="number" value={depth} min={1} max={50} onChange={(e)=>setDepth(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1" />
        </div>
        <div className="col-span-12 md:col-span-2">
          <label>Transações (-t)</label>
          <input type="number" value={txCount} min={1} max={5} onChange={(e)=>setTxCount(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1" />
        </div>
        <div className="col-span-12 md:col-span-2">
          <label>Timeout (seg)</label>
          <input type="number" value={timeout} min={10} max={600} onChange={(e)=>setTimeoutVal(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1" />
        </div>
        <div className="col-span-12 md:col-span-3">
          <label>Estratégia de Busca</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1">
            <option value="bfs">BFS (Busca em Largura)</option>
            <option value="dfs">DFS (Busca em Profundidade)</option>
          </select>
        </div>
        <div className="col-span-12 md:col-span-3">
          <label>Severidade mínima</label>
          <select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1">
            <option>Info</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </div>
      </div>

      <Editor code={code} setCode={setCode} />
      
      <div className="flex gap-3 mb-6">
        <button onClick={runMythril} disabled={isRunning} className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 transition disabled:opacity-50">
          {isRunning ? '⏳ Analisando (Aguarde)...' : '▶️ Executar Mythril (Real)'}
        </button>
        {executionMeta && (
          <button onClick={exportPDF} disabled={isExporting} className="px-4 py-2 rounded border border-gray-700 bg-gray-800 text-gray-200 font-medium hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
            {isExporting ? 'Gerando PDF...' : '📄 Exportar PDF'}
          </button>
        )}
      </div>

      {/* ÁREA DE EXPORTAÇÃO PDF */}
      <div ref={reportRef} className="p-2" style={{ backgroundColor: '#0f0f10' }}>
        
        {executionMeta && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-blue-500">Relatório de Execução Simbólica (Mythril)</h1>
            <p className="text-sm text-gray-400">Análise profunda de caminhos de estado do contrato.</p>
            <hr className="border-gray-800 mt-2" />
          </div>
        )}

        {executionMeta && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <MetricMiniCard label="Tempo" value={executionMeta.elapsedMs ? `${executionMeta.elapsedMs}ms` : 'N/A'} />
            <MetricMiniCard label="Caminhos Expl." value={executionMeta.exploredPaths} />
            <MetricMiniCard label="Constraints" value={executionMeta.constraintsSolved} />
            <MetricMiniCard label="Transações" value={executionMeta.txCount} />
            <MetricMiniCard label="Algoritmo" value={executionMeta.strategy} />
          </div>
        )}

        {/* Cards de Resultado mapeados da sua API real */}
        {results && results.length > 0 && (
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-medium text-gray-200">Vulnerabilidades Encontradas</h2>
            {results.map((r, i) => (
              <div key={i} className="p-4 border border-gray-800 rounded-lg bg-[#071014]">
                <div className="flex justify-between mb-2">
                  <div className="font-semibold text-red-400">{r.title}</div>
                  <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">{r.severity}</span>
                </div>
                <div className="text-sm text-gray-300 mb-3">{r.description}</div>
                
                {r.locations && (
                  <div className="mt-4 p-3 rounded border border-gray-800 bg-[#0a0a0c]">
                    <div className="text-xs font-semibold text-gray-400 mb-2">LOCALIZAÇÃO NO CÓDIGO (LINHAS):</div>
                    {r.locations.map((loc, idx) => (
                      <pre key={idx} className="mb-2 last:mb-0 text-xs text-gray-500 break-all whitespace-pre-wrap">
                        {JSON.stringify(loc, null, 2)}
                      </pre>
                    ))}
                  </div>
                )}
                
                <div className="mt-3 text-xs text-gray-500 space-y-1">
                  {r.swc && <div>SWC: <a href={`https://swcregistry.io/docs/${r.swc}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{r.swc}</a></div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {mythrilOutput && (
          <div className="mt-6 rounded-xl border border-gray-800 p-4" style={{ background: '#081018' }}>
            <h2 className="text-lg font-medium mb-2 text-gray-400">Terminal Output (Mythril Log Real)</h2>
            <pre className="whitespace-pre-wrap text-xs text-gray-400 font-mono p-4 rounded border border-gray-800 bg-black min-h-[100px] max-h-96 overflow-y-auto">
              {mythrilOutput}
            </pre>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}

// ------------------ Funções Auxiliares ------------------
function parseGasReport(output) {
  if (!output) return [];
  
  const lines = output.split('\n');
  let isParsingTable = false;
  const gasData = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('Function Name') && line.includes('Min') && line.includes('Max')) {
      isParsingTable = true;
      i++; 
      continue;
    }

    if (isParsingTable) {
      if (line.startsWith('╰') || line === '') {
        isParsingTable = false;
        continue;
      }

      if (line.startsWith('|') && !line.includes('---')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
        
        if (cols.length >= 5 && isNaN(cols[0])) {
          gasData.push({
            name: cols[0],
            min: parseInt(cols[1], 10) || 0,
            avg: parseInt(cols[2], 10) || 0,
            median: parseInt(cols[3], 10) || 0,
            max: parseInt(cols[4], 10) || 0,
            calls: parseInt(cols[5], 10) || 0
          });
        }
      }
    }
  }
  
  return gasData;
}

// ------------------ Forge Page ------------------
function ForgePage({ code, setCode, goHome }) {
  const [testCode, setTestCode] = useState("");
  const [activeTab, setActiveTab] = useState("contract"); 
  
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false); // Novo estado para o botão de PDF
  const [runFuzz, setRunFuzz] = useState(true);
  const [runCoverage, setRunCoverage] = useState(true);
  const [fuzzRuns, setFuzzRuns] = useState(256);
  const [forgeOutput, setForgeOutput] = useState(""); 
  
  const reportRef = useRef(null); // Referência da div que será exportada

  const runForge = async () => {
    setIsRunning(true);
    setResults([]);
    setForgeOutput("Iniciando container do Foundry e compilando contratos...\n");

    try {
      const response = await fetch("http://localhost:5000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          code, 
          testCode, 
          contractName: "TargetContract", 
          runTests: true, 
          doFuzz: runFuzz, 
          runCoverage 
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        setForgeOutput(`Erro: ${data.error}`);
        setIsRunning(false);
        return;
      }

      let outputLog = `=== BUILD ===\n${data.build?.stdout || ''}\n${data.build?.stderr || ''}\n`;
      if (data.test) {
        outputLog += `\n=== TEST RESULTS & GAS REPORT ===\n${data.test.stdout}\n${data.test.stderr}`;
      }
      setForgeOutput(outputLog);

      const findings = [];
      if (data.test && data.test.stdout.includes("Failing tests:")) {
        findings.push({
          title: "Falha em Teste de Fuzzing/Invariante",
          severity: "High",
          description: "O Foundry encontrou um contra-exemplo que quebra as asserções do contrato.",
          recommendation: "Valide as precondições da função ou corrija a lógica matemática.",
        });
      }

      if (data.coverage && data.coverage.stdout.includes("Uncovered lines")) {
        findings.push({
          title: "Aviso de Cobertura de Código",
          severity: "Info",
          description: "Nem todas as linhas/branches do contrato foram cobertas pelos testes.",
          recommendation: "Escreva testes manuais focando nos fluxos de erro (reverts e requires).",
        });
      }

      if (data.build && data.build.stderr.includes("Compiler run failed")) {
         findings.push({
          title: "Erro de Compilação",
          severity: "High",
          description: "O código Solidity fornecido ou o teste manual possui erros de sintaxe.",
          recommendation: "Revise o código na aba correspondente.",
        });
      }

      if (findings.length === 0 && data.test && data.test.stdout.includes("Result: ok")) {
         findings.push({
          title: "Testes Passaram com Sucesso",
          severity: "Info",
          description: "Todos os testes executaram sem falhas no ambiente isolado.",
          recommendation: "Revise os logs brutos e o consumo de gas para procurar anomalias visuais.",
        });
      }

      setResults(findings);

      if (!testCode && data.generatedTest) {
        setTestCode(data.generatedTest);
      }

    } catch (error) {
      setForgeOutput(`Falha de conexão com o backend: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Função para exportar a DIV referenciada em PDF
  const exportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#0f0f10', 
        scale: 2 
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Adiciona a primeira página
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      // Enquanto houver imagem sobrando, cria uma nova página e desloca a imagem para cima
      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`relatorio-auditoria-foundry-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Houve um erro ao gerar o relatório em PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ToolLayout name="Forge (Foundry)" goHome={goHome}>
      <div className="text-sm text-gray-400 mb-3">Executa testes unitários, testes de limites de gas, e fuzzing dinâmico.</div>
      
      <div className="grid grid-cols-12 gap-4 mb-4 text-sm text-gray-300">
        <div className="col-span-12 md:col-span-3">
          <label>Fuzz runs máximos</label>
          <input type="number" min={32} max={10000} step={32} value={fuzzRuns} onChange={(e) => setFuzzRuns(e.target.value)} className="bg-gray-900 border border-gray-700 p-1 rounded w-full mt-1" />
        </div>
        <div className="col-span-12 md:col-span-3 flex items-end pb-1">
          <label className="flex items-center gap-2"><input type="checkbox" checked={runFuzz} onChange={(e) => setRunFuzz(e.target.checked)} />Fuzzing & Invariantes</label>
        </div>
        <div className="col-span-12 md:col-span-4 flex items-end pb-1">
          <label className="flex items-center gap-2"><input type="checkbox" checked={runCoverage} onChange={(e) => setRunCoverage(e.target.checked)} />Gerar cobertura</label>
        </div>
      </div>

      <div className="flex border-b border-gray-700 mb-4">
        <button 
          onClick={() => setActiveTab("contract")}
          className={`px-4 py-2 ${activeTab === "contract" ? "border-b-2 border-green-500 text-green-400 font-medium" : "text-gray-400 hover:text-gray-200"}`}
        >
          TargetContract.sol
        </button>
        <button 
          onClick={() => setActiveTab("test")}
          className={`px-4 py-2 ${activeTab === "test" ? "border-b-2 border-green-500 text-green-400 font-medium" : "text-gray-400 hover:text-gray-200"}`}
        >
          TargetContract.t.sol (Testes)
        </button>
      </div>

      {activeTab === "contract" ? (
        <Editor code={code} setCode={setCode} />
      ) : (
        <textarea
          spellCheck={false}
          value={testCode}
          placeholder="// Escreva seus testes usando forge-std/Test.sol aqui. Deixe em branco para o backend autogerar testes e fuzzing baseados no contrato principal."
          onChange={(e) => setTestCode(e.target.value)}
          className="w-full h-[300px] p-4 font-mono text-sm bg-[#121215] text-blue-200 rounded-xl border border-gray-800 mb-4"
        />
      )}

      {/* Botões de Ação */}
      <div className="flex gap-3 mb-6">
        <RunButton label="Executar Forge Tests" isRunning={isRunning} onClick={runForge} />
        {forgeOutput && (
          <button 
            onClick={exportPDF} 
            disabled={isExporting}
            className="px-4 py-2 rounded border border-gray-700 bg-gray-800 text-gray-200 font-medium hover:bg-gray-700 mb-4 flex items-center gap-2 disabled:opacity-50"
          >
            {isExporting ? 'Gerando...' : '📄 Exportar PDF (Relatório)'}
          </button>
        )}
      </div>

      {/* TUDO DENTRO DESTA DIV SERÁ EXPORTADO PARA O PDF */}
      <div ref={reportRef} className="p-2" style={{ backgroundColor: '#0f0f10' }}>
        
        {/* Título apenas visível no PDF (ou no topo do relatório exportado) */}
        {forgeOutput && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-green-500">Relatório de Auditoria Dinâmica (Foundry)</h1>
            <p className="text-sm text-gray-400">Gerado automaticamente por Solidity Analysis Suite</p>
            <hr className="border-gray-800 mt-2" />
          </div>
        )}

        <ResultsList results={results} showAdvanced />

        {/* Gráfico de Consumo de Gas */}
        {forgeOutput && parseGasReport(forgeOutput).length > 0 && (
          <div className="mt-6 rounded-xl border border-gray-800 p-4" style={{ background: '#081018' }}>
            <h2 className="text-lg font-medium mb-4 text-green-400">Análise de Consumo de Gas (Fuzzing)</h2>
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer>
                <BarChart
                  data={parseGasReport(forgeOutput)}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                  <Tooltip 
                    cursor={{ fill: '#111827' }}
                    contentStyle={{ backgroundColor: '#0f0f10', borderColor: '#1f2937', color: '#e6eef8' }} 
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="min" fill="#10b981" name="Mínimo (Gas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avg" fill="#f59e0b" name="Média (Gas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="max" fill="#ef4444" name="Máximo (Gas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-gray-500 mt-4">
              * Picos desproporcionais de "Máximo (Gas)" em relação à "Média" indicam loops não limitados e risco de Denial of Service (DoS).
            </div>
          </div>
        )}

        {/* Terminal Output Real do Foundry */}
        {forgeOutput && (
          <div className="mt-6 rounded-xl border border-gray-800 p-4" style={{ background: '#081018' }}>
            <h2 className="text-lg font-medium mb-2 text-gray-400">Log Bruto de Execução</h2>
            <pre className="whitespace-pre-wrap text-xs text-gray-400 font-mono p-4 rounded border border-gray-800 bg-black overflow-hidden break-words">
              {forgeOutput}
            </pre>
          </div>
        )}
      </div>
      {/* FIM DA ÁREA DO PDF */}

    </ToolLayout>
  );
}
// ------------------ Shared Components ------------------
function ToolLayout({ name, goHome, children }) {
  return (
    <div className="min-h-screen p-8" style={{ background: '#0f0f10', color: '#e6eef8' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <button onClick={goHome} className="px-3 py-2 rounded border border-gray-700 text-sm text-gray-300 hover:text-green-400">Voltar ao menu</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Editor({ code, setCode }) {
  return (
    <textarea
      spellCheck={false}
      value={code}
      onChange={(e)=>setCode(e.target.value)}
      className="w-full h-[300px] p-4 font-mono text-sm bg-[#09090a] text-gray-100 rounded-xl border border-gray-800 mb-4"
    />
  );
}

function RunButton({ label, isRunning, onClick }) {
  return (
    <button onClick={onClick} className="px-4 py-2 rounded bg-green-600 text-black font-medium mb-4">
      {isRunning ? 'Executando...' : label}
    </button>
  );
}

function ResultsList({ results, showAdvanced = false }) {
  if (!results || results.length === 0)
    return <div className="text-sm text-gray-400">Nenhum resultado disponível.</div>;
  return (
    <div className="space-y-3">
      {results.map((r, i)=>(
        <div key={i} className="p-4 border border-gray-800 rounded-lg bg-[#071014]">
          <div className="flex justify-between mb-2">
            <div className="font-semibold">{r.title}</div>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded">{r.severity}</span>
          </div>
          <div className="text-sm text-gray-300">{r.description}</div>
          {showAdvanced && (
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              {r.swc && <div>SWC: {r.swc}</div>}
              {r.attackSurface && <div>Superfície de ataque: {r.attackSurface}</div>}
              {typeof r.confidence === "number" && <div>Confiança: {(r.confidence * 100).toFixed(0)}%</div>}
              {r.suite && <div>Suite: {r.suite}</div>}
              {r.failingSeed && <div>Seed: {r.failingSeed}</div>}
              {r.recommendation && <div>Recomendação: {r.recommendation}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MetricMiniCard({ label, value }) {
  return (
    <div className="p-3 rounded border" style={{ borderColor: '#12202b', background: '#07131a' }}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-emerald-300">{value}</div>
    </div>
  );
}