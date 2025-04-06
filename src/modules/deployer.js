import fs from "fs-extra";
import path from "path";
import { Client } from "ssh2";
import inquirer from "inquirer";
import { getLogger } from "../utils/logger.js";
import { expandTilde } from "../utils/helpers.js";

const logger = getLogger("deployer");

/**
 * 部署博客到远程服务器
 */
export async function deployBlog(config) {
  if (!config.server || !config.server.host) {
    logger.error("服务器配置不完整，请运行 setup 命令进行设置");
    throw new Error("服务器配置不完整");
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `确认部署到 ${config.server.username}@${config.server.host}:${config.server.remotePath}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    logger.info("已取消部署操作");
    return;
  }

  return new Promise((resolve, reject) => {
    logger.info(`连接到远程服务器 ${config.server.host}...`);

    // 扩展私钥路径中的波浪号
    const expandedKeyPath = expandTilde(config.server.privateKeyPath);

    try {
      if (!fs.existsSync(expandedKeyPath)) {
        throw new Error(`SSH私钥文件不存在: ${expandedKeyPath}`);
      }

      const conn = new Client();

      // 连接超时处理
      const connectionTimeout = setTimeout(() => {
        logger.error("连接服务器超时");
        reject(new Error("连接服务器超时"));
      }, 30000);

      conn.on("ready", () => {
        clearTimeout(connectionTimeout);
        logger.success("SSH连接成功！开始上传文件...");

        conn.sftp((err, sftp) => {
          if (err) {
            logger.error(`SFTP 子系统错误: ${err.message}`);
            conn.end();
            return reject(err);
          }

          const localDir = path.join(
            config.vuepress.sourcePath,
            config.vuepress.outputDir
          );
          const remoteDir = config.server.remotePath;

          if (!fs.existsSync(localDir)) {
            conn.end();
            return reject(
              new Error(`本地构建目录不存在: ${localDir}，请先运行构建命令`)
            );
          }

          let totalFiles = 0;
          let uploadedFiles = 0;
          let failedFiles = 0;

          countFiles(localDir);
          logger.info(`共计 ${totalFiles} 个文件需要上传`);

          // 先确保远程目录存在
          conn.exec(`mkdir -p ${remoteDir}`, (err) => {
            if (err) {
              logger.error(`创建远程目录失败: ${err.message}`);
              conn.end();
              return reject(err);
            }

            // 清空远程目录
            conn.exec(`rm -rf ${remoteDir}/*`, (err) => {
              if (err) {
                logger.error(`清空远程目录失败: ${err.message}`);
                conn.end();
                return reject(err);
              }

              uploadDirWithRetry(localDir, remoteDir)
                .then(() => {
                  if (failedFiles > 0) {
                    logger.warn(`上传完成, 但有 ${failedFiles} 个文件上传失败`);
                  } else {
                    logger.success("所有文件上传完成!");
                  }
                  conn.end();
                  resolve();
                })
                .catch((err) => {
                  logger.error(`上传过程中发生错误: ${err.message}`);
                  conn.end();
                  // 即使有错误，如果有文件上传成功，我们也视为部分成功
                  if (uploadedFiles > 0) {
                    logger.info(
                      `已成功上传 ${uploadedFiles}/${totalFiles} 个文件`
                    );
                    resolve();
                  } else {
                    reject(err);
                  }
                });
            });
          });

          // 辅助函数 - 计算文件总数
          function countFiles(dir) {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
              if (file.isDirectory()) {
                countFiles(path.join(dir, file.name));
              } else {
                totalFiles++;
              }
            }
          }

          // 上传目录函数，带重试
          function uploadDirWithRetry(localPath, remotePath, retryCount = 0) {
            const MAX_RETRIES = 2;

            return new Promise((resolveUpload, rejectUpload) => {
              fs.readdir(localPath, { withFileTypes: true }, (err, files) => {
                if (err) return rejectUpload(err);

                const MAX_CONCURRENT = 3; // 限制并发数
                let pending = files.length;
                let activeTransfers = 0;
                let fileQueue = [...files];

                if (!pending) return resolveUpload();

                function processNextFile() {
                  if (fileQueue.length === 0) return;
                  if (activeTransfers >= MAX_CONCURRENT) return;

                  activeTransfers++;
                  const file = fileQueue.shift();

                  const srcPath = path.join(localPath, file.name);
                  const dstPath = path.posix.join(remotePath, file.name);

                  if (file.isDirectory()) {
                    // 创建远程目录
                    conn.exec(`mkdir -p ${dstPath}`, (err) => {
                      if (err) {
                        logger.error(
                          `创建目录失败: ${file.name} - ${err.message}`
                        );
                        activeTransfers--;
                        fileQueue.length > 0 && processNextFile();
                        if (--pending === 0) resolveUpload();
                        return;
                      }

                      // 递归上传子目录
                      uploadDirWithRetry(srcPath, dstPath)
                        .then(() => {
                          activeTransfers--;
                          if (--pending === 0) {
                            resolveUpload();
                          } else {
                            processNextFile();
                          }
                        })
                        .catch((err) => {
                          logger.error(
                            `上传子目录失败: ${file.name} - ${err.message}`
                          );
                          failedFiles++;
                          activeTransfers--;
                          if (--pending === 0) {
                            // 即使有错误也继续尝试其他文件
                            resolveUpload();
                          } else {
                            processNextFile();
                          }
                        });
                    });
                  } else {
                    // 上传文件，添加重试逻辑
                    const uploadFile = (retry = 0) => {
                      sftp.fastPut(srcPath, dstPath, (err) => {
                        if (err) {
                          logger.warn(
                            `上传失败(${retry + 1}/${MAX_RETRIES + 1}): ${
                              file.name
                            } - ${err.message}`
                          );

                          if (retry < MAX_RETRIES) {
                            setTimeout(() => uploadFile(retry + 1), 1000);
                            return;
                          } else {
                            failedFiles++;
                            activeTransfers--;
                            if (--pending === 0) {
                              resolveUpload();
                            } else {
                              processNextFile();
                            }
                            return;
                          }
                        }

                        uploadedFiles++;
                        const progress = Math.floor(
                          (uploadedFiles / totalFiles) * 100
                        );
                        logger.info(
                          `上传中: ${file.name} (${uploadedFiles}/${totalFiles}, ${progress}%)`
                        );

                        activeTransfers--;
                        if (--pending === 0) {
                          resolveUpload();
                        } else {
                          processNextFile();
                        }
                      });
                    };

                    uploadFile();
                  }
                }

                // 启动初始批次的文件上传
                for (let i = 0; i < MAX_CONCURRENT && i < files.length; i++) {
                  processNextFile();
                }
              });
            });
          }
        });
      });

      conn.on("error", (err) => {
        clearTimeout(connectionTimeout);
        logger.error("SSH连接错误:", err.message);
        reject(err);
      });

      conn.on("close", (hadError) => {
        if (hadError) {
          logger.warn("SSH连接非正常关闭");
        }
      });

      // 连接服务器
      conn.connect({
        host: config.server.host,
        port: config.server.port || 22,
        username: config.server.username,
        privateKey: fs.readFileSync(expandedKeyPath),
        readyTimeout: 30000,
      });
    } catch (error) {
      logger.error("部署错误:", error.message);
      reject(error);
    }
  });
}
