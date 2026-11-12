import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=await readFile(new URL('../../web/app.mjs',import.meta.url),'utf8');
function find(value){if(!value||typeof value!=='object')return null;if(value.type==='FunctionDeclaration'&&value.id?.name==='syncQ2Tracks')return value;for(const child of Object.values(value))for(const item of Array.isArray(child)?child:[child]){const result=find(item);if(result)return result;}return null;}
const node=find(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert.ok(node);
function fixture(width,budget){
 const quantity={value:'24'},price={value:budget,nextElementSibling:{getBoundingClientRect:()=>({width:13})}};
 // An empty CSS font shorthand is legal when non-default tabular numerals
 // cannot be represented by it. A canvas ignores an invalid/empty assignment.
 let canvasFont='10px sans-serif';const context={get font(){return canvasFont;},set font(value){if(value)canvasFont=value;},measureText(value){return {width:Number(canvasFont.match(/([\d.]+)px/)?.[1]||10)*.55*value.length};}};
 const list={clientWidth:width,dataset:{},style:{setProperty(){}},querySelectorAll(selector){return selector==='[data-line-qty]'?[quantity]:[price];}};
 const sync=vm.runInNewContext(source.slice(node.start,node.end)+';syncQ2Tracks',{$:()=>list,document:{createElement:()=>({getContext:()=>context})},getComputedStyle:()=>({font:'',fontStyle:'normal',fontWeight:'750',fontSize:'20px',fontFamily:'Arial'})});
 return {sync,list,quantity,price,context};
}
test('Q2 shared tracks measure tabular-number font longhands before fitting a 12-digit budget',()=>{
 const f=fixture(332,'999,999,999,999');f.sync();
 assert.equal(f.list.dataset.numberStack,'true');assert.match(f.context.font,/750 20px Arial/);
 assert.equal(f.price.value,'999,999,999,999','Layout must not truncate or rewrite the value');
});
test('Q2 small values retain compact adjacent tracks; resize recomputes fit without modifying inputs',()=>{
 const f=fixture(332,'5,000');f.sync();assert.equal(f.list.dataset.numberStack,'false');
 f.price.value='999,999,999,999';f.list.clientWidth=700;f.sync();assert.equal(f.list.dataset.numberStack,'false');
 f.list.clientWidth=332;f.sync();assert.equal(f.list.dataset.numberStack,'true');assert.equal(f.quantity.value,'24');
});
