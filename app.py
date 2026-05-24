import eventlet
eventlet.monkey_patch()

import json
import os
import secrets
import threading
import time
from functools import wraps
from flask import Flask, render_template, jsonify, request, session
from flask_socketio import SocketIO, emit

from db import (
    init_db, get_all_servers, add_server, delete_server, update_server,
    save_history, cleanup_old_history, get_history,
    parse_address, track_players, get_players, get_player_detail, delete_player,
    get_player_list_at_time, optimize_database,
)
from mc_query import query_one_server

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mc-monitor-secret'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins='*')

server_statuses: dict[int, dict] = {}
_cleanup_counter = 0

# ---- Config File ----
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 首次启动：生成随机凭据
    cfg = {
        'username': 'admin',
        'password': secrets.token_hex(6),
        'check_interval': 5,
        'require_login': True,
        'host': '0.0.0.0',
        'port': 9000,
        'db_path': 'monitor.db',
        'offline_threshold': 2,
    }
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print(f'[init] 已生成 config.json，密码: {cfg["password"]}')
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


_config = load_config()
check_interval = _config['check_interval']


# ---- Auth ----
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if _config.get('require_login', False) and not session.get('logged_in'):
            return jsonify({'error': 'unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapper


# ---- Poll Loop ----
def _query_single_server(server_info):
    """查询单台服务器并写入数据库（供 GreenPool 并行调用）"""
    status = query_one_server(server_info)
    server_statuses[server_info['id']] = status
    save_history(server_info['id'], status)
    track_players(server_info['id'], status['server_name'], status['players']['list'])


def query_all_servers():
    global server_statuses
    servers = get_all_servers()
    current_ids = {s['id'] for s in servers}
    pool = eventlet.GreenPool()
    for s in servers:
        pool.spawn(_query_single_server, s)
    pool.waitall()
    for sid in list(server_statuses.keys()):
        if sid not in current_ids:
            del server_statuses[sid]
    socketio.emit('status_update', list(server_statuses.values()))


def poll_loop():
    global _cleanup_counter
    while True:
        t0 = time.time()
        query_all_servers()
        _cleanup_counter += 1
        if _cleanup_counter >= 100:
            cleanup_old_history()
            _cleanup_counter = 0
        elapsed = time.time() - t0
        time.sleep(max(0, check_interval - elapsed))


# ---- Routes ----

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/status')
def api_status():
    return jsonify(list(server_statuses.values()))


@app.route('/api/status/<int:sid>')
def api_single_status(sid):
    s = server_statuses.get(sid)
    return jsonify(s) if s else (jsonify({'error': 'not found'}), 404)


@app.route('/api/config', methods=['GET'])
def api_config():
    return jsonify({
        'check_interval': _config['check_interval'],
        'need_login': _config.get('require_login', False) and not session.get('logged_in'),
        'username': _config['username'],
        'require_login': _config.get('require_login', False),
        'host': _config.get('host', '0.0.0.0'),
        'port': _config.get('port', 9000),
        'db_path': _config.get('db_path', 'monitor.db'),
        'offline_threshold': _config.get('offline_threshold', 2),
    })


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    if data.get('username') == _config['username'] and data.get('password') == _config['password']:
        session['logged_in'] = True
        return jsonify({'ok': True, 'username': _config['username']})
    return jsonify({'error': '用户名或密码错误'}), 401


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('logged_in', None)
    return jsonify({'ok': True})


# ---- Admin (需登录) ----

@app.route('/api/servers', methods=['GET', 'POST'])
def api_servers():
    if request.method == 'POST':
        if _config.get('require_login', False) and not session.get('logged_in'):
            return jsonify({'error': 'unauthorized'}), 401
        data = request.get_json()
        backups = []
        for b_str in data.get('backups', []):
            h, p = parse_address(b_str)
            backups.append({'host': h, 'port': p})
        primary_addr = data.get('primary_address', '')
        if primary_addr:
            primary_host, primary_port = parse_address(primary_addr)
        else:
            primary_host = data.get('primary_host', '127.0.0.1')
            primary_port = int(data.get('primary_port', 25565))

        sid = add_server(data['name'], primary_host, primary_port, backups, data.get('server_type', 'java'))
        servers = get_all_servers()
        for info in servers:
            if info['id'] == sid:
                server_statuses[sid] = query_one_server(info)
                save_history(sid, server_statuses[sid])
                break
        socketio.emit('status_update', list(server_statuses.values()))
        return jsonify({'id': sid}), 201
    return jsonify(get_all_servers())


@app.route('/api/servers/<int:sid>', methods=['PUT', 'DELETE'])
def api_server_detail(sid):
    if _config.get('require_login', False) and not session.get('logged_in'):
        return jsonify({'error': 'unauthorized'}), 401
    if request.method == 'DELETE':
        delete_server(sid)
        server_statuses.pop(sid, None)
        socketio.emit('status_update', list(server_statuses.values()))
        return jsonify({'ok': True})

    data = request.get_json()
    backups = []
    for b_str in data.get('backups', []):
        h, p = parse_address(b_str)
        backups.append({'host': h, 'port': p})
    primary_addr = data.get('primary_address', '')
    if primary_addr:
        primary_host, primary_port = parse_address(primary_addr)
    else:
        primary_host = data.get('primary_host', '127.0.0.1')
        primary_port = int(data.get('primary_port', 25565))

    update_server(sid, data['name'], primary_host, primary_port, backups, data.get('server_type', 'java'))
    servers = get_all_servers()
    for info in servers:
        if info['id'] == sid:
            server_statuses[sid] = query_one_server(info)
            save_history(sid, server_statuses[sid])
            break
    socketio.emit('status_update', list(server_statuses.values()))
    return jsonify({'ok': True})


@app.route('/api/servers/<int:sid>/history')
def api_history(sid):
    return jsonify(get_history(sid, range_str=request.args.get('range'),
                               start=request.args.get('start'), end=request.args.get('end')))


@app.route('/api/servers/<int:sid>/player-list')
def api_player_list_at(sid):
    ts = request.args.get('ts')
    if not ts:
        return jsonify([])
    return jsonify(get_player_list_at_time(sid, float(ts)))


@app.route('/api/admin/config', methods=['POST'])
def api_admin_config():
    if _config.get('require_login', False) and not session.get('logged_in'):
        return jsonify({'error': 'unauthorized'}), 401
    global check_interval
    data = request.get_json()
    if 'check_interval' in data:
        _config['check_interval'] = int(data['check_interval'])
        check_interval = _config['check_interval']
    if 'username' in data and 'password' in data:
        if data['password']:
            _config['username'] = data['username']
            _config['password'] = data['password']
    if 'host' in data:
        _config['host'] = data['host']
    if 'port' in data:
        _config['port'] = int(data['port'])
    if 'db_path' in data:
        _config['db_path'] = data['db_path']
    if 'offline_threshold' in data:
        _config['offline_threshold'] = int(data['offline_threshold'])
    save_config(_config)
    return jsonify({'check_interval': check_interval})


@app.route('/api/admin/optimize', methods=['POST'])
def api_optimize():
    if _config.get('require_login', False) and not session.get('logged_in'):
        return jsonify({'error': 'unauthorized'}), 401
    try:
        data = request.get_json() or {}
        backup = optimize_database(
            aggregate=data.get('aggregate', False),
            delete_days=int(data.get('delete_days', 0)),
        )
        import os as _os
        size_mb = _os.path.getsize('monitor.db') / 1024 / 1024
        return jsonify({'ok': True, 'backup': backup, 'size_mb': round(size_mb, 1)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/players')
def api_players():
    return jsonify(get_players(filter_online=request.args.get('filter'), sort_by=request.args.get('sort', 'name')))


@app.route('/api/players/<path:name>', methods=['GET', 'DELETE'])
def api_player_detail(name):
    if request.method == 'DELETE':
        if _config.get('require_login', False) and not session.get('logged_in'):
            return jsonify({'error': 'unauthorized'}), 401
        delete_player(name)
        return jsonify({'ok': True})
    detail = get_player_detail(name)
    return jsonify(detail) if detail else (jsonify({'error': 'not found'}), 404)


# ---- WebSocket ----

@socketio.on('connect')
def on_connect():
    emit('status_update', list(server_statuses.values()))


@socketio.on('request_refresh')
def on_refresh():
    query_all_servers()


if __name__ == '__main__':
    ci = init_db(_config.get('db_path'))
    _config['check_interval'] = ci
    import db
    db.check_interval = ci
    servers = get_all_servers()
    for s in servers:
        status = query_one_server(s)
        server_statuses[s['id']] = status
        save_history(s['id'], status)
        track_players(s['id'], status['server_name'], status['players']['list'])
    threading.Thread(target=poll_loop, daemon=True).start()
    socketio.run(app, host=_config.get('host', '0.0.0.0'), port=_config.get('port', 9000), debug=False)
