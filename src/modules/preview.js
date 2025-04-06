import express from "express";
import path from "path";
import fs from "fs-extra";
import opener from "opener";
import inquirer from "inquirer";
import chalk from "chalk";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("preview");
let server = null;

/**
 * 启动本地预览服务器
 */
export async function startPreview(config) {
  if (server) {
    await stopPreview();
  }

  const port = config.preview?.port || 3000;
  const distDir = path.resolve(
    config.vuepress.sourcePath,
    config.vuepress.outputDir
  );

  if (!fs.existsSync(distDir)) {
    logger.warn("构建目录不存在，需要先构建博客");

    // 询问是否立即构建
    const { doBuild } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doBuild",
        message: "是否立即构建博客?",
        default: true,
      },
    ]);

    if (doBuild) {
      const { buildBlog } = await import("./builder.js");
      await buildBlog(config, true);
    } else {
      throw new Error("无法预览：构建目录不存在");
    }
  }

  logger.info(`使用构建目录: ${distDir}`);
  const indexPath = path.resolve(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    logger.error(`找不到入口文件: ${indexPath}`);
    throw new Error("无法预览：入口文件不存在");
  }

  return new Promise((resolve) => {
    const app = express();
    app.use(express.static(distDir));
    app.use((req, res) => {
      const absolutePath = path.resolve(distDir, "index.html");
      res.sendFile(absolutePath, (err) => {
        if (err) {
          logger.error(`发送文件错误: ${err.message}`);
          res.status(500).send("服务器内部错误: " + err.message);
        }
      });
    });

    // 启动服务器
    server = app.listen(port, () => {
      const url = `http://localhost:${port}`;
      logger.success(`预览服务器已启动: ${url}`);
      logger.info("浏览器窗口已自动打开");

      // 自动打开浏览器
      opener(url);

      // 使用简单的提示而不是复杂的菜单
      handlePreviewControl(resolve);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`端口 ${port} 已被占用，请尝试其他端口`);
      } else {
        logger.error("预览服务器错误:", err.message);
      }
      resolve(); // 发生错误时也要解析Promise
    });

    // 确保在进程终止时关闭服务器
    process.on("SIGINT", () => {
      stopPreview().then(() => resolve());
    });
    process.on("SIGTERM", () => {
      stopPreview().then(() => resolve());
    });
  });
}

/**
 * 处理预览控制
 */
function handlePreviewControl(resolveFunction) {
  inquirer
    .prompt([
      {
        type: "confirm",
        name: "exitPreview",
        message: "退出预览模式?",
        default: false,
      },
    ])
    .then((answers) => {
      if (answers.exitPreview) {
        stopPreview().then(() => resolveFunction());
      } else {
        handlePreviewControl(resolveFunction);
      }
    })
    .catch((error) => {
      logger.error(`预览控制错误: ${error.message || "未知错误"}`);
      stopPreview().then(() => resolveFunction());
    });
}

/**
 * 停止预览服务器
 */
export async function stopPreview() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    logger.info("正在停止预览服务器...");
    server.close(() => {
      logger.success("预览服务器已停止");
      server = null;
      resolve();
    });
  });
}
