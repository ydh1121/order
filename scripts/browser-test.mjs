import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "http://127.0.0.1:4173";
const browser = await chromium.launch({headless: true});
const approved = {
  id: "fixture-only-a",priceRevision:"t1",status:"APPROVED",
  approvedBy:"TEST_ONLY",approvedAt:"2026-10-11T00:00:00Z",
  legalSellerId:"TEST_ONLY",housing:"4",size:"XL",pack:30,
  regions:["서울"],minMonthlyTrays:100,minDropTrays:20,
  pricePerTray:6800,effectiveFrom:"2026-10-12T00:00:00Z"
};
const fixture = {schemaVersion:1,updatedAt:"2026-10-12T00:00:00Z",offers:[approved]};
try {
  for (const width of [360,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:850}});
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto(base+"/");
    await page.locator("#app-loading").waitFor({state:"hidden"});
    assert.match(await page.locator("#catalog-message").innerText(),/승인된 공개 가격표가 없습니다/);
    await page.locator("#calculate").click();
    assert.equal(new URL(page.url()).pathname,"/quote");
    assert.match(await page.locator("#quote-state").innerText(),/가격 확인 중/);
    assert.equal(await page.locator("#quote-prices").isVisible(),false);
    assert.equal(await page.locator("#apply").getAttribute("aria-disabled"),"true");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"no horizontal overflow");
    assert.deepEqual(errors,[]);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:850}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.route("**/data/offers.json",route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixture)}));
  await page.goto(base+"/");
  await page.locator("#app-loading").waitFor({state:"hidden"});
  await page.selectOption("#housing","4");
  await page.selectOption("#size","XL");
  await page.selectOption("#pack","30");
  await page.selectOption("#region","서울");
  await page.fill("#monthlyTrays","200");
  await page.fill("#dropTrays","30");
  await page.fill("#currentTrayPrice","7100");
  await page.locator("#calculate").click();
  assert.equal(new URL(page.url()).pathname,"/quote");
  assert.equal(await page.locator("#tray-price").innerText(),"6,800원");
  assert.equal(await page.locator("#monthly-price").innerText(),"1,360,000원");
  assert.equal(await page.locator("#monthly-saving").innerText(),"절감 60,000원");
  await page.evaluate(()=>window.__cardRef=document.querySelector("#quote-card"));
  await page.locator("#edit").click();
  await page.fill("#currentTrayPrice","7400");
  await page.locator("#calculate").click();
  assert.equal(await page.evaluate(()=>window.__cardRef === document.querySelector("#quote-card")),true,
    "numeric update retains quote card DOM identity");
  assert.equal(await page.locator("#tray-price").innerText(),"6,800원");
  assert.equal(await page.locator("#monthly-saving").innerText(),"절감 120,000원");
  await page.locator("#negotiate").click();
  assert.equal(new URL(page.url()).pathname,"/negotiate");
  assert.match(await page.locator("#hold-explanation").innerText(),/어떤 서류도/);
  assert.deepEqual(errors,[]);
  await page.close();
  const broken=await browser.newPage();
  await broken.route("**/data/offers.json", route=>route.fulfill({status:503,body:"Unavailable"}));
  await broken.goto(base+"/");
  await broken.locator("#app-loading").waitFor({state:"hidden"});
  assert.equal(await broken.locator("#app-error").isVisible(),true);
  await broken.unroute("**/data/offers.json");
  await broken.locator("#retry-catalog").click();
  await broken.locator("#app-loading").waitFor({state:"hidden"});
  assert.equal(await broken.locator("#screen-config").isVisible(),true);
  await broken.close();
  console.log("BROWSER_QA PASS: empty-price states, 4 viewport widths, fixture price, stable card, no-document-submission, retry");
} finally {
  await browser.close();
}
