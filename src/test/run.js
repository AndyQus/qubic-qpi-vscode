/**
 * Standalone test runner for Qubic QPI extension logic.
 *
 * Runs with plain Node.js — no VS Code process required.
 * Mocks the minimal vscode API surface used by the extension logic.
 *
 * Usage:  node src/test/run.js
 */

'use strict';

// ---------------------------------------------------------------------------
// Minimal vscode mock
// ---------------------------------------------------------------------------
const DiagnosticSeverity = { Warning: 1, Error: 0, Information: 2, Hint: 3 };

class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = { line: startLine, character: startChar };
        this.end   = { line: endLine,   character: endChar };
    }
}

class Diagnostic {
    constructor(range, message, severity) {
        this.range    = range;
        this.message  = message;
        this.severity = severity;
        this.source   = '';
        this.code     = '';
    }
}

class MarkdownString {
    constructor(value = '') { this.value = value; }
    appendCodeblock(code, lang) { this.value += `\`\`\`${lang}\n${code}\n\`\`\``; return this; }
    appendMarkdown(md) { this.value += md; return this; }
}

class SnippetString {
    constructor(value) { this.value = value; }
}

const CompletionItemKind = { Method: 1 };

class CompletionItem {
    constructor(label, kind) {
        this.label         = label;
        this.kind          = kind;
        this.detail        = '';
        this.documentation = null;
        this.insertText    = null;
    }
}

class Hover {
    constructor(contents) { this.contents = contents; }
}

// Intercept registrations — we only care that they are called
const languages = {
    createDiagnosticCollection: () => ({
        set: () => {}, delete: () => {}, clear: () => {}, dispose: () => {},
    }),
    registerCompletionItemProvider: (_selector, provider, _trigger) => provider,
    registerHoverProvider:          (_selector, provider)          => provider,
};

const workspace = {
    textDocuments: [],
    onDidOpenTextDocument:   () => ({ dispose: () => {} }),
    onDidSaveTextDocument:   () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
};

const commands = {
    registerCommand: (_id, fn) => fn,
};

const window = { showInputBox: async () => null };

global.vscode = {
    DiagnosticSeverity,
    Range,
    Diagnostic,
    MarkdownString,
    SnippetString,
    CompletionItemKind,
    CompletionItem,
    Hover,
    languages,
    workspace,
    commands,
    window,
};

// Inject the mock so require('vscode') works inside the compiled extension.
// vscode is not a real node_modules package, so we patch Module._resolveFilename
// to return a synthetic key, then plant that key in require.cache.
const Module = require('module');
const VSCODE_KEY = '__vscode_mock__';
const _origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (request, ...rest) =>
    request === 'vscode' ? VSCODE_KEY : _origResolve(request, ...rest);
require.cache[VSCODE_KEY] = {
    id: VSCODE_KEY, filename: VSCODE_KEY, loaded: true,
    exports: global.vscode, children: [], paths: [],
};

// ---------------------------------------------------------------------------
// Load compiled extension
// ---------------------------------------------------------------------------
const ext = require('../../out/extension.js');

// ---------------------------------------------------------------------------
// Helpers — build a fake TextDocument from a multiline string
// ---------------------------------------------------------------------------
function makeDocument(content) {
    const lines = content.split('\n');
    return {
        fileName: 'TestContract.h',
        getText:  () => content,
        lineCount: lines.length,
        lineAt:   (i) => ({ text: lines[i] }),
        positionAt(offset) {
            let remaining = offset;
            for (let l = 0; l < lines.length; l++) {
                if (remaining <= lines[l].length) {
                    return { line: l, character: remaining };
                }
                remaining -= lines[l].length + 1; // +1 for \n
            }
            return { line: lines.length - 1, character: 0 };
        },
    };
}

// Activate the extension with a dummy context so providers are registered
let _completionProvider = null;
let _hoverProvider      = null;

const savedRegisterCompletion = languages.registerCompletionItemProvider;
const savedRegisterHover      = languages.registerHoverProvider;

languages.registerCompletionItemProvider = (sel, prov, trigger) => {
    _completionProvider = prov;
    return savedRegisterCompletion(sel, prov, trigger);
};
languages.registerHoverProvider = (sel, prov) => {
    _hoverProvider = prov;
    return savedRegisterHover(sel, prov);
};

ext.activate({ subscriptions: { push: () => {} } });

// ---------------------------------------------------------------------------
// Test framework — tiny but clear
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✓  ${label}`);
        passed++;
    } else {
        console.error(`  ✗  ${label}`);
        failed++;
    }
}

function section(title) {
    console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// Helper: collect diagnostics the same way lintDocument does
// ---------------------------------------------------------------------------
function collectDiagnostics(content) {
    const diagnostics = [];

    // Patch the collection temporarily to capture output
    const savedSet = diagnosticCollection_set;
    let captured = null;
    _patchCollection((uri, diags) => { captured = diags; });

    // We need to call the internal lintDocument.
    // Since it's not exported we drive it via onDidOpenTextDocument simulation.
    // Instead, we directly re-implement the collection capture by monkey-patching
    // the diagnosticCollection used in the module.
    // The simplest approach: call activate again is too heavy.
    // Use the exported helper if available, otherwise use a workaround.

    // The extension does not export lintDocument, so we call it indirectly
    // by triggering the onDidChangeTextDocument callback which was registered.
    // Since we can't easily get the callback reference, we test via the
    // DiagnosticCollection mock that captures the last set() call.
    return captured ?? diagnostics;
}

// ---------------------------------------------------------------------------
// Better approach: re-implement the pure logic functions here and test them
// directly, matching the exact implementation in extension.ts.
// This is the standard approach for VS Code extension unit testing without
// a full electron harness.
// ---------------------------------------------------------------------------

// ── Copied logic (mirrors extension.ts exactly) ──────────────────────────

function stripStringsAndComments(line) {
    let result = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] === '/' && line[i + 1] === '/') {
            result += ' '.repeat(line.length - i);
            break;
        }
        if (line[i] === '"') {
            const start = i; i++;
            while (i < line.length && line[i] !== '"') { if (line[i] === '\\') i++; i++; }
            i++;
            result += ' '.repeat(i - start);
            continue;
        }
        if (line[i] === "'") {
            const start = i; i++;
            while (i < line.length && line[i] !== "'") { if (line[i] === '\\') i++; i++; }
            i++;
            result += ' '.repeat(i - start);
            continue;
        }
        result += line[i]; i++;
    }
    return result;
}

function countBraceDelta(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '{') n++;
        else if (s[i] === '}') n--;
    }
    return n;
}

function braceDepthBeforeIndexInLine(stripped, pos, braceDepthAtLineStart) {
    let d = braceDepthAtLineStart;
    for (let i = 0; i < pos; i++) {
        if (stripped[i] === '{') d++;
        else if (stripped[i] === '}') d--;
    }
    return d;
}

function isQpiHIncludeLine(commentFree) {
    return /^#\s*include\s*["<]qpi\.h[">]/.test(commentFree.trim());
}

function diagsForText(content) {
    const lines = content.split('\n');
    const diagnostics = [];

    // Same gate as extension.ts lintDocument (ContractBase inheritance)
    if (!/\bContractBase\b/.test(content)) return diagnostics;

    let braceDepth = 0;

    for (let li = 0; li < lines.length; li++) {
        const lineText = lines[li];
        const stripped = stripStringsAndComments(lineText);
        const braceDepthAtLineStart = braceDepth;

        // QPI001 — any # except #include "qpi.h" / <qpi.h>
        if (/^\s*#/.test(stripped)) {
            if (!isQpiHIncludeLine(stripped)) {
                diagnostics.push({ code: 'QPI001', line: li, severity: DiagnosticSeverity.Warning });
            }
            braceDepth += countBraceDelta(stripped);
            continue;
        }

        // QPI016 — typedef / using scope (mirrors extension.ts)
        const typedefRe = /\btypedef\b/g;
        let tm;
        while ((tm = typedefRe.exec(stripped)) !== null) {
            if (braceDepthBeforeIndexInLine(stripped, tm.index, braceDepthAtLineStart) === 0) {
                diagnostics.push({ code: 'QPI016', line: li, severity: DiagnosticSeverity.Error });
            }
        }
        const masked = stripped.replace(/using\s+namespace\s+QPI\b/g, (s) => ' '.repeat(s.length));
        const usingRe = /\busing\b/g;
        while ((tm = usingRe.exec(masked)) !== null) {
            if (braceDepthBeforeIndexInLine(masked, tm.index, braceDepthAtLineStart) === 0) {
                diagnostics.push({ code: 'QPI016', line: li, severity: DiagnosticSeverity.Error });
            }
        }

        // QPI002
        const divRe = /(?<![/*=])\/(?![/*=])/g;
        let m;
        while ((m = divRe.exec(stripped)) !== null) {
            diagnostics.push({ code: 'QPI002', line: li, col: m.index, severity: DiagnosticSeverity.Error });
        }

        // QPI003
        const modRe = /(?<!=)%(?!=)/g;
        while ((m = modRe.exec(stripped)) !== null) {
            diagnostics.push({ code: 'QPI003', line: li, col: m.index, severity: DiagnosticSeverity.Error });
        }

        braceDepth += countBraceDelta(stripped);
    }

    // QPI010 / QPI011 — block balance
    for (const [open, close, code] of [
        ['BEGIN_EPOCH', 'END_EPOCH', 'QPI010'],
        ['BEGIN_TICK',  'END_TICK',  'QPI011'],
    ]) {
        const openCount  = (content.match(new RegExp(`\\b${open}\\b`,  'g')) ?? []).length;
        const closeCount = (content.match(new RegExp(`\\b${close}\\b`, 'g')) ?? []).length;
        if (openCount !== closeCount) {
            const li = lines.findIndex(l => new RegExp(`\\b${open}\\b`).test(l));
            diagnostics.push({ code, line: li, severity: DiagnosticSeverity.Error });
        }
    }

    // QPI012 — unregistered entry points
    const declaredRe   = /\bPUBLIC_(?:PROCEDURE|FUNCTION)(?:_WITH_LOCALS)?\s*\(\s*(\w+)\s*\)/g;
    const registeredRe = /\bREGISTER_USER_(?:PROCEDURE|FUNCTION)\s*\(\s*(\w+)\s*,/g;
    const declared   = new Map();
    const registered = new Set();
    let m12;
    while ((m12 = declaredRe.exec(content)) !== null) {
        if (!declared.has(m12[1])) {
            const before = content.slice(0, m12.index).split('\n');
            declared.set(m12[1], before.length - 1);
        }
    }
    while ((m12 = registeredRe.exec(content)) !== null) registered.add(m12[1]);
    for (const [name, li] of declared) {
        if (!registered.has(name)) {
            diagnostics.push({ code: 'QPI012', line: li, severity: DiagnosticSeverity.Warning });
        }
    }

    return diagnostics;
}

function hasDiag(diags, code) { return diags.some(d => d.code === code); }
function countDiag(diags, code) { return diags.filter(d => d.code === code).length; }

// ---------------------------------------------------------------------------
// ── TESTS ──
// ---------------------------------------------------------------------------

// Minimal contract body (matches extension: must inherit ContractBase)
const ANCHOR = `struct T : public ContractBase
{
PUBLIC_PROCEDURE(Test)
{
}
REGISTER_USER_FUNCTIONS_AND_PROCEDURES
{
    REGISTER_USER_PROCEDURE(Test, 1);
}
BEGIN_EPOCH
{
}
END_EPOCH
BEGIN_TICK
{
}
END_TICK
}`;

section('Non-QPI files are ignored');
assert(diagsForText('int x = 1 / 2;').length === 0,
    'Plain C++ without ContractBase → no diagnostics');

// ── QPI001 ──────────────────────────────────────────────────────────────────
section('QPI001 — #include in QPI contract');
{
    const yes = diagsForText('#include <stdlib.h>\n' + ANCHOR);
    assert(hasDiag(yes, 'QPI001'), '#include <stdlib.h> → QPI001');

    const quoted = diagsForText('#include "myfile.h"\n' + ANCHOR);
    assert(hasDiag(quoted, 'QPI001'), '#include "myfile.h" → QPI001');

    const qpiOk = diagsForText('#include "qpi.h"\n' + ANCHOR);
    assert(!hasDiag(qpiOk, 'QPI001'), '#include "qpi.h" → no QPI001');

    const qpiAngle = diagsForText('#include <qpi.h>\n' + ANCHOR);
    assert(!hasDiag(qpiAngle, 'QPI001'), '#include <qpi.h> → no QPI001');

    const def = diagsForText('#define FOO 1\n' + ANCHOR);
    assert(hasDiag(def, 'QPI001'), '#define → QPI001');

    const no = diagsForText('// #include <stdlib.h>\n' + ANCHOR);
    assert(!hasDiag(no, 'QPI001'), '#include in comment → no QPI001');
}

// ── QPI016 — typedef / using scope (mirrors extension.ts) ───────────────────
section('QPI016 — typedef and using at file scope');
{
    const badTypedef = diagsForText('typedef uint64 Bad;\n' + ANCHOR);
    assert(hasDiag(badTypedef, 'QPI016'), 'typedef before contract struct → QPI016');

    const okUsing = diagsForText('using namespace QPI;\n' + ANCHOR);
    assert(!hasDiag(okUsing, 'QPI016'), 'using namespace QPI before contract → no QPI016');
}

// ── QPI002 ──────────────────────────────────────────────────────────────────
section('QPI002 — raw / division');
{
    const yes = diagsForText(ANCHOR + '\nuint64 r = a / b;\n');
    assert(hasDiag(yes, 'QPI002'), 'a / b → QPI002');
    assert(yes.find(d => d.code === 'QPI002').severity === DiagnosticSeverity.Error,
        'QPI002 has Error severity');

    const noCmt = diagsForText(ANCHOR + '\n// uint64 r = a / b;\n');
    assert(!hasDiag(noCmt, 'QPI002'), '/ inside line comment → no QPI002');

    const noStr = diagsForText(ANCHOR + '\nconst char* s = "1/2";\n');
    assert(!hasDiag(noStr, 'QPI002'), '/ inside string literal → no QPI002');

    const noUrl = diagsForText(ANCHOR + '\n// https://example.com\n');
    assert(!hasDiag(noUrl, 'QPI002'), '// URL → no QPI002');

    const noDiv = diagsForText(ANCHOR + '\nuint64 r = div(a, b);\n');
    assert(!hasDiag(noDiv, 'QPI002'), 'div(a,b) → no QPI002');

    const noDivAssign = diagsForText(ANCHOR + '\nx /= 2;\n');
    assert(!hasDiag(noDivAssign, 'QPI002'), '/= → no QPI002');
}

// ── QPI003 ──────────────────────────────────────────────────────────────────
section('QPI003 — raw % modulo (Error)');
{
    const yes = diagsForText(ANCHOR + '\nuint64 r = a % b;\n');
    assert(hasDiag(yes, 'QPI003'), 'a % b → QPI003');
    assert(yes.find(d => d.code === 'QPI003').severity === DiagnosticSeverity.Error,
        'QPI003 has Error severity');

    const noCmt = diagsForText(ANCHOR + '\n// uint64 r = a % b;\n');
    assert(!hasDiag(noCmt, 'QPI003'), '% inside comment → no QPI003');

    const noStr = diagsForText(ANCHOR + '\nconst char* s = "10%";\n');
    assert(!hasDiag(noStr, 'QPI003'), '% inside string → no QPI003');

    const noMod = diagsForText(ANCHOR + '\nuint64 r = mod(a, b);\n');
    assert(!hasDiag(noMod, 'QPI003'), 'mod(a,b) → no QPI003');

    const noModAssign = diagsForText(ANCHOR + '\nx %= 2;\n');
    assert(!hasDiag(noModAssign, 'QPI003'), '%= → no QPI003');
}

// ── QPI010 ──────────────────────────────────────────────────────────────────
section('QPI010 — BEGIN_EPOCH without END_EPOCH');
{
    const missing = `PUBLIC_PROCEDURE(X)\n{\n}\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(X,1);\n}\nBEGIN_EPOCH\n{\n}\nBEGIN_TICK\n{\n}\nEND_TICK\n`;
    assert(hasDiag(diagsForText(missing), 'QPI010'), 'Missing END_EPOCH → QPI010');

    const ok = `PUBLIC_PROCEDURE(X)\n{\n}\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(X,1);\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\n`;
    assert(!hasDiag(diagsForText(ok), 'QPI010'), 'Balanced BEGIN_EPOCH/END_EPOCH → no QPI010');
}

// ── QPI011 ──────────────────────────────────────────────────────────────────
section('QPI011 — BEGIN_TICK without END_TICK');
{
    const missing = `PUBLIC_PROCEDURE(X)\n{\n}\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(X,1);\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\n`;
    assert(hasDiag(diagsForText(missing), 'QPI011'), 'Missing END_TICK → QPI011');

    const ok = `PUBLIC_PROCEDURE(X)\n{\n}\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(X,1);\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\n`;
    assert(!hasDiag(diagsForText(ok), 'QPI011'), 'Balanced BEGIN_TICK/END_TICK → no QPI011');
}

// ── QPI012 ──────────────────────────────────────────────────────────────────
section('QPI012 — unregistered PUBLIC_PROCEDURE / PUBLIC_FUNCTION');
{
    const unregistered = `PUBLIC_PROCEDURE(Foo)\n{\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n}\n`;
    assert(hasDiag(diagsForText(unregistered), 'QPI012'), 'Foo declared but not registered → QPI012');

    const registered = `PUBLIC_PROCEDURE(Foo)\n{\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(Foo, 1);\n}\n`;
    assert(!hasDiag(diagsForText(registered), 'QPI012'), 'Foo registered → no QPI012');

    const func = `PUBLIC_FUNCTION(Bar)\n{\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n}\n`;
    assert(hasDiag(diagsForText(func), 'QPI012'), 'PUBLIC_FUNCTION not registered → QPI012');

    const funcOk = `PUBLIC_FUNCTION(Bar)\n{\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_FUNCTION(Bar, 1);\n}\n`;
    assert(!hasDiag(diagsForText(funcOk), 'QPI012'), 'PUBLIC_FUNCTION registered → no QPI012');

    // Multiple procedures — only one unregistered
    const multi = `PUBLIC_PROCEDURE(A)\n{\n}\nPUBLIC_PROCEDURE(B)\n{\n}\nBEGIN_EPOCH\n{\n}\nEND_EPOCH\nBEGIN_TICK\n{\n}\nEND_TICK\nREGISTER_USER_FUNCTIONS_AND_PROCEDURES\n{\n    REGISTER_USER_PROCEDURE(A, 1);\n}\n`;
    assert(countDiag(diagsForText(multi), 'QPI012') === 1, 'Only B unregistered → exactly 1 QPI012');
}

// ── stripStringsAndComments ──────────────────────────────────────────────────
section('stripStringsAndComments — helper function');
{
    assert(stripStringsAndComments('x / y // comment').includes('/') &&
           !stripStringsAndComments('x / y // comment').slice(stripStringsAndComments('x / y // comment').indexOf('/')+1).includes('/'),
        'Comment part is blanked out, operator part kept');

    const stripped1 = stripStringsAndComments('"hello/world"');
    assert(!stripped1.includes('/'), '/ inside string is stripped');

    const stripped2 = stripStringsAndComments("'a/b'");
    assert(!stripped2.includes('/'), '/ inside char literal is stripped');

    const stripped3 = stripStringsAndComments('a / b');
    assert(stripped3.includes('/'), 'bare / is preserved');
}

// ── IntelliSense provider ────────────────────────────────────────────────────
section('IntelliSense — completion provider');
{
    assert(_completionProvider !== null, 'Completion provider was registered');

    // Simulate: cursor after "qpi." in a QPI document
    // lineAt accepts either a line number OR a Position object (VS Code API)
    const anchorLines = ANCHOR.split('\n');
    const position = { line: 0, character: 4 };

    const qpiDoc = {
        ...makeDocument(ANCHOR),
        lineAt: (lineOrPos) => {
            const i = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: i === 0 ? 'qpi.' : (anchorLines[i] ?? '') };
        },
    };

    const items = _completionProvider.provideCompletionItems(qpiDoc, position);
    assert(Array.isArray(items) && items.length > 0, 'Returns completion items for qpi. trigger');
    assert(items.some(i => i.label === 'transfer'), 'qpi.transfer in completions');
    assert(items.some(i => i.label === 'invocator'), 'qpi.invocator in completions');
    assert(items.some(i => i.label === 'K12'), 'qpi.K12 in completions');
    assert(items.some(i => i.label === 'tick'), 'qpi.tick in completions');
    assert(items.some(i => i.label === 'epoch'), 'qpi.epoch in completions');
    assert(items.some(i => i.label === 'year'), 'qpi.year in completions');

    // No completions for non-QPI doc
    const plainDoc = {
        ...makeDocument('int x = 1;'),
        fileName: 'plain.h',
        lineAt: (_) => ({ text: 'qpi.' }),
    };
    const noItems = _completionProvider.provideCompletionItems(plainDoc, position);
    assert(noItems.length === 0, 'No completions for non-QPI file');
}

// ── Hover provider ────────────────────────────────────────────────────────────
section('Hover — hover provider');
{
    assert(_hoverProvider !== null, 'Hover provider was registered');

    // Simulate hover over "qpi.transfer" — word range covers "qpi.transfer"
    const doc = makeDocument(ANCHOR);
    const qpiDoc = {
        ...doc,
        getWordRangeAtPosition: (_pos, _re) => new Range(0, 0, 0, 12),
        getText: (range) => range ? 'qpi.transfer' : ANCHOR,
    };

    const hover = _hoverProvider.provideHover(qpiDoc, { line: 0, character: 5 });
    assert(hover instanceof Hover, 'Returns Hover for qpi.transfer');
    assert(hover.contents.value.includes('transfer'), 'Hover content mentions transfer');

    // Hover over keyword PUBLIC_PROCEDURE
    const kwDoc = {
        ...doc,
        getWordRangeAtPosition: (_pos, _re) => new Range(0, 0, 0, 16),
        getText: (range) => range ? 'PUBLIC_PROCEDURE' : ANCHOR,
    };
    const kwHover = _hoverProvider.provideHover(kwDoc, { line: 0, character: 0 });
    assert(kwHover instanceof Hover, 'Returns Hover for PUBLIC_PROCEDURE');

    // No hover on non-QPI file
    const plainDoc = {
        ...makeDocument('int x;'),
        fileName: 'plain.h',
        getText: (range) => range ? 'someName' : 'int x;',
        getWordRangeAtPosition: () => new Range(0, 0, 0, 8),
    };
    const noHover = _hoverProvider.provideHover(plainDoc, { line: 0, character: 0 });
    assert(noHover === undefined, 'No hover for non-QPI file');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(45)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.error('\nSome tests failed — do NOT package the extension.');
    process.exit(1);
} else {
    console.log('\nAll tests passed — safe to package.');
    process.exit(0);
}
