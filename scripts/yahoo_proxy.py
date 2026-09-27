"""Local forwarder for Yahoo Finance used by the Pages workflow.

Yahoo answers 429 to non-browser TLS fingerprints from cloud IPs, so requests
are replayed through curl_cffi with Chrome impersonation (the approach yfinance
uses). The Node snapshot script points at it via YAHOO_BASE=http://127.0.0.1:8765.

A small pool of sessions serves requests in parallel. Each session holds its
own consent cookie and crumb; the crumb is appended to the endpoints that need
it (v7 quote, v10 quoteSummary, v1 screener) and refreshed on 401.
"""
import http.server
import queue
import sys
import time
from urllib.parse import quote

from curl_cffi import requests

UPSTREAM = "https://query2.finance.yahoo.com"
POOL_SIZE = 4
CRUMB_PATHS = ("/v7/finance/quote", "/v10/finance/quoteSummary", "/v1/finance/screener")


class YSession:
    def __init__(self):
        self.s = requests.Session(impersonate="chrome")
        self.crumb = None
        self.warm()

    def warm(self):
        try:  # consent/session cookies
            self.s.get("https://fc.yahoo.com", timeout=15)
        except Exception:
            pass
        self.crumb = None

    def get_crumb(self):
        if self.crumb is None:
            try:
                r = self.s.get(UPSTREAM + "/v1/test/getcrumb", timeout=15)
                text = r.text.strip()
                self.crumb = text if r.status_code == 200 and text and "<" not in text and len(text) < 40 else ""
            except Exception:
                self.crumb = ""
        return self.crumb


def with_crumb(sess, path):
    if not path.startswith(CRUMB_PATHS) or "crumb=" in path:
        return path
    crumb = sess.get_crumb()
    if not crumb:
        return path
    return path + ("&" if "?" in path else "?") + "crumb=" + quote(crumb, safe="")


sessions = queue.Queue()
for _ in range(POOL_SIZE):
    sessions.put(YSession())


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        status, body, ctype = 502, b'{"error":"proxy"}', "application/json"
        sess = sessions.get()
        try:
            for attempt in range(4):
                try:
                    r = sess.s.get(UPSTREAM + with_crumb(sess, self.path), timeout=25)
                    status, body = r.status_code, r.content
                    ctype = r.headers.get("content-type", ctype)
                    if status == 401 and attempt == 0:  # stale crumb: re-warm once
                        sess.warm()
                        continue
                    if status != 429:
                        break
                except Exception as e:  # network error: retry
                    body = ('{"error":"%s"}' % str(e).replace('"', "'")).encode()
                time.sleep(2 * (attempt + 1))
        finally:
            sessions.put(sess)
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        line = fmt % args
        if any(code in line for code in (" 401 ", " 429 ", " 502 ")):
            sys.stderr.write(line + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
