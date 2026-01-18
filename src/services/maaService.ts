// MaaFramework 服务层
// 封装 Tauri 命令调用，提供前端友好的 API

import { invoke } from '@tauri-apps/api/core';
import type {
  AdbDevice,
  Win32Window,
  ControllerConfig,
  ConnectionStatus,
  TaskStatus,
  AgentConfig,
  TaskConfig,
} from '@/types/maa';
import { loggers } from '@/utils/logger';

const log = loggers.maa;

// 检测是否在 Tauri 环境中
const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

/** MaaFramework 服务 */
export const maaService = {
  /**
   * 初始化 MaaFramework
   * @param libDir MaaFramework 库目录（可选，默认从 exe 目录/maafw 加载）
   * @returns 版本号
   */
  async init(libDir?: string): Promise<string> {
    log.info('初始化 MaaFramework, libDir:', libDir || '(默认)');
    const version = await invoke<string>('maa_init', { libDir: libDir || null });
    log.info('MaaFramework 版本:', version);
    return version;
  },

  /**
   * 设置资源目录
   * @param resourceDir 资源目录路径
   */
  async setResourceDir(resourceDir: string): Promise<void> {
    if (!isTauri()) return;
    log.debug('设置资源目录:', resourceDir);
    return await invoke('maa_set_resource_dir', { resourceDir });
  },

  /**
   * 获取 MaaFramework 版本
   */
  async getVersion(): Promise<string> {
    return await invoke<string>('maa_get_version');
  },

  /**
   * 查找 ADB 设备
   */
  async findAdbDevices(): Promise<AdbDevice[]> {
    log.debug('搜索 ADB 设备...');
    const devices = await invoke<AdbDevice[]>('maa_find_adb_devices');
    log.info('找到 ADB 设备:', devices.length, '个');
    return devices;
  },

  /**
   * 查找 Win32 窗口
   * @param classRegex 窗口类名正则表达式（可选）
   * @param windowRegex 窗口标题正则表达式（可选）
   */
  async findWin32Windows(classRegex?: string, windowRegex?: string): Promise<Win32Window[]> {
    log.debug('搜索 Win32 窗口, classRegex:', classRegex, 'windowRegex:', windowRegex);
    const windows = await invoke<Win32Window[]>('maa_find_win32_windows', {
      classRegex: classRegex || null,
      windowRegex: windowRegex || null,
    });
    log.info('找到 Win32 窗口:', windows.length, '个');
    return windows;
  },

  /**
   * 创建实例
   * @param instanceId 实例 ID
   */
  async createInstance(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    log.debug('创建实例:', instanceId);
    return await invoke('maa_create_instance', { instanceId });
  },

  /**
   * 销毁实例
   * @param instanceId 实例 ID
   */
  async destroyInstance(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    log.debug('销毁实例:', instanceId);
    return await invoke('maa_destroy_instance', { instanceId });
  },

  /**
   * 连接控制器
   * @param instanceId 实例 ID
   * @param config 控制器配置
   * @param agentPath MaaAgentBinary 路径（可选）
   */
  async connectController(
    instanceId: string,
    config: ControllerConfig,
    agentPath?: string
  ): Promise<void> {
    log.info('连接控制器, 实例:', instanceId, '类型:', config.type);
    log.debug('控制器配置:', config);
    
    if (!isTauri()) {
      log.warn('非 Tauri 环境，模拟连接延迟');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }
    
    try {
      await invoke('maa_connect_controller', {
        instanceId,
        config,
        agentPath: agentPath || null,
      });
      log.info('控制器连接成功');
    } catch (err) {
      log.error('控制器连接失败:', err);
      throw err;
    }
  },

  /**
   * 获取连接状态
   * @param instanceId 实例 ID
   */
  async getConnectionStatus(instanceId: string): Promise<ConnectionStatus> {
    if (!isTauri()) return 'Disconnected';
    return await invoke<ConnectionStatus>('maa_get_connection_status', { instanceId });
  },

  /**
   * 加载资源
   * @param instanceId 实例 ID
   * @param paths 资源路径列表
   */
  async loadResource(instanceId: string, paths: string[]): Promise<void> {
    log.info('加载资源, 实例:', instanceId, '路径数:', paths.length);
    if (!isTauri()) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return;
    }
    return await invoke('maa_load_resource', { instanceId, paths });
  },

  /**
   * 检查资源是否已加载
   * @param instanceId 实例 ID
   */
  async isResourceLoaded(instanceId: string): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>('maa_is_resource_loaded', { instanceId });
  },

  /**
   * 运行任务
   * @param instanceId 实例 ID
   * @param entry 任务入口
   * @param pipelineOverride Pipeline 覆盖 JSON
   * @returns 任务 ID
   */
  async runTask(instanceId: string, entry: string, pipelineOverride: string = '{}'): Promise<number> {
    log.info('运行任务, 实例:', instanceId, '入口:', entry);
    if (!isTauri()) {
      return Math.floor(Math.random() * 10000);
    }
    return await invoke<number>('maa_run_task', {
      instanceId,
      entry,
      pipelineOverride,
    });
  },

  /**
   * 等待任务完成
   * @param instanceId 实例 ID
   * @param taskId 任务 ID
   */
  async waitTask(instanceId: string, taskId: number): Promise<TaskStatus> {
    log.debug('等待任务完成, taskId:', taskId);
    if (!isTauri()) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return 'Succeeded';
    }
    const status = await invoke<TaskStatus>('maa_wait_task', { instanceId, taskId });
    log.info('任务完成, taskId:', taskId, '状态:', status);
    return status;
  },

  /**
   * 获取任务状态
   * @param instanceId 实例 ID
   * @param taskId 任务 ID
   */
  async getTaskStatus(instanceId: string, taskId: number): Promise<TaskStatus> {
    if (!isTauri()) return 'Pending';
    return await invoke<TaskStatus>('maa_get_task_status', { instanceId, taskId });
  },

  /**
   * 停止任务
   * @param instanceId 实例 ID
   */
  async stopTask(instanceId: string): Promise<void> {
    log.info('停止任务, 实例:', instanceId);
    if (!isTauri()) return;
    return await invoke('maa_stop_task', { instanceId });
  },

  /**
   * 检查是否正在运行
   * @param instanceId 实例 ID
   */
  async isRunning(instanceId: string): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>('maa_is_running', { instanceId });
  },

  /**
   * 发起截图请求
   * @param instanceId 实例 ID
   * @returns 截图请求 ID
   */
  async postScreencap(instanceId: string): Promise<number> {
    if (!isTauri()) return -1;
    return await invoke<number>('maa_post_screencap', { instanceId });
  },

  /**
   * 等待截图完成
   * @param instanceId 实例 ID
   * @param screencapId 截图请求 ID
   */
  async screencapWait(instanceId: string, screencapId: number): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>('maa_screencap_wait', { instanceId, screencapId });
  },

  /**
   * 获取缓存的截图
   * @param instanceId 实例 ID
   * @returns base64 编码的图像 data URL
   */
  async getCachedImage(instanceId: string): Promise<string> {
    if (!isTauri()) return '';
    return await invoke<string>('maa_get_cached_image', { instanceId });
  },

  /**
   * 启动任务（支持 Agent）
   * @param instanceId 实例 ID
   * @param tasks 任务列表
   * @param agentConfig Agent 配置（可选）
   * @param cwd 工作目录（Agent 子进程的 CWD）
   * @returns 任务 ID 列表
   */
  async startTasks(
    instanceId: string,
    tasks: TaskConfig[],
    agentConfig?: AgentConfig,
    cwd?: string
  ): Promise<number[]> {
    log.info('启动任务, 实例:', instanceId, '任务数:', tasks.length);
    if (!isTauri()) {
      return tasks.map((_, i) => i + 1);
    }
    return await invoke<number[]>('maa_start_tasks', {
      instanceId,
      tasks,
      agentConfig: agentConfig || null,
      cwd: cwd || '.',
    });
  },

  /**
   * 停止 Agent 并断开连接
   * @param instanceId 实例 ID
   */
  async stopAgent(instanceId: string): Promise<void> {
    log.info('停止 Agent, 实例:', instanceId);
    if (!isTauri()) return;
    return await invoke('maa_stop_agent', { instanceId });
  },
};

export default maaService;
