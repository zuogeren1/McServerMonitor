import eventlet
from html import escape as html_escape
from mcstatus import JavaServer, BedrockServer

_SECTION_COLORS = {
    '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
    '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
    '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
    'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
}
_SECTION_FORMATS = {
    'k': 'obfuscated', 'l': 'bold', 'm': 'strikethrough',
    'n': 'underline', 'o': 'italic', 'r': 'reset',
}


def motd_to_html(motd) -> str:
    try:
        raw = motd.to_minecraft()
    except Exception:
        raw = motd.to_plain()
    if not raw:
        return html_escape(motd.to_plain())
    lines = raw.split('\n')
    return '<br>'.join(_convert_motd_line(line) for line in lines)


def _convert_motd_line(text: str) -> str:
    if not text:
        return ''
    result = []
    current_styles = []
    current_color = None
    i = 0
    has_format = False

    while i < len(text):
        if text[i] == '§' and i + 1 < len(text):
            has_format = True
            if result:
                result.append('</span>')
            code = text[i + 1].lower()
            if code in _SECTION_COLORS:
                current_color = _SECTION_COLORS[code]
                current_styles = [s for s in current_styles if s not in _SECTION_FORMATS.values()]
            elif code in _SECTION_FORMATS:
                fmt = _SECTION_FORMATS[code]
                if fmt == 'reset':
                    current_color = None
                    current_styles = []
                elif fmt != 'obfuscated':
                    if fmt not in current_styles:
                        current_styles.append(fmt)
            styles = []
            if current_color:
                styles.append(f'color:{current_color}')
            for s in current_styles:
                if s == 'bold':
                    styles.append('font-weight:bold')
                elif s == 'strikethrough':
                    styles.append('text-decoration:line-through')
                elif s == 'underline':
                    styles.append('text-decoration:underline')
                elif s == 'italic':
                    styles.append('font-style:italic')
            result.append(f'<span style="{";".join(styles)}">' if styles else '<span>')
            i += 2
        else:
            result.append(html_escape(text[i]))
            i += 1

    if not has_format:
        return html_escape(text)
    result.append('</span>')
    return ''.join(result)


def try_single_address(host: str, port: int | None, timeout: float = 1.0, server_type: str = 'java') -> dict | None:
    try:
        addr = host if port is None else f'{host}:{port}'
        if server_type == 'bedrock':
            srv = BedrockServer.lookup(addr, timeout=timeout)
            st = srv.status()
            return {
                'online': True,
                'host': host, 'port': port,
                'version': st.version.name, 'protocol': st.version.protocol,
                'brand': getattr(st.version, 'brand', ''),
                'motd': st.motd.to_plain(), 'motd_html': html_escape(st.motd.to_plain()),
                'latency': round(st.latency, 1),
                'players': {
                    'online': st.players.online, 'max': st.players.max,
                    'list': [],
                },
                'map_name': getattr(st, 'map_name', None) or '',
                'gamemode': getattr(st, 'gamemode', None) or '',
                'icon': None, 'error': None,
            }
        srv = JavaServer.lookup(addr, timeout=timeout)
        st = srv.status()
        players = st.players
        sample = sorted((players.sample or []), key=lambda p: p.name.lower())
        return {
            'online': True,
            'host': host, 'port': port,
            'version': st.version.name, 'protocol': st.version.protocol,
            'motd': st.motd.to_plain(), 'motd_html': motd_to_html(st.motd),
            'latency': round(st.latency, 1),
            'players': {
                'online': players.online, 'max': players.max,
                'list': [{'name': p.name, 'id': p.id or None} for p in sample],
            },
            'icon': st.icon, 'error': None,
        }
    except Exception:
        return None


def query_one_server(server_info: dict) -> dict:
    server_type = server_info.get('server_type', 'java')
    addresses = [(server_info['primary_host'], server_info['primary_port'], 'primary')]
    for b in server_info.get('backups', []):
        addresses.append((b['host'], b['port'], 'backup'))

    finished = []
    pool = eventlet.GreenPool()
    def _query_one(host, port, addr_type):
        return (host, port, addr_type, try_single_address(host, port, server_type=server_type))
    for host, port, addr_type in addresses:
        finished.append(pool.spawn(_query_one, host, port, addr_type))
    finished = [r.wait() for r in finished]

    active_status = None
    backup_statuses = []
    primary_backup_pending = []

    for host, port, addr_type, result in finished:
        if addr_type == 'primary':
            if result:
                active_status = result
            else:
                backup_statuses.append({'host': host, 'port': port, 'type': 'primary', 'online': False})
        else:
            if result:
                backup_statuses.append({'host': host, 'port': port, 'type': 'backup', 'online': True, 'latency': result['latency']})
                if active_status is None:
                    active_status = result
            else:
                backup_statuses.append({'host': host, 'port': port, 'type': 'backup', 'online': False})

    if active_status is None:
        return {
            'online': False, 'server_id': server_info['id'], 'server_name': server_info['name'],
            'server_type': server_type,
            'active_host': server_info['primary_host'], 'active_port': server_info['primary_port'],
            'version': None, 'protocol': None, 'motd': None, 'motd_html': None,
            'latency': None, 'icon': None,
            'players': {'online': 0, 'max': 0, 'list': []},
            'backup_statuses': backup_statuses, 'error': '所有地址均无法连接',
            'map_name': '', 'gamemode': '', 'brand': '',
        }

    return {
        'online': True, 'server_id': server_info['id'], 'server_name': server_info['name'],
        'server_type': server_type,
        'active_host': active_status['host'], 'active_port': active_status['port'],
        'version': active_status['version'], 'protocol': active_status['protocol'],
        'motd': active_status['motd'], 'motd_html': active_status.get('motd_html'),
        'latency': active_status['latency'], 'icon': active_status.get('icon'),
        'players': active_status['players'],
        'backup_statuses': backup_statuses, 'error': None,
        'map_name': active_status.get('map_name', ''),
        'gamemode': active_status.get('gamemode', ''),
        'brand': active_status.get('brand', ''),
    }
