(function () {
  'use strict';

  var K = { bank: 'ky.bank.v1', progress: 'ky.progress.v1', settings: 'ky.settings.v1', vocab: 'ky.vocab.v1', dictCache: 'ky.dictcache.v1', memory: 'ky.memory.v1', cloud: 'ky.cloud.v1' };
  var DEFAULT_SETTINGS = { theme: 'auto', fontSize: 18, dailyGoal: 2, lookupOnline: true };
  var FEEDBACK_EMAIL = 'qdgzhtao@163.com';
  var BANK_REQUEST_EMAIL = FEEDBACK_EMAIL;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtTime(sec) { sec = Math.max(0, sec | 0); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); }
  function fmtDateTime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return String(iso); } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }
  function download(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  var store = {
    read: function (k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    write: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('本地存储空间不足，请先导出备份'); return false; } }
  };

  var state = {
    bank: store.read(K.bank, []),
    progress: store.read(K.progress, {}),
    settings: Object.assign({}, DEFAULT_SETTINGS, store.read(K.settings, {})),
    vocab: store.read(K.vocab, []),
    dictCache: store.read(K.dictCache, {}),
    memory: store.read(K.memory, null),
    cloud: Object.assign({ url: '', anonKey: '', syncCode: '', auto: false, includeBank: false, lastSyncAt: '', lastError: '' }, store.read(K.cloud, {})),
    filter: { exam: 'all', year: 'all', type: 'all', status: 'all', q: '' },
    practice: null,
    timerId: null,
    word: null,
    vocabQuery: ''
  };
  if (!Array.isArray(state.bank)) state.bank = [];
  if (!state.progress || typeof state.progress !== 'object') state.progress = {};
  if (!Array.isArray(state.vocab)) state.vocab = [];
  if (!state.dictCache || typeof state.dictCache !== 'object') state.dictCache = {};
  var realCache = null;
  var realLoading = false;

  /* ---------- data helpers ---------- */
  function realPapers() { return realCache || []; }
  function planEntries() { return window.KY_PLAN || []; }
  function demos() { return window.KY_DEMO || []; }
  function paperById(id) {
    var d = demos().filter(function (p) { return p.id === id; })[0];
    if (d) return d;
    var b = state.bank.filter(function (p) { return p.id === id; })[0];
    if (b) return b;
    return realPapers().filter(function (p) { return p.id === id; })[0] || null;
  }
  function recordOf(id) { return state.progress[id] || null; }
  function isDone(id) { var r = recordOf(id); return !!(r && r.submitted); }
  function mergedPapers() {
    var imported = {}, real = {};
    state.bank.forEach(function (p) { imported[p.id] = p; });
    realPapers().forEach(function (p) { real[p.id] = p; });
    var rows = [];
    demos().forEach(function (p) { rows.push(Object.assign({}, p, { _has: true, _demo: true })); });
    planEntries().forEach(function (e) {
      var p = imported[e.id] || real[e.id];
      if (p) rows.push(Object.assign({}, e, p, { _has: true, _real: !imported[e.id] }));
      else rows.push(Object.assign({}, e, { _has: false, title: e.exam + ' ' + e.year + ' ' + e.label }));
    });
    var known = {};
    planEntries().forEach(function (e) { known[e.id] = 1; });
    state.bank.forEach(function (p) { if (!known[p.id]) rows.push(Object.assign({}, p, { _has: true })); });
    return rows;
  }
  function persistProgress() { store.write(K.progress, state.progress); scheduleCloudSync(); }
  function persistBank() { store.write(K.bank, state.bank); scheduleCloudSync(); }
  function persistSettings() { store.write(K.settings, state.settings); scheduleCloudSync(); }
  function persistVocab() { store.write(K.vocab, state.vocab); scheduleCloudSync(); }
  function persistDictCache() { store.write(K.dictCache, state.dictCache); }
  function persistMemory() { store.write(K.memory, state.memory); }

  /* ---------- local memory ---------- */
  function newMemory() {
    var now = new Date().toISOString();
    return {
      id: 'mem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      createdAt: now, firstVisit: now, lastVisit: now, visits: 0,
      lastRoute: '#/dashboard', lastPaperId: '', lastPaperTitle: '', lastActivityAt: null
    };
  }
  function initMemory() {
    var now = new Date().toISOString();
    if (!state.memory || typeof state.memory !== 'object') state.memory = newMemory();
    state.memory = Object.assign(newMemory(), state.memory);
    if (!state.memory.createdAt) state.memory.createdAt = now;
    if (!state.memory.firstVisit) state.memory.firstVisit = state.memory.createdAt;
    state.memory.visits = (Number(state.memory.visits) || 0) + 1;
    state.memory.lastVisit = now;
    if (!state.memory.lastRoute) state.memory.lastRoute = location.hash || '#/dashboard';
    persistMemory();
  }
  function memoryShortId() {
    var id = String((state.memory && state.memory.id) || '');
    return id ? (id.length > 14 ? '…' + id.slice(-10) : id) : '未生成';
  }
  function rememberPaper(paper) {
    if (!state.memory || !paper) return;
    state.memory.lastPaperId = paper.id;
    state.memory.lastPaperTitle = paper.title || paper.label || paper.id;
    state.memory.lastActivityAt = new Date().toISOString();
    persistMemory();
    scheduleCloudSync();
  }
  function touchMemory(route, param) {
    if (!state.memory) return;
    state.memory.lastRoute = location.hash || '#/dashboard';
    if (route === 'practice' && param) {
      var p = paperById(param);
      state.memory.lastPaperId = param;
      state.memory.lastPaperTitle = p ? (p.title || p.label || p.id) : (state.memory.lastPaperTitle || param);
    }
    state.memory.lastActivityAt = new Date().toISOString();
    persistMemory();
  }
  function memoryLastPaper() {
    var m = state.memory || {};
    if (m.lastPaperId) {
      var p = paperById(m.lastPaperId);
      return p || { id: m.lastPaperId, title: m.lastPaperTitle || m.lastPaperId, questions: [] };
    }
    var keys = Object.keys(state.progress).filter(function (id) { return paperById(id); });
    keys.sort(function (a, b) { return String(state.progress[b].updatedAt || '').localeCompare(String(state.progress[a].updatedAt || '')); });
    return keys.length ? paperById(keys[0]) : null;
  }
  function memoryStatusText() {
    var m = state.memory || {};
    var p = memoryLastPaper();
    var rec = p ? recordOf(p.id) : null;
    var status;
    if (!p) status = '已生成本地记忆，等待第一次练习';
    else if (rec && rec.submitted) status = '上次已提交 ' + (rec.score != null ? rec.score : '') + '/' + ((p.questions || []).length || rec.total || '?');
    else if (rec) status = '上次未完成 · ' + (p.title || p.label || p.id);
    else status = '上次打开 · ' + (p.title || p.label || p.id);
    return '第 ' + (m.visits || 1) + ' 次进站 · ' + status;
  }
  function updateSideProgress() {
    var doneEl = $('#side-done'), totalEl = $('#side-total');
    if (!doneEl && !totalEl) return;
    var a = aggregate();
    var total = mergedPapers().filter(function (p) { return p._has; }).length;
    if (doneEl) doneEl.textContent = a.done;
    if (totalEl) totalEl.textContent = total;
  }

  /* ---------- optional cloud sync (Supabase) ---------- */
  var applyingCloud = false;
  var cloudSyncing = false;
  var cloudTimer = null;

  function persistCloud() { store.write(K.cloud, state.cloud); }
  function cloudBase() { return String(state.cloud.url || '').trim().replace(/\/+$/, ''); }
  function cloudConfigured() { return !!(cloudBase() && String(state.cloud.anonKey || '').trim() && String(state.cloud.syncCode || '').trim()); }
  function cloudStatusText() {
    if (!cloudConfigured()) return '未配置 · 可选';
    if (state.cloud.lastError) return '同步失败 · ' + state.cloud.lastError;
    if (state.cloud.lastSyncAt) return '已连接 · 上次 ' + fmtDateTime(state.cloud.lastSyncAt);
    return '已配置 · 尚未同步';
  }
  function cloudLastText() {
    if (!cloudConfigured()) return '填写 URL、Anon Key 和同步码后可同步';
    if (state.cloud.lastError) return '上次失败：' + state.cloud.lastError;
    if (state.cloud.lastSyncAt) return '上次同步：' + fmtDateTime(state.cloud.lastSyncAt);
    return '尚未同步';
  }
  function updateCloudUI(text) {
    var status = $('#cloud-status'); if (status) status.textContent = text || cloudStatusText();
    var last = $('#cloud-last'); if (last) last.textContent = cloudLastText();
  }
  function cloudRpc(name, body) {
    var base = cloudBase();
    if (!base) return Promise.reject(new Error('未填写 Supabase URL'));
    if (!state.cloud.anonKey) return Promise.reject(new Error('未填写 Anon Key'));
    return fetch(base + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': String(state.cloud.anonKey).trim(),
        'Authorization': 'Bearer ' + String(state.cloud.anonKey).trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error('HTTP ' + r.status + (t ? ' · ' + t.slice(0, 180) : ''));
        return t ? JSON.parse(t) : null;
      });
    });
  }
  function cloudPull() {
    return cloudRpc('kaoyan_sync_get', { p_code: String(state.cloud.syncCode || '').trim() });
  }
  function cloudPush(snapshot) {
    return cloudRpc('kaoyan_sync_put', { p_code: String(state.cloud.syncCode || '').trim(), p_payload: snapshot });
  }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ':' + stableStringify(value[k]); }).join(',') + '}';
  }
  function bankScore(p) { return String(p.passage || '').length + ((p.questions || []).length * 200); }
  function localSnapshot() {
    var times = [];
    Object.keys(state.progress).forEach(function (id) { var r = state.progress[id]; if (r && r.updatedAt) times.push(r.updatedAt); });
    if (state.memory) {
      if (state.memory.lastActivityAt) times.push(state.memory.lastActivityAt);
      if (state.memory.lastVisit) times.push(state.memory.lastVisit);
    }
    times.sort();
    var snap = {
      version: 1,
      app: 'kaoyan-english-workbench',
      updatedAt: times[times.length - 1] || new Date().toISOString(),
      progress: state.progress,
      settings: state.settings,
      vocab: state.vocab,
      memory: state.memory
    };
    if (state.cloud.includeBank) snap.bank = state.bank;
    return snap;
  }
  function mergeSnapshots(local, remote) {
    var out = {
      version: 1,
      app: 'kaoyan-english-workbench',
      updatedAt: String(local.updatedAt || '') > String(remote.updatedAt || '') ? local.updatedAt : (remote.updatedAt || local.updatedAt || new Date().toISOString())
    };
    var lp = local.progress || {}, rp = remote.progress || {}, progress = {};
    Object.keys(lp).forEach(function (id) { progress[id] = lp[id]; });
    Object.keys(rp).forEach(function (id) {
      var a = progress[id], b = rp[id];
      if (!a) { progress[id] = b; return; }
      var at = String(a.updatedAt || ''), bt = String(b.updatedAt || '');
      var newer = bt > at ? b : a;
      var older = newer === b ? a : b;
      var answers = Object.assign({}, older.answers || {}, newer.answers || {});
      var rec = Object.assign({}, newer);
      rec.answers = answers;
      rec.seconds = Math.max(Number(a.seconds) || 0, Number(b.seconds) || 0);
      rec.submitted = !!(a.submitted || b.submitted);
      rec.updatedAt = bt > at ? b.updatedAt : a.updatedAt;
      var paper = paperById(id);
      if (paper && rec.submitted) {
        rec.score = (paper.questions || []).filter(function (q) { return answers[q.id] === q.answer; }).length;
        rec.total = (paper.questions || []).length;
      }
      progress[id] = rec;
    });
    out.progress = progress;

    var vmap = {};
    (local.vocab || []).forEach(function (v) { if (v && v.word) vmap[v.word] = v; });
    (remote.vocab || []).forEach(function (v) {
      if (!v || !v.word) return;
      var a = vmap[v.word];
      if (!a) { vmap[v.word] = v; return; }
      var at = String(a.updatedAt || a.createdAt || ''), bt = String(v.updatedAt || v.createdAt || '');
      if (bt > at || (bt === at && (Number(v.count) || 0) > (Number(a.count) || 0))) vmap[v.word] = v;
    });
    out.vocab = Object.keys(vmap).map(function (k) { return vmap[k]; });

    var lm = local.memory || {}, rm = remote.memory || {};
    var lv = String(lm.lastVisit || lm.lastActivityAt || ''), rv = String(rm.lastVisit || rm.lastActivityAt || '');
    var mem = Object.assign({}, rv > lv ? rm : lm);
    mem.visits = Math.max(Number(lm.visits) || 0, Number(rm.visits) || 0) || 1;
    out.memory = mem;

    out.settings = Object.assign({}, DEFAULT_SETTINGS, remote.settings || {}, local.settings || {});
    if (state.cloud.includeBank) {
      var bmap = {};
      (local.bank || []).forEach(function (p) { if (p && p.id) bmap[p.id] = p; });
      (remote.bank || []).forEach(function (p) {
        if (!p || !p.id) return;
        var a = bmap[p.id];
        if (!a || bankScore(p) > bankScore(a)) bmap[p.id] = p;
      });
      out.bank = Object.keys(bmap).map(function (k) { return bmap[k]; });
    } else if (Array.isArray(remote.bank)) {
      out.bank = remote.bank;
    }
    return out;
  }
  function applyCloudSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('云端数据格式不正确');
    applyingCloud = true;
    if (Array.isArray(snapshot.bank) && state.cloud.includeBank) state.bank = snapshot.bank;
    if (snapshot.progress && typeof snapshot.progress === 'object') state.progress = snapshot.progress;
    if (Array.isArray(snapshot.vocab)) state.vocab = snapshot.vocab;
    if (snapshot.settings && typeof snapshot.settings === 'object') state.settings = Object.assign({}, DEFAULT_SETTINGS, snapshot.settings);
    if (snapshot.memory && typeof snapshot.memory === 'object') state.memory = Object.assign(newMemory(), snapshot.memory);
    persistBank(); persistProgress(); persistVocab(); persistSettings(); persistMemory();
    applyingCloud = false;
    state.practice = null;
    applySettings();
    onHash(true);
    if ($('#guide-dialog') && $('#guide-dialog').open) renderGuideMemory();
  }
  function syncNow(mode, silent) {
    if (cloudSyncing) return Promise.resolve(false);
    if (!cloudConfigured()) {
      if (!silent) toast('请先填写 Supabase URL、Anon Key 和同步码');
      return Promise.resolve(false);
    }
    cloudSyncing = true;
    state.cloud.lastError = '';
    persistCloud();
    updateCloudUI('同步中…');
    var local = localSnapshot();
    var chain;
    if (mode === 'upload') {
      chain = cloudPush(local).then(function () { return true; });
    } else {
      chain = cloudPull().then(function (remote) {
        var payload = remote && remote.payload ? remote.payload : null;
        if (!payload) {
          if (mode === 'download') throw new Error('云端还没有数据');
          return cloudPush(local).then(function () { return true; });
        }
        if (mode === 'download') { applyCloudSnapshot(payload); return true; }
        var merged = mergeSnapshots(local, payload);
        var mergedText = stableStringify(merged);
        var localText = stableStringify(local);
        var remoteText = stableStringify(payload);
        if (mergedText !== remoteText) applyCloudSnapshot(merged);
        if (mergedText !== localText || mergedText !== remoteText) {
          return cloudPush(merged).then(function () { return true; });
        }
        return true;
      });
    }
    return chain.then(function () {
      cloudSyncing = false;
      state.cloud.lastSyncAt = new Date().toISOString();
      state.cloud.lastError = '';
      persistCloud();
      updateCloudUI();
      if (!silent) toast('云同步完成');
      return true;
    }).catch(function (err) {
      cloudSyncing = false;
      state.cloud.lastError = err && err.message ? err.message : '同步失败';
      persistCloud();
      updateCloudUI();
      if (!silent) toast('云同步失败：' + state.cloud.lastError);
      return false;
    });
  }
  function scheduleCloudSync() {
    if (applyingCloud || !cloudConfigured() || !state.cloud.auto) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(function () { syncNow('auto', true); }, 2000);
  }
  function generateSyncCode() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var out = 'yp-', i, arr;
    if (window.crypto && window.crypto.getRandomValues) {
      arr = new Uint8Array(24);
      window.crypto.getRandomValues(arr);
      for (i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    } else {
      for (i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }
  function cloudCopyCode() {
    readCloudForm();
    var code = String(state.cloud.syncCode || '').trim();
    if (!code) { toast('还没有同步码'); return; }
    function ok() { toast('同步码已复制'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(ok).catch(function () { window.prompt('复制同步码', code); });
    else window.prompt('复制同步码', code);
  }
  function readCloudForm() {
    var u = $('#cloud-url'), k = $('#cloud-key'), c = $('#cloud-code');
    if (u) state.cloud.url = u.value.trim();
    if (k) state.cloud.anonKey = k.value.trim();
    if (c) state.cloud.syncCode = c.value.trim();
    persistCloud();
  }

  function calcStreak() {
    var days = {};
    Object.keys(state.progress).forEach(function (id) {
      var r = state.progress[id];
      if (r && r.submitted && r.updatedAt) days[r.updatedAt.slice(0, 10)] = 1;
    });
    var d = new Date(), n = 0;
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function weeklyStats() {
    var out = [], i, d, key, count;
    for (i = 6; i >= 0; i--) {
      d = new Date(); d.setDate(d.getDate() - i); key = dayKey(d); count = 0;
      Object.keys(state.progress).forEach(function (id) {
        var r = state.progress[id];
        if (r && r.submitted && r.updatedAt && r.updatedAt.slice(0, 10) === key) count++;
      });
      out.push({ key: key, label: (d.getMonth() + 1) + '/' + d.getDate(), count: count });
    }
    return out;
  }
  function aggregate() {
    var total = 0, right = 0, done = 0, answered = 0;
    Object.keys(state.progress).forEach(function (id) {
      var r = state.progress[id], p = paperById(id);
      if (!r || !r.submitted || !p) return;
      done++;
      (p.questions || []).forEach(function (q) {
        total++;
        if (r.answers && r.answers[q.id]) answered++;
        if (r.answers && r.answers[q.id] === q.answer) right++;
      });
    });
    return { done: done, total: total, right: right, answered: answered, acc: total ? Math.round(right / total * 100) : 0 };
  }
  function wrongItems() {
    var items = [];
    Object.keys(state.progress).forEach(function (id) {
      var r = state.progress[id], p = paperById(id);
      if (!r || !r.submitted || !p) return;
      (p.questions || []).forEach(function (q) {
        var a = r.answers && r.answers[q.id];
        if (a && a !== q.answer) items.push({ paper: p, q: q, user: a });
      });
    });
    return items;
  }

  /* ---------- theme ---------- */
  function applySettings() {
    var t = state.settings.theme;
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--reading-size', (state.settings.fontSize || 18) + 'px');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#111417' : '#2f6f5e');
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () { if (state.settings.theme === 'auto') applySettings(); });
  }

  function bankRequestUrl() {
    var subject = '申请考研英语工作台完整题库';
    var body = [
      '你好，我想申请考研英语工作台完整题库。',
      '',
      '称呼：',
      '使用目的：',
      'GitHub 用户名（可选）：',
      '',
      '我确认题库仅用于个人备考，不公开传播或商用。'
    ].join('\n');
    return 'mailto:' + BANK_REQUEST_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
  function requestBank() {
    var href = bankRequestUrl();
    var a = document.createElement('a');
    a.href = href; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    toast('已打开邮件申请；如未打开，请复制邮箱 ' + BANK_REQUEST_EMAIL);
  }
  function copyBankEmail() {
    function done() { toast('申请邮箱已复制：' + BANK_REQUEST_EMAIL); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = BANK_REQUEST_EMAIL; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
      } catch (e) { window.prompt('复制申请邮箱', BANK_REQUEST_EMAIL); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(BANK_REQUEST_EMAIL).then(done).catch(fallback);
    } else fallback();
  }

  /* ---------- router ---------- */
  var ROUTES = {
    dashboard: { title: '工作台', sub: '把真题拆成今天能完成的一小步' },
    library: { title: '题库', sub: '示例可直接练 · 完整题库邮件申请后导入' },
    practice: { title: '练习', sub: '先做题，再对答案' },
    wrong: { title: '错题本', sub: '只复习真正做错的题' },
    vocab: { title: '生词本', sub: '长按查词，随手收藏' },
    stats: { title: '统计', sub: '用数据决定下一步' },
    settings: { title: '设置', sub: '本地优先 · 随时导出' },
    notfound: { title: '未找到', sub: '' }
  };
  function go(route, param) {
    location.hash = '#/' + route + (param ? '/' + encodeURIComponent(param) : '');
  }
  function onHash(skipScroll) {
    if (state.word) closeWordCard();
    var m = location.hash.match(/^#\/([a-z-]+)(?:\/(.+))?$/);
    var route = m ? m[1] : 'dashboard';
    var param = m && m[2] ? decodeURIComponent(m[2]) : null;
    if (!ROUTES[route]) route = 'notfound';
    if (route !== 'practice') stopTimer();
    $$('.view').forEach(function (v) { v.hidden = true; });
    var view = $('#view-' + route); if (view) view.hidden = false;
    $('#page-title').textContent = ROUTES[route].title;
    $('#page-sub').textContent = ROUTES[route].sub;
    $$('#side-nav .nav-item, .bottomnav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.route === route || (route === 'practice' && b.dataset.route === 'library'));
    });
    if (route === 'dashboard') renderDashboard();
    if (route === 'library') renderLibrary();
    if (route === 'practice') renderPractice(param);
    if (route === 'wrong') renderWrong();
    if (route === 'vocab') renderVocab();
    if (route === 'stats') renderStats();
    if (route === 'settings') renderSettings();
    touchMemory(route, param);
    updateSideProgress();
    if (skipScroll !== true) window.scrollTo(0, 0);
  }

  /* ---------- dashboard ---------- */
  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了，做一篇就休息。';
    if (h < 11) return '早上好，先做一篇阅读。';
    if (h < 14) return '中午好，碎片时间也能练一题。';
    if (h < 18) return '下午好，今天的目标还差一点。';
    return '晚上好，收个尾就很棒。';
  }
  function pickContinue() {
    var mid = state.memory && state.memory.lastPaperId;
    var mp = mid ? paperById(mid) : null;
    var mr = mid ? recordOf(mid) : null;
    if (mp && (mr || (state.memory && state.memory.lastRoute === '#/practice/' + mid))) return { paper: mp, rec: mr };
    var keys = Object.keys(state.progress).filter(function (id) { return paperById(id); });
    keys.sort(function (a, b) { return String(state.progress[b].updatedAt || '').localeCompare(String(state.progress[a].updatedAt || '')); });
    var unfinished = keys.filter(function (id) { return state.progress[id] && !state.progress[id].submitted; });
    if (unfinished.length) return { paper: paperById(unfinished[0]), rec: state.progress[unfinished[0]] };
    if (mp) return { paper: mp, rec: mr };
    if (keys.length) return { paper: paperById(keys[0]), rec: state.progress[keys[0]] };
    var d = demos()[0]; if (d) return { paper: d, rec: null };
    var p = planEntries()[0]; return { paper: p, rec: null };
  }
  function renderDashboard() {
    var now = new Date();
    var week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    $('#dash-date').textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 星期' + week;
    $('#dash-greeting').textContent = greeting();

    var today = 0;
    Object.keys(state.progress).forEach(function (id) { var r = state.progress[id]; if (r && r.submitted && r.updatedAt && r.updatedAt.slice(0, 10) === dayKey()) today++; });
    var goal = Math.max(1, state.settings.dailyGoal || 2);
    $('#goal-num').textContent = today;
    $('#goal-label').textContent = '/ ' + goal + ' 篇';
    $('#goal-ring').style.setProperty('--p', Math.min(100, Math.round(today / goal * 100)));

    var a = aggregate(), w = wrongItems().length;
    $('#dash-stats').innerHTML =
      '<div class="stat"><b>' + a.done + '</b><span>已完成篇目</span></div>' +
      '<div class="stat"><b>' + a.acc + '%</b><span>累计正确率</span></div>' +
      '<div class="stat"><b>' + calcStreak() + '</b><span>连续学习天数</span></div>' +
      '<div class="stat"><b>' + w + '</b><span>待复习错题</span></div>';

    var c = pickContinue();
    if (c.paper) {
      var done = c.rec && c.rec.submitted;
      $('#dash-continue-card').innerHTML =
        '<div class="row" style="border-bottom:0;padding-top:4px">' +
          '<div class="year-badge"><b>' + (c.paper.year || '示') + '</b><span>' + esc(c.paper.exam || '') + '</span></div>' +
          '<div class="row-main"><div class="row-title">' + esc(c.paper.title || c.paper.label || c.paper.id) + '</div>' +
          '<div class="row-sub">' + (done ? '已完成 · 可重做或看解析' : '未完成 · 继续作答') + '</div></div>' +
          '<div class="row-actions"><button class="btn primary sm" data-open="' + esc(c.paper.id) + '">' + (done ? '复习' : '继续') + '</button></div>' +
        '</div>';
      $('#continue-chip').textContent = done ? '已完成' : '推荐';
      $('#continue-chip').className = 'chip ' + (done ? 'done' : 'todo');
    } else {
      $('#dash-continue-card').innerHTML = '<p class="muted">题库还是空的，先导入一篇真题。</p><button class="btn primary" data-import="1">导入题库</button>';
      $('#continue-chip').textContent = '待导入';
    }
    renderDashboardMemory();
    updateSideProgress();

    var years = {};
    planEntries().forEach(function (e) { if (e.exam === '英语一') { years[e.year] = years[e.year] || { total: 0, done: 0 }; years[e.year].total++; if (isDone(e.id)) years[e.year].done++; } });
    var ys = Object.keys(years).sort();
    $('#dash-years').innerHTML = ys.map(function (y) {
      var o = years[y], pct = o.total ? Math.round(o.done / o.total * 100) : 0;
      return '<div class="year-bar"><b>' + y + '</b><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><span>' + o.done + '/' + o.total + '</span></div>';
    }).join('');

    var recs = Object.keys(state.progress).filter(function (id) { return paperById(id); }).sort(function (a, b) {
      return String(state.progress[b].updatedAt || '').localeCompare(String(state.progress[a].updatedAt || ''));
    }).slice(0, 5);
    if (!recs.length) {
      $('#dash-recent').innerHTML = '<div class="empty-state" style="padding:26px 10px"><p class="muted">还没有练习记录。先从内置示例或导入的真题开始。</p></div>';
    } else {
      $('#dash-recent').innerHTML = recs.map(function (id) {
        var r = state.progress[id], p = paperById(id);
        return '<div class="row"><div class="year-badge"><b>' + (p.year || '示') + '</b><span>' + esc(p.exam || '') + '</span></div>' +
          '<div class="row-main"><div class="row-title">' + esc(p.title || p.label) + '</div>' +
          '<div class="row-sub">' + (r.submitted ? '已提交 ' + (r.score != null ? r.score : '') + '/' + (p.questions || []).length : '未提交') + ' · 用时 ' + fmtTime(r.seconds || 0) + '</div></div>' +
          '<div class="row-actions"><button class="btn ghost sm" data-open="' + esc(id) + '">打开</button></div></div>';
      }).join('');
    }
  }

  function renderDashboardMemory() {
    var host = $('#dash-memory'); if (!host) return;
    var m = state.memory || {};
    var p = memoryLastPaper();
    var rec = p ? recordOf(p.id) : null;
    var meta = '第 ' + (m.visits || 1) + ' 次进站 · 记忆编号 ' + memoryShortId();
    if (!p) {
      host.innerHTML = '<p class="muted small" style="margin:0">已生成本地记忆。第一次练习后，这里会显示上次篇目和进度。</p>' +
        '<p class="muted small" style="margin:6px 0 0">' + esc(meta) + '</p>';
      return;
    }
    var qn = (p.questions || []).length || (rec && rec.total) || 0;
    var status = !rec ? '尚未开始' : rec.submitted ? '已提交 ' + (rec.score != null ? rec.score : '') + (qn ? '/' + qn : '') + ' · 用时 ' + fmtTime(rec.seconds || 0) : '进行中 · 已答 ' + Object.keys(rec.answers || {}).length + ' 题';
    host.innerHTML = '<div class="memory-row"><div class="memory-copy"><strong>' + esc(p.title || p.label || p.id) + '</strong>' +
      '<span>' + esc(status) + ' · ' + esc(meta) + '</span></div>' +
      '<button class="btn ghost sm" data-open="' + esc(p.id) + '">' + (rec && rec.submitted ? '复习' : '继续') + '</button></div>';
  }

  /* ---------- guide / feedback ---------- */
  function openDialog(sel) {
    var d = $(sel); if (!d) return;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else d.setAttribute('open', '');
  }
  function closeDialog(sel) {
    var d = $(sel); if (!d) return;
    if (d.open && typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }
  function renderGuideMemory() {
    var host = $('#guide-memory'); if (!host) return;
    var m = state.memory || {};
    var p = memoryLastPaper();
    var rec = p ? recordOf(p.id) : null;
    var meta = '第 ' + (m.visits || 1) + ' 次进站 · 记忆编号 ' + memoryShortId();
    var html = '<div class="memory-meta">' + esc(meta) + '</div>';
    if (p) {
      var qn = (p.questions || []).length || (rec && rec.total) || 0;
      var status = !rec ? '未开始' : rec.submitted ? '已提交 ' + (rec.score != null ? rec.score : '') + (qn ? '/' + qn : '') + ' · 用时 ' + fmtTime(rec.seconds || 0) : '未完成 · 已答 ' + Object.keys(rec.answers || {}).length + ' 题';
      html += '<div class="memory-last"><div><span class="eyebrow">上次进度</span><strong>' + esc(p.title || p.label || p.id) + '</strong><p>' + esc(status) + '</p></div>' +
        '<button class="btn primary sm" id="guide-continue" type="button">继续上次</button></div>';
    } else {
      html += '<p class="muted small" style="margin:0">还没有练习记录。已为你在本机创建记忆，第一次作答后会自动记住进度。</p>';
    }
    host.innerHTML = html;
    var gc = $('#guide-continue');
    if (gc) gc.addEventListener('click', function () {
      closeDialog('#guide-dialog');
      go('practice', p.id);
    });
  }
  function openGuide() {
    guideShown = true;
    closeDialog('#feedback-dialog');
    renderGuideMemory();
    openDialog('#guide-dialog');
  }
  var guideShown = false;
  function showGuideOnce() {
    if (guideShown) return;
    guideShown = true;
    openGuide();
  }
  function openFeedback() {
    closeDialog('#guide-dialog');
    openDialog('#feedback-dialog');
    setTimeout(function () { var t = $('#feedback-text'); if (t) t.focus(); }, 80);
  }
  function feedbackContext() {
    var a = aggregate();
    var p = memoryLastPaper();
    var rec = p ? recordOf(p.id) : null;
    return [
      '--- 系统信息 ---',
      '页面：' + ((document.getElementById('page-title') || {}).textContent || location.hash || '工作台'),
      '本地题库：' + state.bank.length + ' 篇已导入',
      '已完成：' + a.done + ' 篇 · 正确率 ' + a.acc + '%',
      '上次练习：' + (p ? (p.title || p.label || p.id) : '暂无') + (rec && rec.submitted ? '（已提交 ' + (rec.score != null ? rec.score : '') + '/' + ((p.questions || []).length || (rec && rec.total) || '?') + '）' : ''),
      '记忆编号：' + ((state.memory && state.memory.id) || '未生成'),
      '时间：' + new Date().toLocaleString('zh-CN'),
      '设备：' + navigator.userAgent
    ].join('\n');
  }
  function sendFeedback() {
    var text = ($('#feedback-text') && $('#feedback-text').value || '').trim();
    if (!text) { toast('请先填写反馈内容'); return; }
    var type = ($('#feedback-type') && $('#feedback-type').value) || '其他';
    var name = ($('#feedback-name') && $('#feedback-name').value || '').trim();
    var withContext = $('#feedback-context') ? $('#feedback-context').checked : true;
    var subject = '考研英语工作台反馈 · ' + type + (name ? ' · ' + name : '');
    var lines = ['反馈类型：' + type];
    if (name) lines.push('称呼：' + name);
    lines.push('', '反馈内容：', text);
    if (withContext) lines.push('', feedbackContext());
    var href = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
    closeDialog('#feedback-dialog');
    var a = document.createElement('a');
    a.href = href; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    toast('已打开邮件客户端；如未打开，请复制邮箱 ' + FEEDBACK_EMAIL);
  }
  function copyEmail() {
    function ok() { toast('邮箱已复制：' + FEEDBACK_EMAIL); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = FEEDBACK_EMAIL; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok();
      } catch (e) { window.prompt('复制邮箱', FEEDBACK_EMAIL); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(FEEDBACK_EMAIL).then(ok).catch(fallback);
    } else fallback();
  }

  /* ---------- library ---------- */
  function renderLibrary() {
    var f = state.filter;
    var yearsSel = $('#f-year');
    if (yearsSel.options.length <= 1) {
      var ys = {};
      mergedPapers().forEach(function (p) { if (p.year) ys[p.year] = 1; });
      Object.keys(ys).sort().reverse().forEach(function (y) {
        var o = document.createElement('option'); o.value = y; o.textContent = y; yearsSel.appendChild(o);
      });
      yearsSel.value = f.year;
    }
    var rows = mergedPapers().filter(function (p) {
      if (f.exam !== 'all' && p.exam !== f.exam) return false;
      if (f.year !== 'all' && String(p.year) !== String(f.year)) return false;
      if (f.type !== 'all' && p.type !== f.type) return false;
      if (f.status === 'done' && !isDone(p.id)) return false;
      if (f.status === 'todo' && (isDone(p.id) || !p._has)) return false;
      if (f.status === 'empty' && p._has) return false;
      if (f.q) {
        var hay = [p.year, p.title, p.label, p.exam, p.type].join(' ').toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    $('#lib-hint').textContent = '共 ' + rows.length + ' 篇 · 本地已导入 ' + state.bank.length +
      ' 篇 · 完整题库不随公开仓库分发，请邮件申请后手动导入。';
    var rb = $('#btn-real');
    if (rb) { rb.textContent = '申请完整题库'; rb.disabled = false; }
    if (!rows.length) {
      $('#lib-list').innerHTML = '<div class="empty-state"><h2>没有匹配的篇目</h2><p class="muted">换个筛选条件，或导入一篇真题。</p></div>';
      return;
    }
    $('#lib-list').innerHTML = rows.map(function (p) {
      var done = isDone(p.id), rec = recordOf(p.id);
      var status = !p._has ? '<span class="chip empty">待导入</span>' : done ? '<span class="chip done">已完成 ' + (rec.score != null ? rec.score : '') + '/' + (p.questions || []).length + '</span>' : rec && Object.keys(rec.answers || {}).length ? '<span class="chip todo">进行中</span>' : '<span class="chip">未开始</span>';
      var sub = [p.exam, p.type === 'listening' ? '听力' : '阅读', p.year ? p.year + ' 年' : '原创示例', (p.questions || []).length + ' 题'].join(' · ');
      return '<div class="row" data-open="' + esc(p.id) + '">' +
        '<div class="year-badge"><b>' + (p.year || '示') + '</b><span>' + esc(p.exam || '') + '</span></div>' +
        '<div class="row-main"><div class="row-title">' + esc(p.title || p.label) + '</div><div class="row-sub">' + esc(sub) + '</div></div>' +
        '<div class="row-actions">' + status + '<button class="btn ghost sm" data-open="' + esc(p.id) + '">' + (p._has ? (done ? '复习' : '开始') : '导入本篇') + '</button></div>' +
      '</div>';
    }).join('');
  }

  /* ---------- practice ---------- */
  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
  function startTimer() {
    stopTimer();
    if (!state.practice || state.practice.submitted) return;
    state.timerId = setInterval(function () {
      if (!state.practice) return;
      state.practice.seconds++;
      var el = $('#practice-timer'); if (el) el.textContent = fmtTime(state.practice.seconds);
      if (state.practice.seconds % 20 === 0) saveDraft();
    }, 1000);
  }
  function saveDraft() {
    var p = state.practice; if (!p) return;
    var paper = paperById(p.paperId); if (!paper) return;
    var old = state.progress[p.paperId] || {};
    state.progress[p.paperId] = Object.assign({}, old, {
      answers: p.answers, submitted: p.submitted, seconds: p.seconds, updatedAt: new Date().toISOString()
    });
    persistProgress();
    rememberPaper(paper);
  }
  function renderPractice(id) {
    var paper = id ? paperById(id) : null;
    var root = $('#practice-root');
    if (!paper) {
      var entry = planEntries().filter(function (e) { return e.id === id; })[0];
      root.innerHTML = '<div class="card empty-state"><h2>这篇还没有内容</h2><p class="muted">' +
        (entry ? esc(entry.exam + ' ' + entry.year + ' ' + entry.label) + ' 目前只有计划占位。' : '没有找到这篇。') +
        '</p><div class="hero-actions" style="justify-content:center"><button class="btn primary" data-template="' + esc(id || '') + '">按模板导入本篇</button><button class="btn ghost" data-route="library">返回题库</button></div></div>';
      return;
    }
    var rec = recordOf(paper.id) || {};
    if (!state.practice || state.practice.paperId !== paper.id) {
      state.practice = {
        paperId: paper.id,
        answers: Object.assign({}, rec.answers || {}),
        submitted: !!rec.submitted,
        seconds: rec.seconds || 0
      };
    }
    var p = state.practice;
    var qs = paper.questions || [];
    var score = qs.filter(function (q) { return p.answers[q.id] === q.answer; }).length;

    var qHtml = qs.map(function (q, idx) {
      var user = p.answers[q.id];
      var opts = (q.options || []).map(function (o) {
        var cls = 'opt';
        if (user === o.label) cls += ' sel';
        if (p.submitted && o.label === q.answer) cls += ' correct';
        if (p.submitted && user === o.label && user !== q.answer) cls += ' wrong';
        return '<button type="button" class="' + cls + '" data-opt="' + esc(q.id) + '" data-lab="' + esc(o.label) + '">' +
          '<span class="lab">' + esc(o.label) + '</span><span>' + esc(o.text) + '</span></button>';
      }).join('');
      var ex = '';
      if (p.submitted) {
        ex = '<div class="explain"><b>答案 ' + esc(q.answer) + '</b>' + (user ? ' · 你选 ' + esc(user) : ' · 未作答') + '<br>' + esc(q.explanation || '暂无解析') + '</div>';
      }
      return '<div class="q" data-q="' + esc(q.id) + '"><p class="q-stem"><span class="q-num">' + (idx + 1) + '</span>' + esc(q.stem) + '</p><div class="opts">' + opts + '</div>' + ex + '</div>';
    }).join('');

    var paras = String(paper.passage || '').split(/\n\s*\n/).map(function (t) { return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>'; }).join('');
    var audio = paper.audio ? '<audio controls preload="none" src="' + esc(paper.audio) + '" style="width:100%;margin-bottom:14px"></audio>' : '';

    root.innerHTML =
      '<div class="practice-head"><div class="practice-title">' +
        '<div><button class="btn ghost sm" data-route="library">← 题库</button></div>' +
        '<h2>' + esc(paper.title || paper.label || paper.id) + '</h2>' +
        '<p>' + esc([paper.exam && paper.exam !== '示例' ? paper.exam : '', paper.year ? paper.year + ' 年' : '原创示例', paper.type === 'listening' ? '听力' : '阅读', qs.length + ' 题'].filter(Boolean).join(' · ')) + '</p>' +
      '</div><div class="practice-meta">' +
        '<span class="timer" id="practice-timer">' + fmtTime(p.seconds) + '</span>' +
        '<span class="chip ' + (p.submitted ? 'done' : 'todo') + '">' + (p.submitted ? '已提交' : '作答中') + '</span>' +
        '<button class="btn ghost sm" id="btn-redo">重做</button>' +
      '</div></div>' +
      '<div class="mobile-tabs" id="mtabs"><button class="on" data-mtab="passage">文章</button><button data-mtab="questions">题目</button></div>' +
      '<div class="practice-grid">' +
        '<article class="card passage-card" id="pane-passage"><div class="card-head"><h3>Passage</h3><span class="muted small">' + esc(paper.subtitle || '') + '</span></div>' +
          '<div class="lookup-tip">长按（手机）或双击（电脑）单词查词 · 可加入生词本</div>' + audio + '<div class="passage">' + (paras || '<p class="muted">（暂无原文，请在导入 JSON 中填写 passage）</p>') + '</div></article>' +
        '<div id="pane-questions" class="mobile-hide"><div class="qcard">' +
          (p.submitted ? '<div class="result ' + (score === qs.length ? '' : 'bad') + '"><b>' + score + ' / ' + qs.length + '</b><span>正确率 ' + (qs.length ? Math.round(score / qs.length * 100) : 0) + '% · 用时 ' + fmtTime(p.seconds) + '</span></div>' : '') +
          '<div class="lookup-tip">长按（手机）或双击（电脑）题干、选项中的单词查词 · 可加入生词本</div>' +
          '<div id="question-list">' + qHtml + '</div>' +
          '<div class="practice-foot"><button class="btn ghost" data-route="library">返回题库</button>' +
          (p.submitted ? '<button class="btn primary" id="btn-review-wrong" type="button">只看错题</button>' : '<button class="btn primary" id="btn-submit" type="button">提交答案</button>') +
          '</div>' +
        '</div></div>' +
      '</div>';

    startTimer();
  }

  function submitPractice() {
    var p = state.practice; if (!p) return;
    var paper = paperById(p.paperId); if (!paper) return;
    var qs = paper.questions || [];
    var missing = qs.filter(function (q) { return !p.answers[q.id]; }).length;
    if (missing && !window.confirm('还有 ' + missing + ' 题未作答，仍要提交吗？')) return;
    var score = qs.filter(function (q) { return p.answers[q.id] === q.answer; }).length;
    p.submitted = true;
    state.progress[p.paperId] = {
      answers: p.answers, submitted: true, seconds: p.seconds,
      score: score, total: qs.length, updatedAt: new Date().toISOString()
    };
    persistProgress();
    rememberPaper(paper);
    stopTimer();
    renderPractice(p.paperId);
    toast('已提交：' + score + ' / ' + qs.length + ' 正确');
  }

  /* ---------- word lookup & vocabulary ---------- */
  function normalizeWord(raw) {
    var w = String(raw == null ? '' : raw).replace(/[’]/g, "'").trim().toLowerCase();
    w = w.replace(/^[^a-z]+|[^a-z'-]+$/g, '');
    w = w.replace(/'s$/, '').replace(/'$/, '');
    return w;
  }
  function lemmaCandidates(word) {
    var w = normalizeWord(word), out = [];
    function add(x) { if (x && out.indexOf(x) < 0) out.push(x); }
    add(w);
    if (/ies$/.test(w)) add(w.slice(0, -3) + 'y');
    if (/ied$/.test(w)) add(w.slice(0, -3) + 'y');
    if (/ing$/.test(w)) {
      var a = w.slice(0, -3); add(a); add(a + 'e');
      if (/([b-df-hj-np-tv-z])\1$/.test(a)) add(a.slice(0, -1));
    }
    if (/ed$/.test(w)) {
      var b = w.slice(0, -2); add(b); add(w.slice(0, -1));
      if (/([b-df-hj-np-tv-z])\1$/.test(b)) add(b.slice(0, -1));
    }
    if (/es$/.test(w)) add(w.slice(0, -2));
    if (/s$/.test(w)) add(w.slice(0, -1));
    if (/ly$/.test(w)) add(w.slice(0, -2));
    return out;
  }
  function lookupLocal(word) {
    var dict = window.KY_DICT || {};
    var cands = lemmaCandidates(word);
    for (var i = 0; i < cands.length; i++) {
      var hit = dict[cands[i]];
      if (!hit) continue;
      if (typeof hit === 'string') return { zh: hit, pos: '', base: cands[i] };
      return { zh: hit.zh || '', pos: hit.pos || '', base: cands[i] };
    }
    return null;
  }
  function decodeEntities(text) {
    var ta = document.createElement('textarea');
    ta.innerHTML = String(text == null ? '' : text);
    return ta.value;
  }
  function getCachedTranslation(word) {
    var c = state.dictCache[word];
    if (c && c.zh && c.t && Date.now() - c.t < 30 * 24 * 60 * 60 * 1000) return c.zh;
    return '';
  }
  function cacheTranslation(word, zh) {
    var keys = Object.keys(state.dictCache);
    if (keys.length >= 400) {
      keys.sort(function (a, b) { return (state.dictCache[a].t || 0) - (state.dictCache[b].t || 0); });
      for (var i = 0; i < keys.length - 399; i++) delete state.dictCache[keys[i]];
    }
    state.dictCache[word] = { zh: zh, t: Date.now() };
    persistDictCache();
  }
  var lookupAbort = null;
  function fetchTranslation(word) {
    if (lookupAbort) { try { lookupAbort.abort(); } catch (e) {} }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    lookupAbort = ctrl;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 9000) : null;
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en%7Czh-CN';
    function clear() { if (timer) { clearTimeout(timer); timer = null; } }
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var t = j && j.responseData && j.responseData.translatedText;
        if (!t) throw new Error('没有返回释义');
        t = decodeEntities(t).trim();
        if (!t || /MYMEMORY WARNING/i.test(t)) throw new Error('在线翻译暂不可用');
        clear();
        return t;
      }, function (err) { clear(); throw err; });
  }
  function sentenceFromRange(range, word) {
    var node = range.startContainer;
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    var block = el && el.closest ? el.closest('p, .passage, .q-stem, .opt, .explain') : null;
    if (!block) return '';
    var text = block.textContent || '';
    var r = document.createRange();
    r.selectNodeContents(block);
    try { r.setEnd(range.startContainer, range.startOffset); } catch (e) { return ''; }
    var start = r.toString().length;
    try { r.setEnd(range.endContainer, range.endOffset); } catch (e) { return ''; }
    var end = r.toString().length;
    var left = text.slice(0, start);
    var s = Math.max(left.lastIndexOf('. '), left.lastIndexOf('! '), left.lastIndexOf('? '), left.lastIndexOf('\n'));
    var right = text.slice(end);
    var m = right.match(/[.!?](?:\s|$)/);
    var e = m ? end + m.index + 1 : text.length;
    var out = text.slice(s + 1, e).trim().replace(/\s+/g, ' ');
    return out.length > 260 ? out.slice(0, 257) + '…' : out;
  }
  function findWordAt(text, offset) {
    var re = /[A-Za-z][A-Za-z'’-]*/g, m;
    while ((m = re.exec(text))) {
      if (offset >= m.index && offset <= m.index + m[0].length) return m;
    }
    return null;
  }
  function wordRangeAtPoint(x, y) {
    var range = null;
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    if (!range || !range.startContainer) return null;
    var node = range.startContainer, offset = range.startOffset;
    if (node.nodeType !== 3) {
      var child = node.childNodes[Math.min(offset, node.childNodes.length - 1)];
      if (child && child.nodeType === 3) { node = child; offset = 0; } else return null;
    }
    var text = node.nodeValue || '';
    var found = findWordAt(text, offset) || findWordAt(text, Math.max(0, offset - 1));
    if (!found) return null;
    var word = normalizeWord(found[0]);
    if (!word || word.length < 2) return null;
    var r = document.createRange();
    r.setStart(node, found.index);
    r.setEnd(node, found.index + found[0].length);
    return { range: r, word: word };
  }
  function selectRange(range) {
    try { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } catch (e) {}
  }
  function highlightContext(ctx, word) {
    var safe = esc(ctx);
    var re = new RegExp('\\b(' + String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  }
  function renderWordCard() {
    var w = state.word; if (!w) return;
    $('#word-title').textContent = w.word;
    $('#word-phonetic').textContent = w.local && w.local.pos ? w.local.pos : '';
    var rows = [];
    if (w.local && w.local.zh) rows.push('<div class="word-sense"><b>本地词库</b><span>' + esc(w.local.zh) + '</span></div>');
    if (w.online) rows.push('<div class="word-sense"><b>在线翻译</b><span>' + esc(w.online) + '</span></div>');
    if (w.loading) rows.push('<div class="word-loading"><span class="spinner"></span>正在联网查词…</div>');
    if (w.error) rows.push('<div class="word-error">' + esc(w.error) + (state.settings.lookupOnline === false ? '' : ' <button class="btn ghost sm" id="word-retry" type="button">重试</button>') + '</div>');
    if (!w.local && !w.online && !w.loading && !w.error) rows.push('<p class="muted small" style="margin:0">本地词库没有收录，联网翻译也没有结果。可点“有道”查看详细词典。</p>');
    if (w.context) rows.push('<div class="word-context"><b>语境</b>' + highlightContext(w.context, w.word) + '</div>');
    $('#word-body').innerHTML = rows.join('');
    var saved = state.vocab.some(function (v) { return String(v.word || '').toLowerCase() === w.word; });
    var save = $('#word-save');
    save.textContent = saved ? '已在生词本' : '加入生词本';
    save.disabled = saved;
    $('#word-more').href = 'https://dict.youdao.com/result?word=' + encodeURIComponent(w.word) + '&lang=en';
    var retry = $('#word-retry');
    if (retry) retry.addEventListener('click', function () { startOnlineLookup(w.word); });
  }
  function startOnlineLookup(word) {
    var w = state.word; if (!w || w.word !== word) return;
    if (!state.settings.lookupOnline) { w.loading = false; w.error = '联网查词已关闭，可在设置中开启'; renderWordCard(); return; }
    var cached = getCachedTranslation(word);
    if (cached) { w.online = cached; w.loading = false; w.error = ''; renderWordCard(); return; }
    if (!navigator.onLine) { w.loading = false; w.error = '当前网络不可用'; renderWordCard(); return; }
    w.loading = true; w.error = ''; renderWordCard();
    fetchTranslation(word).then(function (t) {
      if (state.word !== w) return;
      state.word.online = t; state.word.loading = false; state.word.error = '';
      for (var i = 0; i < state.vocab.length; i++) {
        if (String(state.vocab[i].word || '').toLowerCase() === word && !state.vocab[i].zh) {
          state.vocab[i].zh = t; persistVocab(); break;
        }
      }
      cacheTranslation(word, t); renderWordCard();
    }).catch(function (err) {
      if (state.word !== w) return;
      state.word.loading = false;
      state.word.error = '在线翻译失败：' + (err && err.name === 'AbortError' ? '请求超时' : (err && err.message ? err.message : '网络错误'));
      renderWordCard();
    });
  }
  function openWordCard(word, context) {
    word = normalizeWord(word); if (!word || word.length < 2) return;
    if (state.word && state.word.word === word && Date.now() - state.word.openedAt < 600) return;
    state.word = { word: word, context: context || '', local: lookupLocal(word), online: '', loading: false, error: '', openedAt: Date.now() };
    var card = $('#word-card'); if (!card) return;
    card.hidden = false;
    renderWordCard();
    startOnlineLookup(word);
    try { card.focus({ preventScroll: true }); } catch (e) { try { card.focus(); } catch (e2) {} }
  }
  function closeWordCard() {
    var card = $('#word-card'); if (!card) return;
    card.hidden = true; state.word = null;
    var sel = window.getSelection(); if (sel) sel.removeAllRanges();
  }
  function addCurrentWordToVocab() {
    var w = state.word; if (!w) return;
    var existing = null;
    for (var i = 0; i < state.vocab.length; i++) {
      if (String(state.vocab[i].word || '').toLowerCase() === w.word) { existing = state.vocab[i]; break; }
    }
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.updatedAt = new Date().toISOString();
      persistVocab(); toast('这个单词已经在生词本里'); renderWordCard(); return;
    }
    var now = new Date().toISOString();
    state.vocab.unshift({
      word: w.word,
      pos: (w.local && w.local.pos) || '',
      zh: (w.local && w.local.zh) || w.online || '',
      context: w.context || '',
      paperId: state.practice ? state.practice.paperId : '',
      createdAt: now, updatedAt: now, count: 1
    });
    persistVocab(); toast('已加入生词本：' + w.word); renderWordCard();
  }
  function speakWord(word) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast('当前浏览器不支持朗读'); return; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US'; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) { toast('朗读失败'); }
  }
  function vocabFiltered() {
    var q = state.vocabQuery.toLowerCase();
    if (!q) return state.vocab.slice();
    return state.vocab.filter(function (v) {
      return [v.word, v.zh, v.context, v.pos].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderVocab() {
    var today = 0, k = dayKey();
    state.vocab.forEach(function (v) { if (String(v.createdAt || '').slice(0, 10) === k) today++; });
    var root = $('#vocab-root'); if (!root) return;
    root.innerHTML =
      '<div class="card"><div class="card-head"><h3>生词本</h3><span class="muted small" id="vocab-count">' + state.vocab.length + ' 个词 · 今日新增 ' + today + '</span></div>' +
        '<div class="filter-row"><label class="field grow"><span>搜索</span><input id="vocab-q" type="search" placeholder="单词、释义或原文" value="' + esc(state.vocabQuery) + '"></label><button class="btn ghost" id="vocab-export" type="button">导出 JSON</button></div>' +
        '<p class="hint">阅读时长按（手机）或双击（电脑）文章里的英文单词，点“加入生词本”即可收藏。查词结果只保存在本机。</p>' +
        '<div id="vocab-list" class="vocab-list"></div>' +
      '</div>';
    var q = $('#vocab-q');
    if (q) q.addEventListener('input', function () { state.vocabQuery = q.value.trim(); renderVocabList(); });
    var ex = $('#vocab-export');
    if (ex) ex.addEventListener('click', function () {
      download('kaoyan-vocab-' + dayKey() + '.json', { version: 1, exportedAt: new Date().toISOString(), vocab: state.vocab });
    });
    renderVocabList();
  }
  function renderVocabList() {
    var list = $('#vocab-list'); if (!list) return;
    var rows = vocabFiltered();
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><h2>还没有生词</h2><p class="muted">阅读时长按或双击任意英文单词，点“加入生词本”即可收藏。</p><button class="btn primary" data-route="library">去练习</button></div>';
      return;
    }
    list.innerHTML = rows.map(function (v) {
      return '<div class="vocab-row"><div class="vocab-main">' +
        '<div class="vocab-word"><strong>' + esc(v.word) + '</strong>' + (v.pos ? '<span>' + esc(v.pos) + '</span>' : '') + '</div>' +
        '<div class="vocab-zh">' + esc(v.zh || '暂无释义') + '</div>' +
        (v.context ? '<div class="vocab-ctx">' + esc(v.context) + '</div>' : '') +
        '</div><div class="vocab-actions"><button class="btn ghost sm" data-vocab-speak="' + esc(v.word) + '" type="button">朗读</button><button class="btn danger sm" data-vocab-del="' + esc(v.word) + '" type="button">删除</button></div></div>';
    }).join('');
  }
  function removeVocab(word) {
    var key = String(word || '').toLowerCase();
    state.vocab = state.vocab.filter(function (v) { return String(v.word || '').toLowerCase() !== key; });
    persistVocab(); renderVocabList(); toast('已从生词本删除');
  }
  function mergeVocab(items) {
    var n = 0;
    (items || []).forEach(function (v) {
      if (!v || !v.word) return;
      var w = normalizeWord(v.word); if (!w) return;
      var existing = null;
      for (var i = 0; i < state.vocab.length; i++) { if (String(state.vocab[i].word || '').toLowerCase() === w) { existing = state.vocab[i]; break; } }
      if (existing) {
        if (v.zh && !existing.zh) existing.zh = v.zh;
        if (v.context && !existing.context) existing.context = v.context;
        existing.count = Math.max(existing.count || 1, v.count || 1);
      } else {
        state.vocab.push(Object.assign({}, v, { word: w }));
        n++;
      }
    });
    persistVocab(); return n;
  }

  /* ---------- wrong book ---------- */
  function renderWrong() {
    var items = wrongItems();
    $('#wrong-count').textContent = items.length ? items.length + ' 道待复习' : '暂无错题';
    if (!items.length) {
      $('#wrong-list').innerHTML = '<div class="empty-state"><h2>错题本是空的</h2><p class="muted">提交练习后，做错的题会自动收进来。</p><button class="btn primary" data-route="library">去做题</button></div>';
      return;
    }
    $('#wrong-list').innerHTML = items.map(function (it, i) {
      return '<div class="row" style="align-items:flex-start;flex-direction:column;gap:8px">' +
        '<div class="row-title" style="white-space:normal">' + (i + 1) + '. ' + esc(it.q.stem) + '</div>' +
        '<div class="row-sub">' + esc(it.paper.title || it.paper.label) + ' · 你选 ' + esc(it.user) + ' · 正确答案 ' + esc(it.q.answer) + '</div>' +
        '<div class="explain" style="margin-top:0;width:100%"><b>解析</b><br>' + esc(it.q.explanation || '暂无解析') + '</div>' +
        '<div class="row-actions"><button class="btn ghost sm" data-open="' + esc(it.paper.id) + '">去重做本篇</button></div>' +
      '</div>';
    }).join('');
  }

  /* ---------- stats ---------- */
  function renderStats() {
    var a = aggregate(), w = wrongItems().length, week = weeklyStats();
    var max = Math.max.apply(null, week.map(function (x) { return x.count; }).concat([1]));
    var bars = week.map(function (x) {
      var h = Math.round(x.count / max * 100);
      return '<div class="bar"><i style="height:' + Math.max(2, h) + '%"></i><em>' + x.label + '</em></div>';
    }).join('');
    $('#stats-root').innerHTML =
      '<div class="stat-grid">' +
        '<div class="big-stat"><b>' + a.done + '</b><span>已完成篇目</span></div>' +
        '<div class="big-stat"><b>' + a.acc + '%</b><span>累计正确率</span></div>' +
        '<div class="big-stat"><b>' + a.answered + '</b><span>已作答题数</span></div>' +
        '<div class="big-stat"><b>' + calcStreak() + '</b><span>连续学习天数</span></div>' +
      '</div>' +
      '<div class="card" style="margin-top:18px"><div class="card-head"><h3>最近 7 天</h3><span class="muted small">每天提交的篇数</span></div>' +
        '<div class="bars">' + bars + '</div><div class="legend"><span>峰值 ' + max + ' 篇/天</span><span>待复习错题 ' + w + ' 道</span></div></div>' +
      '<div class="card"><div class="card-head"><h3>下一步建议</h3></div><p class="muted" style="margin:0">' +
        (a.done === 0 ? '先完成 1 篇阅读，建立基线。' : w > 6 ? '错题偏多，先清错题本，再开新篇。' : a.acc >= 80 ? '正确率不错，可以开始限时训练。' : '正确率还有空间，建议每篇做完后逐题复述定位句。') +
      '</p></div>';
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    var s = state.settings;
    var c = state.cloud;
    $('#settings-root').innerHTML =
      '<div class="card"><div class="card-head"><h3>阅读体验</h3></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>主题</strong><span>跟随系统或固定浅色/深色</span></div><div class="seg" id="seg-theme">' +
          ['auto', 'light', 'dark'].map(function (t) { return '<button data-theme="' + t + '" class="' + (s.theme === t ? 'on' : '') + '">' + ({ auto: '自动', light: '浅色', dark: '深色' })[t] + '</button>'; }).join('') +
        '</div></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>正文字号</strong><span>仅影响文章阅读区</span></div><div><input type="range" id="range-font" min="15" max="24" step="1" value="' + s.fontSize + '"><span class="range-val" id="font-val">' + s.fontSize + 'px</span></div></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>每日目标</strong><span>用于首页进度环</span></div><div><input type="range" id="range-goal" min="1" max="8" step="1" value="' + s.dailyGoal + '"><span class="range-val" id="goal-val">' + s.dailyGoal + ' 篇</span></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>查词</h3><span class="muted small">长按/双击文章中的单词</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>联网翻译</strong><span>通过 MyMemory 获取中文释义；关闭后只用本地词库</span></div><div class="seg" id="seg-lookup">' +
          ['1', '0'].map(function (v) { return '<button data-lookup="' + v + '" class="' + ((s.lookupOnline !== false) === (v === '1') ? 'on' : '') + '">' + (v === '1' ? '开启' : '关闭') + '</button>'; }).join('') +
        '</div></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>生词本</strong><span>已收藏 ' + state.vocab.length + ' 个词，可在生词本页复习</span></div><button class="btn ghost sm" data-route="vocab">查看生词本</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>数据</h3><span class="muted small">全部保存在本机 localStorage</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>导出完整备份</strong><span>题库 + 进度 + 设置 + 生词本，可用于换设备</span></div><button class="btn primary sm" id="btn-export-all">导出 JSON</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>只导出进度</strong><span>换设备后导入即可续学</span></div><button class="btn ghost sm" id="btn-export-progress">导出进度</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>导入</strong><span>题库、进度、生词本或完整备份</span></div><button class="btn ghost sm" id="btn-import-2">选择 JSON</button></div>' +
        '<div class="setting-row danger-zone"><div class="setting-copy"><strong>清空全部数据</strong><span>不可恢复，请先导出备份</span></div><button class="btn danger sm" id="btn-clear">清空</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>本地记忆</h3><span class="muted small">只存此设备</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>自动记忆</strong><span>' + esc(memoryStatusText()) + '</span></div><button class="btn ghost sm" id="btn-memory-continue">继续上次</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>记忆编号</strong><span>' + esc(memoryShortId()) + '</span></div><button class="btn ghost sm" id="btn-memory-reset">重置记忆</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>云同步（可选）</h3><span class="muted small">Supabase · 本地优先</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>状态</strong><span id="cloud-status">' + esc(cloudStatusText()) + '</span></div><button class="btn ghost sm" id="btn-cloud-help">配置说明</button></div>' +
        '<div class="cloud-grid">' +
          '<label class="field grow"><span>Supabase URL</span><input id="cloud-url" placeholder="https://xxxx.supabase.co" value="' + esc(c.url || '') + '"></label>' +
          '<label class="field grow"><span>Anon Key</span><input id="cloud-key" placeholder="eyJ..." value="' + esc(c.anonKey || '') + '"></label>' +
        '</div>' +
        '<label class="field"><span>同步码（两台设备填同一个）</span><div class="cloud-code-row"><input id="cloud-code" placeholder="点击生成或用同一串随机码" value="' + esc(c.syncCode || '') + '"><button class="btn ghost sm" id="btn-cloud-gen" type="button">生成</button><button class="btn ghost sm" id="btn-cloud-copy" type="button">复制</button></div></label>' +
        '<label class="check-row"><input type="checkbox" id="cloud-auto"' + (c.auto ? ' checked' : '') + '> 自动同步（联网时后台合并进度）</label>' +
        '<label class="check-row"><input type="checkbox" id="cloud-bank"' + (c.includeBank ? ' checked' : '') + '> 同时同步题库（约 1.9MB，建议按需开启）</label>' +
        '<div class="setting-row"><div class="setting-copy"><strong>手动同步</strong><span id="cloud-last">' + esc(cloudLastText()) + '</span></div><div class="hero-actions cloud-actions"><button class="btn ghost sm" id="btn-cloud-pull" type="button">下载云端</button><button class="btn ghost sm" id="btn-cloud-push" type="button">上传本机</button><button class="btn primary sm" id="btn-cloud-sync" type="button">智能同步</button></div></div>' +
        '<p class="hint">同步码相当于密码，请勿公开。Anon Key 只保存在本机；云端由 Supabase RPC 限制到该同步码。</p>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>帮助与反馈</h3></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>使用说明</strong><span>每次进站自动显示，也可从这里重新打开</span></div><button class="btn ghost sm" id="btn-settings-guide">查看</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>反馈通道</strong><span>发送到 ' + FEEDBACK_EMAIL + '</span></div><button class="btn ghost sm" id="btn-settings-feedback">写反馈</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>题库申请</strong><span>完整真题库不随公开仓库分发；邮件申请后导入本机</span></div><button class="btn ghost sm" id="btn-settings-bank">申请题库</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>题库整理</h3><span class="muted small">仅保留阅读</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>一键整理</strong><span>移除听力与空条目，按 id 去重，统计异常</span></div><button class="btn ghost sm" id="btn-tidy">整理题库</button></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>导出题库</strong><span>只导出 papers，便于分享或备份</span></div><button class="btn ghost sm" id="btn-export-bank">导出题库</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>关于</h3></div><p class="muted small" style="margin:0">考研英语工作台 · 单页静态应用 · 无账号、无追踪、无广告。<br>查词：本地词库离线可用，联网翻译使用 MyMemory；只发送当前单词，不发送文章。<br>PWA：通过 HTTPS 打开后可“添加到桌面”，离线可用。</p></div>';

    $$('#seg-theme button').forEach(function (b) {
      b.addEventListener('click', function () { state.settings.theme = b.dataset.theme; persistSettings(); applySettings(); renderSettings(); });
    });
    $$('#seg-lookup button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.settings.lookupOnline = b.dataset.lookup === '1';
        persistSettings(); renderSettings();
      });
    });
    var rf = $('#range-font');
    rf.addEventListener('input', function () { state.settings.fontSize = +rf.value; $('#font-val').textContent = rf.value + 'px'; applySettings(); });
    rf.addEventListener('change', persistSettings);
    var rg = $('#range-goal');
    rg.addEventListener('input', function () { state.settings.dailyGoal = +rg.value; $('#goal-val').textContent = rg.value + ' 篇'; });
    rg.addEventListener('change', persistSettings);
    $('#btn-export-all').addEventListener('click', function () { download('kaoyan-backup-' + dayKey() + '.json', { version: 1, exportedAt: new Date().toISOString(), bank: state.bank, progress: state.progress, settings: state.settings, vocab: state.vocab, memory: state.memory }); });
    $('#btn-export-progress').addEventListener('click', function () { download('kaoyan-progress-' + dayKey() + '.json', { version: 1, exportedAt: new Date().toISOString(), progress: state.progress, settings: state.settings, memory: state.memory }); });
    $('#btn-import-2').addEventListener('click', function () { openImport(); });
    $('#btn-tidy').addEventListener('click', tidyBank);
    $('#btn-export-bank').addEventListener('click', function () { download('kaoyan-bank-' + dayKey() + '.json', { version: 1, bank: state.bank }); });
    var memContinue = $('#btn-memory-continue');
    if (memContinue) memContinue.addEventListener('click', function () { var p = memoryLastPaper(); if (p) go('practice', p.id); else go('library'); });
    var memReset = $('#btn-memory-reset');
    if (memReset) memReset.addEventListener('click', function () {
      if (!window.confirm('重置本地记忆？练习进度不会删除，只会重新记录进站和上次位置。')) return;
      state.memory = newMemory();
      state.memory.visits = 1;
      state.memory.lastVisit = new Date().toISOString();
      persistMemory();
      renderSettings();
      toast('本地记忆已重置');
    });
    var setGuide = $('#btn-settings-guide');
    if (setGuide) setGuide.addEventListener('click', openGuide);
    var setFeedback = $('#btn-settings-feedback');
    if (setFeedback) setFeedback.addEventListener('click', openFeedback);
    var setBank = $('#btn-settings-bank');
    if (setBank) setBank.addEventListener('click', requestBank);
    var cloudUrl = $('#cloud-url');
    if (cloudUrl) cloudUrl.addEventListener('input', function () { readCloudForm(); updateCloudUI(); });
    var cloudKey = $('#cloud-key');
    if (cloudKey) cloudKey.addEventListener('input', function () { readCloudForm(); updateCloudUI(); });
    var cloudCode = $('#cloud-code');
    if (cloudCode) cloudCode.addEventListener('input', function () { readCloudForm(); updateCloudUI(); });
    var cloudAuto = $('#cloud-auto');
    if (cloudAuto) cloudAuto.addEventListener('change', function () { state.cloud.auto = cloudAuto.checked; persistCloud(); updateCloudUI(); });
    var cloudBank = $('#cloud-bank');
    if (cloudBank) cloudBank.addEventListener('change', function () { state.cloud.includeBank = cloudBank.checked; persistCloud(); updateCloudUI(); });
    var cloudGen = $('#btn-cloud-gen');
    if (cloudGen) cloudGen.addEventListener('click', function () {
      state.cloud.syncCode = generateSyncCode();
      persistCloud();
      if (cloudCode) cloudCode.value = state.cloud.syncCode;
      updateCloudUI();
      toast('已生成同步码，另一台设备填同一串');
    });
    var cloudCopy = $('#btn-cloud-copy');
    if (cloudCopy) cloudCopy.addEventListener('click', cloudCopyCode);
    var cloudHelp = $('#btn-cloud-help');
    if (cloudHelp) cloudHelp.addEventListener('click', function () { window.open('docs/云同步配置.md', '_blank', 'noopener'); });
    var cloudSyncBtn = $('#btn-cloud-sync');
    if (cloudSyncBtn) cloudSyncBtn.addEventListener('click', function () { readCloudForm(); syncNow('smart', false); });
    var cloudPushBtn = $('#btn-cloud-push');
    if (cloudPushBtn) cloudPushBtn.addEventListener('click', function () {
      readCloudForm();
      if (!window.confirm('上传本机会覆盖云端当前快照，确定继续？')) return;
      syncNow('upload', false);
    });
    var cloudPullBtn = $('#btn-cloud-pull');
    if (cloudPullBtn) cloudPullBtn.addEventListener('click', function () {
      readCloudForm();
      if (!window.confirm('下载云端会覆盖本机进度、生词和记忆，确定继续？')) return;
      syncNow('download', false);
    });
    $('#btn-clear').addEventListener('click', function () {
      if (!window.confirm('确定清空题库、进度、生词本、本地记忆和设置？请先导出备份。')) return;
      localStorage.removeItem(K.bank); localStorage.removeItem(K.progress); localStorage.removeItem(K.settings);
      localStorage.removeItem(K.vocab); localStorage.removeItem(K.dictCache); localStorage.removeItem(K.memory); localStorage.removeItem(K.cloud);
      state.bank = []; state.progress = {}; state.vocab = []; state.dictCache = {};
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
      state.cloud = { url: '', anonKey: '', syncCode: '', auto: false, includeBank: false, lastSyncAt: '', lastError: '' };
      state.memory = newMemory(); state.memory.visits = 1; state.memory.lastVisit = new Date().toISOString(); persistMemory();
      applySettings(); toast('已清空，本地记忆已重新建立'); go('dashboard');
    });
  }

  /* ---------- import / export ---------- */
  function openImport(template) {
    $('#import-text').value = template ? JSON.stringify(template, null, 2) : '';
    var d = $('#import-dialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function normalizePaper(p) {
    if (!p || !p.id) throw new Error('缺少 id');
    if (!p.passage) throw new Error('缺少 passage');
    var qs = (p.questions || []).map(function (q, i) {
      var opts = (q.options || []).map(function (o, j) {
        if (typeof o === 'string') return { label: String.fromCharCode(65 + j), text: o };
        return { label: String(o.label || String.fromCharCode(65 + j)).toUpperCase(), text: String(o.text || '') };
      });
      if (!q.answer) throw new Error('题目 ' + (q.id || i + 1) + ' 缺少 answer');
      return { id: String(q.id || (i + 1)), stem: String(q.stem || ''), options: opts, answer: String(q.answer).trim().toUpperCase(), explanation: String(q.explanation || '') };
    });
    if (!qs.length) throw new Error('至少需要 1 道题');
    return {
      id: String(p.id), year: Number(p.year) || 0, exam: String(p.exam || '自定义'),
      type: 'reading',
      title: String(p.title || p.label || p.id), subtitle: String(p.subtitle || ''),
      passage: String(p.passage || ''), audio: String(p.audio || ''), questions: qs
    };
  }
  function doImport() {
    var raw = $('#import-text').value.trim();
    if (!raw) { toast('请先选择文件或粘贴 JSON'); return; }
    var data;
    try { data = JSON.parse(raw); } catch (e) { toast('JSON 解析失败：' + e.message); return; }
    var papers = [], progress = null, vocab = null, memory = null;
    if (Array.isArray(data)) papers = data;
    else if (data.papers) { papers = data.papers || []; vocab = data.vocab || null; memory = data.memory || null; }
    else if (data.bank) { papers = data.bank || []; progress = data.progress || null; vocab = data.vocab || null; memory = data.memory || null; }
    else if (data.progress) { progress = data.progress; vocab = data.vocab || null; memory = data.memory || null; }
    else if (data.vocab) { vocab = data.vocab; memory = data.memory || null; }
    else if (data.memory) { memory = data.memory; }
    else if (data.id) papers = [data];
    else { toast('无法识别的结构：需要 papers / bank / progress / vocab / 单篇对象'); return; }
    if (!Array.isArray(papers)) papers = [];
    var added = 0;
    try {
      papers.forEach(function (p) {
        var np = normalizePaper(p);
        var idx = -1;
        for (var i = 0; i < state.bank.length; i++) { if (state.bank[i].id === np.id) { idx = i; break; } }
        if (idx >= 0) state.bank[idx] = np; else state.bank.push(np);
        added++;
      });
    } catch (e) { toast('导入失败：' + e.message); return; }
    if (progress && typeof progress === 'object') Object.assign(state.progress, progress);
    var vocabAdded = (vocab && Array.isArray(vocab)) ? mergeVocab(vocab) : 0;
    if (memory && typeof memory === 'object') { state.memory = Object.assign(newMemory(), memory); persistMemory(); }
    persistBank(); persistProgress();
    var d = $('#import-dialog'); if (d.close) d.close();
    toast('已导入 ' + added + ' 篇' + (progress ? ' + 进度' : '') + (vocabAdded ? ' + ' + vocabAdded + ' 个生词' : ''));
    if (location.hash.indexOf('#/practice/') === 0) { state.practice = null; onHash(); }
    else if (location.hash.indexOf('#/vocab') === 0) renderVocab();
    else renderLibrary();
  }


  /* ---------- smart paste (reading only) ---------- */
  function parsePaperText(raw, meta) {
    var lines = String(raw || '').split(/\r?\n/);
    var qRe = /^\s*(\d{1,2})\s*[.、．)]\s*(.*)$/;
    var oRe = /^\s*([A-D])\s*[.、．)\]]\s*(.*)$/;
    var start = -1, i;
    for (i = 0; i < lines.length; i++) {
      var m = lines[i].match(qRe);
      if (m && +m[1] >= 21 && +m[1] <= 45) { start = i; break; }
    }
    var passage = lines.slice(0, start < 0 ? lines.length : start).join('\n')
      .replace(/^\s*(Part\s*A|Text\s*\d+)\s*\n/i, '')
      .replace(/\n{3,}/g, '\n\n').trim();
    var qs = [], cur = null, j;
    for (j = start < 0 ? lines.length : start; j < lines.length; j++) {
      var line = lines[j], qm = line.match(qRe), om = line.match(oRe);
      if (qm && +qm[1] >= 20 && +qm[1] <= 60) {
        if (cur) qs.push(cur);
        cur = { id: qm[1], stem: (qm[2] || '').trim(), options: [], answer: '', explanation: '' };
      } else if (om && cur) {
        cur.options.push({ label: om[1], text: (om[2] || '').trim() });
      } else if (cur) {
        var t = line.trim(); if (!t) continue;
        if (cur.options.length) {
          var last = cur.options[cur.options.length - 1];
          last.text = (last.text + ' ' + t).trim();
        } else {
          cur.stem = (cur.stem + ' ' + t).trim();
        }
      }
    }
    if (cur) qs.push(cur);
    var letters = String(meta.answers || '').toUpperCase().replace(/[^A-D]/g, '');
    qs.forEach(function (q, idx) { q.answer = letters[idx] || ''; });
    return {
      id: (meta.exam === '英语二' ? 'e2-' : 'y') + meta.year + '-t' + meta.no,
      year: meta.year, exam: meta.exam, type: 'reading',
      title: meta.exam + ' ' + meta.year + ' Text ' + meta.no,
      subtitle: '智能粘贴导入',
      passage: passage, audio: '',
      questions: qs
    };
  }
  function openSmart() {
    var d = $('#smart-dialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function smartImport() {
    var raw = $('#s-text').value.trim();
    var answers = $('#s-answers').value.trim();
    var year = +$('#s-year').value, exam = $('#s-exam').value, no = +$('#s-no').value;
    var prev = $('#s-preview');
    if (!raw) { toast('请先粘贴原文与题目'); return; }
    var p = parsePaperText(raw, { year: year, exam: exam, no: no, answers: answers });
    var qs = p.questions;
    var withOpts = qs.filter(function (q) { return q.options.length >= 2; }).length;
    var withAns = qs.filter(function (q) { return q.answer; }).length;
    var warn = [];
    if (!qs.length) warn.push('未识别到题号（21–45）');
    if (withOpts < qs.length) warn.push('有 ' + (qs.length - withOpts) + ' 题选项不足');
    if (withAns < qs.length) warn.push('有 ' + (qs.length - withAns) + ' 题缺答案');
    prev.className = 'smart-preview on';
    prev.innerHTML = '<b>' + esc(p.title) + '</b> · 原文 ' + p.passage.length + ' 字 · 识别 ' + qs.length + ' 题 · 选项完整 ' + withOpts + '/' + qs.length + ' · 答案 ' + withAns + '/' + qs.length +
      (warn.length ? '<br><span class="warn">' + esc(warn.join('；')) + '</span>' : '<br>解析正常，可以导入。');
    if (!qs.length) return;
    try {
      var np = normalizePaper(p);
      var idx = -1, i;
      for (i = 0; i < state.bank.length; i++) { if (state.bank[i].id === np.id) { idx = i; break; } }
      if (idx >= 0) state.bank[idx] = np; else state.bank.push(np);
      persistBank();
      var d = $('#smart-dialog'); if (d.close) d.close();
      toast('已导入 ' + np.title + '（' + np.questions.length + ' 题）');
      go('practice', np.id);
    } catch (e) { toast('导入失败：' + e.message); }
  }
  function tidyBank() {
    var before = state.bank.length;
    var map = {};
    function score(x) { return String(x.passage || '').length + ((x.questions || []).length * 200); }
    state.bank.forEach(function (p) {
      if (!p || p.type === 'listening') return;
      var prev = map[p.id];
      if (!prev || score(p) >= score(prev)) map[p.id] = p;
    });
    var out = Object.keys(map).map(function (k) { return map[k]; });
    state.bank = out; persistBank();
    var invalid = out.filter(function (p) { return !p.passage || !(p.questions || []).length; }).length;
    toast('整理完成：移除/合并 ' + (before - out.length) + ' 篇，剩余 ' + out.length + ' 篇' + (invalid ? '，异常 ' + invalid + ' 篇' : ''));
    renderSettings();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var routeEl = t.closest('[data-route]');
    if (routeEl) { e.preventDefault(); closeWordCard(); go(routeEl.dataset.route); return; }

    var vSpeak = t.closest('[data-vocab-speak]');
    if (vSpeak) { e.preventDefault(); speakWord(vSpeak.dataset.vocabSpeak); return; }
    var vDel = t.closest('[data-vocab-del]');
    if (vDel) {
      e.preventDefault();
      if (window.confirm('从生词本删除 “' + vDel.dataset.vocabDel + '”？')) removeVocab(vDel.dataset.vocabDel);
      return;
    }

    if (t.id === 'word-close') { e.preventDefault(); closeWordCard(); return; }
    if (t.id === 'word-save') { e.preventDefault(); addCurrentWordToVocab(); return; }
    if (t.id === 'word-speak') { e.preventDefault(); if (state.word) speakWord(state.word.word); return; }

    var openEl = t.closest('[data-open]');
    if (openEl) { e.preventDefault(); go('practice', openEl.dataset.open); return; }

    var imp = t.closest('[data-import]');
    if (imp) { e.preventDefault(); openImport(); return; }

    var tpl = t.closest('[data-template]');
    if (tpl) {
      e.preventDefault();
      var id = tpl.dataset.template;
      var ent = planEntries().filter(function (x) { return x.id === id; })[0] || {};
      openImport({
        id: id, year: ent.year || 0, exam: ent.exam || '自定义', type: 'reading',
        title: ent.exam && ent.year ? ent.exam + ' ' + ent.year + ' ' + ent.label : id,
        passage: '在此粘贴原文，段落之间空一行。',
        questions: [{ id: '1', stem: '题干', options: [{ label: 'A', text: '选项 A' }, { label: 'B', text: '选项 B' }, { label: 'C', text: '选项 C' }, { label: 'D', text: '选项 D' }], answer: 'A', explanation: '解析' }]
      });
      return;
    }

    var opt = t.closest('[data-opt]');
    if (opt && state.practice && !state.practice.submitted) {
      if (Date.now() - lookupPress.fired < 700) { e.preventDefault(); return; }
      if (e.detail > 1) { cancelPendingOptionSelect(); return; }
      var qid = opt.dataset.opt, lab = opt.dataset.lab;
      cancelPendingOptionSelect();
      pendingOptionSelect.opt = opt;
      pendingOptionSelect.timer = setTimeout(function () {
        pendingOptionSelect.timer = null;
        if (!state.practice || state.practice.submitted || !opt.isConnected) return;
        state.practice.answers[qid] = lab;
        var box = opt.closest('.opts');
        if (box) $$('.opt', box).forEach(function (b) { b.classList.toggle('sel', b === opt); });
        saveDraft();
      }, 320);
      return;
    }

    if (t.id === 'btn-submit') { submitPractice(); return; }

    if (t.id === 'btn-review-wrong') {
      var w = wrongItems();
      if (!w.length) toast('本篇没有错题');
      else go('wrong');
      return;
    }

    if (t.id === 'btn-redo' && state.practice) {
      e.preventDefault();
      if (!window.confirm('清空本篇作答并重做？')) return;
      var pid = state.practice.paperId;
      state.progress[pid] = { answers: {}, submitted: false, seconds: 0, updatedAt: new Date().toISOString() };
      persistProgress();
      state.practice = null;
      renderPractice(pid);
      return;
    }

    var mt = t.closest('[data-mtab]');
    if (mt) {
      $$('#mtabs button').forEach(function (b) { b.classList.toggle('on', b === mt); });
      $('#pane-passage').classList.toggle('mobile-hide', mt.dataset.mtab !== 'passage');
      $('#pane-questions').classList.toggle('mobile-hide', mt.dataset.mtab !== 'questions');
      return;
    }

    if (state.word && !t.closest('#word-card') && !lookupZone(t) && Date.now() - state.word.openedAt > 300) closeWordCard();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.word) { closeWordCard(); return; }
    if (state.word) return;
    if (!state.practice || state.practice.submitted) return;
    if (e.target.matches('input,textarea,select')) return;
    var map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    var lab = map[e.key] || map[e.key.toLowerCase()];
    if (!lab) return;
    var qs = $$('.q'); if (!qs.length) return;
    var target = null;
    for (var i = 0; i < qs.length; i++) { if (!state.practice.answers[qs[i].dataset.q]) { target = qs[i]; break; } }
    if (!target) target = qs[qs.length - 1];
    var btn = target.querySelector('[data-lab="' + lab + '"]');
    if (btn) { btn.click(); e.preventDefault(); }
  });

  ['f-exam', 'f-year', 'f-type', 'f-status'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () {
      state.filter[id.slice(2)] = el.value;
      renderLibrary();
    });
  });
  var fq = $('#f-q');
  if (fq) fq.addEventListener('input', function () { state.filter.q = fq.value.trim(); renderLibrary(); });

  var btnReal = $('#btn-real');
  if (btnReal) btnReal.addEventListener('click', requestBank);
  var bankLink = $('#bank-request-link');
  if (bankLink) bankLink.href = bankRequestUrl();
  var copyBankEmailBtn = $('#btn-copy-bank-email');
  if (copyBankEmailBtn) copyBankEmailBtn.addEventListener('click', copyBankEmail);

  var btnSmart = $('#btn-smart');
  if (btnSmart) btnSmart.addEventListener('click', openSmart);
  var btnSmartDo = $('#btn-smart-do');
  if (btnSmartDo) btnSmartDo.addEventListener('click', function (e) { e.preventDefault(); smartImport(); });

  var btnImport = $('#btn-import');
  if (btnImport) btnImport.addEventListener('click', function () { openImport(); });

  var impFile = $('#import-file');
  if (impFile) impFile.addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { $('#import-text').value = String(r.result || ''); };
    r.readAsText(f);
  });

  var btnDoImport = $('#btn-do-import');
  if (btnDoImport) btnDoImport.addEventListener('click', function (e) { e.preventDefault(); doImport(); });

  var btnTop = $('#btn-continue-top');
  if (btnTop) btnTop.addEventListener('click', function () { var c = pickContinue(); if (c.paper) go('practice', c.paper.id); else openImport(); });

  var btnDash = $('#dash-continue');
  if (btnDash) btnDash.addEventListener('click', function () { var c = pickContinue(); if (c.paper) go('practice', c.paper.id); else openImport(); });

  var btnQuick = $('#btn-export-quick');
  if (btnQuick) btnQuick.addEventListener('click', function () {
    download('kaoyan-backup-' + dayKey() + '.json', { version: 1, exportedAt: new Date().toISOString(), bank: state.bank, progress: state.progress, settings: state.settings, vocab: state.vocab, memory: state.memory });
  });

  var btnGuide = $('#btn-guide');
  if (btnGuide) btnGuide.addEventListener('click', openGuide);
  var btnFeedback = $('#btn-feedback');
  if (btnFeedback) btnFeedback.addEventListener('click', openFeedback);
  var guideClose = $('#guide-close');
  if (guideClose) guideClose.addEventListener('click', function () { closeDialog('#guide-dialog'); });
  var guideStart = $('#btn-guide-start');
  if (guideStart) guideStart.addEventListener('click', function () { closeDialog('#guide-dialog'); });
  var guideFeedback = $('#btn-guide-feedback');
  if (guideFeedback) guideFeedback.addEventListener('click', openFeedback);
  var sendFeedbackBtn = $('#btn-send-feedback');
  if (sendFeedbackBtn) sendFeedbackBtn.addEventListener('click', sendFeedback);
  var copyEmailBtn = $('#btn-copy-email');
  if (copyEmailBtn) copyEmailBtn.addEventListener('click', copyEmail);

  /* ---------- long-press / selection lookup ---------- */
  var lookupPress = { timer: null, x: 0, y: 0, fired: 0, touch: false };
  var pendingOptionSelect = { timer: null, opt: null };
  function cancelPendingOptionSelect() {
    if (pendingOptionSelect.timer) clearTimeout(pendingOptionSelect.timer);
    pendingOptionSelect.timer = null;
    pendingOptionSelect.opt = null;
  }
  function lookupZone(target) {
    return target && target.closest ? target.closest('.passage, .q-stem, .opt, .explain') : null;
  }
  function lookupAtPoint(x, y) {
    var hit = wordRangeAtPoint(x, y);
    if (!hit) return false;
    cancelPendingOptionSelect();
    selectRange(hit.range);
    openWordCard(hit.word, sentenceFromRange(hit.range, hit.word));
    lookupPress.fired = Date.now();
    return true;
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    if (!lookupZone(e.target)) return;
    lookupPress.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    lookupPress.x = e.clientX; lookupPress.y = e.clientY;
    clearTimeout(lookupPress.timer);
    lookupPress.timer = setTimeout(function () {
      lookupPress.timer = null;
      lookupAtPoint(lookupPress.x, lookupPress.y);
    }, 480);
  }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (!lookupPress.timer) return;
    if (Math.abs(e.clientX - lookupPress.x) > 10 || Math.abs(e.clientY - lookupPress.y) > 10) {
      clearTimeout(lookupPress.timer); lookupPress.timer = null;
    }
  }, { passive: true });
  function cancelLongPress() {
    if (lookupPress.timer) { clearTimeout(lookupPress.timer); lookupPress.timer = null; }
  }
  document.addEventListener('pointerup', cancelLongPress);
  document.addEventListener('pointercancel', cancelLongPress);
  document.addEventListener('contextmenu', function (e) {
    if (!lookupPress.touch) return;
    if (lookupZone(e.target) && lookupAtPoint(e.clientX, e.clientY)) e.preventDefault();
  });
  document.addEventListener('dblclick', function (e) {
    if (!lookupZone(e.target)) return;
    cancelPendingOptionSelect();
    if (lookupAtPoint(e.clientX, e.clientY)) e.preventDefault();
  });
  function maybeLookupSelection() {
    setTimeout(function () {
      if (Date.now() - lookupPress.fired < 700) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      var txt = sel.toString().trim();
      if (!/^[A-Za-z][A-Za-z'’-]*$/.test(txt)) return;
      var node = sel.anchorNode;
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (!lookupZone(el)) return;
      var word = normalizeWord(txt);
      lookupPress.fired = Date.now();
      openWordCard(word, sentenceFromRange(sel.getRangeAt(0), word));
    }, 40);
  }
  document.addEventListener('mouseup', maybeLookupSelection);
  document.addEventListener('touchend', maybeLookupSelection);

  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeunload', function () { if (state.practice && !state.practice.submitted) saveDraft(); });

  /* ---------- boot ---------- */
  var _before = state.bank.length;
  state.bank = state.bank.filter(function (p) { return p && p.type !== 'listening'; });
  if (state.bank.length !== _before) store.write(K.bank, state.bank);
  initMemory();
  applySettings();
  if (!location.hash) location.hash = '#/dashboard';
  onHash();
  setTimeout(showGuideOnce, 450);
  if (cloudConfigured() && state.cloud.auto) setTimeout(function () { syncNow('auto', true); }, 1600);

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
