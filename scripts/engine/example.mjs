// Offline invocation example. No synthetic prices are imported into this script.
import {validatePhone} from '../../src/engine/validation/phone.mjs';
import {validateEmailSyntax,emailCompletionGate} from '../../src/engine/validation/email.mjs';
import {loadIanaSnapshot} from '../../src/engine/reference/iana.mjs';
import {domainToASCII} from '../../src/engine/adapters/dns-node.mjs';
import {engineResult} from '../../src/engine/contracts/result.mjs';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {periodQuantity,monthlyDayIntent} from '../../src/engine/calculation/period.mjs';
import {readFile} from 'node:fs/promises';

const tldData=await loadIanaSnapshot();
const email=validateEmailSyntax({raw:'Example+Tag@example.com'}, {domainToASCII,tldData,nowMs:Date.parse('2026-11-01T00:00:00.000Z')});
const offers=JSON.parse(await readFile(new URL('../../data/offers.json',import.meta.url),'utf8'));
const output={
  purpose:'OFFLINE_INVOCATION_EXAMPLE_NOT_A_PRODUCT_APPROVAL',
  phone:validatePhone({raw:'022345678',phase:'complete'}),
  email,
  emailGate:emailCompletionGate(email,engineResult({status:'UNKNOWN',field:'email.domain',normalized:{domain:'example.com'}})),
  unavailablePrice:calculateQuote({input:{asOf:'2026-11-01T00:00:00.000Z',lines:[{id:'example',siteId:'example',productId:'unavailable',quantity:'1',unit:'each'}]},catalog:{version:'UNAVAILABLE',products:[]},priceBook:{version:'UNAVAILABLE',offers:offers.offers}}),
  unresolvedPeriod:periodQuantity({perDelivery:'7',weeklyVisits:'1'}),
  unresolvedShortMonth:monthlyDayIntent({year:2026,month:2,day:31}),
};
console.log(JSON.stringify(output,null,2));
