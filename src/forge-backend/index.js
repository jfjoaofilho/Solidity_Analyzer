// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '8mb' }));
app.use(cors());

const FORGE_TIMEOUT = 5 * 60 * 1000; // 5 min default

function safeExec(cmd, opts = {}) {
  return new Promise((resolve) => {
    // Mesclamos o 'opts' e o 'maxBuffer' em um único objeto usando o spread operator (...)
    const options = { ...opts, maxBuffer: 50 * 1024 * 1024 };
    
    // Agora passamos apenas 3 argumentos corretamente
    exec(cmd, options, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function generateBasicTest(contractName, source) {
  // Parser ingênuo: encontra assinaturas de funções public/external
  const fnRegex = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(public|external)/g;
  const fns = [];
  let m;
  while ((m = fnRegex.exec(source)) !== null) {
    fns.push({ name: m[1], args: m[2].trim() });
  }

  // Cria um teste básico do Foundry (Solidity)
  let test = `// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/${contractName}.sol";

contract ${contractName}Test is Test {
    ${contractName} instance;

    function setUp() public {
        instance = new ${contractName}();
    }

    function test_deploy_gas_check() public {
        uint256 gasStart = gasleft();
        assert(address(instance) != address(0));
        uint256 gasUsed = gasStart - gasleft();
        // Você pode adicionar asserts de limite de gas aqui, ex:
        // assert(gasUsed < 3000000);
    }\n\n`;

  // Gerando Fuzz Tests Reais com base nos argumentos
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    if (fn.args) {
      // Extrai apenas os nomes das variáveis para passar na chamada da função
      const argNames = fn.args.split(',').map(arg => arg.trim().split(/\s+/).pop()).join(', ');
      
      // O Foundry faz fuzzing automaticamente em funções de teste que recebem parâmetros
      test += `    function testFuzz_${fn.name}(${fn.args}) public {
        // best-effort: fuzzing dinâmico
        try instance.${fn.name}(${argNames}) {
            // Sucesso
        } catch {
            // Ignora falhas heurísticas (reverts esperados por requires do contrato)
        }
    }\n\n`;
    } else {
      // Teste de chamada simples para funções sem argumentos
      test += `    function testCall_${fn.name}() public {
        try instance.${fn.name}() {} catch {}
    }\n\n`;
    }
  }

  test += `}\n`;
  return test;
}

app.post('/analyze', async (req, res) => {
  // body: { code, testCode, contractName, runTests, runCoverage, doFuzz, timeoutSec }
  const { code, testCode, contractName = 'Contract', runTests = true, runCoverage = false, doFuzz = false, timeoutSec = 300 } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'No code provided' });

  const id = uuidv4();
  const workspace = path.join(os.tmpdir(), `forge_run_${id}`);
  fs.mkdirSync(workspace, { recursive: true });

  try {
    // 1) Inicia um projeto forge
    const initCmd = `cd ${workspace} && forge init --force --no-git`;
    const initResult = await safeExec(initCmd);
    
    // Escreve o contrato na pasta src/
    const srcDir = path.join(workspace, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const filename = `${contractName}.sol`;
    fs.writeFileSync(path.join(srcDir, filename), code, 'utf8');

    // 2) Cria o arquivo de teste (Manual ou Automático)
    const testDir = path.join(workspace, 'test');
    fs.mkdirSync(testDir, { recursive: true });
    
    // Se o usuário mandou um código de teste manual, usamos ele. Se não, geramos um.
    const testContent = (testCode && testCode.trim() !== '') ? testCode : generateBasicTest(contractName, code);
    const testPath = path.join(testDir, `${contractName}Test.t.sol`);
    fs.writeFileSync(testPath, testContent, 'utf8');

    // 3) Prepara resultados
    const results = { id, workspace, init: initResult };

    // 4) Roda forge build (compilação)
    const buildCmd = `cd ${workspace} && forge build`;
    const buildResult = await safeExec(buildCmd);
    results.build = buildResult;

    // Se houver erro de compilação severo, podemos continuar para extrair os logs
    
    // 5) Roda os testes se solicitado
    if (runTests) {
      let testCmd = `cd ${workspace} && forge test --gas-report`;
      if (doFuzz) {
        testCmd = `cd ${workspace} && forge test --gas-report -vvv`;
      }
      
      const testPromise = safeExec(testCmd);
      const timed = await Promise.race([
        testPromise,
        new Promise((r) => setTimeout(() => r({ err: { message: 'timeout' }, stdout: '', stderr: 'timeout' }), timeoutSec * 1000))
      ]);
      results.test = timed;
    }

    // 6) Cobertura
    if (runCoverage) {
      const covCmd = `cd ${workspace} && forge coverage --no-ansi`;
      const cov = await safeExec(covCmd);
      results.coverage = cov;
    }

    // 7) Lê o arquivo de teste para inspeção (caso tenha sido autogerado)
    const generatedTest = fs.readFileSync(testPath, 'utf8');

    // 8) Coleta os outputs
    const out = {
      id,
      workspace,
      init: {
        stdout: initResult.stdout,
        stderr: initResult.stderr
      },
      build: { stdout: results.build.stdout, stderr: results.build.stderr },
      test: results.test ? { stdout: results.test.stdout, stderr: results.test.stderr } : null,
      coverage: results.coverage ? { stdout: results.coverage.stdout, stderr: results.coverage.stderr } : null,
      generatedTest,
      // Retornamos a saída bruta para o frontend renderizar o console
      rawOutput: results.test ? results.test.stdout : ""
    };

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Forge backend listening on port ${port}`));

// ==========================================
// ROTA DO MYTHRIL (Execução Simbólica)
// ==========================================
app.post('/analyze-mythril', async (req, res) => {
  const { code, contractName = 'TargetContract', max_depth = 5, timeout_sec = 60, tx_count = 2 } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Nenhum código fornecido' });
  }

  const id = uuidv4();
  const workspace = path.join(os.tmpdir(), `myth_run_${id}`);
  fs.mkdirSync(workspace, { recursive: true });
  
  const filePath = path.join(workspace, `${contractName}.sol`);
  fs.writeFileSync(filePath, code, 'utf8');

  try {
    // Monta o comando de execução do Mythril com saída em formato JSON
    const cmd = `python3 -m mythril analyze ${filePath} -o json --max-depth ${max_depth} -t ${tx_count} --execution-timeout ${timeout_sec}`;
    
    const start = Date.now();
    const result = await safeExec(cmd);
    const elapsed_ms = Date.now() - start;

    let issues = [];
    
    // Tenta fazer o parse da saída do Mythril para extrair os alertas reais
    try {
      const parsedOutput = JSON.parse(result.stdout);
      // O Mythril geralmente retorna as vulnerabilidades dentro de um array ou objeto 'issues'
      if (parsedOutput && parsedOutput.length > 0 && parsedOutput[0].issues) {
        issues = parsedOutput[0].issues;
      } else if (parsedOutput && parsedOutput.issues) {
        issues = parsedOutput.issues;
      }
    } catch (parseError) {
      console.log("Aviso: A saída do Mythril não foi um JSON válido (possível erro de compilação).");
    }

    res.json({
      success: true,
      issues: issues,
      stdout: result.stdout,
      stderr: result.stderr,
      elapsed_ms: elapsed_ms
    });

  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});