from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import numpy as np
import random
import math

def create_realistic_wafer_sample():
    """
    현실적인 웨이퍼 샘플 이미지를 생성합니다.
    - 칩 격자가 흐릿하게 보이는 패턴
    - 각 칩에 노이즈와 보이드가 적절히 섞임
    - 다양한 밝기/대비 조건의 멀티페이지 TIFF
    """
    
    # 웨이퍼 기본 설정
    WAFER_SIZE = 8000  # 웨이퍼 크기 (픽셀)
    CHIP_SIZE = 200    # 칩 크기 (픽셀)
    CHIP_SPACING = 220 # 칩 간격 (픽셀)
    GRID_COLS = 30     # 칩 그리드 열
    GRID_ROWS = 30     # 칩 그리드 행
    NUM_PAGES = 12     # 페이지 수 (다양한 레이어)
    
    # 웨이퍼 중심점
    center_x = WAFER_SIZE // 2
    center_y = WAFER_SIZE // 2
    wafer_radius = WAFER_SIZE * 0.45
    
    pages = []
    
    for page_idx in range(NUM_PAGES):
        print(f"Generating page {page_idx + 1}/{NUM_PAGES}...")
        
        # 페이지별 다른 조건 설정
        base_brightness = 0.7 + 0.6 * random.random()  # 0.7 ~ 1.3
        base_contrast = 0.8 + 0.4 * random.random()    # 0.8 ~ 1.2
        noise_level = 0.1 + 0.2 * random.random()      # 0.1 ~ 0.3
        
        # 기본 배경 생성 (회색 + 약간의 노이즈)
        background_gray = 80 + int(50 * random.random())  # 80~130
        img_array = np.full((WAFER_SIZE, WAFER_SIZE, 3), background_gray, dtype=np.uint8)
        
        # 전체적인 노이즈 추가
        noise = np.random.normal(0, 15, (WAFER_SIZE, WAFER_SIZE, 3))
        img_array = np.clip(img_array + noise, 0, 255).astype(np.uint8)
        
        img = Image.fromarray(img_array)
        draw = ImageDraw.Draw(img)
        
        # 웨이퍼 원형 마스크 생성
        wafer_mask = Image.new('L', (WAFER_SIZE, WAFER_SIZE), 0)
        mask_draw = ImageDraw.Draw(wafer_mask)
        mask_draw.ellipse([
            center_x - wafer_radius, center_y - wafer_radius,
            center_x + wafer_radius, center_y + wafer_radius
        ], fill=255)
        
        # 칩 격자 생성
        for row in range(GRID_ROWS):
            for col in range(GRID_COLS):
                # 칩 중심점 계산
                chip_x = center_x - (GRID_COLS - 1) * CHIP_SPACING / 2 + col * CHIP_SPACING
                chip_y = center_y - (GRID_ROWS - 1) * CHIP_SPACING / 2 + row * CHIP_SPACING
                
                # 웨이퍼 경계 내부에 있는지 확인
                dist_from_center = math.sqrt((chip_x - center_x)**2 + (chip_y - center_y)**2)
                if dist_from_center > wafer_radius - CHIP_SIZE/2:
                    continue
                
                # 칩 영역 생성
                create_chip(img, chip_x, chip_y, CHIP_SIZE, page_idx, noise_level)
        
        # 웨이퍼 마스크 적용 (원형으로 자르기)
        img.putalpha(wafer_mask)
        
        # 밝기/대비 조정
        if base_brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(base_brightness)
        if base_contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(base_contrast)
        
        # 페이지 정보 텍스트 추가
        draw = ImageDraw.Draw(img)
        info_text = f"Layer {page_idx + 1} | B:{base_brightness:.2f} C:{base_contrast:.2f} N:{noise_level:.2f}"
        draw.text((50, 50), info_text, fill=(255, 255, 0, 255))
        
        # RGB로 변환 (alpha 채널 제거)
        img_rgb = Image.new('RGB', img.size, (0, 0, 0))
        img_rgb.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        
        pages.append(img_rgb)
    
    return pages

def create_chip(img, center_x, center_y, chip_size, layer_idx, noise_level):
    """개별 칩 생성"""
    draw = ImageDraw.Draw(img)
    half_size = chip_size // 2
    
    # 칩 경계 박스
    chip_left = int(center_x - half_size)
    chip_top = int(center_y - half_size)
    chip_right = int(center_x + half_size)
    chip_bottom = int(center_y + half_size)
    
    # 칩 배경색 (약간의 변화)
    chip_brightness = 120 + int(30 * random.random())  # 120~150
    
    # 칩 영역 채우기
    draw.rectangle([chip_left, chip_top, chip_right, chip_bottom], 
                   fill=(chip_brightness, chip_brightness, chip_brightness))
    
    # 칩 경계선 (흐릿하게)
    border_color = max(0, chip_brightness - 40)
    draw.rectangle([chip_left, chip_top, chip_right, chip_bottom], 
                   outline=(border_color, border_color, border_color), width=2)
    
    # 칩 내부 패턴 (회로 패턴 시뮬레이션)
    add_circuit_pattern(draw, chip_left, chip_top, chip_right, chip_bottom, layer_idx)
    
    # 랜덤 보이드 생성
    add_chip_defects(draw, chip_left, chip_top, chip_right, chip_bottom, noise_level)
    
    # 칩 내부 노이즈
    add_chip_noise(img, chip_left, chip_top, chip_right, chip_bottom, noise_level)

def add_circuit_pattern(draw, left, top, right, bottom, layer_idx):
    """칩 내부 회로 패턴 추가"""
    width = right - left
    height = bottom - top
    
    # 레이어별 다른 패턴
    pattern_density = 0.3 + 0.4 * (layer_idx % 3) / 2  # 레이어마다 다른 밀도
    
    # 수평/수직 라인 패턴
    line_spacing = int(20 + 10 * random.random())
    line_color = (90, 90, 90)
    
    for i in range(0, width, line_spacing):
        if random.random() < pattern_density:
            draw.line([left + i, top, left + i, bottom], fill=line_color, width=1)
    
    for i in range(0, height, line_spacing):
        if random.random() < pattern_density:
            draw.line([left, top + i, right, top + i], fill=line_color, width=1)
    
    # 작은 사각형 패턴들
    for _ in range(int(5 * pattern_density)):
        x = left + random.randint(5, width - 15)
        y = top + random.randint(5, height - 15)
        size = random.randint(3, 8)
        draw.rectangle([x, y, x + size, y + size], fill=(70, 70, 70))

def add_chip_defects(draw, left, top, right, bottom, noise_level):
    """칩 결함 추가 (보이드, 크랙, 파티클)"""
    width = right - left
    height = bottom - top
    
    # 보이드 (어두운 원형)
    num_voids = int(noise_level * 15)  # 노이즈 레벨에 따라 조정
    for _ in range(num_voids):
        if random.random() < 0.7:  # 70% 확률
            x = left + random.randint(10, width - 20)
            y = top + random.randint(10, height - 20)
            radius = random.randint(2, 8)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], 
                        fill=(30, 30, 30))
    
    # 파티클 (밝은 점들)
    num_particles = int(noise_level * 10)
    for _ in range(num_particles):
        if random.random() < 0.5:  # 50% 확률
            x = left + random.randint(5, width - 5)
            y = top + random.randint(5, height - 5)
            radius = random.randint(1, 4)
            brightness = 180 + random.randint(0, 75)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], 
                        fill=(brightness, brightness, brightness))
    
    # 크랙 (선형 결함)
    num_cracks = int(noise_level * 5)
    for _ in range(num_cracks):
        if random.random() < 0.3:  # 30% 확률
            x1 = left + random.randint(0, width)
            y1 = top + random.randint(0, height)
            length = random.randint(10, 30)
            angle = random.uniform(0, 2 * math.pi)
            x2 = x1 + int(length * math.cos(angle))
            y2 = y1 + int(length * math.sin(angle))
            draw.line([x1, y1, x2, y2], fill=(50, 50, 50), width=2)

def add_chip_noise(img, left, top, right, bottom, noise_level):
    """칩 영역에 노이즈 추가"""
    # PIL 이미지를 numpy 배열로 변환
    img_array = np.array(img)
    
    # 칩 영역만 추출
    chip_region = img_array[top:bottom, left:right]
    
    # 가우시안 노이즈 추가
    noise_strength = noise_level * 20
    noise = np.random.normal(0, noise_strength, chip_region.shape)
    
    # 노이즈 적용
    noisy_region = np.clip(chip_region + noise, 0, 255).astype(np.uint8)
    
    # 다시 이미지에 적용
    img_array[top:bottom, left:right] = noisy_region
    
    # PIL 이미지로 다시 변환
    img.paste(Image.fromarray(img_array), (0, 0))

def main():
    """메인 함수"""
    print("Generating realistic wafer sample...")
    
    pages = create_realistic_wafer_sample()
    
    # 멀티페이지 TIFF 저장
    output_path = "realistic_wafer_sample.tif"
    print(f"Saving {len(pages)} pages to {output_path}...")
    
    pages[0].save(
        output_path,
        save_all=True,
        append_images=pages[1:],
        compression='tiff_lzw'  # 압축 적용
    )
    
    print(f"✅ Successfully saved: {output_path}")
    print(f"📊 Image size: {pages[0].size}")
    print(f"📄 Total pages: {len(pages)}")

if __name__ == "__main__":
    main()