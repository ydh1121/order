import { quote } from "/src/quote.mjs";
import { loadApprovedCatalog, catalogOptions } from "/src/catalog.mjs";

const $ = id => document.getElementById(id);
const form = $("quote-form");
const inputs = Object.fromEntries(["housing","size","pack","region","monthlyTrays","dropTrays","currentTrayPrice"].map(k => [k, $(k)]));
const formatter = new Intl.NumberFormat("ko-KR");
const state = { offers: [], loading: true, failed: false, pricebookRevision: null, lastQuote: null };
const validPaths = new Set(["/", "/quote", "/apply", "/negotiate", "/suppliers", "/partners"]);
const title = {
  "/apply": "납품 신청 준비 중", "/negotiate": "가격 재검토 준비 중",
  "/suppliers": "농가 및 선별장 신청 준비 중", "/partners": "공동구매 파트너 신청 준비 중"
};

function queryState() {
  return Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.value]));
}
function fillSelect(el, choices, placeholder) {
  const prior = el.value;
  const fragment = document.createDocumentFragment();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = placeholder;
  fragment.append(blank);
  for (const value of choices) {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = el.id === "pack" ? String(value) + "구" :
      el.id === "housing" ? String(value) + "번" : String(value);
    fragment.append(opt);
  }
  el.replaceChildren(fragment);
  if (choices.map(String).includes(prior)) el.value = prior;
  el.disabled = choices.length === 0;
}
function refreshOptions() {
  const choices = catalogOptions(state.offers, queryState());
  fillSelect(inputs.housing, choices.housing, "사육환경 선택");
  // The remaining selectors are derived from the current upstream selection.
  const afterHousing = catalogOptions(state.offers, queryState());
  fillSelect(inputs.size, afterHousing.size, "규격 선택");
  const afterSize = catalogOptions(state.offers, queryState());
  fillSelect(inputs.pack, afterSize.pack, "포장 선택");
  const afterPack = catalogOptions(state.offers, queryState());
  fillSelect(inputs.region, afterPack.region, "납품 지역 선택");
}
function navigate(path, replace = false) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  showRoute();
  window.scrollTo(0, 0);
}
function hideAllScreens() {
  $("screen-config").hidden = true;
  $("screen-result").hidden = true;
  $("screen-hold").hidden = true;
}
function numberText(amount) {
  return formatter.format(amount) + "원";
}
function updateResult() {
  const card = $("quote-card"); // Stable element: never replaced.
  if (!card) throw new Error("견적 카드가 없습니다.");
  $("quote-prices").hidden = true;
  $("apply").setAttribute("aria-disabled", "true");
  $("apply").setAttribute("tabindex", "-1");
  if (state.failed) {
    $("quote-state").textContent = "가격 조회 중 오류가 발생했습니다. 조건 화면에서 다시 불러와 주세요.";
    state.lastQuote = { kind: "error" };
    return;
  }
  if (state.loading) {
    $("quote-state").textContent = "승인된 상품 정보를 확인 중입니다.";
    state.lastQuote = { kind: "loading" };
    return;
  }
  if (state.offers.length === 0) {
    $("quote-state").textContent = "가격 확인 중입니다. 현재 공개 승인을 받은 상품가격이 없습니다.";
    state.lastQuote = { kind: "unconfirmed" };
    return;
  }
  const result = quote(state.offers, queryState());
  state.lastQuote = result;
  if (result.kind !== "priced") {
    $("quote-state").textContent = result.kind === "invalid" ?
      "사육환경, 규격, 포장, 지역과 수량을 확인해 주세요." :
      "해당 지역과 수량으로 납품 가능한 승인 가격이 없습니다.";
    return;
  }
  $("quote-state").textContent = "승인된 공급가격 기준 조회 결과입니다.";
  // Only existing text nodes and visibility are updated, not the result card DOM.
  $("tray-price").textContent = numberText(result.trayPrice);
  $("monthly-price").textContent = numberText(result.monthlyPrice);
  $("monthly-saving").textContent = result.savingPerMonth == null ?
    "비교할 현재 구매가 없음" :
    (result.savingPerMonth >= 0 ? "절감 " : "추가 비용 ") + numberText(Math.abs(result.savingPerMonth));
  $("quote-prices").hidden = false;
  $("apply").removeAttribute("aria-disabled");
  $("apply").removeAttribute("tabindex");
}
function showRoute() {
  hideAllScreens();
  const path = location.pathname;
  if (state.loading) {
    $("app-loading").hidden = false;
    $("app-error").hidden = true;
    return;
  }
  $("app-loading").hidden = true;
  if (state.failed) {
    $("app-error").hidden = false;
    return;
  }
  $("app-error").hidden = true;
  if (path === "/") {
    $("screen-config").hidden = false;
    $("catalog-message").textContent = state.offers.length ?
      "상품은 승인된 공급정보 기준으로만 조회됩니다. 제출과 결제는 아직 지원하지 않습니다." :
      "현재 승인된 공개 가격표가 없습니다. 상품 및 납품조건을 확정해 등록한 뒤 견적이 제공됩니다.";
  } else if (path === "/quote") {
    $("screen-result").hidden = false;
    updateResult();
  } else {
    $("screen-hold").hidden = false;
    $("hold-title").textContent = title[path] || "페이지를 찾을 수 없습니다";
    $("hold-explanation").textContent = validPaths.has(path) ?
      "안전한 서류 수신과 신청 심사가 마련되기 전입니다. 현재 어떤 서류도 업로드하거나 접수하지 않습니다." :
      "요청한 화면이 없습니다. 견적 조건으로 돌아가 주세요.";
  }
}
async function refreshCatalog() {
  state.loading = true;
  state.failed = false;
  showRoute();
  try {
    const book = await loadApprovedCatalog();
    state.offers = book.offers;
    state.pricebookRevision = book.revision;
    refreshOptions();
  } catch {
    state.failed = true;
    state.offers = [];
  } finally {
    state.loading = false;
    showRoute();
  }
}
for (const id of ["housing","size","pack"]) {
  inputs[id].addEventListener("change", refreshOptions);
}
form.addEventListener("submit", event => {
  event.preventDefault();
  $("form-error").hidden = true;
  if (state.loading || state.failed) return;
  if (state.offers.length) {
    const q = queryState();
    const checks = [q.housing,q.size,q.pack,q.region].every(Boolean) &&
      Number.isSafeInteger(Number(q.monthlyTrays)) && Number(q.monthlyTrays) > 0 &&
      Number.isSafeInteger(Number(q.dropTrays)) && Number(q.dropTrays) > 0 &&
      Number(q.dropTrays) <= Number(q.monthlyTrays) &&
      (q.currentTrayPrice === "" ||
        (Number.isSafeInteger(Number(q.currentTrayPrice)) && Number(q.currentTrayPrice) >= 0));
    if (!checks) {
      $("form-error").textContent = "상품, 배송지역과 월·회당 수량을 올바르게 입력해 주세요.";
      $("form-error").hidden = false;
      return;
    }
  }
  navigate("/quote");
});
$("retry-catalog").addEventListener("click", refreshCatalog);
document.addEventListener("click", event => {
  const a = event.target.closest("a[href]");
  if (!a || a.origin !== location.origin) return;
  if (a.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    return;
  }
  if (!a.hash && !event.ctrlKey && !event.metaKey && event.button === 0) {
    event.preventDefault();
    navigate(a.pathname);
  }
});
window.addEventListener("popstate", showRoute);
refreshCatalog();
