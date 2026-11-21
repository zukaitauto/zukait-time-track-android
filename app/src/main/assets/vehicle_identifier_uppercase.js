/* ZUKAIT — Vehicle identity entry, shared by all dashboard hosts.
 * Changes only editable VIN/chassis and vehicle registration/plate inputs.
 * Existing records and registration matching rules are not rewritten.
 */
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc || root.zukaitVehicleIdentifierUppercase) return;

  // Normalize only clearly identified vehicle fields. Never uppercase a generic
  // search, customer, make/model, email, or free-text input.
  const clean = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const isVin = value => /(?:vin|chassis)(?:no|number)?$/.test(value);
  const isPlate = value => /(?:registration|reg|plate)(?:no|number)?$/.test(value) ||
    /(?:vehicle|car)(?:number|no)$/.test(value);
  const labelKind = value => {
    const text = String(value || '').trim();
    if (/^(?:enter\s+)?(?:vin|chassis)(?:\s*\/\s*(?:vin|chassis))?(?:\s*(?:no\.?|number))?(?:\s*[*:\/]|$)/i.test(text)) return 'vin';
    if (/^(?:enter\s+)?(?:registration|reg(?:istration)?\s*(?:no\.?|number)?|(?:vehicle|license|licence)\s+plate(?:\s*(?:no\.?|number))?|plate(?:\s*(?:no\.?|number))?|vehicle\s+number)(?:\s*[*:\/]|$)/i.test(text)) return 'registration';
    return '';
  };

  function kind(element) {
    if (!element || !/^(INPUT|TEXTAREA)$/.test(element.tagName || '')) return '';
    if (element.hasAttribute('data-vehicle-uppercase-exempt')) return '';
    if (element.tagName === 'INPUT' &&
        !['text','search','tel'].includes(String(element.type || 'text').toLowerCase())) return '';
    for (const attr of ['name','id','data-field','data-input','data-vehicle-field']) {
      const key = clean(element.getAttribute(attr));
      if (!key) continue;
      if (isVin(key)) return 'vin';
      if (isPlate(key)) return 'registration';
    }
    const label = element.closest?.('label');
    const linked = element.id && doc.querySelector?.('label[for="' + String(element.id).replace(/["\\]/g, '\\$&') + '"]');
    for (const text of [element.getAttribute('aria-label'),element.getAttribute('placeholder'),
      label?.textContent,linked?.textContent]) {
      const hit = labelKind(text);
      if (hit) return hit;
    }
    return '';
  }

  function uppercase(element) {
    const type = kind(element);
    if (!type || element.disabled || element.readOnly) return false;
    element.style.textTransform = 'uppercase';
    element.setAttribute('autocapitalize','characters');
    const before = String(element.value || '');
    const after = before.toUpperCase();
    if (after === before) return false;
    let start = null, end = null, direction = 'none';
    try {
      start = element.selectionStart;
      end = element.selectionEnd;
      direction = element.selectionDirection || 'none';
    } catch (_) { /* not a selectable control */ }
    element.value = after;
    if (start != null && end != null) {
      try { element.setSelectionRange(start,end,direction); } catch (_) { /* optional */ }
    }
    return true;
  }

  function within(target) {
    if (!target) return;
    if (/^(INPUT|TEXTAREA)$/.test(target.tagName || '')) uppercase(target);
    target.querySelectorAll?.('input,textarea').forEach(uppercase);
  }
  const onEntry = event => {
    if (event.isComposing || event.target?.isComposing) return;
    uppercase(event.target);
  };
  doc.addEventListener('input',onEntry,true);
  doc.addEventListener('change',onEntry,true);
  doc.addEventListener('compositionend',onEntry,true);
  doc.addEventListener('focusin',onEntry,true);
  doc.addEventListener('submit',event=>within(event.target),true);
  doc.addEventListener('click',event=>{
    const el=event.target?.closest?.('button,input[type="submit"],input[type="button"],[role="button"]');
    if (!el) return;
    within(el.closest('form') || el.closest('dialog') || el.closest('.modal-box') || doc);
  },true);

  // Inputs are created dynamically in Manager, Reception, and Mechanical dialogs.
  // Keep a direct DOM property assignment readable and normalize it before save.
  function install() {
    within(doc);
    if (!root.MutationObserver || !doc.documentElement) return;
    const observer = new root.MutationObserver(records=>{
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (added.nodeType === 1) within(added);
        }
      }
    });
    observer.observe(doc.documentElement,{childList:true,subtree:true});
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  root.zukaitVehicleIdentifierUppercase={kind,uppercase,within};
})(window);
