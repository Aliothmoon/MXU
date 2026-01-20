import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/stores/appStore';
import type { ScreenshotFrameRate } from '@/types/config';

interface FrameRateSelectorProps {
  /** 紧凑模式：用于中控台底部工具栏 */
  compact?: boolean;
  /** 额外的 className */
  className?: string;
}

// 帧率选项配置
const FRAME_RATE_OPTIONS: { value: ScreenshotFrameRate; labelKey: string }[] = [
  { value: 'unlimited', labelKey: 'screenshot.frameRate.unlimited' },
  { value: '5', labelKey: 'screenshot.frameRate.fps5' },
  { value: '1', labelKey: 'screenshot.frameRate.fps1' },
  { value: '0.2', labelKey: 'screenshot.frameRate.every5s' },
  { value: '0.033', labelKey: 'screenshot.frameRate.every30s' },
];

/** 根据帧率设置计算帧间隔（毫秒） */
export function getFrameInterval(frameRate: ScreenshotFrameRate): number {
  switch (frameRate) {
    case 'unlimited':
      return 0; // 尽可能快
    case '5':
      return 200; // 每秒 5 帧
    case '1':
      return 1000; // 每秒 1 帧
    case '0.2':
      return 5000; // 5 秒一帧
    case '0.033':
      return 30000; // 30 秒一帧
    default:
      return 200;
  }
}

export function FrameRateSelector({ compact = false, className }: FrameRateSelectorProps) {
  const { t } = useTranslation();
  const { screenshotFrameRate, setScreenshotFrameRate } = useAppStore();

  if (compact) {
    // 紧凑模式：仅下拉框，用于中控台
    return (
      <div className={clsx('flex items-center gap-2', className)}>
        <Camera className="w-4 h-4 text-text-secondary" />
        <select
          value={screenshotFrameRate}
          onChange={(e) => setScreenshotFrameRate(e.target.value as ScreenshotFrameRate)}
          className="px-2 py-1 text-sm bg-bg-tertiary border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {FRAME_RATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // 完整模式：带标题和图标，用于设置页面
  return (
    <div className={clsx('bg-bg-secondary rounded-xl p-4 border border-border', className)}>
      <div className="flex items-center gap-3 mb-3">
        <Camera className="w-5 h-5 text-accent" />
        <div>
          <span className="font-medium text-text-primary">{t('screenshot.frameRate.title')}</span>
          <p className="text-xs text-text-muted mt-0.5">{t('screenshot.frameRate.hint')}</p>
        </div>
      </div>
      <select
        value={screenshotFrameRate}
        onChange={(e) => setScreenshotFrameRate(e.target.value as ScreenshotFrameRate)}
        className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        {FRAME_RATE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
