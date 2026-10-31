// Synthetic inputs only. No personal contact, supplier, or operational prices.
export const UX_COMPARISON_FIXTURE_VERSION = 'ux-comparison-1.0.0';
export const OBSERVED_AT = Date.parse('2026-10-31T17:00:00Z');
export const DOMAIN = 'fixture.ooo';
export const phoneInputs = ['02-234-5678','022345678','0223456789','02-2345-6789','1588-1234','010-1234-12345678','070-234-5678','070-2345-6789','+82 10 2345 6789'];
export const dnsCases = ['sixth_mx_only_a','all_six_mx_absent','all_five_mx_absent','null_mx','implicit_a','implicit_aaaa','no_route','nxdomain'];
export function dnsObservation(id, name, type) {
  let records = [];
  if (id === 'nxdomain') return {status:'NXDOMAIN',records,observedAt:OBSERVED_AT,ttl:60};
  if (type === 'MX') {
    if (id === 'null_mx') records = [{priority:0,exchange:'.'}];
    if (['sixth_mx_only_a','all_six_mx_absent','all_five_mx_absent'].includes(id)) records = Array.from({length:id==='all_five_mx_absent'?5:6},(_,i)=>({priority:(i+1)*10,exchange:`mx${i+1}.example.test`}));
  } else if (type === 'A' && ((id === 'sixth_mx_only_a' && name === 'mx6.example.test') || id === 'implicit_a')) records = ['192.0.2.6'];
  else if (type === 'AAAA' && id === 'implicit_aaaa') records = ['2001:db8::6'];
  return {status:records.length?'NOERROR':'NODATA',records,observedAt:OBSERVED_AT,ttl:60};
}
