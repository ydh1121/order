import {validateEmailDomain} from '../../src/engine/validation/email-dns.mjs';
import {createNodeDnsResolver, domainToASCII} from '../../src/engine/adapters/dns-node.mjs';
// Explicit optional online check; not imported by tests or CI. Domain only, no mailbox.
const inputs=process.argv.slice(2);
if (!inputs.length || inputs.length>3 || inputs.some(x=>x.includes('@'))) {
  console.error('Usage: node scripts/engine/dns-smoke.mjs <domain> [domain] [domain] (maximum 3)');
  process.exitCode=2;
} else {
  for (const input of inputs) {
    const domain=domainToASCII(input).toLowerCase();
    const checkedAt=new Date().toISOString();
    const result=await validateEmailDomain(domain,{resolver:createNodeDnsResolver(),now:Date.now,maxQueries:16,timeoutMs:1000,totalTimeoutMs:5000});
    console.log(JSON.stringify({mode:'REAL_DNS_SMOKE',checkedAt,node:process.version,input,...result}));
  }
}
