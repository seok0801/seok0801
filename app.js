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
  var map = null, mapReady = false, markers = {}, popup = null, dashTimer = null;

  /* ---------- 3D 투어 카메라 설정 (숫자를 바꾸면 연출이 달라집니다) ---------- */
  var STOP_ZOOM = 16.1;      // 장소에 도착했을 때의 확대 정도 (클수록 가까이)
  var STOP_PITCH = 60;       // 지도를 기울이는 각도(도)
  var FLY_MS = 2000;         // 다음 장소로 날아가는 시간 (약 2초)
  var STAY_MS = 3000;        // 투어에서 한 장소에 머무는 시간 (3초)
  var ORBIT_DEG = 34;        // 머무는 동안 장소 둘레를 도는 각도
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
  function isNarrow() { return window.innerWidth < 900; }      // 휴대폰처럼 좁은 화면인지
  function link(url, text, cls) {
    return '<a class="' + (cls || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
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
  function stops() {
    var out = [];
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        if (NO_STOP_KINDS[it.kind]) return;
        (it.places || []).forEach(function (id) {
          if (onMap(id)) out.push({ item: it, place: id });
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
    var label = b.buttonLabel || '예약하기';
    return link(b.url, label + (must ? ' (필수)' : ''), 'btn book' + (must ? ' must' : '') + (small ? ' small' : ''));
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
      chips.push(chip('💰 ' + mopShort(it.cost) + opt, '💰 1가족 예상 ' + mop(it.cost) + opt));
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
      if (NO_STOP_KINDS[it.kind]) return;
      (it.places || []).forEach(function (id) {
        if (onMap(id) && !by[id]) by[id] = ++n;
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
        (c.max > 0 ? '<button type="button" class="day-cost" aria-label="이날 1가족 예상 비용 ' + mop(c) + ' · 비용 요약 열기">💰 ' + mop(c) + '</button>' : '') +
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
  function popupHtml(id) {
    var p = place(id);
    var t = PLACE_TYPES[p.type] || { icon: '📍', label: '' };
    var html = '<div class="pop"><h3>' + t.icon + ' ' + esc(p.name) + '</h3><p class="pop-type">' + esc(t.label) + '</p>';
    if (p.note) html += '<p>' + esc(p.note) + '</p>';
    if (p.hours) html += '<p>🕒 ' + esc(p.hours) + '</p>';
    if (p.verified === false) html += '<p class="unverified">위치는 건물 기준의 대략적인 표시입니다</p>';

    // 이 장소에서 하는 일정의 시간과 꿀팁을 모은다
    var tips = [], when = [], bk = null;
    viewDates().forEach(function (date) {
      items(date).forEach(function (it) {
        if (it.kind === 'move' || (it.places || []).indexOf(id) < 0) return;
        if (!QUIET_KINDS[it.kind]) when.push((state.day === 'all' ? it.date.slice(5).replace('-', '/') + ' ' : '') + it.time + ' ' + it.title);
        (it.tips || []).forEach(function (x) { if (tips.indexOf(x) < 0) tips.push(x); });
        if (!bk && it.booking && D.bookings[it.booking]) bk = D.bookings[it.booking];
      });
    });
    if (when.length) html += '<p>' + when.slice(0, 4).map(esc).join('<br>') + '</p>';
    if (tips.length) html += '<ul>' + tips.slice(0, 3).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (bk) html += bookingButton(bk);
    if (p.url && !(bk && bk.url === p.url)) html += link(p.url, p.urlLabel || '소개 페이지', 'btn');
    return html + '</div>';
  }

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
  var popupToken = 0;
  function openPopup(id, opt) {
    if (!mapReady || !onMap(id)) return;
    opt = opt || {};
    var my = ++popupToken;
    if (popup) popup.remove();
    var at = [place(id).lng, place(id).lat];
    if (opt.compact) {
      // 투어 중에는 3D 풍경이 가려지지 않게 마커 아래에 작은 이름표만 띄운다. 이름표를 누르면 자세한 팝업이 열린다
      popup = new maplibregl.Popup({ offset: 24, anchor: 'top', closeButton: false, closeOnClick: true, focusAfterOpen: false, className: 'tour-pop' })
        .setLngLat(at).setHTML(compactHtml(id, opt.item)).addTo(map);
      popup.getElement().addEventListener('click', function () { stopTour(); flyToPlace(id); openPopup(id, { color: opt.color }); });
    } else {
      popup = new maplibregl.Popup({ offset: 26, anchor: 'bottom', closeOnClick: true, focusAfterOpen: false })
        .setLngLat(at).setHTML(popupHtml(id)).addTo(map);
      var box = popup.getElement().querySelector('.pop');    // 지도 높이에 맞춰 팝업 높이를 제한(넘치면 안쪽만 스크롤)
      if (box) box.style.maxHeight = Math.max(120, Math.min(360, Math.round(mapHeight() * 0.7) - 126)) + 'px';
    }
    popup.on('close', function () { if (my === popupToken) clearFocus(); });   // 팝업을 닫으면 강조도 끈다
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
    var offset = [0, Math.round(mapHeight() * (opt.compact ? 0.12 : 0.2))];
    var cur = map.getBearing(), b = cur + 40;
    var from = state.lastPlace && state.lastPlace !== id && onMap(state.lastPlace) ? [place(state.lastPlace).lng, place(state.lastPlace).lat] : null;
    if (from && distanceM(from, center) > 80) {
      // 이동하는 방향을 바라보며 도착한다 (어지럽지 않게 한 번에 최대 100도까지만 돈다)
      var turn = ((bearingTo(from, center) - cur + 540) % 360) - 180;
      b = cur + Math.max(-100, Math.min(100, turn));
    }
    state.lastPlace = id;
    map.flyTo({ center: center, offset: offset, zoom: STOP_ZOOM, pitch: STOP_PITCH, bearing: b, duration: FLY_MS });
    setTimeout(function () {                           // 도착한 뒤 장소 둘레를 천천히 돌아 입체감을 준다
      if (my !== flyToken || !mapReady || map.isMoving() || reducedMotion()) return;
      map.easeTo({ center: center, offset: offset, bearing: b + ORBIT_DEG, duration: opt.orbitMs || 3600, easing: function (x) { return x; } });
    }, FLY_MS + 150);
  }

  function fitTo(ids) {
    if (!mapReady) return;
    flyToken++;
    state.lastPlace = null;
    var pts = ids.filter(onMap).map(function (id) { return [place(id).lng, place(id).lat]; });
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo({ center: pts[0], zoom: 16, pitch: STOP_PITCH, bearing: -20, duration: 1800 }); return; }
    var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach(function (p) { b.extend(p); });
    var wide = window.innerWidth >= 900;
    map.fitBounds(b, {
      padding: wide ? { top: 90, bottom: 70, left: 70, right: 70 } : { top: 70, bottom: 40, left: 40, right: 40 },
      pitch: 55, bearing: -20, maxZoom: 16.2, duration: 1800
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
    ids.forEach(function (id) {
      var p = place(id);
      var t = PLACE_TYPES[p.type] || { icon: '📍' };
      var el = document.createElement('div');
      el.className = state.day === 'all' ? 'mk small' : 'mk';   // 전체 보기에서는 작게
      el.style.setProperty('--mk-color', color);
      el.textContent = t.icon;
      if (nums[id]) { var n = document.createElement('span'); n.className = 'n'; n.textContent = nums[id]; el.appendChild(n); }
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        stopTour();
        flyToPlace(id);
        openPopup(id);
        highlightCardForPlace(id);
      });
      markers[id] = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
      el.setAttribute('role', 'button');          // 화면 읽기 프로그램이 장소 이름을 읽도록
      el.setAttribute('aria-label', p.name);
    });

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
    if (src) src.setData({ type: 'FeatureCollection', features: feats });

    if (moveCamera) fitTo(ids);
  }

  function add3dBuildings() {
    try {
      var layers = map.getStyle().layers || [];
      var has = false;
      // 높은 건물일수록 조금 진한 모래색으로 칠한다
      var color = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5],
        0, '#f2ede4', 30, '#e8dfd0', 100, '#dccfb9', 250, '#cdbb9d'];
      layers.forEach(function (l) {
        if (l.type === 'fill-extrusion') {
          has = true;
          map.setLayerZoomRange(l.id, 13, 24);
          map.setPaintProperty(l.id, 'fill-extrusion-color', color);
          map.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.95);
        }
      });
      if (!has) {
        var srcId = null;
        layers.forEach(function (l) { if (!srcId && l['source-layer'] === 'building') srcId = l.source; });
        if (srcId) {
          map.addLayer({
            id: 'tour-3d-buildings', type: 'fill-extrusion', source: srcId, 'source-layer': 'building', minzoom: 13,
            paint: {
              'fill-extrusion-color': color,
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.95
            }
          });
        }
      }
      // 남동쪽에서 비추는 햇빛: 건물 면마다 밝기가 달라져 입체감이 생기고, 카메라가 돌면 명암도 따라 바뀐다
      map.setLight({ anchor: 'map', color: '#ffffff', intensity: 0.45, position: [1.5, 135, 55] });
    } catch (e) { /* 3D 건물을 못 세워도 지도는 계속 쓴다 */ }
  }

  /* 지도 위 글자: 한국어 이름이 등록된 곳(마카오, 코타이, 베네시안 등)은 한국어로 보여 준다 */
  function localizeLabels() {
    try {
      (map.getStyle().layers || []).forEach(function (l) {
        var tf = l.type === 'symbol' && l.layout && l.layout['text-field'];
        if (!Array.isArray(tf) || JSON.stringify(tf).indexOf('name') < 0) return;   // 도로 번호 등은 그대로 둔다
        map.setLayoutProperty(l.id, 'text-field', ['case', ['has', 'name:ko'], ['get', 'name:ko'], tf]);
      });
    } catch (e) { /* 바꾸지 못하면 원래 글자 그대로 쓴다 */ }
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

  function addRouteLayers() {
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'routes-line', type: 'line', source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'active'], 1], 6, 3],
        // 가까이 들여다볼 때(확대 15.5 이상)는 다른 날의 동선을 거의 안 보이게 한다
        'line-opacity': ['interpolate', ['linear'], ['zoom'],
          13, ['case', ['==', ['get', 'active'], 1], 0.9, 0.25],
          15.5, ['case', ['==', ['get', 'active'], 1], 0.9, 0.08]]
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
      if (document.hidden || !mapReady) return;
      step = (step + 1) % seq.length;
      try { map.setPaintProperty('routes-dash', 'line-dasharray', seq[step]); } catch (e) { /* 무시 */ }
    }, 90);
  }

  function mapFailed() {
    mapReady = false;
    $('map-fallback').hidden = false;
  }

  function createMap(styleUrl) {
    try {
      var opts = {
        container: 'map', style: styleUrl,
        center: D.map.center, zoom: D.map.zoom, pitch: 55, bearing: -20, maxPitch: 70,
        antialias: true,                       // 3D 건물 모서리를 매끈하게
        attributionControl: { compact: true }
      };
      var extra = D.map.mapOptions || {};      // (선택) data.js 의 map.mapOptions 로 지도 옵션을 더할 수 있다
      Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
      map = new maplibregl.Map(opts);
    } catch (e) { mapFailed(); return; }
    map.addControl(new maplibregl.NavigationControl({ showZoom: !isNarrow(), visualizePitch: true }), 'top-right');
    map.on('load', function () {
      mapReady = true;
      // 지도 아래의 출처 표시는 접어 둔다 (ⓘ 를 누르면 펼쳐진다)
      var att = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      if (att) { att.classList.remove('maplibregl-compact-show'); att.removeAttribute('open'); }
      add3dBuildings();
      localizeLabels();
      addBeaconLayer();
      addRouteLayers();
      updateMap(true);
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
        if (!found && !NO_STOP_KINDS[it.kind] && (it.places || []).indexOf(id) >= 0) found = it;
      });
    });
    if (found) { var el = highlight(found._i); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  function goItem(it) {
    highlight(it._i);
    var ids = (it.places || []).filter(onMap);
    if (!ids.length) return;
    if (it.kind === 'move' && ids.length > 1) { if (popup) popup.remove(); fitTo(ids); return; }
    var compact = isNarrow();      // 휴대폰에서는 지도가 가려지지 않게 작은 이름표만 띄운다 (자세한 내용은 카드에 펼쳐진다)
    flyToPlace(ids[0], { compact: compact });
    openPopup(ids[0], { compact: compact, item: it, color: (dayInfo(it.date) || {}).color });
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
    closeCards(null);                 // 투어 중에는 카드를 접어 목록을 간결하게 둔다
    var s = list[idx];
    var el = highlight(s.item._i);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // 투어: 작은 이름표만 띄우고, 머무는 동안 장소 둘레를 돈다
    flyToPlace(s.place, { compact: true, orbitMs: STAY_MS - 150 });
    openPopup(s.place, { compact: true, item: s.item, color: (dayInfo(s.item.date) || {}).color });
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
    }, FLY_MS + STAY_MS);
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

  function bookingListHtml() {
    var order = { '필수': 0, '권장': 1, '선택': 2, '현장 구매': 3 };
    var used = {};
    items('all').forEach(function (it) {
      if (!it.booking || !D.bookings[it.booking]) return;
      (used[it.booking] = used[it.booking] || []).push(it.date.slice(5).replace('-', '/') + ' ' + it.time);
    });
    var keys = Object.keys(D.bookings).sort(function (a, b) {
      return (order[D.bookings[a].level] || 9) - (order[D.bookings[b].level] || 9);
    });
    var html = '<p class="fine">예약이 필요하거나 미리 사 두면 좋은 항목입니다. 버튼을 누르면 새 탭으로 열립니다. 예약번호는 이 사이트에 적지 말고 각자 예약 앱에서 확인하세요.</p>';
    keys.forEach(function (k) {
      var b = D.bookings[k];
      html += '<div class="bk"><h3>' + esc(b.name) + '</h3><p><span class="lvl' + (b.level === '필수' ? ' must' : '') + '">' + esc(b.level) + '</span>' +
        (used[k] ? ' &nbsp;' + esc(used[k].join(', ')) : ' &nbsp;<span class="fine">(선택 사항 · 일정에는 없음)</span>') + '</p>';
      if (b.note) html += '<p>' + esc(b.note) + '</p>';
      if (b.linkVerified === false) html += '<p class="fine">※ 링크가 열리는지 자동 확인하지 못했습니다. 안 열리면 공식 사이트에서 찾아 주세요.</p>';
      html += '<p>' + bookingButton(b) + '</p></div>';
    });
    return html;
  }

  function costHtml() {
    var tot = { ticketMin: 0, ticketMax: 0, taxiMin: 0, taxiMax: 0, min: 0, max: 0 };
    var rows = '';
    D.days.forEach(function (d) {
      var c = dayCost(d.date);
      Object.keys(tot).forEach(function (k) { tot[k] += c[k]; });
      rows += '<tr><td>' + esc(d.label) + '</td><td>' + mop({ min: c.ticketMin, max: c.ticketMax }).replace('MOP ', '') + '</td><td>' +
        mop({ min: c.taxiMin, max: c.taxiMax }).replace('MOP ', '') + '</td><td>' + mop(c).replace('MOP ', '') + '</td></tr>';
    });
    var html = '<p><strong>1가족(어른 2명, 아이 1명) 기준 · 단위 MOP</strong><br><span class="fine">' + esc(D.costNote || '') + '</span></p>';
    html += '<div class="table-wrap"><table class="cost"><thead><tr><th>날짜</th><th>시설 티켓</th><th>택시</th><th>합계</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td>여행 전체</td><td>' + mop({ min: tot.ticketMin, max: tot.ticketMax }).replace('MOP ', '') + '</td><td>' +
      mop({ min: tot.taxiMin, max: tot.taxiMax }).replace('MOP ', '') + '</td><td>' + mop(tot).replace('MOP ', '') + '</td></tr></tfoot></table></div>';
    html += '<p class="fine">모든 금액은 현장·공식 사이트에서 최종 확인하세요. 식비는 포함하지 않았습니다.</p>';

    html += '<h3 class="sec">항목별</h3><ul class="cost-list">';
    items('all').forEach(function (it) {
      if (!it.cost) return;
      html += '<li>' + esc(it.date.slice(5).replace('-', '/')) + ' ' + esc(it.title) + ' — <strong>' + mop(it.cost) + '</strong>' +
        (it.cost.optional ? ' (선택, 합계 제외)' : '') + (it.cost.note ? '<br><span class="fine">' + esc(it.cost.note) + '</span>' : '') + '</li>';
    });
    html += '</ul>';
    if (D.costExtras && D.costExtras.length) {
      html += '<h3 class="sec">참고</h3><ul class="cost-list">' + D.costExtras.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    return html;
  }

  /* ---------- 누르기(이벤트) 연결 ---------- */
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    state.day = b.getAttribute('data-day');
    render(true);
    $('panel').scrollTop = 0;
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

  // 손잡이: 목록을 크게(지도를 작게) / 원래대로
  $('grip').addEventListener('click', function () {
    var big = $('app').classList.toggle('list-big');
    this.setAttribute('aria-pressed', String(big));
    this.setAttribute('aria-label', big ? '지도 크게 보기' : '목록 크게 보기');
  });

  $('tour-play').addEventListener('click', function () { if (state.playing) stopTour(); else playTour(); });
  $('tour-next').addEventListener('click', function () { stepTour(1); });
  $('tour-prev').addEventListener('click', function () { stepTour(-1); });

  $('btn-booking').addEventListener('click', function () { openModal('예약 체크리스트', bookingListHtml()); });
  $('btn-cost').addEventListener('click', function () { openModal('비용 요약', costHtml()); });
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------- 시작 ---------- */
  render(false);          // 일정 목록을 먼저 그린다(지도와 무관)
  loadMapLibrary(0);      // 그다음 지도를 불러온다

  // 점검용: 브라우저 개발자 도구에서 지도 상태를 볼 수 있게 열어 둔다
  window.TRIP_APP = { getMap: function () { return map; }, isMapReady: function () { return mapReady; }, state: state };
})();
