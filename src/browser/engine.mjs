// Public browser entry: keep every Node-only loader outside this dependency graph.
export {ENGINE_VERSION, CONTRACT_VERSION} from '../engine/contracts/result.mjs';
export {createOrderPhoneAdapter, parseBrowserPhone, projectPhone} from '../engine/adapters/phone-browser.mjs';
export {createBrowserEmailService} from '../engine/adapters/email-browser.mjs';
export {createBrowserIanaProvider, verifyBrowserIana, browserIanaFreshness} from '../engine/adapters/iana-browser.mjs';
export {evaluateAllocation, beginAllocationEdit, editAllocation, confirmAllocation, cancelAllocation, evaluateOnceAllocation, changeAllocationTopology} from '../engine/calculation/allocation.mjs';
export {calculateQuote} from '../engine/calculation/quote.mjs';
