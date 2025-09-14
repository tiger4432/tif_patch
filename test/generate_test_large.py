#!/usr/bin/env python3
"""
테스트용 중간 크기 웨이퍼 생성 (빠른 검증용)
"""

import numpy as np
from PIL import Image
import math
import random
from tifffile import TiffWriter
import gc

def create_fast_wafer_layer(size, layer_idx, chip_grid=30):
    """빠른 웨이퍼 레이어 생성"""
    print(f"  Generating layer {layer_idx + 1} ({size}x{size})")
    
    # 전체 이미지
    img = np.zeros((size, size), dtype=np.uint8)
    
    center = size // 2
    radius = size // 2 - 50
    chip_size = size // chip_grid
    
    # 웨이퍼 배경
    for y in range(size):
        for x in range(size):
            dist = math.sqrt((x - center)**2 + (y - center)**2)
            
            if dist <= radius:
                # 웨이퍼 내부
                chip_x = x // chip_size
                chip_y = y // chip_size
                local_x = x % chip_size
                local_y = y % chip_size
                
                # 칩 경계
                if local_x < 2 or local_x >= chip_size-2 or local_y < 2 or local_y >= chip_size-2:
                    img[y, x] = 40
                else:
                    # 칩 내부 패턴
                    base = 100 + layer_idx * 10
                    pattern = int(base + 20 * math.sin(local_x * 0.3) * math.cos(local_y * 0.3))
                    
                    # 결함 추가
                    if random.random() < 0.05:  # 5% 결함률
                        if random.random() < 0.5:
                            pattern = 30  # 보이드
                        else:
                            pattern = 200  # 파티클
                    
                    img[y, x] = np.clip(pattern + random.randint(-10, 10), 0, 255)
            else:
                # 웨이퍼 외부
                img[y, x] = random.randint(0, 20)
    
    return img

def generate_test_wafer(size=6000, layers=11, filename=None):
    """테스트용 웨이퍼 생성"""
    if filename is None:
        filename = f"test_wafer_{size}x{size}_{layers}layers.tif"
    
    print(f"Generating {filename}")
    print(f"Size: {size}x{size}, Layers: {layers}")
    
    with TiffWriter(filename) as tiff:
        for layer_idx in range(layers):
            layer_img = create_fast_wafer_layer(size, layer_idx)
            tiff.write(layer_img, photometric='minisblack')
            
            del layer_img
            gc.collect()
    
    print(f"✅ Generated {filename}")
    
    # 파일 크기 출력
    import os
    file_size = os.path.getsize(filename)
    print(f"File size: {file_size / (1024**2):.2f} MB")

if __name__ == "__main__":
    # 6000x6000, 11레이어 (약 400MB)
    generate_test_wafer(14900, 1, "test_wafer_14900x14900_11layers.tif")
    
    print("\n🎉 Test wafer generation complete!")