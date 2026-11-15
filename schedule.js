/* 마카오 가족여행 — 일정 카드 페이지
 * 지도 없이 날짜별 일정을 카드로 보여 준다. 내용은 지도 페이지와 같은 data.js (window.TRIP_DATA) 를 그대로 쓴다.
 * 그래서 일정이 바뀌면 data.js 만 고치면 지도 페이지와 이 페이지가 함께 바뀐다. */
(function () {
  'use strict';
  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { $('s-loading').textContent = '일정 데이터(data.js)를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.'; return; }

  var KIND_ICONS = { flight: '✈️', hotel: '🏨', activity: '⭐', meal: '🍽️', snack: '🥧', nap: '💤', sleep: '🌙', move: '➡️' };
  var TRANSPORT = { shuttle: '🚌 무료 셔틀', taxi: '🚕 택시', walk: '🚶 도보' };
  var QUIET = { nap: true, sleep: true };
  var EAT_KIND = { food: '🍜', cafe: '☕', dessert: '🍮', bakery: '🥐', photo: '📸' };
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
  function dayCost(date) {
    var t = { min: 0, max: 0 };
    items(date).forEach(function (it) { var c = it.cost; if (c && !c.optional) { t.min += c.min; t.max += c.max; } });
    return t;
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

  /* 주의 표시 */
  function warnings(it) {
    var R = D.rhythm || {}, out = [];
    if (it.kind === 'move' || QUIET[it.kind]) return out;
    if (!it.rhythmOk) {
      if (it.kind === 'meal' && it.meal === 'dinner' && R.dinnerLatest && toMin(it.time) > toMin(R.dinnerLatest)) out.push('아이 리듬: 저녁 시작이 ' + R.dinnerLatest + '보다 늦음');
      else if (R.backToHotel && toMin(it.end || it.time) > toMin(R.backToHotel)) out.push('아이 리듬: ' + R.backToHotel + ' 이후에 끝남');
    }
    var wd = new Date(it.date + 'T12:00:00').getDay();
    (it.places || []).forEach(function (id) {
      var p = place(id); if (!p) return;
      if ((p.closedWeekdays || []).indexOf(wd) >= 0 || (p.closedDates || []).indexOf(it.date) >= 0) out.push('휴무 주의: ' + p.name);
      if (it.kind === 'activity' || it.kind === 'meal' || it.kind === 'snack') {
        if (p.open && toMin(it.time) < toMin(p.open)) out.push('영업시간: ' + shortName(p.name) + ' ' + p.open + '에 문을 엶');
        else if (p.close && toMin(it.end || it.time) > toMin(p.close)) out.push('영업시간: ' + shortName(p.name) + ' ' + p.close + '에 문을 닫음');
      }
    });
    if (it.warn) out.push(it.warn);
    return out;
  }

  /* ---------- 카드 ---------- */
  function moveRow(it) {
    var t = TRANSPORT[it.transport] || '➡️ 이동';
    var cost = it.cost ? ' · 💰 MOP ' + mopShort(it.cost) : '';
    var memo = it.memo ? '<span class="s-move-memo">' + esc(it.memo) + '</span>' : '';
    var tips = (it.tips || []).length ? '<span class="s-move-memo">' + it.tips.map(esc).join(' ') + '</span>' : '';
    return '<li class="s-item s-move" data-t="' + toMin(it.time) + '" data-e="' + toMin(it.end || it.time) + '">' +
      '<span class="s-move-time">' + esc(it.time) + '</span>' +
      '<div class="s-move-body"><span class="s-move-kind">' + t + cost + '</span> ' + esc(it.title) + memo + tips + '</div></li>';
  }

  function card(it, linked) {
    if (it.kind === 'move') return moveRow(it);
    var quiet = !!QUIET[it.kind];
    var names = (it.places || []).map(function (id) { return place(id) ? esc(place(id).name) : esc(id); });
    var chips = [];
    if (it.transport && TRANSPORT[it.transport]) chips.push('<span class="s-chip">' + TRANSPORT[it.transport] + '</span>');
    if (it.cost) chips.push('<span class="s-chip">💰 MOP ' + mopShort(it.cost) + (RATE ? ' · ' + won(it.cost) : '') + (it.cost.optional ? ' (선택)' : '') + '</span>');
    if (it.napOk) chips.push('<span class="s-chip nap">😴 유모차·차에서 낮잠</span>');
    var b = it.booking && D.bookings[it.booking];
    if (b) chips.push('<span class="s-chip book">🎫 예약 ' + esc(b.level || '') + '</span>');

    var warns = warnings(it).map(function (w) { return '<p class="s-warn">⚠️ ' + esc(w) + '</p>'; }).join('');
    var memo = it.memo ? '<p class="s-memo">' + esc(it.memo) + '</p>' : '';
    // 꿀팁·요금 설명은 접어 두고 '💡 꿀팁 보기'로 펼친다 (카드가 짧아 한눈에 훑기 쉽다)
    var more = '';
    if ((it.tips || []).length) more += '<ul class="s-tips">' + it.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (it.cost && it.cost.note) more += '<p class="s-fine">💰 ' + esc(it.cost.note) + '</p>';
    if (b && b.kids) more += '<p class="s-fine">' + esc(b.kids) + '</p>';
    var label = (it.tips || []).length ? '💡 꿀팁 ' + it.tips.length + '개 보기' : '💰 요금 자세히';
    var detail = memo + (more ? '<details class="s-more"><summary>' + label + '</summary>' + more + '</details>' : '');

    var acts = [];
    if (b) acts.push(bookingButton(b));
    var sh = it.shuttle && D.shuttles && D.shuttles[it.shuttle];
    if (sh) acts.push(link(sh.url, '🚌 셔틀 시간표'));
    if (!quiet) {
      var many = (it.places || []).length > 1;
      (it.places || []).forEach(function (id) {
        var p = place(id);
        if (!p || !p.url || linked[id] || (b && b.url === p.url)) return;
        linked[id] = true;
        acts.push(link(p.url, many ? '🌐 ' + shortName(p.name) + ' 소개' : siteLabel(p.url, p.urlLabel)));
      });
      var ons = (it.places || []).filter(onMap);
      ons.forEach(function (id) { acts.push(mapsLink(id, ons.length > 1 ? '📍 ' + shortName(place(id).name) : '')); });
    }

    return '<li class="s-item s-card' + (quiet ? ' quiet' : '') + '" data-t="' + toMin(it.time) + '" data-e="' + toMin(it.end || it.time) + '">' +
      '<div class="s-time"><b>' + esc(it.time) + '</b>' + (it.end ? '<small>~' + esc(it.end) + '</small>' : '') + '</div>' +
      '<div class="s-body">' +
        '<h3>' + (KIND_ICONS[it.kind] || '') + ' ' + esc(it.title) + '</h3>' +
        (names.length ? '<p class="s-place">📍 ' + names.join(' · ') + '</p>' : '') +
        (chips.length ? '<div class="s-chips">' + chips.join('') + '</div>' : '') +
        warns + detail +
        (acts.length ? '<div class="s-acts">' + acts.join('') + '</div>' : '') +
      '</div></li>';
  }

  function daySection(d, idx) {
    var c = dayCost(d.date);
    var R = D.rainPlans && D.rainPlans[d.date];
    var prep = (plan().prep || {})[d.date];
    var html = '<section class="s-day" id="d-' + d.date + '" style="--day:' + d.color + '">' +
      '<div class="s-dayhead"><div class="s-daynum">' + (idx + 1) + '일차</div>' +
      '<h2>' + esc(d.label) + '</h2>' + (d.summary ? '<p class="s-sum">' + esc(d.summary) + '</p>' : '') +
      '<div class="s-daychips">' + (c.max > 0 ? '<span>💰 1가족 MOP ' + mopShort(c) + (RATE ? ' · ' + won(c) : '') + '</span>' : '') +
      (D.weather && D.weather.normal ? '<span>🌡️ 낮 20° · 밤 14° (평년)</span>' : '') + '</div></div>';
    if (prep && prep.length) html += '<details class="s-box"><summary>🎒 오늘의 준비물 ' + prep.length + '가지</summary><ul>' + prep.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
    if (R && R.length) html += '<details class="s-box"><summary>☔ 비 오면 이렇게</summary><ul>' + R.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
    var linked = {};
    html += '<ol class="s-list">' + items(d.date).map(function (it) { return card(it, linked); }).join('') + '</ol></section>';
    return html;
  }

  function render() {
    $('s-main').innerHTML = D.days.map(daySection).join('');
    $('s-tabs').innerHTML = D.days.map(function (d) {
      var m = /^(\d+)\/(\d+)\((.+)\)$/.exec(d.label);
      return '<a href="#d-' + d.date + '" data-d="' + d.date + '" style="--day:' + d.color + '">' + (m ? '<b>' + m[2] + '</b><small>' + m[3] + '</small>' : esc(d.label)) + '</a>';
    }).join('');
    var R = D.rhythm || {};
    if (R.breakfastStart) $('s-rhythm').textContent = '아이 리듬: 조식 ' + R.breakfastStart + ' · 낮잠 ' + (R.napNote || '') + ' · 저녁 ' + R.dinnerStart + ' · ' + R.backToHotel + ' 호텔 복귀 · ' + R.bedtime + ' 취침';
  }

  /* D-day 와 '지금' 표시 (마카오 시간 기준) */
  function markNow() {
    var now = nowMacau(), today = now.slice(0, 10), t = toMin(now.slice(11, 16));
    var first = D.days[0].date, last = D.days[D.days.length - 1].date;
    var dd = Math.round((Date.parse(first) - Date.parse(today)) / 86400000);
    var b = $('s-dday');
    b.textContent = dd > 0 ? 'D-' + dd : dd === 0 ? 'D-DAY ✈️' : today <= last ? (1 - dd) + '일차' : '다녀왔어요';
    b.hidden = false;
    document.querySelectorAll('.s-item.now, .s-item.next').forEach(function (el) { el.classList.remove('now', 'next'); });
    var sec = $('d-' + today);
    if (!sec) return null;
    sec.classList.add('today');
    var list = sec.querySelectorAll('.s-card:not(.quiet)'), hit = null;
    for (var i = 0; i < list.length; i++) {
      var s = +list[i].getAttribute('data-t'), e = +list[i].getAttribute('data-e');
      if (s <= t && t < Math.max(e, s + 1)) { list[i].classList.add('now'); hit = list[i]; break; }
      if (s > t) { list[i].classList.add('next'); hit = list[i]; break; }
    }
    return hit || sec;
  }

  /* 날짜 탭: 지금 보고 있는 날짜를 표시 */
  function spy() {
    var top = $('s-top').offsetHeight + 10, cur = D.days[0].date;
    D.days.forEach(function (d) { var el = $('d-' + d.date); if (el && el.getBoundingClientRect().top - top <= 1) cur = d.date; });
    document.querySelectorAll('#s-tabs a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-d') === cur); });
  }

  render();
  var target = markNow();
  document.documentElement.style.setProperty('--top-h', $('s-top').offsetHeight + 'px');
  if (!location.hash && target) {
    setTimeout(function () {
      var y = target.getBoundingClientRect().top + window.scrollY - $('s-top').offsetHeight - 12;
      window.scrollTo(0, Math.max(0, y));
    }, 50);
  }
  window.addEventListener('scroll', spy, { passive: true });
  window.addEventListener('resize', function () { document.documentElement.style.setProperty('--top-h', $('s-top').offsetHeight + 'px'); spy(); });
  spy();
  setInterval(markNow, 60000);
  $('s-totop').addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  // 지도 페이지에서 그 날짜(#d-2026-12-28)로 들어오면 그 날짜로
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(function () {});
})();
