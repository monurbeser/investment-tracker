"""Local forwarder for Yahoo Finance used by the Pages workflow.

Yahoo answers 429 to non-browser TLS fingerprints from cloud IPs, so requests
are replayed through curl_cffi with Chrome impersonation (the approach yfinance
uses). The Node snapshot script points at it via YAHOO_BASE=http://127.0.0.1:8765.
"""
import http.server
import sys
import threading
import time

from curl_cffi import requests

UPSTREAM = "https://query2.finance.yahoo.com"
session = requests.Session(impersonate="chrome")
lock = threading.Lock()

try:  # obtain Yahoo consent/session cookies once
    session.get("https://fc.yahoo.com", timeout=15)
except Exception:
    pass


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        status, body, ctype = 502, b'{"error":"proxy"}', "application/json"
        for attempt in range(4):
            try:
                with lock:
                    r = session.get(UPSTREAM + self.path, timeout=25)
                status, body = r.status_code, r.content
                ctype = r.headers.get("content-type", ctype)
                if status != 429:
                    break
            except Exception as e:  # network error: retry
                body = ('{"error":"%s"}' % str(e).replace('"', "'")).encode()
            time.sleep(2 * (attempt + 1))
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "429" in (fmt % args) or "502" in (fmt % args):
            sys.stderr.write((fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
