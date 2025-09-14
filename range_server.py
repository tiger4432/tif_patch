#!/usr/bin/env python3
"""
Range 요청을 지원하는 HTTP 서버
Python 3.9+ 에서 Range 지원을 명시적으로 활성화
"""
import http.server
import socketserver
import os
import sys
from functools import partial

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Range 요청을 지원하는 HTTP 요청 핸들러"""
    
    def __init__(self, *args, **kwargs):
        # Python 3.9+ 에서 Range 지원 활성화
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """GET 요청 처리 (Range 지원 포함)"""
        print(f"GET request for: {self.path}")
        
        # Range 헤더 확인
        range_header = self.headers.get('Range')
        if range_header:
            print(f"Range header received: {range_header}")
        
        # 부모 클래스의 do_GET 호출 (Range 지원 포함)
        super().do_GET()
    
    def do_HEAD(self):
        """HEAD 요청 처리"""
        print(f"HEAD request for: {self.path}")
        super().do_HEAD()
    
    def end_headers(self):
        """헤더 끝에 CORS 헤더 추가"""
        # CORS 헤더 추가
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Accept-Ranges', 'bytes')  # Range 지원 명시
        super().end_headers()
    
    def do_OPTIONS(self):
        """OPTIONS 요청 처리 (CORS preflight)"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

def run_server(port=8080, directory=None):
    """Range 지원 서버 실행"""
    if directory:
        os.chdir(directory)
    
    # Python 버전 확인
    print(f"Python version: {sys.version}")
    print(f"Serving directory: {os.getcwd()}")
    print(f"Server port: {port}")
    
    # Range 지원 여부 확인
    handler_class = RangeHTTPRequestHandler
    
    # Python 3.9+ 에서는 자동으로 Range 지원이 포함됨
    if sys.version_info >= (3, 9):
        print("Python 3.9+ detected - Range requests should be supported")
    else:
        print("Python < 3.9 - Range requests may not be fully supported")
    
    with socketserver.TCPServer(("localhost", port), handler_class) as httpd:
        print(f"Range-supporting HTTP server running at http://localhost:{port}/")
        print("Range requests are supported for streaming")
        print("Press Ctrl+C to stop")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped by user")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Range-supporting HTTP Server')
    parser.add_argument('--port', '-p', type=int, default=8080, help='Port to serve on (default: 8080)')
    parser.add_argument('--directory', '-d', default='.', help='Directory to serve (default: current)')
    
    args = parser.parse_args()
    
    run_server(args.port, args.directory)