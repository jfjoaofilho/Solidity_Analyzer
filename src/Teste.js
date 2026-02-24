import React, { useState, useEffect } from "react";

// Forge Platform - Elegant Testing Dashboard for Solidity
// Features: Dashboard, Test Suites, Fuzzing, Coverage, and Results

export default function ForgePlatform() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [coverage, setCoverage] = useState(78);
  const [testsPassed, setTestsPassed] = useState(42);
  const [testsFailed, setTestsFailed] = useState(3);
  const [fuzzProgress, setFuzzProgress] = useState(0);
  const [isFuzzing, setIsFuzzing] = useState(false);

  useEffect(() => {
    let interval;
    if (isFuzzing && fuzzProgress < 100) {
      interval = setInterval(() => {
        setFuzzProgress((p) => Math.min(100, p + Math.random() * 10));
      }, 400);
    } else if (!isFuzzing) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isFuzzing, fuzzProgress]);

  const startFuzzing = () => {
    setFuzzProgress(0);
    setIsFuzzing(true);
    setTimeout(() => setIsFuzzing(false), 6000);
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "suites", label: "Suites de Teste" },
    { id: "fuzzing", label: "Fuzzing" },
    { id: "coverage", label: "Cobertura" },
    { id: "results", label: "Resultados" },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard coverage={coverage} passed={testsPassed} failed={testsFailed} />;
      case "suites":
        return <TestSuites />;
      case "fuzzing":
        return <Fuzzing startFuzzing={startFuzzing} isFuzzing={isFuzzing} progress={fuzzProgress} />;
      case "coverage":
        return <Coverage coverage={coverage} />;
      case "results":
        return <Results passed={testsPassed} failed={testsFailed} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: '#020617', color: '#e2e8f0', fontFamily: 'monospace' }}>
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-emerald-400">Forge Platform</h1>
          <nav className="flex gap-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-2 rounded-md border border-slate-800 transition ${activeTab === t.id ? 'bg-emerald-600 text-black' : 'hover:bg-slate-900 text-slate-300'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main>{renderTab()}</main>
      </div>
    </div>
  );
}

// ---------------------- Dashboard ----------------------
function Dashboard({ coverage, passed, failed }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      <MetricCard label="Testes Passaram" value={passed} color="text-emerald-400" />
      <MetricCard label="Testes Falharam" value={failed} color="text-red-500" />
      <MetricCard label="Cobertura (%)" value={coverage + '%'} color="text-sky-400" />
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="p-6 rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 shadow-md hover:shadow-emerald-500/10 transition">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${color}`}>{value}</div>
    </div>
  );
}

// ---------------------- Test Suites ----------------------
function TestSuites() {
  const [suites, setSuites] = useState([
    { id: 1, name: 'ERC20 Basic Tests', tests: 8 },
    { id: 2, name: 'Ownership Tests', tests: 5 },
  ]);

  const addSuite = () => {
    const name = prompt('Nome da nova suite de testes:');
    if (name) setSuites([...suites, { id: Date.now(), name, tests: 0 }]);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Suites de Teste</h2>
        <button onClick={addSuite} className="px-3 py-2 rounded bg-emerald-600 text-black text-sm">Nova Suite</button>
      </div>
      <div className="space-y-3">
        {suites.map((s) => (
          <div key={s.id} className="p-4 border border-slate-800 rounded-lg bg-slate-900">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold text-emerald-400">{s.name}</div>
                <div className="text-xs text-slate-400">{s.tests} testes</div>
              </div>
              <button className="text-xs text-slate-400 border border-slate-700 px-2 py-1 rounded hover:text-emerald-400">Executar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------- Fuzzing ----------------------
function Fuzzing({ startFuzzing, isFuzzing, progress }) {
  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-3">Fuzz Testing</h2>
      <p className="text-sm text-slate-400 mb-4">Executa testes aleatórios com inputs variados para detectar falhas inesperadas.</p>
      <button
        onClick={startFuzzing}
        disabled={isFuzzing}
        className={`px-4 py-2 rounded text-black font-medium ${isFuzzing ? 'bg-slate-700 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-500'}`}
      >
        {isFuzzing ? 'Fuzzing em andamento...' : 'Iniciar Fuzzing'}
      </button>
      <div className="mt-6 h-4 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className="h-4 bg-emerald-500 transition-all" style={{ width: `${progress}%` }}></div>
      </div>
      <div className="text-xs text-slate-400 mt-1">{progress.toFixed(0)}%</div>
    </div>
  );
}

// ---------------------- Coverage ----------------------
function Coverage({ coverage }) {
  const files = [
    { name: 'Token.sol', value: 92 },
    { name: 'Ownable.sol', value: 75 },
    { name: 'SafeMath.sol', value: 66 },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Cobertura de Código</h2>
      <div className="space-y-3">
        {files.map((f) => (
          <div key={f.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">{f.name}</span>
              <span className={`font-semibold ${f.value >= 80 ? 'text-emerald-400' : f.value >= 50 ? 'text-yellow-400' : 'text-red-500'}`}>{f.value}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-3 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${f.value}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------- Results ----------------------
function Results({ passed, failed }) {
  const results = [
    { name: 'testTransfer', status: 'passed', duration: '53ms' },
    { name: 'testMint', status: 'failed', duration: '42ms' },
    { name: 'testOwnership', status: 'passed', duration: '37ms' },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Resultados Recentes</h2>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className="p-3 border border-slate-800 rounded-lg flex justify-between items-center bg-slate-900">
            <div className="text-sm text-slate-300">{r.name}</div>
            <div className={`text-xs font-semibold ${r.status === 'passed' ? 'text-emerald-400' : 'text-red-500'}`}>{r.status.toUpperCase()}</div>
            <div className="text-xs text-slate-400">{r.duration}</div>
          </div>
        ))}
      </div>
    </div>
  );
}