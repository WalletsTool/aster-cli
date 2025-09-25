import AsterAPI from '../utils/asterApi.js';
import { EventEmitter } from 'events';
import { AccountManager } from '../utils/accountManager.js';
import ConfigManager from '../utils/config.js';
import Logger from '../utils/logger.js';

export class TradingEngine extends EventEmitter {
    constructor(accountManager) {
        super();
        this.accountManager = accountManager;
        this.configManager = new ConfigManager();
        this.supportedCoins = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
        this.activeGroups = new Map(); // groupId -> group trading data
        this.groupPositions = new Map(); // groupId -> positions
        this.groupPnL = new Map(); // groupId -> P&L data
        this.isRunning = false;
    }

    /**
     * Generate random position size within configured range
     */
    generateRandomPositionSize() {
        const tradingConfig = this.configManager.getTradingConfig();
        const { min, max } = tradingConfig.positionSizeRange || { min: 400, max: 600 };
        const randomSize = Math.random() * (max - min) + min;
        return Math.round(randomSize * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Generate random close time within configured range
     */
    generateRandomCloseTime() {
        const tradingConfig = this.configManager.getTradingConfig();
        const { min, max } = tradingConfig.closeAfterMinutesRange || { min: 30, max: 90 };
        const randomMinutes = Math.random() * (max - min) + min;
        return Math.round(randomMinutes); // Round to whole minutes
    }

    /**
     * Calculate quantity based on position size and leverage
     */
    calculateQuantity(positionSizeUSDT, currentPrice, leverage = null, symbol = 'BTCUSDT') {
        const tradingConfig = this.configManager.getTradingConfig();
        const actualLeverage = leverage || tradingConfig.leverage || 5;
        
        // Calculate quantity: (Position Size * Leverage) / Current Price
        const quantity = (positionSizeUSDT * actualLeverage) / currentPrice;
        
        // Apply symbol-specific precision rules
        let precision = 3; // Default precision
        if (symbol.includes('BTC')) {
            precision = 3; // BTC pairs typically use 3 decimal places
        } else if (symbol.includes('ETH')) {
            precision = 2; // ETH pairs typically use 2 decimal places
        } else if (symbol.includes('BNB')) {
            precision = 1; // BNB pairs typically use 1 decimal place
        }
        
        const multiplier = Math.pow(10, precision);
        return Math.round(quantity * multiplier) / multiplier;
    }

    /**
     * Start trading for groups
     */
    async startTrading(groups, tradingConfig = {}) {
        if (this.isRunning) {
            throw new Error('Trading is already running');
        }

        this.isRunning = true;
        Logger.info(`🚀 启动交易 ${groups.length} 组`, '系统');

        const config = {
            positionSize: 100,    // Default position size
            leverage: 10,         // Default leverage
            closeAfterMinutes: 60, // Close positions after 60 minutes
            maxDelay: 30000,      // Max delay between paired orders (30 seconds)
            minDelay: 10000,      // Min delay between paired orders (10 seconds)
            ...tradingConfig
        };

        try {
            // Initialize all groups
            for (const group of groups) {
                await this.initializeGroup(group, config);
            }

            // Start trading cycles for each group
            for (const group of groups) {
                this.startGroupTrading(group, config);
            }

            this.emit('tradingStarted', { groups: groups.length, config });
        } catch (error) {
            this.isRunning = false;
            Logger.error(`Error starting trading: ${error.message}`, '系统');
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Initialize a trading group
     */
    async initializeGroup(group, config) {
        Logger.info(`📊 组 ${group.id} 初始化 ${group.accounts.length} 个账户`, `组${group.id}`);

        // Create API clients for each account in the group with account reference
        const apiClients = group.accounts.map(account => {
            const client = new AsterAPI(account.apiKey, account.secretKey);
            // Store account reference for matching
            client.accountName = account.accountName;
            client.apiKey = account.apiKey;
            return client;
        });

        const groupData = {
            id: group.id,
            accounts: group.accounts,
            pairs: group.pairs,
            apiClients: apiClients,
            currentCycle: 0,
            totalPnL: 0,
            isActive: true,
            lastTradeTime: null,
            positions: []
        };

        this.activeGroups.set(group.id, groupData);
        this.groupPositions.set(group.id, []);
        this.groupPnL.set(group.id, {
            totalPnL: 0,
            trades: [],
            currentCycle: 0
        });

        Logger.info(`🔄 启动组 ${group.id} 交易循环 ${group.accounts.length} 个账户`, `组${group.id}`);
    }

    /**
     * Start trading cycle for a specific group
     */
    async startGroupTrading(group, config) {
        const groupData = this.activeGroups.get(group.id);
        
        while (this.isRunning) {
            // Check if group has critical error and needs to wait for retry
            if (groupData.criticalError && groupData.retryAfter) {
                const now = Date.now();
                if (now < groupData.retryAfter) {
                    const waitTime = groupData.retryAfter - now;
                    const waitMinutes = Math.ceil(waitTime / (60 * 1000));
                    Logger.warn(`⏳ Group ${group.id} waiting ${waitMinutes} more minutes before retry due to critical error`, `组${group.id}`);
                    await this.sleep(30000); // Check every 30 seconds
                    continue;
                } else {
                    // Retry time has passed, reactivate the group
                    Logger.info(`🔄 Retry time reached for group ${group.id}, reactivating...`, `组${group.id}`);
                    groupData.isActive = true;
                    groupData.criticalError = false;
                    groupData.retryAfter = null;
                    this.emit('groupReactivated', {
                        groupId: group.id,
                        message: 'Group reactivated after critical error retry period'
                    });
                }
            }
            
            // Check if there are any active groups remaining
            const activeGroupsCount = this.checkActiveGroups();
            if (activeGroupsCount === 0) {
                Logger.warn(`🛑 未发现活跃组，停止交易程序`, '系统');
                Logger.warn(`   所有组因错误或保证金不足已被停用`, '系统');
                await this.stopTrading();
                return; // Exit the trading loop
            }
            
            // Skip if group is not active (but continue loop for potential reactivation)
            if (!groupData.isActive) {
                await this.sleep(30000); // Check every 30 seconds
                continue;
            }
            
            try {
                Logger.info(`\n--- 开始组 ${group.id} 的交易周期 ${groupData.currentCycle + 1} ---`, `组${group.id}`);
                
                // Select random coin for this cycle
                const selectedCoin = this.selectRandomCoin();
                Logger.info(`组 ${group.id} 随机选择币种: ${selectedCoin}`, `组${group.id}`);

                // Open hedged positions for all pairs in the group
                const openedPositions = await this.openGroupPositions(groupData, selectedCoin, config);

                // Check if group encountered critical error during position opening
                if (groupData.criticalError) {
                    Logger.error(`🚨 Group ${group.id} encountered critical error, entering retry wait period`, `组${group.id}`);
                    continue; // Go back to wait loop
                }
                
                // Check if group is still active after opening positions
                if (!groupData.isActive) {
                    Logger.warn(`Group ${group.id} was deactivated during position opening`, `组${group.id}`);
                    continue; // Continue loop for potential reactivation
                }

                // Only proceed with waiting and closing if positions were successfully opened
                if (openedPositions > 0) {
                    // Generate random close time for this group (all positions in group will use same time)
                    const randomCloseMinutes = this.generateRandomCloseTime();
                    const closeTime = randomCloseMinutes * 60 * 1000;
                    Logger.info(`⏰ 组 ${group.id} 等待 ${randomCloseMinutes} 分钟后平仓...`, `组${group.id}`);
                    
                    await this.sleep(closeTime);

                    // Close all positions for this group
                    await this.closeGroupPositions(groupData, selectedCoin);
                } else {
                    Logger.warn(`No positions were opened for group ${group.id}, skipping wait and close cycle`, `组${group.id}`);
                }

                // Calculate and record P&L for this cycle
                await this.updateGroupPnL(groupData);

                groupData.currentCycle++;
                groupData.lastTradeTime = Date.now();

                // Emit cycle completed event
                this.emit('cycleCompleted', {
                    groupId: group.id,
                    cycle: groupData.currentCycle,
                    coin: selectedCoin,
                    pnl: this.groupPnL.get(group.id)
                });

                // Small delay between cycles
                await this.sleep(5000);

            } catch (error) {
                Logger.error(`Error in trading cycle for group ${group.id}: ${error.message}`, `组${group.id}`);
                
                // Check if error is insufficient margin
                if (this.isInsufficientMarginError(error)) {
                    Logger.warn(`Group ${group.id} has insufficient margin, deactivating group`, `组${group.id}`);
                    groupData.isActive = false;
                    this.emit('groupDeactivated', { 
                        groupId: group.id, 
                        reason: 'insufficient_margin',
                        error 
                    });
                    continue; // Continue loop for potential reactivation
                }
                
                this.emit('groupError', { groupId: group.id, error });
                
                // Continue with next cycle after error
                await this.sleep(10000);
            }
        }

        Logger.info(`Trading stopped for group ${group.id}`, `组${group.id}`);
    }

    /**
     * Open hedged positions for all pairs in a group with retry mechanism
     * @returns {number} Number of successfully opened position pairs
     */
    async openGroupPositions(groupData, symbol, config) {
        Logger.info(`🔄 组 ${groupData.id} 开仓 ${symbol}`, `组${groupData.id}`);
        
        const newPositions = [];
        let insufficientMarginCount = 0;
        let criticalErrorOccurred = false;
        
        // Generate random position size once for the entire group to ensure consistency
        const groupPositionSizeUSDT = this.generateRandomPositionSize();
        Logger.info(`组 ${groupData.id} 随机仓位大小: ${groupPositionSizeUSDT} USDT`, `组${groupData.id}`);

        for (const pair of groupData.pairs) {
            if (criticalErrorOccurred) {
                Logger.error(`⚠️ Critical error occurred, stopping position opening for group ${groupData.id}`, `组${groupData.id}`);
                break;
            }

            const pairResult = await this.openPairPositionWithRetry(
                pair, symbol, groupPositionSizeUSDT, groupData, config
            );
            
            if (pairResult.success) {
                newPositions.push(pairResult.positionPair);
                this.emit('positionOpened', pairResult.positionPair);
            } else if (pairResult.isInsufficientMargin) {
                insufficientMarginCount++;
                Logger.warn(`Pair ${pair.pairId} has insufficient margin, skipping this pair`, `组${groupData.id}`);
                this.emit('insufficientMargin', { 
                    pairId: pair.pairId, 
                    accounts: [pair.long.accountName, pair.short.accountName],
                    error: pairResult.error 
                });
                
                // If all pairs have insufficient margin, deactivate the group
                if (insufficientMarginCount === groupData.pairs.length) {
                    Logger.error(`检测到保证金不足，停用组 ${groupData.id}`, `组${groupData.id}`);
                    groupData.isActive = false;
                    this.emit('groupDeactivated', {
                        groupId: groupData.id,
                        reason: 'all_pairs_insufficient_margin',
                        error: pairResult.error
                    });
                    break;
                }
            } else if (pairResult.isCriticalError) {
                // Critical error - stop entire group and mark for retry
                Logger.error(`组 ${groupData.id} 发生严重错误, pair ${pair.pairId}: ${pairResult.error.message}`, `组${groupData.id}`);
                Logger.error(`停止组 ${groupData.id} 所有交易，10分钟后重试`, `组${groupData.id}`);
                
                criticalErrorOccurred = true;
                groupData.isActive = false;
                groupData.criticalError = true;
                groupData.retryAfter = Date.now() + (10 * 60 * 1000); // 10 minutes
                
                this.emit('criticalGroupError', {
                    groupId: groupData.id,
                    pairId: pair.pairId,
                    error: pairResult.error,
                    retryAfter: groupData.retryAfter
                });
                
                // Close any positions that were already opened in this cycle
                if (newPositions.length > 0) {
                    Logger.warn(`🔄 Closing ${newPositions.length} positions due to critical error`, `组${groupData.id}`);
                    await this.closePartialGroupPositions(groupData, newPositions);
                }
                
                break;
            }
        }

        // Update group positions only if no critical error occurred
        if (!criticalErrorOccurred) {
            const groupPositions = this.groupPositions.get(groupData.id);
            groupPositions.push(...newPositions);
            
            groupData.positions = groupPositions;
            Logger.success(`✅ Opened ${newPositions.length} position pairs for group ${groupData.id}`, `组${groupData.id}`);
        }
        
        return newPositions.length;
    }

    /**
     * Open position pair with retry mechanism
     */
    async openPairPositionWithRetry(pair, symbol, groupPositionSizeUSDT, groupData, config) {
        const maxRetries = 3;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Logger.info(`📈 组 ${groupData.id} 交易对 ${pair.pairId} 重试 ${attempt}/${maxRetries}`, `组${groupData.id}`);
                
                // Get API clients
                const longClient = groupData.apiClients.find(client => 
                    client.accountName === pair.long.accountName
                );
                const shortClient = groupData.apiClients.find(client => 
                    client.accountName === pair.short.accountName
                );

                if (!longClient || !shortClient) {
                    throw new Error(`Could not find API clients for pair ${pair.pairId}`);
                }

                // Set leverage for both accounts before opening positions
                const leverage = config.leverage || 5; // Use config leverage or default to 5
                try {
                    Logger.info(`⚙️ 设置 ${pair.long.accountName} 杠杆倍数: ${leverage}`, `组${groupData.id}`);
                    await longClient.setLeverage(symbol, leverage);
                    Logger.info(`⚙️ 设置 ${pair.short.accountName} 杠杆倍数: ${leverage}`, `组${groupData.id}`);
                    await shortClient.setLeverage(symbol, leverage);
                    Logger.success(`✅ 杠杆设置成功: ${leverage}x`, `组${groupData.id}`);
                } catch (leverageError) {
                    Logger.warn(`⚠️ 杠杆设置失败: ${leverageError.message}`, `组${groupData.id}`);
                    // Continue with trading even if leverage setting fails
                }

                // Get current market price
                const priceData = await longClient.getSymbolPrice(symbol);
                const currentPrice = parseFloat(priceData.price);
                Logger.info(`${symbol} 当前价格: ${currentPrice}`, `组${groupData.id}`);

                // Calculate quantity
                const quantity = this.calculateQuantity(groupPositionSizeUSDT, currentPrice, null, symbol);
                Logger.info(`交易对 ${pair.pairId} - 仓位大小: ${groupPositionSizeUSDT} USDT, 计算数量: ${quantity}`, `组${groupData.id}`);
                
                // Place long order with retry
                Logger.info(`📈 ${pair.long.accountName} 下多头单 ${symbol}`, pair.long.accountName);
                const longOrder = await this.placeOrderWithRetry(longClient, symbol, 'BUY', 'MARKET', {
                    positionSide: 'BOTH',
                    quantity: quantity.toString()
                }, attempt);

                Logger.success(`✅ 交易对 ${pair.pairId} 多头订单下单成功: ${longOrder.orderId || 'N/A'}`, pair.long.accountName);

                // Wait random delay before placing short order (using config parameters)
                const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay) + config.minDelay);
                Logger.info(`等待 ${delay}ms 后下空头订单...`, `组${groupData.id}`);
                await this.sleep(delay);

                // Place short order with retry
                Logger.info(`📉 ${pair.short.accountName} 下空头单 ${symbol}`, pair.short.accountName);
                const shortOrder = await this.placeOrderWithRetry(shortClient, symbol, 'SELL', 'MARKET', {
                    positionSide: 'BOTH',
                    quantity: quantity.toString()
                }, attempt);

                Logger.success(`✅ 交易对 ${pair.pairId} 空头订单下单成功: ${shortOrder.orderId || 'N/A'}`, pair.short.accountName);

                // Create position pair record
                const positionPair = {
                    pairId: pair.pairId,
                    symbol: symbol,
                    openTime: Date.now(),
                    longOrder: longOrder,
                    shortOrder: shortOrder,
                    longAccount: pair.long,
                    shortAccount: pair.short,
                    quantity: quantity,
                    positionSizeUSDT: groupPositionSizeUSDT,
                    openPrice: currentPrice,
                    status: 'open'
                };

                Logger.success(`✅ 交易对 ${pair.pairId} 开仓成功`, `组${groupData.id}`);
                return { success: true, positionPair };

            } catch (error) {
                lastError = error;
                Logger.error(`❌ 交易对 ${pair.pairId} 重试 ${attempt}/${maxRetries} 失败: ${error.message}`, `组${groupData.id}`);
                
                // Check if error is insufficient margin
                if (this.isInsufficientMarginError(error)) {
                    Logger.warn(`⚠️ 交易对 ${pair.pairId} 保证金不足，跳过...`, `组${groupData.id}`);
                    return { 
                        success: false, 
                        isInsufficientMargin: true, 
                        error 
                    };
                }
                
                // If this is the last attempt, it's a critical error
                if (attempt === maxRetries) {
                    return { 
                        success: false, 
                        isCriticalError: true, 
                        error 
                    };
                }
                
                // Wait before retry (exponential backoff)
                const retryDelay = 1000 * attempt;
                Logger.info(`⏳ ${retryDelay}ms后重试...`, `组${groupData.id}`);
                await this.sleep(retryDelay);
            }
        }
        
        return { 
            success: false, 
            isCriticalError: true, 
            error: lastError 
        };
    }

    /**
     * Place order with internal retry for network issues
     */
    async placeOrderWithRetry(client, symbol, side, type, params, currentAttempt) {
        try {
            return await client.placeOrder(symbol, side, type, params);
        } catch (error) {
            Logger.error(`Order placement failed (attempt ${currentAttempt}): ${error.message}`, '系统');
            throw error;
        }
    }

    /**
     * Close partial group positions in case of critical error
     */
    async closePartialGroupPositions(groupData, positions) {
        Logger.warn(`🚨 组 ${groupData.id} 紧急部分平仓`, `组${groupData.id}`);
        
        for (const position of positions) {
            try {
                const longClient = groupData.apiClients.find(client => 
                    client.accountName === position.longAccount.accountName
                );
                const shortClient = groupData.apiClients.find(client => 
                    client.accountName === position.shortAccount.accountName
                );

                if (longClient && shortClient) {
                    // Close long position
                    await longClient.placeOrder(position.symbol, 'SELL', 'MARKET', {
                        positionSide: 'BOTH',
                        quantity: position.quantity.toString(),
                        reduceOnly: 'true'
                    });

                    // Close short position
                    await shortClient.placeOrder(position.symbol, 'BUY', 'MARKET', {
                        positionSide: 'BOTH',
                        quantity: position.quantity.toString(),
                        reduceOnly: 'true'
                    });
                    
                    position.status = 'emergency_closed';
                    Logger.info(`🔄 平仓对 ${position.pairId} ${position.symbol}`, `组${groupData.id}`);
                    Logger.success(`✅ ${position.longAccount.accountName} 多头平仓成功`, position.longAccount.accountName);
                    Logger.success(`✅ ${position.shortAccount.accountName} 空头平仓成功`, position.shortAccount.accountName);
                }
            } catch (error) {
                Logger.error(`❌ ${position.longAccount.accountName} 多头平仓失败: ${error.message}`, position.longAccount.accountName);
                Logger.error(`❌ ${position.shortAccount.accountName} 空头平仓失败: ${error.message}`, position.shortAccount.accountName);
            }
        }
    }

    /**
     * Close all positions for a group
     */
    async closeGroupPositions(groupData, symbol) {
        Logger.info(`🔄 组 ${groupData.id} 平仓所有仓位`, `组${groupData.id}`);

        const groupPositions = this.groupPositions.get(groupData.id);
        const openPositions = groupPositions.filter(pos => pos.status === 'open');

        for (const position of openPositions) {
            try {
                const longClient = groupData.apiClients.find(client => 
                    client.accountName === position.longAccount.accountName
                );
                const shortClient = groupData.apiClients.find(client => 
                    client.accountName === position.shortAccount.accountName
                );

                // Close long position (sell)
                Logger.info(`平仓 ${position.longAccount.accountName} 的多头仓位`, position.longAccount.accountName);
                const closeLongOrder = await longClient.placeOrder(symbol, 'SELL', 'MARKET', {
                    positionSide: 'BOTH',
                    quantity: position.quantity.toString(),
                    reduceOnly: 'true'
                });

                // Close short position (buy)
                Logger.info(`平仓 ${position.shortAccount.accountName} 的空头仓位`, position.shortAccount.accountName);
                const closeShortOrder = await shortClient.placeOrder(symbol, 'BUY', 'MARKET', {
                    positionSide: 'BOTH',
                    quantity: position.quantity.toString(),
                    reduceOnly: 'true'
                });

                // Update position record
                position.closeTime = Date.now();
                position.closeLongOrder = closeLongOrder;
                position.closeShortOrder = closeShortOrder;
                position.status = 'closed';

                this.emit('positionClosed', position);

            } catch (error) {
                Logger.error(`Error closing position ${position.pairId}: ${error.message}`, `组${groupData.id}`);
                this.emit('closeError', { positionId: position.pairId, error });
            }
        }

        Logger.success(`Closed positions for group ${groupData.id}`, `组${groupData.id}`);
    }

    /**
     * Update P&L calculation for a group
     */
    async updateGroupPnL(groupData) {
        Logger.info(`更新组 ${groupData.id} 的盈亏...`, `组${groupData.id}`);

        const groupPnL = this.groupPnL.get(groupData.id);
        const groupPositions = this.groupPositions.get(groupData.id);
        const closedPositions = groupPositions.filter(pos => pos.status === 'closed');

        let cyclePnL = 0;

        for (const position of closedPositions) {
            // This is a simplified P&L calculation
            // In reality, you would need to fetch actual execution prices and fees
            const longPnL = this.calculatePositionPnL(position.longOrder, position.closeLongOrder, 'LONG');
            const shortPnL = this.calculatePositionPnL(position.shortOrder, position.closeShortOrder, 'SHORT');
            
            const pairPnL = longPnL + shortPnL;
            cyclePnL += pairPnL;

            Logger.info(`Pair ${position.pairId} P&L: ${pairPnL.toFixed(4)} USDT`, `组${groupData.id}`);
        }

        groupPnL.totalPnL += cyclePnL;
        groupPnL.currentCycle = groupData.currentCycle + 1;
        groupPnL.trades.push({
            cycle: groupData.currentCycle + 1,
            timestamp: Date.now(),
            pnl: cyclePnL,
            positions: closedPositions.length
        });

        Logger.info(`组 ${groupData.id} 周期盈亏: ${cyclePnL.toFixed(4)} USDT`, `组${groupData.id}`);
        Logger.info(`💰 组 ${groupData.id} 盈亏: ${groupPnL.totalPnL.toFixed(4)} USDT (周期 ${groupPnL.currentCycle})`, `组${groupData.id}`);

        this.emit('pnlUpdated', {
            groupId: groupData.id,
            cyclePnL: cyclePnL,
            totalPnL: groupPnL.totalPnL
        });
    }

    /**
     * Calculate P&L for a single position (simplified)
     */
    calculatePositionPnL(openOrder, closeOrder, side) {
        // This is a simplified calculation
        // In practice, you'd need actual execution prices from the API
        try {
            const openPrice = parseFloat(openOrder.price || openOrder.avgPrice || 0);
            const closePrice = parseFloat(closeOrder.price || closeOrder.avgPrice || 0);
            const quantity = parseFloat(openOrder.origQty || openOrder.executedQty || 0);

            if (side === 'LONG') {
                return (closePrice - openPrice) * quantity;
            } else {
                return (openPrice - closePrice) * quantity;
            }
        } catch (error) {
            Logger.error(`Error calculating P&L: ${error.message}`, '系统');
            return 0;
        }
    }

    /**
     * Select random coin from supported list
     */
    selectRandomCoin() {
        const randomIndex = Math.floor(Math.random() * this.supportedCoins.length);
        return this.supportedCoins[randomIndex];
    }

    /**
     * Check if error is insufficient margin error
     */
    isInsufficientMarginError(error) {
        // Check for Aster API insufficient margin error code
        if (error && error.message) {
            const errorStr = error.message.toLowerCase();
            // Check for error code -2019 or margin insufficient message
            return errorStr.includes('code: -2019') || 
                   errorStr.includes('margin is insufficient') ||
                   errorStr.includes('insufficient margin');
        }
        return false;
    }

    /**
     * Stop trading for all groups
     */
    async stopTrading() {
        Logger.info('停止交易', '系统');
        this.isRunning = false;

        // Mark all groups as inactive
        for (const [groupId, groupData] of this.activeGroups) {
            groupData.isActive = false;
        }

        this.emit('tradingStopped');
    }

    /**
     * Stop trading for a specific group
     */
    async stopGroupTrading(groupId) {
        const groupData = this.activeGroups.get(groupId);
        if (groupData) {
            Logger.info(`停止组 ${groupId}`, `组${groupId}`);
            groupData.isActive = false;
            this.emit('groupStopped', { groupId });
        }
    }

    /**
     * Get P&L for a specific group
     */
    getGroupPnL(groupId) {
        return this.groupPnL.get(groupId) || { totalPnL: 0, trades: [], currentCycle: 0 };
    }

    /**
     * Get P&L for all groups
     */
    getAllGroupsPnL() {
        const result = {};
        for (const [groupId, pnlData] of this.groupPnL) {
            result[groupId] = pnlData;
        }
        return result;
    }

    /**
     * Get total P&L across all groups
     */
    getTotalPnL() {
        let total = 0;
        for (const [_, pnlData] of this.groupPnL) {
            total += pnlData.totalPnL;
        }
        return total;
    }

    /**
     * Check how many groups are currently active
     * @returns {number} Number of active groups
     */
    checkActiveGroups() {
        const activeGroupsCount = Array.from(this.activeGroups.values())
            .filter(group => group.isActive).length;
        return activeGroupsCount;
    }

    /**
     * Get trading status
     */
    getStatus() {
        const activeGroupsCount = this.checkActiveGroups();

        return {
            isRunning: this.isRunning,
            totalGroups: this.activeGroups.size,
            activeGroups: activeGroupsCount,
            totalPnL: this.getTotalPnL()
        };
    }

    /**
     * Close all open positions across all accounts
     * @returns {Object} Result object with success status, closed count, and errors
     */
    async closeAllPositions() {
        const result = {
            success: true,
            closedCount: 0,
            errors: []
        };

        try {
            Logger.info('🔄 开始平仓', '系统');
            
            // Get all accounts from account manager
            const accounts = this.accountManager.getAccounts();
            
            if (accounts.length === 0) {
                Logger.warn('⚠️  无账户', '系统');
                return result;
            }

            Logger.info(`📋 检查 ${accounts.length} 个账户`, '系统');

            // Process each account
            for (const account of accounts) {
                try {
                    Logger.info(`🔍 检查账户: ${account.accountName}`, account.accountName);
                    
                    // Validate API key configuration before processing
                    if (account.apiKey === account.secretKey) {
                        Logger.warn(`⚠️  跳过账户 ${account.accountName} - API配置无效`, account.accountName);
                        Logger.warn(`   请更新 ${account.accountName} 的API凭据`, account.accountName);
                        const errorMsg = `Account ${account.accountName} has invalid API key configuration (identical apiKey and secretKey)`;
                        result.errors.push(errorMsg);
                        continue;
                    }
                    
                    // Create API instance for this account
                    const api = new AsterAPI(account.apiKey, account.secretKey);
                    
                    // Get current positions for this account
                    const positions = await api.getPositions();
                    
                    if (!positions || positions.length === 0) {
                        Logger.info(`   ✓ ${account.accountName} 无仓位`, account.accountName);
                        continue;
                    }

                    // Filter out positions with zero or near-zero amounts
                    const openPositions = positions.filter(position => {
                        const positionAmt = parseFloat(position.positionAmt || 0);
                        return Math.abs(positionAmt) > 0.001;
                    });

                    if (openPositions.length === 0) {
                        Logger.info(`   ✅ ${account.accountName} 无开放仓位`, account.accountName);
                        continue;
                    }

                    Logger.info(`   📊 ${account.accountName} 发现 ${openPositions.length} 个开放仓位`, account.accountName);

                    // Close each open position
                    for (const position of openPositions) {
                        try {
                            const positionAmt = parseFloat(position.positionAmt);
                            const side = positionAmt > 0 ? 'LONG' : 'SHORT';
                            
                            Logger.info(`   🔄 平仓 ${position.symbol} (${side}, ${positionAmt})`, account.accountName);
                            
                            // Determine opposite side for closing
                            const closeSide = positionAmt > 0 ? 'SELL' : 'BUY';
                            
                            // Close the position
                            await api.placeOrder(
                                position.symbol,
                                closeSide,
                                'MARKET',
                                {
                                    quantity: Math.abs(positionAmt).toString(),
                                    reduceOnly: true
                                }
                            );
                            
                            result.closedCount++;
                            Logger.success(`   ✅ 平仓成功 ${position.symbol}`, account.accountName);
                            
                            // Small delay between closing positions
                            await this.sleep(500);
                            
                        } catch (positionError) {
                            const errorMsg = `平仓失败 ${position.symbol} (${account.accountName}): ${positionError.message}`;
                            Logger.error(`   ❌ ${errorMsg}`, account.accountName);
                            result.errors.push(errorMsg);
                            result.success = false;
                        }
                    }
                    
                } catch (accountError) {
                    const errorMsg = `账户处理失败 ${account.accountName}: ${accountError.message}`;
                    Logger.error(`❌ ${errorMsg}`, account.accountName);
                    result.errors.push(errorMsg);
                    result.success = false;
                }
                
                // Small delay between accounts
                await this.sleep(1000);
            }

            Logger.info(`\n📊 平仓汇总:`, '系统');
            Logger.info(`   已平仓: ${result.closedCount}`, '系统');
            Logger.info(`   错误数: ${result.errors.length}`, '系统');
            
            if (result.closedCount > 0) {
                Logger.success('✅ 平仓完成', '系统');
            } else {
                Logger.info('ℹ️  无仓位需平仓', '系统');
            }
            
        } catch (error) {
            Logger.error(`❌ 平仓关键错误: ${error.message}`, '系统');
            result.success = false;
            result.errors.push(`Critical error: ${error.message}`);
        }

        return result;
    }

    /**
     * Utility function for sleeping
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default TradingEngine;