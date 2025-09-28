#!/usr/bin/env python3
"""
SAT (Semiconductor Analysis Tool) Launcher
Range 서버와 웹 인터페이스를 함께 실행하는 통합 런처
"""

import os
import sys
import time
import threading
import webbrowser
import subprocess
from pathlib import Path

def print_banner():
    """앱 시작 배너 출력"""
    print("=" * 60)
    print("  SAT - Semiconductor Analysis Tool")
    print("  Wafer Patch Analysis & Void Detection")
    print("=" * 60)
    print()

def start_range_server(port=8083, directory='.'):
    """Range 서버 시작"""
    try:
        print(f"[*] Starting Range Server on port {port}...")
        # 내장 range_server_custom 코드 직접 실행
        from range_server_custom import run_server
        run_server(port, directory)
    except Exception as e:
        print(f"[!] Range Server error: {e}")

def start_web_server(port=8080, directory='.'):
    """웹 서버 시작"""
    try:
        print(f"[*] Starting Web Server on port {port}...")
        # 내장 HTTP 서버 직접 실행
        import http.server
        import socketserver
        import os
        
        os.chdir(directory)
        
        with socketserver.TCPServer(("localhost", port), http.server.SimpleHTTPRequestHandler) as httpd:
            print(f"[+] Web Server running at http://localhost:{port}/")
            httpd.serve_forever()
    except Exception as e:
        print(f"[!] Web Server error: {e}")

def open_browser(url, delay=3):
    """지연 후 브라우저 열기"""
    def delayed_open():
        try:
            time.sleep(delay)
            print(f"[*] Opening browser: {url}")
            webbrowser.open(url)
        except Exception as e:
            print(f"[!] Browser opening failed: {e}")
            print(f"[i] Please manually open: {url}")
    
    thread = threading.Thread(target=delayed_open)
    thread.daemon = True
    thread.start()

def check_files():
    """필요한 파일들이 존재하는지 확인"""
    required_files = [
        'range_server_custom.py',
        'index_v2.html',
        'js/voidManager_v2.js',
        'js/constants.js'
    ]
    
    missing_files = []
    for file in required_files:
        if not Path(file).exists():
            missing_files.append(file)
    
    if missing_files:
        print("[!] Missing required files:")
        for file in missing_files:
            print(f"   - {file}")
        print("\nPlease ensure all files are in the correct location.")
        return False
    
    return True

def main():
    """메인 함수"""
    # PyInstaller multiprocessing 보호
    import multiprocessing
    multiprocessing.freeze_support()
    
    print_banner()
    
    # 현재 디렉토리 확인
    current_dir = Path.cwd()
    print(f"[+] Working directory: {current_dir}")
    
    # 필요한 파일들 확인
    if not check_files():
        input("Press Enter to exit...")
        return
    
    # 서버 포트 설정
    range_port = 8083
    web_port = 8080
    app_url = f"http://localhost:{web_port}/index_v2.html"
    
    print(f"[+] Configuration:")
    print(f"   - Range Server: http://localhost:{range_port}")
    print(f"   - Web Server: http://localhost:{web_port}")
    print(f"   - App URL: {app_url}")
    print()
    
    print("[*] Starting services...")
    
    # 브라우저 자동 열기 (3초 후)
    open_browser(app_url, delay=3)
    
    # Range 서버를 별도 스레드에서 시작
    range_thread = threading.Thread(
        target=start_range_server, 
        args=(range_port, str(current_dir))
    )
    range_thread.daemon = True
    range_thread.start()
    
    # 잠시 대기 후 웹 서버 시작
    time.sleep(1)
    
    print("[+] Services started successfully!")
    print()
    print("[i] Usage Instructions:")
    print("   1. Browser will open automatically in 3 seconds")
    print("   2. Load TIFF files using the interface")
    print("   3. Extract patches and analyze voids")
    print("   4. Use Ctrl+C to stop all services")
    print()
    print("[*] Starting Web Server (main process)...")
    print("   Press Ctrl+C to stop all services")
    print()
    
    try:
        # 메인 프로세스에서 웹 서버 실행
        start_web_server(web_port, str(current_dir))
    except KeyboardInterrupt:
        print("\n\n[*] Shutting down services...")
        print("[+] All services stopped. Thank you for using SAT!")
    except Exception as e:
        print(f"\n[!] Unexpected error: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()