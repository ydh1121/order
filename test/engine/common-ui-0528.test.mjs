import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';

const source=await readFile(new URL('../../web/common-ui.mjs',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const assignment=name=>{const node=ast.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.property?.name===name);return source.slice(node.start,node.end);};
const harness=()=>{
 const context={window:{},CODE1_UI:{accordion:({content})=>`<button type="button" data-ui-subaccordion>복제할 항목</button>${content}`},document:{createElement:()=>({dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}})}};
 vm.runInNewContext(assignment('OrderIcons'),context);context.OrderIcons=context.window.OrderIcons;
 vm.runInNewContext(assignment('OrderCopyDialog'),context);return context.window;
};

test('C28-08 contact field presentation merges real values with choices, escapes input and preserves Q4 default',()=>{
 const {OrderCopyDialog:copy}=harness();
 const field=copy.contactField({key:'email',label:'이메일',value:'<img src=x onerror=alert(1)>'});
 assert.match(field,/data-contact-copy-field="email"/);assert.match(field,/ui-copy-field-label">이메일<\/strong> : /);assert.match(field,/data-copy-source-value="email">&lt;img/);assert.doesNotMatch(field,/<img/);
 const contact=copy.create({id:'contacts',title:'사업장 A 연락처 복사',fields:field,targets:'<label>사업장 B</label>',presentation:'contact'});
 assert.equal(contact.dataset.copyPresentation,'contact');assert.doesNotMatch(contact.innerHTML,/data-copy-accordion|data-ui-subaccordion/);assert.match(contact.innerHTML,/qa-copy-count/);assert.match(contact.innerHTML,/qa-copy-accordion-area/);assert.match(contact.innerHTML,/qa-copy-targets/);
 const q4=copy.create({title:'납품 조건 복사',fields:'fields',targets:'targets'});assert.match(q4.innerHTML,/data-copy-accordion/);
});

test('C28-09 contact comparisons hide visible labels but retain unique accessible before/after semantics for 20 sites',()=>{
 const {OrderCopyDialog:copy}=harness();const patches=Array.from({length:20},(_,i)=>({name:'사업장 '+i,changes:[{label:'이메일',before:'a@example.com',after:'b@example.com<&>'}]}));
 const html=copy.renderReview(patches,{prefix:'contact',presentation:'contact'});
 assert.equal((html.match(/ui-copy-review-label visually-hidden/g)||[]).length,40);assert.equal((html.match(/ui-copy-review-site--contact/g)||[]).length,20);assert.match(html,/b@example.com&lt;&amp;&gt;/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const label of html.matchAll(/aria-labelledby="([^"]+)"/g))for(const id of label[1].split(' '))assert.ok(ids.includes(id));
 assert.equal((html.match(/>현재<\/dt>/g)||[]).length,20);assert.equal((html.match(/>변경 후<\/dt>/g)||[]).length,20);
});

test('C28-04/05/11 shared icons preserve SVG role and unlink alias without page-local artwork',()=>{
 const {OrderIcons:icons}=harness();for(const key of ['plus','eraser','link','linkOff']){const svg=icons.svg(key);assert.match(svg,/viewBox="0 0 20 20"/);assert.match(svg,/aria-hidden="true"/);assert.match(svg,/stroke="currentColor"/);}
 assert.ok(icons.svg('unlink').includes(icons.definitions.linkOff.body));
});
