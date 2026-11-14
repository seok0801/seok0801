/* 마카오 가족여행 투어맵 — 기능(지도·투어·예약·비용)
 * 일정 내용은 이 파일이 아니라 data.js 에 있습니다. 일정을 바꿀 때는 data.js 만 고치세요. */
(function () {
  'use strict';

  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };

  if (!D) {
    $('cards').textContent = '일정 데이터(data.js)를 불러오지 못했습니다. data.js 파일이 index.html 과 같은 폴더에 있는지 확인해 주세요.';
    return;
  }

  /* ---------- 종류별 아이콘 ---------- */
  var PLACE_TYPES = {
    hotel: { icon: '🏨', label: '호텔' },
    kids: { icon: '🧸', label: '키즈' },
    sight: { icon: '📸', label: '구경' },
    show: { icon: '🎭', label: '공연' },
    shop: { icon: '🛍️', label: '쇼핑·구경' },
    oldtown: { icon: '🏛️', label: '구시가지' },
    transport: { icon: '🚌', label: '교통' },
    airport: { icon: '✈️', label: '공항' },
    food: { icon: '🍽️', label: '식당' },
    snack: { icon: '🥧', label: '간식' }
  };
  var KIND_ICONS = { flight: '✈️', hotel: '🏨', activity: '⭐', meal: '🍽️', snack: '🥧', nap: '💤', sleep: '🌙', move: '➡️' };
  var TRANSPORT = { shuttle: '🚌 무료 셔틀', taxi: '🚕 택시', walk: '🚶 도보' };
  var QUIET_KINDS = { nap: true, sleep: true };          // 목록에만 회색으로 보이는 일정
  var NO_STOP_KINDS = { nap: true, sleep: true, move: true }; // 투어에서 멈추지 않는 일정

  var state = { plan: 0, day: 'all', tourIdx: -1, playing: false, timer: null, lastPlace: null };
  /* 2D(위에서 내려다본 평면 지도) / 3D(기울인 입체 지도). 고른 방식은 이 휴대폰에 기억해 둔다 */
  var MODE_KEY = 'macau-map-mode';
  var is2d = false;
  try { is2d = localStorage.getItem(MODE_KEY) === '2d'; } catch (e) { /* 기억 못 해도 3D 로 시작 */ }
  function tilt(p) { return is2d ? 0 : p; }
  // 2D 에서는 사용자가 돌려 둔 방향을 그대로 둔다 (두 손가락으로 돌릴 수 있다)
  function turnTo(b) { return is2d ? (map ? map.getBearing() : 0) : b; }
  var map = null, mapReady = false, markers = {}, popup = null, dashTimer = null;
  var dashUntil = 0;         // 동선 점선을 이 시각까지만 움직인다(투어 중에는 계속)

  /* ---------- 3D 투어 카메라 설정 (숫자를 바꾸면 연출이 달라집니다) ---------- */
  var STOP_ZOOM = 16.1;      // 장소에 도착했을 때의 확대 정도 (클수록 가까이)
  var STOP_PITCH = 60;       // 지도를 기울이는 각도(도)
  var FLY_MS = 2000;         // 다음 장소로 날아가는 시간 (약 2초)
  var STAY_MS = 3000;        // 투어에서 한 장소에 머무는 시간 (3초)
  var ORBIT_DEG = 34;        // 머무는 동안 장소 둘레를 도는 각도
  var LONG_HOP_M = 1500;     // 이보다 먼 이동(예: 코타이 → 구시가지 버스)은 먼저 두 곳을 한 화면에 보여 준 뒤 내려앉는다
  var HOP_MS = 1800;         // 두 곳을 한 화면에 담는 데 걸리는 시간
  var HOP_HOLD_MS = 700;     // 동선을 보여 주며 잠깐 멈추는 시간
  var BEACON_RADIUS_M = 7;   // 지금 보는 장소에 세우는 빛기둥의 반지름(m)
  var BEACON_HEIGHT_M = 130; // 빛기둥의 높이(m)

  /* ---------- 작은 도우미 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toMin(t) { var p = String(t || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function plan() { return D.plans[state.plan] || D.plans[0]; }
  function dayInfo(date) { for (var i = 0; i < D.days.length; i++) if (D.days[i].date === date) return D.days[i]; return null; }
  var EAT_PLACES = {};   // 🍴 맛집 중 일정에 없는 곳 (아래 맛집 부분에서 채운다)
  function place(id) { return D.places[id] || EAT_PLACES[id]; }
  function onMap(id) { var p = place(id); return !!(p && !p.offMap && typeof p.lng === 'number' && typeof p.lat === 'number'); }
  function mopShort(c) { return c.min === c.max ? c.min.toLocaleString() : c.min.toLocaleString() + '~' + c.max.toLocaleString(); }
  function mop(c) { return 'MOP ' + mopShort(c); }
  /* 원화 환산: 1 MOP = KRW.rate 원 (KRW.at 시점). 천 원 단위로 반올림 */
  var KRW = { rate: (D.krw && D.krw.rate) || 0, at: (D.krw && D.krw.at) || '', live: false };
  function wonOf(v) { return Math.round(v * KRW.rate / 1000) * 1000; }
  function won(c) {
    if (!KRW.rate) return '';
    var a = wonOf(c.min), b = wonOf(c.max);
    return '약 ' + (a === b ? a.toLocaleString() : a.toLocaleString() + '~' + b.toLocaleString()) + '원';
  }
  /* 그날 환율 받아 오기 (실패하면 data.js 의 값). 하루 한 번만 받아 이 휴대폰에 기억한다 */
  function loadRate() {
    var today = new Date().toISOString().slice(0, 10);
    try {
      var c = JSON.parse(localStorage.getItem('macau-krw') || 'null');
      if (c && c.day === today && c.rate) { KRW.rate = c.rate; KRW.at = c.at; KRW.live = true; return; }
    } catch (e) { /* 기억 못 해도 새로 받는다 */ }
    if (!D.krw || !D.krw.liveUrl || !window.fetch) return;
    fetch(D.krw.liveUrl).then(function (r) { return r.json(); }).then(function (j) {
      var rate = j && j.rates && j.rates.KRW;
      if (!rate) return;
      var t = new Date(j.time_last_update_unix * 1000 + 9 * 3600 * 1000);   // 한국 시간
      KRW.rate = Math.round(rate * 100) / 100;
      KRW.at = t.toISOString().slice(0, 16).replace('T', ' ') + ' (한국 시간)';
      KRW.live = true;
      try { localStorage.setItem('macau-krw', JSON.stringify({ day: today, rate: KRW.rate, at: KRW.at })); } catch (e) { /* 무시 */ }
      renderCards();   // 금액 옆 원화만 다시 그린다 (지도는 그대로)
    }).catch(function () { /* 인터넷이 없거나 막히면 data.js 의 환율 */ });
  }
  /* ---------- 🌤️ 날씨: 여행 16일 전부터 무료 예보(Open-Meteo)를 받는다. 3시간 동안 이 휴대폰에 기억 ---------- */
  var WX = {}, WX_KEY = 'macau-wx';
  function wxIcon(c) {
    return c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : '⛈️';
  }
  function loadWeather() {
    var W = D.weather; if (!W || !window.fetch) return;
    try {
      var c = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
      if (c && Date.now() - c.at < 3 * 3600 * 1000) { WX = c.days || {}; return; }
    } catch (e) { /* 새로 받는다 */ }
    var dates = D.days.map(function (d) { return d.date; });
    var today = nowMacau().slice(0, 10);
    var last = new Date(Date.parse(today + 'T00:00:00Z') + 15 * 86400000).toISOString().slice(0, 10);
    var want = dates.filter(function (d) { return d >= today && d <= last; });
    if (!want.length) return;            // 아직 예보가 나오지 않은 때 (평년값만 보인다)
    var url = W.url + '?latitude=' + W.lat + '&longitude=' + W.lng +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FMacau' +
      '&start_date=' + want[0] + '&end_date=' + want[want.length - 1];
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j && j.daily; if (!d || !d.time) return;
      WX = {};
      d.time.forEach(function (t, i) {
        WX[t] = { code: d.weather_code[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), pop: d.precipitation_probability_max[i] };
      });
      try { localStorage.setItem(WX_KEY, JSON.stringify({ at: Date.now(), days: WX })); } catch (e) { /* 무시 */ }
      renderCards();
    }).catch(function () { /* 인터넷이 없거나 막히면 평년값 */ });
  }
  /* 날짜 제목 아래: 날씨 한 줄 + ☔ 비 오면 대안 (비 예보가 있으면 펼쳐 둔다) */
  function weatherHtml(date) {
    var W = D.weather || {}, w = WX[date], rain = (D.rainPlans || {})[date];
    var wet = w && w.pop != null && w.pop >= (W.rainPop || 50);
    var line = w ? wxIcon(w.code) + ' ' + w.min + '~' + w.max + '°' + (w.pop != null ? ' · ☔ ' + w.pop + '%' : '') + ' <span class="fine">예보</span>'
      : W.normal ? '🌡️ ' + esc(W.normal) : '';
    var html = line ? '<p class="wx' + (wet ? ' wet' : '') + '">' + line + '</p>' : '';
    if (rain && rain.length) {
      html += '<details class="prep rain' + (wet ? ' wet' : '') + '"' + (wet ? ' open' : '') + '><summary>☔ 비 오면 이렇게' + (wet ? ' (비 예보!)' : '') + '</summary><ul>' +
        rain.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
    }
    return html;
  }

  /* 링크 버튼 이름: '소개 페이지'처럼 막연한 이름 대신 어느 사이트인지 보이게 */
  var SITE_NAMES = {
    'taipavillagemacau.com': '타이파 빌리지 공식 안내', 'macaotourism.gov.mo': '마카오 관광청 안내', 'guide.michelin.com': '미쉐린 가이드',
    'timeout.com': 'Time Out 소개(영문)', 'frommers.com': 'Frommer\'s 소개(영문)', 'ipacktravel.com': '여행 블로그 소개(영문)',
    'openrice.com': 'OpenRice 리뷰(영문)', 'i-discoverasia.com': 'i-Discover 소개(영문)', 'citiesinsider.com': '여행 가이드 소개(영문)',
    'macau.com': 'Macau.com 소개(영문)', 'macaulifestyle.com': 'Macau Lifestyle 소개(영문)', 'macau-airport.com': '마카오 공항 공식',
    'venetianmacao.com': '베네시안 공식', 'londonermacao.com': '런더너 공식', 'studiocity-macau.com': '스튜디오 시티 공식',
    'cityofdreamsmacau.com': '시티 오브 드림즈 공식', 'wynnresortsmacau.com': '윈 팰리스 공식', 'grandlisboapalace.com': '그랜드 리스보아 팰리스 공식',
    'grandlisboa.com': '그랜드 리스보아 공식', 'lordstow.com': '로드 스토우 공식', 'parisianmacao.com': '파리지앵 공식'
  };
  function siteLabel(url, label) {
    var host = ''; try { host = new URL(url).hostname.replace(/^www\./, '').replace(/^hk\./, ''); } catch (e) { /* 무시 */ }
    var name = SITE_NAMES[host];
    // 막연한 이름('소개 페이지', '공식', '공식 안내')은 사이트 이름으로 바꾼다
    if (!label || /소개 페이지/.test(label) || label === '공식' || label === '공식 안내') return '🌐 ' + (name || host || '소개 페이지');
    return '🌐 ' + label;
  }

  function isNarrow() { return window.innerWidth < 900; }      // 휴대폰처럼 좁은 화면인지
  function link(url, text, cls) {
    return '<a class="' + (cls || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
  }
  /* 그 장소를 구글 지도에서 여는 주소 (길찾기·리뷰·사진을 볼 수 있다) */
  function mapsLink(id, label) {
    var p = place(id);
    var q = p.mapQuery || (p.lat + ',' + p.lng);
    var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    return gmLink(url, gmEmbed(q, p.lat, p.lng, 17), p.name, label || '📍 구글 지도', 'btn');
  }

  /* 구글 지도: 버튼을 누르면 다른 화면으로 넘어가지 않고 지금 지도 위에 창으로 올라온다.
   * 창 안은 키가 필요 없는 구글 지도 퍼가기 화면이고, '앱으로 열기'를 누르면 구글 지도 앱(또는 새 탭)으로 연다 */
  function gmEmbed(q, lat, lng, z) {
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&ll=' + lat + ',' + lng + '&z=' + z + '&hl=ko&output=embed';
  }
  function gmLink(url, embed, title, text, cls) {
    return '<a class="' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-gm="' + esc(embed) + '" data-gm-title="' + esc(title) + '">' + esc(text) + '</a>';
  }
  function openGm(a) {
    $('gm-title').textContent = a.getAttribute('data-gm-title') || '구글 지도';
    $('gm-open').href = a.href;
    $('gm-frame').src = a.getAttribute('data-gm');
    $('gm').hidden = false;
  }
  function closeGm() { $('gm').hidden = true; $('gm-frame').src = 'about:blank'; }
  /* 구글 지도 버튼은 지도 위 창(openGm)을 쓰지 않고 바로 구글 지도 앱(없으면 새 탭)으로 연다 — 창이 화면을 덮어 불편하다는 의견 */
  /* 아이폰: 구글 지도 웹 주소는 (특히 카카오톡 등 앱 안 브라우저에서) 앱스토어로 넘어가고, 거기서 '열기'를 누르면
   * 검색어가 사라진 채 지도만 열린다. 그래서 아이폰에서는 구글 지도 앱 전용 주소(comgooglemaps://)로 검색어·목적지를 그대로 넘긴다.
   * 앱이 열리지 않으면(설치 안 됨) 1.5초 뒤 원래 웹 주소로 연다 */
  var IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function gmAppUrl(href, ll) {   // ll = '위도,경도' (있으면 그 자리 주변에서 찾아 가게가 먼저 잡힌다)
    var u; try { u = new URL(href); } catch (e) { return ''; }
    if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) || u.pathname.indexOf('/maps') !== 0) return '';
    var q = u.searchParams;
    if (u.pathname.indexOf('/maps/dir') === 0 && q.get('destination')) {
      return 'comgooglemaps://?daddr=' + encodeURIComponent(q.get('destination')) + '&directionsmode=' + encodeURIComponent(q.get('travelmode') || 'driving');
    }
    if (q.get('query')) return 'comgooglemaps://?q=' + encodeURIComponent(q.get('query')) + (ll ? '&center=' + ll + '&zoom=18' : '');
    return '';
  }
  document.addEventListener('click', function (e) {
    if (!IS_IOS) return;
    var a = e.target.closest && e.target.closest('a[href*="google."]');
    if (!a) return;
    var llm = /[?&]ll=([-0-9.]+,[-0-9.]+)/.exec(a.getAttribute('data-gm') || '');
    var app = gmAppUrl(a.href, llm ? llm[1] : '');
    if (!app) return;
    e.preventDefault();
    // 앱이 열리거나 '여시겠습니까?' 확인 창이 뜨면 이 페이지가 가려진다(blur·hidden). 그런 일이 전혀 없을 때만
    // (앱이 없고 아무 반응도 없을 때) 웹 구글 지도로 연다. 예전엔 앱과 웹이 함께 열리는 문제가 있었다
    var web = a.href, left = false;
    var mark = function () { left = true; };
    var onVis = function () { if (document.hidden) left = true; };
    window.addEventListener('blur', mark);
    window.addEventListener('pagehide', mark);
    document.addEventListener('visibilitychange', onVis);
    window.location.href = app;
    setTimeout(function () {
      window.removeEventListener('blur', mark);
      window.removeEventListener('pagehide', mark);
      document.removeEventListener('visibilitychange', onVis);
      if (!left && !document.hidden && document.hasFocus()) window.open(web, '_blank', 'noopener');
    }, 2500);
  });

  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /* 두 지점 [경도, 위도] 사이의 방향(북쪽 0도, 시계 방향)과 거리(m) */
  function bearingTo(a, b) {
    var r = Math.PI / 180, dl = (b[0] - a[0]) * r;
    var y = Math.sin(dl) * Math.cos(b[1] * r);
    var x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos(dl);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function distanceM(a, b) {
    var r = Math.PI / 180, dy = (b[1] - a[1]) * 111320, dx = (b[0] - a[0]) * 111320 * Math.cos(a[1] * r);
    return Math.sqrt(dx * dx + dy * dy);
  }
  /* 중심 [경도, 위도]에서 반지름 r(m)인 원 모양 좌표 */
  function circleRing(lng, lat, r) {
    var pts = [], n = 28, dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
    for (var i = 0; i <= n; i++) { var a = 2 * Math.PI * i / n; pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
    return pts;
  }

  /* 일정 목록(안 → 날짜 순서). 각 일정에 번호(_i)를 붙여 둔다 */
  function items(date) {
    var out = [];
    plan().items.forEach(function (it, i) {
      it._i = i;
      if (!date || date === 'all' || it.date === date) out.push(it);
    });
    // 날짜·시간 순서로 정렬한다 (data.js 에 순서와 다르게 적어도 화면에는 시간순으로 보인다)
    out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (toMin(a.time) - toMin(b.time)) || (a._i - b._i);
    });
    return out;
  }
  function viewDates() { return state.day === 'all' ? D.days.map(function (d) { return d.date; }) : [state.day]; }

  /* 아이 리듬 규칙: 저녁이 너무 늦게 시작하거나, 활동이 호텔 복귀 시각보다 늦게 끝나면 주의 */
  function rhythmWarning(it) {
    var R = D.rhythm || {};
    if (QUIET_KINDS[it.kind]) return '';
    if (it.kind === 'meal' && it.meal === 'dinner' && R.dinnerLatest && toMin(it.time) > toMin(R.dinnerLatest)) {
      return '저녁 시작이 ' + R.dinnerLatest + '보다 늦음';
    }
    if (R.backToHotel && toMin(it.end || it.time) > toMin(R.backToHotel)) {
      return R.backToHotel + ' 이후에 끝남';
    }
    return '';
  }

  /* 휴무 주의: 장소의 정기 휴무 요일(closedWeekdays, 0=일 … 6=토)이나 쉬는 날짜(closedDates)가 일정과 겹치는지 */
  function closedWarning(it) {
    if (it.kind === 'move' || QUIET_KINDS[it.kind]) return [];
    var wd = new Date(it.date + 'T12:00:00').getDay();
    var hit = [];
    (it.places || []).forEach(function (id) {
      var p = place(id);
      if (!p) return;
      if ((p.closedWeekdays && p.closedWeekdays.indexOf(wd) >= 0) || (p.closedDates && p.closedDates.indexOf(it.date) >= 0)) hit.push(p.name);
    });
    return hit;
  }

  /* 영업시간 주의: 일정 시각이 장소의 여는 시각(open)보다 이르거나 닫는 시각(close)보다 늦은지 */
  function hoursWarning(it) {
    if (it.kind !== 'activity' && it.kind !== 'meal' && it.kind !== 'snack') return [];
    var hit = [];
    (it.places || []).forEach(function (id) {
      var p = place(id);
      if (!p) return;
      if (p.open && toMin(it.time) < toMin(p.open)) hit.push(p.open + '에 문을 엶');
      else if (p.close && toMin(it.end || it.time) > toMin(p.close)) hit.push(p.close + '에 문을 닫음');
    });
    return hit;
  }

  /* 투어가 멈추는 곳: (일정, 장소) 쌍 */
  /* 투어가 멈추는 장소: 보통 일정은 그 장소, 무료 셔틀 이동은 내리는 곳(마지막 장소)에 한 번 멈춘다.
   * 낮잠·취침·그 밖의 이동(택시·도보)은 멈추지 않는다 */
  function stopPlacesOf(it) {
    var ps = (it.places || []).filter(onMap);
    if (it.kind === 'move' && it.transport === 'shuttle') return ps.length ? [ps[ps.length - 1]] : [];
    return NO_STOP_KINDS[it.kind] ? [] : ps;
  }
  function stops() {
    var out = [];
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        stopPlacesOf(it).forEach(function (id) {
          var prev = out[out.length - 1];
          if (prev && prev.place === id) return;     // 바로 앞과 같은 곳이면 한 번만 멈춘다
          out.push({ item: it, place: id });
        });
      });
    });
    return out;
  }

  /* 하루 동선: 그날 일정에 나오는 장소를 순서대로 이은 좌표 */
  function routeCoords(date) {
    var ids = [];
    items(date).forEach(function (it) {
      (it.places || []).forEach(function (id) {
        if (onMap(id) && ids[ids.length - 1] !== id) ids.push(id);
      });
    });
    return ids.map(function (id) { return [place(id).lng, place(id).lat]; });
  }

  function bookingFor(it) {
    var id = it.booking;
    if (!id) return null;
    var b = D.bookings[id];
    return b ? { id: id, b: b } : null;
  }

  function bookingButton(b, small) {
    var must = b.level === '필수';
    var label = b.aff ? '예약하기 (' + b.affBy + ')' : (b.buttonLabel || '예약하기');
    return affLink(b.aff || b.url, label + (must ? ' (필수)' : ''), 'btn book' + (must ? ' must' : '') + (small ? ' small' : ''), !!b.aff);
  }
  /* 제휴 링크는 검색엔진에 광고 링크임을 알린다 (rel="sponsored") */
  function affLink(url, text, cls, sponsored) {
    var h = link(url, text, cls);
    return sponsored ? h.replace('rel="noopener noreferrer"', 'rel="sponsored noopener noreferrer"') : h;
  }

  /* ---------- 화면 그리기 ---------- */
  function renderPlanToggle() {
    var box = $('plan-toggle');
    if (D.plans.length < 2) { box.hidden = true; return; }   // 안이 1개면 전환 버튼을 숨긴다
    box.hidden = false;
    box.innerHTML = D.plans.map(function (p, i) {
      return '<button type="button" class="btn" data-plan="' + i + '" aria-pressed="' + (i === state.plan) + '">' + esc(p.name) + '</button>';
    }).join('');
  }

  function renderTabs() {
    var html = '<button type="button" class="tab" role="tab" data-day="all" aria-selected="' + (state.day === 'all') + '">전체</button>';
    D.days.forEach(function (d) {
      var m = /^(\d+)\/(\d+)\((.+)\)$/.exec(d.label);      // '12/27(일)' → 월 · 일 · 요일로 나눠 좁은 화면에서 짧게 보여 준다
      var inner = m ? '<span class="m">' + m[1] + '/</span><span class="d">' + m[2] + '</span><span class="w">' + m[3] + '</span>' : esc(d.label);
      html += '<button type="button" class="tab" role="tab" data-day="' + d.date + '" style="--day-color:' + d.color +
        '" aria-label="' + esc(d.label) + '" aria-selected="' + (state.day === d.date) + '">' + inner + '</button>';
    });
    $('tabs').innerHTML = html;
  }

  function dayCost(date) {
    var t = { ticketMin: 0, ticketMax: 0, taxiMin: 0, taxiMax: 0 };
    items(date).forEach(function (it) {
      var c = it.cost;
      if (!c || c.optional) return;
      if (c.type === 'taxi') { t.taxiMin += c.min; t.taxiMax += c.max; }
      else { t.ticketMin += c.min; t.ticketMax += c.max; }
    });
    t.min = t.ticketMin + t.taxiMin; t.max = t.ticketMax + t.taxiMax;
    return t;
  }

  /* 작은 표시(칩). 접힌 카드에는 짧은 글(short), 펼친 카드에는 전체 문구(full)가 보인다 */
  function chip(short, full, cls) {
    return '<span class="chip' + (cls ? ' ' + cls : '') + '"><span class="s">' + short + '</span><span class="f">' + full + '</span></span>';
  }

  /* 일정 카드: 접힌 상태는 시간·제목·장소·작은 표시만. 누르면 메모·꿀팁·버튼이 펼쳐진다 */
  function cardHtml(it, numberByPlace, linked) {
    var d = dayInfo(it.date) || {};
    var quiet = !!QUIET_KINDS[it.kind];
    var isMove = it.kind === 'move';
    var showNum = !quiet && !isMove;
    var names = (it.places || []).map(function (id) {     // 지도 마커와 같은 번호를 장소 이름 앞에 붙인다
      var nm = esc(place(id) ? place(id).name : id);
      return (showNum && numberByPlace[id] ? '<span class="pnum">' + numberByPlace[id] + '</span>' : '') + nm;
    });

    var chips = [];
    var tIcon = it.transport && TRANSPORT[it.transport] ? TRANSPORT[it.transport].split(' ')[0] : '';
    if (tIcon) chips.push(isMove ? '<span class="chip f-only">' + TRANSPORT[it.transport] + '</span>' : chip(tIcon, TRANSPORT[it.transport]));
    if (it.cost) {
      var opt = it.cost.optional ? ' (선택)' : '';
      chips.push(chip('💰 ' + mopShort(it.cost) + opt, '💰 1가족 예상 ' + mop(it.cost) + (KRW.rate ? ' (' + won(it.cost) + ')' : '') + opt));
    }
    if (it.napOk) chips.push(chip('😴 낮잠', '😴 유모차·차에서 낮잠 가능', 'nap'));
    var rw = rhythmWarning(it);
    if (rw) chips.push(chip('⚠️ 아이 리듬', '⚠️ 아이 리듬 주의 · ' + esc(rw), 'warn'));
    closedWarning(it).forEach(function (n) { chips.push(chip('⛔ 휴무', '⛔ 휴무 주의 · ' + esc(n), 'closed')); });
    hoursWarning(it).forEach(function (t) { chips.push(chip('⏰ 영업시간', '⏰ 영업시간 주의 · ' + esc(t), 'warn')); });
    if (it.warn) chips.push(chip('⚠️ 확인 필요', '⚠️ 확인 필요 · ' + esc(it.warn), 'warn'));
    var bk = bookingFor(it);
    if (bk) chips.push('<span class="chip s-only">🎫 예약</span>');

    // 펼쳤을 때 보이는 자세한 내용
    var more = '';
    if (it.memo) more += '<p class="card-memo">' + esc(it.memo) + '</p>';
    if (it.tips && it.tips.length) {
      more += '<ul class="tips">' + it.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    }
    if (it.cost) more += '<p class="fine">💰 ' + (it.cost.note ? esc(it.cost.note) + ' · ' : '') + '현장·공식 사이트에서 최종 확인</p>';
    var actions = [];
    if (bk) actions.push(bookingButton(bk.b));
    var sh = it.shuttle && D.shuttles[it.shuttle];
    if (sh) actions.push(link(sh.url, '🚌 셔틀 시간표', 'btn'));
    if (!isMove && !quiet) {
      (it.places || []).forEach(function (id) {             // 같은 장소의 링크는 하루에 한 번만 보여 준다
        var p = place(id);
        if (!p || !p.url || linked[id] || (bk && bk.b.url === p.url)) return;
        linked[id] = true;
        // 장소가 여러 곳인 일정은 '🌐 대리라이기 소개'처럼 장소 이름을 붙여 어느 곳 링크인지 보이게
        actions.push(link(p.url, (it.places || []).length > 1 ? '🌐 ' + shortName(p.name) + ' 소개' : siteLabel(p.url, p.urlLabel), 'btn'));
      });
    }
    if (!isMove && !quiet) {
      // 한 일정에 장소가 여러 곳이면(예: 쿤하 거리 · 대리라이기 · 세이키 카페) 장소마다 구글 지도 버튼을 따로 둔다
      var ons = (it.places || []).filter(onMap);
      ons.forEach(function (id) { actions.push(mapsLink(id, ons.length > 1 ? '📍 ' + shortName(place(id).name) : '')); });
    }
    if (actions.length) more += '<div class="card-actions">' + actions.join('') + '</div>';
    if (sh) more += '<p class="fine">' + esc(sh.info) + ' · 운행 시각은 현장 확인</p>';

    var cls = 'card' + (quiet ? ' quiet' : '') + (isMove ? ' move' : '') + (more ? ' has-more' : '');
    var html = '<div class="' + cls + '" tabindex="0" role="button"' + (more ? ' aria-expanded="false"' : '') +
      ' data-i="' + it._i + '" style="--day-color:' + (d.color || '') + '">';
    html += '<div class="card-top"><div class="card-time">' + esc(it.time) + (it.end ? '<small>~' + esc(it.end) + '</small>' : '') + '</div>';
    html += '<div class="card-main"><p class="card-title">' + ((isMove && tIcon) || KIND_ICONS[it.kind] || '') + ' ' + esc(it.title) + '</p>';
    if (names.length) html += '<p class="card-place place-line">' + names.join(isMove ? ' → ' : ' · ') + '</p>';
    html += '<div class="chips">' + chips.join('') + '</div></div>';
    if (more) html += '<span class="chev" aria-hidden="true">⌄</span>';
    html += '</div>';
    if (more) html += '<div class="card-more">' + more + '</div>';
    return html + '</div>';
  }

  /* 날짜별로 장소에 번호 매기기(그날 처음 들르는 순서) */
  function numbering(date) {
    var n = 0, by = {};
    items(date).forEach(function (it) {
      stopPlacesOf(it).forEach(function (id) {
        if (!by[id]) by[id] = ++n;
      });
    });
    return by;
  }

  function renderCards() {
    var html = '';
    viewDates().forEach(function (date) {
      var d = dayInfo(date);
      var c = dayCost(date);
      // 날짜 제목 + 그날 예상 비용(누르면 비용 요약)
      html += '<div class="day-head" style="--day-color:' + d.color + '"><h2>' + esc(d.label) +
        (d.summary ? ' <small>' + esc(d.summary) + '</small>' : '') + '</h2>' +
        (c.max > 0 ? '<button type="button" class="day-cost" aria-label="이날 1가족 예상 비용 ' + mop(c) + ' ' + won(c) + ' · 비용 요약 열기">💰 ' + mop(c) + (KRW.rate ? ' · ' + won(c) : '') + '</button>' : '') +
        '</div>' + weatherHtml(date);
      var prep = (plan().prep || {})[date];
      if (prep && prep.length) {
        html += '<details class="prep"><summary>🎒 오늘의 준비물 ' + prep.length + '가지</summary><ul>' +
          prep.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
      }
      var nums = numbering(date);
      var linked = {};
      items(date).forEach(function (it) { html += cardHtml(it, state.day === 'all' ? {} : nums, linked); });
    });
    $('cards').innerHTML = html;
  }

  function render(moveCamera) {
    state.tourIdx = -1;
    stopTour();
    state.lastPlace = null;
    renderPlanToggle();
    renderTabs();
    renderCards();
    var R = D.rhythm || {};
    if (R.breakfastStart) {
      $('foot-rhythm').textContent = '아이 리듬: 조식 ' + R.breakfastStart + ' · 낮잠 ' + (R.napNote || (R.napStart + '~' + R.napEnd)) +
        ' · 저녁 ' + R.dinnerStart + ' (늦어도 ' + R.dinnerLatest + ') · ' + R.backToHotel + ' 호텔 복귀 · ' + R.bedtime + ' 취침';
    }
    setTourStatus('');
    updateMap(moveCamera);
  }

  /* ---------- 지도 ---------- */

  /* 투어 중에 마커 아래에 띄우는 작은 이름표 */
  function compactHtml(id, it) {
    var p = place(id);
    var t = PLACE_TYPES[p.type] || { icon: '📍' };
    return '<div class="pop compact"><strong>' + t.icon + ' ' + esc(p.name) + '</strong>' +
      (it ? '<span>' + esc(it.time + ' ' + it.title) + '</span>' : '') + '</div>';
  }

  /* 지금 보는 장소 표시: 마커를 강조하고 그 자리에 3D 빛기둥을 세운다 */
  function setFocus(id, color) {
    Object.keys(markers).forEach(function (k) { markers[k].getElement().classList.toggle('on', k === id); });
    var src = map.getSource('beacon');
    if (!src) return;
    var p = place(id);
    src.setData({ type: 'FeatureCollection', features: [{
      type: 'Feature', properties: { color: color || '#0b6e99' },
      geometry: { type: 'Polygon', coordinates: [circleRing(p.lng, p.lat, BEACON_RADIUS_M)] }
    }] });
  }
  function clearFocus() {
    Object.keys(markers).forEach(function (k) { markers[k].getElement().classList.remove('on'); });
    var src = mapReady && map.getSource('beacon');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
  }

  /* opt.compact = 투어용 작은 이름표, opt.item = 이름표에 보일 일정, opt.color = 빛기둥 색 */
  /* ---------- 아래에서 올라오는 창(시트): 누른 장소의 여행 내용 / 그날 일정 목록 ---------- */
  var sheetMode = '';
  var listScroll = 0;   // 일정 목록에서 장소로 넘어갈 때 보던 위치 (‹ 일정 으로 돌아오면 그 자리로)
  function openSheet(mode, title) {
    if (sheetMode === 'list' && mode === 'place') listScroll = $('sheet-body').scrollTop;
    sheetMode = mode;
    $('sheet-back').hidden = mode !== 'place';
    $('sheet').hidden = false;
    $('sheet').className = mode;
    $('sheet-title').textContent = title;
    $('place').hidden = mode !== 'place';
    $('list').hidden = mode !== 'list';
    $('sheet-body').scrollTop = 0;
  }
  function hideSheet() { sheetMode = ''; $('sheet').hidden = true; }

  /* 장소를 눌렀을 때 보여 줄 내용: 그 장소에서 하는 일정(시간·메모·꿀팁·예약 버튼) */
  /* 주변 찾기: 그 장소 둘레의 식당·카페·편의점·약국을 구글 지도(앱)에서 바로 연다. 키가 필요 없다 */
  var NEARBY = [['🍜', '식당', 'restaurants'], ['☕', '카페', 'cafe'], ['🏪', '편의점', 'convenience store'], ['💊', '약국', 'pharmacy']];
  /* 길찾기: 출발지를 비워 두면 구글 지도가 '내 위치'에서 출발하는 길안내를 연다 (앱이 있으면 앱으로) */
  var ROUTE_MODES = [['🚶', '걸어서', 'walking'], ['🚕', '택시·차', 'driving'], ['🚌', '대중교통', 'transit']];
  function routeHtml(p) {
    var dest = encodeURIComponent(p.mapQuery || (p.lat + ',' + p.lng));
    return '<div class="row-chips route"><span class="row-label">🧭 여기까지 길찾기</span>' +
      (p.zh ? '<button type="button" class="chip-sm taxi-chip" data-taxi="' + esc(placeIdOf(p)) + '">🚕 기사에게 보여 주기</button>' : '') + ROUTE_MODES.map(function (m) {
      var url = 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=' + m[2];
      return '<a class="chip-sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="지금 위치에서 ' + esc(p.name) + '까지 ' + m[1] + ' 길찾기 (구글 지도)">' + m[0] + ' ' + m[1] + '</a>';
    }).join('') + '</div>';
  }
  function placeIdOf(p) {
    for (var k in D.places) if (D.places[k] === p) return k;
    for (var e in EAT_PLACES) if (EAT_PLACES[e] === p) return e;
    return '';
  }
  /* 🚕 택시 카드: 화면 가득 한자 이름 (택시 기사에게 보여 준다) */
  function showTaxi(id) {
    var p = place(id); if (!p || !p.zh) return;
    $('taxi-zh').textContent = p.zh;
    $('taxi-area').textContent = p.zhArea || '';
    $('taxi-ko').textContent = p.name;
    $('taxi').hidden = false;
  }
  function nearbyHtml(p) {
    return '<div class="row-chips"><span class="row-label">주변 찾기</span>' + NEARBY.map(function (n) {
      // 아이폰에서도 구글 지도 앱으로 바로 열리는 공식 주소 형식(api=1). 예전 '/search/식당/@좌표' 형식은 앱스토어로 넘어가는 일이 있었다
      var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(n[2] + ' near ' + (p.mapQuery || (p.lat + ',' + p.lng)));
      return gmLink(url, gmEmbed(n[2] + ' near ' + p.lat + ',' + p.lng, p.lat, p.lng, 16), shortName(p.name) + ' 주변 ' + n[1], n[0] + ' ' + n[1], 'chip-sm');
    }).join('') + '</div>';
  }

  function placeHtml(id) {
    var p = place(id);
    var t = PLACE_TYPES[p.type] || { icon: '📍', label: '' };
    // 1) 장소 설명 한 줄 (종류 · 메모 · 영업시간)
    var meta = [t.label, p.note].filter(Boolean).join(' · ');
    var html = (meta || p.hours) ? '<p class="fine place-meta">' + esc(meta) + (p.hours ? (meta ? '<br>' : '') + '🕒 ' + esc(p.hours) : '') + '</p>' : '';
    html += meDistanceHtml(p);
    if (p.baby) html += '<p class="baby">🍼 <b>아기 편의</b> ' + esc(p.baby) + '</p>';
    // 2) 이 장소에서 하는 일정 (가장 중요한 내용이라 먼저 보인다)
    var linked = {}, n = 0;
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        if ((it.places || []).indexOf(id) < 0 || (it.kind === 'move' && stopPlacesOf(it).indexOf(id) < 0)) return;   // 셔틀은 내리는 곳에서 보인다
        if (state.day === 'all') html += '<p class="fine day-tag">' + esc((dayInfo(date) || {}).label || '') + '</p>';
        var c = cardHtml(it, {}, linked).replace('class="card', 'class="card open static');
        // 창 제목과 같은 장소 이름 줄은 겹치므로 뺀다
        c = c.replace('<p class="card-place place-line">' + esc(p.name) + '</p>', '');
        html += c;
        n++;
      });
    });
    if (!n) html += '<div class="card-actions">' + (p.url ? link(p.url, siteLabel(p.url, p.urlLabel), 'btn') : '') + mapsLink(id) + '</div>';
    // 3) 같은 건물·바로 옆의 다른 일정 장소 (마커가 겹쳐 누르기 어려울 때)
    var near = viewPlaceIds().filter(function (o) { return o !== id && distanceM([p.lng, p.lat], [place(o).lng, place(o).lat]) < 150; });
    if (near.length) {
      html += '<div class="row-chips"><span class="row-label">가까운 일정</span>' + near.map(function (o) {
        var ot = PLACE_TYPES[place(o).type] || { icon: '📍' };
        return '<button type="button" class="chip-sm" data-place="' + o + '">' + ot.icon + ' ' + esc(shortName(place(o).name)) + '</button>';
      }).join('') + '</div>';
    }
    // 4) 지금 위치에서 이 장소까지 길찾기 (구글 지도 앱 길안내) + 주변 가게 찾기
    html += routeHtml(p);
    html += nearbyHtml(p);
    if (p.verified === false) html += '<p class="fine">지도 위 위치는 건물 기준의 대략적인 표시입니다.</p>';
    return html;
  }
  /* '딘타이펑 (스튜디오 시티)' → '딘타이펑' 처럼 괄호 설명을 뺀 짧은 이름 */
  function shortName(name) { return String(name).replace(/\s*\([^)]*\)\s*$/, '') || name; }
  function showPlace(id) {
    var p = place(id);
    var t = PLACE_TYPES[p.type] || { icon: '📍' };
    $('place').innerHTML = placeHtml(id);
    openSheet('place', t.icon + ' ' + p.name);
  }
  function showList(restore) {
    openSheet('list', state.day === 'all' ? '전체 일정' : (dayInfo(state.day) || {}).label + ' 일정');
    if (restore) $('sheet-body').scrollTop = listScroll;
  }

  /* 지도 위 이름표. opt.item = 이름표에 보일 일정, opt.color = 빛기둥 색 */
  var popupToken = 0;
  function openPopup(id, opt) {
    if (!mapReady || !onMap(id)) return;
    opt = opt || {};
    var my = ++popupToken;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 24, anchor: 'top', closeButton: false, closeOnClick: true, focusAfterOpen: false, className: 'tour-pop' })
      .setLngLat([place(id).lng, place(id).lat]).setHTML(compactHtml(id, opt.item)).addTo(map);
    // 이름표를 누르면 그 장소의 여행 내용이 아래에서 올라온다
    popup.getElement().addEventListener('click', function () { stopTour(); flyToPlace(id, { sheet: true }); showPlace(id); });
    popup.on('close', function () { if (my === popupToken) clearFocus(); });
    setFocus(id, opt.color || (state.day === 'all' ? null : dayInfo(state.day).color));
  }

  function mapHeight() { return map.getContainer().clientHeight || 400; }

  /* opt.compact = 투어용(작은 이름표라 장소를 덜 내린다), opt.orbitMs = 도착 후 도는 시간 */
  var flyToken = 0;
  function flyToPlace(id, opt) {
    if (!mapReady || !onMap(id)) return;
    endFlight();
    pauseFollow();
    opt = opt || {};
    var my = ++flyToken;
    var center = [place(id).lng, place(id).lat];
    // 장소를 지도 가운데보다 아래에 두어, 그 위로 3D 풍경(또는 팝업)이 보이게 한다
    // 창이 열리면 장소가 창에 가리지 않는 쪽에 오게 한다 (세로 화면: 위쪽, 가로로 돌린 화면·PC: 오른쪽)
    var side = window.innerWidth >= 900 || (window.innerWidth > window.innerHeight && window.innerHeight <= 520);
    var offset = !opt.sheet ? [0, Math.round(mapHeight() * 0.04)]
      : side ? [Math.round(Math.min(230, window.innerWidth * 0.23)), 0] : [0, Math.round(mapHeight() * -0.22)];
    var cur = map.getBearing(), b = cur + 40;
    var from = state.lastPlace && state.lastPlace !== id && onMap(state.lastPlace) ? [place(state.lastPlace).lng, place(state.lastPlace).lat] : null;
    if (from && distanceM(from, center) > 80) {
      // 이동하는 방향을 바라보며 도착한다 (어지럽지 않게 한 번에 최대 100도까지만 돈다)
      var turn = ((bearingTo(from, center) - cur + 540) % 360) - 180;
      b = cur + Math.max(-100, Math.min(100, turn));
    }
    state.lastPlace = id;
    // 먼 이동: ① 출발지와 도착지를 한 화면에 담아 동선을 보여 주고 ② 도착지로 내려앉는다 (화면이 이동을 따라가 보이게)
    var hop = from && opt.tour && distanceM(from, center) > LONG_HOP_M && !reducedMotion();
    var wait = hop ? HOP_MS + HOP_HOLD_MS : 0;
    state.hopMs = wait;
    if (hop) {
      var bb = new maplibregl.LngLatBounds(from, from).extend(center);
      map.fitBounds(bb, { padding: { top: 150, bottom: 140, left: 60, right: 60 }, pitch: tilt(35), bearing: turnTo(b), maxZoom: 15, duration: HOP_MS });
    }
    setTimeout(function () {
      if (my !== flyToken || !mapReady) return;
      map.flyTo({ center: center, offset: offset, zoom: STOP_ZOOM, pitch: tilt(STOP_PITCH), bearing: turnTo(b), duration: FLY_MS });
      // 도착한(움직임이 끝난) 뒤 장소 둘레를 천천히 돌아 입체감을 준다. 휴대폰이 느려 늦게 도착해도 거른다
      map.once('moveend', function () {
        if (is2d || my !== flyToken || !mapReady || reducedMotion()) return;
        // 멀리서 내려오며 기울기가 덜 된 채 끝났으면 여기서 마저 기울인다
        map.easeTo({ center: center, offset: offset, pitch: tilt(STOP_PITCH), bearing: b + ORBIT_DEG, duration: opt.orbitMs || 3600, easing: function (x) { return x; } });
      });
    }, wait);
  }

  var firstFit = true;
  /* 지도 '가운데'를 위 메뉴(날짜)와 아래 버튼 줄 사이 빈 공간으로 맞춘다 → 장소·동선이 메뉴에 가리지 않는다 */
  function fitViewPadding() {
    if (!mapReady) return;
    var r = $('map').getBoundingClientRect(), top = $('top').getBoundingClientRect(), bar = $('bar').getBoundingClientRect();
    $('app').style.setProperty('--top-h', Math.round(top.bottom - r.top) + 'px');   // 인천 표시 등 위쪽 메뉴 바로 아래에 둘 것
    map.setPadding({ top: Math.max(0, Math.round(top.bottom - r.top) + 6), bottom: Math.max(0, Math.round(r.bottom - bar.top) + 6), left: 0, right: 0 });
  }
  window.addEventListener('resize', function () { setTimeout(fitViewPadding, 120); });

  function fitTo(ids) {
    if (!mapReady) return;
    pauseFollow();
    var dur = firstFit && !reducedMotion() ? 3200 : 1800;   // 처음 열 때는 천천히 날아 내려온다
    firstFit = false;
    flyToken++;
    state.lastPlace = null;
    var pts = ids.filter(onMap).map(function (id) { return [place(id).lng, place(id).lat]; });
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo({ center: pts[0], zoom: 16, pitch: tilt(STOP_PITCH), bearing: turnTo(-20), duration: 1800 }); return; }
    var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach(function (p) { b.extend(p); });
    var wide = window.innerWidth >= 900;
    map.fitBounds(b, {
      padding: wide ? { top: 40, bottom: 40, left: 90, right: 90 } : { top: 40, bottom: 40, left: 70, right: 70 },   // 위·아래 메뉴만큼은 fitViewPadding 이 이미 비워 둔다   // 위 날짜 줄·아래 버튼 줄과 펼친 마커가 가려지지 않게
      pitch: tilt(55), bearing: turnTo(-20), maxZoom: 16.2, duration: dur
    });
  }

  function viewPlaceIds() {
    var ids = [];
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        (it.places || []).forEach(function (id) { if (onMap(id) && ids.indexOf(id) < 0) ids.push(id); });
      });
    });
    return ids;
  }

  function updateMap(moveCamera) {
    if (!mapReady) return;
    if (popup) { popup.remove(); popup = null; }
    Object.keys(markers).forEach(function (k) { markers[k].remove(); });
    markers = {};

    var ids = viewPlaceIds();
    var nums = state.day === 'all' ? {} : numbering(state.day);
    var color = state.day === 'all' ? '#0b6e99' : dayInfo(state.day).color;
    ids.forEach(function (id, i) {
      var p = place(id);
      var t = PLACE_TYPES[p.type] || { icon: '📍' };
      var el = document.createElement('div');
      el.className = state.day === 'all' ? 'mk small' : 'mk';   // 전체 보기에서는 작게
      el.style.setProperty('--d', Math.min(i, 16) * 45 + 'ms');    // 하나씩 톡톡 튀어나오게
      el.style.setProperty('--mk-color', color);
      el.textContent = t.icon;
      if (nums[id]) { var n = document.createElement('span'); n.className = 'n'; n.textContent = nums[id]; el.appendChild(n); }
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        stopTour();
        flyToPlace(id, { sheet: true });
        openPopup(id);
        showPlace(id);
      });
      markers[id] = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
      el.setAttribute('role', 'button');          // 화면 읽기 프로그램이 장소 이름을 읽도록
      el.setAttribute('aria-label', p.name);
    });
    spreadMarkers();
    if (eatsOn) setEatPins(true);   // 🍴 맛집 핀: 그날 일정 마커와 겹치는 곳은 다시 뺀다
    if (map.getLayer('tour-tall-roofs')) map.setPaintProperty('tour-tall-roofs', 'fill-extrusion-color', roofColor());
    if (map.getLayer('tour-tall-flat')) map.setPaintProperty('tour-tall-flat', 'fill-color', roofColor());
    if (map.getLayer('tour-tall-glow')) map.setPaintProperty('tour-tall-glow', 'line-color', roofColor(true));
    refreshTallColors();

    // 동선 선: 고른 날짜는 진하게, 나머지는 흐리게
    var feats = D.days.map(function (d) {
      var c = routeCoords(d.date);
      return {
        type: 'Feature',
        properties: { color: d.color, active: state.day === d.date ? 1 : 0 },   // '전체'에서는 동선 선을 그리지 않는다 (장소 마커만)
        geometry: { type: 'LineString', coordinates: c.length > 1 ? c : [] }
      };
    }).filter(function (f) { return f.geometry.coordinates.length > 1; });
    var src = map.getSource('routes');
    if (src) drawRoutes(src, feats);
    dashUntil = Date.now() + 8000;

    if (moveCamera) fitTo(ids);
    flightFx();
  }

  /* 화면에서 서로 겹치는 마커(같은 건물 안의 일정 등)는 원래 자리 둘레로 동그랗게 펼쳐 모두 보이게 한다 */
  var SPREAD_PX = 34;
  function spreadMarkers() {
    if (!mapReady) return;
    var ids = Object.keys(markers), pts = {}, used = {};
    ids.forEach(function (id) { pts[id] = map.project(markers[id].getLngLat()); });
    ids.forEach(function (id) {
      if (used[id]) return;
      var group = [id]; used[id] = true;
      ids.forEach(function (o) {
        if (used[o]) return;
        if (group.some(function (g) { return Math.hypot(pts[g].x - pts[o].x, pts[g].y - pts[o].y) < SPREAD_PX; })) { group.push(o); used[o] = true; }
      });
      if (group.length === 1) { markers[id].setOffset([0, 0]); return; }
      var cx = 0, cy = 0;
      group.forEach(function (g) { cx += pts[g].x; cy += pts[g].y; });
      cx /= group.length; cy /= group.length;
      var r = 16 + group.length * 6;
      group.forEach(function (g, i) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / group.length;
        markers[g].setOffset([cx + Math.cos(a) * r - pts[g].x, cy + Math.sin(a) * r - pts[g].y]);
      });
    });
  }

  function add3dBuildings() {
    try {
      var layers = map.getStyle().layers || [];
      var has = false;
      var H = ['coalesce', ['get', 'render_height'], 5];
      var srcId = null, bLayer = null;
      layers.forEach(function (l) {
        if (!srcId && l['source-layer'] === 'building') srcId = l.source;
        if (l.type === 'fill-extrusion') {
          has = true; bLayer = l.id;
          map.setLayerZoomRange(l.id, 13, 24);
          map.setPaintProperty(l.id, 'fill-extrusion-color', '#ebeae6');
          map.setPaintProperty(l.id, 'fill-extrusion-opacity', 1);
        }
      });
      if (!has && srcId) {
        bLayer = 'tour-3d-buildings';
        map.addLayer({
          id: bLayer, type: 'fill-extrusion', source: srcId, 'source-layer': 'building', minzoom: 13,
          paint: { 'fill-extrusion-color': '#ebeae6', 'fill-extrusion-height': H,
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 1 }
        });
      }
      if (bLayer) {
        // 주변 건물은 옅은 회색 벽에 흐린 창문 무늬만 입혀, 일정에 있는 건물이 눈에 띄게 한다
        // 주변 건물은 옅은 색으로 물러나게: 낮은 건물은 민무늬, 높은 건물은 옅은 가로 띠창 (일정 건물의 격자 창과 구별된다)
        // 실제 마카오처럼: 낮은 건물은 따뜻한 미색 벽에 작은 창, 중간 높이는 연한 회색 벽에 창, 고층은 푸른 유리 띠
        map.setPaintProperty(bLayer, 'fill-extrusion-pattern',
          ['step', H, windowPattern('#ece4d6', '#d6cfc2', 'small'), 15, windowPattern('#e6e3dc', '#c7ccd0', 'bands'), 45, windowPattern('#dfe4e7', '#a9b9c4', 'glass')]);
        map.setPaintProperty(bLayer, 'fill-extrusion-vertical-gradient', true);
        // 주변 건물 지붕도 회색 계열로만
        map.addLayer({
          id: 'tour-roofs', type: 'fill-extrusion', source: srcId, 'source-layer': 'building', minzoom: 13,
          paint: {
            'fill-extrusion-color': ['step', H, '#ddd5c8', 15, '#d6d6d2', 45, '#c9d1d6'],
            'fill-extrusion-base': H,
            'fill-extrusion-height': ['+', H, 1.2],
            'fill-extrusion-opacity': 1
          }
        });
      }
      // 공개 지도에 높이가 없어 납작하게 나오는 주요 건물(data.js 에 height 나 look 을 적은 장소)을 대략의 높이와 실제에 가까운 색으로 그린다
      // 2D 지도용 평면 건물 (2D 를 고르면 입체 건물 대신 보인다)
      if (srcId) map.addLayer({ id: 'tour-flat', type: 'fill', source: srcId, 'source-layer': 'building', minzoom: 13,
        layout: { visibility: 'none' }, paint: { 'fill-color': '#e4e2dc', 'fill-outline-color': '#cfccc4' } });
      map.addSource('tour-tall', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // 일정 건물 바닥 둘레에 그날 색으로 은은하게 빛나는 테두리
      map.addLayer({ id: 'tour-tall-glow', type: 'line', source: 'tour-tall',
        paint: { 'line-color': roofColor(true), 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 9], 'line-blur': 4, 'line-opacity': .85 } });
      map.addLayer({ id: 'tour-tall-walls', type: 'fill-extrusion', source: 'tour-tall',
        paint: { 'fill-extrusion-pattern': ['get', 'pat'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 } });
      map.addLayer({ id: 'tour-tall-flat', type: 'fill', source: 'tour-tall', layout: { visibility: 'none' },
        paint: { 'fill-color': roofColor(), 'fill-opacity': .7, 'fill-outline-color': '#a89f92' } });
      map.addLayer({ id: 'tour-tall-roofs', type: 'fill-extrusion', source: 'tour-tall',
        paint: { 'fill-extrusion-color': roofColor(), 'fill-extrusion-base': ['get', 'h'], 'fill-extrusion-height': ['+', ['get', 'h'], 1.2], 'fill-extrusion-opacity': 1 } });
      // 카메라가 멈춘 뒤와 지도 조각이 도착한 뒤에 확인한다
      var tallTimer = null;
      var later = function () { clearTimeout(tallTimer); tallTimer = setTimeout(function () { try { raiseFlatBuildings(); } catch (e) { if (window.__map) console.error('raiseFlatBuildings', e && e.stack); } }, 700); };
      map.on('moveend', later);
      // 건물 지도 조각이 도착했을 때만 다시 본다. (배·비행기 애니메이션이 초당 수십 번 'sourcedata' 를 보내서,
      // 예전엔 기다리기만 하고 색칠이 영영 실행되지 않았다)
      map.on('sourcedata', function (e) { if (e.sourceId === srcId && e.tile) later(); });
      simplifyBaseMap();
      // 남동쪽에서 비추는 햇빛: 건물 면마다 밝기가 달라져 입체감이 생긴다
      map.setLight({ anchor: 'map', color: '#fff4e2', intensity: 0.42, position: [1.3, 210, 45] });
      addRelief();
      applyWeatherLook();
    } catch (e) { /* 3D 건물을 못 세워도 지도는 계속 쓴다 */ }
  }

  /* ---------- 지금 날씨에 맞춘 지도 분위기 (맑음·흐림·비·밤). 마카오 현재 날씨를 30분마다 받는다 ---------- */
  var WXNOW = null, WXNOW_KEY = 'macau-wxnow', WXFX_KEY = 'macau-wxfx';
  var SKY = {
    clear:  { sky: '#a9cbe3', hor: '#eef1ee', fog: '#e6ebe8', light: '#fff4e2', li: 0.42, filter: '' },
    cloudy: { sky: '#b7c0c7', hor: '#dfe2e2', fog: '#d9dcdc', light: '#eef0f2', li: 0.3,  filter: 'saturate(.85) brightness(.97)' },
    rain:   { sky: '#8e9aa3', hor: '#c3c9cc', fog: '#bfc6c9', light: '#dfe6ec', li: 0.24, filter: 'saturate(.75) brightness(.9)' },
    night:  { sky: '#0f1d33', hor: '#33415c', fog: '#2a3550', light: '#9fb4ff', li: 0.22, filter: 'brightness(.62) saturate(.85) hue-rotate(8deg)' }
  };
  function wxMode(w) {
    if (!w) return 'clear';
    var c = w.code;
    if (!w.day) return 'night';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
    if (c === 3 || c === 45 || c === 48 || w.cloud >= 75) return 'cloudy';
    return 'clear';
  }
  function wxFxOn() { try { return localStorage.getItem(WXFX_KEY) !== 'off'; } catch (e) { return true; } }
  function applyWeatherLook() {
    var btn = $('wxnow');
    if (WXNOW) {
      btn.hidden = false;
      // 둥근 버튼 안에 날씨 아이콘과 온도만 (효과를 끄면 흐리게)
      btn.innerHTML = '<span class="wx-i">' + (!WXNOW.day && WXNOW.code <= 3 ? '🌙' : wxIcon(WXNOW.code)) + '</span><span class="wx-t">' + WXNOW.temp + '°</span>';
      btn.classList.toggle('off', !wxFxOn());
      btn.setAttribute('aria-pressed', String(wxFxOn()));
      btn.setAttribute('aria-label', '지금 마카오 날씨 ' + WXNOW.temp + '도. 누르면 지도 날씨 효과 ' + (wxFxOn() ? '끄기' : '켜기'));
    }
    if (!mapReady) return;
    var mode = wxFxOn() ? wxMode(WXNOW) : 'clear', s = SKY[mode];
    try {
      if (map.setSky) map.setSky({ 'sky-color': s.sky, 'horizon-color': s.hor, 'fog-color': s.fog,
        'sky-horizon-blend': 0.6, 'horizon-fog-blend': mode === 'rain' ? 0.95 : 0.7, 'fog-ground-blend': mode === 'rain' ? 0.6 : 0.85, 'atmosphere-blend': 0.6 });
      map.setLight({ anchor: 'map', color: s.light, intensity: s.li, position: [1.3, 210, 45] });
    } catch (e) { /* 무시 */ }
    map.getCanvas().style.filter = s.filter;
    eiffelNight(mode === 'night');
    // 빗줄기: 지도 그림 바로 위, 마커 아래
    var rain = document.getElementById('wx-rain');
    if (mode === 'rain' && !reducedMotion()) {
      if (!rain) {
        rain = document.createElement('div'); rain.id = 'wx-rain';
        var cv = map.getCanvas(); cv.parentNode.insertBefore(rain, cv.nextSibling);
      }
    } else if (rain) rain.remove();
  }
  function loadNowWeather() {
    var W = D.weather; if (!W || !window.fetch) return;
    try {
      var c = JSON.parse(localStorage.getItem(WXNOW_KEY) || 'null');
      if (c && Date.now() - c.at < 30 * 60 * 1000) { WXNOW = c.w; applyWeatherLook(); return; }
    } catch (e) { /* 새로 받는다 */ }
    fetch(W.url + '?latitude=' + W.lat + '&longitude=' + W.lng + '&current=weather_code,is_day,temperature_2m,cloud_cover&timezone=Asia%2FMacau')
      .then(function (r) { return r.json(); }).then(function (j) {
        var k = j && j.current; if (!k) return;
        WXNOW = { code: k.weather_code, day: k.is_day === 1, temp: Math.round(k.temperature_2m), cloud: k.cloud_cover };
        try { localStorage.setItem(WXNOW_KEY, JSON.stringify({ at: Date.now(), w: WXNOW })); } catch (e) { /* 무시 */ }
        applyWeatherLook();
      }).catch(function () { /* 날씨를 못 받으면 맑은 하늘 그대로 */ });
  }

  /* 실사 느낌: 지형 음영(언덕·산의 굴곡)과 하늘·안개. 지형 자료는 키가 필요 없는 공개 고도 타일(AWS Terrain Tiles) */
  function addRelief() {
    try {
      if (map.setSky) map.setSky({ 'sky-color': '#a9cbe3', 'horizon-color': '#eef1ee', 'fog-color': '#e6ebe8',
        'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.6 });
    } catch (e) { /* 하늘 없이 */ }
    if (D.map.noDem) return;
    try {
      map.addSource('relief-dem', { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        attribution: 'Terrain: Mapzen/AWS Terrain Tiles' });
      // 땅·녹지 위, 바다 아래에 깐다 → 마카오 바깥을 덮는 회색(바다 바로 아래)이 그 위를 덮어 헝친 쪽 굴곡은 안 보인다
      var before = null;
      (map.getStyle().layers || []).some(function (l) { if (l.type === 'fill' && /water/.test(l.id)) { before = l.id; return true; } return false; });
      map.addLayer({ id: 'relief-shade', type: 'hillshade', source: 'relief-dem', maxzoom: 17,
        paint: { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#5c6b55', 'hillshade-highlight-color': '#fbf6e8',
          'hillshade-accent-color': '#7a8a6a', 'hillshade-illumination-direction': 315 } }, before || undefined);
    } catch (e) { /* 지형 음영 없이 */ }
  }

  /* 벽 색(wall)과 유리 색(glass)으로 창문 무늬 그림을 만들어 지도에 등록하고 그 이름을 돌려준다 */
  function windowPattern(wall, glass, kind) {
    kind = kind || 'grid';
    var name = 'win-' + kind + wall + glass;
    if (map.hasImage(name)) return name;
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    var g = cv.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, 32, 32);
    g.fillStyle = glass;
    if (kind === 'grid') {          // 일정 건물: 또렷한 격자 창
      [2, 10, 18, 26].forEach(function (x) { [2, 10, 18, 26].forEach(function (y) { g.fillRect(x, y, 4, 5); }); });
    } else if (kind === 'bands') {  // 중간 높이: 옅은 가로 띠창
      [5, 21].forEach(function (y) { g.fillRect(0, y, 32, 4); });
    } else if (kind === 'small') {  // 낮은 건물: 작은 창 두 줄
      [4, 20].forEach(function (x) { [6, 22].forEach(function (y) { g.fillRect(x, y, 6, 5); }); });
    } else if (kind === 'glass') {  // 고층: 푸른 유리 커튼월 (가는 세로 기둥만 벽색)
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = wall;
      [0, 16].forEach(function (x) { g.fillRect(x, 0, 2, 32); });
      [0, 16].forEach(function (y) { g.fillRect(0, y, 32, 1); });
    }                               // plain: 창 없이 벽만
    var img = g.getImageData(0, 0, 32, 32);
    map.addImage(name, { width: 32, height: 32, data: new Uint8Array(img.data.buffer) });
    return name;
  }

  /* 높이가 적힌 장소(height)가 납작한 건물 위에 있으면, 그 건물 바닥 모양을 그대로 써서 적힌 높이로 세운다 */
  /* 또 look(벽·유리·지붕 색)이 적힌 장소는 그 건물(과 radius 미터 안의 건물)을 그 색으로 칠한다 */
  /* 일정에 있는 건물 표시 색: 지붕은 모두 주황색, 벽은 장소마다 적어 둔 색(look)이 없으면 아래 색 */
  /* 두 색을 섞는다 (t=0 이면 a, 1 이면 b) */
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
    [16, 8, 0].forEach(function (sh) {
      var x = Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      out += (x < 16 ? '0' : '') + x.toString(16);
    });
    return out;
  }
  /* 일정 건물 지붕 색: 그 장소를 가는 날의 색(날짜 탭·동선과 같은 색)을 옅게.
   * 날짜를 고르면 그날 건물만 그날 색으로, 다른 날 건물은 차분한 베이지로 */
  /* 지금 보는 날짜에서 그 장소의 날짜 색 (없으면 null) */
  function dayColorOf(pid) {
    var col = null;
    D.days.some(function (d) {
      if (state.day !== 'all' && state.day !== d.date) return false;
      var hit = items(d.date).some(function (it) { return (it.places || []).indexOf(pid) >= 0; });
      if (hit) col = d.color;
      return hit;
    });
    return col;
  }
  /* 일정 건물 벽: 실제 색(look)에 그날 색을 섞어 칠한다 (날짜를 바꾸면 다시 칠함) */
  function refreshTallColors() {
    if (!mapReady || !tallFeatures.length || !map.getSource('tour-tall')) return;
    tallFeatures.forEach(function (f) {
      var pr = f.properties, c = dayColorOf(pr.pid);
      var wall = c ? mix(pr.wall, c, state.day === 'all' ? .3 : .42) : pr.wall;
      var glass = c ? mix(pr.glass, c, .35) : pr.glass;
      pr.pat = windowPattern(wall, glass);
    });
    map.getSource('tour-tall').setData({ type: 'FeatureCollection', features: tallFeatures });
  }
  function roofColor(strong) {
    var expr = ['match', ['get', 'pid']], seen = {};
    D.days.forEach(function (d) {
      items(d.date).forEach(function (it) {
        (it.places || []).forEach(function (id) {
          if (seen[id] || !D.places[id]) return;
          var today = state.day === 'all' || state.day === d.date;
          if (state.day !== 'all' && !today) return;
          seen[id] = true;
          expr.push(id, strong ? d.color : mix(d.color, '#ffffff', state.day === 'all' ? .45 : .22));
        });
      });
    });
    expr.push(strong ? 'rgba(0,0,0,0)' : '#e4ded4');
    return expr.length > 3 ? expr : (strong ? 'rgba(0,0,0,0)' : '#e4ded4');
  }
  var ACCENT = { wall: '#f1e6d6', glass: '#a08a72' }, NEAR_M = 18;
  var tallKeys = {}, tallFeatures = [];   // 지도 조각이 나중에 도착해도 빠진 건물을 이어서 칠한다
  function raiseFlatBuildings() {
    if (!mapReady || map.getZoom() < 14.5) return;
    var changed = false, all = null;
    Object.keys(D.places).forEach(function (id) {
      var p = D.places[id];
      if (!onMap(id) || p.model) return;      // 직접 만든 모형(에펠탑)은 건물 색칠에서 뺀다
      var pt = map.project([p.lng, p.lat]);
      var c = map.getContainer();
      if (pt.x < 0 || pt.y < 0 || pt.x > c.clientWidth || pt.y > c.clientHeight) return;
      if (!all) {
        // 지도 자료는 여러 건물을 한 덩어리(MultiPolygon)로 묶어 주기도 하므로, 건물 하나씩으로 나눠서 본다
        all = [];
        map.querySourceFeatures(map.getLayer('tour-roofs').source, { sourceLayer: 'building' }).forEach(function (f) {
          var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
          if (HIDE_BUILDING_IDS.indexOf(f.id) >= 0) return;   // 모형으로 바꾼 건물(그랜드 리스보아 등)은 색칠하지 않는다
          polys.forEach(function (rings) { all.push({ rings: rings, props: f.properties }); });
        });
      }
      var look = p.look || {}, here = [p.lng, p.lat];
      var pat = null;
      all.forEach(function (o) {
        var geom = { type: 'Polygon', coordinates: o.rings };
        var own = insidePolygon(here, geom);
        if (!own && !nearPolygon(here, geom, look.radius || NEAR_M)) return;
        var first = o.rings[0][0];
        var key = first[0].toFixed(6) + ',' + first[1].toFixed(6);
        if (tallKeys[key]) return;                   // 이미 다른 장소의 색으로 칠한 건물은 건드리지 않는다
        tallKeys[key] = true; changed = true;
        var wall0 = look.wall || ACCENT.wall, glass0 = mix(look.glass || ACCENT.glass, wall0, .35);
        pat = pat || windowPattern(wall0, glass0);
        var h = Math.max(o.props.render_height || 5, own && p.height ? p.height : 0);
        // 원래 건물과 벽·지붕이 정확히 겹치면 카메라가 돌 때 깜빡이므로, 바깥으로 0.8m 넓히고 조금 높인다
        tallFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: o.rings.map(growRing) },
          properties: { h: h + 1.4, b: o.props.render_min_height || 0, pat: pat, pid: id, wall: wall0, glass: glass0 } });
      });
    });
    if (changed) refreshTallColors();
  }
  /* 건물 바깥선을 중심에서 바깥쪽으로 0.8m 넓힌다 */
  function growRing(ring) {
    var cx = 0, cy = 0;
    ring.forEach(function (v) { cx += v[0]; cy += v[1]; });
    cx /= ring.length; cy /= ring.length;
    var k = Math.cos(cy * Math.PI / 180);
    return ring.map(function (v) {
      var dx = (v[0] - cx) * 111320 * k, dy = (v[1] - cy) * 111320, d = Math.sqrt(dx * dx + dy * dy) || 1;
      return [v[0] + dx / d * 0.8 / (111320 * k), v[1] + dy / d * 0.8 / 111320];
    });
  }
  /* 건물 바깥선의 어느 꼭짓점이든 pt 에서 r 미터 안에 있는지 */
  function nearPolygon(pt, geom, r) {
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    return polys.some(function (rings) { return rings[0].some(function (v) { return distanceM(pt, v) < r; }); });
  }
  function insidePolygon(pt, geom) {
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    return polys.some(function (rings) {
      var ring = rings[0], inside = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[i], b = ring[j];
        if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    });
  }

  /* 바탕 지도의 땅·바다·도로·녹지를 차분한 색으로 바꾼다. 글자(가게·시설·도로 이름)는 남긴다 */
  function simplifyBaseMap() {
    (map.getStyle().layers || []).forEach(function (l) {
      var id = l.id, set = function (k, v) { try { map.setPaintProperty(id, k, v); } catch (e) { /* 무시 */ } };
      if (l.type === 'symbol') {
        // 바탕 지도의 가게·시설·도로·동네 이름은 그대로 둔다. 도로 번호판과 나라·주 이름만 숨긴다
        if (/shield|country|state|continent/.test(id)) map.setLayoutProperty(id, 'visibility', 'none');
      } else if (l.type === 'background') {
        set('background-color', '#d9d6cc');
      } else if (l.type === 'fill') {
        if (/water/.test(id)) set('fill-color', SEA_COLOR);
        else if (/park|wood|grass|landcover|green|pitch|cemetery/.test(id)) { set('fill-color', '#a9b79a'); set('fill-opacity', 0.9); }
        else if (/building/.test(id)) set('fill-color', '#cbc7bb');
        else if (/aeroway/.test(id)) set('fill-color', '#c9c6bc');
        else { set('fill-color', '#d4d1c7'); }
        try { map.setPaintProperty(id, 'fill-pattern', undefined); } catch (e) { /* 무시 */ }
      } else if (l.type === 'line') {
        if (/water/.test(id)) set('line-color', SEA_COLOR);
        else if (/boundary|ferry|cablecar|rail|pier/.test(id)) map.setLayoutProperty(id, 'visibility', 'none');
        else if (/casing/.test(id)) set('line-color', '#b3b0a6');
        else set('line-color', '#c6c3b9');
      }
    });
  }

  /* 지도 위 글자: 한국어 이름이 등록된 곳(마카오, 코타이, 베네시안 등)은 한국어로 보여 준다 */
  function localizeLabels() {
    try {
      (map.getStyle().layers || []).forEach(function (l) {
        var tf = l.type === 'symbol' && l.layout && l.layout['text-field'];
        if (!Array.isArray(tf) || JSON.stringify(tf).indexOf('name') < 0) return;   // 도로 번호 등은 그대로 둔다
        // 순서: 지도에 등록된 한글 이름 → 한글 사전(ko-names.js) → 영어 한 줄 → 원래 이름
        map.setLayoutProperty(l.id, 'text-field', ['coalesce',
          ['get', 'name:ko'],
          ['get', ['to-string', ['get', 'name']], ['literal', window.KO_NAMES || {}]],
          ['get', ['to-string', ['get', 'name:en']], ['literal', window.KO_NAMES || {}]],
          ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
      });
    } catch (e) { /* 바꾸지 못하면 원래 글자 그대로 쓴다 */ }
  }

  /* 마카오 바깥(헝친·주하이)은 바다색으로 덮는다. 바다와 같은 색이라 경계선이 보이지 않고, 마카오만 섬처럼 남는다 */
  /* 바다는 가운데 물길과 바깥까지 모두 남기고, 마카오 밖의 땅(헝친·주하이)만 흐린 회색으로 칠한다 */
  var SEA_COLOR = '#6f98a0';
  var MASK_COLOR = '#ccceca';
  function addAreaMask() {
    var ring = D.map.area;
    if (!ring || ring.length < 4) return;
    try {
      var hole = ring.map(function (p) { return [p[0], p[1]]; });
      var world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      map.addSource('tour-mask', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, hole] } } });
      // 바깥 땅 덮개는 바다(물) 층 바로 아래에 둔다 → 바깥 땅은 회색, 바다는 그 위에 그대로 하늘색
      var waterId = null;
      (map.getStyle().layers || []).forEach(function (l) { if (!waterId && l.type === 'fill' && l['source-layer'] === 'water') waterId = l.id; });
      map.addLayer({ id: 'tour-mask-0', type: 'fill', source: 'tour-mask', paint: { 'fill-color': MASK_COLOR, 'fill-antialias': false } }, waterId || undefined);
      // 바깥의 도로·글자는 그리지 않는다 (마카오 영역 안에 있는 것만)
      var inside = ['within', { type: 'Polygon', coordinates: [hole] }];
      // 바탕 지도의 시설 표시 거르기: 안내판(ℹ️ 숲길 번호 등)·자잘한 시설은 숨기고, 버스 정류장은 일정 동선 근처(약 150m)만 남긴다
      var JUNK = ['information', 'entrance', 'gate', 'lift_gate', 'bollard', 'recycling', 'waste_basket', 'drinking_water', 'bicycle_parking', 'telephone', 'shelter', 'toilets'];
      var noBus = ['all',
        ['match', ['get', 'class'], JUNK, false, true],
        ['any', ['!=', ['get', 'class'], 'bus'], ['within', routeCorridor(150)]]];
      (map.getStyle().layers || []).forEach(function (l) {
        if (l.id.indexOf('tour-') === 0) return;
        var sl = l['source-layer'];
        if (l.type === 'symbol' || (l.type === 'line' && /transportation|aeroway|boundary/.test(sl || ''))) {
          var f = l.filter, add = sl === 'poi' ? ['all', inside, noBus] : inside;
          try { map.setFilter(l.id, f ? ['all', f, add] : add); } catch (e) { /* 이 층은 그대로 둔다 */ }
        }
      });
    } catch (e) { /* 덮지 못해도 지도는 그대로 쓴다 */ }
  }

  /* ---------- 🚢 바다 위 3D 배 ----------
   * 고속 여객선(홍콩행 페리)·작은 배가 바다 뱃길을 천천히 오간다. 뱃길은 모두 바다 위인지 확인한 선이다.
   * 공항 여객기와 같은 방식(입체 도형)이고, 화면에 보이는 배만 그린다 */
  var SHIP_MODELS = {
    // 고속 여객선: 흰 선체, 빨간 띠, 짙은 창, 위 갑판
    ferry: [
      [[[-5, -22], [5, -22], [5, 14], [3, 20], [0, 23], [-3, 20], [-5, 14]], 0, 3.5, '#f4f6f8'],
      [[[-5.1, -22], [5.1, -22], [5.1, 12], [-5.1, 12]], 2.2, 3, '#d2453a'],
      [[[-4, -16], [4, -16], [4, 9], [2.5, 13], [-2.5, 13], [-4, 9]], 3.5, 7, '#e9edf1'],
      [[[-4.05, -14], [4.05, -14], [4.05, 10], [-4.05, 10]], 5, 6.1, '#1f3b57'],
      [[[-2.5, 2], [2.5, 2], [2.5, 8], [-2.5, 8]], 7, 9, '#f4f6f8']
    ],
    // 작은 배: 남색 선체, 흰 조타실
    boat: [
      [[[-2.5, -9], [2.5, -9], [2.5, 5], [0, 10], [-2.5, 5]], 0, 2, '#2f5d7c'],
      [[[-1.8, -6], [1.8, -6], [1.8, 0], [-1.8, 0]], 2, 4.5, '#f4f6f8'],
      [[[-1.85, -4], [1.85, -4], [1.85, -1], [-1.85, -1]], 3.2, 4, '#1f3b57']
    ]
  };
  var SHIPS = [
    { model: 'ferry', speed: 9, path: [[113.574, 22.1880], [113.585, 22.196], [113.603, 22.203]] },   // 외항 페리 → 홍콩 방향
    { model: 'ferry', speed: 9, path: [[113.5835, 22.1668], [113.590, 22.1700], [113.606, 22.1760]], phase: .5 },   // 타이파 페리 터미널
    { model: 'boat', speed: 4, path: [[113.547, 22.1775], [113.560, 22.1810], [113.575, 22.1850]] },   // 반도·타이파 사이 물길
    { model: 'boat', speed: 3.5, path: [[113.575, 22.1120], [113.590, 22.1060], [113.605, 22.1120]], phase: .3 },   // 콜로안 남쪽
    { model: 'boat', speed: 4, path: [[113.600, 22.145], [113.606, 22.160], [113.604, 22.135]], phase: .6 },   // 공항 동쪽 바다
    { model: 'boat', speed: 3, path: [[113.583, 22.121], [113.595, 22.119], [113.603, 22.124]], phase: .2 }    // 카호 앞바다
  ];
  var ships = { token: 0, raf: 0 };
  function modelFeatures(parts, pos, hdg, S, wake) {
    var k = 111320 * Math.cos(pos[1] * Math.PI / 180), r = hdg * Math.PI / 180;
    var toLL = function (x, y) { var e = x * Math.cos(r) + y * Math.sin(r), n = -x * Math.sin(r) + y * Math.cos(r); return [pos[0] + e * S / k, pos[1] + n * S / 111320]; };
    var out = parts.map(function (pt) {
      var ring = pt[0].map(function (v) { return toLL(v[0], v[1]); }); ring.push(ring[0]);
      return { type: 'Feature', properties: { b: pt[1] * S, h: pt[2] * S, c: pt[3] }, geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    if (wake) {   // 뒤로 퍼지는 흰 물결
      var w = [toLL(-3, -20), toLL(3, -20), toLL(8, -46), toLL(-8, -46)]; w.push(w[0]);
      out.push({ type: 'Feature', properties: { wake: 1 }, geometry: { type: 'Polygon', coordinates: [w] } });
    }
    return out;
  }
  /* ---------- 🗼 파리지앵 에펠탑 입체 모형 (실제 탑의 절반 크기, 높이 약 160m) ----------
   * 네 다리가 위로 갈수록 안쪽으로 모이고, 1층(약 29m)·2층(약 58m) 전망대, 가늘어지는 몸통, 꼭대기 첨탑 */
  function eiffelFeatures() {
    var p = D.places.eiffel; if (!p) return [];
    var lat0 = p.lat, lng0 = p.lng, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 111320;
    var feats = [];
    function box(cx, cy, w, d, b, h, part) {   // 가운데 (cx, cy)m, 폭 w·깊이 d m, 바닥 b·높이 h m
      var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
      var ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(function (v) { return [lng0 + v[0] / kx, lat0 + v[1] / ky]; });
      feats.push({ type: 'Feature', properties: { b: b, h: h, part: part }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
    // 네 다리: 바닥에서 2층까지 4m 마디로, 다리 사이 거리와 굵기가 줄어든다
    for (var z = 0; z < 58; z += 4) {
      var t = z / 58, off = 27 * Math.pow(1 - t, 1.35) + 3.2, w = 9 - 5.2 * t;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { box(s[0] * off, s[1] * off, w, w, z, z + 4.2, 'leg'); });
      if (z < 24) {   // 1층 아래 아치: 다리 사이를 잇는 가는 테
        var a = off - w / 2;
        if (z >= 16) { box(0, off, 2 * a, 1.2, z + 2, z + 3.4, 'arch'); box(0, -off, 2 * a, 1.2, z + 2, z + 3.4, 'arch'); box(off, 0, 1.2, 2 * a, z + 2, z + 3.4, 'arch'); box(-off, 0, 1.2, 2 * a, z + 2, z + 3.4, 'arch'); }
      }
    }
    box(0, 0, 38, 38, 28, 31.5, 'deck');     // 1층 전망대
    box(0, 0, 18, 18, 56.5, 59.5, 'deck');   // 2층 전망대
    // 몸통: 2층 위로 점점 가늘어진다
    for (var y = 59.5; y < 140; y += 5) {
      var u = (y - 59.5) / 80.5, s2 = 11 - 8 * Math.pow(u, 0.8);
      box(0, 0, s2, s2, y, y + 5.2, 'shaft');
    }
    box(0, 0, 5, 5, 140, 146, 'top');         // 꼭대기 전망대
    box(0, 0, 1.4, 1.4, 146, 162, 'spire');   // 첨탑
    return feats;
  }
  /* 직접 만든 모형과 겹치는 바탕 지도(OpenStreetMap) 건물 번호: 에펠탑 층별 덩어리, 마카오 타워, 그랜드 리스보아 */
  var HIDE_BUILDING_IDS = [14699807400, 14699807440, 14699807560, 14699807480, 14699807500, 14699807592, 14699807552, 4424626772,
    8489778690, 8481990182, 8481990192, 649339742, 8481990200, 2310745612, 8481990232, 8481990222,
    1921824052, 27801710];   // … 그랜드 리스보아, 성 바울 성당 유적(통짜 덩어리)

  /* ---------- 🏛️ 랜드마크 입체 모형: 마카오 타워 · 그랜드 리스보아 · 성 바울 성당 유적 · 런더너 빅벤 · 스튜디오 시티 8자 관람차 ----------
   * 모양은 사진을 참고해 단순화한 것. 크기(m)는 실제에 가깝게 */
  var LANDMARKS = [
    { id: 'macautower', lng: 113.53680, lat: 22.17981, build: function (m) {
      m.cyl(0, 0, 26, 0, 18, '#d9d6cf');                 // 아래 건물
      for (var k = 0; k < 3; k++) { var a = k * 2.094; m.box(Math.cos(a) * 7, Math.sin(a) * 7, 5, 5, 18, 185, '#eceae4'); }   // 세 기둥
      m.cyl(0, 0, 6.5, 18, 190, '#f4f2ec');              // 가운데 몸통
      m.cyl(0, 0, 17, 185, 190, '#cfd3d6');
      m.cyl(0, 0, 23, 190, 205, '#5f7f99');              // 유리 전망대
      m.cyl(0, 0, 24, 205, 209, '#e7e5df');
      m.cyl(0, 0, 19, 209, 223, '#6d8aa3');
      m.cyl(0, 0, 12, 223, 232, '#e7e5df');
      m.cyl(0, 0, 2.2, 232, 300, '#f1f1ee');             // 안테나
      m.cyl(0, 0, 1, 300, 338, '#d33b2c');
    } },
    { id: 'grandlisboa', lng: 113.54337, lat: 22.19100, build: function (m) {
      for (var z = 0; z < 40; z += 4) m.cyl(0, 0, 42 * Math.sqrt(1 - Math.pow(z / 44, 2)), z, z + 4.2, '#d8b14a');   // 금빛 알 모양 아래층
      for (var y = 40; y < 205; y += 6) {                // 연꽃: 위로 갈수록 넓어지는 탑
        var t = (y - 40) / 165, w = 22 + 30 * Math.pow(t, 2.2);
        m.box(0, 0, w, w * 0.62, y, y + 6.2, t > 0.85 ? '#f0cf6a' : (Math.round(y / 6) % 2 ? '#c99a3a' : '#b98a2e'));
      }
      for (var k = 0; k < 8; k++) { var a = k * 0.785; m.box(Math.cos(a) * 26, Math.sin(a) * 18, 6, 6, 205, 228 - (k % 2) * 8, '#f6dc86'); }   // 꽃잎 끝
      m.cyl(0, 0, 4, 205, 238, '#fff1b8');
    } },
    { id: 'stpaul', lng: 113.54086, lat: 22.19758, build: function (m) {
      var S = '#d8c39b', D = '#c9b083';
      // 1층: 문 3개 (기둥 사이를 비워 문처럼)
      [[-11, 3], [-5.5, 2], [0, 1.2], [5.5, 2], [11, 3]].forEach(function (c) { if (c[0] === 0) return; m.box(c[0], 0, c[1] * 1.6, 2.2, 0, 8, S); });
      m.box(0, 0, 25, 2.2, 6, 8.6, D);
      m.box(-8.25, 0, 2.6, 2.2, 0, 6, S); m.box(8.25, 0, 2.6, 2.2, 0, 6, S);
      // 2층: 창 3개
      [-10, -4.5, 4.5, 10].forEach(function (x) { m.box(x, 0, 3.4, 2, 8.6, 14.6, S); });
      m.box(-7.25, 0, 2.1, 2, 8.6, 10.5, S); m.box(7.25, 0, 2.1, 2, 8.6, 10.5, S); m.box(0, 0, 5.6, 2, 8.6, 10, S);
      m.box(0, 0, 23, 2, 13.2, 15.4, D);
      // 3층: 가운데 둥근 창
      m.box(0, 0, 16, 1.8, 15.4, 20.6, S); m.box(0, -0.6, 4, 1, 17, 19.4, '#7a6447');
      m.box(0, 0, 17, 1.8, 20.2, 21, D);
      // 4층 + 박공 + 십자가
      m.box(0, 0, 9, 1.6, 21, 24, S);
      m.box(0, 0, 7, 1.6, 24, 25.5, S); m.box(0, 0, 4.5, 1.6, 25.5, 26.8, S); m.box(0, 0, 2, 1.6, 26.8, 27.8, S);
      m.box(0, 0, 0.5, 0.5, 27.8, 30, '#bfa77a'); m.box(0, 0, 1.6, 0.5, 29, 29.5, '#bfa77a');
      // 앞 돌계단
      for (var s = 0; s < 6; s++) m.box(0, -3 - s * 2.4, 30 + s * 2, 2.4, 0, 3 - s * 0.5, '#cdbd9f');
    } },
    { id: 'bigben', lng: 113.56510, lat: 22.14600, build: function (m) {
      var W = '#cdb88c', G = '#2f4a3f';
      m.box(0, 0, 11, 11, 0, 62, W);
      for (var z = 6; z < 60; z += 6) m.box(0, 0, 11.6, 11.6, z, z + 0.6, '#b7a272');   // 가로 띠
      m.box(0, 0, 13, 13, 62, 74, '#e9dcae');            // 시계 칸
      [[0, -6.6], [0, 6.6], [-6.6, 0], [6.6, 0]].forEach(function (c) { m.box(c[0], c[1], c[0] ? 0.4 : 7, c[1] ? 0.4 : 7, 64.5, 71.5, '#fbf6e2'); });   // 시계판
      m.box(0, 0, 11, 11, 74, 82, W);
      m.box(0, 0, 9, 9, 82, 86, G);
      for (var y = 86, s2 = 8; s2 > 0.6; y += 2.4, s2 -= 1.1) m.box(0, 0, s2, s2, y, y + 2.5, G);   // 뾰족 지붕
      m.box(0, 0, 0.5, 0.5, y, y + 5, '#c9a64a');
    } },
    { id: 'goldenreel', lng: 113.56072, lat: 22.14102, build: function (m) {
      // 8자 관람차: 두 원을 위아래로 (세로로 선 바퀴, 동서 방향을 바라봄)
      [[100, 15], [130, 15]].forEach(function (r) {
        for (var k = 0; k < 28; k++) {
          var a = k / 28 * Math.PI * 2, y = Math.cos(a) * r[1], z = r[0] + Math.sin(a) * r[1];
          m.box(0, y, 2.2, 3.6, z - 1.4, z + 1.4, k % 4 ? '#e8c35a' : '#d84a3a');
        }
      });
      m.box(0, 0, 3, 3, 84, 146, '#c9a54a');
    } }
  ];
  function landmarkFeatures() {
    var feats = [];
    LANDMARKS.forEach(function (L) {
      var kx = 111320 * Math.cos(L.lat * Math.PI / 180), ky = 111320;
      var pt = function (x, y) { return [L.lng + x / kx, L.lat + y / ky]; };
      var add = function (ring, b, h, c) { feats.push({ type: 'Feature', properties: { b: b, h: h, c: c, lm: L.id }, geometry: { type: 'Polygon', coordinates: [ring] } }); };
      L.build({
        box: function (cx, cy, w, d, b, h, c) { add([[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2], [cx - w / 2, cy - d / 2]].map(function (v) { return pt(v[0], v[1]); }), b, h, c); },
        cyl: function (cx, cy, r, b, h, c) { var ring = []; for (var i = 0; i <= 20; i++) { var a = i / 20 * Math.PI * 2; ring.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } add(ring, b, h, c); }
      });
    });
    return feats;
  }
  function addLandmarkLayer() {
    try {
      map.addSource('landmarks3d', { type: 'geojson', data: { type: 'FeatureCollection', features: landmarkFeatures() } });
      map.addLayer({ id: 'landmarks3d', type: 'fill-extrusion', source: 'landmarks3d', minzoom: 11,
        paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } });
    } catch (e) { /* 모형 없이 */ }
  }

  function addEiffelLayer() {
    try {
      var f = eiffelFeatures(); if (!f.length) return;
      // 바탕 지도에 있던 에펠탑 자리의 덩어리 건물은 숨긴다 (모형만 보이게)
      (map.getStyle().layers || []).forEach(function (l) {
        if (l['source-layer'] !== 'building' || (l.type !== 'fill-extrusion' && l.type !== 'fill')) return;
        var old = map.getFilter(l.id);
        // 바탕 지도(OpenStreetMap)의 에펠탑 층별 덩어리들 (건물 번호). 모형과 겹치지 않게 숨긴다
        var not = ['!', ['in', ['id'], ['literal', HIDE_BUILDING_IDS]]];
        map.setFilter(l.id, old ? ['all', old, not] : not);
      });
      map.addSource('eiffel3d', { type: 'geojson', data: { type: 'FeatureCollection', features: f } });
      map.addLayer({ id: 'eiffel3d', type: 'fill-extrusion', source: 'eiffel3d', minzoom: 12,
        paint: {
          'fill-extrusion-color': ['match', ['get', 'part'], 'deck', '#6e4a33', 'arch', '#7a5238', 'spire', '#cfa86a', '#8a5d3e'],
          'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1,
          'fill-extrusion-vertical-gradient': true
        } });
      eiffelNight(wxFxOn() && wxMode(WXNOW) === 'night');
    } catch (e) { /* 모형 없이 */ }
  }
  /* 밤에는 금빛 조명 색 (지금 날씨가 밤일 때) */
  function eiffelNight(on) {
    if (!mapReady || !map.getLayer('eiffel3d')) return;
    map.setPaintProperty('eiffel3d', 'fill-extrusion-color', on
      ? ['match', ['get', 'part'], 'deck', '#ffd27a', 'spire', '#fff1b8', '#f2b450']
      : ['match', ['get', 'part'], 'deck', '#6e4a33', 'arch', '#7a5238', 'spire', '#cfa86a', '#8a5d3e']);
  }

  function addShipLayer() {
    try {
      map.addSource('ships', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'ships-wake', type: 'fill', source: 'ships', filter: ['==', ['get', 'wake'], 1], paint: { 'fill-color': '#ffffff', 'fill-opacity': .22 } });
      map.addLayer({ id: 'ships3d', type: 'fill-extrusion', source: 'ships', filter: ['!=', ['get', 'wake'], 1],
        paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1 } });
    } catch (e) { /* 배 없이 지도는 그대로 */ }
  }
  function startShips() {
    ships.token++; cancelAnimationFrame(ships.raf);
    if (!mapReady || !map.getSource('ships')) return;
    var my = ships.token, src = map.getSource('ships'), last = 0;
    // 뱃길마다 길이(m)와 구간 누적 거리
    SHIPS.forEach(function (sh) {
      sh.acc = [0];
      for (var i = 1; i < sh.path.length; i++) sh.acc.push(sh.acc[i - 1] + distanceM(sh.path[i - 1], sh.path[i]));
      sh.len = sh.acc[sh.acc.length - 1];
    });
    var t0 = performance.now();
    (function frame(now) {
      if (my !== ships.token) return;
      ships.raf = requestAnimationFrame(frame);
      if (now - last < 50 || document.hidden) return;   // 초당 약 20번 (배는 느리다)
      last = now;
      var b = map.getBounds(), z = map.getZoom(), feats = [];
      var S = Math.min(8.5, Math.max(2.2, 2.2 * Math.pow(2, (15 - z) * 0.85)));   // 멀리서 볼수록 크게
      var vs = Math.max(1, S / 2.2);                                            // 크게 그리면 그만큼 빨리 (화면에서 비슷한 속도로)
      SHIPS.forEach(function (sh) {
        // 뱃길을 갔다가 돌아온다 (왕복)
        var cyc = 2 * sh.len, dist = ((now - t0) / 1000 * sh.speed * vs * 3 + (sh.phase || 0) * cyc) % cyc, back = dist > sh.len;
        var d = back ? cyc - dist : dist, i = 1;
        while (i < sh.acc.length - 1 && sh.acc[i] < d) i++;
        var a = sh.path[i - 1], c = sh.path[i], u = (d - sh.acc[i - 1]) / ((sh.acc[i] - sh.acc[i - 1]) || 1);
        var pos = [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u];
        if (pos[0] < b.getWest() - .01 || pos[0] > b.getEast() + .01 || pos[1] < b.getSouth() - .01 || pos[1] > b.getNorth() + .01) return;
        var hdg = back ? bearingTo(c, a) : bearingTo(a, c);
        feats = feats.concat(modelFeatures(SHIP_MODELS[sh.model], pos, hdg, S, true));
      });
      src.setData({ type: 'FeatureCollection', features: feats });
    })(t0);
  }

  /* 마지막 날을 고르면 활주로 여객기를 이륙 장면부터 다시 시작한다 (인천 표시·화면 위 비행 효과는 없앰) */
  function endFlight() {}
  function flightFx() {
    if (mapReady && map.getSource('plane3d') && state.day === D.days[D.days.length - 1].date) startPlaneLoop();
  }

  /* ---------- 🛬🛫 마카오 공항 활주로 3D 여객기 ----------
   * 첫날(13:45 도착)은 북쪽에서 내려와 활주로 16 에 착륙, 마지막 날(14:55 출발)은 활주로 34 에서 북쪽으로 이륙.
   * 투어가 공항에 멈출 때, 또는 그날 공항 마커를 누르면 나온다. 지도의 입체 건물 기능(fill-extrusion)으로 공중에 띄운 여객기다 */
  var RWY = { n: [113.58611, 22.16374], s: [113.59670, 22.13501] };   // 활주로 북쪽 끝 · 남쪽 끝 (16/34)
  var plane3d = { token: 0, raf: 0 };
  var PLANE_SCALE = 2.6;   // 실제 크기(길이 약 60m)로는 너무 작아 보여 키운다
  // 여객기 부품 [로컬 좌표(m) 다각형 (x 오른쪽, y 앞쪽), 아래 높이, 위 높이, 색]
  var PLANE_PARTS = [
    [[[-3, -30], [3, -30], [3, 22], [2, 27], [0, 30], [-2, 27], [-3, 22]], 2, 8, '#f7f8fa'],         // 동체
    [[[-30, -6], [-3, 3], [3, 3], [30, -6], [30, -10], [3, -3], [-3, -3], [-30, -10]], 4, 5.2, '#d6dde3'],   // 주날개
    [[[-11, -26], [-2, -22], [2, -22], [11, -26], [11, -29.5], [-11, -29.5]], 6.5, 7.4, '#d6dde3'],   // 꼬리 날개
    [[[-0.7, -30], [0.7, -30], [0.7, -19], [-0.7, -21]], 8, 19, '#4fa3d9'],                            // 수직 꼬리 (하늘색)
    [[[-12.5, -1], [-8.5, -1], [-8.5, 6], [-12.5, 6]], 1.6, 4.4, '#8a96a0'],                         // 엔진 왼쪽
    [[[8.5, -1], [12.5, -1], [12.5, 6], [8.5, 6]], 1.6, 4.4, '#8a96a0'],                             // 엔진 오른쪽
    [[[-3.1, 12], [3.1, 12], [3.1, 14], [-3.1, 14]], 2, 8.2, '#2f6fa8']                               // 동체 줄무늬
  ];
  function addPlane3dLayer() {
    try {
      map.addSource('plane3d', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'plane3d-shadow', type: 'fill', source: 'plane3d', filter: ['==', ['get', 'shadow'], 1],
        paint: { 'fill-color': '#000', 'fill-opacity': ['get', 'op'] } });
      map.addLayer({ id: 'plane3d', type: 'fill-extrusion', source: 'plane3d', filter: ['!=', ['get', 'shadow'], 1],
        paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1 } });
    } catch (e) { /* 여객기 없이 지도는 그대로 */ }
  }
  /* 활주로 축 위 거리 d(m, 북쪽 끝 0 → 남쪽 +)와 옆 거리 → 경도·위도 */
  function rwyPoint(d, side) {
    var k = 111320 * Math.cos(RWY.n[1] * Math.PI / 180);
    var dx = (RWY.s[0] - RWY.n[0]) * k, dy = (RWY.s[1] - RWY.n[1]) * 111320, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    var x = ux * d + uy * (side || 0), y = uy * d - ux * (side || 0);
    return [RWY.n[0] + x / k, RWY.n[1] + y / 111320];
  }
  function rwyLength() { var k = 111320 * Math.cos(RWY.n[1] * Math.PI / 180); return Math.hypot((RWY.s[0] - RWY.n[0]) * k, (RWY.s[1] - RWY.n[1]) * 111320); }
  function rwyHeading() { return bearingTo(RWY.n, RWY.s); }   // 활주로 16 방향 (북 → 남)
  /* 여객기 위치(경도·위도), 진행 방향(도), 고도(m), 기수 들림(도) → 지도에 그릴 도형들 */
  function planeFeatures(pos, hdg, alt, pitchDeg) {
    var k = 111320 * Math.cos(pos[1] * Math.PI / 180), r = hdg * Math.PI / 180,
      S = Math.min(9, Math.max(PLANE_SCALE, PLANE_SCALE * Math.pow(2, (15 - map.getZoom()) * 0.85))),   // 멀리서 볼수록 크게 (늘 눈에 띄게)
      tp = Math.tan((pitchDeg || 0) * Math.PI / 180);
    var toLL = function (x, y) { var e = x * Math.cos(r) + y * Math.sin(r), n = -x * Math.sin(r) + y * Math.cos(r); return [pos[0] + e * S / k, pos[1] + n * S / 111320]; };
    var out = [];
    PLANE_PARTS.forEach(function (pt) {
      var ring = pt[0].map(function (v) { return toLL(v[0], v[1]); }); ring.push(ring[0]);
      var cy = pt[0].reduce(function (a, v) { return a + v[1]; }, 0) / pt[0].length, lift = cy * S * tp;   // 기수를 들면 앞쪽 부품이 더 높이
      out.push({ type: 'Feature', properties: { b: alt + lift + pt[1] * S, h: alt + lift + pt[2] * S, c: pt[3] }, geometry: { type: 'Polygon', coordinates: [ring] } });
    });
    var sh = PLANE_PARTS.slice(0, 3).map(function (pt) { var ring = pt[0].map(function (v) { return toLL(v[0], v[1]); }); ring.push(ring[0]); return ring; });
    sh.forEach(function (ring) { out.push({ type: 'Feature', properties: { shadow: 1, op: Math.max(0, .28 - alt / 900) }, geometry: { type: 'Polygon', coordinates: [ring] } }); });
    return out;
  }
  function stopPlane3d() {
    plane3d.token++; cancelAnimationFrame(plane3d.raf);
    var src = mapReady && map.getSource('plane3d');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
  }
  /* 상시 운항: 착륙(북쪽에서 내려와 활주로 16 착지·감속) → 잠깐 사라짐 → 이륙(활주로 34 가속·상승) → 반복.
   * 카메라는 건드리지 않는다. 공항이 화면에 보일 때만 그려서 배터리를 아낀다 */
  var LAND_MS = 9000, TAKEOFF_MS = 9000, GAP_MS = 1500;
  function landAt(t) {
    if (t < .62) { var u = t / .62; return { d: -2400 + 2750 * u, alt: 190 * Math.pow(1 - u, 1.15), pitch: 3 + 2 * u }; }
    var v = (t - .62) / .38, e = 1 - Math.pow(1 - v, 2.2); return { d: 350 + 1500 * e, alt: 0, pitch: Math.max(0, 5 - v * 12) };
  }
  function takeoffAt(t, L) {
    if (t < .5) { var u = t / .5; return { d: L - 150 - 1900 * u * u, alt: 0, pitch: u > .85 ? (u - .85) * 40 : 0 }; }
    var v = (t - .5) / .5; return { d: L - 2050 - 2600 * v - 600 * v * v, alt: 260 * Math.pow(v, 1.3), pitch: 8 };
  }
  function startPlaneLoop() {
    stopPlane3d();
    if (!mapReady || !map.getSource('plane3d')) return;
    var my = plane3d.token, L = rwyLength(), H16 = rwyHeading(), src = map.getSource('plane3d');
    var area = new maplibregl.LngLatBounds(rwyPoint(-2600, -600), rwyPoint(-2600, -600));
    [rwyPoint(-2600, 600), rwyPoint(L + 400, -600), rwyPoint(L + 400, 600), rwyPoint(L - 5300, 0)].forEach(function (p) { area.extend(p); });
    var CYCLE = LAND_MS + GAP_MS + TAKEOFF_MS + GAP_MS, t0 = performance.now(), last = 0, shown = false;
    // 마지막 날은 이륙부터
    if (state.day === D.days[D.days.length - 1].date) t0 -= LAND_MS + GAP_MS;
    (function frame(now) {
      if (my !== plane3d.token) return;
      plane3d.raf = requestAnimationFrame(frame);
      if (now - last < 33 || document.hidden) return;           // 초당 약 30번
      last = now;
      var b = map.getBounds(), vis = b.getWest() < area.getEast() && b.getEast() > area.getWest() && b.getSouth() < area.getNorth() && b.getNorth() > area.getSouth();
      if (!vis) { if (shown) { src.setData({ type: 'FeatureCollection', features: [] }); shown = false; } return; }
      var c = (now - t0) % CYCLE, f = null, hdg = H16;
      if (c < LAND_MS) f = landAt(c / LAND_MS);
      else if (c >= LAND_MS + GAP_MS && c < LAND_MS + GAP_MS + TAKEOFF_MS) { f = takeoffAt((c - LAND_MS - GAP_MS) / TAKEOFF_MS, L); hdg = (H16 + 180) % 360; }
      src.setData({ type: 'FeatureCollection', features: f ? planeFeatures(rwyPoint(f.d, 0), hdg, f.alt, f.pitch) : [] });
      shown = !!f;
    })(t0);
  }

  /* 일정 동선 둘레 r 미터 안쪽 영역 (선분마다 띠 + 장소마다 원) */
  function routeCorridor(r) {
    var polys = [], seen = {};
    D.days.forEach(function (d) {
      var c = routeCoords(d.date);
      c.forEach(function (p) { var k = p.join(','); if (!seen[k]) { seen[k] = 1; polys.push([circleRing(p[0], p[1], r)]); } });
      for (var i = 1; i < c.length; i++) {
        var a = c[i - 1], b = c[i], k = 111320 * Math.cos(a[1] * Math.PI / 180);
        var dx = (b[0] - a[0]) * k, dy = (b[1] - a[1]) * 111320, L = Math.sqrt(dx * dx + dy * dy);
        if (L < 1) continue;
        var ox = -dy / L * r / k, oy = dx / L * r / 111320;
        polys.push([[[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy], [a[0] + ox, a[1] + oy]]]);
      }
    });
    return { type: 'MultiPolygon', coordinates: polys };
  }

  /* 2D ↔ 3D 전환: 입체 건물·빛기둥을 숨기고 평면 건물을 보이며, 지도를 위에서 똑바로(북쪽 위) 내려다본다 */
  function applyMode(animate) {
    var btn = $('btn-mode');
    if (btn) {
      btn.textContent = is2d ? '3D' : '2D';
      btn.setAttribute('aria-label', is2d ? '3D 입체 지도로 보기' : '2D 평면 지도로 보기');
      btn.setAttribute('aria-pressed', String(is2d));
    }
    if (!mapReady) return;
    (map.getStyle().layers || []).forEach(function (l) {
      if (l.type === 'fill-extrusion' && l.id !== 'plane3d' && l.id !== 'ships3d') map.setLayoutProperty(l.id, 'visibility', is2d ? 'none' : 'visible');
    });
    ['tour-flat', 'tour-tall-flat'].forEach(function (id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', is2d ? 'visible' : 'none'); });
    map.dragRotate.enable(); map.touchZoomRotate.enableRotation();   // 2D 에서도 두 손가락으로 돌릴 수 있다 (기울이기만 막는다)
    limitPitch();
    // 2D 로 바꾸는 순간에만 북쪽을 위로 맞춘다. 그 뒤로는 사용자가 돌린 방향을 따른다
    // (처음 불러올 때는 건드리지 않는다 → 오프닝 회전이 그대로 보인다)
    if (animate) map.easeTo({ pitch: tilt(Math.min(55, map.getMaxPitch())), bearing: is2d ? 0 : -20, duration: 800 });
  }
  function toggleMode() {
    is2d = !is2d;
    try { localStorage.setItem(MODE_KEY, is2d ? '2d' : '3d'); } catch (e) { /* 이번에만 적용 */ }
    applyMode(true);
  }

  /* 멀리 볼수록 덜 기울인다: 축소한 채로 많이 기울이면 지평선 너머 빈 바탕이 화면을 채우므로 */
  function limitPitch() {
    var z = map.getZoom();
    var max = is2d ? 0 : z >= 15 ? 70 : z >= 14 ? 62 : z >= 13 ? 50 : z >= 12 ? 38 : 25;
    if (map.getMaxPitch() !== max) map.setMaxPitch(max);
  }

  /* 바탕 지도의 글자가 3D 건물에 묻히지 않게, 글자 층을 건물 위(바깥 덮개 바로 아래)로 올린다 */
  function liftBaseLabels() {
    try {
      (map.getStyle().layers || []).filter(function (l) { return l.type === 'symbol' && l.id.indexOf('tour-') !== 0; })
        .forEach(function (l) { map.moveLayer(l.id); });   // 맨 위로 (이후에 더하는 동선·이름표는 그 위)
    } catch (e) { /* 못 옮겨도 지도는 그대로 쓴다 */ }
  }

  /* 주변 정보: 일정에는 없지만 알아 두면 좋은 호텔·볼거리·경전철역·병원을 한글 이름으로 지도에 적는다 */
  function addAroundLayer() {
    if (!D.around || !D.around.length) return;
    try {
      var font = null;
      (map.getStyle().layers || []).forEach(function (l) { if (!font && l.type === 'symbol' && l.layout && l.layout['text-font']) font = l.layout['text-font']; });
      var feats = D.around.filter(function (a) {
        // 일정에 있는 장소 바로 옆(90m 안)은 마커와 겹치므로 뺀다
        return a.kind === 'area' || !Object.keys(D.places).some(function (id) { return distanceM([a.lng, a.lat], [D.places[id].lng, D.places[id].lat]) < 90; });
      }).map(function (a) {
        return { type: 'Feature', properties: { name: a.name, kind: a.kind }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } };
      });
      var color = ['match', ['get', 'kind'], 'hotel', '#c2377d', 'see', '#7a4fc9', 'rail', '#1f6fc4', 'care', '#d1352b', '#4a5560'];
      var spot = ['!=', ['get', 'kind'], 'area'];
      map.addSource('tour-around', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
      map.addLayer({ id: 'tour-around-dot', type: 'circle', source: 'tour-around', minzoom: 13.2, filter: spot,
        paint: { 'circle-radius': 4, 'circle-color': color, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
      var layout = { 'text-field': ['get', 'name'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.5], 'text-max-width': 7, 'text-padding': 3 };
      if (font) layout['text-font'] = font;
      map.addLayer({ id: 'tour-around-text', type: 'symbol', source: 'tour-around', minzoom: 13.2, filter: spot, layout: layout,
        paint: { 'text-color': color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
      var big = { 'text-field': ['get', 'name'], 'text-size': 15, 'text-letter-spacing': 0.15 };
      if (font) big['text-font'] = font;
      map.addLayer({ id: 'tour-around-area', type: 'symbol', source: 'tour-around', maxzoom: 14.5, filter: ['==', ['get', 'kind'], 'area'], layout: big,
        paint: { 'text-color': '#4a5560', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    } catch (e) { /* 주변 정보를 못 그려도 지도는 그대로 쓴다 */ }
  }

  /* 지금 보는 장소에 세우는 3D 빛기둥 (건물이 납작하게 그려진 곳에서도 위치와 입체감이 보인다) */
  function addBeaconLayer() {
    try {
      map.addSource('beacon', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'beacon-3d', type: 'fill-extrusion', source: 'beacon',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': BEACON_HEIGHT_M,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.55
        }
      });
    } catch (e) { /* 빛기둥이 없어도 나머지는 그대로 동작한다 */ }
  }

  /* 동선을 출발지부터 차례로 그려 나간다 (약 1.6초). 날짜를 바꾸면 처음부터 다시 그린다 */
  var drawToken = 0;
  function drawRoutes(src, feats) {
    var my = ++drawToken;
    if (reducedMotion() || !window.requestAnimationFrame) { src.setData({ type: 'FeatureCollection', features: feats }); return; }
    var lens = feats.map(function (f) {
      var c = f.geometry.coordinates, acc = [0];
      for (var i = 1; i < c.length; i++) acc.push(acc[i - 1] + distanceM(c[i - 1], c[i]));
      return acc;
    });
    var t0 = performance.now(), DUR = 1600;
    function part(f, acc, p) {
      var c = f.geometry.coordinates, goal = acc[acc.length - 1] * p, out = [c[0]];
      for (var i = 1; i < c.length; i++) {
        if (acc[i] <= goal) { out.push(c[i]); continue; }
        var k = (goal - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
        out.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * k, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * k]);
        break;
      }
      if (out.length < 2) out.push(c[0]);
      return { type: 'Feature', properties: f.properties, geometry: { type: 'LineString', coordinates: out } };
    }
    (function frame(now) {
      if (my !== drawToken) return;
      var p = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - p, 3);   // 끝으로 갈수록 부드럽게 느려진다
      src.setData({ type: 'FeatureCollection', features: p >= 1 ? feats : feats.map(function (f, i) { return part(f, lens[i], e); }) });
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  function addRouteLayers() {
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'routes-line', type: 'line', source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'active'], 1], 6, 3],
        // 가까이 들여다볼 때(확대 15.5 이상)는 다른 날의 동선을 거의 안 보이게 한다
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 0.9, 0]   // 고른 날짜의 동선만 보인다
      }
    });
    // 진행 방향이 보이도록 흰 점선을 선 위로 흘려보낸다
    map.addLayer({
      id: 'routes-dash', type: 'line', source: 'routes', filter: ['==', ['get', 'active'], 1],
      paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [0, 4, 3] }
    });
    var seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
    var step = 0;
    if (dashTimer) clearInterval(dashTimer);
    dashTimer = setInterval(function () {
      if (document.hidden || !mapReady || (!state.playing && Date.now() > dashUntil)) return;
      step = (step + 1) % seq.length;
      try { map.setPaintProperty('routes-dash', 'line-dasharray', seq[step]); } catch (e) { /* 무시 */ }
    }, 90);
  }

  function mapFailed() {
    mapReady = false;
    $('map-fallback').hidden = false;
    $('app').classList.add('nomap');
    showList();
  }

  function createMap(styleUrl) {
    try {
      var opts = {
        container: 'map', style: styleUrl,
        // 오프닝: 높은 곳에서 시작해 첫 화면 맞춤(fitTo)이 마카오로 날아 내려오는 장면이 된다
        center: D.map.center, zoom: reducedMotion() ? D.map.zoom : 10.8, pitch: 0, bearing: turnTo(reducedMotion() ? -20 : -150), maxPitch: is2d ? 0 : 70,
        antialias: true,                       // 3D 건물 모서리를 매끈하게
        attributionControl: { compact: true }
      };
      if (D.map.bounds) opts.maxBounds = D.map.bounds;   // 마카오 밖으로는 지도를 움직일 수 없게
      if (D.map.minZoom) opts.minZoom = D.map.minZoom;
      var extra = D.map.mapOptions || {};      // (선택) data.js 의 map.mapOptions 로 지도 옵션을 더할 수 있다
      Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
      map = new maplibregl.Map(opts);
      if (/[?&]debug/.test(location.search)) { window.__map = map; window.__dbg = { rfb: function () { raiseFlatBuildings(); return tallFeatures.length; }, keys: function () { return Object.keys(tallKeys).length; } }; }   // 점검용 (주소 끝에 ?debug)
    } catch (e) { mapFailed(); return; }
    if (!isNarrow()) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', function () {
      mapReady = true;
      // 지도 아래의 출처 표시는 접어 둔다 (ⓘ 를 누르면 펼쳐진다)
      var att = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      if (att) { att.classList.remove('maplibregl-compact-show'); att.removeAttribute('open'); }
      add3dBuildings();
      localizeLabels();
      addAreaMask();
      liftBaseLabels();
      limitPitch();
      map.on('zoom', limitPitch);
      addAroundLayer();
      map.on('moveend', spreadMarkers);
      addBeaconLayer();
      addRouteLayers();
      addPlane3dLayer();
      startPlaneLoop();
      addEiffelLayer();
      addLandmarkLayer();
      addShipLayer();
      startShips();
      addMeLayer();
      fitViewPadding();
      applyMode(false);
      updateMap(true);
      // 덜 그려진 지도가 보이지 않게, 준비가 끝나면 서서히 나타나게 한다
      setTimeout(function () { $('map').classList.add('shown'); }, 500);
    });
  }

  /* 지도 스타일을 차례로 시도: 첫 번째가 안 되면 대체 스타일로 자동 전환 */
  function tryStyles(i) {
    var list = D.map.styles;
    if (i >= list.length) { mapFailed(); return; }
    if (typeof list[i] !== 'string') { createMap(list[i]); return; }   // 주소가 아니라 스타일 내용을 직접 넣은 경우
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; tryStyles(i + 1); } }, 7000);
    fetch(list[i]).then(function (r) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (r.ok) createMap(list[i]); else tryStyles(i + 1);
    }).catch(function () {
      if (done) return;
      done = true; clearTimeout(timer);
      tryStyles(i + 1);
    });
  }

  /* 지도 엔진을 나중에 불러온다 → 지도가 안 떠도 일정 목록은 먼저 보인다 */
  function loadMapLibrary(i) {
    var urls = D.map.libraryUrls;
    if (i >= urls.length) { mapFailed(); return; }
    var css = document.createElement('link');     // 지도 모양 파일(css)도 같은 곳에서 불러온다
    css.rel = 'stylesheet';
    css.href = (D.map.cssUrls && D.map.cssUrls[i]) || urls[i].replace(/\.js$/, '.css');
    document.head.appendChild(css);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; loadMapLibrary(i + 1); } }, 12000);
    s.src = urls[i];
    s.onload = function () {
      if (done) return;
      done = true; clearTimeout(timer);
      if (!window.maplibregl) { loadMapLibrary(i + 1); return; }
      // (선택) data.js 의 map.onLibraryLoaded 에 함수를 넣으면 지도를 만들기 전에 먼저 실행된다
      var ready = typeof D.map.onLibraryLoaded === 'function' ? D.map.onLibraryLoaded(window.maplibregl) : null;
      Promise.resolve(ready).then(function () { tryStyles(0); }, function () { tryStyles(0); });
    };
    s.onerror = function () {
      if (done) return;
      done = true; clearTimeout(timer);
      loadMapLibrary(i + 1);
    };
    document.head.appendChild(s);
  }

  /* ---------- 카드 강조·이동 ---------- */
  function highlight(i) {
    var cards = $('cards').querySelectorAll('.card');
    var target = null;
    Array.prototype.forEach.call(cards, function (c) {
      var on = String(c.getAttribute('data-i')) === String(i);
      c.classList.toggle('active', on);
      if (on) target = c;
    });
    return target;
  }
  function highlightCardForPlace(id) {
    var found = null;
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        if (!found && stopPlacesOf(it).indexOf(id) >= 0) found = it;
      });
    });
    if (found) { var el = highlight(found._i); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  function goItem(it) {
    highlight(it._i);
    var ids = (it.places || []).filter(onMap);
    if (!ids.length) return;
    if (it.kind === 'move' && ids.length > 1) { if (popup) popup.remove(); hideSheet(); fitTo(ids); return; }
    flyToPlace(ids[0], { sheet: true });
    openPopup(ids[0], { item: it, color: (dayInfo(it.date) || {}).color });
    showPlace(ids[0]);
  }

  /* ---------- 투어 ---------- */
  function setTourStatus(t) { $('tour-status').textContent = t; }
  function setPlayButton() {
    var n = state.tourIdx >= 0 ? stops().length : 0;
    var prog = n ? (state.tourIdx + 1) + '/' + n : '';
    var b = $('tour-play');
    b.textContent = state.playing ? '⏸ ' + (prog || '일시정지') : '▶ ' + (prog || '투어');
    b.setAttribute('aria-label', state.playing ? '투어 일시정지' : '투어 재생');
  }

  function goStop(idx) {
    var list = stops();
    if (!list.length) { setTourStatus('지도에 표시할 장소가 없습니다'); return false; }
    if (idx < 0) idx = 0;
    if (idx >= list.length) return false;
    state.tourIdx = idx;
    setPlayButton();
    closeCards(null);
    hideSheet();                      // 투어 중에는 지도만 보여 준다
    var s = list[idx];
    var el = highlight(s.item._i);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // 투어: 작은 이름표만 띄우고, 머무는 동안 장소 둘레를 돈다
    flyToPlace(s.place, { orbitMs: STAY_MS - 150, tour: true });
    openPopup(s.place, { item: s.item, color: (dayInfo(s.item.date) || {}).color });
    setTourStatus((idx + 1) + '/' + list.length + ' · ' + s.item.time + ' ' + place(s.place).name);
    return true;
  }
  function scheduleNext() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () {           // 이동(약 2초) + 머무는 시간(3초) 뒤에 다음 장소로
      if (!state.playing) return;
      if (state.tourIdx + 1 >= stops().length) { state.tourIdx = -1; stopTour(); setTourStatus('투어가 끝났습니다'); return; }
      goStop(state.tourIdx + 1);
      scheduleNext();
    }, FLY_MS + STAY_MS + (state.hopMs || 0));      // 먼 이동이면 동선을 보여 준 시간만큼 더 기다린다
  }
  function playTour() {
    var list = stops();
    if (!list.length) { setTourStatus('지도에 표시할 장소가 없습니다'); return; }
    state.playing = true; setPlayButton();
    goStop(state.tourIdx + 1 >= list.length || state.tourIdx < 0 ? 0 : state.tourIdx + 1);
    scheduleNext();
  }
  function stopTour() { state.playing = false; clearTimeout(state.timer); setPlayButton(); }
  function stepTour(delta) {
    var list = stops();
    if (!list.length) return;
    var idx = state.tourIdx + delta;
    if (state.tourIdx < 0) idx = delta > 0 ? 0 : list.length - 1;
    idx = Math.max(0, Math.min(list.length - 1, idx));
    goStop(idx);
    if (state.playing) scheduleNext();
  }

  /* ---------- 창: 예약 체크리스트 / 비용 요약 ---------- */
  /* ---------- 🍴 맛집·카페: 일정 동선 근처의 유명한 곳 모음 (data.js 의 eats) ----------
   * 일정에 있는 곳(place)은 그 장소를 그대로 쓰고, 나머지는 EAT_PLACES 에 장소처럼 만들어 둔다
   * (지도 이동·택시 카드·길찾기를 일정 장소와 같은 방식으로 쓰려고). 일정 건물 색칠에는 쓰지 않는다 */
  var EAT_KIND = { food: '🍜', cafe: '☕', dessert: '🍮', bakery: '🥐', photo: '📸' };
  /* 📸 포토 스팟도 같은 방식(목록·지도 핀·아래 창)으로 보여 준다. kind: 'photo' */
  var SPOTS = (D.eats || []).concat((D.photos || []).map(function (p) { var o = {}; for (var k in p) o[k] = p[k]; o.kind = 'photo'; return o; }));
  var spotTab = 'eat';   // 'eat' 맛집·카페 / 'photo' 포토 스팟
  function tabOf(e) { return e.kind === 'photo' ? 'photo' : 'eat'; }
  var eatMarkers = [], eatsOn = false;
  SPOTS.forEach(function (e) {
    if (e.place && D.places[e.place]) { e.pid = e.place; return; }
    e.pid = 'eat_' + e.id;
    EAT_PLACES[e.pid] = { name: e.name, type: e.kind === 'food' ? 'food' : 'snack', lng: e.lng, lat: e.lat, zh: e.zh, zhArea: e.zhArea,
      mapQuery: e.mapQuery, hours: e.hours, verified: e.verified !== false };
  });
  function eatById(id) { return SPOTS.filter(function (e) { return e.id === id; })[0]; }
  /* 이 맛집이 일정에 들어 있으면 그 날짜·시각 */
  function eatPlanText(e) {
    if (!e.place) return '';
    var hit = items('all').filter(function (it) { return (it.places || []).indexOf(e.place) >= 0 && it.kind !== 'move'; })[0];
    return hit ? hit.date.slice(5).replace('-', '/') + ' ' + hit.time : '';
  }
  function eatGm(e) {
    var p = place(e.pid), q = p.mapQuery || (p.lat + ',' + p.lng);
    return gmLink('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), gmEmbed(q, p.lat, p.lng, 17), e.name, '📍 구글 지도', 'btn small');
  }
  function eatInfoHtml(e) {
    return (e.what ? '<p class="eat-l">📷 ' + esc(e.what) + '</p>' : '') +
      (e.best ? '<p class="eat-l">⏰ <b>찍기 좋은 때</b> ' + esc(e.best) + '</p>' : '') +
      (e.menu ? '<p class="eat-l">😋 <b>대표 메뉴</b> ' + esc(e.menu) + '</p>' : '') +
      (e.price ? '<p class="eat-l">💰 ' + esc(e.price) + '</p>' : '') +
      (e.hours ? '<p class="eat-l">🕒 ' + esc(e.hours) + '</p>' : '') +
      (e.tip ? '<p class="eat-l">💡 ' + esc(e.tip) + '</p>' : '');
  }
  function eatsHtml() {
    var photo = spotTab === 'photo';
    var list = SPOTS.filter(function (e) { return tabOf(e) === spotTab; });
    var html = '<div class="spot-tabs" role="tablist">' +
      '<button type="button" role="tab" class="btn small' + (!photo ? ' primary' : '') + '" data-spot-tab="eat" aria-selected="' + !photo + '">🍴 맛집·카페</button>' +
      '<button type="button" role="tab" class="btn small' + (photo ? ' primary' : '') + '" data-spot-tab="photo" aria-selected="' + photo + '">📸 포토 스팟</button></div>' +
      '<p class="bk-sum">' + (photo ? '일정 동선의 사진 명소 <strong>' + list.length + '곳</strong>' +
        '<br><span class="fine">📅 표시는 그 장소에 가는 일정 · 찍기 좋은 시간과 구도 꿀팁</span>'
        : '일정 동선 근처의 유명한 식당·카페 <strong>' + list.length + '곳</strong>' +
        '<br><span class="fine">📅 표시는 이미 일정에 들어 있는 곳 · 가격·영업시간은 바뀔 수 있어 구글 지도에서 한 번 더 확인하세요</span>') + '</p>' +
      '<button type="button" class="btn small eat-toggle" data-eat-toggle aria-pressed="' + eatsOn + '">' +
        (eatsOn ? '🗺️ 지도에서 핀 숨기기' : '🗺️ 지도에 ' + (photo ? '포토 스팟' : '맛집') + ' 핀 모두 보이기') + '</button>';
    var areas = [];
    list.forEach(function (e) { if (areas.indexOf(e.area) < 0) areas.push(e.area); });
    areas.forEach(function (a) {
      html += '<h3 class="eat-area">' + esc(a) + '</h3>';
      list.filter(function (e) { return e.area === a; }).forEach(function (e) {   // 같은 지역끼리
        var plan = eatPlanText(e);
        html += '<div class="eat">' +
          '<p class="eat-title">' + (EAT_KIND[e.kind] || '🍴') + ' ' + esc(e.name) + (plan ? ' <span class="eat-plan">📅 ' + esc(plan) + '</span>' : '') + '</p>' +
          eatInfoHtml(e) +
          '<div class="eat-btns"><button type="button" class="btn small primary" data-eat="' + esc(e.id) + '">🗺️ 지도에서 보기</button>' + eatGm(e) + '</div>' +
          '</div>';
      });
    });
    return html;
  }
  /* 맛집을 눌렀을 때 아래 창에 보일 내용 */
  function eatSheetHtml(e) {
    var p = place(e.pid), plan = eatPlanText(e);
    return '<p class="fine place-meta">' + esc(e.area) + (plan ? ' · 📅 일정 ' + esc(plan) : '') + '</p>' +
      meDistanceHtml(p) + '<div class="eat sheet">' + eatInfoHtml(e) + '</div>' +
      '<div class="card-actions">' + eatGm(e) + (e.url ? link(e.url, siteLabel(e.url), 'btn small') : '') + '</div>' +
      routeHtml(p) + nearbyHtml(p);
  }
  function showEat(id) {
    var e = eatById(id); if (!e) return;
    stopTour(); closeModal();
    spotTab = tabOf(e);
    setEatPins(true);
    flyToPlace(e.pid, { sheet: true });
    eatMarkers.forEach(function (m) { m.getElement().classList.toggle('on', m.getElement().getAttribute('data-eat') === id); });
    $('place').innerHTML = eatSheetHtml(e);
    openSheet('place', (EAT_KIND[e.kind] || '🍴') + ' ' + e.name);
  }
  function setEatPins(on) {
    eatsOn = on;
    eatMarkers.forEach(function (m) { m.remove(); });
    eatMarkers = [];
    if (!on || !mapReady) return;
    SPOTS.forEach(function (e) {
      if (tabOf(e) !== spotTab) return;      // 지금 고른 탭(맛집 / 포토)의 핀만
      if (markers[e.pid]) return;            // 오늘 일정 마커가 이미 있는 곳은 겹치지 않게 뺀다
      var p = place(e.pid);
      var el = document.createElement('div');
      el.className = 'mk eat-mk' + (e.kind === 'photo' ? ' photo' : '');
      el.textContent = EAT_KIND[e.kind] || '🍴';
      el.setAttribute('data-eat', e.id);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', (e.kind === 'photo' ? '포토 스팟: ' : '맛집: ') + e.name);
      el.addEventListener('click', function (ev) { ev.stopPropagation(); showEat(e.id); });
      eatMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map));
    });
  }

  function openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  function closeModal() { $('modal').hidden = true; }
  $('modal-body').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-open-packing]')) { openPacking(); return; }
    if (e.target.closest && e.target.closest('[data-open-booking]')) { openModal('예약 체크리스트', bookingListHtml()); return; }
    var eb = e.target.closest && e.target.closest('[data-eat]');
    if (eb) { showEat(eb.getAttribute('data-eat')); return; }
    var tb = e.target.closest && e.target.closest('[data-spot-tab]');
    if (tb) {
      spotTab = tb.getAttribute('data-spot-tab');
      if (eatsOn) setEatPins(true);
      $('modal-body').innerHTML = eatsHtml(); $('modal-body').scrollTop = 0;
      return;
    }
    if (e.target.closest && e.target.closest('[data-eat-toggle]')) {
      setEatPins(!eatsOn);
      var top = $('modal-body').scrollTop; $('modal-body').innerHTML = eatsHtml(); $('modal-body').scrollTop = top;
      return;
    }
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    copyText(btn.getAttribute('data-copy'), function () {
      var tag = btn.querySelector('.cp-copy'); tag.textContent = '복사됨 ✓';
      setTimeout(function () { tag.textContent = '복사'; }, 1500);
    });
  });
  /* 예약 체크: 누르면 이 휴대폰에 기억하고 목록을 다시 그린다 */
  $('modal-body').addEventListener('change', function (e) {
    var pk = e.target.getAttribute && e.target.getAttribute('data-pack');
    if (pk) {
      var ps = packSet();
      if (e.target.checked) ps[pk] = 1; else delete ps[pk];
      try { localStorage.setItem(PACK_KEY, JSON.stringify(ps)); } catch (err) { /* 무시 */ }
      var st = $('modal-body').scrollTop;
      $('modal-body').innerHTML = packingHtml();
      $('modal-body').scrollTop = st;
      var c = packCount();
      if (e.target.checked && c.done === c.n) celebrate();
      return;
    }
    var k = e.target.getAttribute && e.target.getAttribute('data-done');
    if (!k) return;
    var d = doneSet();
    if (e.target.checked) d[k] = 1; else delete d[k];
    try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch (err) { /* 기억 못 해도 화면에는 표시 */ }
    var top = $('modal-body').scrollTop;
    $('modal-body').innerHTML = bookingListHtml();
    $('modal-body').scrollTop = top;
    if (e.target.checked && !$('modal-body').querySelector('.bk-sum strong')) celebrate();   // 미리 할 예약이 모두 끝났다
  });

  /* ---------- 🧳 짐 싸기 체크리스트 (예약 체크리스트 창 맨 위 버튼으로 연다). 체크는 이 휴대폰에 기억 ---------- */
  var PACK_KEY = 'macau-packed';
  function packSet() { try { return JSON.parse(localStorage.getItem(PACK_KEY) || '{}'); } catch (e) { return {}; } }
  function packCount() {
    var s = packSet(), n = 0, done = 0;
    (D.packing || []).forEach(function (g, gi) { g.items.forEach(function (t, i) { n++; if (s[gi + '-' + i]) done++; }); });
    return { n: n, done: done };
  }
  function packingHtml() {
    var s = packSet(), c = packCount();
    var html = '<button type="button" class="btn small" data-open-booking>‹ 예약 체크리스트</button>' +
      '<p class="bk-sum">' + (c.done < c.n ? '🧳 <strong>' + (c.n - c.done) + '개</strong> 남음 (' + c.done + '/' + c.n + ')' : '✅ 짐 싸기 끝!') +
      '<br><span class="fine">체크는 이 휴대폰에만 기억됩니다. 가족마다 각자 체크하세요.</span></p>';
    (D.packing || []).forEach(function (g, gi) {
      html += '<h3 class="eat-area">' + esc(g.group) + '</h3>';
      g.items.forEach(function (t, i) {
        var k = gi + '-' + i;
        html += '<label class="pk' + (s[k] ? ' done' : '') + '"><input type="checkbox" data-pack="' + k + '"' + (s[k] ? ' checked' : '') + '> <span>' + esc(t) + '</span></label>';
      });
    });
    return html;
  }
  function openPacking() { openModal('🧳 짐 싸기 체크리스트', packingHtml()); }

  /* 예약 체크리스트: 한 줄에 아이콘·이름·날짜·핵심 금액·예약 버튼. 체크한 항목은 이 휴대폰에 기억한다 */
  var DONE_KEY = 'macau-booked';
  function doneSet() { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch (e) { return {}; } }
  var LEVEL_ICON = { '필수': '❗', '권장': '⭐', '선택': '➕', '현장 구매': '🏷️' };
  function bookingListHtml() {
    var order = { '필수': 0, '권장': 1, '선택': 2, '현장 구매': 3 };
    var used = {};
    items('all').forEach(function (it) {
      if (!it.booking || !D.bookings[it.booking]) return;
      (used[it.booking] = used[it.booking] || []).push(it.date.slice(5).replace('-', '/'));
    });
    // 일정 순서로: 그 항목을 쓰는 첫 일정의 날짜·시각 (일정에 없으면 data.js 의 sort)
    var first = {};
    items('all').forEach(function (it) { if (it.booking && !first[it.booking]) first[it.booking] = it.date + ' ' + it.time; });
    var keyOf = function (k) { return first[k] || D.bookings[k].sort || '9'; };
    var keys = Object.keys(D.bookings).sort(function (a, b) { return keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0; });
    var done = doneSet(), left = keys.filter(function (k) { return !done[k] && D.bookings[k].level !== '선택' && D.bookings[k].level !== '현장 구매'; }).length;
    var pc = packCount();
    var html = (pc.n ? '<button type="button" class="btn small pk-open" data-open-packing>🧳 짐 싸기 체크리스트 ' + pc.done + '/' + pc.n + ' ›</button>' : '') +
      '<p class="bk-sum">' + (left ? '⏳ 미리 할 예약 <strong>' + left + '개</strong> 남음' : '✅ 미리 할 예약 끝!') +
      '<br><span class="fine">⭐ 권장 · ➕ 선택 · 🏷️ 현장 구매 · 🔒 예약번호는 여기 적지 마세요</span>' +
      '<br><span class="fine">👶 아이 요금은 25개월·35개월 두 아이 기준 (✅ 무료 · 💳 유료 · ⚠️ 확인 필요)</span>' +
      '<br><span class="fine">🔗 판매처(클룩·마이리얼트립·더라운지)가 표시된 버튼은 제휴 링크입니다. 이 링크로 예약하면 사이트를 만든 사람이 수수료를 받을 수 있습니다.</span></p>';
    keys.forEach(function (k) {
      var b = D.bookings[k];
      html += '<div class="bk2' + (done[k] ? ' done' : '') + '">' +
        '<label class="bk2-check"><input type="checkbox" data-done="' + k + '"' + (done[k] ? ' checked' : '') + ' aria-label="' + esc(b.short || b.name) + ' 예약 완료"></label>' +
        '<div class="bk2-main"><p class="bk2-title">' + (b.icon || '🎫') + ' ' + esc(b.short || b.name) + ' <span class="bk2-lvl">' + (LEVEL_ICON[b.level] || '') + '</span>' +
          (b.affBy ? ' <span class="bk2-by">' + esc(b.affBy) + '</span>' : '') + '</p>' +
        '<p class="bk2-key">' + (used[k] ? '📅 ' + esc(used[k].filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ')) + ' · ' : b.when ? '📅 ' + esc(b.when) + ' · ' : '') + esc(b.key || '') + '</p>' +
        (b.kids ? '<p class="bk2-kids">👶 ' + esc(b.kids) + '</p>' : '') +
        (b.affNote ? '<p class="bk2-warn">⚠️ ' + esc(b.affNote) + '</p>' : '') +
        (b.note ? '<details><summary>자세히</summary><p>' + esc(b.note) + '</p>' +
          (b.aff && b.url !== b.aff ? '<p>' + link(b.url, '🌐 공식 사이트', '') + '</p>' : '') +
          (b.linkVerified === false ? '<p class="fine">링크가 안 열리면 공식 사이트에서 찾아 주세요.</p>' : '') + '</details>' : '') +
        '</div>' + affLink(b.aff || b.url, b.aff ? '예약' : b.buttonLabel ? '열기' : '예약', 'btn book small', !!b.aff) + '</div>';
    });
    var cp = D.coupons;
    if (cp && cp.codes && cp.codes.length) {
      html += '<div class="cp"><p class="cp-title">🎫 ' + esc(cp.title) + ' <span class="fine">' + esc(cp.until) + '</span></p>' +
        cp.codes.map(function (c) {
          return '<button type="button" class="cp-row" data-copy="' + esc(c.code) + '"><span class="cp-code">' + esc(c.code) + '</span>' +
            '<span class="cp-off">' + esc(c.min) + ' → <strong>' + esc(c.off) + '</strong></span><span class="cp-copy">복사</span></button>';
        }).join('') +
        '<p class="fine">' + esc(cp.note) + '</p></div>';
    }
    return html;
  }
  /* 축하 효과: 이모지가 위로 터졌다가 떨어진다 (동작 줄이기 설정이면 생략) */
  function celebrate() {
    if (reducedMotion()) return;
    var box = document.createElement('div'); box.className = 'confetti';
    var em = ['🎉', '✨', '🎊', '⭐', '🥳'];
    for (var i = 0; i < 26; i++) {
      var s = document.createElement('span');
      s.textContent = em[i % em.length];
      s.style.setProperty('--x', Math.round((Math.random() - .5) * 320) + 'px');
      s.style.setProperty('--y', Math.round(-120 - Math.random() * 220) + 'px');
      s.style.setProperty('--r', Math.round((Math.random() - .5) * 540) + 'deg');
      s.style.animationDelay = Math.round(Math.random() * 180) + 'ms';
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2000);
  }
  /* ---------- 내 위치 (GPS) ----------
   * 📍 버튼: 처음 누르면 위치 허용을 묻고 파란 점 + 오차 범위를 보인다. 걸으면 지도가 따라온다.
   * 손으로 지도를 밀면 따라가기만 멈추고(버튼 흰색), 다시 누르면 다시 따라온다. 따라가는 중에 누르면 끈다.
   * 위치는 이 휴대폰 안에서만 쓰고 어디에도 보내거나 저장하지 않는다. */
  var me = { watch: null, follow: false, pos: null, acc: 0, heading: null, marker: null };
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }
  function setLocateState(st) {
    var b = $('btn-locate'); if (!b) return;
    b.className = 'locate' + (st === 'off' ? '' : ' ' + st);
    b.setAttribute('aria-pressed', String(st !== 'off'));
    b.setAttribute('aria-label', st === 'off' ? '내 위치 보기' : st === 'follow' ? '내 위치 끄기' : '내 위치로 다시 따라가기');
  }
  function insideMacau(lng, lat) {
    var ring = (D.map.area || []).map(function (p) { return [p[0], p[1]]; });
    return ring.length > 3 && insidePolygon([lng, lat], { type: 'Polygon', coordinates: [ring] });
  }
  function updateMe() {
    if (!mapReady || !me.pos) return;
    if (!me.marker) {
      var el = document.createElement('div'); el.className = 'me';
      el.innerHTML = '<span class="me-dir"><i></i></span>';
      me.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(me.pos).addTo(map);
    } else me.marker.setLngLat(me.pos);
    var src = map.getSource('me-acc');
    if (src) src.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(me.pos[0], me.pos[1], Math.max(me.acc, 4))] } });
    updateMeDir();
  }
  function updateMeDir() {
    if (!me.marker) return;
    var el = me.marker.getElement();
    el.classList.toggle('has-dir', me.heading != null);
    if (me.heading != null) el.style.setProperty('--h', (me.heading - map.getBearing()) + 'deg');
  }
  function onOrient(e) {
    var h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
    if (h == null || isNaN(h)) return;
    me.heading = h; updateMeDir();
  }
  function askHeading() {   // 휴대폰이 향한 방향 (아이폰은 처음 한 번 허용을 묻는다)
    var DO = window.DeviceOrientationEvent;
    if (!DO) return;
    // 안드로이드 크롬은 나침반 기준 방향을 'deviceorientationabsolute' 로만 준다 (보통 'deviceorientation' 은 기준이 없다)
    var add = function () {
      window.addEventListener('deviceorientation', onOrient, true);
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient, true);
    };
    if (typeof DO.requestPermission === 'function') DO.requestPermission().then(function (r) { if (r === 'granted') add(); }).catch(function () { /* 방향 없이 점만 */ });
    else add();
  }
  function onPos(p) {
    var lng = p.coords.longitude, lat = p.coords.latitude, first = !me.pos;
    if (!insideMacau(lng, lat)) {
      toast('지금 위치가 마카오 밖이라 지도에 표시할 수 없어요. 마카오에 도착하면 다시 눌러 주세요.', 5000);
      stopLocate(); return;
    }
    me.pos = [lng, lat]; me.acc = p.coords.accuracy || 0;
    updateMe();
    if (first) {
      me.follow = true; stopTour();
      map.flyTo({ center: me.pos, zoom: Math.max(map.getZoom(), 16.5), duration: 1200 });
      if (me.acc > 60) toast('위치 오차가 약 ' + Math.round(me.acc) + 'm예요. 건물 안이면 점이 조금 어긋날 수 있어요.', 4000);
    } else if (me.follow && !map.isMoving()) map.easeTo({ center: me.pos, duration: 700 });
    setLocateState(me.follow ? 'follow' : 'on');
  }
  function onPosErr(e) {
    if (e.code === 1) toast('위치 권한이 꺼져 있어요. 아이폰: 설정 → 개인정보 보호 및 보안 → 위치 서비스 → Safari 웹 사이트 → "앱을 사용하는 동안". 카카오톡 안에서는 사파리로 열어 주세요.', 8000);
    else toast('위치를 찾지 못했어요. 하늘이 보이는 곳에서 다시 눌러 주세요.', 4000);
    if (!me.pos) stopLocate();
  }
  function startLocate() {
    if (!navigator.geolocation) { toast('이 브라우저는 위치 기능을 쓸 수 없어요.'); return; }
    askHeading();
    setLocateState('wait');
    me.watch = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  function stopLocate() {
    if (me.watch != null) navigator.geolocation.clearWatch(me.watch);
    window.removeEventListener('deviceorientation', onOrient, true);
    window.removeEventListener('deviceorientationabsolute', onOrient, true);
    if (me.marker) me.marker.remove();
    var src = mapReady && map.getSource('me-acc');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    me.watch = null; me.marker = null; me.pos = null; me.follow = false; me.heading = null;
    setLocateState('off');
  }
  function pauseFollow() { if (me.follow) { me.follow = false; setLocateState('on'); } }
  function addMeLayer() {
    try {
      map.addSource('me-acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'me-acc', type: 'fill', source: 'me-acc', paint: { 'fill-color': '#2a7de1', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'me-acc-line', type: 'line', source: 'me-acc', paint: { 'line-color': '#2a7de1', 'line-opacity': 0.5, 'line-width': 1 } });
    } catch (e) { /* 오차 원 없이 점만 */ }
    map.on('dragstart', pauseFollow);        // 손으로 지도를 밀면 따라가기를 잠시 멈춘다
    map.on('rotate', updateMeDir);
  }
  /* 지금 위치에서 장소까지 거리 (아이와 걷는 속도: 1분에 약 50m) */
  function meDistanceHtml(p) {
    if (!me.pos) return '';
    var d = distanceM(me.pos, [p.lng, p.lat]);
    var dist = d < 1000 ? Math.round(d / 10) * 10 + 'm' : (d / 1000).toFixed(1) + 'km';
    return '<p class="fine me-dist">🚶 지금 위치에서 약 ' + dist + (d < 3000 ? ' · 아이와 걸어서 ' + Math.max(1, Math.round(d / 50)) + '분' : ' · 택시 권장') + '</p>';
  }

  /* 🆘 비상 연락처 */
  function sosHtml() {
    var h = '<p class="fine">번호를 누르면 바로 전화가 걸립니다. 🏥 병원은 📍로 위치를 볼 수 있어요.</p>';
    (D.sos || []).forEach(function (c) {
      h += '<div class="sos-row"><div class="sos-main"><p class="sos-name">' + c.icon + ' ' + esc(c.name) + '</p>' +
        (c.note ? '<p class="fine">' + esc(c.note) + '</p>' : '') + '</div>' +
        (c.mapQuery ? gmLink('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.mapQuery), 'https://maps.google.com/maps?q=' + encodeURIComponent(c.mapQuery) + '&z=16&hl=ko&output=embed', c.name, '📍', 'btn small') : '') +
        '<a class="btn small sos-tel" href="tel:' + esc(c.tel) + '">📞 ' + esc(c.show || c.tel) + '</a></div>';
    });
    h += '<p class="fine">아이 신상(이름·생년월일)과 여권 사본 사진은 휴대폰 사진첩에 따로 저장해 두세요. 이 사이트에는 적지 않습니다.</p>';
    return h;
  }

  /* 할인 코드 누르면 복사 */
  function copyText(t, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function () { fallback(); }); return; }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* 복사 못 하면 코드를 직접 보고 입력 */ }
      document.body.removeChild(ta);
    }
  }

  /* 비용 요약: 총액 → 날짜별 합계 → 꼭 알아 둘 것 3가지. 항목별 내역은 '자세히'로 접어 둔다 */
  function costHtml() {
    var tot = { ticketMin: 0, ticketMax: 0, taxiMin: 0, taxiMax: 0, min: 0, max: 0 };
    var rows = '';
    D.days.forEach(function (d) {
      var c = dayCost(d.date);
      Object.keys(tot).forEach(function (k) { tot[k] += c[k]; });
      rows += '<li><span class="cd-day" style="--day-color:' + d.color + '">' + esc(d.label) + '</span><span class="cd-sum">' +
        (c.max ? mopShort(c) + (KRW.rate ? '<small>' + won(c) + '</small>' : '') : '0') + '</span></li>';
    });
    var html = '<div class="cost-big"><p class="fine">👨‍👩‍👧 1가족 (어른 2 · 아이 1) · 식비 제외</p>' +
      '<p class="cost-total">💰 MOP ' + mopShort(tot) + '</p>' +
      (KRW.rate ? '<p class="cost-won">🇰🇷 ' + won(tot) + '</p>' : '') +
      '<p class="cost-split">🎟️ 시설 ' + mopShort({ min: tot.ticketMin, max: tot.ticketMax }) + ' &nbsp;·&nbsp; 🚕 택시 ' + mopShort({ min: tot.taxiMin, max: tot.taxiMax }) + '</p>' +
      (KRW.rate ? '<p class="fine cost-rate">💱 1 MOP = ' + KRW.rate.toFixed(2) + '원 · ' + esc(KRW.at) + ' 환율' + (KRW.live ? '' : ' (저장된 값)') + '</p>' : '') + '</div>';
    html += '<h3 class="sec">📅 날짜별</h3><ul class="cost-days">' + rows + '</ul>';
    html += '<h3 class="sec">💡 꼭 알아 둘 것</h3><ul class="cost-tips">' +
      '<li>💵 택시는 <strong>현금</strong> (MOP·홍콩달러 1:1)</li>' +
      '<li>🚌 호텔 셔틀은 무료 (구시가지·공항)</li>' +
      '<li>👶 아이 1명 기준 · 25개월·35개월 어느 아이든 같은 요금<br><span class="fine">유료: 키즈시티 180 · 슈퍼 펀 존 120 · 관람차 100 / 무료: 워터파크 · 판다관 · 호텔 조식 · 햄튼 코트</span></li></ul>';
    var list = '';
    items('all').forEach(function (it) {
      if (!it.cost) return;
      list += '<li>' + esc(it.date.slice(5).replace('-', '/')) + ' ' + esc(it.title) + ' — <strong>' + mop(it.cost) + '</strong> ' + won(it.cost) +
        (it.cost.optional ? ' (선택, 합계 제외)' : '') + (it.cost.note ? '<br><span class="fine">' + esc(it.cost.note) + '</span>' : '') + '</li>';
    });
    html += '<details class="cost-more"><summary>항목별 내역 · 계산 방법 자세히</summary><ul class="cost-list">' + list + '</ul>' +
      (D.costExtras && D.costExtras.length ? '<ul class="cost-list">' + D.costExtras.map(function (x) { return '<li class="fine">' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="fine">' + esc(D.costNote || '') + ' 현장·공식 사이트에서 최종 확인하세요.</p></details>';
    return html;
  }

  /* ---------- 누르기(이벤트) 연결 ---------- */
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    state.day = b.getAttribute('data-day');
    render(true);
    if (sheetMode === 'list') showList(); else hideSheet();
  });
  $('plan-toggle').addEventListener('click', function (e) {
    var b = e.target.closest('[data-plan]');
    if (!b) return;
    state.plan = +b.getAttribute('data-plan');
    render(true);
  });
  /* 펼쳐진 카드를 접는다 (except 는 그대로 둔다) */
  function closeCards(except) {
    Array.prototype.forEach.call($('cards').querySelectorAll('.card.open'), function (c) {
      if (c !== except) { c.classList.remove('open'); c.setAttribute('aria-expanded', 'false'); }
    });
  }
  /* 카드를 누르면: 지도가 그 장소로 날아가고, 카드가 펼쳐져 메모·꿀팁·버튼이 보인다 (다시 누르면 접힌다) */
  function cardActivate(e) {
    if (e.target.closest('a, summary, button')) return;   // 예약 버튼·링크는 그대로 열리게 둔다
    var c = e.target.closest('.card');
    if (!c) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    else if (e.target.closest('.card-more')) return;      // 펼친 내용 안을 누를 때는 접지 않는다
    stopTour();
    var it = plan().items[+c.getAttribute('data-i')];
    if (!it) return;
    if (c.classList.contains('has-more')) {
      var open = !c.classList.contains('open');
      closeCards(c);
      c.classList.toggle('open', open);
      c.setAttribute('aria-expanded', String(open));
    } else {
      closeCards(null);
    }
    goItem(it);
    setTimeout(function () { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
  }
  $('cards').addEventListener('click', cardActivate);
  $('cards').addEventListener('keydown', cardActivate);
  $('cards').addEventListener('click', function (e) {      // 날짜 제목 옆의 비용 버튼 → 비용 요약
    if (e.target.closest('.day-cost')) openModal('비용 요약', costHtml());
  });

  $('btn-list').addEventListener('click', function () { if (sheetMode === 'list') hideSheet(); else showList(); });
  $('sheet-close').addEventListener('click', hideSheet);
  $('sheet-back').addEventListener('click', function () { if (popup) { popup.remove(); popup = null; } showList(true); });
  $('place').addEventListener('click', function (e) {     // '가까운 곳' 버튼 → 그 장소로
    var b = e.target.closest('[data-place]');
    if (!b) return;
    var id = b.getAttribute('data-place');
    flyToPlace(id, { sheet: true }); openPopup(id); showPlace(id);
  });

  $('tour-play').addEventListener('click', function () { if (state.playing) stopTour(); else playTour(); });
  $('tour-next').addEventListener('click', function () { stepTour(1); });
  $('tour-prev').addEventListener('click', function () { stepTour(-1); });

  $('btn-booking').addEventListener('click', function () { openModal('예약 체크리스트', bookingListHtml()); });
  $('btn-cost').addEventListener('click', function () { openModal('비용 요약', costHtml()); });
  $('btn-eats').addEventListener('click', function () { openModal('🍴 맛집 · 📸 포토', eatsHtml()); });
  $('btn-mode').addEventListener('click', toggleMode);
  /* 🧭 시점 처음으로: 투어·따라가기를 멈추고, 지금 고른 날짜의 장소가 모두 보이게 북쪽을 위로 돌려 맞춘다 */
  $('btn-reset').addEventListener('click', function () {
    if (!mapReady) return;
    stopTour();
    if (popup) { popup.remove(); popup = null; }
    clearFocus();
    var ids = viewPlaceIds();
    if (ids.length > 1) {
      var b = null;
      ids.forEach(function (id) { var p = [place(id).lng, place(id).lat]; if (!b) b = new maplibregl.LngLatBounds(p, p); else b.extend(p); });
      map.fitBounds(b, { padding: { top: 40, bottom: 40, left: 70, right: 70 }, pitch: tilt(50), bearing: 0, maxZoom: 16, duration: 1200 });
    } else {
      fitTo(ids);
    }
  });
  $('gm-close').addEventListener('click', closeGm);
  $('btn-locate').addEventListener('click', function () {
    if (!mapReady) { toast('지도를 불러온 뒤에 눌러 주세요.'); return; }
    if (me.watch == null) startLocate();
    else if (!me.follow && me.pos) { me.follow = true; setLocateState('follow'); map.easeTo({ center: me.pos, zoom: Math.max(map.getZoom(), 16), duration: 800 }); }
    else stopLocate();
  });
  /* 제목 옆 D-day: 출발 전 'D-45', 여행 중 '2일차', 다녀온 뒤 '다녀왔어요' (한국 시간 기준) */
  (function () {
    var first = D.days[0] && D.days[0].date, last = D.days[D.days.length - 1] && D.days[D.days.length - 1].date;
    if (!first) return;
    var today = nowMacau().slice(0, 10);
    var dd = Math.round((Date.parse(first) - Date.parse(today)) / 86400000);
    var txt = dd > 0 ? 'D-' + dd : dd === 0 ? 'D-DAY ✈️' : today <= last ? (1 - dd) + '일차' : '다녀왔어요';
    var b = document.createElement('span');
    b.className = 'dday'; b.textContent = txt;
    $('title').insertBefore(b, $('title').firstChild);
  })();
  loadRate();
  loadWeather();
  loadNowWeather();
  setInterval(loadNowWeather, 30 * 60 * 1000);
  $('wxnow').addEventListener('click', function () {
    var on = !wxFxOn();
    try { localStorage.setItem(WXFX_KEY, on ? 'on' : 'off'); } catch (e) { /* 무시 */ }
    applyWeatherLook();
    toast(on ? '지도에 지금 날씨를 보여 줍니다' : '날씨 효과를 껐어요 (맑은 하늘)');
  });
  applyMode(false);
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('taxi').hidden) $('taxi').hidden = true;
    else if (!$('gm').hidden) closeGm();
    else if (!$('modal').hidden) closeModal(); else hideSheet();
  });

  /* ---------- 여행 중 '오늘' 모드 ----------
   * 12/27~31 에 열면 그날 탭을 자동으로 고르고, 위쪽에 '다음 일정'을 보여 준다 (마카오 시간 기준, 1분마다 갱신).
   * 점검용: 주소 끝에 ?today=2026-12-29T14:10 을 붙이면 그 시각인 것처럼 보인다 */
  function nowMacau() {
    var q = /[?&]today=([0-9T:\-]+)/.exec(location.search);
    if (q) return q[1].length === 10 ? q[1] + 'T08:00' : q[1];
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16);
  }
  function tripToday() { var d = nowMacau().slice(0, 10); return dayInfo(d) ? d : null; }
  function updateNext() {
    var btn = $('next'), d = tripToday();
    if (!d) { btn.hidden = true; return; }
    var t = nowMacau().slice(11, 16), nxt = null;
    items(d).forEach(function (it) { if (!nxt && !QUIET_KINDS[it.kind] && it.time >= t && (it.places || []).length) nxt = it; });   // 지도 밖(인천공항) 일정도 보여 준다
    if (!nxt) { btn.hidden = true; fitViewPadding(); return; }
    var id = (it2id(nxt));
    btn.innerHTML = '<span class="next-tag">다음</span> ' + esc(nxt.time) + ' · ' + esc(nxt.title);
    btn.setAttribute('data-place', id);
    btn.hidden = false;
    fitViewPadding();   // '다음 일정' 줄만큼 지도 가운데를 다시 맞춘다
  }
  function it2id(it) { var ps = (it.places || []).filter(onMap); if (!ps.length) return (it.places || [])[0]; return it.kind === 'move' ? ps[ps.length - 1] : ps[0]; }
  (function () {
    var d = tripToday();
    if (d) state.day = d;
    updateNext();
    setInterval(updateNext, 60000);
  })();
  $('next').addEventListener('click', function () {
    var id = this.getAttribute('data-place'); if (!id) return;
    stopTour(); if (onMap(id)) { flyToPlace(id, { sheet: true }); openPopup(id); } showPlace(id);
  });
  $('btn-sos').addEventListener('click', function () { openModal('🆘 비상 연락처', sosHtml()); });
  $('taxi').addEventListener('click', function () { $('taxi').hidden = true; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-taxi]');
    if (b) showTaxi(b.getAttribute('data-taxi'));
  });

  /* 한 번 열어 두면 인터넷이 끊겨도 일정·예약·비용 화면이 열리게 (지도 조각은 인터넷 필요) */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () { /* 안 되면 그냥 온라인으로 */ }); });
  }

  /* ---------- 시작 ---------- */
  render(false);          // 일정 목록을 먼저 그린다(지도와 무관)
  loadMapLibrary(0);      // 그다음 지도를 불러온다

  // 점검용: 브라우저 개발자 도구에서 지도 상태를 볼 수 있게 열어 둔다
  window.TRIP_APP = { getMap: function () { return map; }, isMapReady: function () { return mapReady; }, state: state };
})();
