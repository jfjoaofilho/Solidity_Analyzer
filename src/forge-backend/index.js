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
    const proc = exec(cmd, opts, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function generateBasicTest(contractName, source) {
  // Very naive parser: find public/external functions signature names
  const fnRegex = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(public|external)/g;
  const fns = [];
  let m;
  while ((m = fnRegex.exec(source)) !== null) {
    const name = m[1];
    const args = m[2].trim();
    fns.push({ name, args });
  }

  // Create a basic Foundry test (Solidity)
  // We'll use DSTest / Test from forge-std (forge project will include lib)
  // Template:
  let test = `// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/${contractName}.sol";

contract ${contractName}Test is Test {
    ${contractName} instance;

    function setUp() public {
        instance = new ${contractName}();
    }

    function test_deploy() public {
        assert(address(instance) != address(0));
    }\n\n`;

  // Add simple calls for first few functions (use defaults: 0/false/address(0))
  for (let i = 0; i < Math.min(3, fns.length); i++) {
    const fn = fns[i];
    const args = fn.args.split(',').map(s => s.trim()).filter(Boolean);
    const callArgs = args.map(a => {
      // pick default by type name
      if (a.includes('uint') || a.includes('int')) return '1';
      if (a.includes('bool')) return 'true';
      if (a.includes('address')) return 'address(this)';
      if (a.includes('string')) return '"test"';
      return '0';
    }).join(', ');
    // safest: call in try/catch style using low-level call? simpler: just call and ignore revert (wrap with try/catch introduced in solidity 0.8.0)
    test += `    function test_call_${fn.name}() public {
        // best-effort: call ${fn.name} with simple defaults
        try instance.${fn.name}(${callArgs}) {
            // success
        } catch {
            // ignore failures from heuristic call
        }
    }\n\n`;
  }

  // Add a basic fuzz test if present
  test += `    // Example simple fuzz - adjust to target functions manually
    function test_fuzz_uint(uint256 x) public {
        // placeholder fuzz: call one function if exists
        // add your own fuzz tests for meaningful coverage
    }\n`;

  test += `}\n`;
  return test;
}

app.post('/analyze', async (req, res) => {
  // body: { code: string, contractName?: string, runTests?: bool, runCoverage?: bool, doFuzz?: bool, timeoutSec?: number }
  const { code, contractName = 'Contract', runTests = true, runCoverage = false, doFuzz = false, timeoutSec = 300 } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'No code provided' });

  const id = uuidv4();
  const workspace = path.join(os.tmpdir(), `forge_run_${id}`);
  fs.mkdirSync(workspace, { recursive: true });

  try {
    // 1) init a forge project
    // Note: requires foundryup / forge installed on host
    const initCmd = `cd ${workspace} && forge init --force --no-git`;
    const initResult = await safeExec(initCmd);
    // write contract to src/
    const srcDir = path.join(workspace, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const filename = `${contractName}.sol`;
    fs.writeFileSync(path.join(srcDir, filename), code, 'utf8');

    // 2) create test file heuristically
    const testDir = path.join(workspace, 'test');
    fs.mkdirSync(testDir, { recursive: true });
    const testContent = generateBasicTest(contractName, code);
    const testPath = path.join(testDir, `${contractName}Test.t.sol`);
    fs.writeFileSync(testPath, testContent, 'utf8');

    // 3) prepare commands
    const results = { id, workspace, init: initResult };

    // 4) run forge build (compile)
    const buildCmd = `cd ${workspace} && forge build`;
    const buildResult = await safeExec(buildCmd);
    results.build = buildResult;

    // If compile errors, return early with logs
    if (buildResult.err && buildResult.err.code) {
      // return logs
    }

    // 5) run tests if requested
    if (runTests) {
      let testCmd = `cd ${workspace} && forge test --no-ansi`;
      if (doFuzz) {
        // Foundry fuzz runs as part of forge test; we add -vv to increase verbosity
        testCmd = `cd ${workspace} && forge test -vv --no-ansi`;
      }
      const testPromise = safeExec(testCmd);
      // implement timeout
      const timed = await Promise.race([
        testPromise,
        new Promise((r) => setTimeout(() => r({ err: { message: 'timeout' }, stdout: '', stderr: 'timeout' }), timeoutSec * 1000))
      ]);
      results.test = timed;
    }

    // 6) coverage
    if (runCoverage) {
      // forge coverage can require llvm; user must have it installed
      const covCmd = `cd ${workspace} && forge coverage --no-ansi`;
      const cov = await safeExec(covCmd);
      results.coverage = cov;
    }

    // 7) read test file and return results and generated test for inspection
    const generatedTest = fs.readFileSync(testPath, 'utf8');

    // 8) collect outputs
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
      generatedTest
    };

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Forge backend listening on ${port}`));
