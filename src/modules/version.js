import fs from "fs-extra";
import path from "path";
import moment from "moment";
import archiver from "archiver";
import inquirer from "inquirer";
import chalk from "chalk";
import figlet from "figlet";
import extract from "extract-zip";
import terminalKit from "terminal-kit";
const term = terminalKit.terminal;
import { getLogger } from "../utils/logger.js";
import { minimatch } from "minimatch";
import { createSpinner } from "nanospinner";
import boxen from "boxen";
import gradient from "gradient-string";

const logger = getLogger("version");
const CANCEL_ACTION = -1; // 用户取消操作

// =================== 核心工具函数 ===================

function ensureVersionDirectory(versionsDir) {
  if (!fs.existsSync(versionsDir)) {
    logger.info(`创建版本目录: ${versionsDir}`);
    fs.ensureDirSync(versionsDir);
  }
}

function getIgnorePatterns() {
  return [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/.temp/**",
    "**/*.log",
    "**/.DS_Store",
    "**/.cache/**",
    "**/coverage/**",
    "**/versions/**", // 避免备份时包含其他备份
  ];
}

function shouldIgnore(filePath, sourcePath, ignorePatterns) {
  const relativePath = path.relative(sourcePath, filePath).replace(/\\/g, "/");
  return ignorePatterns.some((pattern) =>
    minimatch(relativePath, pattern, { dot: true })
  );
}

function calculateTotalSize(dirPath, sourcePath, ignorePatterns) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (shouldIgnore(fullPath, sourcePath, ignorePatterns)) continue;
      if (entry.isDirectory()) {
        size += calculateTotalSize(fullPath, sourcePath, ignorePatterns);
      } else if (entry.isFile()) {
        try {
          size += fs.statSync(fullPath).size;
        } catch (statErr) {
          logger.warn(`无法获取文件状态 ${fullPath}: ${statErr.message}`);
        }
      }
    }
  } catch (readDirErr) {
    logger.warn(`无法读取目录 ${dirPath}: ${readDirErr.message}`);
  }
  return size;
}

function renderProgressBar(percent, processedBytes, totalBytes) {
  const progressBarWidth = 30;
  const filledWidth = Math.round((percent / 100) * progressBarWidth);
  const emptyWidth = progressBarWidth - filledWidth;
  const progressBar =
    "[" + "=".repeat(filledWidth) + " ".repeat(emptyWidth) + "]";
  return chalk.blue(
    `压缩进度: ${progressBar} ${percent}% (${(
      processedBytes /
      (1024 * 1024)
    ).toFixed(2)}/${(totalBytes / (1024 * 1024)).toFixed(2)} MB)\r`
  );
}

// 检查是否收到中断请求，若是，则抛出异常
function checkCancellation(config) {
  if (config.abortSignal?.aborted) {
    throw new Error("操作已中断");
  }
}

// =================== 版本配置读写处理 ===================

const VersionStore = {
  read(versionsDir) {
    const versionsFile = path.join(versionsDir, "versions.json");
    if (!fs.existsSync(versionsFile)) {
      return [];
    }
    try {
      const versionsData = fs.readFileSync(versionsFile);
      const versions = JSON.parse(versionsData);
      return Array.isArray(versions) ? versions : [];
    } catch (error) {
      logger.error("读取或解析版本文件失败:", error);
      console.error(chalk.red("❌ 读取版本文件失败:"), error.message);
      return [];
    }
  },

  save(versionsDir, versions) {
    const versionsFile = path.join(versionsDir, "versions.json");
    try {
      fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));
      logger.info(`版本信息已更新到: ${versionsFile}`);
      return true;
    } catch (writeErr) {
      logger.error("写入 versions.json 失败:", writeErr);
      throw new Error(`无法写入版本文件: ${writeErr.message}`);
    }
  },

  addVersion(versionsDir, versionInfo, maxVersions) {
    const versions = this.read(versionsDir);
    versions.push(versionInfo);
    if (versions.length > maxVersions) {
      const versionsToRemove = versions.length - maxVersions;
      const removedVersions = versions.splice(0, versionsToRemove);
      removedVersions.forEach((oldVersion) => {
        if (oldVersion.file && fs.existsSync(oldVersion.file)) {
          try {
            fs.unlinkSync(oldVersion.file);
            logger.info(`已删除旧版本文件: ${oldVersion.file}`);
          } catch (unlinkErr) {
            logger.warn(
              `删除旧版本文件失败 ${oldVersion.file}: ${unlinkErr.message}`
            );
          }
        } else {
          logger.warn(`旧版本文件未找到或未记录: ${oldVersion.name}`);
        }
      });
    }
    this.save(versionsDir, versions);
    return versions;
  },
};

// =================== 归档处理封装 ===================

// 归档处理独立成函数，使主逻辑更为简洁，同时在归档过程中周期性检查中断请求
function performArchiving({
  sourcePath,
  ignorePatterns,
  totalBytes,
  versionPath,
  spinner,
  config,
}) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(versionPath);
    const archive = archiver("zip", {
      zlib: { level: 6 },
      highWaterMark: 1024 * 1024 * 2,
    });

    let processedBytes = 0;
    let lastLogTime = 0;
    const LOG_INTERVAL = 500;

    archive.on("progress", (progressData) => {
      try {
        checkCancellation(config);
      } catch (cancelErr) {
        spinner.error({ text: cancelErr.message });
        archive.abort();
        return reject(cancelErr);
      }
      processedBytes = progressData.fs.processedBytes;
      const now = Date.now();
      if (
        totalBytes > 0 &&
        (now - lastLogTime >= LOG_INTERVAL || processedBytes === totalBytes)
      ) {
        const percent = Math.min(
          100,
          Math.round((processedBytes / totalBytes) * 100)
        );
        spinner.update({
          text: `压缩中... ${percent}% (${(
            processedBytes /
            (1024 * 1024)
          ).toFixed(2)}/${(totalBytes / (1024 * 1024)).toFixed(2)}MB)`,
        });
        lastLogTime = now;
      }
    });

    output.on("close", () => {
      resolve(archive.pointer());
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        logger.warn(`压缩警告 - 文件不存在: ${err.message}`);
      } else {
        spinner.error({ text: `压缩警告: ${err.message}` });
        reject(err);
      }
    });

    archive.on("error", (err) => {
      spinner.error({ text: `压缩错误: ${err.message}` });
      logger.error("压缩过程中发生错误:", err);
      reject(err);
    });

    archive.pipe(output);
    archive.glob("**/*", {
      cwd: sourcePath,
      dot: true,
      ignore: ignorePatterns,
      statConcurrency: 10,
    });

    archive.finalize().catch((finalizeErr) => {
      spinner.error({ text: `完成压缩时出错: ${finalizeErr.message}` });
      logger.error("完成压缩时出错:", finalizeErr);
      reject(finalizeErr);
    });
  });
}

// =================== 版本管理核心功能 ===================

/**
 * 创建版本
 * @param {string} message 版本描述
 * @param {Object} config 配置对象（可在 config 中传入 abortSignal 用于中断操作）
 * @returns {Promise<string>} 版本文件路径
 */
export async function createVersion(message, config) {
  const spinner = createSpinner("准备创建版本...").start();

  try {
    // 初步检测中断请求
    checkCancellation(config);
    const timestamp = moment().format("YYYY-MM-DD-HH-mm-ss");
    const versionName = `version-${timestamp}`;
    const versionPath = path.join(
      config.versioning.versionsDir,
      versionName + ".zip"
    );
    logger.info(`创建版本: ${versionName}`);
    logger.info(`备注: ${message}`);

    ensureVersionDirectory(config.versioning.versionsDir);
    spinner.update({ text: "正在计算文件大小..." });
    const ignorePatterns = getIgnorePatterns();
    const sourcePath = config.vuepress.sourcePath;
    const totalBytes = calculateTotalSize(
      sourcePath,
      sourcePath,
      ignorePatterns
    );

    if (totalBytes <= 0) {
      spinner.error({ text: "计算的总大小为0，所有文件都被忽略或目录为空" });
      throw new Error("没有可备份的文件");
    }

    spinner.update({
      text: `开始压缩 ${(totalBytes / (1024 * 1024)).toFixed(2)}MB 数据...`,
    });

    // 归档处理
    const finalSize = await performArchiving({
      sourcePath,
      ignorePatterns,
      totalBytes,
      versionPath,
      spinner,
      config,
    });
    const finalSizeMB = (finalSize / (1024 * 1024)).toFixed(2);

    // 更新版本信息
    const versionInfo = {
      name: versionName,
      timestamp: new Date().toISOString(),
      message: message,
      size: finalSize,
      file: versionPath,
    };

    VersionStore.addVersion(
      config.versioning.versionsDir,
      versionInfo,
      config.versioning.maxVersions
    );
    spinner.success({ text: `版本创建成功! 大小: ${finalSizeMB}MB` });
    return versionPath;
  } catch (error) {
    spinner.error({ text: `版本创建失败: ${error.message}` });
    throw error;
  }
}

export async function listVersions(config) {
  return VersionStore.read(config.versioning.versionsDir);
}

async function performRestore(selectedVersion, config) {
  const spinner = createSpinner(
    `开始恢复版本 ${selectedVersion.name}...`
  ).start();
  const sourcePath = config.vuepress.sourcePath;
  const nodeModulesPath = path.join(sourcePath, "node_modules");
  const gitPath = path.join(sourcePath, ".git");
  const tempDir = path.join(
    path.dirname(sourcePath),
    `temp_restore_${Date.now()}`
  );
  let tempNodeModulesPath = null;
  let tempGitPath = null;

  try {
    fs.ensureDirSync(tempDir);
    if (fs.existsSync(nodeModulesPath)) {
      spinner.update({ text: "暂时移动 node_modules 目录..." });
      tempNodeModulesPath = path.join(tempDir, "node_modules");
      await fs.move(nodeModulesPath, tempNodeModulesPath, { overwrite: true });
    }
    if (fs.existsSync(gitPath)) {
      spinner.update({ text: "暂时移动 .git 目录..." });
      tempGitPath = path.join(tempDir, ".git");
      await fs.move(gitPath, tempGitPath, { overwrite: true });
    }
    spinner.update({ text: `清空目标目录: ${sourcePath}` });
    await fs.emptyDir(sourcePath);
    spinner.update({ text: `正在解压版本文件...` });
    await extract(selectedVersion.file, { dir: path.resolve(sourcePath) });
    if (tempNodeModulesPath) {
      spinner.update({ text: "正在还原 node_modules 目录..." });
      await fs.move(tempNodeModulesPath, nodeModulesPath, { overwrite: true });
    }
    if (tempGitPath) {
      spinner.update({ text: "正在还原 .git 目录..." });
      await fs.move(tempGitPath, gitPath, { overwrite: true });
    }
    spinner.success({ text: `版本 ${selectedVersion.name} 恢复成功!` });
    logger.success(`版本 ${selectedVersion.name} 恢复成功!`);
  } catch (err) {
    spinner.error({ text: `恢复失败: ${err.message}` });
    logger.error("版本恢复过程中发生错误:", err);
    logger.warn("尝试回滚恢复操作...");
    const rollbackSpinner = createSpinner("正在尝试回滚操作...").start();
    try {
      if (
        tempNodeModulesPath &&
        fs.existsSync(tempNodeModulesPath) &&
        !fs.existsSync(nodeModulesPath)
      ) {
        await fs.move(tempNodeModulesPath, nodeModulesPath, {
          overwrite: true,
        });
      }
      if (
        tempGitPath &&
        fs.existsSync(tempGitPath) &&
        !fs.existsSync(gitPath)
      ) {
        await fs.move(tempGitPath, gitPath, { overwrite: true });
      }
      rollbackSpinner.success({ text: "回滚操作完成" });
    } catch (rollbackErr) {
      rollbackSpinner.error({ text: `回滚失败: ${rollbackErr.message}` });
      logger.error("回滚移动操作失败:", rollbackErr);
    }
    throw err;
  } finally {
    if (fs.existsSync(tempDir)) {
      try {
        logger.info(`清理临时目录: ${tempDir}`);
        await fs.remove(tempDir);
      } catch (cleanupErr) {
        logger.warn("清理临时目录失败:", cleanupErr.message);
      }
    }
  }
}

export async function restoreVersion(config) {
  const spinner = createSpinner("加载版本列表...").start();
  try {
    const versions = await listVersions(config);
    spinner.success({ text: `找到 ${versions.length} 个版本` });
    if (versions.length === 0) {
      console.log(chalk.yellow("没有可用的版本进行恢复。"));
      logger.warn("尝试恢复版本，但没有找到版本记录。");
      return;
    }
    const choices = versions.map((v, i) => ({
      name: `${i + 1}. ${v.name} (${moment(v.timestamp).format(
        "YYYY-MM-DD HH:mm"
      )}) - ${v.message}`,
      value: i,
    }));
    choices.push(new inquirer.Separator());
    choices.push({ name: "🔙 返回上级菜单", value: CANCEL_ACTION });
    const { versionIndex } = await inquirer.prompt([
      {
        type: "list",
        name: "versionIndex",
        message: "选择要恢复的版本 (或返回):",
        choices: choices,
        pageSize: 15,
      },
    ]);
    if (versionIndex === CANCEL_ACTION) {
      console.log(chalk.yellow("已取消恢复操作。"));
      logger.info("用户取消了版本恢复操作。");
      return;
    }
    const selectedVersion = versions[versionIndex];
    logger.info(`用户选择恢复版本: ${selectedVersion.name}`);
    const warningBox = boxen(
      chalk.red.bold("⚠️ 警告") +
        "\n\n" +
        chalk.white(
          `恢复版本 "${selectedVersion.name}" 将覆盖当前 '${config.vuepress.sourcePath}' 目录的所有内容！`
        ) +
        "\n" +
        chalk.yellow("此操作不可撤销。"),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
        backgroundColor: "#330000",
      }
    );
    console.log(warningBox);
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: chalk.red("是否确认恢复此版本?"),
        default: false,
      },
    ]);
    if (!confirm) {
      logger.info("用户最终取消了恢复操作。");
      console.log(chalk.yellow("已取消恢复操作。"));
      return;
    }
    const { backup } = await inquirer.prompt([
      {
        type: "confirm",
        name: "backup",
        message: "在恢复前，是否备份当前目录的内容?",
        default: true,
      },
    ]);
    if (backup) {
      const { message } = await inquirer.prompt([
        {
          type: "input",
          name: "message",
          message: "请输入当前内容备份的描述:",
          default: `恢复版本 ${selectedVersion.name} 前的自动备份`,
        },
      ]);
      try {
        const backupSpinner = createSpinner("正在备份当前内容...").start();
        await createVersion(message, config);
        backupSpinner.success({ text: "当前内容备份完成" });
      } catch (backupErr) {
        logger.error("自动备份失败:", backupErr);
        console.error(chalk.red("❌ 自动备份失败!"), backupErr.message);
        const { continueWithoutBackup } = await inquirer.prompt([
          {
            type: "confirm",
            name: "continueWithoutBackup",
            message: chalk.yellow(
              "备份失败，是否仍要继续恢复版本 (可能丢失当前更改)?"
            ),
            default: false,
          },
        ]);
        if (!continueWithoutBackup) {
          logger.info("用户因备份失败取消了恢复操作。");
          console.log(chalk.yellow("已取消恢复操作。"));
          return;
        }
        logger.warn("用户选择在备份失败后继续恢复。");
      }
    }
    await performRestore(selectedVersion, config);
    const successBox = boxen(
      chalk.green.bold("✅ 版本恢复成功!") +
        "\n\n" +
        chalk.white(
          `版本 "${selectedVersion.name}" 已恢复到 ${config.vuepress.sourcePath}`
        ),
      { padding: 1, margin: 1, borderStyle: "round", borderColor: "green" }
    );
    console.log(successBox);
  } catch (error) {
    logger.error("版本恢复失败:", error);
    console.error(chalk.red.bold("❌ 版本恢复失败!"), error.message);
    throw error;
  }
}

// =================== 版本菜单界面 ===================

function showVersionMenuTitle() {
  term.clear();
  console.log(
    gradient.pastel.multiline(
      figlet.textSync("版本管理", { horizontalLayout: "full" })
    )
  );
  console.log(
    boxen(chalk.cyan.bold("VuePress 博客版本控制系统"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
}

async function handleCreateVersion(config) {
  console.log(chalk.blue("--- 创建新版本 ---"));
  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: "请输入版本描述:",
      default: "常规备份",
      validate: (input) => input.trim() !== "" || "版本描述不能为空！",
    },
  ]);
  const trimmedMessage = message.trim();
  const { proceed } = await inquirer.prompt([
    {
      type: "list",
      name: "proceed",
      message: `准备使用描述 "${trimmedMessage}" 创建新版本。\n  是否继续?`,
      choices: [
        { name: "✅ 是，继续创建", value: true },
        { name: "🔙 否，返回菜单", value: false },
      ],
      default: 0,
    },
  ]);
  if (proceed) {
    await createVersion(trimmedMessage, config);
  } else {
    console.log(chalk.yellow("已取消创建操作。"));
    logger.info("用户取消了版本创建操作。");
  }
}

async function handleListVersions(config) {
  console.log(chalk.blue.bold("--- 版本列表 ---"));
  const spinner = createSpinner("加载版本数据...").start();
  try {
    const versions = await listVersions(config);
    spinner.success({ text: `找到 ${versions.length} 个版本` });
    if (versions.length === 0) {
      console.log(chalk.yellow("没有找到任何版本记录。"));
    } else {
      console.log(
        boxen(
          chalk.bold.white(`共有 ${versions.length} 个版本`) +
            "\n" +
            chalk.dim("按时间从旧到新排序"),
          {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "blue",
          }
        )
      );
      versions.forEach((version, index) => {
        const versionDate = moment(version.timestamp).format(
          "YYYY-MM-DD HH:mm:ss"
        );
        const formattedSize = (version.size / (1024 * 1024)).toFixed(2);
        console.log(chalk.blue.bold(`[${index + 1}] ${version.name}`));
        console.log(chalk.white(`  描述: ${version.message}`));
        console.log(chalk.gray(`  创建时间: ${versionDate}`));
        console.log(chalk.gray(`  大小: ${formattedSize} MB`));
        console.log(chalk.gray(`  文件: ${path.basename(version.file)}`));
        console.log("---");
      });
    }
  } catch (error) {
    spinner.error({ text: `加载版本数据失败: ${error.message}` });
    logger.error("列出版本失败:", error);
    console.error(chalk.red("❌ 列出版本失败!"), error.message);
  }
}

export async function versionMenu(config) {
  let keepRunning = true;
  while (keepRunning) {
    showVersionMenuTitle();
    const { versionAction } = await inquirer.prompt([
      {
        type: "list",
        name: "versionAction",
        message: "选择操作:",
        choices: [
          { name: "📝 创建新版本", value: "create" },
          { name: "📋 查看版本列表", value: "list" },
          { name: "⏪ 恢复指定版本", value: "restore" },
          new inquirer.Separator(),
          { name: "🔙 返回主菜单", value: "back" },
        ],
        pageSize: 10,
      },
    ]);
    try {
      term.clear();
      switch (versionAction) {
        case "create":
          await handleCreateVersion(config);
          break;
        case "list":
          await handleListVersions(config);
          break;
        case "restore":
          console.log(chalk.blue("--- 恢复版本 ---"));
          await restoreVersion(config);
          break;
        case "back":
          keepRunning = false;
          term.clear();
          console.log(chalk.cyan("返回主菜单..."));
          break;
      }
      if (keepRunning) {
        await inquirer.prompt([
          {
            type: "input",
            name: "pause",
            message: chalk.dim("\n按回车键返回版本管理菜单..."),
            default: "",
          },
        ]);
      }
    } catch (error) {
      term.clear();
      logger.error("版本操作失败:", error);
      const errorBox = boxen(
        chalk.red.bold("❌ 操作执行失败!") +
          "\n\n" +
          error.message +
          "\n\n" +
          chalk.dim("详细错误信息请查看日志文件。"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "double",
          borderColor: "red",
          backgroundColor: "#330000",
        }
      );
      console.log(errorBox);
      await inquirer.prompt([
        {
          type: "input",
          name: "pause",
          message: chalk.dim("\n按回车键返回版本管理菜单..."),
          default: "",
        },
      ]);
    }
  }
}
