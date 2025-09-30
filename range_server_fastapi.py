#!/usr/bin/env python3
"""
FastAPI 기반 Range 요청 지원 HTTP 서버
ZIP 압축, JSON 디렉토리 리스팅, Range 요청 완벽 지원
"""

import os
import io
import json
import zipfile
import mimetypes
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, Request, Response, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse

app = FastAPI(title="Range Server", description="완전한 Range 요청 지원 HTTP 서버")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 서빙할 베이스 디렉토리
BASE_DIR = Path.cwd()

def set_base_directory(directory: str):
    """베이스 디렉토리 설정"""
    global BASE_DIR
    BASE_DIR = Path(directory).resolve()
    print(f"Base directory set to: {BASE_DIR}")

def get_file_path(path: str) -> Path:
    """요청 경로를 실제 파일 경로로 변환"""
    # 경로 정규화 및 보안 검사
    clean_path = path.lstrip('/')
    file_path = BASE_DIR / clean_path

    # 경로 순회 공격 방지
    try:
        file_path = file_path.resolve()
        file_path.relative_to(BASE_DIR)
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="Access denied")

    return file_path

def parse_range_header(range_header: str, file_size: int) -> list:
    """Range 헤더 파싱"""
    if not range_header.startswith('bytes='):
        return []

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
            if start <= end:
                ranges.append((start, end))

        except ValueError:
            continue

    return ranges

def create_range_response(file_path: Path, ranges: list, file_size: int):
    """Range 응답 생성"""
    if len(ranges) == 1:
        # 단일 Range
        start, end = ranges[0]
        content_length = end - start + 1

        def generate():
            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
                    remaining -= len(chunk)

        headers = {
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Accept-Ranges': 'bytes',
            'Content-Length': str(content_length)
        }

        media_type = mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'

        return StreamingResponse(
            generate(),
            status_code=206,
            headers=headers,
            media_type=media_type
        )
    else:
        # 다중 Range (multipart)
        boundary = "RANGE_BOUNDARY"
        media_type = f'multipart/byteranges; boundary={boundary}'

        def generate():
            with open(file_path, 'rb') as f:
                for start, end in ranges:
                    content_length = end - start + 1

                    # 경계 및 헤더
                    yield f'\r\n--{boundary}\r\n'.encode()
                    yield f'Content-Type: {mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"}\r\n'.encode()
                    yield f'Content-Range: bytes {start}-{end}/{file_size}\r\n\r\n'.encode()

                    # 파일 데이터
                    f.seek(start)
                    remaining = content_length
                    while remaining > 0:
                        chunk_size = min(8192, remaining)
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                        remaining -= len(chunk)

                yield f'\r\n--{boundary}--\r\n'.encode()

        return StreamingResponse(
            generate(),
            status_code=206,
            media_type=media_type,
            headers={'Accept-Ranges': 'bytes'}
        )

@app.get("/{path:path}")
async def serve_file(
    request: Request,
    path: str = "",
    zip: Optional[bool] = Query(None, description="ZIP으로 압축하여 전송"),
    list: Optional[bool] = Query(None, description="디렉토리를 JSON으로 리스팅")
):
    """파일 또는 디렉토리 서빙"""

    try:
        file_path = get_file_path(path)
    except HTTPException:
        raise

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # 디렉토리 처리
    if file_path.is_dir():
        if zip:
            return await serve_directory_as_zip(file_path, path)
        elif list:
            return await serve_directory_as_json(file_path)
        else:
            return await serve_directory_listing(file_path, path)

    # 파일 처리
    file_size = file_path.stat().st_size
    range_header = request.headers.get('range')

    if range_header:
        # Range 요청 처리
        print(f"Range request: {range_header} for {path} (file_size: {file_size})")
        ranges = parse_range_header(range_header, file_size)

        if not ranges:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        return create_range_response(file_path, ranges, file_size)
    else:
        # 일반 파일 요청
        print(f"Normal request for {path}")
        return FileResponse(
            file_path,
            headers={'Accept-Ranges': 'bytes'}
        )

async def serve_directory_as_zip(directory_path: Path, url_path: str):
    """디렉토리를 ZIP으로 압축하여 전송"""
    print(f"Creating ZIP for directory: {directory_path}")

    # 메모리에서 ZIP 생성
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in directory_path.rglob('*'):
            if file_path.is_file():
                arc_name = file_path.relative_to(directory_path)
                print(f"Adding to ZIP: {arc_name}")
                zip_file.write(file_path, arc_name)

    zip_data = zip_buffer.getvalue()
    zip_buffer.close()

    # ZIP 파일명 생성
    folder_name = directory_path.name or 'folder'
    zip_filename = f"{folder_name}.zip"

    print(f"Sending ZIP file: {zip_filename}, size: {len(zip_data)} bytes")

    def generate():
        yield zip_data

    return StreamingResponse(
        generate(),
        media_type='application/zip',
        headers={
            'Content-Disposition': f'attachment; filename="{zip_filename}"',
            'Content-Length': str(len(zip_data))
        }
    )

async def serve_directory_as_json(directory_path: Path):
    """디렉토리 내용을 JSON으로 전송"""
    try:
        files = []
        directories = []

        for item in directory_path.iterdir():
            if item.is_dir():
                directories.append(item.name)
            else:
                files.append(item.name)

        response_data = {
            'files': sorted(files),
            'directories': sorted(directories)
        }

        return JSONResponse(response_data)

    except Exception as e:
        print(f"Error creating directory JSON: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

async def serve_directory_listing(directory_path: Path, url_path: str):
    """HTML 디렉토리 리스팅"""
    try:
        files = []
        directories = []

        for item in directory_path.iterdir():
            if item.is_dir():
                directories.append(item.name)
            else:
                file_size = item.stat().st_size
                size_mb = file_size / (1024 * 1024)
                files.append((item.name, size_mb))

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Directory Listing</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .directory {{ color: #1e90ff; }}
        .file {{ color: #333; }}
        .size {{ color: #666; font-size: 0.9em; }}
        ul {{ list-style-type: none; padding-left: 0; }}
        li {{ padding: 5px 0; }}
        a {{ text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <h1>Directory Listing for /{url_path}</h1>
    <ul>
"""

        # 디렉토리 먼저
        for directory in sorted(directories):
            html += f'        <li><a href="{directory}/" class="directory">📁 {directory}/</a></li>\n'

        # 파일들
        for file_name, size_mb in sorted(files):
            html += f'        <li><a href="{file_name}" class="file">📄 {file_name}</a> <span class="size">({size_mb:.1f} MB)</span></li>\n'

        html += """    </ul>
    <hr>
    <p><small>FastAPI Range Server with ZIP & JSON support</small></p>
</body>
</html>"""

        return Response(content=html, media_type="text/html")

    except Exception as e:
        print(f"Error creating directory listing: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/")
async def root():
    """루트 경로"""
    return await serve_file(Request({"type": "http", "method": "GET", "headers": []}), "")

def run_server(port: int = 8083, host: str = "localhost", directory: str = "."):
    """서버 실행"""
    set_base_directory(directory)

    print(f"FastAPI Range Server")
    print(f"Serving directory: {BASE_DIR}")
    print(f"Server URL: http://{host}:{port}/")
    print("Features:")
    print("  - Full Range request support")
    print("  - ZIP compression (?zip=true)")
    print("  - JSON directory listing (?list=true)")
    print("  - HTML directory browsing")
    print("  - CORS enabled")
    print("Press Ctrl+C to stop")

    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='FastAPI Range HTTP Server')
    parser.add_argument('--port', '-p', type=int, default=8083, help='Port to serve on')
    parser.add_argument('--host', default='localhost', help='Host to bind to')
    parser.add_argument('--directory', '-d', default='.', help='Directory to serve')

    args = parser.parse_args()

    run_server(args.port, args.host, args.directory)