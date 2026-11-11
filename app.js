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

  var state = { plan: 0, day: 'all', tourIdx: -1, playing: false, timer: null, bearing: -20 };
  var map = null, mapReady = false, markers = {}, popup = null, dashTimer = null;

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
  function mop(c) { return c.min === c.max ? 'MOP ' + c.min.toLocaleString() : 'MOP ' + c.min.toLocaleString() + '~' + c.max.toLocaleString(); }
  function link(url, text, cls) {
    return '<a class="' + (cls || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
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
      html += '<button type="button" class="tab" role="tab" data-day="' + d.date + '" style="--day-color:' + d.color +
        '" aria-selected="' + (state.day === d.date) + '"><span class="dot"></span>' + esc(d.label) + '</button>';
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

  function cardHtml(it, numberByPlace, linked) {
    var d = dayInfo(it.date) || {};
    var quiet = !!QUIET_KINDS[it.kind];
    var showNum = !quiet && it.kind !== 'move';
    var names = (it.places || []).map(function (id) {     // 지도 마커와 같은 번호를 장소 이름 앞에 붙인다
      var nm = esc(place(id) ? place(id).name : id);
      return (showNum && numberByPlace[id] ? '<span class="pnum">' + numberByPlace[id] + '</span>' : '') + nm;
    });
    var sep = it.kind === 'move' ? ' → ' : ' · ';
    var badges = [];
    if (it.transport && TRANSPORT[it.transport]) badges.push('<span class="badge">' + TRANSPORT[it.transport] + '</span>');
    if (it.cost) {
      badges.push('<span class="badge">💰 1가족 예상 ' + mop(it.cost) + (it.cost.optional ? ' (선택)' : '') + '</span>');
    }
    var rw = rhythmWarning(it);
    if (rw) badges.push('<span class="badge warn">⚠️ 아이 리듬 주의 · ' + esc(rw) + '</span>');
    closedWarning(it).forEach(function (n) {
      badges.push('<span class="badge closed">⛔ 휴무 주의 · ' + esc(n) + '</span>');
    });
    hoursWarning(it).forEach(function (t) {
      badges.push('<span class="badge warn">⏰ 영업시간 주의 · ' + esc(t) + '</span>');
    });
    if (it.warn) badges.push('<span class="badge warn">⚠️ 확인 필요 · ' + esc(it.warn) + '</span>');

    var html = '<div class="card' + (quiet ? ' quiet' : '') + '" tabindex="0" role="button" data-i="' + it._i +
      '" style="--day-color:' + (d.color || '') + '">';
    html += '<div class="card-top"><div class="card-time">' + esc(it.time) + (it.end ? '<small>~' + esc(it.end) + '</small>' : '') + '</div>';
    html += '<div class="card-main"><p class="card-title">' + (KIND_ICONS[it.kind] || '') + ' ' + esc(it.title) + '</p>';
    if (names.length) html += '<p class="card-place">' + names.join(sep) + '</p>';
    html += '</div></div>';
    if (badges.length) html += '<div class="badges">' + badges.join('') + '</div>';
    if (it.memo) html += '<p class="card-memo">' + esc(it.memo) + '</p>';
    if (it.cost && it.cost.note) html += '<p class="card-memo fine">💰 ' + esc(it.cost.note) + ' · 현장·공식 사이트에서 최종 확인</p>';
    else if (it.cost) html += '<p class="card-memo fine">금액은 현장·공식 사이트에서 최종 확인</p>';
    if (it.tips && it.tips.length) {
      html += '<ul class="tips">' + it.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    }

    var actions = [];
    var bk = bookingFor(it);
    if (bk) actions.push(bookingButton(bk.b));
    if (it.shuttle && D.shuttles[it.shuttle]) {
      actions.push(link(D.shuttles[it.shuttle].url, '🚌 셔틀 시간표', 'btn'));
    }
    if (it.kind !== 'move' && !quiet) {
      (it.places || []).forEach(function (id) {             // 같은 장소의 링크는 하루에 한 번만 보여 준다
        var p = place(id);
        if (!p || !p.url || linked[id] || (bk && bk.b.url === p.url)) return;
        linked[id] = true;
        actions.push(link(p.url, p.urlLabel || '소개 페이지', 'btn'));
      });
    }
    html += '<div class="card-actions">' + actions.join('') + '</div>';
    if (it.shuttle && D.shuttles[it.shuttle]) {
      html += '<p class="card-memo fine">' + esc(D.shuttles[it.shuttle].info) + ' · 운행 시각은 현장 확인</p>';
    }
    html += '</div>';
    return html;
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
    var R = D.rhythm || {};
    var html = '';
    if (R.breakfastStart) {
      html += '<p class="fine rhythm">👶 아이 리듬: 조식 ' + esc(R.breakfastStart) + ' · 낮잠 ' + esc(R.napStart) + '~' + esc(R.napEnd) +
        ' · 저녁 ' + esc(R.dinnerStart) + ' (늦어도 ' + esc(R.dinnerLatest) + ') · ' + esc(R.backToHotel) + ' 호텔 복귀 · ' + esc(R.bedtime) + ' 취침</p>';
    }
    viewDates().forEach(function (date) {
      var d = dayInfo(date);
      var c = dayCost(date);
      html += '<h2 class="day-head" style="--day-color:' + d.color + '">' + esc(d.label) +
        (d.summary ? ' <small>' + esc(d.summary) + '</small>' : '') + '</h2>';
      var prep = (plan().prep || {})[date];
      if (prep && prep.length) {
        html += '<details class="prep"' + (state.day === 'all' ? '' : ' open') + '><summary>🎒 오늘의 준비물</summary><ul>' +
          prep.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
      }
      if (c.max > 0) {
        html += '<p class="fine">💰 이날 1가족 예상 비용: <strong>' + mop(c) + '</strong> (시설 ' + mop({ min: c.ticketMin, max: c.ticketMax }) +
          ' + 택시 ' + mop({ min: c.taxiMin, max: c.taxiMax }) + ') · 현장·공식 사이트에서 최종 확인</p>';
      }
      var nums = numbering(date);
      var linked = {};
      items(date).forEach(function (it) { html += cardHtml(it, state.day === 'all' ? {} : nums, linked); });
    });
    $('cards').innerHTML = html;
  }

  function render(moveCamera) {
    stopTour();
    state.tourIdx = -1;
    renderPlanToggle();
    renderTabs();
    renderCards();
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

  function openPopup(id) {
    if (!mapReady || !onMap(id)) return;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 26, anchor: 'bottom', closeOnClick: true, focusAfterOpen: false })
      .setLngLat([place(id).lng, place(id).lat]).setHTML(popupHtml(id)).addTo(map);
    var box = popup.getElement().querySelector('.pop');      // 지도 높이에 맞춰 팝업 높이를 제한(넘치면 안쪽만 스크롤)
    if (box) box.style.maxHeight = Math.max(120, Math.min(360, Math.round(mapHeight() * 0.7) - 126)) + 'px';
    Object.keys(markers).forEach(function (k) { markers[k].getElement().classList.toggle('on', k === id); });
  }

  function mapHeight() { return map.getContainer().clientHeight || 400; }

  var flyToken = 0;
  function flyToPlace(id) {
    if (!mapReady || !onMap(id)) return;
    var my = ++flyToken;
    var center = [place(id).lng, place(id).lat];
    var offset = [0, Math.round(mapHeight() * 0.2)];   // 장소를 지도 아래쪽에 두어 위에 팝업 자리를 만든다
    state.bearing = state.bearing > 0 ? -25 : 35;      // 이동할 때마다 방향을 바꿔 입체감을 준다
    map.flyTo({ center: center, offset: offset, zoom: 16.6, pitch: 60, bearing: state.bearing, duration: 2000 });
    setTimeout(function () {                           // 도착한 뒤 천천히 조금 더 회전
      if (my !== flyToken || !mapReady || map.isMoving()) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      map.easeTo({ center: center, offset: offset, bearing: state.bearing + (state.bearing > 0 ? 18 : -18), duration: 2600, easing: function (x) { return x; } });
    }, 2200);
  }

  function fitTo(ids) {
    if (!mapReady) return;
    flyToken++;
    var pts = ids.filter(onMap).map(function (id) { return [place(id).lng, place(id).lat]; });
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo({ center: pts[0], zoom: 16, pitch: 60, bearing: -20, duration: 1800 }); return; }
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
    $('map-note').hidden = false;

    if (moveCamera) fitTo(ids);
  }

  function add3dBuildings() {
    try {
      var layers = map.getStyle().layers || [];
      var has = false;
      layers.forEach(function (l) {
        if (l.type === 'fill-extrusion') {
          has = true;
          map.setLayerZoomRange(l.id, 13, 24);
          map.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.85);
        }
      });
      if (has) return;
      var srcId = null;
      layers.forEach(function (l) { if (!srcId && l['source-layer'] === 'building') srcId = l.source; });
      if (!srcId) return;
      map.addLayer({
        id: 'tour-3d-buildings', type: 'fill-extrusion', source: srcId, 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': '#d9d3c7',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85
        }
      });
    } catch (e) { /* 3D 건물을 못 세워도 지도는 계속 쓴다 */ }
  }

  function addRouteLayers() {
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'routes-line', type: 'line', source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'active'], 1], 6, 3],
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 0.9, 0.25]
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
    $('map-note').hidden = true;
  }

  function createMap(styleUrl) {
    try {
      map = new maplibregl.Map({
        container: 'map', style: styleUrl,
        center: D.map.center, zoom: D.map.zoom, pitch: 55, bearing: -20, maxPitch: 70,
        attributionControl: { compact: true }
      });
    } catch (e) { mapFailed(); return; }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', function () {
      mapReady = true;
      add3dBuildings();
      addRouteLayers();
      updateMap(true);
    });
  }

  /* 지도 스타일을 차례로 시도: 첫 번째가 안 되면 대체 스타일로 자동 전환 */
  function tryStyles(i) {
    var list = D.map.styles;
    if (i >= list.length) { mapFailed(); return; }
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
    css.href = urls[i].replace(/\.js$/, '.css');
    document.head.appendChild(css);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; loadMapLibrary(i + 1); } }, 12000);
    s.src = urls[i];
    s.onload = function () {
      if (done) return;
      done = true; clearTimeout(timer);
      if (window.maplibregl) tryStyles(0); else loadMapLibrary(i + 1);
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
    flyToPlace(ids[0]);
    openPopup(ids[0]);
  }

  /* ---------- 투어 ---------- */
  function setTourStatus(t) { $('tour-status').textContent = t; }
  function setPlayButton() { $('tour-play').textContent = state.playing ? '⏸ 일시정지' : '▶ 투어'; }

  function goStop(idx) {
    var list = stops();
    if (!list.length) { setTourStatus('지도에 표시할 장소가 없습니다'); return false; }
    if (idx < 0) idx = 0;
    if (idx >= list.length) return false;
    state.tourIdx = idx;
    var s = list[idx];
    var el = highlight(s.item._i);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    flyToPlace(s.place);
    openPopup(s.place);
    setTourStatus((idx + 1) + '/' + list.length + ' · ' + s.item.time + ' ' + place(s.place).name);
    return true;
  }
  function scheduleNext() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () {           // 이동 약 2초 + 머무는 시간 3초
      if (!state.playing) return;
      if (state.tourIdx + 1 >= stops().length) { stopTour(); setTourStatus('투어가 끝났습니다'); state.tourIdx = -1; return; }
      goStop(state.tourIdx + 1);
      scheduleNext();
    }, 5000);
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
  function cardActivate(e) {
    if (e.target.closest('a, summary')) return;           // 예약 버튼·링크는 그대로 열리게 둔다
    var c = e.target.closest('.card');
    if (!c) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    stopTour();
    var it = plan().items[+c.getAttribute('data-i')];
    if (it) goItem(it);
  }
  $('cards').addEventListener('click', cardActivate);
  $('cards').addEventListener('keydown', cardActivate);

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
