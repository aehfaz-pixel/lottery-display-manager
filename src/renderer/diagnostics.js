// ── DIAGNOSTICS (Change 2a) ─────────────────────────────────────────────────
// Shared, same-origin diagnostic library loaded by every renderer page.
// Provides a correlated event timeline (Diag.newAction/Diag.log) and global
// error capture, backed by a small localStorage ring buffer so the
// Diagnostics tab can read events from any tab.
//
// Load this script FIRST in <head>, before any other script, so error
// capture is attached as early as possible.
(function(){
  const DIAG_KEY='__diagLog';
  const MAX_ENTRIES=150;
  const MAX_MSG_LEN=300; // keep entries small; this key gets swept into full backups

  // Identify which renderer page this is, from its own filename.
  const TAB = (function(){
    try {
      const p = location.pathname.split('/').pop() || 'unknown';
      return p.replace('.html','').replace('lottery-','') || 'unknown';
    } catch(e){ return 'unknown'; }
  })();

  function readLog(){
    try {
      const raw = localStorage.getItem(DIAG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }

  function writeLog(entries){
    try {
      if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
      localStorage.setItem(DIAG_KEY, JSON.stringify(entries));
    } catch(e){
      // localStorage full or blocked — drop silently, diagnostics must never
      // be able to break the app it's diagnosing.
    }
  }

  function truncate(v){
    try {
      let s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s && s.length > MAX_MSG_LEN) s = s.slice(0, MAX_MSG_LEN) + '…';
      return s;
    } catch(e){ return String(v); }
  }

  function pushEntry(entry){
    const entries = readLog();
    const last = entries[entries.length-1];
    // Collapse consecutive identical entries (e.g. a runaway recursive error)
    // into one growing counter instead of letting them flush older history
    // out of the capped ring buffer.
    if (last && !entry.diff && !last.diff && last.cat===entry.cat && last.tab===entry.tab && last.msg===entry.msg){
      last.count = (last.count||1)+1;
      last.t = entry.t;
      writeLog(entries);
      return last;
    }
    entries.push(entry);
    writeLog(entries);
  }

  function newId(){
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7);
  }

  // Diag.log(correlationId, category, message, data?)
  // category: 'scan' | 'route' | 'state' | 'ipc' | 'error' | 'info'
  function log(id, category, message, data){
    const entry = {
      t: Date.now(),
      id: id || 'none',
      tab: TAB,
      cat: category || 'info',
      msg: truncate(message),
    };
    if (data !== undefined) entry.data = truncate(data);
    pushEntry(entry);
    return entry;
  }

  function newAction(label, category){
    const id = newId();
    log(id, category || 'action', label);
    return id;
  }

  function clear(){
    try { localStorage.removeItem(DIAG_KEY); } catch(e){}
  }

  // ── 2b: STATE DIFFING ───────────────────────────────────────────────────
  // Best-effort deep diff between two JS values. Arrays of objects are
  // matched by an identifying field (id/slotNumber/gameNumber) when present,
  // falling back to index — this avoids noisy diffs when items are inserted
  // ahead of others in an array.
  function pickKey(obj){
    if (obj && typeof obj === 'object') {
      for (const k of ['slotNumber','id','gameNumber','lotteryId']) {
        if (obj[k] !== undefined) return String(k)+':'+String(obj[k]);
      }
    }
    return null;
  }

  function deepDiff(before, after, path){
    path = path || '';
    const changes = [];
    if (before === after) return changes;
    const bIsObj = before && typeof before === 'object';
    const aIsObj = after && typeof after === 'object';
    if (!bIsObj || !aIsObj) {
      changes.push({ path: path || '(root)', before, after });
      return changes;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
      // Detect the common "capped FIFO" pattern (push + shift once over a
      // size limit) for arrays of primitives — e.g. ticketHistory. Without
      // this, a single append+evict looks like every index changed.
      const bAllPrim = before.every(v=>v===null||typeof v!=='object');
      const aAllPrim = after.every(v=>v===null||typeof v!=='object');
      if (bAllPrim && aAllPrim && (before.length || after.length)) {
        const maxShift = Math.min(before.length, 5); // cap search, no need to check huge shifts
        for (let shift=0; shift<=maxShift; shift++){
          const bSuffix = before.slice(shift);
          const overlap = Math.min(bSuffix.length, after.length);
          const bTail = bSuffix.slice(0, overlap);
          const aHead = after.slice(0, overlap);
          if (bTail.length && bTail.every((v,i)=>v===aHead[i])) {
            const added = after.slice(overlap);
            if (shift>0 || added.length){
              const parts=[];
              if (shift>0) parts.push(`${shift} dropped from front`);
              if (added.length) parts.push(`${added.length} added: [${added.join(', ')}]`);
              changes.push({ path: path||'(array)', before: `(len ${before.length})`, after: `(len ${after.length}) — ${parts.join(', ')}` });
              return changes;
            }
          }
        }
      }
      // Try to match by identifying key; fall back to index.
      const bMap = new Map(), aMap = new Map();
      let useKeys = true;
      before.forEach((item,i)=>{ const k=pickKey(item); if(!k) useKeys=false; bMap.set(k||i,item); });
      after.forEach((item,i)=>{ const k=pickKey(item); if(!k) useKeys=false; aMap.set(k||i,item); });
      const keys = useKeys ? new Set([...bMap.keys(), ...aMap.keys()]) : new Set([...Array(Math.max(before.length,after.length)).keys()]);
      keys.forEach(k=>{
        const bv = useKeys ? bMap.get(k) : before[k];
        const av = useKeys ? aMap.get(k) : after[k];
        if (bv === undefined && av !== undefined) changes.push({ path: `${path}[${k}]`, before: undefined, after: av, added:true });
        else if (av === undefined && bv !== undefined) changes.push({ path: `${path}[${k}]`, before: bv, after: undefined, removed:true });
        else changes.push(...deepDiff(bv, av, `${path}[${k}]`));
      });
      return changes;
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach(k=>{
      changes.push(...deepDiff(before[k], after[k], path ? `${path}.${k}` : k));
    });
    return changes;
  }

  // Diag.logDiff(id, category, label, beforeVal, afterVal)
  // Logs a structured diff (list of {path,before,after}) instead of a plain string.
  function logDiff(id, category, label, beforeVal, afterVal){
    let changes;
    try { changes = deepDiff(beforeVal, afterVal); }
    catch(e){ changes = [{ path:'(diff failed)', before:String(e.message), after:null }]; }
    const entry = {
      t: Date.now(), id: id || 'none', tab: TAB, cat: category || 'state',
      msg: truncate(label), diff: changes.slice(0,20).map(c=>({
        path: c.path,
        before: truncate(c.before === undefined ? '(none)' : c.before),
        after: truncate(c.after === undefined ? '(none)' : c.after),
      })),
    };
    pushEntry(entry);
    return entry;
  }

  // Convenience: snapshot a localStorage key's parsed value (for before/after use).
  function snapshotKey(key){
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch(e){ return null; }
  }

  // ── 2c: LAYOUT / VISUAL INSPECTOR ───────────────────────────────────────
  // Click-to-inspect overlay (toggle with Ctrl+Shift+L in any window) plus a
  // passive overflow watcher that flags elements whose content no longer
  // fits their box — the exact class of bug behind historical slot-sizing
  // issues, surfaced without manual DevTools digging.
  let inspectMode = false;
  let inspectOverlayEl = null, inspectPanelEl = null;
  const overflowState = new WeakMap(); // element -> bool, last known overflow status

  function fmtPx(n){ return Math.round(n*10)/10 + 'px'; }

  function buildInspectorUI(){
    if (inspectOverlayEl) return;
    inspectOverlayEl = document.createElement('div');
    inspectOverlayEl.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #f5c500;background:rgba(245,197,0,.12);z-index:2147483646;display:none;box-sizing:border-box;transition:none;';
    inspectPanelEl = document.createElement('div');
    inspectPanelEl.style.cssText = 'position:fixed;bottom:10px;right:10px;max-width:360px;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:10px 12px;font:11px ui-monospace,Menlo,Consolas,monospace;z-index:2147483647;display:none;white-space:pre-wrap;box-shadow:0 4px 20px rgba(0,0,0,.5);';
    document.documentElement.appendChild(inspectOverlayEl);
    document.documentElement.appendChild(inspectPanelEl);
  }

  function describeElement(el){
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const overflowX = el.scrollWidth - el.clientWidth;
    const overflowY = el.scrollHeight - el.clientHeight;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className && typeof el.className === 'string' ? el.className : null,
      box: { width: fmtPx(r.width), height: fmtPx(r.height) },
      content: { scrollWidth: el.scrollWidth+'px', scrollHeight: el.scrollHeight+'px' },
      overflow: { x: overflowX>0?fmtPx(overflowX):'none', y: overflowY>0?fmtPx(overflowY):'none' },
      style: { padding: cs.padding, display: cs.display, overflow: cs.overflow, fontSize: cs.fontSize },
    };
  }

  function panelText(info){
    return `INSPECT: <${info.tag}>${info.id?'#'+info.id:''}\n`+
      (info.classes?`class: ${info.classes}\n`:'')+
      `box: ${info.box.width} × ${info.box.height}\n`+
      `content: ${info.content.scrollWidth} × ${info.content.scrollHeight}\n`+
      `overflow: x=${info.overflow.x} y=${info.overflow.y}\n`+
      `padding: ${info.style.padding} | display: ${info.style.display} | overflow-css: ${info.style.overflow} | font: ${info.style.fontSize}`;
  }

  function onInspectMove(e){
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el===inspectOverlayEl || el===inspectPanelEl) return;
    const r = el.getBoundingClientRect();
    inspectOverlayEl.style.display='block';
    inspectOverlayEl.style.left=r.left+'px';
    inspectOverlayEl.style.top=r.top+'px';
    inspectOverlayEl.style.width=r.width+'px';
    inspectOverlayEl.style.height=r.height+'px';
  }

  function onInspectClick(e){
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el===inspectOverlayEl || el===inspectPanelEl) return;
    // Never trap clicks on UI marked as always-clickable (shell tab bar,
    // Diagnostics toolbar, the Inspect toggle itself) — otherwise turning
    // inspect mode on can lock you out of turning it back off or navigating
    // away at all.
    if (el.closest('[data-diag-ui]')) return;
    e.preventDefault(); e.stopPropagation();
    const info = describeElement(el);
    inspectPanelEl.style.display='block';
    inspectPanelEl.textContent = panelText(info);
    log('none','layout','inspected <'+info.tag+'>'+(info.id?'#'+info.id:''), info);
  }

  function applyInspectState(on){
    inspectMode = on;
    buildInspectorUI();
    if (inspectMode){
      document.addEventListener('mousemove', onInspectMove, true);
      document.addEventListener('click', onInspectClick, true);
      log('none','layout','inspect mode ON ('+TAB+') — click an element to read its layout');
    } else {
      document.removeEventListener('mousemove', onInspectMove, true);
      document.removeEventListener('click', onInspectClick, true);
      if (inspectOverlayEl) inspectOverlayEl.style.display='none';
      if (inspectPanelEl) inspectPanelEl.style.display='none';
      log('none','layout','inspect mode OFF ('+TAB+')');
    }
  }

  const INSPECT_KEY = '__diagInspectMode';

  // Global toggle: works from any window/iframe (shell tabs are iframes,
  // Display is a separate but same-origin BrowserWindow — both share
  // localStorage, so a flag here reaches every one of them via the
  // 'storage' event, no per-window wiring needed). This is the supported
  // way to turn inspect mode on — a button in Diagnostics, not a shortcut,
  // since Ctrl+Shift+L collides with some third-party software (e.g. AMD
  // utilities) at the OS level and never reaches the browser at all.
  function setInspectMode(on){
    try { localStorage.setItem(INSPECT_KEY, on?'1':'0'); } catch(e){}
    applyInspectState(on);
  }
  function toggleInspect(){
    setInspectMode(!inspectMode);
  }
  window.addEventListener('storage', function(e){
    if (e.key===INSPECT_KEY) applyInspectState(e.newValue==='1');
  });
  // Sync initial state on load, in case another window already turned it on.
  try { if (localStorage.getItem(INSPECT_KEY)==='1') applyInspectState(true); } catch(e){}

  // Kept as an optional secondary trigger — harmless on machines without a
  // conflicting shortcut, but no longer the only way to turn this on.
  document.addEventListener('keydown', function(e){
    if (e.ctrlKey && e.shiftKey && (e.key==='L'||e.key==='l')){
      e.preventDefault();
      toggleInspect();
    }
    // Escape is a guaranteed panic-off, independent of click routing — a
    // safety net in case any UI ever ends up unreachable while inspect
    // mode is trapping clicks.
    if (e.key==='Escape' && inspectMode){
      e.preventDefault();
      setInspectMode(false);
    }
  });

  // Passive overflow watcher — flags elements matching `selector` the moment
  // their content stops fitting, without any manual clicking. Logs once per
  // transition (not-overflowing → overflowing), and once on recovery too,
  // to avoid spamming the log on every resize tick while still capturing
  // both edges of the problem.
  function watchOverflow(selector){
    if (!('ResizeObserver' in window)) return;
    const ro = new ResizeObserver(entries=>{
      for (const entry of entries){
        const el = entry.target;
        const isOver = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        const was = overflowState.get(el) || false;
        if (isOver && !was){
          const info = describeElement(el);
          log('none','layout','⚠ OVERFLOW detected on '+selector+(el.id?'#'+el.id:'')+' — content larger than box', info);
        } else if (!isOver && was){
          log('none','layout','✓ recovered on '+selector+(el.id?'#'+el.id:'')+' — content fits its box again');
        }
        overflowState.set(el, isOver);
      }
    });
    function attachAll(){
      document.querySelectorAll(selector).forEach(el=>{ if(!overflowState.has(el)){ overflowState.set(el,false); ro.observe(el); } });
    }
    attachAll();
    // Re-scan for newly-added elements (slots get re-rendered often).
    const mo = new MutationObserver(()=>attachAll());
    mo.observe(document.body || document.documentElement, { childList:true, subtree:true });
  }

  window.Diag = {
    log, newAction, newId, readLog, clear, TAB,
    // 2b
    deepDiff, logDiff, snapshotKey,
    // 2c
    toggleInspect, setInspectMode, watchOverflow,
  };

  // ── GLOBAL ERROR CAPTURE ───────────────────────────────────────────────
  window.addEventListener('error', function(e){
    log('none', 'error', (e.message || 'Unknown error'),
      { file: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
    // Mirror to disk log too, if the Electron bridge is available.
    try {
      if (window.electronAPI && window.electronAPI.debugLog) {
        window.electronAPI.debugLog(`[diag][${TAB}] ERROR: ${e.message} (${e.filename}:${e.lineno})`);
      }
    } catch(err){}
  });

  window.addEventListener('unhandledrejection', function(e){
    const reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    log('none', 'error', 'Unhandled promise rejection: ' + reason,
      { stack: e.reason && e.reason.stack });
    try {
      if (window.electronAPI && window.electronAPI.debugLog) {
        window.electronAPI.debugLog(`[diag][${TAB}] UNHANDLED REJECTION: ${reason}`);
      }
    } catch(err){}
  });
})();
