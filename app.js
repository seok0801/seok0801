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
  function turnTo(b) { return is2d ? 0 : b; }
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
  function place(id) { return D.places[id]; }
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
  function isNarrow() { return window.innerWidth < 900; }      // 휴대폰처럼 좁은 화면인지
  function link(url, text, cls) {
    return '<a class="' + (cls || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
  }
  /* 그 장소를 구글 지도에서 여는 주소 (길찾기·리뷰·사진을 볼 수 있다) */
  function mapsLink(id) {
    var p = place(id);
    var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.mapQuery || (p.lat + ',' + p.lng));
    return link(url, '📍 구글 지도', 'btn');
  }

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
        actions.push(link(p.url, p.urlLabel || '소개 페이지', 'btn'));
      });
    }
    if (!isMove && !quiet) {
      var first = (it.places || []).filter(onMap)[0];
      if (first) actions.push(mapsLink(first));
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
        '</div>';
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
      $('foot-rhythm').textContent = '아이 리듬: 조식 ' + R.breakfastStart + ' · 낮잠 ' + R.napStart + '~' + R.napEnd +
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
  function nearbyHtml(p) {
    return '<div class="row-chips"><span class="row-label">주변 찾기</span>' + NEARBY.map(function (n) {
      var url = 'https://www.google.com/maps/search/' + encodeURIComponent(n[2]) + '/@' + p.lat + ',' + p.lng + ',17z?hl=ko';
      return '<a class="chip-sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="이 근처 ' + n[1] + ' 구글 지도에서 찾기">' + n[0] + ' ' + n[1] + '</a>';
    }).join('') + '</div>';
  }

  function placeHtml(id) {
    var p = place(id);
    var t = PLACE_TYPES[p.type] || { icon: '📍', label: '' };
    // 1) 장소 설명 한 줄 (종류 · 메모 · 영업시간)
    var meta = [t.label, p.note].filter(Boolean).join(' · ');
    var html = (meta || p.hours) ? '<p class="fine place-meta">' + esc(meta) + (p.hours ? (meta ? '<br>' : '') + '🕒 ' + esc(p.hours) : '') + '</p>' : '';
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
    if (!n) html += '<div class="card-actions">' + (p.url ? link(p.url, p.urlLabel || '소개 페이지', 'btn') : '') + mapsLink(id) + '</div>';
    // 3) 같은 건물·바로 옆의 다른 일정 장소 (마커가 겹쳐 누르기 어려울 때)
    var near = viewPlaceIds().filter(function (o) { return o !== id && distanceM([p.lng, p.lat], [place(o).lng, place(o).lat]) < 150; });
    if (near.length) {
      html += '<div class="row-chips"><span class="row-label">가까운 일정</span>' + near.map(function (o) {
        var ot = PLACE_TYPES[place(o).type] || { icon: '📍' };
        return '<button type="button" class="chip-sm" data-place="' + o + '">' + ot.icon + ' ' + esc(shortName(place(o).name)) + '</button>';
      }).join('') + '</div>';
    }
    // 4) 주변 가게 찾기 (구글 지도 앱)
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
  function fitTo(ids) {
    if (!mapReady) return;
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
      padding: wide ? { top: 110, bottom: 100, left: 90, right: 90 } : { top: 130, bottom: 110, left: 75, right: 75 },   // 위 날짜 줄·아래 버튼 줄과 펼친 마커가 가려지지 않게
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
    if (map.getLayer('tour-tall-roofs')) map.setPaintProperty('tour-tall-roofs', 'fill-extrusion-color', roofColor());
    if (map.getLayer('tour-tall-flat')) map.setPaintProperty('tour-tall-flat', 'fill-color', roofColor());

    // 동선 선: 고른 날짜는 진하게, 나머지는 흐리게
    var feats = D.days.map(function (d) {
      var c = routeCoords(d.date);
      return {
        type: 'Feature',
        properties: { color: d.color, active: state.day === 'all' || state.day === d.date ? 1 : 0 },
        geometry: { type: 'LineString', coordinates: c.length > 1 ? c : [] }
      };
    }).filter(function (f) { return f.geometry.coordinates.length > 1; });
    var src = map.getSource('routes');
    if (src) drawRoutes(src, feats);
    dashUntil = Date.now() + 8000;

    if (moveCamera) fitTo(ids);
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
        map.setPaintProperty(bLayer, 'fill-extrusion-pattern',
          ['step', H, windowPattern('#efeeea', '#efeeea', 'plain'), 20, windowPattern('#eeede9', '#dfe3e5', 'bands')]);
        // 주변 건물 지붕도 회색 계열로만
        map.addLayer({
          id: 'tour-roofs', type: 'fill-extrusion', source: srcId, 'source-layer': 'building', minzoom: 13,
          paint: {
            'fill-extrusion-color': ['step', H, '#e4e2dc', 28, '#dadddc'],
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
      map.addLayer({ id: 'tour-tall-walls', type: 'fill-extrusion', source: 'tour-tall',
        paint: { 'fill-extrusion-pattern': ['get', 'pat'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 } });
      map.addLayer({ id: 'tour-tall-flat', type: 'fill', source: 'tour-tall', layout: { visibility: 'none' },
        paint: { 'fill-color': roofColor(), 'fill-opacity': .7, 'fill-outline-color': '#a89f92' } });
      map.addLayer({ id: 'tour-tall-roofs', type: 'fill-extrusion', source: 'tour-tall',
        paint: { 'fill-extrusion-color': roofColor(), 'fill-extrusion-base': ['get', 'h'], 'fill-extrusion-height': ['+', ['get', 'h'], 1.2], 'fill-extrusion-opacity': 1 } });
      // 카메라가 멈춘 뒤와 지도 조각이 도착한 뒤에 확인한다
      var tallTimer = null;
      var later = function () { clearTimeout(tallTimer); tallTimer = setTimeout(raiseFlatBuildings, 700); };
      map.on('moveend', later);
      map.on('sourcedata', later);
      simplifyBaseMap();
      // 남동쪽에서 비추는 햇빛: 건물 면마다 밝기가 달라져 입체감이 생긴다
      map.setLight({ anchor: 'map', color: '#fffaf2', intensity: 0.32, position: [1.4, 135, 50] });
    } catch (e) { /* 3D 건물을 못 세워도 지도는 계속 쓴다 */ }
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
    } else if (kind === 'bands') {  // 주변 고층: 옅은 가로 띠창
      [5, 21].forEach(function (y) { g.fillRect(0, y, 32, 4); });
    }                               // plain: 낮은 건물은 창 없이 벽만
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
  function roofColor() {
    var expr = ['match', ['get', 'pid']], seen = {};
    D.days.forEach(function (d) {
      items(d.date).forEach(function (it) {
        (it.places || []).forEach(function (id) {
          if (seen[id] || !D.places[id]) return;
          var today = state.day === 'all' || state.day === d.date;
          if (state.day !== 'all' && !today) return;
          seen[id] = true;
          expr.push(id, mix(d.color, '#ffffff', state.day === 'all' ? .62 : .48));
        });
      });
    });
    expr.push('#e4ded4');
    return expr.length > 3 ? expr : '#e4ded4';
  }
  var ACCENT = { wall: '#f1e6d6', glass: '#a08a72' }, NEAR_M = 18;
  var tallKeys = {}, tallFeatures = [];   // 지도 조각이 나중에 도착해도 빠진 건물을 이어서 칠한다
  function raiseFlatBuildings() {
    if (!mapReady || map.getZoom() < 14.5) return;
    var changed = false, all = null;
    Object.keys(D.places).forEach(function (id) {
      var p = D.places[id];
      if (!onMap(id)) return;
      var pt = map.project([p.lng, p.lat]);
      var c = map.getContainer();
      if (pt.x < 0 || pt.y < 0 || pt.x > c.clientWidth || pt.y > c.clientHeight) return;
      if (!all) {
        // 지도 자료는 여러 건물을 한 덩어리(MultiPolygon)로 묶어 주기도 하므로, 건물 하나씩으로 나눠서 본다
        all = [];
        map.querySourceFeatures(map.getLayer('tour-roofs').source, { sourceLayer: 'building' }).forEach(function (f) {
          var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
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
        pat = pat || windowPattern(look.wall || ACCENT.wall, mix(look.glass || ACCENT.glass, look.wall || ACCENT.wall, .35));
        var h = Math.max(o.props.render_height || 5, own && p.height ? p.height : 0);
        // 원래 건물과 벽·지붕이 정확히 겹치면 카메라가 돌 때 깜빡이므로, 바깥으로 0.8m 넓히고 조금 높인다
        tallFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: o.rings.map(growRing) },
          properties: { h: h + 1.4, b: o.props.render_min_height || 0, pat: pat, pid: id } });
      });
    });
    if (changed) map.getSource('tour-tall').setData({ type: 'FeatureCollection', features: tallFeatures });
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
        set('background-color', '#eee3c4');          // 마카오 땅: 따뜻한 모래색
      } else if (l.type === 'fill') {
        if (/water/.test(id)) set('fill-color', SEA_COLOR);
        else if (/park|wood|grass|landcover|green|pitch|cemetery/.test(id)) { set('fill-color', '#b9c99c'); set('fill-opacity', 0.9); }
        else if (/building/.test(id)) set('fill-color', '#e2d6b4');
        else if (/aeroway/.test(id)) set('fill-color', '#d9d3c2');
        else { set('fill-color', '#e9ddbd'); }
        try { map.setPaintProperty(id, 'fill-pattern', undefined); } catch (e) { /* 무시 */ }
      } else if (l.type === 'line') {
        if (/water/.test(id)) set('line-color', '#9cc4d8');
        else if (/boundary|ferry|cablecar|rail|pier/.test(id)) map.setLayoutProperty(id, 'visibility', 'none');
        else if (/casing/.test(id)) set('line-color', '#d3c4a0');   // 도로: 흰 길에 옅은 테두리
        else set('line-color', '#fffdf7');
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
  /* 바다는 가운데 물길과 바깥까지 모두 하늘색으로 남기고, 마카오 밖의 땅(헝친·주하이)만 연회색으로 흐리게 칠한다 */
  var SEA_COLOR = '#aed6e8';
  var MASK_COLOR = '#e1e3e3';
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
      (map.getStyle().layers || []).forEach(function (l) {
        if (l.id.indexOf('tour-') === 0) return;
        var sl = l['source-layer'];
        if (l.type === 'symbol' || (l.type === 'line' && /transportation|aeroway|boundary/.test(sl || ''))) {
          var f = l.filter;
          try { map.setFilter(l.id, f ? ['all', f, inside] : inside); } catch (e) { /* 이 층은 그대로 둔다 */ }
        }
      });
    } catch (e) { /* 덮지 못해도 지도는 그대로 쓴다 */ }
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
      if (l.type === 'fill-extrusion') map.setLayoutProperty(l.id, 'visibility', is2d ? 'none' : 'visible');
    });
    ['tour-flat', 'tour-tall-flat'].forEach(function (id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', is2d ? 'visible' : 'none'); });
    if (is2d) { map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); }
    else { map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); }
    limitPitch();
    map.easeTo({ pitch: tilt(Math.min(55, map.getMaxPitch())), bearing: turnTo(-20), duration: animate ? 800 : 0 });
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
  function openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  function closeModal() { $('modal').hidden = true; }
  $('modal-body').addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    copyText(btn.getAttribute('data-copy'), function () {
      var tag = btn.querySelector('.cp-copy'); tag.textContent = '복사됨 ✓';
      setTimeout(function () { tag.textContent = '복사'; }, 1500);
    });
  });
  /* 예약 체크: 누르면 이 휴대폰에 기억하고 목록을 다시 그린다 */
  $('modal-body').addEventListener('change', function (e) {
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
    var keys = Object.keys(D.bookings).sort(function (a, b) {
      return (order[D.bookings[a].level] || 9) - (order[D.bookings[b].level] || 9);
    });
    var done = doneSet(), left = keys.filter(function (k) { return !done[k] && D.bookings[k].level !== '선택' && D.bookings[k].level !== '현장 구매'; }).length;
    var html = '<p class="bk-sum">' + (left ? '⏳ 미리 할 예약 <strong>' + left + '개</strong> 남음' : '✅ 미리 할 예약 끝!') +
      '<br><span class="fine">⭐ 권장 · ➕ 선택 · 🏷️ 현장 구매 · 🔒 예약번호는 여기 적지 마세요</span>' +
      '<br><span class="fine">🔗 판매처(클룩·마이리얼트립·더라운지)가 표시된 버튼은 제휴 링크입니다. 이 링크로 예약하면 사이트를 만든 사람이 수수료를 받을 수 있습니다.</span></p>';
    keys.forEach(function (k) {
      var b = D.bookings[k];
      html += '<div class="bk2' + (done[k] ? ' done' : '') + '">' +
        '<label class="bk2-check"><input type="checkbox" data-done="' + k + '"' + (done[k] ? ' checked' : '') + ' aria-label="' + esc(b.short || b.name) + ' 예약 완료"></label>' +
        '<div class="bk2-main"><p class="bk2-title">' + (b.icon || '🎫') + ' ' + esc(b.short || b.name) + ' <span class="bk2-lvl">' + (LEVEL_ICON[b.level] || '') + '</span>' +
          (b.affBy ? ' <span class="bk2-by">' + esc(b.affBy) + '</span>' : '') + '</p>' +
        '<p class="bk2-key">' + (used[k] ? '📅 ' + esc(used[k].filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ')) + ' · ' : b.when ? '📅 ' + esc(b.when) + ' · ' : '') + esc(b.key || '') + '</p>' +
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
      '<li>👶 아이는 키 1m 미만 기준 (대부분 무료·할인)</li></ul>';
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
  $('btn-mode').addEventListener('click', toggleMode);
  /* 제목 옆 D-day: 출발 전 'D-45', 여행 중 '2일차', 다녀온 뒤 '다녀왔어요' (한국 시간 기준) */
  (function () {
    var first = D.days[0] && D.days[0].date, last = D.days[D.days.length - 1] && D.days[D.days.length - 1].date;
    if (!first) return;
    var today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    var dd = Math.round((Date.parse(first) - Date.parse(today)) / 86400000);
    var txt = dd > 0 ? 'D-' + dd : dd === 0 ? 'D-DAY ✈️' : today <= last ? (1 - dd) + '일차' : '다녀왔어요';
    var b = document.createElement('span');
    b.className = 'dday'; b.textContent = txt;
    $('title').insertBefore(b, $('title').firstChild);
  })();
  loadRate();
  applyMode(false);
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('modal').hidden) closeModal(); else hideSheet();
  });

  /* ---------- 시작 ---------- */
  render(false);          // 일정 목록을 먼저 그린다(지도와 무관)
  loadMapLibrary(0);      // 그다음 지도를 불러온다

  // 점검용: 브라우저 개발자 도구에서 지도 상태를 볼 수 있게 열어 둔다
  window.TRIP_APP = { getMap: function () { return map; }, isMapReady: function () { return mapReady; }, state: state };
})();
