// Cell strings deliberately distinguish an unanswered cell, an explicit zero, and a commercial condition.
export function createPriceMatrixModel() {
  const cellStates = new Set(['', '협의', '판매 안 함']);
  const amount = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/;
  const token = /^[a-zA-Z0-9_.:-]{1,80}$/;
  function cellError(text, packed, raw) {
    if (typeof text !== 'string') return '금액 또는 판매 상태를 입력해 주세요.';
    if (cellStates.has(text) || amount.test(text)) return '';
    if (packed && text.startsWith('+') && amount.test(text.slice(1))) {
      return amount.test(raw) ? '' : '포장비를 더하려면 원란 단가가 필요합니다.';
    }
    return '0 이상 금액, 협의, 판매 안 함 중 하나를 입력해 주세요.';
  }
  function errors(matrix) {
    const issues = [];
    const add = (row, col, message) => issues.push({row, col, message});
    if (!matrix || matrix.schema !== 1 || !Array.isArray(matrix.grades) || !matrix.grades.length || matrix.grades.length > 32 ||
        !Array.isArray(matrix.rows) || !matrix.rows.length || matrix.rows.length > 100) {
      add(-1, -1, '규격 1~32개와 수량 구간 1~100개가 필요합니다.');
      return issues;
    }
    if (new Set(matrix.grades.map(g=>g?.id)).size !== matrix.grades.length || matrix.grades.some(g=>!g || typeof g.id!=='string' || !token.test(g.id) || typeof g.name!=='string' || !g.name.trim() || g.name.length>60)) {
      add(-1, -1, '승인된 상품 규격을 선택해 주세요.');
      return issues;
    }
    let expected = 1;
    for (const [i, row] of matrix.rows.entries()) {
      if (!row || !Array.isArray(row.cells) || row.cells.length !== matrix.grades.length * 2) {
        add(i, -1, '가격 열의 수가 규격과 일치하지 않습니다.');
        continue;
      }
      const min = row.min, max = row.max;
      if (!Number.isSafeInteger(min) || min < 1 || min > 1e9 || min !== expected) add(i, 0, '수량 1부터 빈 구간과 겹침 없이 이어 주세요.');
      if (max !== null && (!Number.isSafeInteger(max) || max < min || max > 1e9)) add(i, 1, '끝 수량은 시작 수량 이상이어야 합니다.');
      if ((max === null) !== (i === matrix.rows.length - 1)) add(i, 1, '마지막 구간만 끝 수량을 비워 주세요.');
      expected = max === null ? null : max + 1;
      row.cells.forEach((v,j)=>{const msg=cellError(v, j%2===1, row.cells[j-1]); if(msg)add(i,j+2,msg);});
    }
    return issues;
  }
  function select(matrix, qty, grade, packing) {
    const row=matrix.rows.find(r=>qty>=r.min&&(r.max===null||qty<=r.max));
    const gradeIndex=matrix.grades.findIndex(g=>g.id===grade);
    if(!row||gradeIndex<0||!['raw','packed'].includes(packing)) return {error:'PRICE_VARIANT_REQUIRED'};
    const raw=row.cells[gradeIndex*2], text=row.cells[gradeIndex*2+(packing==='packed'?1:0)];
    if (text==='') return {error:'PRICE_NOT_SET'};
    if (text==='협의') return {error:'PRICE_CONSULT'};
    if (text==='판매 안 함') return {error:'PRICE_NOT_OFFERED'};
    const added=text.startsWith('+');
    return {min:row.min,max:row.max,price:added?raw:text,packMode:added?'ADD':'FINAL',packFee:added?text.slice(1):null};
  }
  function shifted(value, delta) {
    if (!amount.test(value) || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(delta)) return null;
    const fixed = text => {
      const [whole,part='']=text.replace(/^-/,'').split('.');
      return BigInt(whole + part.padEnd(4,'0')) * (text.startsWith('-')?-1n:1n);
    };
    const result=fixed(value)+fixed(delta);
    if(result<0n) return null;
    const valueText=(result/10000n).toString()+'.'+(result%10000n).toString().padStart(4,'0');
    const normalized=valueText.replace(/0+$/,'').replace(/\.$/,'');
    return amount.test(normalized)?normalized:null;
  }
  return {errors, select, shifted};
}
