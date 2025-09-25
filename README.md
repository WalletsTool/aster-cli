# Aster 交易 CLI

一个简单而强大的 CLI 应用程序，用于在 Aster DEX 上进行自动化对冲交易。该工具管理多个交易账户，自动创建对冲仓位，并跟踪不同账户组的表现。

## 功能特性

- 📊 **账户管理**: 从 CSV 文件加载和管理多个交易账户
- 🔄 **自动对冲**: 使用账户对自动创建对冲仓位
- 🎲 **随机币种选择**: 每个交易周期随机选择 BTC、ETH 和 BNB
- 📈 **盈亏跟踪**: 全面的盈亏跟踪和详细统计
- ⚙️ **配置管理**: 灵活的配置系统，支持环境变量
- 📝 **全面日志**: 多级别详细日志记录和文件轮转
- 🛡️ **错误处理**: 强大的错误处理和优雅关闭

## 快速开始

### 前置要求

- Node.js 18+ 
- npm 或 yarn 包管理器
- 有效的 Aster DEX API 凭证（用户地址、签名地址、私钥）

### 安装

1. **克隆并进入项目目录**:
   ```bash
   cd aster-cli
   ```

2. **安装依赖**:
   ```bash
   npm install
   # 或使用 yarn
   yarn install
   # 或使用 pnpm
   pnpm install
   ```

3. **使 CLI 全局可访问**:
   ```bash
   npm link
   ```
   
   运行 `npm link` 后，您可以全局使用 `aster` 命令，而不是 `node src/index.js`。
   
   **其他安装方法:**
   ```bash
   # 从 npm 全局安装（如果已发布）
   npm install -g aster-cli
   
   # 或本地安装并使用 npx
   npx aster-cli <命令>
   ```

### 初始设置

1. **创建账户模板**:
   ```bash
   aster account template
   ```

2. **编辑生成的模板** (`accounts/账号导入模板.csv`) 填入您的实际账户详情:
   ```csv
   name,user,signer,privateKey,balance,enabled,maxLeverage,riskLevel
   Account_1,0x1234...,0x5678...,0xabcd...,1000,true,10,medium
   Account_2,0x2345...,0x6789...,0xbcde...,1500,true,15,high
   ```

3. **加载您的账户**:
   ```bash
   aster account load
   ```

4. **验证账户分组**:
   ```bash
   aster account groups
   ```

**注意**: 如果您没有运行 `npm link`，请在所有命令中使用 `node src/index.js` 而不是 `aster`。

## 使用方法

### 账户管理

#### 从 CSV 文件加载账户
```bash
aster account load
```

#### 列出所有账户
```bash
aster account list
```

#### 仅列出已启用的账户
```bash
aster account list --enabled-only
```

#### 创建并显示账户分组
```bash
aster account groups
```

#### 创建示例账户模板
```bash
aster account template
```

### 交易操作

#### 开始自动交易
```bash
# 使用默认设置开始交易
aster trade start

# 使用自定义参数开始交易
aster trade start --groups 2 --position-size 50 --leverage 5 --close-time 30
```

**选项**:
- `--groups <数量>`: 要交易的组数（默认：所有可用组）
- `--position-size <数量>`: 每个订单的仓位大小（默认：100）
- `--leverage <数量>`: 使用的杠杆倍数（默认：10）
- `--close-time <数量>`: 平仓前的分钟数（默认：60）

#### 检查交易状态
```bash
aster trade status
```

#### 停止交易
```bash
aster trade stop
```

### 盈亏跟踪

#### 显示总体盈亏摘要
```bash
aster pnl show
```

#### 显示详细盈亏分解
```bash
aster pnl show --details
```

#### 显示特定组的盈亏
```bash
aster pnl show --group group_1 --details
```

#### 导出盈亏数据到 CSV
```bash
aster pnl export
```

#### 重置盈亏数据
```bash
aster pnl reset
```

#### 清空盈亏统计数据
```bash
aster pnl clear
```

### 配置管理

#### 显示当前配置
```bash
aster config show
```

#### 显示特定配置部分
```bash
aster config show --section trading
```

#### 设置配置值
```bash
aster config set trading.defaultPositionSize 200
aster config set api.timeout 60000
```

#### 重置配置为默认值
```bash
aster config reset
```

## 账户 CSV 格式

您的账户 CSV 文件应遵循以下格式：

| 列名 | 描述 | 必需 | 示例 |
|------|------|------|------|
| accountName | 账户名称 | 是 | Account_001 |
| exchange | 交易所名称 | 是 | Aster |
| apiKey | API密钥 | 是 | 59c5a4242cf9cc8b182453535rtrtrte2e2eb6b2f1d290a065f9f4c5bf8b79 |
| secretKey | 密钥 | 是 | 8c948616396562fd2cf0d171362342424sf81f9207f6a14b8612bb65b2ed958 |
| proxyUrl | 代理URL | 否 | http://proxy.example.com:8080 |

## 交易逻辑

### 分组形成
1. **账户加载**: 从 `accounts` 文件夹中的 CSV 文件加载所有账户
2. **随机打乱**: 随机打乱已启用的账户  
3. **分组**: 每组形成 6 个账户
4. **配对**: 每组创建 3 个对冲对 (A↔B, C↔D, E↔F)

### 交易流程
1. **币种选择**: 每个周期随机选择 BTC、ETH 或 BNB
2. **开仓**: 
   - 在每对的第一个账户开多头仓位
   - 等待 10-30 秒（随机延迟）
   - 在第二个账户开对应的空头仓位
3. **仓位管理**: 持有仓位配置的时间（默认 60 分钟）  
4. **平仓**: 同时平掉组内所有仓位
5. **盈亏计算**: 计算并记录该周期的盈亏

### 交易流程示例
```
第1组: [A, B, C, D, E, F]
配对: A↔B, C↔D, E↔F
选择币种: BTCUSDT

1. A 开 BTCUSDT 多头 100 单位
2. 等待 15 秒
3. B 开 BTCUSDT 空头 100 单位
4. C 开 BTCUSDT 多头 100 单位  
5. 等待 22 秒
6. D 开 BTCUSDT 空头 100 单位
7. E 开 BTCUSDT 多头 100 单位
8. 等待 18 秒  
9. F 开 BTCUSDT 空头 100 单位

... 等待 60 分钟 ...

10. 同时平掉所有仓位
11. 计算该组的盈亏
12. 记录结果
13. 用新的随机币种开始下一个周期
```

## 配置

应用程序使用位于 `config/config.json` 的分层配置系统。您可以修改这些设置来自定义交易行为。

### 完整配置结构

#### 交易设置
```json
{
  "trading": {
    "supportedCoins": ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    "positionSizeRange": {
      "min": 20,
      "max": 50
    },
    "leverage": 10,
    "closeAfterMinutesRange": {
      "min": 10,
      "max": 30
    },
    "maxDelayMs": 10000,
    "minDelayMs": 5000,
    "maxGroups": 10,
    "enableRiskManagement": true,
    "maxTotalPositions": 50
  }
}
```

**交易配置选项：**
- `supportedCoins`: 使用的交易对数组（默认：BTC、ETH、BNB）
- `positionSizeRange`: 随机选择的最小/最大仓位大小范围
- `leverage`: 默认杠杆倍数（默认：10）
- `closeAfterMinutesRange`: 平仓前的最小/最大分钟数
- `maxDelayMs`/`minDelayMs`: 开仓之间的延迟范围（毫秒）
- `maxGroups`: 处理的最大交易组数
- `enableRiskManagement`: 启用/禁用风险管理功能
- `maxTotalPositions`: 所有账户的最大总开仓数

#### API 设置
```json
{
  "api": {
    "baseUrl": "https://fapi.asterdex.com",
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000
  }
}
```

**API 配置选项：**
- `baseUrl`: Aster DEX API 基础 URL
- `timeout`: 请求超时时间（毫秒）（默认：30 秒）
- `retryAttempts`: 失败请求的重试次数
- `retryDelay`: 重试尝试之间的延迟（毫秒）

#### 日志设置
```json
{
  "logging": {
    "level": "info",
    "enableFileLogging": true,
    "enableConsoleLogging": true,
    "logRotation": true,
    "maxLogFiles": 7,
    "maxLogSize": "10MB"
  }
}
```

**日志配置选项：**
- `level`: 日志级别（debug、info、warn、error）
- `enableFileLogging`: 启用文件日志记录
- `enableConsoleLogging`: 启用控制台输出
- `logRotation`: 启用自动日志文件轮转
- `maxLogFiles`: 保留的最大日志文件数
- `maxLogSize`: 每个日志文件的最大大小

#### 数据库设置
```json
{
  "database": {
    "enablePersistence": true,
    "autoBackup": true,
    "backupInterval": 3600000,
    "maxBackups": 24
  }
}
```

**数据库配置选项：**
- `enablePersistence`: 启用数据持久化到磁盘
- `autoBackup`: 启用自动备份
- `backupInterval`: 备份间隔（毫秒）（默认：1 小时）
- `maxBackups`: 保留的最大备份文件数

#### 通知设置
```json
{
  "notifications": {
    "enableSlack": false,
    "enableTelegram": false,
    "enableEmail": false,
    "slackWebhook": "",
    "telegramBotToken": "",
    "telegramChatId": "",
    "emailSmtp": {
      "host": "",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "",
        "pass": ""
      }
    },
    "emailTo": ""
  }
}
```

**通知配置选项：**
- `enableSlack`/`enableTelegram`/`enableEmail`: 启用特定通知渠道
- `slackWebhook`: 用于通知的 Slack webhook URL
- `telegramBotToken`/`telegramChatId`: Telegram 机器人配置
- `emailSmtp`: 邮件通知的 SMTP 服务器配置
- `emailTo`: 收件人邮箱地址

#### 安全设置
```json
{
  "security": {
    "encryptPrivateKeys": true,
    "secretKey": "",
    "sessionTimeout": 3600000,
    "maxFailedAttempts": 5,
    "lockoutDuration": 300000
  }
}
```

**安全配置选项：**
- `encryptPrivateKeys`: 启用私钥加密
- `secretKey`: 加密密钥（留空自动生成）
- `sessionTimeout`: 会话超时时间（毫秒）
- `maxFailedAttempts`: 锁定前的最大失败登录尝试次数
- `lockoutDuration`: 锁定持续时间（毫秒）

#### 性能设置
```json
{
  "performance": {
    "enableMetrics": true,
    "metricsInterval": 60000,
    "memoryThreshold": 524288000,
    "cpuThreshold": 80
  }
}
```

**性能配置选项：**
- `enableMetrics`: 启用性能监控
- `metricsInterval`: 指标收集间隔（毫秒）
- `memoryThreshold`: 内存使用阈值（字节）（默认：500MB）
- `cpuThreshold`: CPU 使用阈值百分比

### 修改配置

修改配置设置的方法：

1. **直接编辑文件**: 直接编辑 `config/config.json`
2. **使用 CLI 命令**: 使用配置管理命令
   ```bash
   aster config set trading.leverage 15
   aster config set api.timeout 45000
   ```
3. **环境变量**: 使用环境变量覆盖设置
   ```bash
   TRADING_LEVERAGE=15 aster trade start
   ```

## 文件结构

```
cli/
├── src/
│   ├── engine/
│   │   └── tradingEngine.js    # Core trading logic
│   ├── utils/
│   │   ├── accountManager.js   # Account management
│   │   ├── asterApi.js         # Aster DEX API client
│   │   ├── config.js          # Configuration management
│   │   ├── logger.js          # Logging system  
│   │   └── pnlTracker.js      # P&L tracking
│   └── index.js               # Main CLI interface
├── accounts/                   # CSV account files
├── config/                    # Configuration files
├── logs/                      # Log files
├── package.json
└── README.md
```

## 日志

应用程序提供多级别的全面日志记录：

- **应用程序日志**: `logs/application.log` - 一般应用程序事件
- **交易日志**: `logs/trading.log` - 交易特定事件  
- **错误日志**: `logs/error.log` - 仅错误事件

日志级别：`debug`、`info`、`warn`、`error`

## 安全注意事项

1. **私钥**: 安全存储私钥，永远不要将其提交到版本控制
2. **API 限制**: 遵守 Aster DEX API 速率限制
3. **风险管理**: 从小仓位开始测试
4. **账户隔离**: 每个账户独立运行
5. **错误处理**: 所有 API 调用都包含错误处理和重试逻辑

## 故障排除

### 常见问题

1. **"找不到账户"**
   - 确保 CSV 文件在 `accounts` 文件夹中
   - 检查 CSV 格式是否与模板匹配
   - 验证账户在 CSV 中已启用

2. **"无法形成完整组"**  
   - 需要至少 6 个已启用的账户才能形成一个组
   - 检查 CSV 中账户的 `enabled` 列

3. **API 认证错误**
   - 验证 `user`、`signer` 和 `privateKey` 是否正确
   - 确保 API 钱包有足够的权限
   - 检查账户是否在 Aster DEX 上正确配置

4. **交易错误**
   - 验证账户有足够的余额
   - 检查选定的币种是否可用于交易
   - 确保与 Aster DEX 的网络连接

### 调试模式

启用调试日志进行详细故障排除：

```bash
aster config set logging.level debug
aster trade start --debug
```

### Log Analysis

Check application logs:
```bash
# View latest application logs
tail -f logs/application.log

# View trading-specific logs  
tail -f logs/trading.log

# View error logs
tail -f logs/error.log
```

## 贡献

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 如适用，添加测试
5. 提交拉取请求

## 许可证

本项目采用 MIT 许可证 - 详情请参阅 LICENSE 文件。

## 支持

如需支持和咨询：

1. 检查上述故障排除部分
2. 查看应用程序日志了解错误详情
3. 确保满足所有前置要求
4. 验证账户配置和 API 凭证

## 免责声明

本软件仅用于教育和研究目的。加密货币交易涉及重大损失风险。作者不对使用本软件造成的任何财务损失负责。在使用大量资金部署之前，请务必使用小额资金进行彻底测试。