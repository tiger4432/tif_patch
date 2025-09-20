// 독립적인 이미지 처리 클래스 (GeoTIFF만 사용)
import { CONFIG } from "./constants.js";

export class ImageProcessor {
  /**
   * 압축 설정 업데이트
   */
  static updateCompressionSettings(compressionValue) {
    const size = parseInt(compressionValue);
    if (size > 0) {
      console.log(`Compression updated: ${size}x${size} max`);
    }
  }

  /**
   * 페이지 그리기 (직접 구현)
   */
  static drawPage(srcCanvas, targetCanvas, maxSize = CONFIG.MAX_DISPLAY_SIZE) {
    if (!srcCanvas || !targetCanvas) return 1;

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return 1;

    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;
    const scale = Math.min(maxSize / srcW, maxSize / srcH, 1);

    targetCanvas.width = Math.floor(srcW * scale);
    targetCanvas.height = Math.floor(srcH * scale);

    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(srcCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    return scale;
  }

  /**
   * 밝기/대비 조정 (직접 구현)
   */
  static adjustContrast(ctx, alpha = 1.2, beta = 10) {
    if (!ctx) return;

    const canvas = ctx.canvas;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, alpha * data[i] + beta)); // R
      data[i + 1] = Math.min(255, Math.max(0, alpha * data[i + 1] + beta)); // G
      data[i + 2] = Math.min(255, Math.max(0, alpha * data[i + 2] + beta)); // B
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 타겟 평균/표준편차로 정규화 (직접 구현)
   */
  static enhanceToTarget(ctx, targetMean = 0.5, targetStd = 0.2, pad = 10) {
    if (!ctx) return;

    const canvas = ctx.canvas;
    console.log(canvas.height, canvas.width);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const imageDataSampled = ctx.getImageData(
      pad,
      pad,
      canvas.width - 2 * pad,
      canvas.height - 2 * pad
    );
    const data = imageData.data;
    const dataSampled = imageDataSampled.data;

    // 현재 평균과 표준편차 계산
    let sum = 0,
      sumSq = 0,
      count = 0;
    for (let i = 0; i < dataSampled.length; i += 4) {
      const gray =
        (dataSampled[i] + dataSampled[i + 1] + dataSampled[i + 2]) / 3 / 255;
      sum += gray;
      sumSq += gray * gray;
      count++;
    }

    const currentMean = sum / count;
    const currentStd = Math.sqrt(sumSq / count - currentMean * currentMean);

    if (currentStd === 0) return;

    // 정규화 적용
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
      const normalized =
        ((gray - currentMean) / currentStd) * targetStd + targetMean;
      const newVal = Math.min(255, Math.max(0, normalized * 255));

      data[i] = newVal;
      data[i + 1] = newVal;
      data[i + 2] = newVal;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 선택된 압축 설정 크기 가져오기
   */
  static getSelectedCompressionSize() {
    const selectedRadio = document.querySelector(
      'input[name="compression"]:checked'
    );
    if (!selectedRadio) return 4096; // 기본값 4K

    return parseInt(selectedRadio.value); // 2048, 4096, 6144, 8192
  }

  /**
   * Range 서버에서 GeoTIFF fromUrl로 TIFF 파일 로드 (간단화)
   */
  static async loadTiffFromServer(filePath, progressCallback = null) {
    console.log("Loading TIFF from Range server with GeoTIFF:", filePath);

    try {
      // GeoTIFF 사용 가능 확인
      if (typeof window.GeoTIFF === "undefined") {
        throw new Error("GeoTIFF library not loaded");
      }

      // Range 서버 연결 테스트
      console.log("Testing Range server connection:", filePath);
      try {
        const testResponse = await fetch(filePath, { method: "HEAD" });
        if (!testResponse.ok) {
          throw new Error(
            `Range server returned ${testResponse.status}: ${testResponse.statusText}`
          );
        }
        console.log("Range server connection OK");
      } catch (testError) {
        console.error("Range server connection failed:", testError);
        throw new Error(`Range 서버 연결 실패: ${testError.message}`);
      }

      // GeoTIFF로 Range 서버에서 파일 로드
      console.log("Loading TIFF with GeoTIFF.fromUrl...");
      const tiff = await window.GeoTIFF.fromUrl(filePath);
      console.log("GeoTIFF loaded successfully from Range server");

      // 이미지 개수 확인
      const imageCount = await tiff.getImageCount();
      console.log("Image count:", imageCount);

      const pages = [];
      // compression setting에서 선택된 값 사용
      const maxSize = this.getSelectedCompressionSize();
      console.log(`Using compression setting: ${maxSize}px max size`);

      // 순차 처리로 메모리 사용량 최소화
      for (let i = 0; i < imageCount; i++) {
        console.log(`Processing page ${i + 1}/${imageCount}...`);

        // 프로그레스 콜백 호출
        if (progressCallback) {
          progressCallback(
            i + 1,
            imageCount,
            `Processing page ${i + 1}: Loading and compressing...`
          );
        }

        const canvas = await this.loadAndCompressPage(
          tiff,
          i,
          maxSize,
          progressCallback,
          imageCount
        );
        pages.push(canvas);

        // 각 페이지 처리 후 메모리 정리
        if (window.gc) {
          window.gc();
        }
      }

      console.log(`Successfully processed ${pages.length} pages`);
      return pages;
    } catch (error) {
      console.error("GeoTIFF Range server loading failed:", error);

      // AggregateError인 경우 상세 오류 정보 출력
      if (error.name === "AggregateError" && error.errors) {
        console.error("Detailed errors:");
        error.errors.forEach((err, index) => {
          console.error(`  Error ${index + 1}:`, err);
        });
      }

      // 네트워크 관련 오류 체크
      if (error.message && error.message.includes("fetch")) {
        console.error(
          "Network fetch failed. Check if Range server is running on port 8083"
        );
      }

      throw new Error(`Range 서버 TIFF 파일 로드 실패: ${error.message}`);
    }
  }
  /**
   * 페이지 로드 및 압축 (메모리 즉시 해제) - 최적화 버전
   */
  static async loadAndCompressPage(
    tiff,
    pageIndex,
    maxSize,
    progressCallback = null,
    totalCount = 1
  ) {
    try {
      // GeoTIFF 이미지 객체 가져오기
      const image = await tiff.getImage(pageIndex);
      const originalWidth = image.getWidth();
      const originalHeight = image.getHeight();

      // 디버그 로그는 첫 번째 페이지만
      if (pageIndex === 0) {
        console.log(`First page: ${originalWidth}x${originalHeight}`);
      }

      // 압축 비율 계산
      const scale = Math.min(
        1,
        maxSize / Math.max(originalWidth, originalHeight)
      );
      const compressedWidth = Math.round(originalWidth * scale);
      const compressedHeight = Math.round(originalHeight * scale);

      if (pageIndex === 0) {
        console.log(
          `Compressing to: ${compressedWidth}x${compressedHeight} (scale: ${scale.toFixed(
            3
          )})`
        );
      }

      // 래스터 데이터 읽기 (압축된 크기로) - 빠른 리샘플링 사용
      const rasters = await image.readRasters({
        width: compressedWidth,
        height: compressedHeight,
        resampleMethod: "nearest", // bilinear보다 빠름
      });

      // 캔버스 생성
      const canvas = document.createElement("canvas");
      canvas.width = compressedWidth;
      canvas.height = compressedHeight;
      const ctx = canvas.getContext("2d");

      // 이미지 데이터 생성
      const imageData = ctx.createImageData(compressedWidth, compressedHeight);

      // 래스터 데이터를 RGBA로 변환
      const rasterData = rasters[0]; // 첫 번째 밴드 사용
      this.convertRasterToImageData(
        rasterData,
        imageData.data,
        compressedWidth,
        compressedHeight
      );

      // 캔버스에 그리기
      ctx.putImageData(imageData, 0, 0);

      // 원본 이미지 참조 해제 (메모리 절약)
      image.close && image.close();

      // 로그는 처음과 마지막만
      if (pageIndex === 0 || pageIndex === totalCount - 1) {
        console.log(`Page ${pageIndex + 1} processed and compressed`);
      }
      return canvas;
    } catch (error) {
      console.error(`Failed to process page ${pageIndex}:`, error);
      throw error;
    }
  }

  static async loadVirtualCanvasData(canvas) {
    const meta = canvas._virtualMeta;

    if (meta.isLoaded || meta.isLoading) {
      return canvas;
    }

    meta.isLoading = true;
    console.log(`Loading actual data for layer ${meta.layerIndex}...`);

    try {
      // 메모리 사용량 체크
      const memoryBefore = this.getMemoryUsage();
      if (memoryBefore) {
        console.log(
          `Memory before loading layer ${meta.layerIndex}: ${memoryBefore.used}MB`
        );
      }

      // GeoTIFF에서 래스터 데이터 읽기 (타일별로)
      const rasters = await meta.geoImage.readRasters({
        width: Math.min(meta.originalWidth, 2048), // 최대 2K로 제한
        height: Math.min(meta.originalHeight, 2048),
        resampleMethod: "bilinear",
      });

      console.log("Raster data loaded:", rasters.width, "x", rasters.height);

      // 캔버스에 그리기
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(canvas.width, canvas.height);

      // 래스터 데이터를 RGBA로 변환
      const rasterData = rasters[0]; // 첫 번째 밴드 사용
      this.convertRasterToRGBA(
        rasterData,
        imageData.data,
        rasters.width,
        rasters.height,
        canvas.width,
        canvas.height
      );

      ctx.putImageData(imageData, 0, 0);

      meta.isLoaded = true;
      meta.isLoading = false;

      // 메모리 사용량 체크
      const memoryAfter = this.getMemoryUsage();
      if (memoryAfter) {
        console.log(
          `Memory after loading layer ${meta.layerIndex}: ${memoryAfter.used}MB`
        );
      }

      // GeoImage 참조 해제 (메모리 절약)
      delete meta.geoImage;

      console.log(`Layer ${meta.layerIndex} loaded successfully`);
      return canvas;
    } catch (error) {
      console.error(`Failed to load layer ${meta.layerIndex}:`, error);
      meta.isLoading = false;
      throw error;
    }
  }

  /**
   * 래스터 데이터를 ImageData로 직접 변환 (최적화 버전)
   */
  static convertRasterToImageData(rasterData, imageDataArray, width, height) {
    const length = width * height;
    let pixelIndex = 0;

    // 더 빠른 루프와 미리 계산된 값들
    for (let i = 0; i < length; i++) {
      const value = rasterData[i] || 0;
      const normalizedValue = value > 255 ? 255 : value < 0 ? 0 : value;

      // 4개 채널을 한번에 설정
      imageDataArray[pixelIndex++] = normalizedValue; // R
      imageDataArray[pixelIndex++] = normalizedValue; // G
      imageDataArray[pixelIndex++] = normalizedValue; // B
      imageDataArray[pixelIndex++] = 255; // A
    }
  }

  /**
   * 래스터 데이터를 RGBA로 변환 (레거시 호환용)
   */
  static convertRasterToRGBA(rasterData, rgbaData, srcW, srcH, destW, destH) {
    const scaleX = srcW / destW;
    const scaleY = srcH / destH;

    for (let y = 0; y < destH; y++) {
      for (let x = 0; x < destW; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        const srcIdx = srcY * srcW + srcX;
        const destIdx = (y * destW + x) * 4;

        const value = rasterData[srcIdx] || 0;
        const normalizedValue = Math.min(255, Math.max(0, value));

        rgbaData[destIdx] = normalizedValue; // R
        rgbaData[destIdx + 1] = normalizedValue; // G
        rgbaData[destIdx + 2] = normalizedValue; // B
        rgbaData[destIdx + 3] = 255; // A
      }
    }
  }

  /**
   * 레이어 매니저 - 필요시에만 로딩
   */
  static async ensureLayerLoaded(canvas) {
    if (
      canvas._virtualMeta &&
      !canvas._virtualMeta.isLoaded &&
      canvas._loadActualData
    ) {
      console.log(`Lazy loading layer ${canvas._virtualMeta.layerIndex}...`);
      await canvas._loadActualData();
    }
    return canvas;
  }

  /**
   * 메모리 정리 - 사용하지 않는 레이어 언로드
   */
  static unloadUnusedLayers(allPages, currentLayerIndex, keepRadius = 2) {
    allPages.forEach((page, index) => {
      if (page._virtualMeta && page._virtualMeta.isLoaded) {
        const distance = Math.abs(index - currentLayerIndex);
        if (distance > keepRadius) {
          console.log(`Unloading layer ${index} to save memory`);

          // 캔버스 초기화
          const ctx = page.getContext("2d");
          ctx.clearRect(0, 0, page.width, page.height);

          // 메타데이터 리셋
          page._virtualMeta.isLoaded = false;

          // 강제 가비지 컬렉션
          if (window.gc) {
            window.gc();
          }
        }
      }
    });
  }

  /**
   * 메모리 사용량 모니터링
   */
  static getMemoryUsage() {
    if (performance.memory) {
      const memory = performance.memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
      };
    }
    return null;
  }
}
