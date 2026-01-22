/**
 * MAA 回调日志监听 hook
 * 监听 maa-callback 事件并将相关信息添加到日志面板
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { maaService, type MaaCallbackDetails } from '@/services/maaService';
import { useAppStore, type LogType } from '@/stores/appStore';
import { loggers } from '@/utils/logger';

const log = loggers.app;

// Focus 消息的占位符替换
function replaceFocusPlaceholders(
  template: string,
  details: MaaCallbackDetails & Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = details[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match;
  });
}

// 检查是否是连接动作
function isConnectAction(details: MaaCallbackDetails): boolean {
  return details.action === 'Connect' || details.action === 'connect';
}

// 从当前实例配置推断控制器类型和名称（用于解决回调时序问题）
function inferCtrlInfoFromInstance(instanceId: string): {
  type: 'device' | 'window' | undefined;
  name: string | undefined;
} {
  const state = useAppStore.getState();
  const instance = state.instances.find((i) => i.id === instanceId);
  const savedDevice = instance?.savedDevice;
  const controllerName = state.selectedController[instanceId];

  if (!controllerName) return { type: undefined, name: undefined };

  const controller = state.projectInterface?.controller?.find((c) => c.name === controllerName);
  if (!controller) return { type: undefined, name: undefined };

  // 根据控制器类型确定类型和名称
  if (controller.type === 'Win32' || controller.type === 'Gamepad') {
    return { type: 'window', name: savedDevice?.windowName };
  } else if (controller.type === 'Adb') {
    return { type: 'device', name: savedDevice?.adbDeviceName };
  } else if (controller.type === 'PlayCover') {
    return { type: 'device', name: savedDevice?.playcoverAddress };
  }
  return { type: 'device', name: undefined };
}

export function useMaaCallbackLogger() {
  const { t } = useTranslation();
  const { addLog } = useAppStore();
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 设置回调监听
    const setupListener = async () => {
      try {
        const unlisten = await maaService.onCallback((message, details) => {
          // 组件已卸载则忽略
          if (cancelled) return;

          // 获取当前活动实例 ID
          const currentActiveId = useAppStore.getState().activeInstanceId;
          if (!currentActiveId) return;

          // 根据消息类型处理
          handleCallback(
            currentActiveId,
            message,
            details as MaaCallbackDetails & Record<string, unknown>,
            t,
            addLog,
          );
        });

        // 如果在等待期间组件已卸载，立即取消监听
        if (cancelled) {
          unlisten();
        } else {
          unlistenRef.current = unlisten;
        }
      } catch (err) {
        log.error('Failed to setup maa callback listener:', err);
      }
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [t, addLog]);
}

function handleCallback(
  instanceId: string,
  message: string,
  details: MaaCallbackDetails & Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
  addLog: (instanceId: string, log: { type: LogType; message: string }) => void,
) {
  // 获取 ID 名称映射函数
  const { getCtrlName, getCtrlType, getResName, getTaskName, getTaskNameByEntry } =
    useAppStore.getState();

  // 首先检查是否有 focus 字段，有则优先处理 focus 消息
  const focus = details.focus as Record<string, string> | undefined;
  if (focus && focus[message]) {
    const focusTemplate = focus[message];
    const focusMessage = replaceFocusPlaceholders(focusTemplate, details);
    addLog(instanceId, { type: 'focus', message: focusMessage });
    return;
  }

  // 处理各种消息类型
  switch (message) {
    // ==================== 控制器连接消息 ====================
    case 'Controller.Action.Starting':
      if (isConnectAction(details)) {
        // 优先从注册信息获取，未注册时从实例配置推断（解决回调时序问题）
        const registeredName =
          details.ctrl_id !== undefined ? getCtrlName(details.ctrl_id) : undefined;
        const registeredType =
          details.ctrl_id !== undefined ? getCtrlType(details.ctrl_id) : undefined;
        const inferred = inferCtrlInfoFromInstance(instanceId);
        const deviceName = registeredName || inferred.name || '';
        const ctrlType = registeredType || inferred.type;
        const targetText =
          ctrlType === 'window' ? t('logs.messages.targetWindow') : t('logs.messages.targetDevice');
        addLog(instanceId, {
          type: 'info',
          message: `${t('logs.messages.connecting', { target: targetText })} ${deviceName}`,
        });
      }
      break;

    case 'Controller.Action.Succeeded':
      if (isConnectAction(details)) {
        const registeredName =
          details.ctrl_id !== undefined ? getCtrlName(details.ctrl_id) : undefined;
        const registeredType =
          details.ctrl_id !== undefined ? getCtrlType(details.ctrl_id) : undefined;
        const inferred = inferCtrlInfoFromInstance(instanceId);
        const deviceName = registeredName || inferred.name || '';
        const ctrlType = registeredType || inferred.type;
        const targetText =
          ctrlType === 'window' ? t('logs.messages.targetWindow') : t('logs.messages.targetDevice');
        addLog(instanceId, {
          type: 'success',
          message: `${t('logs.messages.connected', { target: targetText })} ${deviceName}`,
        });
      }
      break;

    case 'Controller.Action.Failed':
      if (isConnectAction(details)) {
        const registeredName =
          details.ctrl_id !== undefined ? getCtrlName(details.ctrl_id) : undefined;
        const registeredType =
          details.ctrl_id !== undefined ? getCtrlType(details.ctrl_id) : undefined;
        const inferred = inferCtrlInfoFromInstance(instanceId);
        const deviceName = registeredName || inferred.name || '';
        const ctrlType = registeredType || inferred.type;
        const targetText =
          ctrlType === 'window' ? t('logs.messages.targetWindow') : t('logs.messages.targetDevice');
        addLog(instanceId, {
          type: 'error',
          message: `${t('logs.messages.connectFailed', { target: targetText })} ${deviceName}`,
        });
      }
      break;

    // ==================== 资源加载消息 ====================
    case 'Resource.Loading.Starting': {
      const resourceName = details.res_id !== undefined ? getResName(details.res_id) : undefined;
      addLog(instanceId, {
        type: 'info',
        message: t('logs.messages.loadingResource', {
          name: resourceName || details.path || '',
        }),
      });
      break;
    }

    case 'Resource.Loading.Succeeded': {
      const resourceName = details.res_id !== undefined ? getResName(details.res_id) : undefined;
      addLog(instanceId, {
        type: 'success',
        message: t('logs.messages.resourceLoaded', { name: resourceName || details.path || '' }),
      });
      break;
    }

    case 'Resource.Loading.Failed': {
      const resourceName = details.res_id !== undefined ? getResName(details.res_id) : undefined;
      addLog(instanceId, {
        type: 'error',
        message: t('logs.messages.resourceFailed', { name: resourceName || details.path || '' }),
      });
      break;
    }

    // ==================== 任务消息 ====================
    case 'Tasker.Task.Starting': {
      // 特殊处理内部停止任务
      if (details.entry === 'MaaTaskerPostStop') {
        addLog(instanceId, {
          type: 'info',
          message: t('logs.messages.taskStarting', { name: t('logs.messages.stopTask') }),
        });
        break;
      }
      // 优先用 task_id 查找，如果没有则用 entry 查找（解决时序问题）
      let taskName = details.task_id !== undefined ? getTaskName(details.task_id) : undefined;
      if (!taskName && details.entry) {
        taskName = getTaskNameByEntry(details.entry);
      }
      addLog(instanceId, {
        type: 'info',
        message: t('logs.messages.taskStarting', {
          name: taskName || details.entry || '',
        }),
      });
      break;
    }

    case 'Tasker.Task.Succeeded': {
      // 特殊处理内部停止任务
      if (details.entry === 'MaaTaskerPostStop') {
        addLog(instanceId, {
          type: 'success',
          message: t('logs.messages.taskSucceeded', { name: t('logs.messages.stopTask') }),
        });
        break;
      }
      let taskName = details.task_id !== undefined ? getTaskName(details.task_id) : undefined;
      if (!taskName && details.entry) {
        taskName = getTaskNameByEntry(details.entry);
      }
      addLog(instanceId, {
        type: 'success',
        message: t('logs.messages.taskSucceeded', {
          name: taskName || details.entry || '',
        }),
      });
      break;
    }

    case 'Tasker.Task.Failed': {
      // 特殊处理内部停止任务
      if (details.entry === 'MaaTaskerPostStop') {
        addLog(instanceId, {
          type: 'error',
          message: t('logs.messages.taskFailed', { name: t('logs.messages.stopTask') }),
        });
        break;
      }
      let taskName = details.task_id !== undefined ? getTaskName(details.task_id) : undefined;
      if (!taskName && details.entry) {
        taskName = getTaskNameByEntry(details.entry);
      }
      addLog(instanceId, {
        type: 'error',
        message: t('logs.messages.taskFailed', {
          name: taskName || details.entry || '',
        }),
      });
      break;
    }

    // ==================== 节点消息（仅在有 focus 时显示，否则忽略）====================
    // 这些消息只有在 focus 配置时才显示，上面已经处理过了
    case 'Node.Recognition.Starting':
    case 'Node.Recognition.Succeeded':
    case 'Node.Recognition.Failed':
    case 'Node.Action.Starting':
    case 'Node.Action.Succeeded':
    case 'Node.Action.Failed':
    case 'Node.PipelineNode.Starting':
    case 'Node.PipelineNode.Succeeded':
    case 'Node.PipelineNode.Failed':
    case 'Node.NextList.Starting':
    case 'Node.NextList.Succeeded':
    case 'Node.NextList.Failed':
      // 没有 focus 配置时不显示这些消息
      break;

    default:
      // 未知消息类型，可以选择记录到控制台
      // log.debug('Unknown maa callback:', message, details);
      break;
  }
}

/**
 * 监听 Agent 输出事件
 */
export function useMaaAgentLogger() {
  const { addLog } = useAppStore();
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    const setupListener = async () => {
      try {
        // 监听 agent 输出事件
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<{ instance_id: string; stream: string; line: string }>(
          'maa-agent-output',
          (event) => {
            // 组件已卸载则忽略
            if (cancelled) return;

            const { instance_id, line } = event.payload;
            // 使用 agent 类型显示输出
            addLog(instance_id, {
              type: 'agent',
              message: line,
            });
          },
        );

        // 如果在等待期间组件已卸载，立即取消监听
        if (cancelled) {
          unlisten();
        } else {
          unlistenRef.current = unlisten;
        }
      } catch (err) {
        log.warn('Failed to setup agent output listener:', err);
      }
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [addLog]);
}
