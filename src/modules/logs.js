import fs from "fs-extra";
import path from "path";
import terminalKit from "terminal-kit";
import chalk from "chalk";
import boxen from "boxen";
const term = terminalKit.terminal;

// 定义日志文件所在目录（根据实际情况调整）
const LOG_DIR = path.join(process.cwd(), "/data/logs");

// 日志文件映射：显示名称 => 实际文件名
const logFileMap = {
  "系统日志 (main.log)": "main.log",
  "构建日志 (builder.log)": "builder.log",
  "部署日志 (deployer.log)": "deployer.log",
  "版本管理日志 (version.log)": "version.log",
  "预览日志 (preview.log)": "preview.log",
};

/**
 * 显示错误信息并等待用户按键后返回
 * @param {string} errorMsg 错误信息
 */
async function showErrorAndPause(errorMsg) {
  term.clear();
  const errorBox = boxen(chalk.red.bold(errorMsg), {
    padding: 1,
    borderColor: "red",
    borderStyle: "double",
  });
  term(errorBox + "\n");
  term.green("按任意键返回主菜单...\n");
  term.grabInput(true);
  await new Promise((resolve) =>
    term.once("key", () => {
      term.grabInput(false);
      resolve();
    })
  );
}

/**
 * 分页展示日志文件内容
 * 支持翻页浏览：按 DOWN 或 n 翻下一页，按 UP 或 p 翻上一页，
 * 按 q 或 ESCAPE 退出浏览并返回调用者。
 * @param {string} content 日志文件的文本内容
 * @returns {Promise<void>} 用户退出后 resolve
 */
async function displayLogContent(content) {
  term.clear();
  const lines = content.split(/\r?\n/);
  // 根据终端高度计算可显示的行数，保留底部提示行
  const pageSize = Math.max(process.stdout.rows - 2, 10);
  let currentPage = 0;
  const totalPages = Math.ceil(lines.length / pageSize);

  function renderPage() {
    term.clear();
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, lines.length);
    for (let i = start; i < end; i++) {
      term(lines[i] + "\n");
    }
    term.green(
      `\n第 ${
        currentPage + 1
      }/${totalPages} 页 - 使用 ↑/p、↓/n 翻页，按 q 或 ESC 返回`
    );
  }

  return new Promise((resolve) => {
    function keyListener(key) {
      if (key === "q" || key === "ESCAPE") {
        term.removeListener("key", keyListener);
        term.grabInput(false);
        resolve();
      } else if (key === "DOWN" || key === "n") {
        if (currentPage < totalPages - 1) {
          currentPage++;
          renderPage();
        }
      } else if (key === "UP" || key === "p") {
        if (currentPage > 0) {
          currentPage--;
          renderPage();
        }
      }
    }
    renderPage();
    term.grabInput(true);
    term.on("key", keyListener);
  });
}

/**
 * 日志浏览功能：
 * 1. 使用 terminal-kit 的 singleColumnMenu 显示日志文件列表；
 * 2. 根据用户选择，从日志目录读取对应文件内容；
 * 3. 调用 displayLogContent() 实现分页浏览，用户退出后返回主菜单。
 */
export async function viewLogs() {
  term("\n");
  term.yellow("请选择要查看的日志文件:\n");

  // 获取日志文件显示名称列表
  const logFiles = Object.keys(logFileMap);

  // 使用 singleColumnMenu 让用户选择
  const selectedIndex = await new Promise((resolve) => {
    term.singleColumnMenu(logFiles, (error, response) => {
      resolve(response.selectedIndex);
    });
  });

  term.clear();
  const selectedLogName = logFiles[selectedIndex];
  term.cyan(`正在查看: ${selectedLogName}\n\n`);

  // 构造日志文件完整路径
  const fileName = logFileMap[selectedLogName];
  const logFilePath = path.join(LOG_DIR, fileName);

  // 检查文件是否存在
  if (!fs.existsSync(logFilePath)) {
    await showErrorAndPause("错误：日志文件不存在！" + logFilePath);
    return;
  }

  // 读取日志文件内容
  let content;
  try {
    content = fs.readFileSync(logFilePath, "utf8");
  } catch (err) {
    await showErrorAndPause(`读取日志文件失败: ${err.message}`);
    return;
  }

  // 分页展示日志内容，等待用户按退出键后返回
  await displayLogContent(content);
  term.clear();
}
