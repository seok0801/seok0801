"""마카오 지도 조각(벡터 타일)을 OpenFreeMap 에서 받아 손질한 뒤 tiles/ 에 저장한다.

왜: 공개 지도 자료는 같은 높이의 건물 수백 채를 한 번호로 묶어 보내고, 성당·옛 집 같은 곳의 높이가 틀린 경우가 있다.
    그래서 (1) 묶인 건물을 한 채씩 나눠 번호를 새로 붙이고, (2) 직접 만든 모형이 서는 자리(ZONES)의 건물은 지운다.
쓰는 법: python3 tools/build_tiles.py   (인터넷 필요, 몇 분 걸림)
출처 표시: © OpenMapTiles © OpenStreetMap contributors (ODbL) — 지도 화면 오른쪽 아래 ⓘ 에 그대로 나온다.
"""
import json, math, os, sys, urllib.request, concurrent.futures as cf
import mapbox_vector_tile as mvt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tiles')
BOUNDS = (113.45, 22.04, 113.69, 22.28)   # data.js 의 map.bounds 와 같게
ZOOMS = range(10, 15)
UA = {'User-Agent': 'trip-map-tile-builder'}

# 모형으로 바꾸는 자리: (경도, 위도, 반경 m, 이름). 이 안에 가운데가 있는 건물 덩어리는 지운다
ZONES = [
    (113.56283, 22.14357, 34, '파리지앵 에펠탑'),
    (113.53680, 22.17981, 30, '마카오 타워'),
    (113.54337, 22.19100, 30, '그랜드 리스보아'),
    (113.558778, 22.153502, 20, '카르멜 성모 성당'),
    (113.559733, 22.153940, 42, '타이파 주택박물관'),
    (113.551461, 22.116917, 12, '콜로안 성 프란시스코 사비에르 성당'),
    (113.5408605, 22.197458, 14, '성 바울 성당 유적 (정면 벽)'),
    (113.56321, 22.14772, 13, '베네시안 종탑'),
    (113.55906, 22.12663, 36, '판다관'),
]

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def tile_range(z):
    def xy(lng, lat):
        n = 2 ** z
        x = int((lng + 180) / 360 * n)
        y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
        return x, y
    x0, y1 = xy(BOUNDS[0], BOUNDS[1]); x1, y0 = xy(BOUNDS[2], BOUNDS[3])
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

def tile_to_lnglat(z, x, y, px, py, extent):
    n = 2 ** z
    lng = (x + px / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / extent) / n))))
    return lng, lat

def in_zone(lng, lat):
    for zl, za, r, _ in ZONES:
        dx = (lng - zl) * 111320 * math.cos(math.radians(za)); dy = (lat - za) * 111320
        if dx * dx + dy * dy < r * r:
            return True
    return False

def process(z, x, y, data):
    tile = mvt.decode(data, default_options={'y_coord_down': True})
    layers = []
    removed = split = 0
    for name, layer in tile.items():
        extent = layer.get('extent', 4096)
        feats = []
        for f in layer['features']:
            g = f['geometry']
            if name == 'building' and g['type'] in ('Polygon', 'MultiPolygon'):
                polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
                base_id = f.get('id') or 0
                for i, rings in enumerate(polys):
                    outer = rings[0]
                    cx = sum(p[0] for p in outer) / len(outer); cy = sum(p[1] for p in outer) / len(outer)
                    lng, lat = tile_to_lnglat(z, x, y, cx, cy, extent)
                    if in_zone(lng, lat):
                        removed += 1
                        continue
                    # 한 채씩 새 번호: 같은 조각 안에서 겹치지 않게 (원래 번호 * 1000 + 순서)
                    feats.append({'geometry': {'type': 'Polygon', 'coordinates': rings}, 'properties': f['properties'],
                                  'id': (base_id % (2 ** 40)) * 1000 + i})
                    split += 1
            else:
                feats.append({'geometry': g, 'properties': f['properties'], **({'id': f['id']} if f.get('id') is not None else {})})
        layers.append({'name': name, 'features': feats, 'extent': extent, 'version': layer.get('version', 2)})
    out = mvt.encode(layers, default_options={'y_coord_down': True, 'quantize_bounds': None})
    return out, removed, split

def main():
    tj = json.loads(get('https://tiles.openfreemap.org/planet'))
    tpl = tj['tiles'][0]
    jobs = [t for z in ZOOMS for t in tile_range(z)]
    print('조각 수:', len(jobs))
    os.makedirs(OUT, exist_ok=True)
    tot_rm = 0
    def one(job):
        z, x, y = job
        raw = get(tpl.replace('{z}', str(z)).replace('{x}', str(x)).replace('{y}', str(y)))
        if raw[:2] == b'\x1f\x8b':
            import gzip; raw = gzip.decompress(raw)
        out, rm, sp = process(z, x, y, raw)
        os.makedirs(os.path.join(OUT, str(z), str(x)), exist_ok=True)
        with open(os.path.join(OUT, str(z), str(x), f'{y}.pbf'), 'wb') as fh:
            fh.write(out)
        return rm, len(out)
    size = 0
    with cf.ThreadPoolExecutor(6) as ex:
        for rm, n in ex.map(one, jobs):
            tot_rm += rm; size += n
    meta = {'attribution': tj.get('attribution', ''), 'minzoom': min(ZOOMS), 'maxzoom': max(ZOOMS), 'bounds': BOUNDS}
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False)
    print(f'완료: {len(jobs)}개, {size/1e6:.1f} MB, 지운 덩어리 {tot_rm}개')

if __name__ == '__main__':
    main()
