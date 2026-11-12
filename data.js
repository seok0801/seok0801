/* ============================================================
 * 마카오 가족여행 2026.12.27–31 — 일정 데이터
 * ------------------------------------------------------------
 * 일정이 바뀌면 이 파일만 고치면 됩니다. (고치는 법은 README.md 참고)
 *
 *  - 글자는 반드시 작은따옴표 ' ' 안에 씁니다.  예) title: '키즈시티'
 *  - 시간은 24시간제 '시:분' 으로 씁니다.        예) time: '09:30'
 *  - 각 줄 끝의 쉼표( , )를 지우지 마세요.
 *  - // 뒤의 글은 설명(주석)이라 화면에 나오지 않습니다.
 *
 * ※ 이 저장소와 사이트는 공개입니다. 예약번호·바우처 번호·좌석번호·
 *    카드 정보·가족 이름 같은 개인정보는 절대 적지 마세요.
 *
 * 가격·운영시간·좌표·링크는 2026년 11월 11일에 확인한 내용입니다.
 * ============================================================ */

window.TRIP_DATA = {

  /* ---------- 아이 기준 하루 리듬 (시각을 바꾸면 '아이 리듬 주의' 기준도 같이 바뀝니다) ---------- */
  rhythm: {
    breakfastStart: '07:30',   // 조식 시작
    breakfastLatest: '08:00',  // 조식은 늦어도 이때까지 시작
    napStart: '13:00',         // 낮잠 시작
    napEnd: '15:00',           // 낮잠 끝
    dinnerStart: '17:30',      // 저녁 시작
    dinnerLatest: '18:30',     // 저녁이 이보다 늦게 시작하면 '아이 리듬 주의'
    backToHotel: '20:00',      // 활동이 이보다 늦게 끝나면 '아이 리듬 주의' (호텔 복귀 후 목욕)
    bedtime: '21:00'           // 취침
  },

  /* ---------- 지도 설정 (고칠 일 없음) ---------- */
  map: {
    center: [113.5640, 22.1500],   // 처음 보이는 위치 [경도, 위도]
    zoom: 12.4,
    // 지도를 움직일 수 있는 범위 [[서쪽, 남쪽], [동쪽, 북쪽]]. 화면이 이 밖(빈 바탕)으로 밀려나지 않습니다
    bounds: [[113.505, 22.085], [113.630, 22.232]],
    minZoom: 10.5,
    // 지도에 그릴 영역(마카오). 이 선 바깥(헝친·주하이)은 바다색으로 덮어, 마카오만 바다 위의 섬처럼 보입니다.
    // [경도, 위도] 를 차례로 이은 선. 서쪽은 마카오와 헝친·주하이 사이 물길 한가운데를 지납니다.
    area: [
      [113.5420, 22.2168], [113.5530, 22.2172], [113.5660, 22.2185], [113.6000, 22.2185],
      [113.6100, 22.1900], [113.6100, 22.0950], [113.5487, 22.0950], [113.5487, 22.1400],
      [113.5470, 22.1460], [113.5440, 22.1530], [113.5395, 22.1630], [113.5350, 22.1690],
      [113.5310, 22.1815], [113.5300, 22.1900], [113.5330, 22.1990], [113.5370, 22.2050],
      [113.5395, 22.2120], [113.5420, 22.2168]
    ],
    // 지도 엔진 MapLibre GL JS (버전 4.7.1 고정). 첫 주소가 안 되면 둘째 주소를 씁니다.
    libraryUrls: [
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
      'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'
    ],
    // 지도 그림(OpenFreeMap, 무료·키 없음). 첫 스타일이 안 되면 다음 스타일로 자동 전환합니다.
    styles: [
      'https://tiles.openfreemap.org/styles/liberty',
      'https://tiles.openfreemap.org/styles/bright',
      'https://tiles.openfreemap.org/styles/positron'
    ]
  },

  /* ---------- 날짜 (color = 그날 동선과 카드의 색) ---------- */
  days: [
    { date: '2026-12-27', label: '12/27(일)', color: '#d1451f', summary: '도착 · 윈 팰리스 야경' },
    { date: '2026-12-28', label: '12/28(월)', color: '#1f6fc4', summary: '구시가지 · 타이파 빌리지' },
    { date: '2026-12-29', label: '12/29(화)', color: '#0f8a5f', summary: 'W로 이동 · 키즈시티' },
    { date: '2026-12-30', label: '12/30(수)', color: '#8e44ad', summary: '판다 · 콜로안 · 워터파크' },
    { date: '2026-12-31', label: '12/31(목)', color: '#a86f00', summary: '귀국' }
  ],

  /* ---------- 장소 목록 ----------
   * type(종류): hotel 호텔 / kids 키즈 / sight 구경 / shop 쇼핑·구경 / oldtown 구시가지 /
   *             transport 교통 / airport 공항 / food 식당 / snack 간식
   * lng 경도, lat 위도 (OpenStreetMap 지도에서 확인)
   * verified: true = 지도에서 그 장소를 직접 찾아 확인함 / false = 건물 안의 대략적인 위치
   * height: 공개 지도에 높이가 없어 납작하게 나오는 건물을 세울 대략의 높이(m)
   * look: 그 건물을 실제에 가까운 색으로 칠한다 { wall 벽, glass 유리, roof 지붕, radius 주변 몇 m 건물까지 }. 구글 어스에서 본 색감을 참고한 대략의 값
   * open, close: 일정 시간이 영업 전·후이면 카드에 '영업시간 주의'가 뜹니다 (방문하는 요일 기준)
   * closedWeekdays: 정기 휴무 요일 (0 일, 1 월, 2 화, 3 수, 4 목, 5 금, 6 토)
   * closedDates: 쉬는 날짜 → 일정과 겹치면 '휴무 주의'가 뜹니다
   * mapQuery: '📍 구글 지도' 버튼이 구글 지도에서 찾을 이름 (영문 상호 + 지역). 상점·시설 정보 페이지가 바로 열린다 */
  places: {
    // 공항
    icn: { mapQuery: 'Incheon International Airport Terminal 2', name: '인천공항 T2', type: 'airport', lng: 126.43474, lat: 37.46847, verified: true, offMap: true, note: '지도 밖, 출발·도착 표시만' },
    mfm: { mapQuery: 'Macau International Airport', name: '마카오 국제공항', type: 'airport', lng: 113.57434, lat: 22.15744, verified: true, look: { wall: '#eef0f0', glass: '#7f9bb0', roof: '#d5d9da', radius: 120 } },

    // 호텔
    glp: { mapQuery: 'Grand Lisboa Palace Macau',
      name: '그랜드 리스보아 팰리스', type: 'hotel', lng: 113.57420, lat: 22.14409, verified: true,
      height: 75,     // 공개 지도에 건물 높이가 없어 넣은 대략의 높이(m). 실제와 다를 수 있음
      look: { wall: '#efe9da', glass: '#6b7f8c', roof: '#6f9085', radius: 60 },   // 크림색 벽, 청록 지붕
      note: '12/27~29 숙박', url: 'https://www.grandlisboapalace.com/kr', urlLabel: '호텔 공식'
    },
    wmacau: { mapQuery: 'W Macau Studio City',
      name: 'W 마카오 스튜디오 시티', type: 'hotel', lng: 113.56023, lat: 22.14198, verified: true,
      height: 110,    // 대략의 높이(m)
      look: { wall: '#7d8ca0', glass: '#2f3e52', roof: '#59677a', radius: 140 },  // 청회색 유리 건물
      note: '12/29~31 숙박 · 체크인 15:00, 체크아웃 11:00'
    },

    // 12/27
    wynn: { mapQuery: 'Wynn Palace Performance Lake Macau',
      name: '윈 팰리스 스카이캡·분수쇼', type: 'sight', lng: 113.56946, lat: 22.14804, verified: true,
      note: '스카이캡 승강장 위치', hours: '스카이캡 일~목 16:00~22:00 (마지막 탑승 21:40) · 분수쇼 18:00 이후 20분 간격',
      open: '16:00', close: '22:00',
      url: 'https://www.wynnresortsmacau.com/ko/wynn-palace/experiences/entertainment/sky-cab', urlLabel: '스카이캡 공식'
    },
    gourmet: { mapQuery: 'Gourmet Pavilion Wynn Palace Macau',
      name: '고메 파빌리온 푸드홀 (윈 팰리스)', type: 'food', lng: 113.57279, lat: 22.14722, verified: true,
      look: { wall: '#9a6a48', glass: '#4a2f22', roof: '#e3d8c4', radius: 190 },  // 윈 팰리스: 구릿빛 유리
      note: '예약 없이 들어가는 캐주얼 푸드홀 (치킨라이스·죽·국수·만두)',
      hours: '푸드홀 11:30~22:30 · 수~월 영업 (화요일은 영업일에 없음)', open: '11:30', close: '22:30', closedWeekdays: [2],
      url: 'https://www.wynnresortsmacau.com/ko/wynn-palace/dining/gourmet-pavilion', urlLabel: '식당 공식'
    },

    // 12/28
    cod: { mapQuery: "Kids' City City of Dreams Macau",
      name: '시티 오브 드림즈 키즈시티', type: 'kids', lng: 113.56641, lat: 22.14918, verified: true,
      look: { wall: '#5b7088', glass: '#27374b', roof: '#7b8794', radius: 110 },  // 짙은 푸른 유리
      note: '실내 놀이터 (3층)', hours: '10:30~19:00 (마지막 입장 18:00) · 평소 수·목 휴무지만 12/20~31은 매일 운영',
      open: '10:30', close: '19:00'
    },
    chankee: { mapQuery: 'Chan Kee Roast Goose City of Dreams Macau',
      name: '찬키 로스트 구스 (시티 오브 드림즈 SOHO)', type: 'food', lng: 113.56670, lat: 22.14856, verified: true,
      note: '2층 SOHO 식당가 · 거위구이 덮밥·국수', hours: '월~목 11:00~22:00, 금~일 11:00~23:00', open: '11:00', close: '22:00',
      url: 'https://www.cityofdreamsmacau.com/kr/dining/chan-kee-roasted-goose', urlLabel: '식당 공식'
    },
    taipa: { mapQuery: 'Rua do Cunha Taipa Macau',
      name: '쿤하 거리 (타이파 빌리지)', type: 'snack', lng: 113.55697, lat: 22.15359, verified: true,
      note: '세라두라·아몬드 쿠키 등 먹거리 골목', url: 'https://www.taipavillagemacau.com/', urlLabel: '타이파 빌리지 안내'
    },
    taileiloikei: { mapQuery: 'Tai Lei Loi Kei Taipa Macau',
      name: '대리라이기 (타이파 빌리지)', type: 'snack', lng: 113.55590, lat: 22.15251, verified: true,
      note: '마카오 명물 돼지갈비빵', hours: '매일 08:00~18:00 (소개 페이지 기준)', open: '08:00', close: '18:00',
      url: 'https://www.taipavillagemacau.com/directory/cafe-dai-lei-loi-kei/', urlLabel: '소개 페이지'
    },
    londoner: { mapQuery: 'Hampton Court Londoner Grand Macao',
      name: '햄튼 코트 뷔페 (런더너 그랜드 2층)', type: 'food', lng: 113.56540, lat: 22.14470, verified: true,
      look: { wall: '#e6dcc3', glass: '#55606b', roof: '#b9b3a3', radius: 110 },  // 크림색 석조풍
      note: '런더너 그랜드(옛 쉐라톤) 2층 Henry\'s Kitchen · 국제식·중식 저녁 뷔페', hours: '저녁 뷔페 17:30~22:30 (금·토·일·공휴일 ~23:00, 공식)', open: '17:30', close: '22:30',
      url: 'https://www.londonermacao.com/macau-restaurants/hampton-court.html', urlLabel: '공식 안내'
    },
    venetian: { mapQuery: 'The Venetian Macao', name: '베네시안·파리지앵', type: 'shop', lng: 113.56047, lat: 22.14820, verified: true, note: '크리스마스 장식 구경', look: { wall: '#dccaa2', glass: '#6a5f4e', roof: '#e9e6dc', radius: 160 } },

    // 12/29
    grandlisboa: { mapQuery: 'Grand Lisboa Macau',
      name: '그랜드 리스보아 (셔틀 타고 내리는 곳)', type: 'transport', lng: 113.54338, lat: 22.19093, verified: true,
      look: { wall: '#b8914e', glass: '#5a4320', roof: '#c9a65f', radius: 50 },    // 금빛 유리 탑
      note: '마카오 반도. 그랜드 리스보아 팰리스 무료 셔틀 승하차', url: 'https://www.grandlisboa.com/kr/getting-here', urlLabel: '셔틀 안내'
    },
    margaret: { mapQuery: "Margaret's Cafe e Nata Macau",
      name: '마가렛 카페 이 나타', type: 'snack', lng: 113.54179, lat: 22.19180, verified: true,
      note: '에그타르트', hours: '월~금 08:30~16:30, 주말 10:00~18:00 · 수요일 휴무 (2026년 가이드 기준)', open: '08:30', close: '16:30', closedWeekdays: [3],
      url: 'https://citiesinsider.com/country/china/macao/cafes-and-bakeries/en', urlLabel: '소개 페이지(영문)'
    },
    senado: { mapQuery: 'Senado Square Macau', name: '세나도 광장', type: 'oldtown', lng: 113.53999, lat: 22.19383, verified: true, note: '돌길, 아기띠 권장', look: { wall: '#ecd98f', glass: '#5d6b4f', roof: '#b9b4a8', radius: 110 } },
    stpaul: { mapQuery: "Ruins of St. Paul's Macau", name: '성 바울 성당 유적', type: 'oldtown', lng: 113.54086, lat: 22.19746, verified: true, note: '계단 많음', look: { wall: '#cfc8b8', glass: '#6f6a60', roof: '#a9a497', radius: 70 } },
    koikei: { mapQuery: 'Koi Kei Bakery Senado Square Macau',
      name: '쿠이케이 (세나도 광장 지점)', type: 'snack', lng: 113.53965, lat: 22.19371, verified: true,
      note: '아몬드 쿠키·에그타르트, 선물용으로도 좋음', hours: '영업시간 미확인 (근처 성 바울 지점은 10:00부터로 안내)'
    },
    wongchikei: { mapQuery: 'Wong Chi Kei Senado Square Macau',
      name: '웡치케이 (세나도 광장)', type: 'food', lng: 113.54019, lat: 22.19414, verified: true,
      note: '완탕면·죽 노포', hours: '08:00~23:00, 정기 휴무 없음 (여행 사이트 기준)', open: '08:00', close: '23:00'
    },
    funzone: { mapQuery: 'Super Fun Zone Studio City Macau',
      name: '슈퍼 펀 존 (스튜디오 시티)', type: 'kids', lng: 113.55985, lat: 22.14125, verified: false,
      note: '실내 놀이터. W와 같은 건물', hours: '12/21~31은 10:30~19:00', open: '10:30', close: '19:00'
    },
    dtf: { mapQuery: 'Din Tai Fung Studio City Macau',
      name: '딘타이펑 (스튜디오 시티)', type: 'food', lng: 113.56120, lat: 22.14140, verified: false,
      note: '1층 1029호 · 딤섬·면', hours: '월~금 12:00~22:00 (주문 마감 21:30), 주말·공휴일 11:00~22:30', open: '12:00', close: '22:00',
      url: 'https://www.studiocity-macau.com/kr/dining/din-tai-fung', urlLabel: '식당 공식'
    },
    wheel: { mapQuery: 'Golden Reel Studio City Macau',
      name: '스튜디오 시티 8자 관람차 (골든 릴)', type: 'sight', lng: 113.56072, lat: 22.14102, verified: false,
      note: 'W와 같은 건물', hours: '14:00~20:00 (매표 13:30부터)', open: '14:00', close: '20:00'
    },

    // 12/30
    panda: { mapQuery: 'Macao Giant Panda Pavilion',
      name: '마카오 자이언트 판다관 (석배만 공원)', type: 'kids', lng: 113.55923, lat: 22.12663, verified: true,
      note: '콜로안. 월요일 휴관, 1시간 단위 입장', hours: '10:00~13:00, 14:00~17:00 · 월요일 휴관', open: '10:00', close: '17:00', closedWeekdays: [1]
    },
    lordstow: { mapQuery: "Lord Stow's Bakery Coloane Macau",
      name: '로드 스토우 베이커리 본점 (콜로안)', type: 'snack', lng: 113.55133, lat: 22.11820, verified: true,
      look: { wall: '#eedc94', glass: '#58705a', roof: '#b97a5e', radius: 110 },   // 파스텔 노란 벽, 붉은 기와
      note: '마카오식 에그타르트의 원조', hours: '매일 07:00~21:00 (가이드 기준, 공식 페이지에는 시간 표시 없음)', open: '07:00', close: '21:00',
      url: 'https://www.lordstow.com/contact-us/', urlLabel: '공식'
    },
    ngatim: { mapQuery: 'Cafe Nga Tim Coloane Macau',
      name: '응아팀 카페 (콜로안)', type: 'food', lng: 113.55124, lat: 22.11705, verified: true,
      note: '성당 앞 광장의 중식·포르투갈식 식당, 영어 메뉴 있음', hours: '매일 12:00~자정 (안내 사이트 기준)', open: '12:00', close: '23:59',
      url: 'https://macau.com/listing/nga-tim-cafe/', urlLabel: '소개 페이지'
    },
    waterpark: { mapQuery: 'Studio City Water Park Macau',
      name: '스튜디오 시티 실내 워터파크', type: 'kids', lng: 113.56096, lat: 22.14062, verified: true,
      note: '키 1m 미만 무료', hours: '12월은 실내만 12:00~20:00 (매표 11:45부터) · 12/29(화) 휴장', open: '12:00', close: '20:00',
      closedDates: ['2026-12-29']
    },
    foodrepublic: { mapQuery: 'Food Republic Studio City Macau',
      name: '푸드 리퍼블릭 (스튜디오 시티)', type: 'food', lng: 113.56072, lat: 22.14206, verified: true,
      note: '1층 1180호 · 국수·딤섬 등 여러 가게가 모인 푸드코트', hours: '10:00~23:00', open: '10:00', close: '23:00',
      url: 'https://www.studiocity-macau.com/kr/dining/food-republic', urlLabel: '식당 공식'
    }
  },

  /* ---------- 예약 링크 ----------
   * level: '필수'(빨간 버튼) / '권장' / '선택' / '현장 구매'
   * linkVerified: true = 링크가 열리는 것을 확인함 / false = 확인하지 못함 */
  /* 예약 링크. aff 는 제휴 예약 링크(affBy 판매처) — 있으면 '예약' 버튼이 이 링크로 열리고, url(공식 사이트)은 '자세히' 안에 보인다.
   * when 은 일정에 없는 항목의 이용 날짜. icon·short·key 는 예약 체크리스트에 한 줄로 보이는 아이콘·짧은 이름·핵심(금액 단위 MOP), note 는 '자세히'를 눌러야 보이는 설명 */
  bookings: {
    cod: {
      name: '시티 오브 드림즈 키즈시티', level: '권장', linkVerified: true,
      icon: '🧸', short: '키즈시티', key: '아이 180 · 어른 20',
      aff: 'https://3ha.in/r/895272', affBy: '클룩',
      url: 'https://www.cityofdreamsmacau.com/kr/attractions/kids-city',
      note: '12/20~31 특별일 요금: 아이(1~17세) MOP 180, 어른 MOP 20. 페이지 안의 예매 버튼으로 온라인 구매.'
    },
    dancingwater: {
      name: '하우스 오브 댄싱 워터 (시티 오브 드림즈 수상 공연)', level: '선택', linkVerified: true,
      icon: '🎭', short: '댄싱 워터 공연 (선택)', key: '어른 698~ · 3세 미만 무릎 무료',
      aff: 'https://3ha.in/r/895307', affBy: '클룩',
      url: 'https://www.cityofdreamsmacau.com/en/house-of-dancing-water',
      note: '좌석 요금(공식): 갤러리 MOP 698 · 시그니처 898 · 그랜드 1,098 · 프리미엄 1,298. 어른 2명 가장 싼 좌석이면 MOP 1,396. ' +
        '만 3세 미만은 좌석 없이 어른 무릎에 앉으면 무료(어른 1명당 아이 1명, 신분증 필요)로 판매처들이 안내합니다. 기준 나이를 "만 2세 이하"로 적은 곳도 있어 예매 때 확인하세요. ' +
        '공연 시각은 16:30·19:30으로 안내되지만 요일마다 달라 예매 달력에서 확인하세요. 19:30 공연은 아이 취침(21:00)과 겹치니 16:30 공연이 낫습니다. ' +
        '큰 소리·불꽃·안개·물 튀김 효과가 있고 6세 미만에게는 권장하지 않는다는 안내가 있습니다. 앞줄은 물이 튈 수 있습니다. 지금 일정에는 넣지 않았습니다.'
    },
    hampton: {
      name: '햄튼 코트 저녁 뷔페 (런더너 그랜드 2층)', level: '권장', linkVerified: true,
      icon: '🍽️', short: '햄튼 코트 뷔페 저녁', key: '어른 988 · 4세 미만 무료 · ☎ 8118 8822',
      aff: 'https://3ha.in/r/895226', affBy: '클룩', affNote: '클룩 이용권을 사도 12/28 저녁 자리는 전화(+853 8118 8822)로 한 번 더 확인하세요. 공식 안내상 저녁 예약은 전화로만 받습니다.',
      url: 'https://www.londonermacao.com/macau-restaurants/hampton-court.html',
      note: '쉐라톤 그랜드가 런더너 그랜드로 바뀌며 생긴 저녁 뷔페로, 예전 FEAST 대신 이곳을 예약합니다. 공식 요금: 어른 MOP 988, 아이(만 4~12세 미만) 498, 만 4세 미만 무료, 봉사료 10% 별도 → 어른 2명 약 MOP 2,174. ' +
        '저녁 17:30~22:30(금·토·일·공휴일 ~23:00). 저녁 뷔페 예약은 전화만 받는다고 안내되어 있습니다: +853 8118 8822. 복장은 스마트 캐주얼.'
    },
    funzone: {
      name: '슈퍼 펀 존', level: '권장', linkVerified: true,
      icon: '🎈', short: '슈퍼 펀 존', key: '아이 120 · 어른 120 · 🧦 양말',
      aff: 'https://3ha.in/r/895138', affBy: '클룩',
      url: 'https://www.studiocity-macau.com/kr/attractions/super-fun-zone',
      note: '12/21~31 특별일 요금: 키 1m 미만 아이 MOP 120, 어른 MOP 120. 온라인 사전 예약 권장.'
    },
    wheel: {
      name: '8자 관람차 (골든 릴)', level: '선택', linkVerified: true,
      icon: '🎡', short: '8자 관람차', key: '1인 100 · 현장 구매 가능',
      aff: 'https://3ha.in/r/895142', affBy: '클룩',
      url: 'https://www.studiocity-macau.com/kr/attractions/golden-reel',
      note: '1인 MOP 100, 만 2세 미만만 무료. 현장 구매도 가능.'
    },
    panda: {
      name: '자이언트 판다관 입장권', level: '현장 구매', linkVerified: true, buttonLabel: '관광청 안내',
      icon: '🐼', short: '판다관', key: '현장 회차권 · 무료 또는 어른 10 · ☎ 2833 7676',
      url: 'https://www.macaotourism.gov.mo/ko/sightseeing/other-attractions/macao-giant-panda-pavilion',
      note: '매표소에서 입장 회차권을 받습니다. 요금은 어른 MOP 10(아이 무료)이라는 안내와 2021년부터 무료(온라인 예약)라는 정부 발표가 함께 있어 현장 확인이 필요합니다. ' +
        '판다관 자체 사이트(macaupanda.org.mo)는 열리지 않을 때가 있어 마카오 관광청 안내로 연결했습니다. 운영 시간·휴관일 문의: 시민 서비스 전화 2833 7676.'
    },
    waterpark: {
      name: '스튜디오 시티 실내 워터파크', level: '권장', linkVerified: true,
      icon: '🌊', short: '실내 워터파크', key: '어른 398 · 1m 미만 무료',
      aff: 'https://3ha.in/r/895274', affBy: '클룩',
      url: 'https://www.studiocity-macau.com/kr/attractions/studio-city-water-park',
      note: '12월 겨울 요금: 어른 MOP 398, 아이(키 1~1.19m) MOP 258, 1m 미만 무료. 12/29(화)는 휴장.'
    },
    esim: {
      name: '홍콩·마카오 LTE eSIM (유심사)', level: '권장', linkVerified: true,
      icon: '📶', short: 'eSIM (홍콩·마카오)', key: '5일 이용 · 지도·택시 앱용', when: '12/27~31',
      url: 'https://3ha.in/r/895160', aff: 'https://3ha.in/r/895160', affBy: '마이리얼트립',
      note: '이 지도와 구글 지도는 인터넷이 있어야 뜹니다. 이용일수는 5일(12/27~31)에 맞춰 고르세요. 휴대폰이 eSIM을 지원하는지 먼저 확인하세요.'
    },
    glpbreakfast: {
      name: '그랜드 리스보아 팰리스 조식 뷔페 (더 그랜드 뷔페)', level: '선택', linkVerified: true,
      icon: '🍳', short: '호텔 조식 뷔페', key: '어른 268 · 만 6세 이하 무료 · 조식 포함 객실이면 불필요', when: '12/28·29',
      url: 'https://3ha.in/r/895275', aff: 'https://3ha.in/r/895275', affBy: '클룩',
      note: '공식 요금: 조식 어른 MOP 268, 아이(만 7~12세) MOP 134, 봉사료 10% 별도. 어른 1명당 만 6세 이하 아이 1명은 무료(공식)라 두 아이 모두 요금이 없습니다. ' +
        '조식 07:00~10:30, 3층 더 그랜드 뷔페. 객실 예약에 조식이 포함되어 있는지 먼저 확인하세요. 포함이면 따로 살 필요가 없습니다.'
    },
    pickup: {
      name: '마카오 국제공항 픽업·샌딩', level: '선택', linkVerified: true,
      icon: '🚐', short: '공항 픽업·샌딩', key: '무료 셔틀 대신 · 견적 확인', when: '12/27·31',
      url: 'https://3ha.in/r/895276', aff: 'https://3ha.in/r/895276', affBy: '클룩',
      note: '공항↔호텔 무료 셔틀 대신 쓸 수 있는 차량입니다. 짐과 유모차가 많을 때 편합니다. 날짜·방향·호텔을 넣고 견적을 확인하세요.'
    },
    icnlounge: {
      name: '인천공항 제2터미널 라운지 (출국일 아침)', level: '선택', linkVerified: true,
      icon: '🛋️', short: '인천 T2 라운지 (출국일)', key: '1인 35,000원 · 최대 3시간 · 마티나 골드 제외',
      aff: 'https://3ha.in/r/895305', affBy: '더라운지',
      url: 'https://3ha.in/r/895305',
      note: 'KE2015(대한항공)는 인천공항 제2터미널에서 출발합니다. 이 버튼은 더라운지 "국내 공항 라운지 이용권"(1인 1회 35,000원)입니다. ' +
        '인천·김포·김해 국제선 제휴 라운지에서 쓸 수 있고, 최대 3시간, 만석이면 입장이 제한될 수 있습니다. 제2터미널 마티나 골드 라운지에서는 쓸 수 없습니다. ' +
        '구매 후 14일 안에만 취소·환불되고, 다른 할인 쿠폰과 같이 쓸 수 없습니다. 아이 요금은 라운지마다 달라 입장 전에 확인하세요. 신용카드 무료 혜택(PP카드 등)이 있으면 먼저 확인하세요.'
    },
    mfmlounge: {
      name: '마카오 공항 플라자 프리미엄 라운지 (귀국일)', level: '선택', linkVerified: true,
      icon: '🛋️', short: '마카오 공항 라운지 (귀국일)', key: '3·6시간권 선택 · 만 2세 미만만 무료',
      aff: 'https://experiences.myrealtrip.com/products/5867485?mylink_id=6791630&t_scope=604800&utm_source=mktpartner', affBy: '마이리얼트립',
      url: 'https://www.plazapremiumlounge.com/en-uk/find/china-regions/macau/macau/macau-international-airport/departures-mezzanine-airside-level',
      note: '12/31은 공항 도착(11:15)부터 출발(14:55)까지 약 3시간 반이라, 점심과 아이 쉬는 곳으로 쓰기 좋습니다. 9번 게이트 근처 출국장 중층, 05:00~02:00 운영(공식). ' +
        '공식 안내상 만 2세 미만만 무료라 두 아이(25·35개월)는 요금이 붙을 수 있습니다. 예약 버튼은 마이리얼트립 상품으로, 3시간권과 6시간권 중에서 고릅니다(출발까지 3시간 반이라 3시간권이면 충분). 요금은 예약 화면에서 확인하세요. 카드 라운지 혜택도 먼저 확인하세요.'
    }
  },

  /* 예약 체크리스트 맨 아래에 보이는 할인 코드 (누르면 복사됨) */
  coupons: {
    title: '클룩 할인 코드', until: '2026-12-31 23:59까지', note: '일부 상품 제외 · 결제할 때 코드 입력',
    codes: [
      { code: '세시간전2600001', min: '5만 원 이상', off: '2,000원 할인' },
      { code: '세시간전2600002', min: '10만 원 이상', off: '3,000원 할인' },
      { code: '세시간전2600003', min: '20만 원 이상', off: '7,000원 할인' }
    ]
  },

  /* ---------- 주변 정보 (일정에는 없지만 지도에 한글 이름으로 표시하는 곳) ----------
   * 위치는 공개 지도(OpenStreetMap) 자료이고, 이름은 한글로 옮겨 적었습니다.
   * kind 종류: hotel 호텔·리조트 / see 볼거리·공연장 / rail 경전철역·터미널 / care 병원 / area 지역 이름
   * 한 줄을 지우면 지도에서 사라지고, 같은 모양으로 한 줄을 더하면 지도에 생깁니다. */
  around: [
    // 지역 이름
    { name: '타이파', kind: 'area', lng: 113.5560, lat: 22.1585 },
    { name: '콜로안', kind: 'area', lng: 113.5660, lat: 22.1200 },
    // 코타이 호텔·리조트
    { name: '갤럭시 마카오', kind: 'hotel', lng: 113.5546, lat: 22.1474 },
    { name: 'JW 메리어트 · 리츠칼튼', kind: 'hotel', lng: 113.5555, lat: 22.1467 },
    { name: '안다즈 마카오', kind: 'hotel', lng: 113.5565, lat: 22.1452 },
    { name: '브로드웨이 마카오', kind: 'hotel', lng: 113.5516, lat: 22.1467 },
    { name: '포시즌스 호텔', kind: 'hotel', lng: 113.5616, lat: 22.1455 },
    { name: '파리지앵 마카오', kind: 'hotel', lng: 113.5608, lat: 22.1437 },
    { name: 'MGM 코타이', kind: 'hotel', lng: 113.5682, lat: 22.1456 },
    { name: '모피어스 호텔', kind: 'hotel', lng: 113.5666, lat: 22.1498 },
    { name: '그랜드 하얏트', kind: 'hotel', lng: 113.5676, lat: 22.1488 },
    { name: '세인트 레지스 · 콘래드', kind: 'hotel', lng: 113.5656, lat: 22.1475 },
    { name: '리스보에타 호텔', kind: 'hotel', lng: 113.5728, lat: 22.1406 },
    { name: '스튜디오 시티 호텔', kind: 'hotel', lng: 113.5618, lat: 22.1410 },
    { name: '알티라 마카오', kind: 'hotel', lng: 113.5551, lat: 22.1617 },
    // 마카오 반도 호텔
    { name: '윈 마카오', kind: 'hotel', lng: 113.5466, lat: 22.1881 },
    { name: 'MGM 마카오', kind: 'hotel', lng: 113.5483, lat: 22.1856 },
    { name: '호텔 리스보아', kind: 'hotel', lng: 113.5445, lat: 22.1898 },
    { name: '샌즈 마카오', kind: 'hotel', lng: 113.5548, lat: 22.1917 },
    { name: '만다린 오리엔탈', kind: 'hotel', lng: 113.5470, lat: 22.1843 },
    { name: '소피텔 폰테 16', kind: 'hotel', lng: 113.5361, lat: 22.1976 },
    // 볼거리·공연장
    { name: '마카오 에펠탑', kind: 'see', lng: 113.5628, lat: 22.1436 },
    { name: '팀랩 슈퍼네이처', kind: 'see', lng: 113.5585, lat: 22.1436 },
    { name: '갤럭시 아레나', kind: 'see', lng: 113.5569, lat: 22.1439 },
    { name: '베네시안 아레나', kind: 'see', lng: 113.5590, lat: 22.1477 },
    { name: '하우스 오브 댄싱 워터', kind: 'see', lng: 113.5680, lat: 22.1499 },
    { name: '윈 팰리스 케이블카', kind: 'see', lng: 113.5695, lat: 22.1480 },
    { name: '스튜디오 시티 이벤트 센터', kind: 'see', lng: 113.5602, lat: 22.1412 },
    { name: '동아시아 경기대회 돔', kind: 'see', lng: 113.5705, lat: 22.1404 },
    { name: '마카오 스타디움', kind: 'see', lng: 113.5535, lat: 22.1547 },
    { name: '타이파 주택 박물관', kind: 'see', lng: 113.5597, lat: 22.1539 },
    { name: '마카오 동물원', kind: 'see', lng: 113.5581, lat: 22.1262 },
    { name: '마카오 타워', kind: 'see', lng: 113.5368, lat: 22.1798 },
    { name: '마카오 과학관', kind: 'see', lng: 113.5565, lat: 22.1864 },
    { name: '마카오 예술 박물관', kind: 'see', lng: 113.5546, lat: 22.1889 },
    { name: '피셔맨스 워프', kind: 'see', lng: 113.5560, lat: 22.1928 },
    { name: '그랑프리 박물관', kind: 'see', lng: 113.5527, lat: 22.1946 },
    { name: '몬테 요새 · 마카오 박물관', kind: 'see', lng: 113.5422, lat: 22.1971 },
    { name: '돔 페드로 5세 극장', kind: 'see', lng: 113.5382, lat: 22.1919 },
    { name: '만다린 하우스', kind: 'see', lng: 113.5344, lat: 22.1886 },
    { name: '해사 박물관', kind: 'see', lng: 113.5306, lat: 22.1859 },
    // 경전철역·터미널
    { name: '경전철 코타이 서역', kind: 'rail', lng: 113.5579, lat: 22.1451 },
    { name: '경전철 코타이 동역', kind: 'rail', lng: 113.5691, lat: 22.1483 },
    { name: '경전철 로터스역', kind: 'rail', lng: 113.5598, lat: 22.1395 },
    { name: '경전철 유니온 병원역', kind: 'rail', lng: 113.5633, lat: 22.1387 },
    { name: '경전철 동아시아경기역', kind: 'rail', lng: 113.5686, lat: 22.1424 },
    { name: '경전철 파이콕역', kind: 'rail', lng: 113.5545, lat: 22.1509 },
    { name: '경전철 스타디움역', kind: 'rail', lng: 113.5519, lat: 22.1544 },
    { name: '경전철 공항역', kind: 'rail', lng: 113.5746, lat: 22.1594 },
    { name: '경전철 타이파 페리터미널역', kind: 'rail', lng: 113.5739, lat: 22.1630 },
    { name: '경전철 석배만역', kind: 'rail', lng: 113.5615, lat: 22.1314 },
    { name: '경전철 바라역', kind: 'rail', lng: 113.5294, lat: 22.1837 },
    { name: '타이파 페리 터미널', kind: 'rail', lng: 113.5770, lat: 22.1652 },
    { name: '외항 페리 터미널', kind: 'rail', lng: 113.5592, lat: 22.1970 },
    // 병원
    { name: '산 자누아리오 병원 (공립, 응급실)', kind: 'care', lng: 113.5466, lat: 22.1939 }
  ],

  /* ---------- 호텔 무료 셔틀버스 (info = 카드에 보이는 안내, url = 시간표 링크) ---------- */
  shuttles: {
    glpAirport: {
      url: 'https://www.grandlisboapalace.com/kr/shuttle-bus-service',
      info: '호텔 공식 셔틀 안내에서 공항 노선은 찾지 못했습니다. 도착 후 공항 셔틀 승차장에서 확인하고, 없으면 택시를 탑니다'
    },
    glpTaipa: {
      url: 'https://www.grandlisboapalace.com/kr/shuttle-bus-service',
      info: '호텔 공식 셔틀 안내에서 타이파 빌리지 노선은 찾지 못했습니다. 프런트에서 확인하고, 없으면 택시를 탑니다'
    },
    glpPeninsula: {
      url: 'https://www.grandlisboa.com/kr/getting-here',
      info: '그랜드 리스보아 팰리스 ↔ 그랜드 리스보아 무료 셔틀: 10:00부터 밤까지 5~20분 간격 (그랜드 리스보아 공식 안내)'
    },
    scAirport: {
      url: 'https://www.studiocity-macau.com/assets/public/2026-10/SC_on_21Oct%20_ENG.pdf',
      info: '스튜디오 시티 → 타이파 페리·공항 무료 셔틀: 평일 10:00~21:30, 15~30분 간격 (2026.9.1 시행 시간표)'
    }
  },

  /* ---------- 비용 요약에 보이는 설명 ---------- */
  /* 원화 환산. 사이트가 열릴 때 liveUrl 에서 그날 환율을 받아 오고, 못 받으면 아래 rate(at 시점 값)를 씁니다 */
  krw: {
    rate: 165.44, at: '2026-11-12 09:02 (한국 시간)',
    source: 'ExchangeRate-API', liveUrl: 'https://open.er-api.com/v6/latest/MOP'
  },
  costNote: '아이는 키 1m 미만으로 가정했습니다. 2026년 11월에 확인한 공개 가격이며, 연말에는 요금이 달라질 수 있습니다.',
  costExtras: [
    '하우스 오브 댄싱 워터(선택, 일정·합계 제외): 어른 2명 가장 싼 좌석 MOP 1,396, 만 3세 미만 아이는 무릎에 앉으면 무료.',
    '택시 요금 계산식(마카오 교통국): 처음 1.6km MOP 21 + 이후 220m마다 MOP 2 + 정차 55초마다 MOP 2 + 트렁크 짐 1개당 MOP 3 + 공항·페리터미널에서 탈 때 MOP 8 + 타이파→콜로안 MOP 2. 범위의 높은 값은 신호 대기·정체를 25% 더한 값입니다.',
    '한 가족(어른 2·아이 1)이 택시 1대를 타는 것으로 계산했습니다. (선택)으로 표시한 택시는 셔틀이 없거나 아이가 지쳤을 때만 드는 비용이라 합계에서 뺐습니다.',
    '셔틀 구간(12/28 구시가지 왕복, 12/31 공항)은 무료입니다. 택시는 현금(MOP, 홍콩달러 1:1 통용)이 가장 확실하고 카드는 잘 받지 않습니다.'
  ],

  /* ============================================================
   * 일정 (안). 지금은 마카오 일정 1개입니다.
   * 나중에 다른 안을 추가하려면 plans 안에 { ... } 묶음을 하나 더 넣으면
   * 화면 위에 '안 전환' 버튼이 자동으로 생깁니다.
   *
   * 일정 한 줄의 뜻
   *   date 날짜 / time 시작 시각 / end 끝 시각(없어도 됨) / title 내용
   *   kind 종류: flight 비행 / hotel 호텔 / activity 놀이·구경 / meal 식사 /
   *              snack 간식 / move 이동 / nap 낮잠 / sleep 취침 (nap·sleep 은 목록에만 회색으로 보임)
   *   meal: 'dinner' 라고 적은 식사는 저녁 시각 규칙을 검사합니다
   *   places 장소 id (위 장소 목록의 이름표). 이동은 [출발, 도착]
   *   transport 이동 수단: shuttle 무료 셔틀 / taxi 택시 / walk 도보
   *   shuttle 위 셔틀 목록의 이름표 / booking 위 예약 링크의 이름표
   *   cost 1가족 예상 비용 { min 최소, max 최대, type 'ticket' 시설 / 'taxi' 택시, optional: true 면 합계 제외 }
   *   warn 주황색 '확인 필요' 표시 / memo 메모 / tips 꿀팁
   * ============================================================ */
  plans: [
    {
      id: 'macau',
      name: '마카오 일정',

      /* 날짜별 '오늘의 준비물' */
      prep: {
        '2026-12-27': [
          '여권. 입국 때 받는 체류허가서 종이는 여권에 끼워 보관 (W 체크인 때 필요)',
          '라운지 이용권 또는 무료 라운지 카드 (PP카드 등)',
          '택시용 현금 (MOP 또는 홍콩달러, 1:1 통용)',
          '아이 겉옷 (저녁 분수쇼는 쌀쌀함)'
        ],
        '2026-12-28': [
          '아기띠 (오전 구시가지 돌길·계단은 유모차가 불편)',
          '접이식 유모차 (오후 타이파 빌리지 골목이 좁음)',
          '보호자 연락처를 적은 팔찌나 스티커 (베네시안 인파)',
          '햄튼 코트 저녁 뷔페 전화 예약 확인 (+853 8118 8822), 택시용 현금'
        ],
        '2026-12-29': [
          '양말 여러 켤레: 키즈시티·슈퍼 펀 존 모두 아이·어른 양말 필수',
          '체류허가서 + 보증금용 신용카드 (W 체크인)',
          '슈퍼 펀 존: 긴팔·긴바지 권장',
          '택시용 현금 넉넉히 (이날 택시 3번, 짐 3개는 트렁크 요금 추가)',
          '키즈시티용 작은 가방 (큰 짐은 아침에 W에 맡김)'
        ],
        '2026-12-30': [
          '현금 (로드 스토우는 현금만 받는다는 안내가 있음, 택시 3번)',
          '아이 여권 (워터파크 키 1m 미만 무료 확인용)',
          '수영복, 아쿠아슈즈, 빨리 마르는 옷, 방수 파우치',
          '겉옷 (콜로안 야외석은 쌀쌀함)'
        ],
        '2026-12-31': [
          '여권, 전날 확인한 셔틀 시간표, 라운지 이용권·카드',
          '기내 낮잠용 아이 담요와 간식',
          '남은 MOP는 공항에서 쓰기 (한국에서 바꾸기 어려움)'
        ]
      },

      items: [
        /* ===== 12/27(일) 도착 ===== */
        {
          date: '2026-12-27', time: '08:30', kind: 'meal', title: '인천공항 T2 라운지에서 아침·휴식 (선택)', places: ['icn'], booking: 'icnlounge',
          tips: ['출국 수속과 보안 검색을 마친 뒤 라운지로 간다. 탑승 시작(약 10:00) 전에 기저귀를 갈고 화장실을 다녀온다.']
        },
        { date: '2026-12-27', time: '10:40', kind: 'flight', title: '인천 출발 KE2015', places: ['icn'] },
        {
          date: '2026-12-27', time: '13:45', kind: 'flight', title: '마카오 도착', places: ['mfm'],
          tips: [
            '입국 때 받는 체류허가서 종이는 버리지 말고 여권에 끼워 둔다. W 체크인 때 필요하다.',
            '공항에서 택시를 타면 MOP 8 할증이 붙는다.'
          ]
        },
        {
          date: '2026-12-27', time: '14:30', kind: 'move', title: '공항 무료 셔틀(그랜드 리스보아 팰리스행) 탑승, 짐이 많으면 택시',
          places: ['mfm', 'glp'], transport: 'shuttle', shuttle: 'glpAirport', warn: '공항 셔틀 노선 미확인 · 택시 가능성 높음',
          cost: { min: 48, max: 60, type: 'taxi', optional: true, note: '셔틀이 없어 택시를 탈 때만. 약 2.6km, 공항 할증 MOP 8과 짐 3개 포함' },
          tips: ['택시는 현금(MOP, 홍콩달러 1:1 통용)이 가장 확실하다. 트렁크 짐은 1개당 MOP 3이 붙는다.']
        },
        {
          date: '2026-12-27', time: '15:00', end: '16:30', kind: 'hotel', title: '그랜드 리스보아 팰리스 체크인 후 휴식·낮잠', places: ['glp'],
          tips: ['체크인 때 예약 혜택(쇼핑 바우처, 다이닝 할인) 사용 방법과 셔틀 승차장 위치를 함께 물어본다.']
        },
        {
          date: '2026-12-27', time: '17:00', kind: 'activity', title: '윈 팰리스 스카이캡 (호텔에서 도보·택시)', places: ['wynn'],
          tips: [
            '스카이캡은 무료로 알려져 있다 (공식 페이지에는 요금 표시가 없어 현장 확인).',
            '12월 저녁은 쌀쌀하니 아이 겉옷을 챙긴다.'
          ]
        },
        {
          date: '2026-12-27', time: '17:45', kind: 'meal', meal: 'dinner', title: '저녁: 고메 파빌리온 푸드홀 (윈 팰리스)', places: ['gourmet'],
          memo: '예약 없이 들어가는 푸드홀. 아이 동반 환영, 메뉴가 다양합니다. 아기 의자는 현장 확인.'
        },
        {
          date: '2026-12-27', time: '19:00', kind: 'activity', title: '분수쇼 야경 구경', places: ['wynn'],
          tips: ['분수쇼는 18:00 이후 20분 간격으로 한다 (공식 안내). 해가 진 뒤 보는 쪽이 더 예쁘다.']
        },
        { date: '2026-12-27', time: '19:30', kind: 'sleep', title: '호텔 복귀, 20:00 목욕, 21:00 취침', places: ['glp'] },

        /* ===== 12/28(월) 구시가지 · 타이파 빌리지 ===== */
        {
          date: '2026-12-28', time: '07:30', kind: 'meal', title: '조식 (호텔 뷔페, 3층 더 그랜드 뷔페)', places: ['glp'], booking: 'glpbreakfast',
          tips: ['어른 1명당 만 6세 이하 아이 1명은 무료다 (공식). 어른 MOP 268 + 봉사료 10%, 조식 포함 객실이면 추가 비용 없음.']
        },
        {
          date: '2026-12-28', time: '10:00', kind: 'move', title: '호텔 무료 셔틀로 마카오 반도 그랜드 리스보아',
          places: ['glp', 'grandlisboa'], transport: 'shuttle', shuttle: 'glpPeninsula',
          tips: ['내릴 때 돌아오는 셔틀 타는 곳을 미리 봐 둔다. 정확한 승하차 위치는 공식 안내에 나와 있지 않다.']
        },
        {
          date: '2026-12-28', time: '10:20', kind: 'snack', title: '마가렛 카페 이 나타 에그타르트 (리스보아 근처)', places: ['margaret'],
          tips: [
            '줄이 길어지기 전 오전에 가는 게 좋다. 에그타르트는 따뜻할 때 바로 먹어야 맛있다.',
            '수요일 휴무로 안내되어 있다 (2026년 가이드 기준). 이날은 월요일이라 영업일이다.'
          ]
        },
        {
          date: '2026-12-28', time: '10:45', end: '11:45', kind: 'activity', title: '세나도 광장·성 바울 성당 유적 산책, 쿠이케이에서 아몬드 쿠키',
          places: ['senado', 'stpaul', 'koikei'],
          tips: [
            '물결무늬 돌길과 계단이 많아 유모차보다 아기띠가 편하다.',
            '성 바울 성당 유적 앞 계단은 사진 명소지만 사람이 많다.',
            '쿠이케이 아몬드 쿠키는 시식해 보고 고를 수 있다고 한다 (미확인). 부서지기 쉬우니 선물용은 상자째 들고 다닌다.'
          ]
        },
        {
          date: '2026-12-28', time: '11:45', kind: 'meal', title: '점심: 웡치케이 완탕면·죽 (세나도 광장)', places: ['wongchikei'],
          tips: ['완탕면과 새우알 국수가 유명하다. 아이용으로는 죽이나 맑은 국수가 무난하다.']
        },
        {
          date: '2026-12-28', time: '12:40', kind: 'move', title: '그랜드 리스보아에서 셔틀로 호텔 복귀',
          places: ['grandlisboa', 'glp'], transport: 'shuttle', shuttle: 'glpPeninsula',
          tips: ['같은 호텔에 하루 더 묵는 날이라 짐 걱정 없이 바로 방으로 올라가 재운다.']
        },
        { date: '2026-12-28', time: '13:10', end: '15:00', kind: 'nap', title: '낮잠', places: ['glp'] },
        {
          date: '2026-12-28', time: '15:30', kind: 'move', title: '호텔 무료 셔틀로 타이파 빌리지 방면 (노선·운행 확인)',
          places: ['glp', 'taipa'], transport: 'shuttle', shuttle: 'glpTaipa', warn: '타이파 빌리지 셔틀 노선 미확인 · 없으면 택시',
          cost: { min: 41, max: 51, type: 'taxi', optional: true, note: '셔틀이 없어 택시를 탈 때만. 약 3.7km' }
        },
        {
          date: '2026-12-28', time: '15:45', end: '16:45', kind: 'snack', title: '쿤하 거리 간식: 대리라이기 돼지갈비빵, 세라두라, 쿠이케이 아몬드 쿠키',
          places: ['taipa', 'taileiloikei'],
          tips: [
            '골목이 좁고 사람이 많아 접이식 유모차가 편하다.',
            '돼지갈비빵은 아이에게 줄 때 고기를 잘게 잘라 준다.'
          ]
        },
        {
          date: '2026-12-28', time: '16:45', kind: 'move', title: '베네시안으로 이동 (도보, 아이가 지치면 택시)',
          places: ['taipa', 'venetian'], transport: 'walk',
          cost: { min: 21, max: 27, type: 'taxi', optional: true, note: '아이가 지쳐 택시를 탈 때만. 차로 약 1.5km' }
        },
        {
          date: '2026-12-28', time: '17:00', end: '17:50', kind: 'activity', title: '베네시안·파리지앵 크리스마스 장식 구경', places: ['venetian'],
          tips: ['크리스마스 시즌이라 사람이 많다. 아이에게 보호자 연락처를 적은 팔찌나 스티커를 붙여 둔다.']
        },
        {
          date: '2026-12-28', time: '18:00', kind: 'meal', meal: 'dinner', title: '저녁: 햄튼 코트 뷔페 (런더너 그랜드 2층)', places: ['londoner'], booking: 'hampton',
          memo: '베네시안에서 길 건너편 런더너 그랜드(옛 쉐라톤) 2층입니다. 예전 FEAST 대신 이곳으로 바꿨습니다. 저녁 뷔페는 17:30부터입니다.',
          tips: [
            '저녁 뷔페 예약은 전화(+853 8118 8822)로만 받는다고 안내되어 있다. 연말이라 미리 예약한다.',
            '만 4세 미만은 무료라 두 아이 모두 요금이 없다 (공식). 어른 MOP 988 + 봉사료 10%.'
          ]
        },
        {
          date: '2026-12-28', time: '19:15', kind: 'sleep', title: '택시로 호텔 복귀, 20:00 목욕, 21:00 취침', places: ['glp'],
          transport: 'taxi', cost: { min: 29, max: 36, type: 'taxi', note: '런더너 → 호텔 약 2.5km' }
        },

        /* ===== 12/29(화) W로 이동 · 키즈시티 ===== */
        { date: '2026-12-29', time: '07:30', kind: 'meal', title: '조식 (호텔 뷔페, 아이 무료)', places: ['glp'] },
        { date: '2026-12-29', time: '09:30', kind: 'hotel', title: '그랜드 리스보아 팰리스 체크아웃 (11:00 마감), 짐을 모두 챙겨 나옴', places: ['glp'] },
        {
          date: '2026-12-29', time: '09:45', kind: 'move', title: '짐을 모두 싣고 택시로 W 마카오',
          places: ['glp', 'wmacau'], transport: 'taxi', cost: { min: 46, max: 58, type: 'taxi', note: '약 3.2km, 짐 3개 포함' }
        },
        {
          date: '2026-12-29', time: '10:00', kind: 'hotel', title: 'W 마카오에 짐 맡기기 (체크인은 15:00), 얼리 체크인 부탁', places: ['wmacau'],
          warn: '체크인 전 짐 보관은 호텔에 미리 확인',
          tips: [
            '프런트나 벨데스크에 "오후에 체크인한다"고 말하고 짐을 맡긴 뒤 짐표를 받아 둔다. 체크인 전 짐 보관은 대부분의 호텔이 해 주지만 W 마카오 공식 안내에서는 확인하지 못했다.',
            '이때 얼리 체크인을 미리 부탁해 두면 돌아왔을 때 방이 준비되어 있을 가능성이 높아진다.',
            '양말·기저귀·간식은 따로 작은 가방에 빼 둔다.'
          ]
        },
        {
          date: '2026-12-29', time: '10:15', kind: 'move', title: '택시로 시티 오브 드림즈 (바로 옆 리조트)',
          places: ['wmacau', 'cod'], transport: 'taxi', cost: { min: 21, max: 27, type: 'taxi', note: '약 1.6km' }
        },
        {
          date: '2026-12-29', time: '10:30', end: '11:45', kind: 'activity', title: '키즈시티', places: ['cod'], booking: 'cod',
          cost: { min: 200, max: 220, type: 'ticket', note: '아이 MOP 180 + 어른 1명당 MOP 20 (12/20~31 요금)' },
          tips: [
            '아이·어른 모두 양말이 필수다 (공식 안내).',
            '당일 1회 입장이고 이용 시간 제한이 없다 (예전의 2시간권과 다름).'
          ]
        },
        {
          date: '2026-12-29', time: '11:45', kind: 'meal', title: '점심: 찬키 로스트 구스 (시티 오브 드림즈 SOHO)', places: ['chankee'],
          memo: '키즈시티와 같은 건물 2층 식당가. 11:00 개점 (옆의 딘타이펑은 12:00). 밥·국수. 아기 의자는 현장 확인.'
        },
        {
          date: '2026-12-29', time: '12:30', kind: 'move', title: '택시로 W 마카오 복귀',
          places: ['cod', 'wmacau'], transport: 'taxi', cost: { min: 21, max: 27, type: 'taxi', note: '약 1.6km' },
          tips: ['짐이 없으니 아이가 차에서 잠들어도 그대로 안고 들어가면 된다.']
        },
        {
          date: '2026-12-29', time: '13:00', end: '15:00', kind: 'nap', title: 'W 마카오 복귀, 방이 준비됐으면 바로 들어가 낮잠', places: ['wmacau'],
          warn: '얼리 체크인 미확정',
          tips: ['방이 아직이면 유모차에서 재우고 어른은 로비·같은 건물 카페에서 쉰다. 정식 체크인은 15:00.']
        },
        {
          date: '2026-12-29', time: '15:00', kind: 'hotel', title: 'W 마카오 체크인, 맡긴 짐 찾기', places: ['wmacau'],
          tips: [
            '체류허가서와 보증금용 신용카드(1박당 MOP 1,000으로 안내됨)를 준비한다.',
            '짐표를 내고 맡긴 짐을 방으로 올려 달라고 한다.'
          ]
        },
        {
          date: '2026-12-29', time: '16:00', end: '17:00', kind: 'activity', title: '슈퍼 펀 존 (같은 건물)', places: ['funzone'], booking: 'funzone',
          cost: { min: 240, max: 360, type: 'ticket', note: '키 1m 미만 아이 MOP 120 + 어른 1명당 MOP 120 (어른 1~2명, 12/21~31 요금). 보호자 표가 꼭 필요한지는 현장 확인' },
          memo: '16시 이후 50% 할인은 12/19~31에는 없습니다.',
          tips: [
            '아이·어른 모두 양말이 필수다. 긴팔·긴바지를 권장한다 (공식 안내).',
            '키 1m 미만은 탈 수 있는 놀이가 적다 (버블 존·스페이스 볼·볼 패널 등). 온라인 사전 예약을 권장한다.'
          ]
        },
        {
          date: '2026-12-29', time: '17:30', kind: 'meal', meal: 'dinner', title: '저녁: 딘타이펑 (스튜디오 시티)', places: ['dtf'],
          tips: ['저녁 피크 전인 17:30에 들어가면 기다림이 적을 수 있다 (미확인, 일반적인 조언).']
        },
        {
          date: '2026-12-29', time: '18:30', kind: 'activity', title: '8자 관람차 야경', places: ['wheel'], booking: 'wheel',
          cost: { min: 300, max: 300, type: 'ticket', note: '1인 MOP 100, 어린이 요금 없음 (만 2세 미만만 무료) → 어른 2 + 아이 1' },
          tips: ['해가 진 뒤 타면 코타이 야경이 잘 보인다. 흐린 날은 시야가 좁으니 날씨를 보고 정한다.']
        },
        { date: '2026-12-29', time: '19:15', kind: 'sleep', title: '객실 복귀, 20:00 목욕, 21:00 취침', places: ['wmacau'] },

        /* ===== 12/30(수) 판다 · 콜로안 · 워터파크 ===== */
        { date: '2026-12-30', time: '07:30', kind: 'meal', title: '조식', places: ['wmacau'] },
        {
          date: '2026-12-30', time: '09:30', kind: 'move', title: '택시로 석배만 공원 (셔틀 없음)',
          places: ['wmacau', 'panda'], transport: 'taxi', cost: { min: 35, max: 44, type: 'taxi', note: '약 2.8km, 콜로안행 할증 MOP 2 포함' }
        },
        {
          date: '2026-12-30', time: '10:00', end: '11:15', kind: 'activity', title: '자이언트 판다관 + 레서판다·희귀동물관', places: ['panda'], booking: 'panda',
          cost: { min: 0, max: 20, type: 'ticket', note: '어른 MOP 10·12세 이하 무료로 알려져 있으나 무료라는 안내도 있음 (미확인)' },
          tips: [
            '월요일 휴관이고 1시간 단위 회차로 입장한다 (10:00~13:00, 14:00~17:00).',
            '표는 판다관 매표소에서 받는다. 공원 입장은 무료이며 레서판다·희귀동물관도 함께 볼 수 있다.'
          ]
        },
        {
          date: '2026-12-30', time: '11:20', kind: 'move', title: '택시로 콜로안 빌리지',
          places: ['panda', 'lordstow'], transport: 'taxi', cost: { min: 23, max: 29, type: 'taxi', note: '약 1.8km' }
        },
        {
          date: '2026-12-30', time: '11:30', kind: 'snack', title: '로드 스토우 본점 에그타르트', places: ['lordstow'],
          tips: [
            '갓 구운 에그타르트를 광장 벤치에서 바로 먹는 것이 정석이다.',
            '아침 일찍(07:00쯤) 문을 열고, 현금만 받는다는 안내가 있다.'
          ]
        },
        {
          date: '2026-12-30', time: '12:00', kind: 'meal', title: '점심: 응아팀 카페 (성당 앞 광장, 아이가 뛰어놀기 좋음)', places: ['ngatim'],
          tips: [
            '성당 앞 광장에 자리가 있어 아이가 뛰어놀기 좋다. 영어 메뉴가 있다.',
            '야외석은 쌀쌀할 수 있으니 겉옷을 챙긴다.'
          ]
        },
        {
          date: '2026-12-30', time: '12:50', kind: 'move', title: '택시로 W 복귀',
          places: ['ngatim', 'wmacau'], transport: 'taxi', cost: { min: 49, max: 61, type: 'taxi', note: '약 4.6km' }
        },
        { date: '2026-12-30', time: '13:10', end: '15:00', kind: 'nap', title: '낮잠', places: ['wmacau'] },
        {
          date: '2026-12-30', time: '15:15', end: '17:00', kind: 'activity', title: '실내 워터파크, 이후 샤워·환복', places: ['waterpark'], booking: 'waterpark',
          cost: { min: 796, max: 796, type: 'ticket', note: '어른 MOP 398 × 2, 키 1m 미만 무료 (1~1.19m면 MOP 258 추가)' },
          tips: [
            '실내는 연중 30도로 유지된다. 키 1m 미만은 무료라 아이 신분증(여권)을 챙긴다.',
            '아쿠아슈즈, 빨리 마르는 옷, 방수 파우치를 준비한다.',
            '호텔 투숙객 전용 입구가 따로 있는지 프런트에 물어본다.'
          ]
        },
        {
          date: '2026-12-30', time: '18:00', kind: 'meal', meal: 'dinner', title: '저녁: 푸드 리퍼블릭 (스튜디오 시티)', places: ['foodrepublic'],
          memo: "'친친'은 미국 LA의 식당이라 뺐습니다. W 마카오 안의 '호커 호커' 저녁 뷔페(18:00~22:00)도 가능합니다.",
          tips: ['국수·딤섬 등 여러 가게가 모인 푸드코트라 빠르게 먹기 좋다.']
        },
        { date: '2026-12-30', time: '19:30', kind: 'sleep', title: '객실 복귀, 20:00 목욕, 21:00 취침', places: ['wmacau'] },

        /* ===== 12/31(목) 귀국 ===== */
        { date: '2026-12-31', time: '07:30', kind: 'meal', title: '조식, 09:00 짐 정리', places: ['wmacau'] },
        { date: '2026-12-31', time: '10:30', kind: 'hotel', title: 'W 마카오 체크아웃 (11:00 마감)', places: ['wmacau'] },
        {
          date: '2026-12-31', time: '10:45', kind: 'move', title: '스튜디오 시티 무료 셔틀(공항·타이파 페리 방면) 탑승',
          places: ['wmacau', 'mfm'], transport: 'shuttle', shuttle: 'scAirport',
          cost: { min: 58, max: 72, type: 'taxi', optional: true, note: '셔틀을 놓쳐 택시를 탈 때만. 약 4.6km, 짐 3개 포함' },
          tips: ['셔틀 시간표를 전날 확인하고, 놓치면 바로 택시로 바꾼다.']
        },
        {
          date: '2026-12-31', time: '11:15', kind: 'flight', title: '공항 도착', places: ['mfm'],
          tips: ['남은 MOP는 한국에서 바꾸기 어려우니 공항에서 쓴다.']
        },
        {
          date: '2026-12-31', time: '12:00', kind: 'meal', title: '공항 점심·휴식 (라운지 선택, 기내에서 낮잠)', places: ['mfm'], booking: 'mfmlounge',
          tips: [
            '기내 낮잠용으로 아이 담요와 간식을 챙긴다.',
            '라운지를 쓰면 점심과 쉬는 곳이 한 번에 해결된다. 9번 게이트 근처 출국장 중층.'
          ]
        },
        { date: '2026-12-31', time: '14:55', kind: 'flight', title: '마카오 출발 KE2016', places: ['mfm'] },
        {
          date: '2026-12-31', time: '19:40', kind: 'flight', title: '인천 도착', places: ['icn'],
          memo: '21:00 취침이 어려운 날. 귀가 차 안에서 재우기.'
        }
      ]
    }
  ]
};
