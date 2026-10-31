import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

// Read-only source inventory. Parser modules are explicit inputs, never copied
// into the product bundle. No HTML scripts, network requests or browser run.
const [sourcePath, outputPath, postcssPath, jsdomPath] = process.argv.slice(2);
if (!sourcePath || !outputPath || !postcssPath || !jsdomPath) {
  throw new Error('Usage: node audit-r10-0504.mjs source.html output.json /path/to/postcss /path/to/jsdom');
}
const require = createRequire(import.meta.url);
const postcss = require(postcssPath);
const { JSDOM, VirtualConsole } = require(jsdomPath);
const raw = readFileSync(sourcePath);
const html = raw.toString('utf8');
const sha256 = createHash('sha256').update(raw).digest('hex');
const expected = 'e13f200945b9277e986b1994fc4f91998fc68f18d1bcbc0b69cb8dc6dd54d6a8';
if (sha256 !== expected) throw new Error(`Source is not the pinned MSG0497 e13f baseline: ${sha256}`);
const lineAt = offset => html.slice(0, offset).split('\n').length;
const blocks = tag => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(m => ({
  text: m[1], line: lineAt(m.index + m[0].indexOf('>') + 1),
  start: m.index + m[0].indexOf('>') + 1,
}));
const styles = blocks('style');
const scripts = blocks('script');
const javascript = scripts.map(b => b.text).join('\n');
const css = styles.map(b => b.text).join('\n');
const rules = [], declarations = [], atRules = [], parseErrors = [], cssRecovery = [];
for (const block of styles) {
  let ast, candidate = block.text;
  // Preserve byte/line positions and source file. Recovery is only for inventory,
  // never evidence that a browser accepts or applies the original stylesheet.
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ast = postcss.parse(candidate, { from: sourcePath }); break; }
    catch (error) {
      const offset = candidate.split('\n').slice(0, error.line - 1).reduce((n,s) => n+s.length+1,0)+error.column-1;
      if (error.reason !== 'Unexpected }' || candidate[offset] !== '}') {
        throw new Error(`Unrecoverable CSS AST error at HTML line ${block.line+error.line-1}: ${error.reason}`);
      }
      cssRecovery.push({reason:error.reason,line:block.line+error.line-1,column:error.column,original:'}',analysisReplacement:' '});
      candidate = candidate.slice(0,offset)+' '+candidate.slice(offset+1);
    }
  }
  if (!ast) throw new Error('CSS AST recovery exceeded 100 errors');
  const context = node => {
    const chain = [];
    for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule') chain.unshift(`@${p.name} ${p.params}`);
    return chain.join(' > ');
  };
  ast.walkRules(node => rules.push({ selector: node.selector, line: block.line + node.source.start.line - 1, context: context(node) }));
  ast.walkDecls(node => declarations.push({
    selector: node.parent.type === 'rule' ? node.parent.selector : `@${node.parent.name || 'root'}`,
    property: node.prop, value: node.value, important: Boolean(node.important),
    line: block.line + node.source.start.line - 1, context: context(node),
  }));
  ast.walkAtRules(node => atRules.push({ name: node.name, params: node.params,
    line: block.line + node.source.start.line - 1, context: context(node),
    empty: Array.isArray(node.nodes) && !node.nodes.some(n => n.type !== 'comment'),
  }));
}
const group = (items, key) => {
  const result = new Map();
  for (const item of items) { const k = key(item); if (!result.has(k)) result.set(k, []); result.get(k).push(item); }
  return [...result].map(([key, occurrences]) => ({ key, occurrences, count: occurrences.length }));
};
const duplicateDeclarations = group(declarations, d => JSON.stringify([d.context, d.selector, d.property, d.value, d.important])).filter(g => g.count > 1);
const shadowCandidates = group(declarations, d => JSON.stringify([d.context, d.selector, d.property, d.important])).filter(g => new Set(g.occurrences.map(d => d.value)).size > 1);
const duplicateSelectors = group(rules, r => JSON.stringify([r.context, r.selector])).filter(g => g.count > 1);
const tokenDefinitions = group(declarations.filter(d => d.property.startsWith('--')), d => d.property);
const tokenReferences = group([...css.matchAll(/var\((--[\w-]+)/g)].map(m => ({ token: m[1] })), d => d.token).map(g => ({ token: g.key, count: g.count }));
const hexValues = group(declarations.flatMap(d => [...d.value.matchAll(/#[\da-f]{3,8}\b/gi)].map(m => ({ value: m[0].toLowerCase(), line: d.line, selector: d.selector, property: d.property }))), d => d.value).sort((a,b) => b.count-a.count);
const invalidVariableConcatenations = declarations.filter(d => /var\([^)]*\)[\da-f]{2}\b/i.test(d.value));
const repeatedPropertyValues = group(declarations.filter(d => !d.property.startsWith('--')), d => JSON.stringify([d.property,d.value])).filter(g => g.count >= 5).sort((a,b) => b.count-a.count);
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => parseErrors.push({ type: error.type, message: error.message }));
const dom = new JSDOM(html, { virtualConsole }); // default: no resource fetch or script execution
const document = dom.window.document;
const elements = [...document.querySelectorAll('*')];
const staticClasses = new Set(elements.flatMap(el => [...el.classList]));
const cssClasses = [...new Set(rules.flatMap(r => [...r.selector.matchAll(/\.([a-z_][\w-]*)/gi)].map(m => m[1])))].sort();
const classReferences = cssClasses.map(name => ({
  name, staticDOM: staticClasses.has(name), scriptTextReference: javascript.includes(name),
  selectors: rules.filter(r => new RegExp(`\\.${name}(?![\\w-])`).test(r.selector)).map(r => ({ selector:r.selector,line:r.line,context:r.context })),
}));
const sourceLines = html.split('\n');
const functionLocations = sourceLines.flatMap((text, index) => [...text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\bwindow\.(Order[\w]+)\s*=|\bconst\s+(CODE1_[A-Z_]+)\s*=/g)].map(m => ({ name: m[1] || m[2] || m[3], line:index+1 })));
const eventSites = sourceLines.flatMap((text,index) => [...text.matchAll(/\.addEventListener\(\s*([^,]+)|\.on(click|input|change|keydown|blur|focus)\s*=/g)].map(m => ({ line:index+1, kind:m[2] ? `property:on${m[2]}` : 'addEventListener', eventExpression:m[2] || m[1] })));
const storageSites = sourceLines.flatMap((text,index) => [...text.matchAll(/\b(?:sessionStorage|localStorage)\.(?:getItem|setItem|removeItem)\([^;]*/g)].map(m => ({line:index+1,source:m[0]})));
const size = text => ({rawBytes:Buffer.byteLength(text),gzipBytes:gzipSync(text,{level:9}).length});
const report = {
  audit:'R10_MSG0504_READ_ONLY',source:{path:sourcePath,sha256,bytes:raw.length},
  tooling:{node:process.version,postcss:postcss().version,jsdom:require(`${jsdomPath.replace(/\/lib\/api\.js$/, '')}/package.json`).version},
  method:'PostCSS AST after explicit in-memory unexpected-close recovery when needed; JSDOM static HTML parse with scripts/resources disabled; JS function/event sites are lexical inventory, not JS AST or installed listener counts.',
  cssParse:{originalStrict:cssRecovery.length?'FAIL':'PASS',inventoryRecovery:cssRecovery,originalFileChanged:false,browserCascadeVerified:false},
  measurements:{whole:size(raw),css:size(css),javascript:size(javascript),styleBlocks:styles.length,scriptBlocks:scripts.length,
    cssRules:rules.length,cssDeclarations:declarations.length,atRules:atRules.length,staticElements:elements.length,
    staticButtons:document.querySelectorAll('button').length,staticInputs:document.querySelectorAll('input').length,staticDialogs:document.querySelectorAll('dialog').length,
    cssClasses:cssClasses.length,staticClasses:staticClasses.size,addEventListenerSourceSites:eventSites.filter(e=>e.kind==='addEventListener').length,eventPropertySourceSites:eventSites.filter(e=>e.kind!=='addEventListener').length,
    exactDuplicateDeclarationGroups:duplicateDeclarations.length,exactDuplicateDeclarationExtraOccurrences:duplicateDeclarations.reduce((n,g)=>n+g.count-1,0),sameSelectorPropertyDifferentValueGroups:shadowCandidates.length,duplicateSelectorGroups:duplicateSelectors.length,
    customPropertyNames:tokenDefinitions.length,emptyMediaSupports:atRules.filter(r=>r.empty&&['media','supports'].includes(r.name)).length},
  execution:{sourceScripts:'NOT_RUN',browserComputedStyles:'NOT_RUN',sameStateScreenshots:'NOT_RUN',runtimeDOMListenerCounts:'NOT_RUN',representativeInputCost:'NOT_RUN',actualPublicBundle:'NOT_BUILT_BY_THIS_AUDIT',performanceImprovement:'NOT_CLAIMED'},
  rules,atRules,duplicateDeclarations,shadowCandidates,duplicateSelectors,tokenDefinitions,tokenReferences,hexValues,invalidVariableConcatenations,repeatedPropertyValues,classReferences,functionLocations,eventSites,storageSites,
  staticHTMLParseErrors:parseErrors,
};
dom.window.close();
writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({source:report.source,tooling:report.tooling,cssParse:report.cssParse,measurements:report.measurements,execution:report.execution},null,2));
