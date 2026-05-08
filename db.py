import datetime
import json
import time
import sqlite3
import os
import urllib.request
import urllib.error
from flask import g

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'monitor.db')

RANGE_SECONDS = {
    '15m': 15 * 60, '1h': 3600, '6h': 6 * 3600,
    '24h': 24 * 3600, '7d': 7 * 24 * 3600, '30d': 30 * 24 * 3600,
}

# 玩家在线追踪 — 以名称为 key，UUID 仅用于显示
_active_players: dict[str, dict] = {}


def parse_address(addr_str: str) -> tuple[str, int | None]:
    addr_str = addr_str.strip()
    if not addr_str:
        return '127.0.0.1', 25565
    if ':' in addr_str:
        host, _, port_str = addr_str.rpartition(':')
        host = host.strip('[] ')
        try:
            port = int(port_str)
            if 1 <= port <= 65535:
                return host, port
        except ValueError:
            pass
    return addr_str, None


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


def _migrate_players(db):
    """将旧版 uuid-PK 表结构迁移为 name-PK 结构"""
    db.row_factory = sqlite3.Row
    # 检查是否已是新结构
    cols = [r[1] for r in db.execute("PRAGMA table_info(players)").fetchall()]
    if 'name' in cols and 'uuid' in cols and cols[0] == 'name':
        return  # 已是新结构

    # 迁移 players: 同名合并，优先保留有真实 UUID 的行
    old_players = db.execute("SELECT uuid, name, first_seen, last_seen, total_online_seconds FROM players").fetchall()
    merged = {}
    for r in old_players:
        key = r['name'].lower()
        if key not in merged:
            merged[key] = dict(r)
        else:
            cur = merged[key]
            # 优先保留 v4 UUID（正版），其次保留非空 UUID
            existing_ver = cur['uuid'][14] if cur['uuid'] and len(cur['uuid']) > 14 else ''
            new_ver = r['uuid'][14] if r['uuid'] and len(r['uuid']) > 14 else ''
            if new_ver == '4' and existing_ver != '4':
                cur['uuid'] = r['uuid']
            elif not cur['uuid'] and r['uuid']:
                cur['uuid'] = r['uuid']
            cur['first_seen'] = min(cur['first_seen'], r['first_seen'])
            cur['last_seen'] = max(cur['last_seen'], r['last_seen'])
            cur['total_online_seconds'] += r['total_online_seconds']

    # 迁移 sessions: 通过旧 uuid 关联到 name
    old_sessions = db.execute("SELECT id, player_uuid, server_id, server_name, login_time, logout_time FROM player_sessions").fetchall()
    uuid_to_name = {r['uuid']: r['name'] for r in old_players}

    db.execute("DROP TABLE IF EXISTS player_sessions_new")
    db.execute("DROP TABLE IF EXISTS players_new")
    db.execute('''CREATE TABLE players_new (
        name TEXT PRIMARY KEY, uuid TEXT,
        first_seen REAL NOT NULL, last_seen REAL NOT NULL,
        total_online_seconds REAL NOT NULL DEFAULT 0)''')
    db.execute('''CREATE TABLE player_sessions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT, player_name TEXT NOT NULL,
        server_id INTEGER, server_name TEXT NOT NULL,
        login_time REAL NOT NULL, logout_time REAL,
        FOREIGN KEY (player_name) REFERENCES players_new(name) ON DELETE CASCADE)''')
    db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_player_new ON player_sessions_new(player_name, login_time)")

    for m in merged.values():
        db.execute("INSERT OR IGNORE INTO players_new (name, uuid, first_seen, last_seen, total_online_seconds) VALUES (?, ?, ?, ?, ?)",
                   (m['name'], m.get('uuid'), m['first_seen'], m['last_seen'], m['total_online_seconds']))

    for s in old_sessions:
        pname = uuid_to_name.get(s['player_uuid'])
        if pname:
            db.execute("INSERT INTO player_sessions_new (id, player_name, server_id, server_name, login_time, logout_time) VALUES (?, ?, ?, ?, ?, ?)",
                       (s['id'], pname, s['server_id'], s['server_name'], s['login_time'], s['logout_time']))

    db.execute("DROP TABLE IF EXISTS player_sessions")
    db.execute("DROP TABLE IF EXISTS players")
    db.execute("ALTER TABLE players_new RENAME TO players")
    db.execute("ALTER TABLE player_sessions_new RENAME TO player_sessions")
    db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_player ON player_sessions(player_name, login_time)")


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute('''CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, primary_host TEXT NOT NULL DEFAULT '127.0.0.1',
        primary_port INTEGER)''')
    db.execute('''CREATE TABLE IF NOT EXISTS backup_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL,
        host TEXT NOT NULL, port INTEGER, priority INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE)''')
    db.execute('''CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL,
        timestamp REAL NOT NULL, online INTEGER NOT NULL DEFAULT 0,
        player_count INTEGER NOT NULL DEFAULT 0, player_list TEXT NOT NULL DEFAULT '[]',
        latency REAL, FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE)''')
    db.execute('CREATE INDEX IF NOT EXISTS idx_history_server_time ON history(server_id, timestamp)')
    db.execute('''CREATE TABLE IF NOT EXISTS players (
        name TEXT PRIMARY KEY, uuid TEXT,
        first_seen REAL NOT NULL, last_seen REAL NOT NULL,
        total_online_seconds REAL NOT NULL DEFAULT 0)''')
    db.execute('''CREATE TABLE IF NOT EXISTS player_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, player_name TEXT NOT NULL,
        server_id INTEGER, server_name TEXT NOT NULL,
        login_time REAL NOT NULL, logout_time REAL,
        FOREIGN KEY (player_name) REFERENCES players(name) ON DELETE CASCADE)''')
    db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_player ON player_sessions(player_name, login_time)')
    db.execute('PRAGMA foreign_keys = ON')

    # 尝试从旧结构迁移
    _migrate_players(db)

    global check_interval
    row = db.execute("SELECT value FROM config WHERE key='check_interval'").fetchone()
    if row:
        check_interval = int(row[0])
    else:
        db.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('check_interval', '5')")

    # 关闭上次遗留的未结束 session，累加时长（匿名玩家无法回溯人数，按 1 人计）
    now = time.time()
    rows = db.execute("SELECT player_name, login_time FROM player_sessions WHERE logout_time IS NULL").fetchall()
    for r in rows:
        duration = now - r[1]
        db.execute("UPDATE player_sessions SET logout_time=? WHERE player_name=? AND logout_time IS NULL", (now, r[0]))
        db.execute("UPDATE players SET total_online_seconds = total_online_seconds + ? WHERE name=?", (duration, r[0]))

    db.commit()
    db.close()
    return check_interval


check_interval = 5  # 由 init_db 更新


def get_all_servers():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    servers = db.execute("SELECT * FROM servers ORDER BY id").fetchall()
    result = []
    for s in servers:
        backups = db.execute("SELECT * FROM backup_addresses WHERE server_id=? ORDER BY priority", (s['id'],)).fetchall()
        result.append({
            'id': s['id'], 'name': s['name'],
            'primary_host': s['primary_host'], 'primary_port': s['primary_port'],
            'backups': [{'id': b['id'], 'host': b['host'], 'port': b['port'], 'priority': b['priority']} for b in backups],
        })
    db.close()
    return result


def add_server(name, primary_host, primary_port, backups):
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys = ON')
    cur = db.execute("INSERT INTO servers (name, primary_host, primary_port) VALUES (?, ?, ?)", (name, primary_host, primary_port))
    sid = cur.lastrowid
    for i, b in enumerate(backups):
        db.execute("INSERT INTO backup_addresses (server_id, host, port, priority) VALUES (?, ?, ?, ?)", (sid, b['host'], b['port'], i))
    db.commit()
    db.close()
    return sid


def delete_server(server_id):
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys = ON')
    db.execute("DELETE FROM history WHERE server_id=?", (server_id,))
    db.execute("DELETE FROM backup_addresses WHERE server_id=?", (server_id,))
    db.execute("DELETE FROM servers WHERE id=?", (server_id,))
    db.commit()
    db.close()


def update_server(server_id, name, primary_host, primary_port, backups):
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys = ON')
    db.execute("UPDATE servers SET name=?, primary_host=?, primary_port=? WHERE id=?", (name, primary_host, primary_port, server_id))
    db.execute("DELETE FROM backup_addresses WHERE server_id=?", (server_id,))
    for i, b in enumerate(backups):
        db.execute("INSERT INTO backup_addresses (server_id, host, port, priority) VALUES (?, ?, ?, ?)", (server_id, b['host'], b['port'], i))
    db.commit()
    db.close()


def set_check_interval(seconds):
    global check_interval
    check_interval = seconds
    db = sqlite3.connect(DB_PATH)
    db.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('check_interval', ?)", (str(seconds),))
    db.commit()
    db.close()


def save_history(server_id: int, status: dict):
    raw_names = [p['name'] for p in status['players']['list']]
    anon_count = sum(1 for n in raw_names if ' ' in n)
    names = [n for n in raw_names if ' ' not in n]
    if anon_count > 0:
        names.append(f"{_ANON_NAME} x{anon_count}")
    db = sqlite3.connect(DB_PATH)
    db.execute(
        "INSERT INTO history (server_id, timestamp, online, player_count, player_list, latency) VALUES (?, ?, ?, ?, ?, ?)",
        (server_id, time.time(), 1 if status['online'] else 0, status['players']['online'],
         json.dumps(names, ensure_ascii=False), status['latency']))
    db.commit()
    db.close()


def cleanup_old_history():
    cutoff = time.time() - 35 * 24 * 3600
    db = sqlite3.connect(DB_PATH)
    db.execute("DELETE FROM history WHERE timestamp < ?", (cutoff,))
    db.commit()
    db.close()


def get_history(server_id: int, range_str: str = None, start: float = None, end: float = None):
    now = time.time()
    if range_str and range_str in RANGE_SECONDS:
        start = now - RANGE_SECONDS[range_str]
        end = now
    elif start and end:
        start, end = float(start), float(end)
    else:
        start = now - 900
        end = now

    duration = end - start
    estimated_points = max(duration / max(check_interval, 1), 1)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    if estimated_points <= 3000:
        rows = db.execute(
            "SELECT timestamp, online, player_count, player_list, latency FROM history "
            "WHERE server_id=? AND timestamp>=? AND timestamp<=? ORDER BY timestamp",
            (server_id, start, end)).fetchall()
        result = []
        for r in rows:
            result.append({'timestamp': r['timestamp'], 'online': bool(r['online']),
                           'player_count': r['player_count'],
                           'player_list': json.loads(r['player_list']) if r['player_list'] else [],
                           'latency': r['latency']})
    else:
        bucket_seconds = max(int(duration / 2000), 1)
        rows = db.execute(
            """SELECT ROUND(timestamp / ?) * ? as bucket_time, ROUND(AVG(player_count)) as player_count,
                      MAX(online) as online, ROUND(AVG(latency), 1) as latency
               FROM history WHERE server_id=? AND timestamp>=? AND timestamp<=?
               GROUP BY bucket_time ORDER BY bucket_time""",
            (bucket_seconds, bucket_seconds, server_id, start, end)).fetchall()
        result = []
        for r in rows:
            result.append({'timestamp': r['bucket_time'], 'online': bool(r['online']),
                           'player_count': r['player_count'], 'player_list': [], 'latency': r['latency']})
    db.close()
    return result


# ---- Player Tracking ----

_MISS_THRESHOLD = 3

_uuid_cache: dict[str, str | None] = {}  # name → uuid, None 表示已尝试获取但无结果


def _fetch_player_uuid(name: str) -> str | None:
    """从 playerdb.co 获取正版玩家的 UUID"""
    if name in _uuid_cache:
        return _uuid_cache[name]
    try:
        url = f"https://playerdb.co/api/player/minecraft/{urllib.parse.quote(name)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'MCServerMonitor/1.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            if data.get('code') == 'player.found':
                uuid = data['data']['player']['id']
                _uuid_cache[name] = uuid
                return uuid
    except Exception:
        pass
    _uuid_cache[name] = None
    return None


def _ensure_player(db, name, now):
    existing = db.execute("SELECT name FROM players WHERE name=? COLLATE NOCASE", (name,)).fetchone()
    if existing:
        db.execute("UPDATE players SET last_seen=? WHERE name=?", (now, existing['name']))
        return existing['name']
    else:
        db.execute("INSERT INTO players (name, first_seen, last_seen) VALUES (?, ?, ?)", (name, now, now))
        return name


def _new_active(name, server_id, server_name, now):
    return {'server_id': server_id, 'server_name': server_name, 'login_time': now, 'miss_count': 0}


def _end_active_session(db, name, now, info, extra_duration=0):
    duration = now - info['login_time'] + extra_duration
    db.execute("UPDATE player_sessions SET logout_time=? WHERE player_name=? AND logout_time IS NULL", (now, name))
    db.execute("UPDATE players SET total_online_seconds = total_online_seconds + ? WHERE name=?", (duration, name))


_ANON_NAME = "Anonymous Player"


def track_players(server_id: int, server_name: str, player_list: list[dict]):
    global _active_players
    now = time.time()
    current_keys = set()
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    anon_count = 0
    for p in player_list:
        name = (p.get('name') or '').strip()
        if not name:
            continue
        if ' ' in name:
            anon_count += 1
            continue

        # 正常玩家
        canonical = _ensure_player(db, name, now)
        current_keys.add(canonical)

        if canonical not in _active_players:
            _active_players[canonical] = _new_active(canonical, server_id, server_name, now)
            db.execute("INSERT INTO player_sessions (player_name, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                       (canonical, server_id, server_name, now))
        else:
            info = _active_players[canonical]
            info['miss_count'] = 0
            if info['server_id'] != server_id:
                _end_active_session(db, canonical, now, info)
                _active_players[canonical] = _new_active(canonical, server_id, server_name, now)
                db.execute("INSERT INTO player_sessions (player_name, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                           (canonical, server_id, server_name, now))

    # ---- 匿名玩家组：合并为 "Anonymous Player"，时间乘以人数 ----
    if anon_count > 0:
        canonical = _ensure_player(db, _ANON_NAME, now)
        current_keys.add(canonical)

        if canonical not in _active_players:
            _active_players[canonical] = {
                **_new_active(canonical, server_id, server_name, now),
                'anon_count': anon_count, 'last_accum_time': now,
            }
            db.execute("INSERT INTO player_sessions (player_name, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                       (canonical, server_id, server_name, now))
        else:
            info = _active_players[canonical]
            # 按上一次人数累计时长
            elapsed = now - info.get('last_accum_time', info['login_time'])
            if elapsed > 0 and info.get('anon_count', 0) > 0:
                db.execute("UPDATE players SET total_online_seconds = total_online_seconds + ? WHERE name=?",
                           (elapsed * info['anon_count'], canonical))
            info['anon_count'] = anon_count
            info['last_accum_time'] = now
            info['miss_count'] = 0
            if info['server_id'] != server_id:
                _end_active_session(db, canonical, now, info)
                _active_players[canonical] = {
                    **_new_active(canonical, server_id, server_name, now),
                    'anon_count': anon_count, 'last_accum_time': now,
                }
                db.execute("INSERT INTO player_sessions (player_name, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                           (canonical, server_id, server_name, now))

    db.commit()
    db.close()

    # 离线判定
    ended = []
    for name, info in list(_active_players.items()):
        if name not in current_keys:
            info['miss_count'] += 1
            if info['miss_count'] >= _MISS_THRESHOLD:
                edb = sqlite3.connect(DB_PATH)
                extra = 0
                if info.get('anon_count'):
                    elapsed = now - info.get('last_accum_time', info['login_time'])
                    extra = elapsed * info['anon_count']
                _end_active_session(edb, name, now, info, extra)
                edb.commit()
                edb.close()
                ended.append(name)
    for name in ended:
        del _active_players[name]


def _enrich_player_uuid(p: dict) -> dict:
    """为玩家补充 UUID（从缓存或 DB 或 API）"""
    if p.get('uuid'):
        return p
    # 尝试从 API 获取
    fetched = _fetch_player_uuid(p['name'])
    if fetched:
        db = sqlite3.connect(DB_PATH)
        db.execute("UPDATE players SET uuid=? WHERE name=?", (fetched, p['name']))
        db.commit()
        db.close()
        p['uuid'] = fetched
    return p


def get_players(filter_online: str | None = None, sort_by: str = 'name'):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    query = "SELECT * FROM players"
    params = []
    if filter_online == 'online':
        active_keys = list(_active_players.keys())
        if active_keys:
            query += f" WHERE name IN ({','.join(['?' for _ in active_keys])})"
            params = active_keys
        else:
            query += " WHERE 1=0"
    elif filter_online == 'offline':
        active_keys = list(_active_players.keys())
        if active_keys:
            query += f" WHERE name NOT IN ({','.join(['?' for _ in active_keys])})"
            params = active_keys
    order_map = {'name': 'name COLLATE NOCASE ASC', 'last_seen': 'last_seen DESC', 'total_time': 'total_online_seconds DESC'}
    query += f" ORDER BY {order_map.get(sort_by, 'name COLLATE NOCASE ASC')}"
    rows = db.execute(query, params).fetchall()
    db.close()

    now = time.time()
    return [{
        'name': r['name'], 'uuid': r['uuid'] or '',
        'online': r['name'] in _active_players,
        'current_server': _active_players[r['name']]['server_name'] if r['name'] in _active_players else '',
        'first_seen': r['first_seen'], 'last_seen': r['last_seen'],
        'total_online_seconds': round(r['total_online_seconds'] + (now - _active_players[r['name']]['login_time'] if r['name'] in _active_players else 0), 1),
        'anonymous': r['name'] == _ANON_NAME,
        'anon_count': _active_players[r['name']].get('anon_count', 0) if r['name'] in _active_players else 0,
    } for r in rows]


def get_player_list_at_time(server_id: int, timestamp: float):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    row = db.execute(
        "SELECT player_list FROM history WHERE server_id=? ORDER BY ABS(timestamp - ?) LIMIT 1",
        (server_id, timestamp)).fetchone()
    db.close()
    return json.loads(row['player_list']) if row and row['player_list'] else []


def delete_player(name: str):
    global _active_players
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys = ON')
    db.execute("DELETE FROM player_sessions WHERE player_name=?", (name,))
    db.execute("DELETE FROM players WHERE name=?", (name,))
    db.commit()
    db.close()
    _active_players.pop(name, None)
    _uuid_cache.pop(name, None)


def get_player_detail(name: str):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    player = db.execute("SELECT * FROM players WHERE name=? COLLATE NOCASE", (name,)).fetchone()
    if not player:
        db.close()
        return None

    all_sessions = db.execute("SELECT * FROM player_sessions WHERE player_name=? COLLATE NOCASE", (name,)).fetchall()
    db.close()

    now_ts = time.time()
    hourly = [0.0] * 24
    for s in all_sessions:
        start_dt = datetime.datetime.fromtimestamp(s['login_time'])
        end_ts = s['logout_time'] if s['logout_time'] else now_ts
        end_dt = datetime.datetime.fromtimestamp(end_ts)
        cursor = start_dt.replace(minute=0, second=0, microsecond=0)
        while cursor <= end_dt:
            seg_start = max(cursor, start_dt)
            seg_end = min(cursor + datetime.timedelta(hours=1), end_dt)
            if seg_end > seg_start:
                hourly[cursor.hour] += (seg_end - seg_start).total_seconds()
            cursor += datetime.timedelta(hours=1)
    hourly_minutes = [round(m / 60, 1) for m in hourly]

    is_online = name in _active_players
    info = _active_players.get(name, {})
    recent_servers = []
    seen = set()
    for s in sorted(all_sessions, key=lambda x: x['login_time'], reverse=True):
        if s['server_name'] not in seen:
            seen.add(s['server_name'])
            recent_servers.append({'server_name': s['server_name'], 'login_time': s['login_time'], 'logout_time': s['logout_time']})

    current_duration = (time.time() - info['login_time']) if is_online else 0

    # 匿名玩家跳过 UUID 获取
    uuid = ''
    if player['name'] != _ANON_NAME:
        uuid = player['uuid'] or _fetch_player_uuid(player['name']) or ''
    anon_count = info.get('anon_count', 0) if is_online else 0

    return {
        'name': player['name'], 'uuid': uuid, 'online': is_online,
        'current_server': info.get('server_name', '') if is_online else '',
        'first_seen': player['first_seen'], 'last_seen': player['last_seen'],
        'total_online_seconds': round(player['total_online_seconds'] + current_duration, 1),
        'recent_servers': recent_servers[:10],
        'hourly_minutes': hourly_minutes,
        'anon_count': anon_count,
    }
