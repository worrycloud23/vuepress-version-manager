import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import chalk from "chalk";
import dotenv from "dotenv";

// 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../");

// 加载环境变量
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

// 配置文件路径
const CONFIG_DIR = path.join(ROOT_DIR, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "default.json");

/**
 * 加载配置
 */
export async function loadConfig() {
  // 确保配置目录存在
  fs.ensureDirSync(CONFIG_DIR);

  // 如果配置文件不存在，创建默认配置
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      vuepress: {
        sourcePath: path.join(ROOT_DIR, "data/current"),
        buildCommand: "npm run build",
        outputDir: "./.vuepress/dist",
      },
      versioning: {
        versionsDir: path.join(ROOT_DIR, "data/versions"),
        maxVersions: 10,
      },
      logging: {
        level:
          process.env.ENABLE_VERBOSE_LOGGING === "true" ? "verbose" : "info",
        dir: path.join(ROOT_DIR, "data/logs"),
      },
      preview: {
        port: process.env.PREVIEW_PORT || 3000,
      },
    };

    fs.writeJSONSync(CONFIG_FILE, defaultConfig, { spaces: 2 });
  }

  // 加载配置
  const config = fs.readJSONSync(CONFIG_FILE);

  // 添加服务器配置(从.env获取)
  config.server = {
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT || "22"),
    username: process.env.SSH_USERNAME,
    privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH,
    remotePath: process.env.REMOTE_PATH,
  };

  // 确保必要目录存在
  fs.ensureDirSync(config.vuepress.sourcePath);
  fs.ensureDirSync(config.versioning.versionsDir);
  fs.ensureDirSync(config.logging.dir);

  return config;
}

/**
 * 配置设置向导
 */
export async function setupConfig() {
  console.log(chalk.blue.bold("博客管理系统配置向导"));

  // 加载当前配置
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.log(chalk.yellow("无法加载现有配置，将创建新配置"));
    config = {
      vuepress: {
        sourcePath: path.join(ROOT_DIR, "data/current"),
        buildCommand: "npm run build",
        outputDir: "./.vuepress/dist",
      },
      versioning: {
        versionsDir: path.join(ROOT_DIR, "data/versions"),
        maxVersions: 10,
      },
    };
  }

  // VuePress配置
  console.log(chalk.blue("\n== VuePress配置 =="));
  const vuepressAnswers = await inquirer.prompt([
    {
      type: "input",
      name: "sourcePath",
      message: "博客源文件目录:",
      default: config.vuepress.sourcePath,
    },
    {
      type: "input",
      name: "buildCommand",
      message: "VuePress构建命令:",
      default: config.vuepress.buildCommand,
    },
    {
      type: "input",
      name: "outputDir",
      message: "VuePress构建输出目录(相对于源文件目录):",
      default: config.vuepress.outputDir,
    },
  ]);

  // 版本管理配置
  console.log(chalk.blue("\n== 版本管理配置 =="));
  const versionAnswers = await inquirer.prompt([
    {
      type: "input",
      name: "versionsDir",
      message: "版本存储目录:",
      default: config.versioning.versionsDir,
    },
    {
      type: "number",
      name: "maxVersions",
      message: "最大保留版本数:",
      default: config.versioning.maxVersions,
    },
  ]);

  // 服务器配置
  console.log(chalk.blue("\n== 服务器配置 =="));
  console.log(chalk.yellow("注意: 以下敏感信息将存储在.env文件中"));

  const serverAnswers = await inquirer.prompt([
    {
      type: "input",
      name: "host",
      message: "服务器IP地址:",
      default: process.env.SSH_HOST || "your-server-ip",
    },
    {
      type: "input",
      name: "port",
      message: "SSH端口:",
      default: process.env.SSH_PORT || "22",
    },
    {
      type: "input",
      name: "username",
      message: "SSH用户名:",
      default: process.env.SSH_USERNAME || "your-username",
    },
    {
      type: "input",
      name: "privateKeyPath",
      message: "SSH私钥路径:",
      default: process.env.SSH_PRIVATE_KEY_PATH || "~/.ssh/id_rsa",
    },
    {
      type: "input",
      name: "remotePath",
      message: "远程服务器部署路径:",
      default: process.env.REMOTE_PATH || "/var/www/html/blog",
    },
  ]);

  // 预览配置
  console.log(chalk.blue("\n== 预览配置 =="));
  const previewAnswers = await inquirer.prompt([
    {
      type: "number",
      name: "port",
      message: "本地预览端口:",
      default: process.env.PREVIEW_PORT || 3000,
    },
  ]);

  // 日志配置
  console.log(chalk.blue("\n== 日志配置 =="));
  const loggingAnswers = await inquirer.prompt([
    {
      type: "list",
      name: "level",
      message: "日志级别:",
      choices: ["info", "verbose", "debug"],
      default:
        process.env.ENABLE_VERBOSE_LOGGING === "true" ? "verbose" : "info",
    },
  ]);

  // 更新配置
  const updatedConfig = {
    vuepress: {
      sourcePath: vuepressAnswers.sourcePath,
      buildCommand: vuepressAnswers.buildCommand,
      outputDir: vuepressAnswers.outputDir,
    },
    versioning: {
      versionsDir: versionAnswers.versionsDir,
      maxVersions: versionAnswers.maxVersions,
    },
    logging: {
      level: loggingAnswers.level,
      dir: path.join(ROOT_DIR, "data/logs"),
    },
    preview: {
      port: previewAnswers.port,
    },
  };

  // 保存配置到JSON
  fs.ensureDirSync(CONFIG_DIR);
  fs.writeJSONSync(CONFIG_FILE, updatedConfig, { spaces: 2 });

  // 保存敏感信息到.env
  const envContent = `# 服务器配置(敏感信息)
SSH_HOST=${serverAnswers.host}
SSH_PORT=${serverAnswers.port}
SSH_USERNAME=${serverAnswers.username}
SSH_PRIVATE_KEY_PATH=${serverAnswers.privateKeyPath}

# 远程路径
REMOTE_PATH=${serverAnswers.remotePath}

# 是否启用高级日志
ENABLE_VERBOSE_LOGGING=${
    loggingAnswers.level === "verbose" || loggingAnswers.level === "debug"
  }

# 预览服务器配置
PREVIEW_PORT=${previewAnswers.port}
`;

  fs.writeFileSync(path.join(ROOT_DIR, ".env"), envContent);

  console.log(chalk.green.bold("✅ 配置已保存!"));

  return updatedConfig;
}
