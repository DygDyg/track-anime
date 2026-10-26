#!/usr/bin/env python3
"""SSH ProxyCommand helper: tunnel TCP via SOCKS5 (PySocks).

Usage:
  ProxyCommand=python scripts/ta-socks5-proxycommand.py HOST PORT USER PASS %h %p

Windows: use threads (select() cannot wait on stdin pipes).
"""

from __future__ import annotations

import os
import socket
import sys
import threading

try:
    import socks  # PySocks
except ImportError:
    sys.stderr.write("ta-socks5-proxycommand: install PySocks (pip install PySocks)\n")
    sys.exit(1)


def copy_file_to_sock(fileno: int, sock) -> None:
    try:
        while True:
            data = os.read(fileno, 65536)
            if not data:
                break
            sock.sendall(data)
    except OSError:
        pass
    try:
        sock.shutdown(socket.SHUT_WR)
    except OSError:
        pass


def copy_sock_to_file(sock, fileno: int) -> None:
    try:
        while True:
            data = sock.recv(65536)
            if not data:
                break
            os.write(fileno, data)
    except OSError:
        pass


def main() -> int:
    if len(sys.argv) != 7:
        sys.stderr.write(
            "usage: ta-socks5-proxycommand.py PROXY_HOST PROXY_PORT USER PASS DEST_HOST DEST_PORT\n"
        )
        return 2
    proxy_host, proxy_port_s, user, password, dest_host, dest_port_s = sys.argv[1:7]
    try:
        proxy_port = int(proxy_port_s)
        dest_port = int(dest_port_s)
    except ValueError:
        sys.stderr.write("ta-socks5-proxycommand: ports must be integers\n")
        return 2

    sock = socks.socksocket()
    sock.settimeout(30)
    sock.set_proxy(socks.SOCKS5, proxy_host, proxy_port, True, user, password)
    sock.connect((dest_host, dest_port))
    sock.settimeout(None)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    if hasattr(sys.stdin, "buffer"):
        try:
            sys.stdin.buffer.flush()
        except Exception:
            pass

    t_in = threading.Thread(target=copy_file_to_sock, args=(stdin_fd, sock), daemon=True)
    t_out = threading.Thread(target=copy_sock_to_file, args=(sock, stdout_fd), daemon=True)
    t_in.start()
    t_out.start()
    t_out.join()
    t_in.join(timeout=1.0)
    try:
        sock.close()
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
