# VuePress 博客管理系统

## 📖 简介

VuePress 博客管理系统是一个专为 VuePress 静态博客设计的一站式本地管理工具，它可以帮助您轻松地创建、预览、部署和版本控制您的博客内容。

**主要功能**：

- 🔄 版本管理与备份还原
- 🔨 一键构建博客
- 👁️ 本地预览
- 🚀 自动部署至服务器
- ✨ 完整发布工作流
- 📊 简单直观的交互界面

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/worrycloud23/blog-manager.git
cd blog-manager

# 安装依赖
npm install
```

### 首次使用

```bash
# 启动管理系统
node index.js
```

首次启动时，系统会引导您完成配置设置，包括：

- VuePress 源码路径
- 构建输出目录
- 服务器部署信息
- SSH 密钥配置

## 📋 功能详解

### 🔧 配置系统

通过交互式命令行配置您的博客信息和部署参数。所有配置会保存在本地，方便后续使用。

**配置项目**:

- VuePress 源码路径
- 构建命令
- 输出目录
- SSH 服务器信息
- 部署目录
- SSH 密钥路径

### 📝 版本管理

#### 创建版本

保存博客源码的当前状态，方便后续恢复。

```
选择: 📝 创建版本
输入版本描述
```

#### 查看版本列表

查看所有已保存的版本历史记录。

```
选择: 📋 查看版本列表
```

#### 恢复版本

将博客恢复至之前保存的某个版本状态。恢复过程会保留 `node_modules` 目录，无需重新安装依赖。

```
选择: ⏪ 恢复版本
```

### 🔨 构建博客

执行 VuePress 构建命令，生成静态网站文件。

```
选择: 🔨 构建博客
```

### 👁️ 预览博客

在本地启动预览服务器，查看构建结果。

```
选择: 👁️ 预览博客
```

预览模式下可以：

- 实时查看博客效果
- 通过简单的命令返回主菜单

### 🚀 部署博客

将构建好的静态网站文件部署到远程服务器。

```
选择: 🚀 部署博客
```

部署过程会：

1. 确认部署信息
2. 通过 SSH 密钥安全连接服务器
3. 自动创建远程目录（如果不存在）
4. 传输所有静态文件
5. 显示详细的上传进度

### ✨ 完整发布流程

一键执行"版本创建->构建->预览->部署"全流程。

```
选择: ✨ 完整发布流程
```

## ⚙️ 配置详解

### 基本配置

配置文件默认保存在程序目录下的 `config.json`，包含以下主要部分：

```json
{
  "vuepress": {
    "sourcePath": "/path/to/your/blog",
    "buildCommand": "npm run build",
    "outputDir": "public"
  },
  "server": {
    "host": "your-server-ip",
    "port": 22,
    "username": "blogger",
    "privateKeyPath": "~/.ssh/id_rsa",
    "remotePath": "/www/web"
  },
  "preview": {
    "port": 3000
  },
  "version": {
    "path": "./versions",
    "maxCount": 10
  }
}
```

### SSH 密钥设置

#### 在 Windows 上生成 SSH 密钥

1. 打开 PowerShell 或命令提示符
2. 运行以下命令：
   ```
   ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
   ```
3. 按照提示设置密钥保存路径和密码

#### 在 Linux/Mac 上生成 SSH 密钥

```bash
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
```

#### 将公钥添加到服务器

```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub username@your-server-ip
```

## 🛠️ 服务器配置

### Ubuntu 服务器设置

1. 创建专用用户：

   ```bash
   sudo useradd -m -s /bin/bash blogger
   sudo passwd blogger
   ```

2. 创建博客目录：

   ```bash
   sudo mkdir -p /www/web
   sudo chown -R blogger:blogger /www/web
   sudo chmod -R 755 /www/web
   ```

3. 配置 SSH 访问：

   ```bash
   # 确保 ~/.ssh 目录存在
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh

   # 添加公钥到 authorized_keys
   echo "your-public-key" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

## 🤝 贡献指南

欢迎对本项目做出贡献！您可以通过以下方式参与：

1. 报告问题或建议功能
2. 提交代码改进
3. 完善文档

请确保遵循项目的编码规范和提交消息格式。

## 📄 许可证

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- VuePress 团队提供了优秀的静态站点生成器
- 所有为本项目做出贡献的开发者

---

## 常见问题

### Q: 如何更改预览服务器端口？

A: 在配置文件中修改 `preview.port` 值，或在系统配置环节重新设置。

### Q: 为什么部署时出现 "Channel open failure" 错误？

A: 这通常是由于 SSH 连接问题导致。请检查：

1.  服务器 SFTP 子系统是否正常
2.  用户权限是否正确
3.  尝试减少并发上传数量

### Q: 如何在不同电脑间迁移配置？

A: 只需复制 `config.json` 文件，并确保 SSH 密钥路径正确设置。

---

**注意**：首次使用时，请确保您已安装 Node.js 12.0.0 或更高版本。

_使用 VuePress 博客管理系统，让博客管理变得简单高效！_
