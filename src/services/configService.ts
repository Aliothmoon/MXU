import type { MxuConfig } from '@/types/config';
import { defaultConfig } from '@/types/config';
import { loggers } from '@/utils/logger';

const log = loggers.config;

/**
 * 生成配置文件名
 * @param projectName 项目名称（来自 interface.json 的 name 字段）
 */
function getConfigFileName(projectName?: string): string {
  if (projectName) {
    return `mxu-${projectName}.json`;
  }
  return 'mxu.json';
}

// 检测是否在 Tauri 环境中
const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

/**
 * 将 HTTP URL 路径转换为文件系统路径
 * 例如: "/test" -> "{resourceDir}/test" (开发模式)
 */
async function resolveFileSystemPath(httpPath: string): Promise<string> {
  if (!isTauri()) {
    return httpPath;
  }

  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const baseDir = await appDataDir();
    log.debug('appDataDir:', baseDir);

    // 空路径或当前目录
    if (httpPath === '' || httpPath === '.') {
      return baseDir;
    }

    // HTTP 路径以 "/" 开头，去掉开头的 "/"
    if (httpPath.startsWith('/')) {
      const relativePath = httpPath.slice(1);
      return `${baseDir}${relativePath}`;
    }

    return `${baseDir}${httpPath}`;
  } catch (err) {
    log.error('获取应用数据目录失败:', err);
    return httpPath;
  }
}

/**
 * 获取配置文件路径
 */
function getConfigPath(basePath: string, projectName?: string): string {
  const fileName = getConfigFileName(projectName);
  if (basePath === '' || basePath === '.') {
    return `./${fileName}`;
  }
  return `${basePath}/${fileName}`;
}

/**
 * 从文件加载配置
 * @param basePath 基础路径
 * @param projectName 项目名称（来自 interface.json 的 name 字段）
 */
export async function loadConfig(basePath: string, projectName?: string): Promise<MxuConfig> {
  if (isTauri()) {
    const fsBasePath = await resolveFileSystemPath(basePath);
    const configPath = getConfigPath(fsBasePath, projectName);
    
    log.debug('加载配置, 路径:', configPath);
    
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    
    if (await exists(configPath)) {
      try {
        const content = await readTextFile(configPath);
        const config = JSON.parse(content) as MxuConfig;
        log.info('配置加载成功');
        return config;
      } catch (err) {
        log.warn('读取配置文件失败，使用默认配置:', err);
        return defaultConfig;
      }
    } else {
      log.info('配置文件不存在，使用默认配置');
    }
  } else {
    // 浏览器环境：尝试从 public 目录加载
    try {
      const fileName = getConfigFileName(projectName);
      const fetchPath = basePath === '' ? `/${fileName}` : `${basePath}/${fileName}`;
      const response = await fetch(fetchPath);
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const config = await response.json() as MxuConfig;
          log.info('配置加载成功（浏览器环境）');
          return config;
        }
      }
    } catch {
      // 浏览器环境加载失败是正常的
    }
  }

  return defaultConfig;
}

/**
 * 保存配置到文件
 * @param basePath 基础路径
 * @param config 配置对象
 * @param projectName 项目名称（来自 interface.json 的 name 字段）
 */
export async function saveConfig(basePath: string, config: MxuConfig, projectName?: string): Promise<boolean> {
  if (!isTauri()) {
    // 浏览器环境不支持保存文件，使用 localStorage 作为后备
    try {
      const storageKey = projectName ? `mxu-config-${projectName}` : 'mxu-config';
      localStorage.setItem(storageKey, JSON.stringify(config));
      log.debug('配置已保存到 localStorage');
      return true;
    } catch {
      return false;
    }
  }

  const fsBasePath = await resolveFileSystemPath(basePath);
  const configPath = getConfigPath(fsBasePath, projectName);
  
  log.debug('保存配置, 路径:', configPath);

  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    
    // 确保目录存在
    if (!await exists(fsBasePath)) {
      log.debug('创建目录:', fsBasePath);
      await mkdir(fsBasePath, { recursive: true });
    }
    
    const content = JSON.stringify(config, null, 2);
    await writeTextFile(configPath, content);
    log.info('配置保存成功');
    return true;
  } catch (err) {
    log.error('保存配置文件失败:', err);
    return false;
  }
}

/**
 * 浏览器环境下从 localStorage 加载配置
 * @param projectName 项目名称（来自 interface.json 的 name 字段）
 */
export function loadConfigFromStorage(projectName?: string): MxuConfig | null {
  if (isTauri()) return null;
  
  try {
    const storageKey = projectName ? `mxu-config-${projectName}` : 'mxu-config';
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored) as MxuConfig;
    }
  } catch {
    // ignore
  }
  return null;
}
