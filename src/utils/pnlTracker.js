import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PnLTracker {
    constructor(dataPath = path.join(__dirname, '../../logs/pnl-data.json')) {
        this.dataPath = dataPath;
        this.data = {
            totalPnL: 0,
            groups: {},
            dailyStats: {},
            monthlyStats: {},
            trades: [],
            startDate: null,
            lastUpdated: null
        };
        this.loadData();
    }

    /**
     * Load existing P&L data from file
     */
    loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const fileData = fs.readFileSync(this.dataPath, 'utf8');
                this.data = { ...this.data, ...JSON.parse(fileData) };
                console.log('盈亏数据加载成功');
            } else {
                console.log('未找到现有盈亏数据，重新开始');
                this.data.startDate = new Date().toISOString();
            }
        } catch (error) {
            console.error('加载盈亏数据失败:', error);
            // Continue with default data
        }
    }

    /**
     * Save P&L data to file
     */
    saveData() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.data.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('保存盈亏数据失败:', error);
        }
    }

    /**
     * Record a new trade and update P&L
     */
    recordTrade(groupId, tradeData) {
        const timestamp = Date.now();
        const dateKey = this.getDateKey(timestamp);
        const monthKey = this.getMonthKey(timestamp);

        // Initialize group data if not exists
        if (!this.data.groups[groupId]) {
            this.data.groups[groupId] = {
                totalPnL: 0,
                tradeCount: 0,
                winCount: 0,
                lossCount: 0,
                maxDrawdown: 0,
                maxProfit: 0,
                averageReturn: 0,
                lastTradeTime: null,
                trades: []
            };
        }

        // Record the trade
        const trade = {
            id: `${groupId}_${timestamp}`,
            groupId: groupId,
            timestamp: timestamp,
            pnl: tradeData.pnl,
            positions: tradeData.positions || 0,
            symbol: tradeData.symbol || 'UNKNOWN',
            cycle: tradeData.cycle || 0,
            ...tradeData
        };

        // Update group stats
        const group = this.data.groups[groupId];
        group.totalPnL += tradeData.pnl;
        group.tradeCount++;
        group.lastTradeTime = timestamp;
        group.trades.push(trade);

        if (tradeData.pnl > 0) {
            group.winCount++;
            if (tradeData.pnl > group.maxProfit) {
                group.maxProfit = tradeData.pnl;
            }
        } else if (tradeData.pnl < 0) {
            group.lossCount++;
            if (tradeData.pnl < group.maxDrawdown) {
                group.maxDrawdown = tradeData.pnl;
            }
        }

        // Calculate average return
        group.averageReturn = group.totalPnL / group.tradeCount;

        // Update overall stats
        this.data.totalPnL += tradeData.pnl;
        this.data.trades.push(trade);

        // Update daily stats
        if (!this.data.dailyStats[dateKey]) {
            this.data.dailyStats[dateKey] = {
                date: dateKey,
                pnl: 0,
                tradeCount: 0,
                winCount: 0,
                lossCount: 0
            };
        }

        const dailyStat = this.data.dailyStats[dateKey];
        dailyStat.pnl += tradeData.pnl;
        dailyStat.tradeCount++;
        if (tradeData.pnl > 0) dailyStat.winCount++;
        else if (tradeData.pnl < 0) dailyStat.lossCount++;

        // Update monthly stats
        if (!this.data.monthlyStats[monthKey]) {
            this.data.monthlyStats[monthKey] = {
                month: monthKey,
                pnl: 0,
                tradeCount: 0,
                winCount: 0,
                lossCount: 0
            };
        }

        const monthlyStat = this.data.monthlyStats[monthKey];
        monthlyStat.pnl += tradeData.pnl;
        monthlyStat.tradeCount++;
        if (tradeData.pnl > 0) monthlyStat.winCount++;
        else if (tradeData.pnl < 0) monthlyStat.lossCount++;

        // Save data
        this.saveData();

        return trade;
    }

    /**
     * Get P&L summary for a specific group
     */
    getGroupSummary(groupId) {
        const group = this.data.groups[groupId];
        if (!group) {
            return null;
        }

        const winRate = group.tradeCount > 0 ? (group.winCount / group.tradeCount * 100) : 0;
        const profitFactor = Math.abs(group.maxDrawdown) > 0 ? (group.maxProfit / Math.abs(group.maxDrawdown)) : 0;

        return {
            groupId: groupId,
            totalPnL: group.totalPnL,
            tradeCount: group.tradeCount,
            winCount: group.winCount,
            lossCount: group.lossCount,
            winRate: winRate,
            averageReturn: group.averageReturn,
            maxProfit: group.maxProfit,
            maxDrawdown: group.maxDrawdown,
            profitFactor: profitFactor,
            lastTradeTime: group.lastTradeTime,
            recentTrades: group.trades.slice(-5) // Last 5 trades
        };
    }

    /**
     * Get overall P&L summary
     */
    getOverallSummary() {
        const totalTrades = this.data.trades.length;
        const totalWins = this.data.trades.filter(trade => trade.pnl > 0).length;
        const totalLosses = this.data.trades.filter(trade => trade.pnl < 0).length;
        const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;

        const maxProfit = Math.max(...this.data.trades.map(t => t.pnl), 0);
        const maxLoss = Math.min(...this.data.trades.map(t => t.pnl), 0);
        const averageReturn = totalTrades > 0 ? (this.data.totalPnL / totalTrades) : 0;
        const profitFactor = Math.abs(maxLoss) > 0 ? (maxProfit / Math.abs(maxLoss)) : 0;

        return {
            totalPnL: this.data.totalPnL,
            totalTrades: totalTrades,
            winCount: totalWins,
            lossCount: totalLosses,
            winRate: winRate,
            averageReturn: averageReturn,
            maxProfit: maxProfit,
            maxLoss: maxLoss,
            profitFactor: profitFactor,
            startDate: this.data.startDate,
            lastUpdated: this.data.lastUpdated,
            activeGroups: Object.keys(this.data.groups).length
        };
    }

    /**
     * Get daily P&L statistics
     */
    getDailyStats(days = 30) {
        const sortedDays = Object.keys(this.data.dailyStats)
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, days);

        return sortedDays.map(dateKey => ({
            ...this.data.dailyStats[dateKey],
            winRate: this.data.dailyStats[dateKey].tradeCount > 0 
                ? (this.data.dailyStats[dateKey].winCount / this.data.dailyStats[dateKey].tradeCount * 100) 
                : 0
        }));
    }

    /**
     * Get monthly P&L statistics
     */
    getMonthlyStats(months = 12) {
        const sortedMonths = Object.keys(this.data.monthlyStats)
            .sort((a, b) => new Date(b + '-01') - new Date(a + '-01'))
            .slice(0, months);

        return sortedMonths.map(monthKey => ({
            ...this.data.monthlyStats[monthKey],
            winRate: this.data.monthlyStats[monthKey].tradeCount > 0 
                ? (this.data.monthlyStats[monthKey].winCount / this.data.monthlyStats[monthKey].tradeCount * 100) 
                : 0
        }));
    }

    /**
     * Get performance comparison between groups
     */
    getGroupComparison() {
        const groups = Object.keys(this.data.groups).map(groupId => {
            const summary = this.getGroupSummary(groupId);
            return summary;
        }).filter(group => group !== null);

        // Sort by total P&L descending
        groups.sort((a, b) => b.totalPnL - a.totalPnL);

        return groups;
    }

    /**
     * Get recent trades across all groups
     */
    getRecentTrades(limit = 50) {
        return this.data.trades
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(trade => ({
                ...trade,
                date: new Date(trade.timestamp).toLocaleString(),
                formattedPnL: trade.pnl > 0 ? `+${trade.pnl.toFixed(4)}` : trade.pnl.toFixed(4)
            }));
    }

    /**
     * Calculate performance metrics for a specific time period
     */
    getPerformanceMetrics(startDate = null, endDate = null) {
        let trades = this.data.trades;

        if (startDate) {
            const startTimestamp = new Date(startDate).getTime();
            trades = trades.filter(trade => trade.timestamp >= startTimestamp);
        }

        if (endDate) {
            const endTimestamp = new Date(endDate).getTime();
            trades = trades.filter(trade => trade.timestamp <= endTimestamp);
        }

        if (trades.length === 0) {
            return {
                totalPnL: 0,
                tradeCount: 0,
                winRate: 0,
                averageReturn: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                profitFactor: 0
            };
        }

        const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
        const wins = trades.filter(trade => trade.pnl > 0);
        const losses = trades.filter(trade => trade.pnl < 0);
        
        const winRate = (wins.length / trades.length) * 100;
        const averageReturn = totalPnL / trades.length;
        
        const returns = trades.map(trade => trade.pnl);
        const variance = this.calculateVariance(returns);
        const sharpeRatio = variance > 0 ? (averageReturn / Math.sqrt(variance)) : 0;
        
        const maxDrawdown = Math.min(...returns, 0);
        const maxProfit = Math.max(...returns, 0);
        const profitFactor = Math.abs(maxDrawdown) > 0 ? (maxProfit / Math.abs(maxDrawdown)) : 0;

        return {
            totalPnL: totalPnL,
            tradeCount: trades.length,
            winRate: winRate,
            averageReturn: averageReturn,
            sharpeRatio: sharpeRatio,
            maxDrawdown: maxDrawdown,
            profitFactor: profitFactor,
            winCount: wins.length,
            lossCount: losses.length
        };
    }

    /**
     * Export P&L data to CSV
     */
    exportToCSV(filePath = null) {
        if (!filePath) {
            const timestamp = new Date().toISOString().split('T')[0];
            filePath = path.join(path.dirname(this.dataPath), `pnl-export-${timestamp}.csv`);
        }

        const headers = ['Date', 'Time', 'Group ID', 'Symbol', 'Cycle', 'P&L', 'Positions'];
        const rows = this.data.trades.map(trade => {
            const date = new Date(trade.timestamp);
            return [
                date.toISOString().split('T')[0],
                date.toLocaleTimeString(),
                trade.groupId,
                trade.symbol || 'UNKNOWN',
                trade.cycle || 0,
                trade.pnl.toFixed(4),
                trade.positions || 0
            ];
        });

        const csvContent = [headers, ...rows]
            .map(row => row.join(','))
            .join('\n');

        fs.writeFileSync(filePath, csvContent);
        console.log(`盈亏数据已导出到: ${filePath}`);
        return filePath;
    }

    /**
     * Reset all P&L data
     */
    reset() {
        this.data = {
            totalPnL: 0,
            groups: {},
            dailyStats: {},
            monthlyStats: {},
            trades: [],
            startDate: new Date().toISOString(),
            lastUpdated: null
        };
        this.saveData();
        console.log('盈亏数据重置成功');
    }

    /**
     * Utility functions
     */
    getDateKey(timestamp) {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    getMonthKey(timestamp) {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    calculateVariance(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    }

    /**
     * Get raw data for external processing
     */
    getRawData() {
        return { ...this.data };
    }
}

export default PnLTracker;