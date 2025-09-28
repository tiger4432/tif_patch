// 파일 저장 관리 모듈
export class FileSaveManager {
  constructor(app, progressManager) {
    this.app = app;
    this.progressManager = progressManager;
  }

  /**
   * ZIP 파일로 다운로드
   */
  async downloadZip() {
    if (!this.app.patchManager.allPatchCanvases || !this.app.patchManager.allPatchCanvases.length) {
      alert("먼저 Extract Patches를 실행하세요.");
      return;
    }

    const zip = new JSZip();

    // 메타데이터 추가
    const metadata = this.app.getGridMetadata();
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    // 좌표 정보 추가
    const coordinateInfo = {
      coordinates: this.app.csvRows,
      chipPoints: this.app.chipPoints,
    };
    zip.file("coordinates.json", JSON.stringify(coordinateInfo, null, 2));

    // voids 데이터 추가
    const voidData = this.app.voidManager.exportVoids();
    zip.file("voids.json", JSON.stringify(voidData, null, 2));

    // README 파일 추가
    const readmeContent = this.generateReadmeContent(metadata);
    zip.file("README.txt", readmeContent);

    // 패치 이미지들 구분해서 추가 (void가 있는 것과 없는 것 분리)
    const patchesWithVoids = new Set();
    const patchesWithoutVoids = new Set();

    // void가 있는 패치들 식별
    Object.keys(voidData).forEach((patchLabel) => {
      if (voidData[patchLabel] && voidData[patchLabel].length > 0) {
        patchesWithVoids.add(patchLabel);
      }
    });

    // 모든 패치 분류 및 저장
    this.app.patchManager.allPatchCanvases.forEach((p) => {
      const hasVoids = patchesWithVoids.has(p.label);

      // 1. no_voids 폴더: void가 없는 칩들의 원본 패치
      if (!hasVoids) {
        const folderPath = `no_voids/${p.typeFolder || p.type}/layer_${String(p.layer).padStart(2, "0")}`;
        const folder = zip.folder(folderPath);
        const originalCanvas = p.originalCanvas || p.canvas;
        const dataURL = originalCanvas.toDataURL("image/png").split(",")[1];
        folder.file(`${p.label}.png`, dataURL, { base64: true });
        patchesWithoutVoids.add(p.label);
      }

      // 2. split 폴더: 모든 패치 (void 마킹된 버전 또는 빈 마스크)
      const splitFolderPath = `split/${p.typeFolder || p.type}/layer_${String(p.layer).padStart(2, "0")}`;
      const splitFolder = zip.folder(splitFolderPath);
      const splitDataURL = p.canvas.toDataURL("image/png").split(",")[1];
      splitFolder.file(`${p.label}.png`, splitDataURL, { base64: true });

      if (hasVoids) {
        patchesWithVoids.add(p.label);
      }
    });

    // split 폴더에 merge mask 추가 (모든 칩에 대해, void 없으면 빈 마스크)
    const chipCoords = new Set();
    this.app.patchManager.allPatchCanvases.forEach(p => {
      const coord = p.label.split('_')[0] + '_' + p.label.split('_')[1]; // X-2_Y-8 형태
      chipCoords.add(JSON.stringify({coord, type: p.typeFolder || p.type}));
    });

    const uniqueChipCoords = Array.from(chipCoords).map(item => JSON.parse(item));
    uniqueChipCoords.forEach(({coord, type}) => {
      const voidMaskCanvas = this.app.createVoidMaskCanvas(`(${coord.replace('X', '').replace('Y', ',').replace('_', '')})`, type, true);
      if (voidMaskCanvas) {
        const mergeFolderPath = `merge/${type}`;
        const mergeFolder = zip.folder(mergeFolderPath);
        const mergeDataURL = voidMaskCanvas.toDataURL("image/png").split(",")[1];
        mergeFolder.file(`${coord}_merge.png`, mergeDataURL, { base64: true });
      }
    });

    // summary 폴더: type별 summary 추가
    const summaryMasks = this.app.patchManager.createAllTypeSummaryMasks();
    if (summaryMasks.size > 0) {
      const summaryFolder = zip.folder("summary");
      summaryMasks.forEach((summaryCanvas, chipType) => {
        const sanitizedType = this.sanitizeFileName(chipType);
        const summaryDataURL = summaryCanvas.toDataURL("image/png").split(",")[1];
        summaryFolder.file(`${sanitizedType}_summary.png`, summaryDataURL, { base64: true });
      });
    }

    // ZIP 생성 및 다운로드
    try {
      const content = await zip.generateAsync({ type: "blob" });

      // 파일명 결정
      const userFileName = document.getElementById("zipFileName").value.trim();
      let fileName;
      if (userFileName) {
        fileName = userFileName.endsWith(".zip") ? userFileName : userFileName + ".zip";
      } else {
        fileName = this.app.generateFileName("patches", ".zip");
      }

      // 바로 다운로드 (파일 매니저 없이)
      saveAs(content, fileName);
      console.log(`Downloaded patches ZIP: ${fileName}`);
      console.log("ZIP contents:", {
        patchesWithVoids: patchesWithVoids.size,
        patchesWithoutVoids: patchesWithoutVoids.size,
        totalPatches: this.app.patchManager.allPatchCanvases.length,
        metadata: "included",
        voidData: "included",
        coordinates: this.app.csvRows.length,
      });
    } catch (error) {
      console.error("ZIP generation failed:", error);
      alert("ZIP 파일 생성 중 오류가 발생했습니다.");
    }
  }

  /**
   * 폴더 구조 그대로 저장 (ZIP 없이)
   */
  async downloadAsFolderStructure() {
    if (!this.app.patchManager.allPatchCanvases || !this.app.patchManager.allPatchCanvases.length) {
      alert("먼저 Extract Patches를 실행하세요.");
      return;
    }

    // File System Access API 지원 확인
    if (!('showDirectoryPicker' in window)) {
      alert("이 기능은 최신 브라우저에서만 지원됩니다. (Chrome 86+, Edge 86+)");
      return;
    }

    try {
      // 사용자에게 저장할 루트 디렉토리 선택 요청
      const parentDirectoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });

      // 파일명_시간 형태의 하위폴더 생성
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .substring(0, 19); // YYYY-MM-DD_HH-MM-SS

      const baseFileName = this.app.currentTiffFileName || 'patches';
      const sanitizedBaseFileName = this.sanitizeFileName(baseFileName);
      const folderName = `${sanitizedBaseFileName}_${timestamp}`;

      console.log(`Creating project folder: ${folderName}`);
      const rootDirectoryHandle = await parentDirectoryHandle.getDirectoryHandle(folderName, { create: true });

      // 폴더 저장용 프로그레스바 표시
      this.progressManager.showFolderSaveProgress();
      console.log("Starting folder structure download...");

      // 메타데이터 준비
      const metadata = this.app.getGridMetadata();
      const coordinateInfo = {
        coordinates: this.app.csvRows,
        chipPoints: this.app.chipPoints,
      };
      const voidData = this.app.voidManager.exportVoids();

      // void가 있는 패치와 없는 패치 분류
      const patchesWithVoids = new Set();
      Object.keys(voidData).forEach((patchLabel) => {
        if (voidData[patchLabel] && voidData[patchLabel].length > 0) {
          patchesWithVoids.add(patchLabel);
        }
      });

      // 총 작업 수 계산
      const patches = this.app.patchManager.allPatchCanvases;
      const summaryMasks = this.app.patchManager.createAllTypeSummaryMasks();
      const chipCoords = new Set();
      patches.forEach(p => {
        const coord = p.label.split('_')[0] + '_' + p.label.split('_')[1];
        chipCoords.add(JSON.stringify({coord, type: p.typeFolder || p.type}));
      });
      const uniqueChipCoords = Array.from(chipCoords).map(item => JSON.parse(item));

      const totalItems = 4 + (patches.length * 2) + uniqueChipCoords.length + summaryMasks.size; // metadata + patches + merge + summary
      let processedCount = 0;

      // 메타데이터 파일들 저장
      this.progressManager.updateFolderSaveProgress(processedCount, totalItems, "Saving metadata.json...", "");
      await this.saveFileToDirectory(rootDirectoryHandle, "metadata.json", JSON.stringify(metadata, null, 2));
      processedCount++;

      this.progressManager.updateFolderSaveProgress(processedCount, totalItems, "Saving coordinates.json...", "");
      await this.saveFileToDirectory(rootDirectoryHandle, "coordinates.json", JSON.stringify(coordinateInfo, null, 2));
      processedCount++;

      this.progressManager.updateFolderSaveProgress(processedCount, totalItems, "Saving voids.json...", "");
      await this.saveFileToDirectory(rootDirectoryHandle, "voids.json", JSON.stringify(voidData, null, 2));
      processedCount++;

      // README 파일 생성 및 저장
      this.progressManager.updateFolderSaveProgress(processedCount, totalItems, "Saving README.txt...", "");
      const readmeContent = this.generateReadmeContent(metadata);
      await this.saveFileToDirectory(rootDirectoryHandle, "README.txt", readmeContent);
      processedCount++;

      console.log("Metadata files saved, processing patches...");

      // 패치 파일들을 배치로 병렬 저장
      const BATCH_SIZE = 50; // 동시에 처리할 파일 수

      for (let i = 0; i < patches.length; i += BATCH_SIZE) {
        const batch = patches.slice(i, i + BATCH_SIZE);

        // 배치 내 파일들을 병렬로 저장
        const batchPromises = batch.map(async (p) => {
          const hasVoids = patchesWithVoids.has(p.label);
          const savePromises = [];

          // no_voids 폴더: void가 없는 칩들의 원본 패치
          if (!hasVoids) {
            const folderPath = `no_voids/${p.typeFolder || p.type}/layer_${String(p.layer).padStart(2, "0")}`;
            const originalCanvas = p.originalCanvas || p.canvas;
            savePromises.push(
              this.saveCanvasToPath(rootDirectoryHandle, folderPath, `${p.label}.png`, originalCanvas)
            );
          }

          // split 폴더: 모든 패치 (void 마킹된 버전 또는 빈 마스크)
          const splitFolderPath = `split/${p.typeFolder || p.type}/layer_${String(p.layer).padStart(2, "0")}`;
          savePromises.push(
            this.saveCanvasToPath(rootDirectoryHandle, splitFolderPath, `${p.label}.png`, p.canvas)
          );

          // 해당 패치의 모든 저장 작업 완료 대기
          await Promise.all(savePromises);
          return p;
        });

        // 현재 배치 완료 대기
        await Promise.all(batchPromises);

        processedCount += batch.length * 2; // 각 패치당 2개 파일 (no_voids + split)
        const percentage = Math.round((processedCount / totalItems) * 100);
        this.progressManager.updateFolderSaveProgress(
          processedCount,
          totalItems,
          `Saving patches... (${Math.min(i + BATCH_SIZE, patches.length)}/${patches.length})`,
          `${percentage}% complete`
        );
      }

      // merge 폴더: 각 칩의 merge 마스크 저장 (병렬 처리)
      console.log("Processing merge masks...");

      // merge 마스크도 배치로 병렬 처리
      const MERGE_BATCH_SIZE = 20;
      for (let i = 0; i < uniqueChipCoords.length; i += MERGE_BATCH_SIZE) {
        const mergeBatch = uniqueChipCoords.slice(i, i + MERGE_BATCH_SIZE);

        const mergePromises = mergeBatch.map(async ({coord, type}) => {
          const voidMaskCanvas = this.app.createVoidMaskCanvas(`(${coord.replace('X', '').replace('Y', ',').replace('_', '')})`, type, true);
          if (voidMaskCanvas) {
            const mergeFolderPath = `merge/${type}`;
            await this.saveCanvasToPath(rootDirectoryHandle, mergeFolderPath, `${coord}_merge.png`, voidMaskCanvas);
            return coord;
          }
          return null;
        });

        await Promise.all(mergePromises);
        processedCount += mergeBatch.length;
        const percentage = Math.round((processedCount / totalItems) * 100);
        this.progressManager.updateFolderSaveProgress(
          processedCount,
          totalItems,
          `Saving merge masks... (${Math.min(i + MERGE_BATCH_SIZE, uniqueChipCoords.length)}/${uniqueChipCoords.length})`,
          `${percentage}% complete`
        );
      }

      // summary 폴더: type별 summary 저장
      this.progressManager.updateFolderSaveProgress(processedCount, totalItems, "Creating type summaries...", "");

      if (summaryMasks.size > 0) {
        const summaryPromises = Array.from(summaryMasks.entries()).map(async ([chipType, summaryCanvas]) => {
          const summaryFolderPath = `summary`;
          const sanitizedType = this.sanitizeFileName(chipType);
          await this.saveCanvasToPath(rootDirectoryHandle, summaryFolderPath, `${sanitizedType}_summary.png`, summaryCanvas);
          return chipType;
        });

        await Promise.all(summaryPromises);
        processedCount += summaryMasks.size;
        console.log(`Summary masks saved: ${summaryMasks.size} types`);
      }

      // 완료
      this.progressManager.updateFolderSaveProgress(totalItems, totalItems, "Save completed!", "100% complete");

      // 잠시 후 프로그레스바 숨기기
      setTimeout(() => {
        this.progressManager.hideFolderSaveProgress();
      }, 2000);

      console.log(`Folder structure download completed! ${processedCount} files saved.`);
      alert(`폴더 구조로 저장 완료!\n총 ${processedCount}개 파일이 저장되었습니다.\n\n폴더: ${folderName}`);

    } catch (error) {
      this.progressManager.hideFolderSaveProgress();
      if (error.name === 'AbortError') {
        console.log('User cancelled directory selection');
      } else {
        console.error('Folder structure download error:', error);
        alert(`폴더 저장 중 오류 발생: ${error.message}`);
      }
    }
  }

  /**
   * 파일을 지정된 디렉토리에 저장
   */
  async saveFileToDirectory(directoryHandle, fileName, content) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * 파일/폴더명에서 허용되지 않는 문자 제거
   */
  sanitizeFileName(fileName) {
    // Windows/Mac/Linux에서 허용되지 않는 문자들 제거
    return fileName
      .replace(/[<>:"\/\\|?*\x00-\x1f]/g, '_')  // 특수문자를 '_'로 대체
      .replace(/\.$/, '_')  // 마지막 점 제거
      .replace(/\s+/g, '_')  // 공백을 '_'로 대체
      .substring(0, 255);  // 길이 제한
  }

  /**
   * Canvas를 지정된 경로에 저장 (중첩 폴더 생성 포함)
   */
  async saveCanvasToPath(rootDirectoryHandle, folderPath, fileName, canvas) {
    try {
      // 폴더 경로와 파일명 정리
      const sanitizedFolderPath = folderPath.split('/').map(segment =>
        segment ? this.sanitizeFileName(segment) : segment
      ).join('/');
      const sanitizedFileName = this.sanitizeFileName(fileName);

      // 폴더 경로를 단계별로 생성
      const pathSegments = sanitizedFolderPath.split('/');
      let currentDirHandle = rootDirectoryHandle;

      for (const segment of pathSegments) {
        if (segment) {
          try {
            currentDirHandle = await currentDirHandle.getDirectoryHandle(segment, { create: true });
          } catch (error) {
            console.error(`Failed to create/access directory: ${segment}`, error);
            throw error;
          }
        }
      }

      // Canvas를 Blob으로 변환 (최적화된 압축 설정)
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png', 0.8); // 압축률 조정으로 속도 향상
      });

      // 파일 저장 (정리된 파일명 사용)
      const fileHandle = await currentDirHandle.getFileHandle(sanitizedFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      console.log(`Saved: ${sanitizedFolderPath}/${sanitizedFileName}`);

    } catch (error) {
      console.error(`Failed to save canvas to path ${folderPath}/${fileName}:`, error);
      throw error;
    }
  }

  /**
   * README 내용 생성
   */
  generateReadmeContent(metadata) {
    return `# Wafer Patch Extraction Data

TIFF File: ${metadata.tiffFileName || "Unknown"}
Extraction Date: ${metadata.timestamp}
Version: ${metadata.version}

## Grid Settings
- Columns: ${metadata.gridSettings.cols}
- Rows: ${metadata.gridSettings.rows}
- Cell Width: ${metadata.gridSettings.cellW}px
- Cell Height: ${metadata.gridSettings.cellH}px

## Alignment
- Origin: (${metadata.origin.x}, ${metadata.origin.y})
- Reference Grid: (${metadata.referenceGrid.x}, ${metadata.referenceGrid.y})

## Enhancement Settings
- Alpha (Contrast): ${metadata.enhanceSettings.alpha}
- Beta (Brightness): ${metadata.enhanceSettings.beta}
- Target Mean: ${metadata.enhanceSettings.targetMean}
- Target Std: ${metadata.enhanceSettings.targetStd}
- Padding: ${metadata.enhanceSettings.padPx}px

## Extraction Info
- Total Pages: ${metadata.extractionInfo.totalPages}
- Total Coordinates: ${metadata.extractionInfo.totalCoordinates}
- Total Patches: ${metadata.extractionInfo.totalPatches}
- Patch Size: ${metadata.extractionInfo.patchSize}px

## Folder Structure
- no_voids/[type]/layer_[XX]/[patch_name].png (patches without voids)
- split/[type]/layer_[XX]/[patch_name].png (patches with void markings)
- merge/[type]/[patch_name]_merge.png (merged mask layers)
- summary/[type]_summary.png (type-based void pattern summaries)
- metadata.json: Grid and extraction settings
- coordinates.json: Chip coordinate data
- voids.json: Void detection data
`;
  }

  /**
   * 경로 지정 가능한 고급 저장 함수
   */
  async saveWithDirectoryPicker(content, fileName) {
    try {
      // File System Access API 지원 확인
      if ("showDirectoryPicker" in window) {
        try {
          // 사용자에게 저장할 디렉토리 선택 요청
          const directoryHandle = await window.showDirectoryPicker({
            mode: "readwrite"
          });

          // 파일 핸들 생성
          const fileHandle = await directoryHandle.getFileHandle(fileName, {
            create: true
          });

          // 파일에 쓰기
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();

          console.log(`File saved to selected directory: ${fileName}`);
          alert(`파일이 선택한 폴더에 저장되었습니다: ${fileName}`);
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            console.log("User cancelled directory selection");
            // 사용자가 취소한 경우 기본 저장 방식으로 fallback
          } else {
            console.error("Directory picker error:", error);
          }
        }
      }

      // Fallback: 기본 saveAs 사용 (다운로드 폴더에 저장)
      console.log("Using fallback saveAs method");
      saveAs(content, fileName);

    } catch (error) {
      console.error("Save error:", error);
      // 최종 fallback
      saveAs(content, fileName);
    }
  }
}