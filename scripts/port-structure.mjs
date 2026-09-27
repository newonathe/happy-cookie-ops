import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const protectedDirs = ['src/components/screens', 'src/components/sheets', 'src/components/shell'];

// React JSX text normalization: indentation/newlines are formatting, intra-line spaces are not.
function jsxText(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const last = lines.findLastIndex((line) => /[^ \t]/.test(line));
  return lines.map((line, i) => {
    let part = line.replace(/\t/g, ' ');
    if (i !== 0) part = part.replace(/^ +/, '');
    if (i !== lines.length - 1) part = part.replace(/ +$/, '');
    return part && i !== last ? part + ' ' : part;
  }).join('');
}

export function structuralHash(source, file = 'source.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (tree.parseDiagnostics.length) throw new Error('Cannot fingerprint invalid syntax: ' + file);
  function nodeValue(node) {
    if (ts.isJsxText(node)) {
      const text = jsxText(node.text);
      return text ? [node.kind, text] : null;
    }
    const children = [];
    ts.forEachChild(node, (child) => { const value = nodeValue(child); if (value) children.push(value); });
    // Identifiers, strings, templates and numeric literals carry values outside their children.
    const text = !ts.isSourceFile(node) && typeof node.text === 'string' ? node.text : null;
    const declarations = ts.isVariableDeclarationList(node)
      ? node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using | ts.NodeFlags.AwaitUsing)
      : 0;
    return [node.kind, text, declarations, ...children];
  }
  return createHash('sha256').update(JSON.stringify(nodeValue(tree))).digest('hex');
}

export function structuralFiles(root) {
  return Object.fromEntries(protectedDirs.flatMap((dir) =>
    readdirSync(join(root, dir)).filter((file) => file.endsWith('.tsx') && !file.endsWith('.stories.tsx'))
      .map((file) => { const rel = dir + '/' + file; return [rel, structuralHash(readFileSync(join(root, rel), 'utf8'), rel)]; })
  ));
}

export function checkStructure(root) {
  const expected = JSON.parse(readFileSync(join(root, 'scripts/port-structure-baseline.json'), 'utf8'));
  const actual = structuralFiles(root);
  return [...new Set([...Object.keys(expected.files), ...Object.keys(actual)])]
    .filter((file) => actual[file] !== expected.files[file])
    .map((file) => file + ': AST structure/value/handler fingerprint changed');
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write-baseline')) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  writeFileSync(join(root, 'scripts/port-structure-baseline.json'), JSON.stringify({
    schema: 1, provenance: 'Original delivery plus owner-approved MP-02 five null guards and the MP-04 live-frame guards; see docs/state/protected-exception.md',
    files: structuralFiles(root)
  }, null, 2) + '\n');
}
