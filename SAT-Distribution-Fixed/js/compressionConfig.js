// 압축 설정 전용 모듈
export class CompressionConfig {
  static config = {
    profiles: {
      fast: { maxSize: 2048, quality: 'low' },
      balanced: { maxSize: 4096, quality: 'medium' },
      quality: { maxSize: 6144, quality: 'high' },
      virtual: { maxSize: 2048, quality: 'virtual' }
    },
    
    fileSizeThresholds: {
      small: 50 * 1024 * 1024,      // 50MB
      medium: 1000 * 1024 * 1024,   // 1GB
      large: 5000 * 1024 * 1024     // 5GB
    }
  };

  static updateProfile(profileName, settings) {
    if (this.config.profiles[profileName]) {
      Object.assign(this.config.profiles[profileName], settings);
      console.log(`Updated ${profileName} profile:`, settings);
    }
  }

  static getProfileForFileSize(fileSizeBytes) {
    const { small, medium, large } = this.config.fileSizeThresholds;
    
    if (fileSizeBytes > large) return 'virtual';
    if (fileSizeBytes > medium) return 'quality';
    if (fileSizeBytes > small) return 'balanced';
    return 'fast';
  }

  static getMaxSize(profileName) {
    return this.config.profiles[profileName]?.maxSize || 2048;
  }
}