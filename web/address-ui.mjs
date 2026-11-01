import {addressFields, addressLines, isVerifiedAddress, selectAddress} from './address-contract.mjs';
import {createAddressSearchService} from './address-service.mjs';

/* One child transaction. Searches never mutate the parent, and confirmation only
 * returns address fields to the still-current parent editing generation. */
export function createAddressEditor({getParent, onConfirm, onInvalid = () => {}, service = createAddressSearchService(), shell = window.OrderModalShell, document: doc = document} = {}) {
  if (typeof getParent !== 'function' || typeof onConfirm !== 'function') throw new TypeError('ADDRESS_PARENT_CONTRACT_REQUIRED');
  const $ = id => doc.getElementById(id);
  const dialog = $('address-editor-dialog');
  const query = $('address-query'), list = $('address-results');
  const detail = $('address-detail'), dropoff = $('address-dropoff');
  let session = null, draft = addressFields({}), options = [], active = -1;
  let timer = null, controller = null, searchGeneration = 0, editingGeneration = 0;
  let composing = false, listOpen = false, explicitClear = false, confirming = false, baseline = '';
  let page = 1, hasMore = false, requestQuery = '', status = 'IDLE';
  const counts = {opened: 0, canceled: 0, confirmed: 0, stale: 0, searches: 0, discarded: 0};
  const normalize = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const snapshot = () => JSON.stringify({query: query.value, address: addressFields({...draft, detail: detail.value, dropoff: dropoff.value})});
  const selectionMatchesQuery = () => normalize(query.value) === normalize(draft.road);
  const isDirty = () => !!session && snapshot() !== baseline;
  const current = () => {
    const parent = getParent?.();
    return !!session && !!parent && parent.siteId === session.siteId && parent.generation === session.generation;
  };
  const mutate = fn => dialog.open && !dialog.classList.contains('is-closing') ? shell.resize(dialog, fn) : fn();
  const icon = name => window.OrderIcons.svg(name);
  function replaceIcon(id, name) {
    const container = doc.createElement('span'); container.innerHTML = icon(name);
    const svg = container.firstElementChild; if (!svg) return;
    svg.id = id; $(id).replaceWith(svg);
  }
  function abortSearch() {
    clearTimeout(timer); timer = null; searchGeneration++;
    controller?.abort(); controller = null;
  }
  function setError(message = '', {focus = false} = {}) {
    mutate(() => {
      $('address-search-field').dataset.error = String(!!message);
      query.setAttribute('aria-invalid', String(!!message));
      const error = $('address-error'); error.textContent = message; error.hidden = !message;
      if (message) query.setAttribute('aria-describedby', 'address-error');
      else query.removeAttribute('aria-describedby');
    });
    if (focus) { query.focus({preventScroll: true}); onInvalid(query); }
  }
  function setList(open) {
    listOpen = !!open && options.length > 0;
    list.hidden = !listOpen;
    query.setAttribute('aria-expanded', String(listOpen));
    if (!listOpen) { active = -1; query.removeAttribute('aria-activedescendant'); }
  }
  function showStatus(text = '', {retry = false, loading = false} = {}) {
    const target = $('address-status'); target.textContent = text; target.hidden = !text;
    $('address-retry').hidden = !retry;
    query.setAttribute('aria-busy', String(loading));
    list.setAttribute('aria-busy', String(loading));
  }
  function renderSelection() {
    const hasAddress = !!draft.road;
    $('address-selected').hidden = !hasAddress;
    $('address-detail-fields').hidden = !hasAddress;
    $('address-clear').hidden = !hasAddress;
    $('address-selected-title').textContent = selectionMatchesQuery() ? '선택한 주소' : '기존 선택 주소';
    const target = $('address-selected-lines'); target.replaceChildren();
    for (const value of addressLines({...draft, detail: '', dropoff: ''})) {
      const line = doc.createElement('span'); line.textContent = value; target.append(line);
    }
    detail.value = draft.detail; dropoff.value = draft.dropoff;
  }
  function renderOptions() {
    list.replaceChildren(); active = -1;
    for (const [index, address] of options.entries()) {
      const row = doc.createElement('button');
      row.type = 'button'; row.tabIndex = -1;
      row.id = `address-option-${index}`; row.dataset.addressOption = String(index);
      row.className = 'ui-choice-row ui-choice-row--multiline';
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
      const image = doc.createElement('span'); image.className = 'ui-choice-row__icon'; image.innerHTML = icon('search');
      const copy = doc.createElement('span'); copy.className = 'ui-choice-row__copy';
      const road = doc.createElement('span'); road.className = 'ui-choice-row__title'; road.textContent = address.road; copy.append(road);
      if (address.jibun) { const jibun = doc.createElement('span'); jibun.className = 'ui-choice-row__meta'; jibun.textContent = address.jibun; copy.append(jibun); }
      const postal = doc.createElement('span'); postal.className = 'ui-choice-row__meta'; postal.textContent = address.postal; copy.append(postal);
      row.append(image, copy); list.append(row);
    }
    setList(options.length > 0);
    $('address-next-page').hidden = !hasMore;
  }
  function setActive(index) {
    if (!options.length) return;
    mutate(() => setList(true));
    active = (index + options.length) % options.length;
    for (const item of list.querySelectorAll('[role="option"]')) item.setAttribute('aria-selected', String(Number(item.dataset.addressOption) === active));
    const chosen = $('address-option-' + active);
    query.setAttribute('aria-activedescendant', chosen.id);
    chosen.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
  }
  function choose(index) {
    if (!current() || !options[index]) return false;
    const candidate = options[index];
    try { draft = selectAddress({...draft, detail: detail.value, dropoff: dropoff.value}, candidate); }
    catch { return false; }
    abortSearch(); explicitClear = false; status = 'SELECTED';
    mutate(() => {
      query.value = draft.road; setList(false); hasMore = false; $('address-next-page').hidden = true;
      showStatus(); renderSelection();
    });
    setError(); detail.focus({preventScroll: true});
    return true;
  }
  async function search({next = false} = {}) {
    if (!current() || composing) return;
    const text = normalize(query.value);
    if (text.length < 2) return;
    abortSearch();
    const generation = searchGeneration, owner = session, requestedPage = next ? page + 1 : 1;
    controller = new AbortController(); const request = controller;
    status = 'LOADING'; counts.searches++;
    mutate(() => { showStatus('검색 중…', {loading: true}); $('address-next-page').hidden = true; });
    let result;
    try { result = await service.search(text, {page: requestedPage, signal: request.signal}); }
    catch { result = {status: 'UNAVAILABLE', items: []}; }
    if (generation !== searchGeneration || session !== owner || !current() || request.signal.aborted) { counts.discarded++; return; }
    controller = null;
    if (result.status === 'ABORTED') return;
    page = requestedPage; requestQuery = text; hasMore = result.hasMore === true;
    if (result.status === 'OK') {
      const incoming = (result.items || []).filter(isVerifiedAddress);
      const combined = next ? [...options, ...incoming] : incoming;
      options = [...new Map(combined.map(item => [item.providerId + ':' + item.postal, item])).values()];
      status = options.length ? 'RESULTS' : 'EMPTY';
      mutate(() => { renderOptions(); showStatus(options.length ? `${options.length}개 주소` : '검색 결과가 없습니다.'); });
    } else if (result.status === 'EMPTY') {
      if (!next) options = []; hasMore = false; status = 'EMPTY';
      mutate(() => { renderOptions(); showStatus('검색 결과가 없습니다.'); });
    } else if (result.status === 'INVALID_REQUEST') {
      status = 'INVALID_REQUEST'; hasMore = false;
      mutate(() => { setList(false); showStatus('검색어는 한글 40자, 영문 80자 이내로 입력해 주세요.'); });
    } else {
      status = 'UNAVAILABLE'; hasMore = false;
      mutate(() => { setList(false); showStatus('주소를 검색할 수 없습니다. 다시 시도해 주세요.', {retry: true}); });
    }
  }
  function queueSearch() {
    if (!session) return;
    if (normalize(query.value)) explicitClear = false;
    abortSearch(); options = []; hasMore = false; page = 1; requestQuery = '';
    setError();
    mutate(() => { setList(false); $('address-next-page').hidden = true; showStatus(); renderSelection(); });
    status = 'EDITING';
    if (!composing && normalize(query.value).length >= 2) timer = setTimeout(() => { timer = null; search(); }, 300);
  }
  function close(reason = 'cancel', {immediate = false} = {}) {
    if (!session && !dialog.open) return false;
    if (reason !== 'confirmed') counts.canceled++;
    session = null; confirming = false; composing = false; editingGeneration++;
    abortSearch(); status = 'CLOSED';
    shell.close(dialog, {immediate});
    return true;
  }
  function confirm() {
    if (!session || confirming || !dialog.open) return false;
    if (!current()) { counts.stale++; close('stale'); return false; }
    draft = {...draft, detail: detail.value, dropoff: dropoff.value};
    if (!explicitClear && (!isVerifiedAddress(draft) || !selectionMatchesQuery())) {
      setError('검색 결과에서 주소를 선택해 주세요.', {focus: true}); return false;
    }
    confirming = true;
    const owner = session;
    try {
      const result = onConfirm?.({siteId: owner.siteId, generation: owner.generation, address: addressFields(draft)});
      if (result === false || result?.ok === false) { confirming = false; return false; }
      counts.confirmed++; close('confirmed'); return true;
    } catch {
      confirming = false;
      mutate(() => showStatus('주소를 반영할 수 없습니다. 다시 시도해 주세요.'));
      return false;
    }
  }
  function open(trigger) {
    const parent = getParent?.();
    if (!parent?.siteId || parent.generation == null) return false;
    if (session && dialog.open && current()) { query.focus({preventScroll: true}); return true; }
    abortSearch(); editingGeneration++; counts.opened++;
    session = {siteId: parent.siteId, generation: parent.generation, epoch: editingGeneration};
    draft = addressFields(parent.site); options = []; active = -1; page = 1; hasMore = false; requestQuery = '';
    explicitClear = false; confirming = false; composing = false; status = 'IDLE';
    query.value = draft.road; setList(false); list.replaceChildren(); showStatus(); renderSelection(); setError();
    baseline = snapshot();
    $('address-next-page').hidden = true;
    replaceIcon('address-search-icon', 'search'); $('address-close').innerHTML = icon('close');
    $('address-retry').innerHTML = icon('refresh') + '<span>다시 검색</span>';
    shell.open(dialog, {variant: 'editor', contentSize: 'dynamic', history: true, returnFocus: trigger, initialFocus: draft.road ? detail : query});
    $('address-scroll').scrollTop = 0; shell.sync();
    return true;
  }
  const requestClose = (reason = 'cancel') => shell.requestClose(dialog, reason);
  shell.bind(dialog, reason => close(reason), {
    editable: true, isDirty, beforeClose: reason => reason !== 'escape' || !composing,
    onExitIntent() {
      // A discard prompt can outlive the debounce or an in-flight response.
      // Pause transport while retaining the text and previous selected address.
      abortSearch();
      if (status === 'EDITING' || status === 'LOADING') {
        status = 'EDITING';
        mutate(() => showStatus('', {retry: normalize(query.value).length >= 2 && !selectionMatchesQuery()}));
      }
    }
  });
  query.addEventListener('input', queueSearch);
  query.addEventListener('compositionstart', () => { composing = true; abortSearch(); mutate(() => { setList(false); showStatus(); }); });
  query.addEventListener('compositionend', () => { composing = false; queueSearch(); });
  query.addEventListener('keydown', event => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); setActive(active + 1); }
    else if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); setActive(active < 0 ? options.length - 1 : active - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); if (listOpen && options.length) choose(active >= 0 ? active : 0); }
  });
  // Consume one Escape at the top child only. Prevent the native cancel event and
  // parent keyboard handlers from handling the same keystroke a second time.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || composing) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (listOpen) { abortSearch(); mutate(() => { setList(false); $('address-next-page').hidden = true; showStatus(); }); }
    else requestClose('escape');
  }, {capture: true});
  list.addEventListener('pointerdown', event => { if (event.target.closest('[data-address-option]')) event.preventDefault(); });
  list.addEventListener('click', event => { const item = event.target.closest('[data-address-option]'); if (item) choose(Number(item.dataset.addressOption)); });
  detail.addEventListener('input', () => { if (session) draft.detail = detail.value; });
  dropoff.addEventListener('input', () => { if (session) draft.dropoff = dropoff.value; });
  $('address-retry').addEventListener('click', () => search());
  $('address-next-page').addEventListener('click', () => { if (hasMore && normalize(query.value) === requestQuery) search({next: true}); });
  $('address-clear').addEventListener('click', () => {
    if (!current()) return;
    abortSearch(); draft = addressFields({}); explicitClear = true; options = []; hasMore = false; status = 'CLEARED';
    mutate(() => { query.value = ''; setList(false); $('address-next-page').hidden = true; renderSelection(); showStatus(); });
    setError(); query.focus({preventScroll: true});
  });
  $('address-confirm').addEventListener('click', confirm);
  $('address-cancel').addEventListener('click', () => requestClose('cancel'));
  $('address-close').addEventListener('click', () => requestClose('close'));
  return Object.freeze({open, cancel: requestClose, invalidate: () => close('parent-invalidated', {immediate: true}), get isOpen() {return !!session && dialog.open;}, inspect: () => ({status, isOpen: !!session && dialog.open, dirty: isDirty(), selectionMatchesQuery: selectionMatchesQuery(), listOpen, active, page, options: options.length, searchGeneration, editingGeneration, counts: {...counts}, transport: service.inspect?.()})});
}
