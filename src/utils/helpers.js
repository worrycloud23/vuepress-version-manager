import os from "os";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";

/**
 * 展开波浪号为用户主目录
 */
export function expandTilde(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return filePath;
  }

  if (filePath.startsWith("~/") || filePath === "~") {
    return filePath.replace(/^~/, os.homedir());
  }

  return filePath;
}

/**
 * 格式化文件大小
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

/**
 * 创建进度条
 */
export function createProgressBar(total, options = {}) {
  const width = options.width || 40;
  const complete = options.complete || "=";
  const incomplete = options.incomplete || "-";

  return function (current, label = "") {
    const percent = Math.min(Math.floor((current / total) * 100), 100);
    const filledWidth = Math.floor(width * (current / total));
    const emptyWidth = width - filledWidth;

    const bar = complete.repeat(filledWidth) + incomplete.repeat(emptyWidth);

    process.stdout.write(`\r[${bar}] ${percent}% ${label}`);

    if (current >= total) {
      process.stdout.write("\n");
    }
  };
}

/**
 * 检查目录是否为空
 */
export function isDirEmpty(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.length === 0;
  } catch (err) {
    return true; // 如果目录不存在，视为空
  }
}

/**
 * 加载JSON文件，如果不存在则返回默认值
 */
export function loadJSONWithDefault(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readJSONSync(filePath);
    }
  } catch (err) {
    console.error(chalk.red(`无法读取JSON文件 ${filePath}:`, err.message));
  }

  return defaultValue;
}

/**
 * 安全执行函数，捕获异常并输出友好错误
 */
export async function safeExec(fn, errorMsg = "执行操作出错") {
  try {
    return await fn();
  } catch (err) {
    console.error(chalk.red(`${errorMsg}:`, err.message));
    return null;
  }
}

/**
 * 确保SSH密钥有正确权限
 */
export function ensureSshKeyPermissions(keyPath) {
  const expandedPath = expandTilde(keyPath);

  try {
    // 只在类Unix系统上修改权限
    if (process.platform !== "win32") {
      fs.chmodSync(expandedPath, 0o600);
    }
    return true;
  } catch (err) {
    console.warn(chalk.yellow(`无法修改SSH密钥权限: ${err.message}`));
    return false;
  }
}

/**
 * 检查并创建默认目录结构
 */
export function ensureDefaultDirs(rootDir) {
  const dirs = [
    path.join(rootDir, "data"),
    path.join(rootDir, "data/current"),
    path.join(rootDir, "data/versions"),
    path.join(rootDir, "data/logs"),
    path.join(rootDir, "config"),
  ];

  for (const dir of dirs) {
    fs.ensureDirSync(dir);
  }
}
