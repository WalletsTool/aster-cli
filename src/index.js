#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import AccountManager from './utils/accountManager.js';
import TradingEngine from './engine/tradingEngine.js';
import PnLTracker from './utils/pnlTracker.js';
import ConfigManager from './utils/config.js';
import Logger from './utils/logger.js';
import { convertAllUSDTToUSDF, convertUSDTToUSDF } from './utils/mintUSDF.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Package info
const packageJsonPath = path.join(__dirname, '../package.json');
const packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Global instances
let accountManager;
let tradingEngine;
let pnlTracker;
let configManager;
let logger;

// Initialize components
function initialize() {
    try {
        configManager = new ConfigManager();
        logger = Logger;
        accountManager = new AccountManager();
        tradingEngine = new TradingEngine(accountManager);
        pnlTracker = new PnLTracker();

        Logger.info(`应用程序启动 v${packageInfo.version} (${process.env.NODE_ENV || 'development'})`, '系统');
    } catch (error) {
        Logger.error(`应用程序初始化失败: ${error.message}`, '系统');
        process.exit(1);
    }
}

// Create CLI program
const program = new Command();

program
    .name('aster-cli')
    .description('Aster Trading CLI - Automated hedged position trading')
    .version(packageInfo.version);

// Account Commands
const accountCmd = program.command('account').description('Account management commands');

accountCmd
    .command('load [filePath]')
    .description('Load accounts from CSV files (specify file path or load all from accounts folder)')
    .action(async (filePath) => {
        const spinner = ora('Loading accounts...').start();
        try {
            const accounts = await accountManager.loadAccounts(filePath);
            spinner.succeed(`成功加载 ${accounts.length} 个账户`);
            
            const stats = accountManager.getAccountStats();
            Logger.info('\n📊 账户统计:', '系统');
            Logger.info(`  Total Accounts: ${stats.total}`, '系统');
            Logger.info(`  Max Groups: ${stats.maxGroups}`, '系统');

            if (filePath) {
                Logger.info(`从指定文件加载完成: ${filePath}`, '系统');
            } else {
                Logger.info(`账户加载操作完成: ${accounts.length} 个账户`, '系统');
            }
        } catch (error) {
            spinner.fail('Failed to load accounts');
            Logger.error(error.message, '系统');
            Logger.error(`账户加载错误: ${error.message}`, '系统');
        }
    });

accountCmd
    .command('list')
    .description('List all loaded accounts')
    .action(async (options) => {
        const spinner = ora('Loading accounts...').start();
        try {
            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                await accountManager.loadAccounts();
            }
            
            spinner.stop();
            const accounts = accountManager.getAccounts();

            if (accounts.length === 0) {
                Logger.warn('未加载账户。请先使用 "load <path>" 命令。', '系统');
                return;
            }

            Logger.info(`\n📋 账户 (${accounts.length}):\n`, '系统');

            accounts.forEach((account, index) => {
                Logger.info(`${index + 1}. ${account.accountName}`, account.accountName);
                Logger.info(`   Exchange: ${account.exchange}`, account.accountName);
                Logger.info(`   API Key: ${account.apiKey.substring(0, 8)}...`, account.accountName);
                Logger.info(`   Proxy: ${account.proxyUrl || 'None'}`, account.accountName);
                Logger.info('', account.accountName);
            });
        } catch (error) {
            Logger.error(`加载账户时出错: ${error.message}`, '系统');
            Logger.error(`账户列表错误: ${error.message}`, '系统');
        }
    });

accountCmd
    .command('groups')
    .description('Create and display account groups')
    .option('-s, --size <number>', 'Group size (default: 6)', '6')
    .action(async (options) => {
        const spinner = ora('Loading accounts...').start();
        try {
            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                await accountManager.loadAccounts();
            }
            
            spinner.text = 'Creating account groups...';
            const groupSize = parseInt(options.size);
            const groups = accountManager.groupAccounts(groupSize);
            
            if (groups.length === 0) {
                spinner.warn('No complete groups could be formed');
                Logger.warn('\n请确保您有足够的账户来形成完整的分组。', '系统');
                return;
            }

            spinner.succeed(`Created ${groups.length} groups of ${groupSize} accounts each`);

            Logger.info('\n👥 账户分组:\n', '系统');

            groups.forEach((group, index) => {
                Logger.info(`Group ${index + 1} (${group.id}):`, `组${group.id}`);
                
                group.pairs.forEach((pair, pairIndex) => {
                    Logger.info(`  组 ${pairIndex + 1}:`, `组${group.id}`);
                    Logger.info(`    Long:  ${pair.long.accountName} (${pair.long.exchange})`, `组${group.id}`);
                    Logger.info(`    Short: ${pair.short.accountName} (${pair.short.exchange})`, `组${group.id}`);
                });
                Logger.info('', `组${group.id}`);
            });

            Logger.info(`账户分组操作完成: ${groups.length} 个组，每组 ${groupSize} 个账户`, '系统');
        } catch (error) {
            spinner.fail('Failed to create account groups');
            Logger.error(error.message, '系统');
            Logger.error(`账户分组错误: ${error.message}`, '系统');
        }
    });

accountCmd
    .command('template')
    .description('Create sample account template')
    .action(() => {
        try {
            const templatePath = accountManager.createSampleTemplate();
            Logger.success(`✓ 示例模板已创建: ${templatePath}`, '系统');
            Logger.info('\n请编辑此文件填入您的实际账户详情，然后使用新的CSV文件。', '系统');
            Logger.info(`模板创建完成: ${templatePath}`, '系统');
        } catch (error) {
            Logger.error(`Failed to create template: ${error.message}`, '系统');
            Logger.error(`模板创建错误: ${error.message}`, '系统');
        }
    });

// Trading Commands
const tradeCmd = program.command('trade').description('Trading commands');

tradeCmd
    .command('start')
    .description('Start automated trading')
    .option('-g, --groups <number>', 'Number of groups to trade (default: all)')
    .option('-p, --position-size <number>', 'Position size (default: 100)')
    .option('-l, --leverage <number>', 'Leverage (default: 10)')
    .option('-t, --close-time <number>', 'Minutes before closing positions (default: 60)')
    .action(async (options) => {
        const spinner = ora('Starting trading engine...').start();
        try {
            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                spinner.text = 'Loading accounts...';
                await accountManager.loadAccounts();
            }

            // Create groups
            spinner.text = 'Creating account groups...';
            const allGroups = accountManager.groupAccounts();
            
            if (allGroups.length === 0) {
                spinner.fail('No account groups available for trading');
                Logger.warn('无可用交易组。请先加载账户并检查分组。', '系统');
                return;
            }

            // Limit groups if specified
            const groups = options.groups 
                ? allGroups.slice(0, parseInt(options.groups))
                : allGroups;

            // Configure trading - get config first, then override with command line options
            const baseConfig = configManager.getTradingConfig();
            const tradingConfig = {
                positionSize: 100,
                leverage: 5,  // Default fallback
                closeAfterMinutes: 60,
                ...baseConfig,  // Apply config.json values
                // Override with command line options if provided
                ...(options.positionSize && { positionSize: parseInt(options.positionSize) }),
                ...(options.leverage && { leverage: parseInt(options.leverage) }),
                ...(options.closeTime && { closeAfterMinutes: parseInt(options.closeTime) })
            };

            Logger.info(`\n🎯 交易配置:`, '系统');
            Logger.info(`  仓位大小: ${tradingConfig.positionSize} USDT`, '系统');
            Logger.info(`  杠杆: ${tradingConfig.leverage}x`, '系统');

            spinner.text = 'Initializing trading engine...';

            // Set up event listeners
            tradingEngine.on('tradingStarted', (data) => {
                Logger.success(`\n🚀 已为 ${data.groups} 个组启动交易`, '系统');
                Logger.info(`交易开始: ${data.groups} 个组`, '系统');
            });

            tradingEngine.on('positionOpened', (position) => {
                Logger.info(`📈 仓位已开启: ${position.symbol} - 交易对 ${position.pairId}`, `组${position.groupId || '未知'}`);
                Logger.success(`仓位开启: ${position.pairId}`, `组${position.groupId}`);
            });

            tradingEngine.on('positionClosed', (position) => {
                Logger.warn(`📉 仓位已平仓: ${position.symbol} - 交易对 ${position.pairId}`, `组${position.groupId || '未知'}`);
                Logger.success(`仓位关闭: ${position.pairId}`, `组${position.groupId}`);
            });

            tradingEngine.on('cycleCompleted', (data) => {
                Logger.info(`✅ 组 ${data.groupId} 的周期 ${data.cycle} 已完成`, `组${data.groupId}`);
                Logger.info(`   Coin: ${data.coin}`, `组${data.groupId}`);
                Logger.info(`   Total P&L: ${data.pnl.totalPnL.toFixed(4)} USDT`, `组${data.groupId}`);
                
                // Record in P&L tracker
                pnlTracker.recordTrade(data.groupId, {
                    pnl: data.pnl.totalPnL,
                    symbol: data.coin,
                    cycle: data.cycle,
                    positions: data.pnl.trades.length
                });
            });

            tradingEngine.on('pnlUpdated', (data) => {
                Logger.info(`💰 盈亏更新 - 组 ${data.groupId}: 周期 ${data.cyclePnL.toFixed(4)} USDT, 总计: ${data.totalPnL.toFixed(4)} USDT`, `组${data.groupId}`);
                Logger.info(`盈亏更新 - 组${data.groupId}: ${data.totalPnL || 0} USDT`, `组${data.groupId}`);
            });

            tradingEngine.on('error', (error) => {
                Logger.error(`❌ 交易错误: ${error.message}`, '系统');
                Logger.error(`交易引擎错误: ${error.message}`, '系统');
            });

            // Start trading
            spinner.text = 'Starting trading...';
            await tradingEngine.startTrading(groups, tradingConfig);

            spinner.succeed(`交易启动成功，共 ${groups.length} 个组`);
            
            Logger.success('\n✓ 交易正在运行', '系统');
            console.log('使用 "trade status" 查看当前状态');
            console.log('使用 "trade stop" 停止交易');
            console.log('使用 "pnl show" 查看盈亏');

        } catch (error) {
            spinner.fail('Failed to start trading');
            Logger.error(`启动交易时出错: ${error.message}`, '系统');
            Logger.error(`启动交易错误: ${error.message}`, '系统');
        }
    });

tradeCmd
    .command('stop')
    .description('Stop automated trading')
    .action(async () => {
        const spinner = ora('Stopping trading engine...').start();
        try {
            await tradingEngine.stopTrading();
            spinner.succeed('Trading stopped successfully');
            Logger.success('✓ All trading activities have been stopped', '系统');
            Logger.info('交易停止操作完成', '系统');
        } catch (error) {
            spinner.fail('Failed to stop trading');
            Logger.error(`停止交易时出错: ${error.message}`, '系统');
            Logger.error(`停止交易错误: ${error.message}`, '系统');
        }
    });

tradeCmd
    .command('status')
    .description('Show trading status')
    .action(() => {
        try {
            const status = tradingEngine.getStatus();
            
            Logger.info('\n📊 交易状态:\n', '系统');
            Logger.info(`状态: ${status.isRunning ? '🟢 运行中' : '🔴 已停止'}`, '系统');
            Logger.info(`总组数: ${status.totalGroups}`, '系统');
            Logger.info(`活跃组数: ${status.activeGroups}`, '系统');
            Logger.info(`总盈亏: ${status.totalPnL >= 0 ? '+' : ''}${status.totalPnL.toFixed(4)} USDT`, '系统');

            if (status.isRunning) {
                Logger.info('\n💡 Use "pnl show" for detailed profit/loss information', '系统');
            }
        } catch (error) {
            Logger.error(`Error getting trading status: ${error.message}`, '系统');
            Logger.error(`获取状态错误: ${error.message}`, '系统');
        }
    });

tradeCmd
    .command('close-all')
    .description('Close all open positions across all accounts')
    .action(async () => {
        const spinner = ora('Closing all positions...').start();
        try {
            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                spinner.text = 'Loading accounts...';
                await accountManager.loadAccounts();
            }

            const result = await tradingEngine.closeAllPositions();
            
            if (result.success) {
                spinner.succeed(`Successfully closed ${result.closedCount} positions`);
                Logger.success(`✓ All positions have been closed`, '系统');
                if (result.errors.length > 0) {
                    Logger.warn(`⚠️  ${result.errors.length} errors occurred:`, '系统');
                    result.errors.forEach(error => {
                        Logger.error(`   - ${error}`, '系统');
                    });
                }
            } else {
                spinner.fail('Failed to close all positions');
                Logger.error('Errors occurred while closing positions:', '系统');
                result.errors.forEach(error => {
                    Logger.error(`   - ${error}`, '系统');
                });
            }
            
            Logger.info(`平仓操作完成: 成功 ${result.closedCount} 个，失败 ${result.errors.length} 个`, '系统');
        } catch (error) {
            spinner.fail('Failed to close all positions');
            Logger.error(error.message, '系统');
            Logger.error(`平仓所有仓位错误: ${error.message}`, '系统');
        }
    });

// P&L Commands
const pnlCmd = program.command('pnl').description('Profit & Loss tracking commands');

pnlCmd
    .command('show')
    .description('Show P&L summary')
    .option('-g, --group <id>', 'Show P&L for specific group')
    .option('-d, --details', 'Show detailed breakdown')
    .action((options) => {
        try {
            if (options.group) {
                // Show specific group P&L
                const groupSummary = pnlTracker.getGroupSummary(options.group);
                if (!groupSummary) {
                    Logger.warn(`No P&L data found for group: ${options.group}`, '系统');
                    return;
                }

                Logger.info(`\n📈 组 ${options.group} 盈亏汇总:\n`, '系统');
                Logger.info(`总盈亏: ${groupSummary.totalPnL >= 0 ? '+' : ''}${groupSummary.totalPnL.toFixed(4)} USDT`, '系统');
                Logger.info(`胜率: ${groupSummary.winRate.toFixed(2)}%`, '系统');
                Logger.info(`交易次数: ${groupSummary.tradeCount}`, '系统');
                Logger.info(`平均收益: ${groupSummary.averageReturn.toFixed(4)} USDT`, '系统');
                Logger.info(`最大盈利: +${groupSummary.maxProfit.toFixed(4)} USDT`, '系统');
                Logger.info(`最大回撤: ${groupSummary.maxDrawdown.toFixed(4)} USDT`, '系统');

                if (options.details && groupSummary.recentTrades.length > 0) {
                    Logger.info('\n📋 近期交易:', '系统');
                    groupSummary.recentTrades.forEach((trade, index) => {
                        const date = new Date(trade.timestamp).toLocaleString();
                        Logger.info(`  ${index + 1}. ${date} - ${trade.symbol} - ${trade.pnl.toFixed(4)} USDT`, '系统');
                    });
                }
            } else {
                // Show overall P&L
                const summary = pnlTracker.getOverallSummary();
                
                Logger.info('\n📊 总体盈亏汇总:\n', '系统');
                Logger.info(`总盈亏: ${summary.totalPnL >= 0 ? '+' : ''}${summary.totalPnL.toFixed(4)} USDT`, '系统');
                Logger.info(`胜率: ${summary.winRate.toFixed(2)}%`, '系统');
                Logger.info(`交易次数: ${summary.totalTrades}`, '系统');
                Logger.info(`活跃组数: ${summary.activeGroups}`, '系统');
                Logger.info(`平均收益: ${summary.averageReturn.toFixed(4)} USDT`, '系统');

                if (options.details) {
                    Logger.info('\n👥 组别对比:', '系统');
                    const groupComparison = pnlTracker.getGroupComparison();
                    groupComparison.forEach((group, index) => {
                        Logger.info(`  ${index + 1}. ${group.groupId} - ${group.totalPnL.toFixed(4)} USDT (胜率 ${group.winRate.toFixed(1)}%)`, `组${group.groupId}`);
                    });
                }
            }
        } catch (error) {
            Logger.error(`显示盈亏失败: ${error.message}`, '系统');
            Logger.error(`显示盈亏错误: ${error.message}`, '系统');
        }
    });

pnlCmd
    .command('export')
    .description('Export P&L data to CSV')
    .option('-f, --file <path>', 'Output file path')
    .action((options) => {
        const spinner = ora('导出盈亏数据...').start();
        try {
            const filePath = pnlTracker.exportToCSV(options.file);
            spinner.succeed(`盈亏数据已导出至: ${filePath}`);
            Logger.info(`盈亏数据导出完成: ${filePath}`, '系统');
        } catch (error) {
            spinner.fail('导出盈亏数据失败');
            Logger.error(error.message, '系统');
            Logger.error(`导出盈亏错误: ${error.message}`, '系统');
        }
    });

pnlCmd
    .command('reset')
    .description('Reset all P&L data')
    .action(async () => {
        const { confirmed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message: '确定要重置所有盈亏数据吗？此操作无法撤销。',
            default: false
        }]);

        if (confirmed) {
            const spinner = ora('重置盈亏数据...').start();
            try {
                pnlTracker.reset();
                spinner.succeed('盈亏数据重置成功');
                Logger.info('盈亏数据重置完成', '系统');
            } catch (error) {
                spinner.fail('重置盈亏数据失败');
                Logger.error(error.message, '系统');
                Logger.error(`重置盈亏错误: ${error.message}`, '系统');
            }
        }
    });

pnlCmd
    .command('clear')
    .description('Clear all P&L statistics data (alias for reset)')
    .action(async () => {
        const { confirmed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message: '确定要清空所有盈亏统计数据吗？此操作无法撤销。',
            default: false
        }]);

        if (confirmed) {
            const spinner = ora('清空盈亏数据...').start();
            try {
                pnlTracker.reset();
                spinner.succeed('盈亏数据清空成功');
                Logger.info('盈亏数据清空完成', '系统');
            } catch (error) {
                spinner.fail('清空盈亏数据失败');
                Logger.error(error.message, '系统');
                Logger.error(`清空盈亏错误: ${error.message}`, '系统');
            }
        }
    });

// Mint Commands
const mintCmd = program.command('mint').description('USDT to USDF conversion commands');

mintCmd
    .command('all')
    .description('Convert all USDT in wallet to USDF')
    .option('-a, --account <name>', 'Account name to use for minting')
    .action(async (options) => {
        const spinner = ora('准备转换 USDT 为 USDF...').start();
        try {
            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                spinner.text = '加载账户...';
                await accountManager.loadAccounts();
            }

            const accounts = accountManager.getAccounts();
            if (accounts.length === 0) {
                spinner.fail('未找到账户');
                Logger.error('请先使用 "account load" 命令加载账户', '系统');
                return;
            }

            let selectedAccount;
            if (options.account) {
                selectedAccount = accounts.find(acc => acc.accountName === options.account);
                if (!selectedAccount) {
                    spinner.fail('账户未找到');
                    Logger.error(`未找到账户: ${options.account}`, '系统');
                    Logger.info('可用账户:', '系统');
                    accounts.forEach(acc => Logger.info(`  - ${acc.accountName}`, '系统'));
                    return;
                }
            } else {
                // Use first account if no specific account specified
                selectedAccount = accounts[0];
                Logger.info(`使用默认账户: ${selectedAccount.accountName}`, '系统');
            }

            // Check if account has private key (secretKey)
            if (!selectedAccount.secretKey || selectedAccount.secretKey.includes('your_secret_key_here')) {
                spinner.fail('账户私钥无效');
                Logger.error(`账户 ${selectedAccount.accountName} 的私钥无效或未配置`, '系统');
                Logger.info('请在 accounts/import.csv 中配置正确的私钥', '系统');
                return;
            }

            spinner.text = `正在转换 ${selectedAccount.accountName} 的所有 USDT...`;
            
            const result = await convertAllUSDTToUSDF(selectedAccount.secretKey);
            
            if (result.success) {
                spinner.succeed(`成功转换 ${result.convertedAmount} USDT 为 USDF`);
                Logger.success(`✓ 转换完成`, '系统');
                Logger.info(`  账户: ${selectedAccount.accountName}`, '系统');
                Logger.info(`  转换数量: ${result.convertedAmount} USDT`, '系统');
                Logger.info(`  交易哈希: ${result.txHash}`, '系统');
                Logger.info(`  Gas 使用: ${result.gasUsed}`, '系统');
                Logger.info(`  新 USDF 余额: ${result.newUSDFBalance} USDF`, '系统');
            } else {
                spinner.fail('转换失败');
                Logger.error(`转换失败: ${result.error || result.message}`, '系统');
            }
            
        } catch (error) {
            spinner.fail('转换过程中出错');
            Logger.error(`转换 USDT 为 USDF 时出错: ${error.message}`, '系统');
        }
    });

mintCmd
    .command('amount <amount>')
    .description('Convert specific amount of USDT to USDF')
    .option('-a, --account <name>', 'Account name to use for minting')
    .action(async (amount, options) => {
        const spinner = ora(`准备转换 ${amount} USDT 为 USDF...`).start();
        try {
            // Validate amount
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount) || numAmount <= 0) {
                spinner.fail('无效的数量');
                Logger.error('请输入有效的 USDT 数量（大于 0 的数字）', '系统');
                return;
            }

            // Load accounts if not already loaded
            if (accountManager.getAccounts().length === 0) {
                spinner.text = '加载账户...';
                await accountManager.loadAccounts();
            }

            const accounts = accountManager.getAccounts();
            if (accounts.length === 0) {
                spinner.fail('未找到账户');
                Logger.error('请先使用 "account load" 命令加载账户', '系统');
                return;
            }

            let selectedAccount;
            if (options.account) {
                selectedAccount = accounts.find(acc => acc.accountName === options.account);
                if (!selectedAccount) {
                    spinner.fail('账户未找到');
                    Logger.error(`未找到账户: ${options.account}`, '系统');
                    Logger.info('可用账户:', '系统');
                    accounts.forEach(acc => Logger.info(`  - ${acc.accountName}`, '系统'));
                    return;
                }
            } else {
                // Use first account if no specific account specified
                selectedAccount = accounts[0];
                Logger.info(`使用默认账户: ${selectedAccount.accountName}`, '系统');
            }

            // Check if account has private key (secretKey)
            if (!selectedAccount.secretKey || selectedAccount.secretKey.includes('your_secret_key_here')) {
                spinner.fail('账户私钥无效');
                Logger.error(`账户 ${selectedAccount.accountName} 的私钥无效或未配置`, '系统');
                Logger.info('请在 accounts/import.csv 中配置正确的私钥', '系统');
                return;
            }

            spinner.text = `正在转换 ${numAmount} USDT...`;
            
            const result = await convertUSDTToUSDF(selectedAccount.secretKey, numAmount);
            
            if (result.success) {
                spinner.succeed(`成功转换 ${result.convertedAmount} USDT 为 USDF`);
                Logger.success(`✓ 转换完成`, '系统');
                Logger.info(`  账户: ${selectedAccount.accountName}`, '系统');
                Logger.info(`  转换数量: ${result.convertedAmount} USDT`, '系统');
                Logger.info(`  交易哈希: ${result.txHash}`, '系统');
                Logger.info(`  Gas 使用: ${result.gasUsed}`, '系统');
                Logger.info(`  新 USDF 余额: ${result.newUSDFBalance} USDF`, '系统');
            } else {
                spinner.fail('转换失败');
                Logger.error(`转换失败: ${result.error}`, '系统');
            }
            
        } catch (error) {
            spinner.fail('转换过程中出错');
            Logger.error(`转换 USDT 为 USDF 时出错: ${error.message}`, '系统');
        }
    });

// Config Commands
const configCmd = program.command('config').description('Configuration management');

configCmd
    .command('show')
    .description('Show current configuration')
    .option('-s, --section <name>', 'Show specific configuration section')
    .action((options) => {
        try {
            if (options.section) {
                const value = configManager.get(options.section);
                if (value !== undefined) {
                    Logger.info(`\n📋 配置 - ${options.section}:\n`, '系统');
                Logger.info(JSON.stringify(value, null, 2), '系统');
                } else {
                    Logger.warn(`配置节 '${options.section}' 未找到`, '系统');
                }
            } else {
                const config = configManager.getAll();
                Logger.info('\n⚙️  当前配置:\n', '系统');
                Logger.info(JSON.stringify(config, null, 2), '系统');
            }
        } catch (error) {
            Logger.error(`显示配置失败: ${error.message}`, '系统');
            Logger.error(`显示配置错误: ${error.message}`, '系统');
        }
    });

configCmd
    .command('set')
    .description('Set configuration value')
    .argument('<path>', 'Configuration path (e.g., trading.positionSizeRange.min)')
    .argument('<value>', 'New value')
    .action((path, value) => {
        try {
            // Try to parse value as JSON first, then as string
            let parsedValue;
            try {
                parsedValue = JSON.parse(value);
            } catch {
                parsedValue = value;
            }

            configManager.set(path, parsedValue);
            Logger.success(`✓ 配置已更新: ${path} = ${JSON.stringify(parsedValue)}`, '系统');
            Logger.info(`配置更新: ${path} = ${parsedValue}`, '系统');
        } catch (error) {
            Logger.error(`设置配置失败: ${error.message}`, '系统');
            Logger.error(`设置配置错误: ${error.message}`, '系统');
        }
    });

configCmd
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
        const { confirmed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message: '确定要将配置重置为默认值吗？',
            default: false
        }]);

        if (confirmed) {
            try {
                configManager.reset();
                Logger.success('✓ 配置已重置为默认值', '系统');
                Logger.info('所有配置重置完成', '系统');
            } catch (error) {
                Logger.error(`重置配置失败: ${error.message}`, '系统');
                Logger.error(`重置配置错误: ${error.message}`, '系统');
            }
        }
    });

// Add error handling and graceful shutdown
process.on('SIGINT', async () => {
    Logger.warn('\n\n🛑 收到中断信号，正在优雅关闭...', '系统');
    
    try {
        if (tradingEngine && tradingEngine.getStatus().isRunning) {
            Logger.info('停止交易引擎...', '系统');
            await tradingEngine.stopTrading();
        }
        
        if (logger) {
            Logger.info('程序被用户中断', '系统');
        }
        
        Logger.success('✓ 关闭完成', '系统');
        process.exit(0);
    } catch (error) {
        Logger.error(`关闭过程中出错: ${error.message}`, '系统');
        process.exit(1);
    }
});

process.on('uncaughtException', (error) => {
    Logger.error(`未捕获异常: ${error.message}`, '系统');
    Logger.error(`未捕获异常详情: ${error.stack}`, '系统');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error(`未处理的Promise拒绝: ${promise}, reason: ${reason}`, '系统');
    Logger.error(`未处理Promise拒绝详情: ${reason}`, '系统');
    process.exit(1);
});

// Initialize and run CLI
initialize();

program.parse();