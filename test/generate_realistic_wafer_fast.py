from PIL import Image, ImageDraw, ImageEnhance
import numpy as np
import random
import math

def create_realistic_wafer_sample():
    """
    현실적이지만 빠른 웨이퍼 샘플 이미지를 생성합니다.
    - 칩 격자가 흐릿하게 보이는 패턴
    - 각 칩에 노이즈와 보이드가 적절히 섞임
    - 다양한 밝기/대비 조건의 멀티페이지 TIFF
    """
    
    # 웨이퍼 기본 설정 (성능을 위해 크기 축소)
    WAFER_SIZE = 1000  # 웨이퍼 크기 (픽셀)
    CHIP_SIZE = 150    # 칩 크기 (픽셀)
    CHIP_SPACING = 170 # 칩 간격 (픽셀)
    GRID_COLS = 20     # 칩 그리드 열
    GRID_ROWS = 20     # 칩 그리드 행
    NUM_PAGES = 8      # 페이지 수 (다양한 레이어)
    
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
        
        # 기본 배경 생성 (회색)
        background_gray = 80 + int(50 * random.random())  # 80~130
        img = Image.new('RGB', (WAFER_SIZE, WAFER_SIZE), (background_gray, background_gray, background_gray))
        draw = ImageDraw.Draw(img)
        
        # 웨이퍼 원형 배경
        draw.ellipse([
            center_x - wafer_radius, center_y - wafer_radius,
            center_x + wafer_radius, center_y + wafer_radius
        ], fill=(background_gray + 10, background_gray + 10, background_gray + 10))
        
        # 칩 격자 생성
        chips_created = 0
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
                create_chip_fast(draw, chip_x, chip_y, CHIP_SIZE, page_idx, noise_level)
                chips_created += 1
        
        # 전체적인 노이즈 추가 (빠른 방식)
        add_global_noise(img, noise_level)
        
        # 밝기/대비 조정
        if base_brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(base_brightness)
        if base_contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(base_contrast)
        
        # 페이지 정보 텍스트 추가
        info_text = f"Layer {page_idx + 1} | B:{base_brightness:.2f} C:{base_contrast:.2f} | Chips:{chips_created}"
        draw = ImageDraw.Draw(img)
        draw.text((50, 50), info_text, fill=(255, 255, 0))
        
        pages.append(img)
    
    return pages

def create_chip_fast(draw, center_x, center_y, chip_size, layer_idx, noise_level):
    """개별 칩 생성 (빠른 버전)"""
    half_size = chip_size // 2
    
    # 칩 경계 박스
    chip_left = int(center_x - half_size)
    chip_top = int(center_y - half_size)
    chip_right = int(center_x + half_size)
    chip_bottom = int(center_y + half_size)
    
    # 칩 배경색 (약간의 변화)
    chip_brightness = 120 + int(30 * random.random())  # 120~150
    chip_color = (chip_brightness, chip_brightness, chip_brightness)
    
    # 칩 영역 채우기
    draw.rectangle([chip_left, chip_top, chip_right, chip_bottom], fill=chip_color)
    
    # 칩 경계선 (흐릿하게)
    border_brightness = max(0, chip_brightness - 40)
    border_color = (border_brightness, border_brightness, border_brightness)
    draw.rectangle([chip_left, chip_top, chip_right, chip_bottom], 
                   outline=border_color, width=1)
    
    # 칩 내부 패턴 (간단한 격자)
    add_simple_pattern(draw, chip_left, chip_top, chip_right, chip_bottom, layer_idx)
    
    # 랜덤 결함 생성
    add_chip_defects_fast(draw, chip_left, chip_top, chip_right, chip_bottom, noise_level)

def add_simple_pattern(draw, left, top, right, bottom, layer_idx):
    """칩 내부 간단한 패턴 추가"""
    width = right - left
    height = bottom - top
    
    # 레이어별 다른 패턴 밀도
    pattern_prob = 0.3 + 0.2 * (layer_idx % 4) / 3
    
    # 격자 패턴
    line_spacing = 20 + (layer_idx % 3) * 5
    line_color = (80, 80, 80)
    
    # 수직선
    for i in range(line_spacing, width, line_spacing):
        if random.random() < pattern_prob:
            draw.line([left + i, top + 5, left + i, bottom - 5], fill=line_color, width=1)
    
    # 수평선
    for i in range(line_spacing, height, line_spacing):
        if random.random() < pattern_prob:
            draw.line([left + 5, top + i, right - 5, top + i], fill=line_color, width=1)
    
    # 작은 점들
    num_dots = int(width * height / 2000)  # 크기에 비례
    for _ in range(num_dots):
        if random.random() < pattern_prob:
            x = left + random.randint(5, width - 5)
            y = top + random.randint(5, height - 5)
            size = random.randint(1, 3)
            draw.rectangle([x, y, x + size, y + size], fill=(70, 70, 70))

def add_chip_defects_fast(draw, left, top, right, bottom, noise_level):
    """칩 결함 추가 (빠른 버전)"""
    width = right - left
    height = bottom - top
    
    # 결함 수는 노이즈 레벨과 칩 크기에 비례
    base_defects = int((width * height) / 5000)
    num_defects = int(base_defects * noise_level * 10)
    
    for _ in range(num_defects):
        defect_type = random.choice(['void', 'particle', 'crack'])
        x = left + random.randint(5, width - 5)
        y = top + random.randint(5, height - 5)
        
        if defect_type == 'void':
            # 보이드 (어두운 원)
            radius = random.randint(2, 6)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], 
                        fill=(20, 20, 20))
        
        elif defect_type == 'particle':
            # 파티클 (밝은 점)
            radius = random.randint(1, 4)
            brightness = 180 + random.randint(0, 75)
            color = (brightness, brightness, brightness)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], 
                        fill=color)
        
        elif defect_type == 'crack':
            # 크랙 (선형)
            length = random.randint(8, 20)
            angle = random.uniform(0, 2 * math.pi)
            x2 = x + int(length * math.cos(angle))
            y2 = y + int(length * math.sin(angle))
            draw.line([x, y, x2, y2], fill=(40, 40, 40), width=1)

def add_global_noise(img, noise_level):
    """전체 이미지에 노이즈 추가 (빠른 방식)"""
    if noise_level < 0.05:
        return  # 노이즈가 너무 적으면 스킵
    
    # PIL을 사용한 간단한 노이즈 시뮬레이션
    draw = ImageDraw.Draw(img)
    width, height = img.size
    
    # 랜덤 점들 추가
    num_noise_points = int(width * height * noise_level * 0.0001)
    
    for _ in range(num_noise_points):
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        brightness_offset = random.randint(-30, 30)
        
        # 원본 픽셀 색상 가져오기
        try:
            original_color = img.getpixel((x, y))
            new_r = max(0, min(255, original_color[0] + brightness_offset))
            new_g = max(0, min(255, original_color[1] + brightness_offset))
            new_b = max(0, min(255, original_color[2] + brightness_offset))
            
            draw.point([x, y], fill=(new_r, new_g, new_b))
        except:
            continue

def main():
    """메인 함수"""
    print("Generating realistic wafer sample (fast version)...")
    
    pages = create_realistic_wafer_sample()
    
    # 멀티페이지 TIFF 저장
    output_path = "realistic_wafer_sample_fast_1000.tif"
    print(f"Saving {len(pages)} pages to {output_path}...")
    
    pages[0].save(
        output_path,
        save_all=True,
        append_images=pages[1:],
        compression='tiff_lzw'
    )
    
    print(f"Successfully saved: {output_path}")
    print(f"Image size: {pages[0].size}")
    print(f"Total pages: {len(pages)}")
    
    # 샘플 CSV 파일도 생성
    create_sample_csv()

def create_sample_csv():
    """샘플 칩 좌표 CSV 파일 생성"""
    csv_content = "x,y,type\n"
    
    # 20x20 그리드에서 웨이퍼 안에 있는 칩들만 포함
    chip_coords = []
    for row in range(-9, 10):  # -9 to 9 (19x19 grid centered)
        for col in range(-9, 10):
            # 웨이퍼 안에 있는지 확인 (원형)
            dist = math.sqrt(row**2 + col**2)
            if dist <= 8.5:  # 웨이퍼 반지름 내부
                chip_type = random.choice(['good', 'test', 'edge', 'dummy'])
                chip_coords.append(f"{col},{row},{chip_type}")
    
    csv_content += "\n".join(chip_coords)
    
    with open("sample_chip_coordinates.csv", "w") as f:
        f.write(csv_content)
    
    print(f"Sample CSV created: sample_chip_coordinates.csv ({len(chip_coords)} chips)")

if __name__ == "__main__":
    main()