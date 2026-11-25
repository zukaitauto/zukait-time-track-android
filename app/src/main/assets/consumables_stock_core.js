(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZukaitStockCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  // Pure transaction rules. Never persist this ledger in workshop_state.
  // The future server adapter must serialize writes with row locks and commit atomically.
  const EPS = 1e-9;
  const allowed = new Set(['Manager', 'Supervisor']);
  const validNumber = (v, label, positive = false) => {
    const n = Number(v);
    if (v === null || v === '' || !Number.isFinite(n) || (positive ? n <= 0 : n < 0)) throw Error('INVALID_' + label);
    return n;
  };
  const roundOMR = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = (m, b) => String(m) + '|' + String(b);
  const empty = () => ({ items: [], reservations: [], movements: [], requests: [] });
  const available = item => item ? Math.max(0, item.physical - item.reserved) : 0;
  const avgCost = item => item && item.physical > EPS ? item.value / item.physical : 0;
  const stockLine = item => ({
    materialId: item.materialId, brandId: item.brandId, unit: item.unit,
    physical: item.physical, reserved: item.reserved, available: available(item),
    averageCost: avgCost(item), stockValue: item.value, minimum: item.minimum || 0
  });
  const nextId = (s, prefix) => prefix + '-' + (s.movements.length + 1) + '-' + (s.reservations.length + 1);
  function transaction(source, action, input, actor) {
    if (!allowed.has(actor && actor.role)) throw Error('STOCK_FORBIDDEN');
    if (!actor.id) throw Error('ACTOR_REQUIRED');
    if (!input || typeof input !== 'object') throw Error('INPUT_REQUIRED');
    const requestId = String(input.requestId || '').trim();
    if (!requestId) throw Error('REQUEST_ID_REQUIRED');
    const fingerprint = JSON.stringify({ action, input, actorId: String(actor.id) });
    const state = clone(source || empty());
    for (const field of ['items','reservations','movements','requests'])
      if (!Array.isArray(state[field])) state[field] = [];
    const prior = state.requests.find(r => r.requestId === requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw Error('REQUEST_ID_CONFLICT');
      return { state, result: clone(prior.result), replay: true };
    }
    const item = state.items.find(x => x.materialId === input.materialId && x.brandId === input.brandId);
    let result;
    function log(type, itemRow, qty, detail) {
      const event = { id: nextId(state, 'mov'), type, materialId: itemRow.materialId,
        brandId: itemRow.brandId, unit: itemRow.unit, quantity: qty, actorId: String(actor.id),
        actorRole: actor.role, requestId, at: Date.now(), ...detail };
      state.movements.push(event);
      return event;
    }
    function lookup() {
      if (!item) throw Error('STOCK_ITEM_NOT_FOUND');
      return item;
    }
    function reservation() {
      const r = state.reservations.find(x => x.id === String(input.reservationId || ''));
      if (!r) throw Error('RESERVATION_NOT_FOUND');
      if (r.status !== 'reserved') throw Error('RESERVATION_CLOSED');
      return r;
    }
    if (action === 'OPENING') {
      if (actor.role !== 'Manager') throw Error('MANAGER_ONLY');
      const m = String(input.materialId || '').trim(), b = String(input.brandId || '').trim();
      const u = String(input.unit || '').trim();
      if (!m || !b || !['Liter','kg','Piece'].includes(u)) throw Error('INVALID_STOCK_IDENTITY');
      if (item) throw Error('OPENING_ALREADY_RECORDED');
      const q = validNumber(input.quantity, 'QUANTITY');
      const cost = validNumber(input.unitCost, 'COST');
      const minimum = validNumber(input.minimum === undefined ? 0 : input.minimum, 'MINIMUM');
      const row = { materialId: m, brandId: b, unit: u, physical: q, reserved: 0, value: q * cost, minimum };
      state.items.push(row);
      log('OPENING', row, q, { unitCost: cost, value: row.value });
      result = stockLine(row);
    } else if (action === 'PURCHASE') {
      const row = lookup();
      const q = validNumber(input.quantity, 'QUANTITY', true);
      const method = String(input.priceMethod || '');
      if (!['total','unit'].includes(method)) throw Error('PRICE_METHOD_REQUIRED');
      const p = validNumber(input.price, 'PRICE', true);
      const total = method === 'total' ? p : q * p;
      row.value += total;
      row.physical += q;
      log('PURCHASE', row, q, { unitCost: total/q, totalPurchase: total, averageAfter: avgCost(row) });
      result = stockLine(row);
    } else if (action === 'RESERVE') {
      const row = lookup();
      const q = validNumber(input.quantity, 'QUANTITY', true);
      const jc = String(input.jobCard || '').trim().toUpperCase();
      if (!jc) throw Error('JOB_CARD_REQUIRED');
      if (q > available(row) + EPS) throw Error('INSUFFICIENT_STOCK');
      const cost = avgCost(row);
      const r = { id: nextId(state, 'res'), materialId: row.materialId, brandId: row.brandId,
        jobCard: jc, status: 'reserved', lots: [{ quantity: q, unitCost: cost }],
        finalisedLots: [], returnedLots: [], reservedQty: q, actualQty: 0, finalCost: 0, returnCredit: 0, netCost: 0 };
      row.reserved += q;
      state.reservations.push(r);
      log('RESERVED', row, q, { reservationId: r.id, jobCard: jc, lockedCost: cost });
      result = clone(r);
    } else if (action === 'CHANGE') {
      const r = reservation();
      const row = state.items.find(x => x.materialId === r.materialId && x.brandId === r.brandId);
      const target = validNumber(input.quantity, 'QUANTITY');
      const delta = target - r.reservedQty;
      if (delta > available(row) + EPS) throw Error('INSUFFICIENT_STOCK');
      if (delta > EPS) r.lots.push({ quantity: delta, unitCost: avgCost(row) });
      if (delta < -EPS) {
        let toRelease = -delta;
        for (let i = r.lots.length - 1; i >= 0 && toRelease > EPS; i--) {
          const take = Math.min(r.lots[i].quantity, toRelease);
          r.lots[i].quantity -= take;
          toRelease -= take;
        }
        r.lots = r.lots.filter(l => l.quantity > EPS);
      }
      row.reserved += delta;
      r.reservedQty = target;
      if (target < EPS) r.status = 'cancelled';
      log('CHANGED', row, delta, { reservationId: r.id, jobCard: r.jobCard, newQuantity: target });
      result = clone(r);
    } else if (action === 'CANCEL') {
      const r = reservation();
      const row = state.items.find(x => x.materialId === r.materialId && x.brandId === r.brandId);
      row.reserved -= r.reservedQty;
      const old = r.reservedQty;
      r.reservedQty = 0; r.lots = []; r.status = 'cancelled';
      log('CANCELLED', row, -old, { reservationId: r.id, jobCard: r.jobCard });
      result = clone(r);
    } else if (action === 'FINALISE') {
      const r = reservation();
      const row = state.items.find(x => x.materialId === r.materialId && x.brandId === r.brandId);
      const q = validNumber(input.actualQuantity, 'QUANTITY');
      if (q > r.reservedQty + EPS) throw Error('ACTUAL_EXCEEDS_RESERVED');
      let left = q, cost = 0;
      for (const lot of r.lots) {
        const used = Math.min(left, lot.quantity);
        if (used > EPS) {
          r.finalisedLots.push({ quantity: used, unitCost: lot.unitCost });
          cost += used * lot.unitCost;
          left -= used;
        }
      }
      if (left > EPS) throw Error('LOT_SUM_MISMATCH');
      row.physical -= q;
      row.reserved -= r.reservedQty;
      row.value -= cost;
      if (row.physical < EPS) { row.physical = 0; row.value = 0; }
      if (row.value < -EPS) throw Error('NEGATIVE_STOCK_VALUE');
      r.status = 'finalised'; r.actualQty = q; r.finalCost = cost; r.netCost = cost;
      const released = r.reservedQty - q;
      r.reservedQty = 0; r.lots = [];
      log('FINALISED', row, -q, { reservationId: r.id, jobCard: r.jobCard,
        cost, releasedQuantity: released, averageAfter: avgCost(row) });
      result = clone(r);
    } else if (action === 'RETURN') {
      const r = state.reservations.find(x => x.id === String(input.reservationId || ''));
      if (!r || r.status !== 'finalised') throw Error('FINALISATION_REQUIRED');
      const row = state.items.find(x => x.materialId === r.materialId && x.brandId === r.brandId);
      const q = validNumber(input.quantity, 'QUANTITY', true);
      const returned = r.returnedLots.reduce((a,x) => a+x.quantity,0);
      if (q > r.actualQty - returned + EPS) throw Error('RETURN_EXCEEDS_ACTUAL');
      // Reverse the most recent issued cost layers, without repricing past purchases.
      let left = q, credit = 0;
      const already = r.finalisedLots.map((lot,i) => ({
        remaining: lot.quantity - r.returnedLots.filter(x=>x.lotIndex===i).reduce((a,x)=>a+x.quantity,0),
        cost: lot.unitCost, index: i
      }));
      for (let i = already.length-1; i >= 0 && left>EPS; i--) {
        const take = Math.min(left, already[i].remaining);
        if (take > EPS) {
          credit += take * already[i].cost;
          r.returnedLots.push({ lotIndex: already[i].index, quantity: take });
          left -= take;
        }
      }
      if (left>EPS) throw Error('RETURN_LOT_MISMATCH');
      row.physical += q; row.value += credit;
      r.returnCredit = (r.returnCredit || 0) + credit;
      r.netCost = r.finalCost - r.returnCredit;
      log('RETURNED', row, q, { reservationId:r.id, jobCard:r.jobCard, credit });
      result = { reservationId:r.id, quantity:q, credit, netCost:r.netCost, balance:stockLine(row) };
    } else if (action === 'ADJUST') {
      if (actor.role !== 'Manager') throw Error('MANAGER_ONLY');
      const row = lookup();
      const why = String(input.reason || '').trim();
      if (!why) throw Error('REASON_REQUIRED');
      const q = validNumber(input.countedQuantity, 'QUANTITY');
      if (q + EPS < row.reserved) throw Error('COUNT_BELOW_RESERVED');
      const diff = q - row.physical;
      row.value += diff * avgCost(row); row.physical = q;
      if (q < EPS) row.value = 0;
      log('ADJUSTED', row, diff, { reason:why, countedQuantity:q });
      result = stockLine(row);
    } else if (action === 'MINIMUM') {
      if (actor.role !== 'Manager') throw Error('MANAGER_ONLY');
      const row = lookup();
      row.minimum = validNumber(input.minimum, 'MINIMUM');
      log('MINIMUM_UPDATED', row, 0, { minimum:row.minimum });
      result = stockLine(row);
    } else {
      throw Error('UNKNOWN_STOCK_ACTION');
    }
    // Every operation creates one unique request receipt for retry protection.
    state.requests.push({ requestId, fingerprint, result: clone(result) });
    return { state, result, replay: false };
  }
  // Purchase invoice draft rules. Pure validation only; never mutate workshop state
  // or submit individual stock commands from the invoice form.
  function purchaseLine(input) {
    const materialId=String(input?.materialId||'').trim(),brandId=String(input?.brandId||'').trim(),unit=String(input?.unit||'');
    if(!materialId||!brandId||!['Liter','kg','Piece'].includes(unit))throw Error('INVALID_STOCK_IDENTITY');
    const decimal=(value,maxDigits,maxDecimals,label)=>{
      const raw=String(value??'').trim();
      if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('INVALID_'+label);
      const [whole,fraction='']=raw.split('.');
      if(whole.length>maxDigits||fraction.length>maxDecimals)throw Error('INVALID_'+label);
      const n=BigInt(whole)*10n**BigInt(maxDecimals)+BigInt(fraction.padEnd(maxDecimals,'0'));
      if(n<=0n)throw Error('INVALID_'+label);
      return n;
    };
    const q=decimal(input.quantity,7,4,'QUANTITY');
    if(unit==='Piece'&&q%10000n!==0n)throw Error('PIECE_WHOLE_REQUIRED');
    const method=String(input.priceMethod||'');
    if(!['unit','total'].includes(method))throw Error('PRICE_METHOD_REQUIRED');
    const p=decimal(input.price,9,3,'PRICE');
    const rounded=(n,d)=>(n+d/2n)/d;
    const mills=method==='total'?p:rounded(q*p,10000n);
    if(mills<=0n||mills>999999999999n)throw Error('INVALID_LINE_TOTAL');
    const rate=method==='unit'?p:rounded(mills*10000n,q);
    if(rate<=0n||rate>999999999999n)throw Error('INVALID_UNIT_PRICE');
    return {materialId,brandId,unit,quantity:Number(q)/10000,priceMethod:method,price:Number(p)/1000,
      totalMills:Number(mills),totalAmount:Number(mills)/1000,unitPrice:Number(rate)/1000};
  }
  function purchaseInvoiceDraft(input,actor,todayOman) {
    if(!allowed.has(actor?.role)||!String(actor?.id||'').trim())throw Error('STOCK_FORBIDDEN');
    const supplier=String(input?.supplier||'').trim(),invoiceNumber=String(input?.invoiceNumber||'').trim();
    if(!supplier||supplier.length>160||!invoiceNumber||invoiceNumber.length>100)throw Error('INVOICE_REFERENCE_REQUIRED');
    const invoiceDate=String(input?.invoiceDate||'');
    const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
    if(!validDay(invoiceDate)||!validDay(todayOman)||invoiceDate>todayOman)throw Error('INVALID_INVOICE_DATE');
    if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>50)throw Error('INVALID_INVOICE_LINES');
    const lines=input.lines.map(purchaseLine),seen=new Set();
    for(const l of lines){const pair=JSON.stringify([l.materialId,l.brandId]);if(seen.has(pair))throw Error('DUPLICATE_MATERIAL_BRAND');seen.add(pair)}
    const totalMills=lines.reduce((sum,l)=>sum+l.totalMills,0);
    if(!Number.isSafeInteger(totalMills)||totalMills>999999999999)throw Error('INVALID_INVOICE_TOTAL');
    const norm=v=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
    return {invoiceNumber,invoiceDate,supplier,invoiceKey:JSON.stringify([norm(supplier),norm(invoiceNumber)]),lines,totalMills,totalAmount:totalMills/1000};
  }
  function purchaseInvoiceList(rows,{query='',from='',to=''}={}) {
    const terms=String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows||[]).filter(r=>r&&(!from||r.invoiceDate>=from)&&(!to||r.invoiceDate<=to)&&
      terms.every(q=>[r.invoiceNumber,r.supplier,...(r.lines||[]).flatMap(l=>[l.material,l.brand,l.materialName,l.brandName])].join(' ').toLowerCase().includes(q)))
      .slice().sort((a,b)=>String(b.invoiceDate).localeCompare(String(a.invoiceDate))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)));
  }

  // Shared presentation only. Each host retains its own authenticated API and transaction state.
  const purchaseStyle='<style>.cp-entry{display:grid;gap:12px;max-width:780px;margin:auto;min-width:0}.cp-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.cp-entry h3{margin:0;color:#17324f}.cp-entry .cp-field{display:grid;gap:5px;min-width:0;font-size:13px;font-weight:700;color:#304c68}.cp-entry input,.cp-entry select{min-height:44px;max-width:100%;width:100%;box-sizing:border-box;border:1px solid #c4d6e7;border-radius:9px;background:#fff!important;color:#17324f!important;padding:8px;font-size:16px}.cp-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cp-entry .cp-panel{border:1px solid #d5e2ed;border-radius:12px;padding:12px;background:#f7faff}.cp-search-results{max-height:210px;overflow:auto}.cp-search-results button{display:flex!important;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px;border:1px solid #dbe6f2!important;border-radius:7px;background:#fff!important;color:#17324f!important;text-align:left!important;margin:4px 0;min-height:42px}.cp-entry .cp-action{padding:10px 12px;border:1px solid #b6cfe5;border-radius:8px;color:#185999!important;background:#e9f3ff!important;font-weight:800}.cp-entry .cp-add{background:#e4f4ea!important;color:#166534!important}.cp-entry .cp-total{background:#194b80;color:#fff;padding:13px;border-radius:10px;font-weight:800}.cp-entry .cp-line{display:grid;grid-template-columns:minmax(0,1.5fr) .6fr .8fr .8fr auto;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid #dce5ed;font-size:12px}.cp-lines{overflow-x:auto}.cp-entry .cp-line{min-width:430px}.cp-entry .cp-error{font-size:12px;color:#a13a1b}.cp-entry .cp-info{font-size:12px;color:#526b84}.cp-entry .cp-finish{min-height:44px;width:100%;background:#166534!important;color:#fff!important;border-radius:9px}.cp-entry .cp-finish:disabled{opacity:.55;cursor:not-allowed}@media(max-width:380px){.cp-two{grid-template-columns:1fr}}</style>';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const purchaseEntryMarkup=(d,date)=>'<div class="cp-entry"><div class="cp-head"><h3>Material Purchase</h3><button type="button" class="cp-action" onclick="consOpenPurchaseInvoices()">Invoice List</button></div>'+
 '<div class="cp-panel"><div class="cp-two"><label class="cp-field">Invoice Number<input id="cpInvoice" maxlength="100" autocomplete="off" value="'+esc(d.invoiceNumber)+'" oninput="consPurchaseHeader()"></label><label class="cp-field">Invoice Date<input id="cpDate" type="date" max="'+date+'" value="'+esc(d.invoiceDate)+'" oninput="consPurchaseHeader()"></label></div><label class="cp-field">Supplier<input id="cpSupplier" maxlength="160" value="'+esc(d.supplier)+'" oninput="consPurchaseHeader()"></label></div>'+
 '<div class="cp-panel"><label class="cp-field">Search Material + Brand<input id="cpSearch" type="search" autocomplete="off" placeholder="Example: Clear CAPCI" oninput="consPurchaseSearch()"></label><div id="cpResults" class="cp-search-results"></div><div id="cpSelected"></div><div id="cpLineEditor" hidden><label class="cp-field">Quantity<input id="cpQty" inputmode="decimal" type="number" min="0" step="0.0001" oninput="consPurchaseCalculate()"></label><label class="cp-field">Price entry<select id="cpMethod" onchange="consPurchaseChangeMethod()"><option value="unit">Price per Unit</option><option value="total">Total Purchase Amount</option></select></label><div class="cp-two"><label class="cp-field">Price / Unit (OMR)<input id="cpUnit" inputmode="decimal" type="number" min="0" step="0.001" oninput="consPurchaseCalculate()"></label><label class="cp-field">Total Amount (OMR)<input id="cpAmount" inputmode="decimal" type="number" min="0" step="0.001" oninput="consPurchaseCalculate()" readonly></label></div><button type="button" class="cp-action cp-add" onclick="consPurchaseAddLine()">＋ ADD ITEM</button><div id="cpError" class="cp-error" role="status"></div></div></div>'+
 '<h3>Invoice Items</h3><div id="cpLines" class="cp-lines"></div><div id="cpTotal" class="cp-total"></div><button type="button" id="cpFinish" class="cp-finish" onclick="consPurchaseSave()" disabled>FINISH &amp; SAVE</button><div id="cpSaveStatus" class="cp-info" role="status">Checking server availability…</div></div>';
  const purchaseHistoryMarkup=()=>'<div class="cp-entry"><div class="cp-head"><h3>Invoice List</h3><button type="button" class="cp-action" onclick="consOpenPurchaseEntry()">New Entry</button></div><label class="cp-field">Search invoice / supplier / material<input id="cpHistoryQuery" type="search" maxlength="160"></label><div class="cp-two"><label class="cp-field">From Date<input id="cpHistoryFrom" type="date"></label><label class="cp-field">To Date<input id="cpHistoryTo" type="date"></label></div><button type="button" class="cp-action" onclick="consPurchaseLoadHistory(0)">Search / Refresh</button><div id="cpHistory" class="cp-panel cp-info" role="status">Loading server invoice history…</div></div>';
  return { purchaseStyle, purchaseEntryMarkup, purchaseHistoryMarkup, empty, transaction, available, avgCost, stockLine, roundOMR, key, purchaseLine, purchaseInvoiceDraft, purchaseInvoiceList };
});
