import eventlet
eventlet.monkey_patch()

import threading
import time
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit

from db import (
    init_db, get_all_servers, add_server, delete_server, update_server,
    set_check_interval, save_history, cleanup_old_history, get_history,
    parse_address, track_players, get_players, get_player_detail, check_interval,
)
from mc_query import query_one_server

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mc-monitor-secret'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins='*')

server_statuses: dict[int, dict] = {}
_cleanup_counter = 0


def query_all_servers():
    global server_statuses
    servers = get_all_servers()
    for s in servers:
        status = query_one_server(s)
        server_statuses[s['id']] = status
        save_history(s['id'], status)
        track_players(s['id'], status['server_name'], status['players']['list'])
    socketio.emit('status_update', list(server_statuses.values()))


def poll_loop():
    global _cleanup_counter
    while True:
        query_all_servers()
        _cleanup_counter += 1
        if _cleanup_counter >= 100:
            cleanup_old_history()
            _cleanup_counter = 0
        time.sleep(check_interval)


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


@app.route('/api/servers', methods=['GET', 'POST'])
def api_servers():
    if request.method == 'POST':
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

        sid = add_server(data['name'], primary_host, primary_port, backups)
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

    update_server(sid, data['name'], primary_host, primary_port, backups)
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


@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    if request.method == 'POST':
        data = request.get_json()
        if 'check_interval' in data:
            set_check_interval(int(data['check_interval']))
        return jsonify({'check_interval': check_interval})
    return jsonify({'check_interval': check_interval})


@app.route('/api/players')
def api_players():
    return jsonify(get_players(filter_online=request.args.get('filter'), sort_by=request.args.get('sort', 'name')))


@app.route('/api/players/<uuid>')
def api_player_detail(uuid):
    detail = get_player_detail(uuid)
    return jsonify(detail) if detail else (jsonify({'error': 'not found'}), 404)


# ---- WebSocket ----

@socketio.on('connect')
def on_connect():
    emit('status_update', list(server_statuses.values()))


@socketio.on('request_refresh')
def on_refresh():
    query_all_servers()


if __name__ == '__main__':
    ci = init_db()
    import db
    db.check_interval = ci
    servers = get_all_servers()
    for s in servers:
        status = query_one_server(s)
        server_statuses[s['id']] = status
        save_history(s['id'], status)
    threading.Thread(target=poll_loop, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=9000, debug=False)
