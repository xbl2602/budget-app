/* ============================================================
   LAN SYNC — WebRTC P2P (zero server, manual signaling)
   ============================================================ */
(function () {
  'use strict';

  function sanitizeHtml(str) {
    if (typeof str !== 'string') return '';
    var map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;' };
    return String(str).replace(/[&<>"'`]/g, function (c) { return map[c]; });
  }

  /* Compress/decompress SDP strings using browser's CompressionStream API */
  function _b64FromBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function _bytesFromB64(b64) {
    var s = atob(b64), len = s.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }
  // Fixed: feature-detect CompressionStream for Safari <16.4 compatibility (M11)
  if (typeof CompressionStream === 'undefined') {
    console.log('[LANSync] CompressionStream not supported, using plain text transfer');
  }

  async function compressStr(str) {
    if (typeof CompressionStream === 'undefined') return str; // fallback for Safari <16.4
    try {
      var bytes = new TextEncoder().encode(str);
      var blob = await new Response(
        new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
      ).blob();
      return _b64FromBytes(new Uint8Array(await blob.arrayBuffer()));
    } catch (e) { return str; }
  }
  async function decompressStr(b64) {
    if (typeof DecompressionStream === 'undefined' || b64.indexOf('\n') !== -1) return b64; // fallback: not compressed or unsupported
    try {
      var blob2 = await new Response(
        new Blob([_bytesFromB64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'))
      ).blob();
      return new TextDecoder().decode(await blob2.arrayBuffer());
    } catch (e) { return b64; }
  }

  var validators = {
    amount: function (v) { return typeof v === 'number' && isFinite(v) && v >= 0; },
    date: function (v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); },
    color: function (v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); },
    id: function (v) { return typeof v === 'string' && v.length > 0 && v.length < 100; },
    name: function (v) { return typeof v === 'string' && v.length > 0 && v.length < 200; },
    icon: function (v) { return typeof v === 'string' && v.length <= 10; },
    note: function (v) { return typeof v === 'string' && v.length < 1000; },
    parentId: function (v) { return v === null || (typeof v === 'string' && v.length < 100); }
  };

  function validateRecord(r) {
    return validators.amount(r.amount) &&
      validators.date(r.date) &&
      validators.id(r.id) &&
      (typeof r.note === 'undefined' || validators.note(r.note)) &&
      validators.id(r.categoryId) &&
      (typeof r.createdAt === 'undefined' || validators.date(r.createdAt));
  }

  function validateCategory(c) {
    return validators.id(c.id) &&
      validators.name(c.name) &&
      validators.color(c.color) &&
      validators.icon(c.icon) &&
      validators.parentId(c.parentId) &&
      typeof c.sortOrder === 'number';
  }

  function validateSyncData(data) {
    if (!data || typeof data !== 'object') return __('lansync.error.invalidDataNotObject');
    if (!Array.isArray(data.records)) return __('lansync.error.invalidDataNoRecords');
    if (!Array.isArray(data.categories)) return __('lansync.error.invalidDataNoCategories');
    data.records = data.records.filter(validateRecord);
    data.categories = data.categories.filter(validateCategory);
    return null;
  }

  function backupBeforeMerge() {
    try {
      localStorage.setItem('budgetBackupBeforeSync', DataStore.exportJSON());
      localStorage.setItem('budgetBackupTime', new Date().toISOString());
    } catch (e) { /* best-effort */ }
  }

  var pc = null;
  var channel = null;
  var syncState = 'idle';
  var onStateChange = null;
  var onDataCallback = null;
  var onErrorCallback = null;

  function resetConnection() {
    if (pc) { try { pc.close(); } catch (e) { /* ignore */ } pc = null; }
    channel = null;
    syncState = 'idle';
  }

  function setState(s) { syncState = s; if (typeof onStateChange === 'function') onStateChange(s); }

  function createHost(callbacks) {
    resetConnection();
    onStateChange = callbacks.onStateChange || null;
    onDataCallback = callbacks.onDataReceived || null;
    onErrorCallback = callbacks.onError || null;
    setState('host-offer');
    pc = new RTCPeerConnection({ iceServers: [] });
    channel = pc.createDataChannel('budget-sync', { ordered: true });
    channel.onopen = function () {
      setState('connected');
      try { channel.send(DataStore.exportJSON()); } catch (e) {
        if (onErrorCallback) onErrorCallback(__('lansync.error.sendFailed', e.message));
      }
    };
    channel.onmessage = function (msg) { if (typeof onDataCallback === 'function') onDataCallback(msg.data); };
    channel.onerror = function () { if (onErrorCallback) onErrorCallback(__('lansync.error.channelError')); };
    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed') {
        if (onErrorCallback) onErrorCallback(__('lansync.error.connectFailedNetwork'));
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (typeof callbacks.onConnect === 'function') callbacks.onConnect();
      }
    };
    return pc.createOffer()
      .then(function (o) { return pc.setLocalDescription(o); })
      .then(function () {
        return new Promise(function (r) {
          if (pc.iceGatheringState === 'complete') r(pc.localDescription.sdp);
          else pc.onicecandidate = function (e) { if (!e.candidate) r(pc.localDescription.sdp); };
        });
      })
      .then(function (sdp) { return compressStr(sdp); });
  }

  function acceptAnswer(answerB64) {
    if (!pc || (syncState !== 'host-offer' && syncState !== 'connected'))
      return Promise.reject(new Error(__('lansync.error.stateAbnormal')));
    return decompressStr(answerB64).then(function (sdp) {
      return pc.setRemoteDescription({ type: 'answer', sdp: sdp });
    }).then(function () { return true; });
  }

  function createClient(offerB64, callbacks) {
    resetConnection();
    onStateChange = callbacks.onStateChange || null;
    onDataCallback = callbacks.onDataReceived || null;
    onErrorCallback = callbacks.onError || null;
    setState('client-offer');
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed') {
        if (onErrorCallback) onErrorCallback(__('lansync.error.connectFailedNetwork'));
      }
    };
    pc.ondatachannel = function (e) {
      channel = e.channel;
      channel.onopen = function () { setState('connected'); };
      channel.onmessage = function (msg) { if (typeof onDataCallback === 'function') onDataCallback(msg.data); };
      channel.onerror = function () { if (onErrorCallback) onErrorCallback(__('lansync.error.channelError')); };
    };
    return decompressStr(offerB64).then(function (sdp) {
      return pc.setRemoteDescription({ type: 'offer', sdp: sdp })
        .then(function () { return pc.createAnswer(); })
        .then(function (a) { return pc.setLocalDescription(a); })
        .then(function () {
          return new Promise(function (r) {
            if (pc.iceGatheringState === 'complete') r(pc.localDescription.sdp);
            else pc.onicecandidate = function (e) { if (!e.candidate) r(pc.localDescription.sdp); };
          });
        })
        .then(function (sdp2) { return compressStr(sdp2); });
    });
  }

  function sortRecordsDesc(records) {
    records.sort(function (a, b) {
      var da = a.date || a.createdAt || '', db = b.date || b.createdAt || '';
      return da > db ? -1 : da < db ? 1 : 0;
    });
  }

  function receiveAndMerge(jsonStr, mode) {
    var data;
    try { data = JSON.parse(jsonStr); } catch (e) {
      if (onErrorCallback) onErrorCallback(__('lansync.error.jsonParseFailed'));
      return false;
    }
    var err = validateSyncData(data);
    if (err) console.warn('[Sync]', err);
    if (data.records.length === 0 && data.categories.length === 0) {
      if (onErrorCallback) onErrorCallback(__('lansync.error.noValidData'));
      return false;
    }
    backupBeforeMerge();
    if (mode === 'replace') {
      data.records.forEach(function (r) { r.note = sanitizeHtml(r.note || ''); });
      data.categories.forEach(function (c) { c.name = sanitizeHtml(c.name); c.icon = sanitizeHtml(c.icon); });
      sortRecordsDesc(data.records);
      var def = DataStore._defaults();
      DataStore._data = def;
      DataStore._data.records = data.records;
      DataStore._data.categories = data.categories;
      if (data.budgets) DataStore._data.budgets = data.budgets;
      if (data.categoryBudgets) DataStore._data.categoryBudgets = data.categoryBudgets;
      if (data.monthlyIncome) DataStore._data.monthlyIncome = data.monthlyIncome;
      if (data.billAmounts) DataStore._data.billAmounts = data.billAmounts;
      if (data.savingsTarget) DataStore._data.savingsTarget = data.savingsTarget;
      if (data.percentBase) DataStore._data.percentBase = data.percentBase;
      if (data.whatIfParams) DataStore._data.whatIfParams = data.whatIfParams;
      if (data.billCategories && Array.isArray(data.billCategories))
        DataStore._data.billCategories = data.billCategories.map(function (b) { b.name = sanitizeHtml(b.name); return b; });
    } else {
      mergeIntoDataStore(data);
    }
    DataStore.save();
    var active = document.querySelector('.page-section.active');
    if (active && typeof navigateTo === 'function')
      navigateTo(active.getAttribute('data-page') || 'overview');
    return { records: data.records.length, categories: data.categories.length };
  }

  var pendingSyncData = null;
  function confirmSyncMode(mode) {
    if (typeof closeModal === 'function') closeModal();
    if (!pendingSyncData) return;
    var el = document.getElementById('syncClientProgress');
    if (el) el.innerHTML = mode === 'replace'
      ? ('⏳ ' + __('lansync.status.replacing'))
      : ('⏳ ' + __('lansync.status.merging'));
    var r = receiveAndMerge(pendingSyncData, mode);
    pendingSyncData = null;
    if (r) {
      if (el) el.innerHTML = __('lansync.status.syncResult', r.records, r.categories);
      try { if (channel && channel.readyState === 'open') channel.send('SYNC_OK'); } catch (e) { /* ignore */ }
    }
  }

  function mergeIntoDataStore(incoming) {
    var cur = DataStore._data;
    if (!cur) return;
    var exist = {}; cur.records.forEach(function (r) { exist[r.id] = true; });
    incoming.records.forEach(function (r) {
      r.note = sanitizeHtml(r.note || '');
      if (exist[r.id]) {
        var i = cur.records.findIndex(function (x) { return x.id === r.id; });
        if (i !== -1) cur.records[i] = r;
      } else { cur.records.unshift(r); }
    });
    sortRecordsDesc(cur.records);
    var catIds = {}; cur.categories.forEach(function (c) { catIds[c.id] = true; });
    incoming.categories.forEach(function (c) {
      if (!catIds[c.id]) { c.name = sanitizeHtml(c.name); c.icon = sanitizeHtml(c.icon); cur.categories.push(c); catIds[c.id] = true; }
    });
    if (incoming.budgets) Object.assign(cur.budgets, incoming.budgets);
    if (incoming.categoryBudgets) Object.assign(cur.categoryBudgets, incoming.categoryBudgets);
    if (incoming.monthlyIncome) Object.assign(cur.monthlyIncome, incoming.monthlyIncome);
    if (incoming.billAmounts) Object.assign(cur.billAmounts, incoming.billAmounts);
    if (incoming.savingsTarget) cur.savingsTarget = incoming.savingsTarget;
    if (incoming.percentBase) cur.percentBase = incoming.percentBase;
    if (incoming.whatIfParams) cur.whatIfParams = incoming.whatIfParams;
    if (incoming.billCategories && Array.isArray(incoming.billCategories)) {
      var bIds = {}; cur.billCategories.forEach(function (b) { bIds[b.id] = true; });
      incoming.billCategories.forEach(function (b) {
        if (!bIds[b.id]) { b.name = sanitizeHtml(b.name); cur.billCategories.push(b); bIds[b.id] = true; }
      });
    }
  }

  var ui = {};

  ui.showOrError = function (html) {
    if (typeof showModal === 'function') { showModal(html); return; }
    var overlay = document.getElementById('modalOverlay');
    var content = document.getElementById('modalContent');
    if (overlay && content) {
      content.innerHTML = html;
      overlay.classList.add('open');
      overlay.onclick = function (e) { if (e.target === overlay) overlay.classList.remove('open'); };
    }
  };

  ui.close = function () {
    resetConnection();
    if (typeof closeModal === 'function') closeModal();
    else { var o = document.getElementById('modalOverlay'); if (o) o.classList.remove('open'); }
  };

  ui.showMenu = function () {
    ui.showOrError(
      '<div class="modal-title">' + __('lansync.menu.title') + '</div>' +
      '<p class="text-sm text-secondary mb-16">' + __('lansync.menu.description') + '</p>' +
      '<div class="flex flex-col gap-8">' +
      '<button class="btn btn-primary btn-block" onclick="SyncUI.startHost()">' + __('lansync.host.sendData') + '<br><span class="text-xs text-muted">' + __('lansync.host.sendDataDesc') + '</span></button>' +
      '<button class="btn btn-outline btn-block" onclick="SyncUI.startClient()">' + __('lansync.client.receiveData') + '<br><span class="text-xs text-muted">' + __('lansync.host.receiveDataDesc') + '</span></button>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="SyncUI.close()">' + __('lansync.common.cancel') + '</button></div>'
    );
  };

  ui.startHost = function () {
    var self = this;
    this._showHostWaiting();
    createHost({
      onConnect: function () {
        var el = document.getElementById('syncStatus');
        if (el) el.innerHTML = __('lansync.status.connectedSending');
      },
      onError: function (msg) {
        var el = document.getElementById('syncStatus');
        if (el) { el.innerHTML = '❌ ' + msg; el.style.color = 'var(--danger)'; }
      },
      onDataReceived: function (data) {
        if (data === 'SYNC_OK') {
          var el = document.getElementById('syncStatus');
          if (el) el.innerHTML = __('lansync.status.syncComplete');
        }
      }
    }).then(function (offerSdp) {
      self._showHostOffer(offerSdp);
    }).catch(function (err) {
      var el = document.getElementById('syncStatus');
      if (el) { el.innerHTML = '❌ ' + __('lansync.error.createFailed', err.message); el.style.color = 'var(--danger)'; }
    });
  };

  ui._showHostWaiting = function () {
    ui.showOrError(
      '<div class="modal-title">' + __('lansync.host.waiting') + '</div>' +
      '<p class="text-sm text-secondary mb-16">' + __('lansync.host.generatingCode') + '</p>' +
      '<div id="syncStatus" class="text-sm text-center text-muted">' + __('lansync.status.generating') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="SyncUI.close()">' + __('lansync.common.cancel') + '</button></div>'
    );
  };

  ui._showHostOffer = function (offerSdp) {
    ui.showOrError(
      '<div class="modal-title">' + __('lansync.host.sendData') + '</div>' +
      '<p class="text-sm text-secondary mb-16">' + __('lansync.host.instruction') + '</p>' +
      '<div class="input-group"><label class="input-label">' + __('lansync.host.step1') + '</label>' +
      '<textarea id="syncOfferText" class="input-field" readonly rows="5" style="font-size:0.65rem;font-family:monospace;white-space:pre;word-break:break-all;resize:vertical">' + sanitizeHtml(offerSdp) + '</textarea>' +
      '<button class="btn btn-outline btn-block mt-8" onclick="SyncUI.copyText(\'syncOfferText\')">' + __('lansync.host.copyCode') + '</button></div>' +
      '<div class="input-group" style="margin-top:16px"><label class="input-label">' + __('lansync.host.step2') + '</label>' +
      '<textarea id="syncAnswerInput" class="input-field" rows="4" style="font-size:0.65rem;font-family:monospace;white-space:pre;word-break:break-all;resize:vertical" placeholder="..."></textarea>' +
      '<button class="btn btn-primary btn-block mt-8" onclick="SyncUI.submitAnswer()">' + __('lansync.host.confirmConnect') + '</button></div>' +
      '<div id="syncStatus" class="text-sm text-center text-muted mt-8">' + __('lansync.status.waitingAnswer') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="SyncUI.close()">' + __('lansync.common.cancel') + '</button></div>'
    );
  };

  ui.submitAnswer = function () {
    var input = document.getElementById('syncAnswerInput');
    var status = document.getElementById('syncStatus');
    if (!input || !input.value.trim()) {
      if (status) { status.innerHTML = __('lansync.status.pasteFirst'); status.style.color = 'var(--danger)'; }
      return;
    }
    if (status) { status.innerHTML = __('lansync.status.establishingConnection'); status.style.color = ''; }
    acceptAnswer(input.value.trim()).then(function () {
      if (status) status.innerHTML = __('lansync.status.handshakeDone');
    }).catch(function (err) {
      if (status) { status.innerHTML = '❌ ' + __('lansync.error.connectFailed', err.message); status.style.color = 'var(--danger)'; }
    });
  };

  ui.startClient = function () {
    ui.showOrError(
      '<div class="modal-title">' + __('lansync.client.receiveData') + '</div>' +
      '<p class="text-sm text-secondary mb-16">' + __('lansync.client.instruction') + '</p>' +
      '<div class="input-group"><label class="input-label">' + __('lansync.client.pasteLabel') + '</label>' +
      '<textarea id="syncOfferInput" class="input-field" rows="5" style="font-size:0.65rem;font-family:monospace;white-space:pre;word-break:break-all;resize:vertical" placeholder="' + __('lansync.client.pastePlaceholder') + '"></textarea></div>' +
      '<button class="btn btn-primary btn-block" onclick="SyncUI.connectAsClient()">' + __('lansync.client.connectAndReceive') + '</button>' +
      '<div id="syncStatus" class="text-sm text-center text-muted mt-8"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="SyncUI.close()">' + __('lansync.common.cancel') + '</button></div>'
    );
  };

  ui.connectAsClient = function () {
    var input = document.getElementById('syncOfferInput');
    var status = document.getElementById('syncStatus');
    if (!input || !input.value.trim()) {
      if (status) { status.innerHTML = __('lansync.status.pasteOfferFirst'); status.style.color = 'var(--danger)'; }
      return;
    }
    if (status) { status.innerHTML = __('lansync.status.connecting'); status.style.color = ''; }
    ui._showClientAnswer();
    createClient(input.value.trim(), {
      onStateChange: function (s) {
        var el = document.getElementById('syncClientProgress');
        if (el) el.innerHTML = (s === 'connected') ? __('lansync.status.connected') : '⏳ ' + s;
      },
      onError: function (msg) {
        var el = document.getElementById('syncClientProgress');
        if (el) { el.innerHTML = '❌ ' + msg; el.style.color = 'var(--danger)'; }
      },
      onDataReceived: function (data) {
        var el = document.getElementById('syncClientProgress');
        if (el) el.innerHTML = __('lansync.status.receivedData');
        pendingSyncData = data;
        if (typeof showModal === 'function') {
          showModal(
            '<div class="modal-title">' + __('lansync.client.receivedModalTitle') + '</div>' +
            '<p class="text-sm text-secondary mb-16">' + __('lansync.client.selectImportMode') + '</p>' +
            '<button class="btn btn-primary btn-block mb-8" onclick="confirmSyncMode(\'replace\')">' + __('lansync.client.replaceData') + '</button>' +
            '<button class="btn btn-outline btn-block" onclick="confirmSyncMode(\'merge\')">' + __('lansync.client.mergeData') + '</button>' +
            '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('lansync.common.cancel') + '</button></div>'
          );
        }
      }
    }).then(function (answerSdp) {
      var el = document.getElementById('syncAnswerText');
      if (el) el.value = answerSdp;
      var p = document.getElementById('syncClientProgress');
      if (p) p.innerHTML = __('lansync.status.readyForAnswer');
    }).catch(function (err) {
      var p = document.getElementById('syncClientProgress');
      if (p) { p.innerHTML = '❌ ' + err.message; p.style.color = 'var(--danger)'; }
    });
  };

  ui._showClientAnswer = function () {
    ui.showOrError(
      '<div class="modal-title">' + __('lansync.client.receiveData') + '</div>' +
      '<p class="text-sm text-secondary mb-16">' + __('lansync.client.returnCodeInstruction') + '</p>' +
      '<div class="input-group"><label class="input-label">' + __('lansync.client.returnCodeLabel') + '</label>' +
      '<textarea id="syncAnswerText" class="input-field" readonly rows="4" style="font-size:0.65rem;font-family:monospace;white-space:pre;word-break:break-all;resize:vertical"></textarea>' +
      '<button class="btn btn-outline btn-block mt-8" onclick="SyncUI.copyText(\'syncAnswerText\')">' + __('lansync.client.copyReturnCode') + '</button></div>' +
      '<div id="syncClientProgress" class="text-sm text-center text-muted mt-16">' + __('lansync.status.establishing') + '</div>' +
      '<div id="syncClientStatus" class="text-sm text-center text-muted"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="SyncUI.close()">' + __('lansync.common.cancel') + '</button></div>'
    );
  };

  ui.copyText = function (textareaId) {
    var el = document.getElementById(textareaId);
    if (!el) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(function () {
        if (typeof showToast === 'function') showToast(__('lansync.common.copySuccess'));
      }).catch(function () { el.select(); document.execCommand('copy'); if (typeof showToast === 'function') showToast(__('lansync.common.copySuccess')); });
    } else { el.focus(); el.select(); document.execCommand('copy'); if (typeof showToast === 'function') showToast(__('lansync.common.copySuccess')); }
  };

  window.SyncUI = ui;
  window.confirmSyncMode = confirmSyncMode;
  window.LANSync = { open: function () { ui.showMenu(); }, sanitizeHtml: sanitizeHtml };

  window.addI18nEntries({
    'lansync.error.invalidDataNotObject': {
      zh: '数据格式无效：不是对象',
      en: 'Invalid data format: not an object'
    },
    'lansync.error.invalidDataNoRecords': {
      zh: '数据格式无效：缺少 records 数组',
      en: 'Invalid data format: missing records array'
    },
    'lansync.error.invalidDataNoCategories': {
      zh: '数据格式无效：缺少 categories 数组',
      en: 'Invalid data format: missing categories array'
    },
    'lansync.error.sendFailed': {
      zh: '发送失败：{0}',
      en: 'Send failed: {0}'
    },
    'lansync.error.channelError': {
      zh: '数据通道错误',
      en: 'Data channel error'
    },
    'lansync.error.connectFailedNetwork': {
      zh: '连接失败，请确认同一网络',
      en: 'Connection failed, please check you are on the same network'
    },
    'lansync.error.stateAbnormal': {
      zh: '状态异常，请重新开始',
      en: 'Abnormal state, please restart'
    },
    'lansync.error.jsonParseFailed': {
      zh: 'JSON 解析失败',
      en: 'JSON parse failed'
    },
    'lansync.error.noValidData': {
      zh: '无有效数据',
      en: 'No valid data'
    },
    'lansync.error.createFailed': {
      zh: '创建连接失败：{0}',
      en: 'Connection creation failed: {0}'
    },
    'lansync.error.connectFailed': {
      zh: '连接失败：{0}',
      en: 'Connection failed: {0}'
    },
    'lansync.status.connectedSending': {
      zh: '✅ 连接已建立，正在发送数据...',
      en: '✅ Connection established, sending data...'
    },
    'lansync.status.syncComplete': {
      zh: '✅ 对方已确认接收，同步完成！',
      en: '✅ Receiver confirmed, sync complete!'
    },
    'lansync.status.replacing': {
      zh: '⏳ 正在替换数据...',
      en: '⏳ Replacing data...'
    },
    'lansync.status.merging': {
      zh: '⏳ 正在合并数据...',
      en: '⏳ Merging data...'
    },
    'lansync.status.syncResult': {
      zh: '✅ 同步完成！收到 {0} 条记录、{1} 个分类',
      en: '✅ Sync complete! Received {0} records, {1} categories'
    },
    'lansync.status.generating': {
      zh: '⏳ 生成中...',
      en: '⏳ Generating...'
    },
    'lansync.status.waitingAnswer': {
      zh: '⏳ 等待对方返回连接码...',
      en: '⏳ Waiting for return code...'
    },
    'lansync.status.connecting': {
      zh: '⏳ 连接中...',
      en: '⏳ Connecting...'
    },
    'lansync.status.establishingConnection': {
      zh: '⏳ 建立连接中，请等待...',
      en: '⏳ Establishing connection, please wait...'
    },
    'lansync.status.handshakeDone': {
      zh: '⏳ 连接握手完成，等待数据通道打开...',
      en: '⏳ Handshake complete, waiting for data channel...'
    },
    'lansync.status.pasteFirst': {
      zh: '❌ 请先粘贴连接码',
      en: '❌ Please paste the connection code first'
    },
    'lansync.status.pasteOfferFirst': {
      zh: '❌ 请粘贴连接码',
      en: '❌ Please paste the connection code'
    },
    'lansync.status.connected': {
      zh: '✅ 已连接',
      en: '✅ Connected'
    },
    'lansync.status.receivedData': {
      zh: '📥 收到数据，请选择同步方式',
      en: '📥 Data received, please select a sync mode'
    },
    'lansync.status.readyForAnswer': {
      zh: '✅ 连接准备就绪，请在发送方输入上面返回的连接码，然后等待数据...',
      en: '✅ Connection ready, enter the return code on the sender device and wait for data...'
    },
    'lansync.status.establishing': {
      zh: '⏳ 正在建立连接...',
      en: '⏳ Establishing connection...'
    },
    'lansync.menu.title': {
      zh: '📶 局域网同步',
      en: '📶 LAN Sync'
    },
    'lansync.menu.description': {
      zh: '两台设备在<span style="font-weight:600">同一 Wi-Fi</span>下直连同步，数据不经过任何服务器。连接需要手动交换两段连接码，相当于双方互相确认身份。',
      en: 'Direct sync between two devices on the <span style="font-weight:600">same Wi-Fi</span> network. Data never touches any server. The connection requires manually exchanging two codes, like a mutual handshake.'
    },
    'lansync.host.sendData': {
      zh: '📤 发送数据',
      en: '📤 Send Data'
    },
    'lansync.host.sendDataDesc': {
      zh: '把本机数据发到另一台设备',
      en: 'Send data from this device to another device'
    },
    'lansync.host.receiveDataDesc': {
      zh: '从另一台设备接收数据',
      en: 'Receive data from another device'
    },
    'lansync.host.waiting': {
      zh: '📤 等待连接...',
      en: '📤 Waiting for connection...'
    },
    'lansync.host.generatingCode': {
      zh: '正在生成连接码...',
      en: 'Generating connection code...'
    },
    'lansync.host.instruction': {
      zh: '在另一台设备上选择"接收数据"，然后<strong>完整复制</strong>下面的连接码粘贴到那里',
      en: 'On the other device, choose "Receive Data", then <strong>copy</strong> the code below and paste it there'
    },
    'lansync.host.step1': {
      zh: '连接码第 1 步（发给对方）',
      en: 'Step 1 — Connection Code (send to the other device)'
    },
    'lansync.host.copyCode': {
      zh: '📋 复制连接码',
      en: '📋 Copy Code'
    },
    'lansync.host.step2': {
      zh: '连接码第 2 步（粘贴对方返回的）',
      en: 'Step 2 — Paste Return Code (paste the code from the other device)'
    },
    'lansync.host.confirmConnect': {
      zh: '✅ 确认连接',
      en: '✅ Confirm Connection'
    },
    'lansync.client.receiveData': {
      zh: '📥 接收数据',
      en: '📥 Receive Data'
    },
    'lansync.client.instruction': {
      zh: '在另一台设备上选择"发送数据"，然后把那边显示的连接码<strong>完整复制</strong>到下面',
      en: 'On the other device, choose "Send Data", then <strong>copy</strong> the displayed code and paste it below'
    },
    'lansync.client.pasteLabel': {
      zh: '粘贴发送方的连接码',
      en: 'Paste the sender\'s connection code'
    },
    'lansync.client.pastePlaceholder': {
      zh: '完整粘贴发送方的连接码...',
      en: 'Paste the full connection code...'
    },
    'lansync.client.connectAndReceive': {
      zh: '🔗 连接并接收',
      en: '🔗 Connect & Receive'
    },
    'lansync.client.receivedModalTitle': {
      zh: '📥 收到同步数据',
      en: '📥 Sync Data Received'
    },
    'lansync.client.selectImportMode': {
      zh: '选择数据导入方式：',
      en: 'Choose import method:'
    },
    'lansync.client.replaceData': {
      zh: '🔄 替换当前数据',
      en: '🔄 Replace current data'
    },
    'lansync.client.mergeData': {
      zh: '🔀 合并到当前数据',
      en: '🔀 Merge into current data'
    },
    'lansync.client.returnCodeInstruction': {
      zh: '把下面的返回码<strong>完整复制</strong>到发送方设备的"连接码第 2 步"处',
      en: '<strong>Copy</strong> the return code below to the "Step 2" field on the sender device'
    },
    'lansync.client.returnCodeLabel': {
      zh: '返回码（粘贴到发送方）',
      en: 'Return Code (paste on the sender device)'
    },
    'lansync.client.copyReturnCode': {
      zh: '📋 复制返回码',
      en: '📋 Copy Return Code'
    },
    'lansync.common.cancel': {
      zh: '取消',
      en: 'Cancel'
    },
    'lansync.common.copySuccess': {
      zh: '✅ 已复制',
      en: '✅ Copied'
    }
  });

})();
