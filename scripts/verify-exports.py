#!/usr/bin/env python3
"""Terminal-side helpers for scripts/verify-exports.mjs (Python 3 standard library + optional pyte/wcwidth).

  screen <cols> <rows> <file> [crlf]   feed a file to a pyte terminal, print the screen as JSON
  pty <json>                          run a command in a real pty (optional Ctrl+C), print output + exit as JSON
  width <file>                        UTF-8 validity, escape sequences and display width of every line
  imports <file.py>                   top-level modules a Python file imports and whether they are stdlib
  cast <file.cast>                    strict asciicast v2 validation + render of the whole recording
"""
import base64, json, os, re, sys, time

CSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]')


def screen_of(data, cols, rows):
    import pyte
    screen = pyte.Screen(cols, rows)
    pyte.Stream(screen).feed(data)
    a = screen.cursor.attrs
    return {
        'lines': screen.display, 'hidden': bool(screen.cursor.hidden), 'x': screen.cursor.x, 'y': screen.cursor.y,
        'fg': a.fg, 'bg': a.bg, 'bold': a.bold, 'reverse': a.reverse,
    }


def cmd_screen(args):
    cols, rows, path = int(args[0]), int(args[1]), args[2]
    data = open(path, 'rb').read().decode('utf-8')
    if len(args) > 3 and args[3] == 'crlf':
        data = data.replace('\r\n', '\n').replace('\n', '\r\n')
    print(json.dumps(screen_of(data, cols, rows)))


def cmd_pty(args):
    import fcntl, pty, select, signal, struct, termios
    cfg = json.loads(args[0])
    pid, fd = pty.fork()
    if pid == 0:
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', cfg.get('rows', 24), cfg.get('cols', 80), 0, 0))
        env = dict(os.environ)
        env.update(cfg.get('env', {}))
        try:
            os.execvpe(cfg['cmd'][0], cfg['cmd'], env)
        finally:
            os._exit(127)
    try:
        lflag_before = termios.tcgetattr(fd)[3]
    except Exception:
        lflag_before = None
    out = bytearray()
    t0 = time.time()
    sent = False
    status = None
    timeout = cfg.get('timeout', 10)
    ctrlc = cfg.get('ctrlc_at')
    while True:
        now = time.time() - t0
        if ctrlc is not None and not sent and now >= ctrlc:
            os.write(fd, b'\x03')
            sent = True
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                chunk = b''
            if chunk:
                out += chunk
        done, st = os.waitpid(pid, os.WNOHANG)
        if done:
            status = st
            break
        if now > timeout:
            os.kill(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
            status = ('timeout', status)
            break
    # drain what the child wrote before exiting
    while True:
        try:
            r, _, _ = select.select([fd], [], [], 0.1)
            if not r:
                break
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            out += chunk
        except OSError:
            break
    try:
        lflag_after = termios.tcgetattr(fd)[3]
    except Exception:
        lflag_after = None
    res = {'out_b64': base64.b64encode(bytes(out)).decode(), 'lflag_before': lflag_before, 'lflag_after': lflag_after, 'sent_ctrlc': sent}
    if isinstance(status, tuple):
        res.update(timeout=True, exit=None, signal=None)
    else:
        res.update(timeout=False, exit=os.WEXITSTATUS(status) if os.WIFEXITED(status) else None,
                   signal=os.WTERMSIG(status) if os.WIFSIGNALED(status) else None)
    print(json.dumps(res))


def cmd_width(args):
    raw = open(args[0], 'rb').read()
    res = {'utf8': True, 'lines': [], 'bad_escapes': 0, 'escapes': 0, 'ends_with_reset': None}
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError as e:
        res['utf8'] = False
        res['error'] = str(e)
        print(json.dumps(res))
        return
    import wcwidth
    res['escapes'] = len(CSI.findall(text))
    res['bad_escapes'] = text.count('\x1b') - res['escapes']
    res['sgr_only'] = all(m.group(0).endswith('m') for m in CSI.finditer(text))
    stripped = CSI.sub('', text)
    lines = stripped.split('\n')
    if lines and lines[-1] == '':
        lines = lines[:-1]
    res['lines'] = [wcwidth.wcswidth(l) for l in lines]
    res['wide_chars'] = sorted({c for c in stripped if wcwidth.wcwidth(c) == 2})
    res['zero_width_chars'] = sorted({c for c in stripped if wcwidth.wcwidth(c) == 0 and c not in '\n'})
    esc_lines = text.split('\n')
    if esc_lines and esc_lines[-1] == '':
        esc_lines = esc_lines[:-1]
    res['ends_with_reset'] = all(l.endswith('\x1b[0m') for l in esc_lines) if res['escapes'] else None
    print(json.dumps(res))


def cmd_imports(args):
    import ast
    tree = ast.parse(open(args[0], encoding='utf-8').read())
    mods = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            mods.update(a.name.split('.')[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            mods.add(node.module.split('.')[0])
    std = getattr(sys, 'stdlib_module_names', None)
    print(json.dumps({'modules': sorted(mods), 'non_stdlib': sorted(m for m in mods if std is not None and m not in std), 'checked': std is not None}))


def cmd_cast(args):
    issues = []
    lines = open(args[0], 'rb').read().decode('utf-8').split('\n')
    if lines and lines[-1] == '':
        lines = lines[:-1]
    try:
        header = json.loads(lines[0])
    except Exception as e:
        print(json.dumps({'issues': ['header is not JSON: %s' % e]}))
        return
    if not isinstance(header, dict) or header.get('version') != 2:
        issues.append('header.version != 2')
    for k in ('width', 'height'):
        if not isinstance(header.get(k), int) or header.get(k) <= 0:
            issues.append('header.%s is not a positive integer' % k)
    prev = -1.0
    data = []
    for n, line in enumerate(lines[1:], start=2):
        try:
            ev = json.loads(line)
        except Exception as e:
            issues.append('line %d is not JSON: %s' % (n, e))
            continue
        if not (isinstance(ev, list) and len(ev) == 3 and isinstance(ev[0], (int, float)) and ev[1] in ('o', 'i', 'm', 'r') and isinstance(ev[2], str)):
            issues.append('line %d is not [time, code, data]' % n)
            continue
        if ev[0] < prev:
            issues.append('line %d goes back in time' % n)
        prev = ev[0]
        if ev[1] == 'o':
            data.append(ev[2])
    res = {'issues': issues, 'events': len(lines) - 1, 'duration': prev, 'header': header}
    try:
        res['screen'] = screen_of(''.join(data), header.get('width', 80), header.get('height', 24))
    except ImportError:
        res['screen'] = None
    print(json.dumps(res))


if __name__ == '__main__':
    cmd = sys.argv[1]
    {'screen': cmd_screen, 'pty': cmd_pty, 'width': cmd_width, 'imports': cmd_imports, 'cast': cmd_cast}[cmd](sys.argv[2:])
