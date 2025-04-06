import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const LOG_LEVELS = {
  debug: 0,
  verbose: 1,
  info: 2,
  warn: 3,
  error: 4,
  success: 2,
};

let logConfig = {
  level: "info",
  dir: path.join(ROOT_DIR, "data/logs"),
};

const loggers = {};

/**
 * 设置日志配置
 */
export function setupLogger(config) {
  if (config) {
    logConfig = {
      ...logConfig,
      ...config,
    };
  }

  fs.ensureDirSync(logConfig.dir);

  return getLogger("main");
}

/**
 * 获取指定名称的日志器
 */
export function getLogger(name) {
  if (loggers[name]) {
    return loggers[name];
  }

  const logFile = path.join(logConfig.dir, `${name}.log`);

  const logger = {
    debug: (...args) => log("debug", name, ...args),
    verbose: (...args) => log("verbose", name, ...args),
    info: (...args) => log("info", name, ...args),
    warn: (...args) => log("warn", name, ...args),
    error: (...args) => log("error", name, ...args),
    success: (...args) => log("success", name, ...args),
  };

  // 记录日志
  function log(level, loggerName, ...args) {
    if (LOG_LEVELS[level] < LOG_LEVELS[logConfig.level]) {
      return; // 低于配置的级别，不记录
    }

    const time = moment().format("YYYY-MM-DD HH:mm:ss");

    // 格式化消息
    const message = args
      .map((arg) => {
        if (typeof arg === "object") {
          return JSON.stringify(arg);
        }
        return String(arg);
      })
      .join(" ");

    // 控制台输出
    let consoleMethod = "log";
    let colorMethod = (text) => text;

    switch (level) {
      case "debug":
        consoleMethod = "debug";
        colorMethod = chalk.gray;
        break;
      case "verbose":
        consoleMethod = "log";
        colorMethod = chalk.blue;
        break;
      case "info":
        consoleMethod = "info";
        colorMethod = chalk.white;
        break;
      case "warn":
        consoleMethod = "warn";
        colorMethod = chalk.yellow;
        break;
      case "error":
        consoleMethod = "error";
        colorMethod = chalk.red;
        break;
      case "success":
        consoleMethod = "info";
        colorMethod = chalk.green;
        break;
    }

    const logPrefix = `[${time}][${level.toUpperCase()}][${loggerName}]`;
    console[consoleMethod](colorMethod(`${logPrefix} ${message}`));

    const logEntry = `${logPrefix} ${message}\n`;
    fs.appendFileSync(logFile, logEntry);
  }

  loggers[name] = logger;
  return logger;
}
