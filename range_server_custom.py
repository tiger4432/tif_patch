#!/usr/bin/env python3
"""
완전한 Range 요청 지원 HTTP 서버
"""
import http.server
import socketserver
import os
import sys
import re
import zipfile
import io
import json
from urllib.parse import unquote, parse_qs

class CustomRangeHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    """완전한 Range 요청을 지원하는 HTTP 핸들러"""
    
    def do_GET(self):
        """GET 요청 처리 (Range 지원 포함)"""
        # URL과 쿼리 파라미터 분리
        url_parts = self.path.split('?', 1)
        url_path = url_parts[0]
        query_params = parse_qs(url_parts[1]) if len(url_parts) > 1 else {}

        path = self.translate_path(url_path)

        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return

        if os.path.isdir(path):
            # ZIP 압축 요청 처리
            if 'zip' in query_params and query_params['zip'][0].lower() == 'true':
                self.send_directory_as_zip(path, url_path)
                return

            # JSON 디렉토리 리스팅 요청 처리
            if 'list' in query_params and query_params['list'][0].lower() == 'true':
                self.send_directory_json(path)
                return

            # 일반 HTML 디렉토리 리스팅
            self.send_directory_listing(path)
            return

        try:
            with open(path, 'rb') as f:
                file_size = os.path.getsize(path)
                range_header = self.headers.get('Range')

                if range_header:
                    # Range 요청 처리
                    print(f"Range request: {range_header} for {self.path} (file_size: {file_size})")
                    self.handle_range_request(f, file_size, range_header)
                else:
                    # 일반 요청 처리
                    print(f"Normal request for {self.path}")
                    self.handle_normal_request(f, file_size)

        except IOError:
            self.send_error(404, "File not found")
    
    def do_HEAD(self):
        """HEAD 요청 처리"""
        path = self.translate_path(self.path)
        
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return
        
        if os.path.isdir(path):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.add_cors_headers()
            self.end_headers()
            return
        
        file_size = os.path.getsize(path)
        range_header = self.headers.get('Range')
        
        if range_header:
            # Range HEAD 요청
            ranges = self.parse_range_header(range_header, file_size)
            if ranges:
                start, end = ranges[0]
                content_length = end - start + 1
                
                self.send_response(206, "Partial Content")
                self.send_header('Content-Type', self.guess_type(path))
                self.send_header('Content-Length', str(content_length))
                self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                self.send_header('Accept-Ranges', 'bytes')
                self.add_cors_headers()
                self.end_headers()
            else:
                self.send_error(416, "Range Not Satisfiable")
        else:
            # 일반 HEAD 요청
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Length', str(file_size))
            self.send_header('Accept-Ranges', 'bytes')
            self.add_cors_headers()
            self.end_headers()
    
    def do_OPTIONS(self):
        """OPTIONS 요청 처리 (CORS)"""
        self.send_response(200)
        self.add_cors_headers()
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()
    
    def handle_range_request(self, file_obj, file_size, range_header):
        """Range 요청 처리"""
        ranges = self.parse_range_header(range_header, file_size)
        
        if not ranges:
            self.send_error(416, "Range Not Satisfiable")
            return
        
        if len(ranges) == 1:
            # 단일 Range 처리
            start, end = ranges[0]
            content_length = end - start + 1
            
            self.send_response(206, "Partial Content")
            self.send_header('Content-Type', self.guess_type(self.path))
            self.send_header('Content-Length', str(content_length))
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            self.send_header('Accept-Ranges', 'bytes')
            self.add_cors_headers()
            self.end_headers()
            
            # 파일 데이터 전송
            file_obj.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk_size = min(8192, remaining)
                chunk = file_obj.read(chunk_size)
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        else:
            # 다중 Range 처리 (multipart)
            boundary = "RANGE_BOUNDARY"
            content_type = f'multipart/byteranges; boundary={boundary}'
            
            self.send_response(206, "Partial Content")
            self.send_header('Content-Type', content_type)
            self.add_cors_headers()
            self.end_headers()
            
            for start, end in ranges:
                content_length = end - start + 1
                
                # 경계 및 헤더 전송
                boundary_data = f'\r\n--{boundary}\r\n'
                boundary_data += f'Content-Type: {self.guess_type(self.path)}\r\n'
                boundary_data += f'Content-Range: bytes {start}-{end}/{file_size}\r\n\r\n'
                self.wfile.write(boundary_data.encode())
                
                # 파일 데이터 전송
                file_obj.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    chunk = file_obj.read(chunk_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            
            # 마지막 경계
            self.wfile.write(f'\r\n--{boundary}--\r\n'.encode())
    
    def handle_normal_request(self, file_obj, file_size):
        """일반 요청 처리"""
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(self.path))
        self.send_header('Content-Length', str(file_size))
        self.send_header('Accept-Ranges', 'bytes')
        self.add_cors_headers()
        self.end_headers()
        
        # 파일 데이터 전송
        while True:
            chunk = file_obj.read(8192)
            if not chunk:
                break
            self.wfile.write(chunk)
    
    def parse_range_header(self, range_header, file_size):
        """Range 헤더 파싱"""
        if not range_header.startswith('bytes='):
            return None
        
        ranges = []
        range_specs = range_header[6:].split(',')
        
        for range_spec in range_specs:
            range_spec = range_spec.strip()
            if '-' not in range_spec:
                continue
            
            start_str, end_str = range_spec.split('-', 1)
            
            try:
                if start_str == '':
                    # Suffix range (e.g., '-500')
                    if end_str == '':
                        continue
                    suffix_length = int(end_str)
                    start = max(0, file_size - suffix_length)
                    end = file_size - 1
                elif end_str == '':
                    # Start range (e.g., '500-')
                    start = int(start_str)
                    end = file_size - 1
                else:
                    # Full range (e.g., '500-1000')
                    start = int(start_str)
                    end = int(end_str)
                
                # 범위 유효성 검사 및 보정
                if start < 0:
                    start = 0
                if end >= file_size:
                    end = file_size - 1
                if start > end:
                    print(f"Invalid range: start={start} > end={end}, skipping")
                    continue
                
                print(f"Valid range: {start}-{end} (file_size: {file_size})")
                ranges.append((start, end))
                
            except ValueError:
                continue
        
        return ranges if ranges else None
    
    def translate_path(self, path):
        """URL 경로를 파일 경로로 변환"""
        path = path.split('?', 1)[0]
        path = path.split('#', 1)[0]
        path = unquote(path)
        
        if path.startswith('/'):
            path = path[1:]
        
        return os.path.join(os.getcwd(), path)
    
    def guess_type(self, path):
        """파일 타입 추정"""
        if path.endswith('.tif') or path.endswith('.tiff'):
            return 'image/tiff'
        elif path.endswith('.html'):
            return 'text/html'
        elif path.endswith('.js'):
            return 'application/javascript'
        elif path.endswith('.css'):
            return 'text/css'
        elif path.endswith('.json'):
            return 'application/json'
        else:
            return 'application/octet-stream'
    
    def add_cors_headers(self):
        """CORS 헤더 추가"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
    
    def send_directory_listing(self, path):
        """디렉토리 목록 전송"""
        try:
            files = os.listdir(path)
        except OSError:
            self.send_error(404, "Directory not found")
            return
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Directory Listing</title>
</head>
<body>
    <h1>Directory Listing for {self.path}</h1>
    <ul>
"""
        
        for file in sorted(files):
            file_path = os.path.join(path, file)
            if os.path.isdir(file_path):
                html += f'<li><a href="{file}/">{file}/</a></li>\n'
            else:
                file_size = os.path.getsize(file_path)
                size_mb = file_size / (1024 * 1024)
                html += f'<li><a href="{file}">{file}</a> ({size_mb:.1f} MB)</li>\n'
        
        html += """    </ul>
</body>
</html>"""
        
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(html.encode())))
        self.add_cors_headers()
        self.end_headers()
        self.wfile.write(html.encode())

    def send_directory_as_zip(self, path, url_path):
        """디렉토리를 ZIP으로 압축하여 전송"""
        try:
            print(f"Creating ZIP for directory: {path}")

            # 메모리에서 ZIP 생성
            zip_buffer = io.BytesIO()

            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for root, dirs, files in os.walk(path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # ZIP 내 경로를 상대 경로로 설정
                        arc_name = os.path.relpath(file_path, path)
                        print(f"Adding to ZIP: {arc_name}")
                        zip_file.write(file_path, arc_name)

            zip_data = zip_buffer.getvalue()
            zip_buffer.close()

            # ZIP 파일명 생성
            folder_name = os.path.basename(url_path.rstrip('/')) or 'folder'
            zip_filename = f"{folder_name}.zip"

            print(f"Sending ZIP file: {zip_filename}, size: {len(zip_data)} bytes")

            # ZIP 응답 전송
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{zip_filename}"')
            self.send_header('Content-Length', str(len(zip_data)))
            self.add_cors_headers()
            self.end_headers()

            self.wfile.write(zip_data)

        except Exception as e:
            print(f"Error creating ZIP: {e}")
            self.send_error(500, f"Internal server error: {str(e)}")

    def send_directory_json(self, path):
        """디렉토리 내용을 JSON으로 전송"""
        try:
            files = []
            directories = []

            for item in os.listdir(path):
                item_path = os.path.join(path, item)
                if os.path.isdir(item_path):
                    directories.append(item)
                else:
                    files.append(item)

            response_data = {
                'files': sorted(files),
                'directories': sorted(directories)
            }

            json_data = json.dumps(response_data, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(json_data.encode())))
            self.add_cors_headers()
            self.end_headers()
            self.wfile.write(json_data.encode())

        except Exception as e:
            print(f"Error creating directory JSON: {e}")
            self.send_error(500, f"Internal server error: {str(e)}")

def run_server(port=8081, directory=None):
    """Range 지원 서버 실행"""
    if directory:
        os.chdir(directory)
    
    print(f"Python version: {sys.version}")
    print(f"Serving directory: {os.getcwd()}")
    print(f"Server port: {port}")
    print("Custom Range support implemented")
    
    with socketserver.TCPServer(("localhost", port), CustomRangeHTTPRequestHandler) as httpd:
        print(f"Custom Range HTTP server running at http://localhost:{port}/")
        print("Range requests are fully supported")
        print("Press Ctrl+C to stop")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped by user")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Custom Range HTTP Server')
    parser.add_argument('--port', '-p', type=int, default=8083, help='Port to serve on')
    parser.add_argument('--directory', '-d', default='.', help='Directory to serve')
    
    args = parser.parse_args()
    
    run_server(args.port, args.directory)