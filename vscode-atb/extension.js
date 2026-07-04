const vscode = require('vscode');

const HEADING2 = /^＠＠(?!＠)/;
const HEADING1 = /^＠(?!＠)(?!ー)(?![^＠（）\n]+（)/;

function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'atb' },
      { provideFoldingRanges }
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'atb' },
      { provideDocumentSymbols }
    )
  );
}

function collectHeadings(document) {
  const headings = [];
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    if (HEADING2.test(text)) {
      headings.push({ line: i, level: 2, text: text.replace(/^＠＠/, '') });
    } else if (HEADING1.test(text)) {
      headings.push({ line: i, level: 1, text: text.replace(/^＠/, '') });
    }
  }
  for (let i = 0; i < headings.length; i++) {
    let endLine = document.lineCount - 1;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        endLine = headings[j].line - 1;
        break;
      }
    }
    headings[i].endLine = endLine;
  }
  return headings;
}

function provideFoldingRanges(document) {
  return collectHeadings(document)
    .filter(h => h.endLine > h.line)
    .map(h => new vscode.FoldingRange(h.line, h.endLine));
}

function provideDocumentSymbols(document) {
  const headings = collectHeadings(document);
  const symbols = [];
  let currentLevel1 = null;

  for (const h of headings) {
    const selRange = new vscode.Range(h.line, 0, h.line, document.lineAt(h.line).text.length);
    const fullRange = new vscode.Range(h.line, 0, h.endLine, document.lineAt(h.endLine).text.length);
    const kind = h.level === 1 ? vscode.SymbolKind.Module : vscode.SymbolKind.String;
    const symbol = new vscode.DocumentSymbol(h.text || '（無題）', '', kind, fullRange, selRange);

    if (h.level === 1) {
      symbols.push(symbol);
      currentLevel1 = symbol;
    } else {
      (currentLevel1 ? currentLevel1.children : symbols).push(symbol);
    }
  }

  return symbols;
}

function deactivate() {}

module.exports = { activate, deactivate };
