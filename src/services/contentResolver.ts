/**
 * 内容解析服务
 * 根据 ProjectInterface V2 协议，处理以下类型的内容：
 * 1. 国际化文本（以 $ 开头）
 * 2. 文件路径（相对路径）
 * 3. URL（http:// 或 https://）
 * 4. 直接文本
 */

import { invoke } from '@tauri-apps/api/core';
import { loggers } from '@/utils/logger';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const log = loggers.app;

// 检测是否在 Tauri 环境中
const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

/**
 * 判断内容是否为 URL
 */
function isUrl(content: string): boolean {
  return content.startsWith('http://') || content.startsWith('https://');
}

/**
 * 判断内容是否为文件路径（简单判断：包含文件扩展名或以 ./ 开头）
 */
function isFilePath(content: string): boolean {
  if (isUrl(content)) return false;
  // 检查是否以 ./ 或 ../ 开头，或者包含常见文件扩展名
  return (
    content.startsWith('./') ||
    content.startsWith('../') ||
    /\.(md|txt|json|html)$/i.test(content)
  );
}

/**
 * 规范化文件路径（移除 ./ 前缀）
 */
function normalizeFilePath(filePath: string): string {
  if (filePath.startsWith('./')) {
    return filePath.slice(2);
  }
  return filePath;
}

/**
 * 从文件路径加载文本内容
 */
async function loadFromFile(filePath: string, basePath: string): Promise<string> {
  const normalizedPath = normalizeFilePath(filePath);
  
  if (isTauri()) {
    // Tauri 环境：使用 Rust 命令读取 exe 同目录的文件
    return await invoke<string>('read_local_file', { filename: normalizedPath });
  } else {
    // 浏览器环境：使用 HTTP 请求
    const fullPath = basePath ? `${basePath}/${normalizedPath}` : `/${normalizedPath}`;
    const response = await fetch(fullPath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  }
}

/**
 * 从 URL 加载内容
 */
async function loadFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

/**
 * 读取本地文本文件（供外部使用）
 */
export async function readLocalTextFile(filename: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('read_local_file', { filename });
  } else {
    const response = await fetch(`/${filename}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  }
}

/**
 * 读取本地二进制文件并返回 base64（供外部使用）
 */
export async function readLocalFileBase64(filename: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('read_local_file_base64', { filename });
  } else {
    // 浏览器环境：通过 fetch 获取并转换为 base64
    const response = await fetch(`/${filename}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 移除 data URL 前缀，只返回 base64 部分
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * 检查本地文件是否存在
 */
export async function localFileExists(filename: string): Promise<boolean> {
  if (isTauri()) {
    return await invoke<boolean>('local_file_exists', { filename });
  } else {
    try {
      const response = await fetch(`/${filename}`, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export interface ResolveOptions {
  /** 翻译映射表 */
  translations?: Record<string, string>;
  /** 资源基础路径 */
  basePath?: string;
  /** 是否加载外部内容（文件/URL），默认 true */
  loadExternal?: boolean;
}

/**
 * 解析国际化文本
 * 如果文本以 $ 开头，则从翻译表中查找对应的值
 */
export function resolveI18nText(
  text: string | undefined,
  translations?: Record<string, string>
): string {
  if (!text) return '';
  if (!text.startsWith('$')) return text;
  
  const key = text.slice(1);
  return translations?.[key] || key;
}

/**
 * 解析内容（同步版本，仅处理国际化）
 * 用于不需要加载外部内容的场景
 */
export function resolveContentSync(
  content: string | undefined,
  options: ResolveOptions = {}
): string {
  if (!content) return '';
  
  // 先处理国际化
  const resolved = resolveI18nText(content, options.translations);
  
  return resolved;
}

/**
 * 解析内容（异步版本，完整处理）
 * 支持国际化、文件路径、URL
 */
export async function resolveContent(
  content: string | undefined,
  options: ResolveOptions = {}
): Promise<string> {
  if (!content) return '';
  
  const { translations, basePath = '.', loadExternal = true } = options;
  
  // 先处理国际化
  let resolved = resolveI18nText(content, translations);
  
  if (!loadExternal) return resolved;
  
  try {
    // 检查是否为 URL
    if (isUrl(resolved)) {
      resolved = await loadFromUrl(resolved);
    }
    // 检查是否为文件路径
    else if (isFilePath(resolved)) {
      resolved = await loadFromFile(resolved, basePath);
    }
  } catch (err) {
    log.warn(`加载内容失败 [${resolved}]:`, err);
    // 加载失败时返回原始文本
  }
  
  return resolved;
}

/**
 * 解析图标路径（同步版本，仅返回路径）
 * 用于非 Tauri 环境或作为 key
 */
export function resolveIconPath(
  iconPath: string | undefined,
  basePath: string,
  translations?: Record<string, string>
): string | undefined {
  if (!iconPath) return undefined;
  
  // 先处理国际化
  let resolved = resolveI18nText(iconPath, translations);
  
  if (!resolved) return undefined;
  
  // 如果是 URL 直接返回
  if (isUrl(resolved)) return resolved;
  
  // 规范化路径
  resolved = normalizeFilePath(resolved);
  
  // 浏览器环境：构建 HTTP 路径
  if (!isTauri()) {
    if (!resolved.startsWith('/')) {
      resolved = basePath ? `${basePath}/${resolved}` : `/${resolved}`;
    }
  }
  
  return resolved;
}

/**
 * 拼接路径（处理空 basePath 的情况）
 */
function joinPath(basePath: string, relativePath: string): string {
  if (!basePath) return relativePath;
  return `${basePath}/${relativePath}`;
}

/**
 * 加载图标为 data URL（异步版本）
 * 在 Tauri 环境下读取本地文件并转换为 base64 data URL
 * 
 * @param iconPath 图标路径（相对于 interface.json 所在目录）
 * @param basePath interface.json 所在目录
 * @param translations 翻译表
 */
export async function loadIconAsDataUrl(
  iconPath: string | undefined,
  basePath: string = '',
  translations?: Record<string, string>
): Promise<string | undefined> {
  if (!iconPath) return undefined;
  
  // 先处理国际化
  let resolved = resolveI18nText(iconPath, translations);
  
  if (!resolved) return undefined;
  
  // 如果是 URL 直接返回
  if (isUrl(resolved)) return resolved;
  
  // 规范化路径并拼接 basePath
  resolved = normalizeFilePath(resolved);
  const fullPath = joinPath(basePath, resolved);
  
  try {
    if (isTauri()) {
      // Tauri 环境：读取文件并转换为 base64 data URL
      const base64 = await readLocalFileBase64(fullPath);
      const ext = resolved.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = getMimeType(ext);
      return `data:${mimeType};base64,${base64}`;
    } else {
      // 浏览器环境：直接返回 HTTP 路径
      return `/${fullPath}`;
    }
  } catch (err) {
    log.warn(`加载图标失败 [${fullPath}]:`, err);
    return undefined;
  }
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 配置 marked，使用 use() API 添加 Tailwind 样式
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const styles: Record<number, string> = {
        1: 'text-xl font-bold mt-4 mb-2',
        2: 'text-lg font-semibold mt-4 mb-2',
        3: 'text-base font-semibold mt-3 mb-1',
        4: 'text-sm font-semibold mt-2 mb-1',
        5: 'text-sm font-medium mt-2 mb-1',
        6: 'text-xs font-medium mt-2 mb-1',
      };
      return `<h${depth} class="${styles[depth] || ''}">${text}</h${depth}>`;
    },

    paragraph({ tokens }) {
      const text = this.parser.parseInline(tokens);
      return `<p class="my-1">${text}</p>`;
    },

    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">${text}</a>`;
    },

    code({ text, lang }) {
      const escapedCode = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langClass = lang ? ` language-${lang}` : '';
      return `<pre class="bg-bg-tertiary rounded p-2 my-2 overflow-x-auto text-sm"><code class="${langClass}">${escapedCode}</code></pre>`;
    },

    codespan({ text }) {
      return `<code class="bg-bg-tertiary px-1 rounded text-sm">${text}</code>`;
    },

    list(token) {
      const body = token.items.map(item => this.listitem(item)).join('');
      const tag = token.ordered ? 'ol' : 'ul';
      const listClass = token.ordered ? 'list-decimal' : 'list-disc';
      return `<${tag} class="${listClass} list-inside my-1">${body}</${tag}>`;
    },

    listitem(item) {
      let text = this.parser.parse(item.tokens);
      if (item.task) {
        const checkbox = `<input type="checkbox" disabled ${item.checked ? 'checked' : ''} class="mr-1" />`;
        text = checkbox + text;
      }
      return `<li>${text}</li>`;
    },

    blockquote({ tokens }) {
      const text = this.parser.parse(tokens);
      return `<blockquote class="border-l-4 border-border pl-4 my-2 text-text-secondary italic">${text}</blockquote>`;
    },

    hr() {
      return '<hr class="my-4 border-border" />';
    },

    table(token) {
      const headerCells = token.header.map((cell, i) => 
        this.tablecell({ ...cell, align: token.align[i] })
      ).join('');
      const header = `<tr class="border-b border-border">${headerCells}</tr>`;

      const bodyRows = token.rows.map(row => {
        const cells = row.map((cell, i) => 
          this.tablecell({ ...cell, align: token.align[i] })
        ).join('');
        return `<tr class="border-b border-border">${cells}</tr>`;
      }).join('');

      return `<table class="w-full my-2 border-collapse"><thead>${header}</thead><tbody>${bodyRows}</tbody></table>`;
    },

    tablecell(token) {
      const text = this.parser.parseInline(token.tokens);
      const tag = token.header ? 'th' : 'td';
      const alignClass = token.align ? ` text-${token.align}` : '';
      const baseClass = token.header ? 'font-semibold' : '';
      return `<${tag} class="px-2 py-1${alignClass} ${baseClass}">${text}</${tag}>`;
    },

    strong({ tokens }) {
      return `<strong>${this.parser.parseInline(tokens)}</strong>`;
    },

    em({ tokens }) {
      return `<em>${this.parser.parseInline(tokens)}</em>`;
    },

    del({ tokens }) {
      return `<del>${this.parser.parseInline(tokens)}</del>`;
    },

    image({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${href}" alt="${text}"${titleAttr} class="max-w-full my-2 rounded" />`;
    },
  },
});

/**
 * 将 Markdown 转换为安全的 HTML
 * 使用 marked 解析 markdown，使用 DOMPurify 清理 HTML 防止 XSS
 */
export function markdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target', 'rel'],
  });
}

/**
 * @deprecated 请使用 markdownToHtml
 */
export const simpleMarkdownToHtml = markdownToHtml;
