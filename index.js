import inquirer from "inquirer";
import chalk from "chalk";
import figlet from "figlet";
import dotenv from "dotenv";
import boxen from "boxen";
import { createSpinner } from "nanospinner";
import gradient from "gradient-string";
import { Command } from "commander";
import terminalKit from "terminal-kit";
const term = terminalKit.terminal;

import { setupConfig, loadConfig } from "./src/modules/config.js";
import { createVersion, versionMenu } from "./src/modules/version.js";
import { buildBlog } from "./src/modules/builder.js";
import { deployBlog } from "./src/modules/deployer.js";
import { startPreview } from "./src/modules/preview.js";
import { setupLogger } from "./src/utils/logger.js";
import { viewLogs } from "./src/modules/logs.js"; // 假设日志功能单独拆分了

dotenv.config();

const logger = setupLogger();
let config = null;

// 常量定义
const APP_NAME = "VuePress Manager";
const APP_VERSION = "1.1.0";
const BOX_CONFIG = {
  padding: 1,
  margin: 1,
  borderStyle: "round",
  borderColor: "cyan",
  backgroundColor: "#222222",
};

// ===== 辅助函数 =====

/**
 * 渲染渐变标题
 */
function renderTitle() {
  const title = figlet.textSync(APP_NAME, { horizontalLayout: "full" });
  return gradient.pastel.multiline(title);
}

/**
 * 清屏但保留历史，移动光标至屏幕顶部
 */
function softClear() {
  term.clear();
  term.moveTo(1, 1);
}

/**
 * 显示状态信息，依照不同类型着色
 */
function showStatus(message, type = "info") {
  const colors = {
    info: "blue",
    success: "green",
    error: "red",
    warning: "yellow",
  };
  term.saveCursor();
  term.moveTo(1, term.height);
  term.eraseLine();
  term(chalk[colors[type]](message));
  term.restoreCursor();
}

/**
 * 包装异步操作，带有 loading 动画，失败时统一处理
 */
async function withSpinner(message, fn) {
  const spinner = createSpinner(message).start();
  try {
    const result = await fn();
    spinner.success();
    return result;
  } catch (error) {
    spinner.error({ text: `${message} 失败: ${error.message}` });
    throw error;
  }
}

/**
 * 暂停等待：提示用户按回车返回
 */
async function waitForPause(promptMessage = "\n按回车键返回主菜单...") {
  await inquirer.prompt([
    {
      type: "input",
      name: "pause",
      message: chalk.dim(promptMessage),
      default: "",
    },
  ]);
}

/**
 * 显示错误信息并等待用户确认返回
 */
async function showErrorAndPause(error) {
  logger.error("主流程操作执行失败:", error);
  const errorBox = boxen(
    chalk.red.bold("\n❌ 主操作执行失败!") +
      "\n\n" +
      error.message +
      "\n\n" +
      chalk.yellow("请检查日志获取详细信息。"),
    { padding: 1, borderColor: "red", borderStyle: "double" }
  );
  term.clear();
  term(errorBox + "\n");
  await waitForPause();
}

// ===== CLI 参数处理 =====

async function processCommandLineOptions() {
  const program = new Command();
  program
    .version(APP_VERSION)
    .option("-b, --build", "直接构建博客")
    .option("-d, --deploy", "直接部署博客")
    .option("-p, --publish", "执行完整发布流程")
    .parse(process.argv);

  const options = program.opts();
  if (Object.keys(options).length > 0) {
    config = await loadConfig();
    if (options.build) {
      await buildBlog(config, true);
      process.exit(0);
    } else if (options.deploy) {
      await deployBlog(config);
      process.exit(0);
    } else if (options.publish) {
      await publishWorkflow();
      process.exit(0);
    }
  }
  return options;
}

/**
 * 确保配置加载成功
 */
async function ensureConfig() {
  if (!config) {
    config = await loadConfig();
  }
  return config;
}

// ===== 各操作处理函数 =====

async function handleSetup() {
  term.clear();
  term(chalk.blue("--- 配置系统 ---\n"));
  config = await withSpinner("正在配置系统...", () => setupConfig());
  showStatus("✅ 配置完成。", "success");
}

async function handleVersioning() {
  term.clear();
  await versionMenu(config);
}

async function handleBuild() {
  term.clear();
  term(chalk.blue("--- 构建博客 ---\n"));
  await withSpinner("正在构建博客...", () => buildBlog(config, true));
  showStatus("✅ 构建完成。", "success");
}

async function handlePreview() {
  term.clear();
  term(chalk.blue("--- 预览博客 ---\n"));
  await startPreview(config);
  term(chalk.yellow("预览服务器已启动 (按 CTRL+C 停止)。\n"));
}

async function handleDeploy() {
  term.clear();
  term(chalk.blue("--- 部署博客 ---\n"));
  await withSpinner("正在部署博客...", () => deployBlog(config));
  showStatus("✅ 部署完成。", "success");
}

async function handlePublish() {
  term.clear();
  term(chalk.blue("--- 完整发布流程 ---\n"));
  await publishWorkflow();
  showStatus("✅ 发布流程执行完毕。", "success");
}

async function handleLogs() {
  term.clear();
  term(chalk.blue("--- 查看日志 ---\n"));
  await viewLogs();
}

// ===== 完整发布流程 =====

async function publishWorkflow() {
  try {
    const cfg = await ensureConfig();
    term(chalk.blue("🔖 版本控制\n"));
    const { versionMessage } = await inquirer.prompt([
      {
        type: "input",
        name: "versionMessage",
        message: "输入此版本的描述:",
        default: "更新博客内容",
      },
    ]);
    await withSpinner("正在创建版本备份...", () =>
      createVersion(versionMessage, cfg)
    );
    term(chalk.blue("\n🔨 构建阶段\n"));
    await withSpinner("正在构建博客...", () => buildBlog(cfg, true));

    const { shouldPreview } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldPreview",
        message: "是否在部署前预览?",
        default: true,
      },
    ]);

    if (shouldPreview) {
      term(chalk.blue("\n👁️ 预览阶段\n"));
      await startPreview(cfg);
      const { confirmDeploy } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmDeploy",
          message: "确认部署到服务器?",
          default: true,
        },
      ]);
      if (!confirmDeploy) {
        showStatus("已取消部署", "warning");
        return;
      }
    }

    term(chalk.blue("\n🚀 部署阶段\n"));
    await withSpinner("正在部署博客...", () => deployBlog(cfg));
    const successBox = boxen(chalk.green.bold("✅ 博客发布成功!"), {
      padding: 1,
      borderColor: "green",
      borderStyle: "round",
    });
    term("\n" + successBox + "\n");
  } catch (error) {
    throw error;
  }
}

// ===== 主菜单渲染与循环 =====

/**
 * 渲染主菜单界面
 */
async function renderMainMenu() {
  softClear();
  term(renderTitle() + "\n");
  term(chalk.yellow(`博客管理和部署系统 v${APP_VERSION}\n\n`));
  const menuBox = boxen(chalk.cyan.bold("=== 主菜单 ==="), {
    padding: 1,
    borderColor: "cyan",
    borderStyle: "round",
  });
  term(menuBox + "\n\n");
}

/**
 * 主菜单循环，根据用户选择调用不同处理函数
 */
async function mainMenu() {
  await processCommandLineOptions();

  let keepRunning = true;
  while (keepRunning) {
    await renderMainMenu();
    const choices = [
      { name: "🔧 配置系统", value: "setup" },
      { name: "🗄️ 版本管理 (创建/查看/恢复)", value: "versioning" },
      { name: "🔨 构建博客", value: "build" },
      { name: "👁️ 预览博客", value: "preview" },
      { name: "🚀 部署博客", value: "deploy" },
      { name: "✨ 完整发布流程 (备份->构建->部署)", value: "publish" },
      { name: "📊 查看日志", value: "logs" },
      new inquirer.Separator(),
      { name: "❌ 退出", value: "exit" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "选择要执行的操作:",
        choices,
        pageSize: 10,
      },
    ]);

    try {
      // 非配置、退出和日志操作需要先确保配置加载
      if (["setup", "exit", "logs"].indexOf(action) === -1) {
        config = await ensureConfig();
        if (!config) {
          showStatus("操作无法进行，因为配置无效或未加载。", "error");
          await waitForPause();
          continue;
        }
      }

      switch (action) {
        case "setup":
          await handleSetup();
          break;
        case "versioning":
          await handleVersioning();
          break;
        case "build":
          await handleBuild();
          break;
        case "preview":
          await handlePreview();
          break;
        case "deploy":
          await handleDeploy();
          break;
        case "publish":
          await handlePublish();
          break;
        case "logs":
          await handleLogs();
          break;
        case "exit":
          keepRunning = false;
          term.clear();
          term(gradient.rainbow("\n谢谢使用 VuePress Manager，再见！\n"));
          break;
      }
      if (
        keepRunning &&
        action !== "versioning" &&
        action !== "preview" &&
        action !== "logs"
      ) {
        await waitForPause();
      }
    } catch (error) {
      await showErrorAndPause(error);
    }
  }
}

// ===== 启动程序 =====

mainMenu().catch((err) => {
  term.clear();
  const fatalBox = boxen(
    chalk.red.bold("\n\n应用程序发生严重错误，即将退出:") +
      "\n\n" +
      err.message,
    {
      padding: 1,
      borderColor: "red",
      borderStyle: "double",
      backgroundColor: "#330000",
    }
  );
  term(fatalBox + "\n");
  logger.error("应用程序顶层错误:", err);
  process.exit(1);
});
