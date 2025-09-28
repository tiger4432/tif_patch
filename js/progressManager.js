// 프로그레스바 관리 모듈
export class ProgressManager {
  constructor() {
    this.progressBar = document.getElementById("progressBar");
    this.progressText = document.getElementById("progressText");
    this.progressDetails = document.getElementById("progressDetails");
    this.progressContainer = document.getElementById("progressContainer");
  }

  /**
   * TIFF 로딩용 프로그레스바 표시
   */
  showProgress() {
    this.progressContainer.style.display = "block";
    this.updateProgress(0, "Initializing TIFF loading...", "");
  }

  /**
   * 프로그레스바 숨김
   */
  hideProgress() {
    this.progressContainer.style.display = "none";
  }

  /**
   * 폴더 저장용 프로그레스바 표시
   */
  showFolderSaveProgress() {
    this.progressContainer.style.display = "block";
    this.updateFolderSaveProgress(0, 100, "Initializing folder save...", "");
  }

  /**
   * 폴더 저장용 프로그레스바 숨김
   */
  hideFolderSaveProgress() {
    this.progressContainer.style.display = "none";
  }

  /**
   * 폴더 저장 진행률 업데이트
   */
  updateFolderSaveProgress(current, total, text = "", details = "") {
    const percentage = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

    this.progressBar.style.width = `${percentage}%`;
    this.progressText.textContent = text || `Saving files... (${current}/${total})`;
    this.progressDetails.textContent = details || `${percentage.toFixed(1)}% complete`;
  }

  /**
   * TIFF 로딩 진행률 업데이트
   */
  updateProgress(percentage, text = "", details = "") {
    this.progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    this.progressText.textContent = text;
    this.progressDetails.textContent = details;
  }

  /**
   * 성공 메시지와 함께 완료 상태 표시
   */
  showSuccess(message, duration = 2000) {
    this.updateProgress(100, "✅ " + message, "Complete");
    setTimeout(() => {
      this.hideProgress();
    }, duration);
  }

  /**
   * 에러 메시지와 함께 실패 상태 표시
   */
  showError(message, duration = 3000) {
    this.progressBar.style.backgroundColor = "#dc3545";
    this.updateProgress(100, "❌ " + message, "Error");
    setTimeout(() => {
      this.hideProgress();
      this.progressBar.style.backgroundColor = "#007bff"; // 원래 색상으로 복원
    }, duration);
  }

  /**
   * 일시정지/대기 상태 표시
   */
  showWaiting(message) {
    this.progressBar.style.backgroundColor = "#ffc107";
    this.updateProgress(50, "⏳ " + message, "Waiting...");
  }
}