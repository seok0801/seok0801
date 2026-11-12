/* 마카오 가족여행 — 구글 지도판 (시험판)
 * 일정 내용은 3D 지도판과 같은 data.js 를 씁니다. 지도만 구글 지도입니다. */
(function () {
  'use strict';
  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { note('일정 데이터(data.js)를 불러오지 못했습니다.'); return; }

  var ICONS = { hotel: '🏨', kids: '🧸', sight: '📸', shop: '🛍️', oldtown: '🏛️', transport: '🚌', airport: '✈️', food: '🍽️', snack: '🥧' };
  var TRANSPORT = { shuttle: '🚌 무료 셔틀', taxi: '🚕 택시', walk: '🚶 도보' };
  var QUIET = { nap: true, sleep: true };
  var state = { day: 'all' };
  var map = null, markers = {}, lines = [], AdvancedMarker = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function note(html) { var n = $('g-note'); n.innerHTML = html; n.hidden = false; }
  function plan() { return D.plans[0]; }
  function dayInfo(date) { return D.days.filter(function (d) { return d.date === date; })[0]; }
  function items(date) {
    return plan().items.filter(function (it) { return date === 'all' || it.date === date; })
      .slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }
  function onMap(id) { var p = D.places[id]; return !!(p && !p.offMap && typeof p.lat === 'number'); }
  function link(url, text) { return '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>'; }

  /* ---------- 날짜 탭 ---------- */
  function renderTabs() {
    var html = '<button type="button" class="tab" role="tab" data-day="all" aria-selected="' + (state.day === 'all') + '">전체</button>';
    D.days.forEach(function (d) {
      var m = /^(\d+)\/(\d+)\((.+)\)$/.exec(d.label);
      var inner = m ? '<span class="d">' + m[2] + '</span><span class="w">' + m[3] + '</span>' : esc(d.label);
      html += '<button type="button" class="tab" role="tab" data-day="' + d.date + '" style="--day-color:' + d.color +
        '" aria-label="' + esc(d.label) + '" aria-selected="' + (state.day === d.date) + '">' + inner + '</button>';
    });
    $('tabs').innerHTML = html;
  }

  /* ---------- 아래에서 올라오는 창 ---------- */
  function openSheet(title, html, cls) {
    $('sheet-title').textContent = title;
    $('sheet-body').innerHTML = html;
    $('sheet').className = cls || 'place';
    $('sheet').hidden = false;
    $('sheet-body').scrollTop = 0;
  }
  function itemHtml(it, withDay) {
    var d = dayInfo(it.date), h = '<div class="g-item">';
    h += '<div class="t">' + (withDay && d ? '<span class="day" style="background:' + d.color + '">' + esc(d.label) + '</span>' : '') +
      esc(it.time + (it.end ? '~' + it.end : '')) + ' · ' + esc(it.title) + '</div>';
    if (it.warn) h += '<div class="warn">확인 필요: ' + esc(it.warn) + '</div>';
    if (it.transport && TRANSPORT[it.transport]) h += '<p>' + TRANSPORT[it.transport] + '</p>';
    if (it.cost) h += '<p>예상 비용(1가족): MOP ' + it.cost.min + (it.cost.max !== it.cost.min ? '~' + it.cost.max : '') + (it.cost.note ? ' · ' + esc(it.cost.note) : '') + '</p>';
    if (it.memo) h += '<p>' + esc(it.memo) + '</p>';
    if (it.tips && it.tips.length) h += '<ul>' + it.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    var bk = it.booking && D.bookings[it.booking];
    if (bk && bk.url) h += '<div class="g-links">' + link(bk.url, '🎟️ ' + (bk.name || '예약') + ' 예약') + '</div>';
    return h + '</div>';
  }
  function showPlace(id) {
    var p = D.places[id];
    var list = items(state.day).filter(function (it) { return (it.places || []).indexOf(id) >= 0 && it.kind !== 'move'; });
    var h = '<p class="g-meta">' + esc([p.note, p.hours].filter(Boolean).join(' · ')) + '</p>';
    h += '<div class="g-links">' + link('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.lat + ',' + p.lng), '📍 구글 지도 앱에서 열기') +
      (p.url ? link(p.url, p.urlLabel || '공식 안내') : '') + '</div>';
    h += list.map(function (it) { return itemHtml(it, true); }).join('') || '<p class="g-meta">이 날짜에는 이 장소의 일정이 없습니다.</p>';
    openSheet((ICONS[p.type] || '📍') + ' ' + p.name, h, 'place');
    Object.keys(markers).forEach(function (k) { markers[k].content.classList.toggle('on', k === id); });
    if (map) { map.panTo({ lat: p.lat, lng: p.lng }); if (map.getZoom() < 16) map.setZoom(16); }
  }
  function showList() {
    var h = '', last = '';
    items(state.day).forEach(function (it) {
      if (it.date !== last) { last = it.date; var d = dayInfo(it.date); h += '<h3 class="g-day" style="color:' + d.color + '">' + esc(d.label) + ' · ' + esc(d.summary) + '</h3>'; }
      var target = (it.places || []).filter(onMap).pop() || '';
      h += '<button type="button" class="g-row' + (QUIET[it.kind] ? ' quiet' : '') + '" data-place="' + esc(target) + '"><span class="time">' + esc(it.time) + '</span> ' +
        esc(it.title) + (it.warn ? ' <span class="warn" style="color:#b45309">⚠</span>' : '') + '</button>';
    });
    openSheet(state.day === 'all' ? '전체 일정' : dayInfo(state.day).label + ' 일정', h, 'list');
  }

  /* ---------- 지도 위 마커와 동선 ---------- */
  function draw(fit) {
    if (!map) return;
    Object.keys(markers).forEach(function (k) { markers[k].map = null; });
    lines.forEach(function (l) { l.setMap(null); });
    markers = {}; lines = [];
    var colorOf = {}, order = [];
    items(state.day).forEach(function (it) {
      var d = dayInfo(it.date);
      (it.places || []).forEach(function (id) { if (onMap(id) && !colorOf[id]) { colorOf[id] = d.color; order.push(id); } });
    });
    var bounds = new google.maps.LatLngBounds();
    order.forEach(function (id) {
      var p = D.places[id], el = document.createElement('div');
      el.className = 'mk'; el.style.setProperty('--mk-color', colorOf[id]); el.textContent = ICONS[p.type] || '📍';
      var mk = new AdvancedMarker({ map: map, position: { lat: p.lat, lng: p.lng }, content: el, title: p.name, gmpClickable: true });
      mk.addEventListener('gmp-click', function () { showPlace(id); });
      markers[id] = mk; bounds.extend({ lat: p.lat, lng: p.lng });
    });
    D.days.forEach(function (d) {
      if (state.day !== 'all' && state.day !== d.date) return;
      var path = [];
      items(d.date).forEach(function (it) {
        (it.places || []).forEach(function (id) {
          if (!onMap(id)) return;
          var p = D.places[id], prev = path[path.length - 1];
          if (!prev || prev.lat !== p.lat || prev.lng !== p.lng) path.push({ lat: p.lat, lng: p.lng });
        });
      });
      if (path.length > 1) lines.push(new google.maps.Polyline({ map: map, path: path, strokeColor: d.color, strokeOpacity: .85, strokeWeight: 4 }));
    });
    if (fit && order.length) map.fitBounds(bounds, { top: 130, bottom: 90, left: 30, right: 30 });
  }

  /* ---------- 시작 ---------- */
  function start() {
    Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]).then(function (libs) {
      AdvancedMarker = libs[1].AdvancedMarkerElement;
      map = new libs[0].Map($('map'), {
        center: { lat: D.map.center[1], lng: D.map.center[0] }, zoom: 13,
        mapId: 'DEMO_MAP_ID',                 // 마커를 그리는 데 필요한 지도 모양 이름 (구글 기본 시험용)
        disableDefaultUI: true, zoomControl: false, gestureHandling: 'greedy', clickableIcons: true,
        restriction: D.map.bounds ? { latLngBounds: { west: D.map.bounds[0][0], south: D.map.bounds[0][1], east: D.map.bounds[1][0], north: D.map.bounds[1][1] } } : undefined
      });
      draw(true);
    }).catch(function () { failed(); });
  }
  function failed() {
    note('<strong>구글 지도를 불러오지 못했습니다.</strong><br>열쇠(API 키)의 하루 사용량이 끝났거나, 이 주소에서 쓸 수 없게 설정되어 있을 수 있습니다. ' +
      '일정은 아래 ☰ 일정에서 볼 수 있고, <a href="./index.html">3D 지도판</a>은 그대로 열립니다. ' +
      '<button type="button" class="btn" id="g-reset" style="margin-top:8px">열쇠 다시 입력</button>');
    var r = $('g-reset'); if (r) r.addEventListener('click', function () { try { localStorage.removeItem(KEY_STORE); } catch (e) { /* 무시 */ } location.reload(); });
  }
  window.gm_authFailure = failed;            // 열쇠가 거절되면 구글이 이 함수를 부른다
  window.__gmapReady = start;

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    state.day = b.getAttribute('data-day'); renderTabs(); $('sheet').hidden = true; draw(true);
  });
  $('btn-list').addEventListener('click', showList);
  $('sheet-close').addEventListener('click', function () { $('sheet').hidden = true; });
  $('sheet-body').addEventListener('click', function (e) {
    var r = e.target.closest('.g-row'); if (!r) return;
    var id = r.getAttribute('data-place'); if (id && markers[id]) showPlace(id);
  });
  renderTabs();

  /* 구글 지도 열쇠(API 키)는 공개 저장소에 적지 않는다.
   * 처음 한 번 이 페이지에서 입력하면 그 휴대폰(브라우저)에만 저장된다. 주소 끝에 ?key=열쇠 를 붙여 열어도 된다. */
  var KEY_STORE = 'macau-gmap-key';
  function savedKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function saveKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch (e) { /* 저장 못 하면 이번에만 쓴다 */ } }
  var fromUrl = new URLSearchParams(location.search).get('key');
  if (fromUrl) { saveKey(fromUrl); history.replaceState(null, '', location.pathname); }
  var key = fromUrl || savedKey();
  if (!key) {
    note('<strong>구글 지도 열쇠(API 키)를 한 번 입력해 주세요.</strong><br>이 휴대폰에만 저장되고 다른 곳에는 올라가지 않습니다.' +
      '<form id="g-key" style="display:flex;gap:6px;margin-top:8px"><input name="k" placeholder="AIza로 시작하는 키" autocomplete="off" style="flex:1;min-width:0;padding:8px;border-radius:8px;border:0">' +
      '<button class="btn primary" type="submit">저장</button></form>');
    $('g-key').addEventListener('submit', function (e) {
      e.preventDefault();
      var k = e.target.k.value.trim(); if (!k) return;
      saveKey(k); location.reload();
    });
    return;
  }
  var s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&language=ko&region=KR&loading=async&callback=__gmapReady';
  s.async = true; s.onerror = failed;
  document.head.appendChild(s);
})();
