#!/usr/bin/env python3
"""
SAT 애플리케이션을 exe 파일로 빌드하는 스크립트
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def clean_build_dirs():
    """기존 빌드 디렉토리 정리"""
    print("[*] Cleaning previous build directories...")
    
    dirs_to_clean = ['build', 'dist', '__pycache__']
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"[+] Removed: {dir_name}")
    
    # .spec 파일 제거
    spec_files = list(Path('.').glob('*.spec'))
    for spec_file in spec_files:
        spec_file.unlink()
        print(f"[+] Removed: {spec_file}")

def create_spec_file():
    """PyInstaller spec 파일 생성"""
    spec_content = '''
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# 필요한 데이터 파일들
datas = [
    ('index_v2.html', '.'),
    ('js', 'js'),
    ('range_server_custom.py', '.'),
]

# 필요한 숨겨진 imports
hiddenimports = [
    'socketserver',
    'http.server',
    'threading',
    'webbrowser',
    'subprocess',
    'pathlib',
    'multiprocessing',
    'range_server_custom'
]

a = Analysis(
    ['launch_app.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='SAT-App',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
'''
    
    with open('SAT-App.spec', 'w', encoding='utf-8') as f:
        f.write(spec_content.strip())
    
    print("[+] Created SAT-App.spec file")

def build_exe():
    """exe 파일 빌드"""
    print("[*] Building SAT-App.exe...")
    
    try:
        # PyInstaller 실행
        result = subprocess.run([
            'pyinstaller',
            '--clean',
            '--noconfirm',
            'SAT-App.spec'
        ], capture_output=True, text=True, encoding='utf-8')
        
        if result.returncode == 0:
            print("[+] Build successful!")
            return True
        else:
            print(f"[!] Build failed!")
            print(f"Error: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"[!] Build error: {e}")
        return False

def create_distribution_package():
    """배포용 패키지 생성"""
    print("[*] Creating distribution package...")
    
    # 배포 디렉토리 생성
    dist_dir = Path('SAT-Distribution-Fixed')
    if dist_dir.exists():
        try:
            shutil.rmtree(dist_dir)
        except PermissionError:
            print("[!] Cannot remove existing directory (files in use)")
            print("[*] Using backup name...")
            import time
            dist_dir = Path(f'SAT-Distribution-{int(time.time())}')
    dist_dir.mkdir()
    
    # exe 파일 복사
    exe_source = Path('dist/SAT-App.exe')
    if exe_source.exists():
        shutil.copy2(exe_source, dist_dir / 'SAT-App.exe')
        print("[+] Copied SAT-App.exe")
    else:
        print("[!] SAT-App.exe not found!")
        return False
    
    # 필수 파일들 복사
    essential_files = [
        'README.md',
        'index_v2.html',
        'range_server_custom.py'
    ]
    
    for file in essential_files:
        if Path(file).exists():
            shutil.copy2(file, dist_dir / file)
            print(f"[+] Copied {file}")
        else:
            print(f"[!] Warning: {file} not found!")
    
    # js 디렉토리 복사
    js_source = Path('js')
    if js_source.exists():
        shutil.copytree(js_source, dist_dir / 'js')
        print("[+] Copied js/ directory")
    
    # 테스트 파일들 복사 (선택적)
    test_files = [
        'realistic_wafer_sample_fast_1000.tif',
        'sample_chip_coordinates.csv'
    ]
    
    for file in test_files:
        if Path(file).exists():
            shutil.copy2(file, dist_dir / file)
            print(f"[+] Copied test file: {file}")
    
    # 실행 가이드 생성
    guide_content = """# SAT (Semiconductor Analysis Tool) - 실행 가이드

## 빠른 시작

1. **SAT-App.exe** 파일을 더블클릭하여 실행
2. 자동으로 브라우저가 열리고 애플리케이션이 시작됩니다
3. 사용이 끝나면 콘솔 창에서 Ctrl+C를 눌러 종료

## 주의사항

- 이 폴더의 모든 파일이 필요합니다
- 바이러스 백신이 실행을 차단할 수 있습니다 (허용해주세요)
- Windows Defender에서 경고가 나올 수 있습니다 (실행 허용)

## 파일 설명

- SAT-App.exe: 메인 실행 파일
- index_v2.html: 웹 인터페이스
- js/: JavaScript 모듈들
- range_server_custom.py: Range 서버 (exe에 내장됨)
- README.md: 자세한 사용법

## 문제 해결

1. exe 파일이 실행되지 않는 경우:
   - 바이러스 백신 예외 처리
   - Windows Defender 실시간 보호 일시 해제

2. 브라우저가 열리지 않는 경우:
   - 수동으로 http://localhost:8080/index_v2.html 접속

3. 서버 포트 오류:
   - 다른 프로그램이 8080, 8083 포트 사용 중인지 확인
"""
    
    with open(dist_dir / 'QUICK_START.txt', 'w', encoding='utf-8') as f:
        f.write(guide_content)
    
    print(f"[+] Distribution package created: {dist_dir}")
    return True

def main():
    """메인 함수"""
    print("=" * 60)
    print("  SAT Application - EXE Builder")
    print("=" * 60)
    print()
    
    # 현재 디렉토리 확인
    current_dir = Path.cwd()
    print(f"[+] Working directory: {current_dir}")
    
    # 필수 파일 확인
    required_files = [
        'launch_app.py',
        'range_server_custom.py',
        'index_v2.html'
    ]
    
    missing_files = []
    for file in required_files:
        if not Path(file).exists():
            missing_files.append(file)
    
    if missing_files:
        print("[!] Missing required files:")
        for file in missing_files:
            print(f"   - {file}")
        return
    
    # 빌드 과정
    try:
        clean_build_dirs()
        create_spec_file()
        
        if build_exe():
            if create_distribution_package():
                print()
                print("=" * 60)
                print("[+] EXE BUILD SUCCESSFUL!")
                print("   Check SAT-Distribution/ folder")
                print("   Run SAT-Distribution/SAT-App.exe to test")
                print("=" * 60)
            else:
                print("[!] Distribution package creation failed")
        else:
            print("[!] EXE build failed")
    
    except KeyboardInterrupt:
        print("\n[*] Build cancelled by user")
    except Exception as e:
        print(f"[!] Unexpected error: {e}")

if __name__ == "__main__":
    main()