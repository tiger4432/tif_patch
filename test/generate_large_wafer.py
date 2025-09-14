#!/usr/bin/env python3
"""
고해상도 웨이퍼 TIFF 생성기
14900x14900 픽셀, 11개 레이어
메모리 효율적인 타일 기반 생성
"""

import numpy as np
from PIL import Image
import math
import random
import os
import gc
from tifffile import TiffWriter
import argparse

def create_chip_pattern(chip_size=500, chip_id=None):
    """단일 칩 패턴 생성 (500x500픽셀)"""
    chip = np.zeros((chip_size, chip_size), dtype=np.uint8)
    
    # 기본 회색 배경
    base_level = random.randint(80, 120)
    chip.fill(base_level)
    
    # 경계선 (500x500에 맞게 스케일)
    border_width = int(chip_size * 0.02)  # 2% 경계
    chip[:border_width, :] = 40  # 상단
    chip[-border_width:, :] = 40  # 하단
    chip[:, :border_width] = 40  # 좌측
    chip[:, -border_width:] = 40  # 우측
    
    # 내부 구조물 (반도체 패턴)
    center_x, center_y = chip_size // 2, chip_size // 2
    
    # 중앙 사각형 (스케일링)
    rect_size = int(chip_size * 0.15)  # 15% 크기
    x1 = center_x - rect_size // 2
    x2 = center_x + rect_size // 2
    y1 = center_y - rect_size // 2
    y2 = center_y + rect_size // 2
    chip[y1:y2, x1:x2] = base_level + 30
    
    # 격자 패턴 (스케일링)
    grid_spacing = int(chip_size * 0.06)  # 6% 간격
    grid_width = int(chip_size * 0.008)   # 0.8% 두께
    margin = int(chip_size * 0.04)        # 4% 마진
    
    for i in range(margin, chip_size-margin, grid_spacing):
        chip[i:i+grid_width, margin:chip_size-margin] = base_level - 20
        chip[margin:chip_size-margin, i:i+grid_width] = base_level - 20
    
    # 랜덤 노이즈
    noise = np.random.normal(0, 5, (chip_size, chip_size))
    chip = np.clip(chip.astype(float) + noise, 0, 255).astype(np.uint8)
    
    return chip

def add_defects(chip, defect_prob=0.1, layer_idx=0):
    """칩에 결함 추가"""
    chip = chip.copy()
    
    if random.random() < defect_prob:
        defect_type = random.choice(['void', 'crack', 'particle'])
        margin = int(chip.shape[1] * 0.1)  # 10% 마진
        center_x = random.randint(margin, chip.shape[1] - margin)
        center_y = random.randint(margin, chip.shape[0] - margin)
        
        if defect_type == 'void':
            # 타원형 보이드 (스케일링)
            min_radius = int(chip.shape[1] * 0.02)  # 2% 최소 반지름
            max_radius = int(chip.shape[1] * 0.08)  # 8% 최대 반지름
            radius_x = random.randint(min_radius, max_radius)
            radius_y = random.randint(min_radius, max_radius)
            y, x = np.ogrid[:chip.shape[0], :chip.shape[1]]
            mask = ((x - center_x) / radius_x) ** 2 + ((y - center_y) / radius_y) ** 2 <= 1
            chip[mask] = random.randint(20, 60)  # 어두운 영역
            
        elif defect_type == 'crack':
            # 선형 크랙 (스케일링)
            angle = random.uniform(0, 2 * math.pi)
            min_length = int(chip.shape[1] * 0.1)  # 10% 최소 길이
            max_length = int(chip.shape[1] * 0.25) # 25% 최대 길이
            length = random.randint(min_length, max_length)
            crack_width = int(chip.shape[1] * 0.01)  # 1% 두께
            
            for i in range(length):
                dx = int(i * math.cos(angle))
                dy = int(i * math.sin(angle))
                px, py = center_x + dx, center_y + dy
                if 0 <= px < chip.shape[1] and 0 <= py < chip.shape[0]:
                    # 크랙 주변 영역
                    for ox in range(-crack_width, crack_width + 1):
                        for oy in range(-crack_width, crack_width + 1):
                            if 0 <= px+ox < chip.shape[1] and 0 <= py+oy < chip.shape[0]:
                                chip[py+oy, px+ox] = random.randint(10, 40)
                                
        elif defect_type == 'particle':
            # 원형 파티클 (스케일링)
            min_radius = int(chip.shape[1] * 0.02)  # 2% 최소 반지름
            max_radius = int(chip.shape[1] * 0.06)  # 6% 최대 반지름
            radius = random.randint(min_radius, max_radius)
            y, x = np.ogrid[:chip.shape[0], :chip.shape[1]]
            mask = (x - center_x) ** 2 + (y - center_y) ** 2 <= radius ** 2
            chip[mask] = random.randint(180, 220)  # 밝은 영역
    
    # 레이어별 특성 변화
    layer_variation = layer_idx * 5
    chip = np.clip(chip.astype(float) + layer_variation, 0, 255).astype(np.uint8)
    
    return chip

def generate_wafer_tile(tile_x, tile_y, tile_size, wafer_size, chip_size, layer_idx, grid_size):
    """웨이퍼의 특정 타일 영역 생성"""
    print(f"  Generating tile ({tile_x//tile_size}, {tile_y//tile_size}) for layer {layer_idx}")
    
    # 타일 이미지 초기화
    actual_w = min(tile_size, wafer_size - tile_x)
    actual_h = min(tile_size, wafer_size - tile_y)
    tile = np.zeros((actual_h, actual_w), dtype=np.uint8)
    
    # 배경 (웨이퍼 외부는 검은색)
    center = wafer_size // 2
    radius = wafer_size // 2 - 100
    
    # 타일 내의 각 픽셀에 대해
    for py in range(actual_h):
        for px in range(actual_w):
            global_x = tile_x + px
            global_y = tile_y + py
            
            # 웨이퍼 경계 확인
            dist_from_center = math.sqrt((global_x - center)**2 + (global_y - center)**2)
            
            if dist_from_center <= radius:
                # 웨이퍼 내부 - 칩 패턴
                chip_x = global_x // chip_size
                chip_y = global_y // chip_size
                
                if chip_x < grid_size and chip_y < grid_size:
                    # 칩 내부 좌표
                    local_x = global_x % chip_size
                    local_y = global_y % chip_size
                    
                    # 칩 캐시 키
                    chip_key = f"{chip_x}_{chip_y}_{layer_idx}"
                    
                    # 칩이 없으면 생성
                    if not hasattr(generate_wafer_tile, 'chip_cache'):
                        generate_wafer_tile.chip_cache = {}
                    
                    if chip_key not in generate_wafer_tile.chip_cache:
                        base_chip = create_chip_pattern(chip_size, (chip_x, chip_y))
                        generate_wafer_tile.chip_cache[chip_key] = add_defects(
                            base_chip, defect_prob=0.15, layer_idx=layer_idx
                        )
                        
                        # 캐시 크기 제한
                        if len(generate_wafer_tile.chip_cache) > 50:
                            # 오래된 캐시 삭제
                            old_key = next(iter(generate_wafer_tile.chip_cache))
                            del generate_wafer_tile.chip_cache[old_key]
                    
                    tile[py, px] = generate_wafer_tile.chip_cache[chip_key][local_y, local_x]
                else:
                    # 웨이퍼 가장자리
                    tile[py, px] = random.randint(60, 100)
            else:
                # 웨이퍼 외부
                tile[py, px] = random.randint(0, 20)
    
    return tile

def generate_large_wafer_tiff(filename="large_wafer_14900x14900_11layers.tif"):
    """메모리 효율적인 고해상도 웨이퍼 TIFF 생성"""
    print(f"Generating {filename}...")
    
    # 파라미터
    wafer_size = 14900
    chip_size = 500  # 30x30 그리드 (14900/500 ≈ 29.8)
    grid_size = wafer_size // chip_size  # 29x29 칩
    num_layers = 11
    tile_size = 1024  # 1K 타일로 메모리 절약
    
    print(f"Wafer size: {wafer_size}x{wafer_size}")
    print(f"Chip grid: {grid_size}x{grid_size} chips")
    print(f"Chip size: {chip_size}x{chip_size} pixels")
    print(f"Total layers: {num_layers}")
    print(f"Processing tile size: {tile_size}x{tile_size}")
    
    # TIFF 파일 생성
    with TiffWriter(filename) as tiff:
        for layer_idx in range(num_layers):
            print(f"\nProcessing layer {layer_idx + 1}/{num_layers}...")
            
            # 전체 레이어 이미지 초기화
            layer_image = np.zeros((wafer_size, wafer_size), dtype=np.uint8)
            
            # 타일별로 생성
            tiles_x = math.ceil(wafer_size / tile_size)
            tiles_y = math.ceil(wafer_size / tile_size)
            
            for tile_row in range(tiles_y):
                for tile_col in range(tiles_x):
                    tile_x = tile_col * tile_size
                    tile_y = tile_row * tile_size
                    
                    # 타일 생성
                    tile = generate_wafer_tile(
                        tile_x, tile_y, tile_size, wafer_size, 
                        chip_size, layer_idx, grid_size
                    )
                    
                    # 메인 이미지에 타일 복사
                    end_x = min(tile_x + tile_size, wafer_size)
                    end_y = min(tile_y + tile_size, wafer_size)
                    layer_image[tile_y:end_y, tile_x:end_x] = tile
                    
                    # 메모리 정리
                    del tile
                    if (tile_row * tiles_x + tile_col) % 10 == 0:
                        gc.collect()
            
            # TIFF 레이어로 저장
            tiff.write(layer_image, photometric='minisblack')
            print(f"Layer {layer_idx + 1} saved")
            
            # 메모리 정리
            del layer_image
            gc.collect()
            
            # 칩 캐시 초기화
            if hasattr(generate_wafer_tile, 'chip_cache'):
                generate_wafer_tile.chip_cache.clear()
    
    print(f"\nSuccessfully generated {filename}")
    
    # 파일 크기 확인
    file_size = os.path.getsize(filename)
    print(f"File size: {file_size / (1024**3):.2f} GB")

def generate_test_coordinates_csv():
    """대용량 웨이퍼용 테스트 좌표 CSV 생성 (29x29 그리드)"""
    print("Generating test coordinates CSV...")
    
    coords = []
    center = 14  # 29x29 그리드의 중심 (14)
    
    # 중심 주변의 좌표들 생성
    for x in range(center - 12, center + 13):  # 25x25 영역
        for y in range(center - 12, center + 13):
            # 원형 영역으로 제한 (29x29 그리드 내에서)
            if 0 <= x < 29 and 0 <= y < 29:
                dist = math.sqrt((x - center)**2 + (y - center)**2)
                if dist <= 10:  # 반지름 10 이내
                    chip_type = 'normal'
                    if dist > 8:
                        chip_type = 'edge'
                    elif random.random() < 0.1:
                        chip_type = 'defect'
                    
                    coords.append(f"{x},{y},{chip_type}")
    
    filename = "large_wafer_coordinates_500chip.csv"
    with open(filename, 'w') as f:
        f.write("x,y,type\n")
        for coord in coords:
            f.write(coord + "\n")
    
    print(f"Generated {filename} with {len(coords)} coordinates (500x500 chip grid)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate large wafer TIFF')
    parser.add_argument('--filename', '-f', default='large_wafer_14900x14900_11layers.tif',
                        help='Output filename')
    parser.add_argument('--coords-only', action='store_true',
                        help='Generate only coordinates CSV')
    
    args = parser.parse_args()
    
    try:
        if args.coords_only:
            generate_test_coordinates_csv()
        else:
            generate_large_wafer_tiff(args.filename)
            generate_test_coordinates_csv()
        
        print("\nGeneration complete!")
        
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()