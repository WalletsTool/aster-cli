# NPM 发布指南

本指南将帮助您将 Aster Trading CLI 发布到 npm，使用户可以通过 `npm install -g @your-username/aster-cli` 全局安装并使用 `aster` 命令。

## 前置准备

### 1. 注册 npm 账户

如果您还没有 npm 账户，请访问 [npmjs.com](https://www.npmjs.com/) 注册一个账户。

### 2. 登录 npm

在项目根目录下执行：

```bash
npm login
```

输入您的用户名、密码和邮箱。

### 3. 验证登录状态

```bash
npm whoami
```

确认显示您的用户名。

## 包名配置

### 选择包名策略

当前 `package.json` 中的包名为 `@your-username/aster-cli`，您需要根据实际情况选择：

#### 选项 1：使用 Scoped Package（推荐）

将 `@walletstool` 替换为您的 npm 用户名：

```json
{
  "name": "@walletstool/aster-cli"
}
```

优点：
- 避免包名冲突
- 可以使用任何名称
- 更好的品牌识别

#### 选项 2：使用唯一的全局包名

```json
{
  "name": "aster-cli-walletstool"
}
```

### 检查包名可用性

```bash
# 检查包名是否已被使用
npm view @walletstool/aster-cli
# 或
npm view aster-cli-walletstool
```

如果返回 404 错误，说明包名可用。

## 发布前检查

### 1. 更新版本号

根据语义化版本规范更新版本：

```bash
# 补丁版本（bug 修复）
npm version patch

# 次要版本（新功能）
npm version minor

# 主要版本（破坏性更改）
npm version major
```

### 2. 运行测试

```bash
npm test
```

### 3. 检查将要发布的文件

```bash
npm pack --dry-run
```

这会显示将要包含在包中的文件列表。

### 4. 验证 shebang 行

确保 `src/index.js` 文件顶部有正确的 shebang 行：

```javascript
#!/usr/bin/env node
```

## 发布流程

### 1. 发布到 npm

```bash
# 首次发布
npm publish

# 如果使用 scoped package 且希望公开发布
npm publish --access public
```

### 2. 验证发布

发布成功后，您可以：

```bash
# 查看包信息
npm view @walletstool/aster-cli

# 在新环境中测试安装
npm install -g @walletstool/aster-cli

# 测试命令
aster --help
```

## 版本管理

### 发布新版本

1. 修改代码
2. 更新版本号：`npm version patch/minor/major`
3. 发布：`npm publish`

### 撤销发布（仅限 72 小时内）

```bash
npm unpublish @walletstool/aster-cli@1.0.0
```

### 废弃版本

```bash
npm deprecate @walletstool/aster-cli@1.0.0 "This version has security issues"
```

## 用户安装和使用

发布成功后，用户可以通过以下方式安装和使用：

### 全局安装

```bash
npm install -g @walletstool/aster-cli
```

### 使用命令

```bash
# 查看帮助
aster --help

# 账户管理
aster account list
aster account import accounts/import.csv

# 交易操作
aster trade start
aster trade stop
aster trade status

# P&L 追踪
aster pnl show
aster pnl export
aster pnl clear

# 配置管理
aster config show
aster config set trading.enabled true
```

## 故障排除

### 常见问题

1. **权限错误**：确保已正确登录 npm
2. **包名冲突**：选择唯一的包名或使用 scoped package
3. **文件缺失**：检查 `files` 字段配置
4. **命令不可用**：确保 `bin` 字段正确配置且文件有 shebang 行

### 调试命令

```bash
# 查看 npm 配置
npm config list

# 查看包详情
npm view @walletstool/aster-cli

# 查看全局安装的包
npm list -g --depth=0
```

## 最佳实践

1. **使用语义化版本**：遵循 semver 规范
2. **编写详细的 README**：包含安装和使用说明
3. **添加 CI/CD**：自动化测试和发布流程
4. **定期更新依赖**：保持安全性
5. **响应用户反馈**：及时处理 issues 和 PR

## 安全注意事项

1. **不要发布敏感信息**：检查 `.gitignore` 和 `files` 字段
2. **使用 2FA**：为 npm 账户启用双因素认证
3. **定期审计依赖**：`npm audit`
4. **谨慎处理私钥**：确保不会意外发布

---

完成以上步骤后，您的 Aster Trading CLI 就可以通过 npm 全局安装使用了！