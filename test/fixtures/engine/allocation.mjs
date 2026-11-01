// Synthetic quantity states only; no approved commercial stock or supply data.
export const quantity=(raw,unit='each')=>({raw:String(raw),unit});
export const entry=(locationId,raw,source='manual',lineId='line-eggs',unit='each')=>({lineId,locationId,quantity:quantity(raw,unit),source,mode:'FLEX'});
export function allocationState(){return {revision:1,lines:[{lineId:'line-eggs',specVersion:'TEST-SPEC-30-EGGS',total:quantity(200),locationIds:['a','b'],unitTable:{version:'TEST-UNITS-1',baseUnit:'each',factors:{each:'1',tray:'30'}}}],locations:[{locationId:'a',name:'same-name'},{locationId:'b',name:'same-name'},{locationId:'c',name:'extra'}],allocations:[entry('a',50)],receipts:[]};}
