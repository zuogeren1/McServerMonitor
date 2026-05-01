import json
import time
import sqlite3
import os
from flask import g

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'monitor.db')

RANGE_SECONDS = {
    '15m': 15 * 60, '1h': 3600, '6h': 6 * 3600,
    '24h': 24 * 3600, '7d': 7 * 24 * 3600, '30d': 30 * 24 * 3600,
}

# 玩家在线追踪
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
        uuid TEXT PRIMARY KEY, name TEXT NOT NULL, first_seen REAL NOT NULL,
        last_seen REAL NOT NULL, total_online_seconds REAL NOT NULL DEFAULT 0)''')
    db.execute('''CREATE TABLE IF NOT EXISTS player_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, player_uuid TEXT NOT NULL,
        server_id INTEGER, server_name TEXT NOT NULL,
        login_time REAL NOT NULL, logout_time REAL,
        FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE)''')
    db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_player ON player_sessions(player_uuid, login_time)')
    db.execute('PRAGMA foreign_keys = ON')

    global check_interval
    row = db.execute("SELECT value FROM config WHERE key='check_interval'").fetchone()
    if row:
        check_interval = int(row[0])
    else:
        db.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('check_interval', '5')")
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
    db = sqlite3.connect(DB_PATH)
    db.execute(
        "INSERT INTO history (server_id, timestamp, online, player_count, player_list, latency) VALUES (?, ?, ?, ?, ?, ?)",
        (server_id, time.time(), 1 if status['online'] else 0, status['players']['online'],
         json.dumps([p['name'] for p in status['players']['list']], ensure_ascii=False), status['latency']))
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

def _player_key(p) -> str:
    return p['id'] or p['name']


def track_players(server_id: int, server_name: str, player_list: list[dict]):
    global _active_players
    now = time.time()
    current_keys = set()
    db = sqlite3.connect(DB_PATH)

    for p in player_list:
        key = _player_key(p)
        if not key:
            continue
        current_keys.add(key)
        existing = db.execute("SELECT uuid FROM players WHERE uuid=?", (key,)).fetchone()
        if existing:
            db.execute("UPDATE players SET name=?, last_seen=? WHERE uuid=?", (p['name'], now, key))
        else:
            db.execute("INSERT INTO players (uuid, name, first_seen, last_seen) VALUES (?, ?, ?, ?)", (key, p['name'], now, now))

        if key not in _active_players:
            _active_players[key] = {'name': p['name'], 'server_id': server_id, 'server_name': server_name, 'login_time': now}
            db.execute("INSERT INTO player_sessions (player_uuid, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                       (key, server_id, server_name, now))
        elif _active_players[key]['server_id'] != server_id:
            old = _active_players[key]
            duration = now - old['login_time']
            db.execute("UPDATE player_sessions SET logout_time=? WHERE player_uuid=? AND logout_time IS NULL", (now, key))
            db.execute("UPDATE players SET total_online_seconds = total_online_seconds + ? WHERE uuid=?", (duration, key))
            _active_players[key] = {'name': p['name'], 'server_id': server_id, 'server_name': server_name, 'login_time': now}
            db.execute("INSERT INTO player_sessions (player_uuid, server_id, server_name, login_time) VALUES (?, ?, ?, ?)",
                       (key, server_id, server_name, now))
    db.commit()
    db.close()

    ended = []
    for key, info in _active_players.items():
        if key not in current_keys:
            duration = now - info['login_time']
            edb = sqlite3.connect(DB_PATH)
            edb.execute("UPDATE player_sessions SET logout_time=? WHERE player_uuid=? AND logout_time IS NULL", (now, key))
            edb.execute("UPDATE players SET total_online_seconds = total_online_seconds + ? WHERE uuid=?", (duration, key))
            edb.commit()
            edb.close()
            ended.append(key)
    for key in ended:
        del _active_players[key]


def get_players(filter_online: str | None = None, sort_by: str = 'name'):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    query = "SELECT * FROM players"
    params = []
    if filter_online == 'online':
        active_keys = list(_active_players.keys())
        if active_keys:
            query += f" WHERE uuid IN ({','.join(['?' for _ in active_keys])})"
            params = active_keys
        else:
            query += " WHERE 1=0"
    elif filter_online == 'offline':
        active_keys = list(_active_players.keys())
        if active_keys:
            query += f" WHERE uuid NOT IN ({','.join(['?' for _ in active_keys])})"
            params = active_keys
    order_map = {'name': 'name COLLATE NOCASE ASC', 'last_seen': 'last_seen DESC', 'total_time': 'total_online_seconds DESC'}
    query += f" ORDER BY {order_map.get(sort_by, 'name COLLATE NOCASE ASC')}"
    rows = db.execute(query, params).fetchall()
    db.close()

    now = time.time()
    return [{
        'uuid': r['uuid'], 'name': r['name'],
        'online': r['uuid'] in _active_players,
        'current_server': _active_players[r['uuid']]['server_name'] if r['uuid'] in _active_players else '',
        'first_seen': r['first_seen'], 'last_seen': r['last_seen'],
        'total_online_seconds': round(r['total_online_seconds'] + (now - _active_players[r['uuid']]['login_time'] if r['uuid'] in _active_players else 0), 1),
    } for r in rows]


def get_player_detail(uuid: str):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    player = db.execute("SELECT * FROM players WHERE uuid=?", (uuid,)).fetchone()
    if not player:
        db.close()
        return None

    sessions = db.execute("SELECT * FROM player_sessions WHERE player_uuid=? ORDER BY login_time DESC LIMIT 20", (uuid,)).fetchall()
    hourly = db.execute(
        """SELECT CAST(strftime('%H', login_time, 'unixepoch', 'localtime') AS INTEGER) as hour,
                  SUM(CASE WHEN logout_time IS NOT NULL THEN logout_time - login_time ELSE ? - login_time END) as total_sec
           FROM player_sessions WHERE player_uuid=? GROUP BY hour ORDER BY hour""",
        (time.time(), uuid)).fetchall()
    hourly_map = {0: 0}
    for h in hourly:
        hourly_map[h['hour']] = round(h['total_sec'] / 60, 1)
    db.close()

    is_online = uuid in _active_players
    info = _active_players.get(uuid, {})
    recent_servers = []
    seen = set()
    for s in sessions:
        if s['server_name'] not in seen:
            seen.add(s['server_name'])
            recent_servers.append({'server_name': s['server_name'], 'login_time': s['login_time'], 'logout_time': s['logout_time']})

    current_duration = (time.time() - info['login_time']) if is_online else 0
    return {
        'uuid': uuid, 'name': player['name'], 'online': is_online,
        'current_server': info.get('server_name', '') if is_online else '',
        'first_seen': player['first_seen'], 'last_seen': player['last_seen'],
        'total_online_seconds': round(player['total_online_seconds'] + current_duration, 1),
        'recent_servers': recent_servers[:10],
        'hourly_minutes': [hourly_map.get(h, 0) for h in range(24)],
    }
