import test from 'node:test';
import assert from 'node:assert/strict';
import {getMenuPlacement,menuViewport} from '../../web/quantity-menu.mjs';

const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height});
const viewport={left:0,top:0,width:320,height:400};

test('the regional list fits above a low field; the quantity menu uses the same edges',()=>{
 const anchor=box(224,307,72,44);
 assert.deepEqual(getMenuPlacement(anchor,{width:72,height:190},viewport),{left:224,top:113,width:72,height:190,up:true});
 assert.equal(getMenuPlacement(anchor,{width:120,height:130},viewport,{align:'end'}).left,176);
});
test('short menus stay below, large menus use available viewport height including keyboard offset',()=>{
 const view=menuViewport({visualViewport:{width:320,height:220,offsetLeft:5,offsetTop:89}});
 const anchor=box(-10,150,400,44);
 assert.deepEqual(getMenuPlacement(anchor,{width:400,height:40},view),{left:13,top:198,width:304,height:40,up:false});
 assert.deepEqual(getMenuPlacement(anchor,{width:400,height:190},view),{left:13,top:198,width:304,height:103,up:false});
});
