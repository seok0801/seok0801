/* 마카오 가족여행 — 일정 카드 페이지
 * 지도 없이 일정을 카테고리(식사·간식·체험·명소·숙소·항공)별 카드로 보여 준다. 내용은 지도 페이지와 같은 data.js (window.TRIP_DATA) 를 그대로 쓴다.
 * 그래서 일정이 바뀌면 data.js 만 고치면 지도 페이지와 이 페이지가 함께 바뀐다. */
(function () {
  'use strict';
  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { $('s-loading').textContent = '일정 데이터(data.js)를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.'; return; }

  var QUIET = { nap: true, sleep: true };
  var SITE_NAMES = {
    'taipavillagemacau.com': '타이파 빌리지 공식 안내', 'macaotourism.gov.mo': '마카오 관광청 안내', 'guide.michelin.com': '미쉐린 가이드',
    'timeout.com': 'Time Out 소개(영문)', 'openrice.com': 'OpenRice 리뷰(영문)', 'macau-airport.com': '마카오 공항 공식',
    'venetianmacao.com': '베네시안 공식', 'londonermacao.com': '런더너 공식', 'studiocity-macau.com': '스튜디오 시티 공식',
    'cityofdreamsmacau.com': '시티 오브 드림즈 공식', 'wynnresortsmacau.com': '윈 팰리스 공식', 'grandlisboapalace.com': '그랜드 리스보아 팰리스 공식',
    'grandlisboa.com': '그랜드 리스보아 공식', 'lordstow.com': '로드 스토우 공식', 'parisianmacao.com': '파리지앵 공식'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toMin(t) { var p = String(t || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function plan() { return D.plans[0]; }
  // 맛집 메뉴에만 있는 장소도 이름·구글 지도를 찾을 수 있게
  var EAT_PLACES = {};
  (D.eats || []).forEach(function (e) { if (e.id && !D.places[e.id]) EAT_PLACES[e.id] = e; });
  function place(id) { return D.places[id] || EAT_PLACES[id]; }
  function onMap(id) { var p = place(id); return !!(p && !p.offMap && typeof p.lat === 'number'); }
  function shortName(n) { return String(n).replace(/\s*\([^)]*\)\s*$/, '') || n; }
  function nowMacau() {
    var q = /[?&]today=([0-9T:\-]+)/.exec(location.search);   // 시험용: ?today=2026-12-28T11:00
    if (q) return q[1].length === 10 ? q[1] + 'T08:00' : q[1];
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16);
  }

  /* 돈 */
  var RATE = (D.krw && D.krw.rate) || 0;
  function mopShort(c) { return c.min === c.max ? c.min.toLocaleString() : c.min.toLocaleString() + '~' + c.max.toLocaleString(); }
  function won(c) {
    if (!RATE) return '';
    var a = Math.round(c.min * RATE / 1000) * 1000, b = Math.round(c.max * RATE / 1000) * 1000;
    return '약 ' + (a === b ? a.toLocaleString() : a.toLocaleString() + '~' + b.toLocaleString()) + '원';
  }
  function items(date) {
    var out = [];
    plan().items.forEach(function (it, i) { if (it.date === date) out.push({ it: it, i: i }); });
    out.sort(function (a, b) { return (toMin(a.it.time) - toMin(b.it.time)) || (a.i - b.i); });
    return out.map(function (x) { return x.it; });
  }
  /* 링크 */
  function link(url, text, cls, sponsored) {
    return '<a class="' + (cls || 's-btn') + '" href="' + esc(url) + '" target="_blank" rel="' + (sponsored ? 'sponsored ' : '') + 'noopener noreferrer">' + esc(text) + '</a>';
  }
  function siteLabel(url, label) {
    var host = ''; try { host = new URL(url).hostname.replace(/^www\./, '').replace(/^hk\./, ''); } catch (e) { /* 무시 */ }
    if (!label || /소개 페이지/.test(label) || label === '공식' || label === '공식 안내') return '🌐 ' + (SITE_NAMES[host] || host || '소개 페이지');
    return '🌐 ' + label;
  }
  function mapsLink(id, label) {
    var p = place(id);
    var q = p.mapQuery || (p.lat + ',' + p.lng);
    var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    return '<a class="s-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-ll="' + p.lat + ',' + p.lng + '">' + esc(label || '📍 구글 지도') + '</a>';
  }
  function bookingButton(b) {
    var must = b.level === '필수';
    var label = b.aff ? '🎫 예약하기 (' + b.affBy + ')' : '🎫 ' + (b.buttonLabel || '예약하기');
    return link(b.aff || b.url, label + (must ? ' · 필수' : ''), 's-btn book' + (must ? ' must' : ''), !!b.aff);
  }

  /* 아이폰: 구글 지도 버튼은 구글 지도 앱으로 바로 연다 (지도 페이지와 같은 방식). 앱이 안 열리면 2.5초 뒤 웹으로 */
  var IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.addEventListener('click', function (e) {
    if (!IS_IOS) return;
    var a = e.target.closest && e.target.closest('a[href*="google."]');
    if (!a) return;
    var u; try { u = new URL(a.href); } catch (er) { return; }
    var q = u.searchParams.get('query');
    if (!q || u.pathname.indexOf('/maps') !== 0) return;
    var ll = a.getAttribute('data-ll');
    var app = 'comgooglemaps://?q=' + encodeURIComponent(q) + (ll ? '&center=' + ll + '&zoom=18' : '');
    e.preventDefault();
    var web = a.href, left = false;
    var mark = function () { left = true; };
    var onVis = function () { if (document.hidden) left = true; };
    window.addEventListener('blur', mark); window.addEventListener('pagehide', mark); document.addEventListener('visibilitychange', onVis);
    window.location.href = app;
    setTimeout(function () {
      window.removeEventListener('blur', mark); window.removeEventListener('pagehide', mark); document.removeEventListener('visibilitychange', onVis);
      if (!left && !document.hidden && document.hasFocus()) window.open(web, '_blank', 'noopener');
    }, 2500);
  });

  /* ---------- 카테고리 ----------
   * 날짜·시간 순서 대신 '무엇을 하는지'로 묶는다. 이동(택시·도보)과 취침은 빼고,
   * 호텔은 호텔마다 카드 한 장(체크인·조식·체크아웃을 그 안에 정리) */
  var CATS = [
    { id: 'meal', icon: '🍽️', name: '식사', desc: '예약한 저녁과 동선 위 맛집' },
    { id: 'snack', icon: '🥧', name: '간식·카페', desc: '에그타르트·쿠키·밀크티' },
    { id: 'play', icon: '🎢', name: '체험·놀이', desc: '아이와 함께 타고 놀고 보는 곳' },
    { id: 'sight', icon: '📸', name: '명소 탐방', desc: '광장·성당·포토 스팟' },
    { id: 'stay', icon: '🏨', name: '숙소', desc: '묵는 호텔' },
    { id: 'air', icon: '✈️', name: '항공·공항', desc: '대한항공 왕복' }
  ];
  var PLAY_RE = /스카이캡|곤돌라|관람차|수영장|워터파크|키즈시티|판다|공연|분수쇼/;
  function catOf(it) {
    if (it.kind === 'move' || QUIET[it.kind]) return '';
    var types = (it.places || []).map(function (id) { return (place(id) || {}).type; });
    if (it.kind === 'flight' || types.indexOf('airport') >= 0) return 'air';
    if (it.kind === 'hotel' || (it.kind === 'meal' && types[0] === 'hotel')) return 'stay';
    if (it.kind === 'meal') return 'meal';
    if (it.kind === 'snack') return 'snack';
    if (PLAY_RE.test(it.title) || types.some(function (t) { return t === 'kids' || t === 'show' || t === 'hotel'; })) return 'play';
    return 'sight';
  }
  /* 제목 속 시각(예: '(16:30)', ', 09:00 짐 정리')을 지운다 */
  function cleanTitle(t) {
    return String(t)
      .replace(/\s*\([^)]*\d{1,2}:\d{2}[^)]*\)/g, '')
      .replace(/\s*[,·]\s*[^,·]*\d{1,2}:\d{2}[^,·]*/g, '')
      .replace(/^(이른 |늦은 )?(아침|점심|저녁|간식)\s*:\s*/, '')
      .replace(/\s*\d{1,2}:\d{2}\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /* ---------- 카드 ---------- */
  function actions(it, linked, b) {
    var acts = [];
    if (b) acts.push(bookingButton(b));
    var sh = it.shuttle && D.shuttles && D.shuttles[it.shuttle];
    if (sh) acts.push(link(sh.url, '🚌 셔틀 시간표'));
    var many = (it.places || []).length > 1;
    (it.places || []).forEach(function (id) {
      var p = place(id);
      if (!p || !p.url || linked[id] || (b && b.url === p.url)) return;
      linked[id] = true;
      acts.push(link(p.url, many ? '🌐 ' + shortName(p.name) + ' 소개' : siteLabel(p.url, p.urlLabel)));
    });
    (it.places || []).filter(onMap).forEach(function (id) {
      if (linked['gm-' + id]) return; linked['gm-' + id] = true;
      acts.push(mapsLink(id, many ? '📍 ' + shortName(place(id).name) : ''));
    });
    return acts;
  }
  function tipsBlock(tips, extra) {
    var more = (tips.length ? '<ul class="s-tips">' + tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') + (extra || '');
    if (!more) return '';
    return '<details class="s-more"><summary>' + (tips.length ? '💡 꿀팁 ' + tips.length + '개 보기' : '💰 요금 자세히') + '</summary>' + more + '</details>';
  }

  function card(it, icon) {
    var linked = {};
    var names = (it.places || []).map(function (id) { return place(id) ? esc(place(id).name) : esc(id); });
    var chips = [];
    if (it.cost) chips.push('<span class="s-chip">💰 1가족 MOP ' + mopShort(it.cost) + (RATE ? ' · ' + won(it.cost) : '') + (it.cost.optional ? ' (선택)' : '') + '</span>');
    if (it.napOk) chips.push('<span class="s-chip nap">😴 유모차 낮잠 가능</span>');
    var b = it.booking && D.bookings[it.booking];
    if (b) chips.push('<span class="s-chip book">🎫 예약 ' + esc(b.level || '') + '</span>');
    var extra = (it.cost && it.cost.note ? '<p class="s-fine">💰 ' + esc(it.cost.note) + '</p>' : '') + (b && b.kids ? '<p class="s-fine">' + esc(b.kids) + '</p>' : '');
    var acts = actions(it, linked, b);
    return '<li class="s-card">' +
      '<h3>' + icon + ' ' + esc(cleanTitle(it.title)) + '</h3>' +
      (names.length ? '<p class="s-place">📍 ' + names.join(' · ') + '</p>' : '') +
      (chips.length ? '<div class="s-chips">' + chips.join('') + '</div>' : '') +
      (it.warn ? '<p class="s-warn">⚠️ ' + esc(it.warn) + '</p>' : '') +
      (it.memo ? '<p class="s-memo">' + esc(it.memo) + '</p>' : '') +
      tipsBlock(it.tips || [], extra) +
      (acts.length ? '<div class="s-acts">' + acts.join('') + '</div>' : '') +
      '</li>';
  }

  /* 호텔 카드: 같은 호텔의 체크인·조식·체크아웃 등을 한 장에 */
  function hotelCard(id, list, title, chip) {
    var p = place(id) || { name: id }, linked = {};
    var steps = list.map(function (it) { return '<li>' + esc(cleanTitle(it.title)) + '</li>'; }).join('');
    var tips = [], memos = [];
    list.forEach(function (it) { (it.tips || []).forEach(function (t) { if (tips.indexOf(t) < 0) tips.push(t); }); if (it.memo) memos.push(it.memo); });
    var acts = [];
    list.forEach(function (it) { acts = acts.concat(actions(it, linked, it.booking && D.bookings[it.booking])); });
    return '<li class="s-card">' +
      '<h3>' + (title || '🏨 ' + esc(p.name)) + '</h3>' +
      (chip ? '<div class="s-chips"><span class="s-chip">' + chip + '</span></div>' : '') +
      '<ul class="s-steps">' + steps + '</ul>' +
      (p.baby && !title ? '<p class="s-fine">👶 ' + esc(p.baby) + '</p>' : '') +
      memos.map(function (m) { return '<p class="s-memo">' + esc(m) + '</p>'; }).join('') +
      tipsBlock(tips) +
      (acts.length ? '<div class="s-acts">' + acts.join('') + '</div>' : '') +
      '</li>';
  }

  function render() {
    var groups = {};
    CATS.forEach(function (c) { groups[c.id] = []; });
    D.days.forEach(function (d) { items(d.date).forEach(function (it) { var c = catOf(it); if (c) groups[c].push(it); }); });

    var html = '';
    CATS.forEach(function (c) {
      var list = groups[c.id], cards = '', count = list.length;
      if (!count) return;
      if (c.id === 'stay') {
        var byHotel = {}, order = [];
        list.forEach(function (it) {
          var h = (it.places || [])[0];
          if (!byHotel[h]) { byHotel[h] = []; order.push(h); }
          byHotel[h].push(it);
        });
        cards = order.map(function (h) { return hotelCard(h, byHotel[h]); }).join('');
        count = order.length;
      } else if (c.id === 'air') {
        // 항공: 가는 편·오는 편 두 장으로 묶는다
        var first = D.days[0].date;
        var go = list.filter(function (it) { return it.date === first; }), back = list.filter(function (it) { return it.date !== first; });
        cards = (go.length ? hotelCard('icn', go, '🛫 가는 편 · 대한항공 KE2015', '인천(T2) → 마카오') : '') +
          (back.length ? hotelCard('mfm', back, '🛬 오는 편 · 대한항공 KE2016', '마카오 → 인천(T2)') : '');
        count = (go.length ? 1 : 0) + (back.length ? 1 : 0);
      } else {
        cards = list.map(function (it) { return card(it, c.icon); }).join('');
      }
      html += '<section class="s-cat" id="c-' + c.id + '">' +
        '<div class="s-cathead"><span class="s-caticon">' + c.icon + '</span><div><h2>' + c.name + ' <small>' + count + (c.id === 'air' ? '편' : '곳') + '</small></h2>' +
        '<p>' + esc(c.desc) + '</p></div></div>' +
        '<ul class="s-list">' + cards + '</ul></section>';
    });
    $('s-main').innerHTML = html;
    $('s-tabs').innerHTML = CATS.filter(function (c) { return groups[c.id].length; }).map(function (c) {
      return '<a href="#c-' + c.id + '" data-c="' + c.id + '"><b>' + c.icon + '</b><small>' + c.name.split('·')[0].replace(' 탐방', '') + '</small></a>';
    }).join('');
  }

  /* D-day (마카오 시간 기준) */
  function dday() {
    var today = nowMacau().slice(0, 10);
    var first = D.days[0].date, last = D.days[D.days.length - 1].date;
    var dd = Math.round((Date.parse(first) - Date.parse(today)) / 86400000);
    var b = $('s-dday');
    b.textContent = dd > 0 ? 'D-' + dd : dd === 0 ? 'D-DAY ✈️' : today <= last ? (1 - dd) + '일차' : '다녀왔어요';
    b.hidden = false;
  }

  /* 위 탭: 지금 보고 있는 카테고리를 표시 */
  function spy() {
    var top = $('s-top').offsetHeight + 10, cur = '';
    document.querySelectorAll('.s-cat').forEach(function (el) { if (!cur || el.getBoundingClientRect().top - top <= 1) cur = el.id.slice(2); });
    document.querySelectorAll('#s-tabs a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-c') === cur); });
  }

  render();
  dday();
  document.documentElement.style.setProperty('--top-h', $('s-top').offsetHeight + 'px');
  window.addEventListener('scroll', spy, { passive: true });
  window.addEventListener('resize', function () { document.documentElement.style.setProperty('--top-h', $('s-top').offsetHeight + 'px'); spy(); });
  spy();
  $('s-totop').addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(function () {});
})();
