import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("builder");

/**
 * 构建博客
 */
export async function buildBlog(config, production = false) {
  logger.info(`开始构建VuePress博客 (${production ? "生产环境" : "开发环境"})`);

  if (!fs.existsSync(config.vuepress.sourcePath)) {
    throw new Error(`博客源目录不存在: ${config.vuepress.sourcePath}`);
  }

  const buildCommand = production
    ? config.vuepress.buildCommand
    : config.vuepress.buildCommand.replace("build", "dev --no-open");

  return new Promise((resolve, reject) => {
    logger.info(`执行命令: ${buildCommand}`);

    const buildProcess = exec(buildCommand, {
      cwd: config.vuepress.sourcePath,
      env: {
        ...process.env,
        NODE_ENV: production ? "production" : "development",
      },
    });

    buildProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) logger.info(output);
    });

    buildProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        if (output.includes("error") || output.includes("Error")) {
          logger.error(output);
        } else {
          logger.info(output);
        }
      }
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        const outputDir = path.join(
          config.vuepress.sourcePath,
          config.vuepress.outputDir
        );
        if (production && !fs.existsSync(outputDir)) {
          logger.error(`构建输出目录不存在: ${outputDir}`);
          logger.error("请检查VuePress配置的outputDir路径是否正确");
          reject(new Error(`构建输出目录不存在: ${outputDir}`));
          return;
        }

        logger.success("VuePress博客构建成功!");
        resolve();
      } else {
        logger.error(`构建失败，错误代码: ${code}`);
        reject(new Error(`构建失败，错误代码: ${code}`));
      }
    });
  });
}
