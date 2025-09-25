import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import Logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AccountManager {
    constructor(accountsPath = path.join(__dirname, '../../accounts')) {
        this.accountsPath = accountsPath;
        this.accounts = [];
    }

    /**
     * Load all CSV files from accounts folder
     */
    async loadAccounts() {
        Logger.info(`从以下路径加载账户: ${this.accountsPath}`, '系统');
        
        if (!fs.existsSync(this.accountsPath)) {
            throw new Error(`未找到账户文件夹: ${this.accountsPath}`);
        }

        const files = fs.readdirSync(this.accountsPath);
        const csvFiles = files.filter(file => path.extname(file).toLowerCase() === '.csv');
        
        Logger.info(`找到CSV文件: ${csvFiles.join(', ')}`, '系统');
        
        if (csvFiles.length === 0) {
            throw new Error('在账户文件夹中未找到CSV文件');
        }

        this.accounts = [];
        
        for (const file of csvFiles) {
            const filePath = path.join(this.accountsPath, file);
            const fileAccounts = await this.parseCSVFile(filePath);
            Logger.info(`从 ${file} 加载了 ${fileAccounts.length} 个账户`, '系统');
            this.accounts.push(...fileAccounts);
        }

        Logger.info(`总共加载账户数: ${this.accounts.length}`, '系统');
        return this.accounts;
    }

    /**
     * Parse a single CSV file
     */
    async parseCSVFile(filePath) {
        return new Promise((resolve, reject) => {
            const accounts = [];
            const requiredFields = ['accountName', 'exchange', 'apiKey', 'secretKey'];
            
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Check if all required fields are present
                    const missingFields = requiredFields.filter(field => !row[field] || row[field].trim() === '');
                    
                    if (missingFields.length > 0) {
                        Logger.warn(`跳过 ${filePath} 中的行 - 缺少字段: ${missingFields.join(', ')}`, '系统');
                        return;
                    }

                    // Clean and validate the account data using correct CSV field names
                    const account = {
                        accountName: row.accountName.trim(),
                        exchange: row.exchange.trim(),
                        apiKey: row.apiKey.trim(),
                        secretKey: row.secretKey.trim(),
                        proxyUrl: row.proxyUrl ? row.proxyUrl.trim() : ''
                    };

                    // Basic validation for API keys
                    if (!account.apiKey || account.apiKey === 'your_api_key_here') {
                        Logger.warn(`跳过 ${filePath} 中的行 - 无效或占位符API密钥`, '系统');
                        return;
                    }

                    if (!account.secretKey || account.secretKey === 'your_secret_key_here') {
                        Logger.warn(`跳过 ${filePath} 中的行 - 无效或占位符密钥`, '系统');
                        return;
                    }

                    // Check if API key and secret key are identical (invalid configuration)
                    if (account.apiKey === account.secretKey) {
                        Logger.warn(`⚠️  跳过账户 ${account.accountName} - API密钥和密钥相同（无效配置）`, account.accountName);
                        Logger.warn(`   请为 ${account.accountName} 更新CSV文件中的正确API凭据`, account.accountName);
                        return;
                    }

                    accounts.push(account);
                })
                .on('end', () => {
                    console.log(`从 ${filePath} 解析了 ${accounts.length} 个有效账户`);
                    if (accounts.length === 0) {
                        console.warn(`在 ${filePath} 中未找到有效账户。请检查CSV格式和字段名。`);
                    }
                    resolve(accounts);
                })
                .on('error', (err) => {
                    Logger.error(`解析CSV文件 ${filePath} 时出错: ${err.message}`, '系统');
                    if (err.message.includes('Invalid Record Length')) {
                        reject(new Error(`文件 ${filePath} 似乎是Excel格式。请先保存为CSV格式。`));
                    } else {
                        reject(err);
                    }
                });
        });
    }

    /**
     * Validate API key format (basic check)
     */
    isValidApiKey(apiKey) {
        return apiKey && apiKey.length > 10 && !apiKey.includes('your_api_key_here');
    }

    /**
     * Validate secret key format (basic check)
     */
    isValidSecretKey(secretKey) {
        return secretKey && secretKey.length > 10 && !secretKey.includes('your_secret_key_here');
    }

    /**
     * Get all loaded accounts
     */
    getAccounts() {
        return this.accounts;
    }

    /**
     * Get all accounts (previously filtered enabled accounts)
     */
    getAllAccounts() {
        return this.accounts;
    }



    /**
     * Shuffle accounts randomly
     */
    shuffleAccounts(accountsList = null) {
        const accounts = accountsList || this.getAllAccounts();
        const shuffled = [...accounts];
        
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        return shuffled;
    }

    /**
     * Group accounts into groups with flexible sizing
     * - If total accounts < 6 and is even number (2, 4): create one group with all accounts
     * - If total accounts >= 6: group by 6 as before
     * - Skip only if total accounts is odd (can't form pairs)
     */
    groupAccounts(groupSize = 6, accountsList = null) {
        const accounts = accountsList || this.getAllAccounts();
        const shuffled = this.shuffleAccounts(accounts);
        const groups = [];
        const totalAccounts = shuffled.length;
        
        Logger.info(`正在灵活分组 ${totalAccounts} 个账户`, '系统');
        
        // If total accounts is odd, we can't form complete pairs
        if (totalAccounts % 2 !== 0) {
            Logger.warn(`跳过分组 - 总账户数 (${totalAccounts}) 为奇数，无法形成完整配对`, '系统');
            return groups;
        }
        
        // If less than 6 accounts but even number, create one group with all accounts
        if (totalAccounts < 6 && totalAccounts % 2 === 0) {
            Logger.info(`创建单个组，包含 ${totalAccounts} 个账户（偶数且<6）`, '系统');
            groups.push({
                id: 'group_1',
                accounts: shuffled,
                pairs: this.createHedgePairs(shuffled)
            });
        } else {
            // 6 or more accounts: group by specified size (default 6)
            for (let i = 0; i < shuffled.length; i += groupSize) {
                const group = shuffled.slice(i, i + groupSize);
                if (group.length === groupSize) {
                    groups.push({
                        id: `group_${Math.floor(i / groupSize) + 1}`,
                        accounts: group,
                        pairs: this.createHedgePairs(group)
                    });
                } else if (group.length >= 2 && group.length % 2 === 0) {
                    // Handle remaining even-numbered accounts
                    Logger.info(`创建最终组，包含剩余 ${group.length} 个账户`, '系统');
                    groups.push({
                        id: `group_${Math.floor(i / groupSize) + 1}`,
                        accounts: group,
                        pairs: this.createHedgePairs(group)
                    });
                } else {
                    Logger.warn(`跳过不完整组，包含 ${group.length} 个账户（奇数或<2）`, '系统');
                }
            }
        }
        
        Logger.info(`已创建 ${groups.length} 个灵活分组`, '系统');
        return groups;
    }

    /**
     * Create hedge pairs from a group of accounts
     * Supports any even number of accounts (2, 4, 6, etc.)
     * Returns pairs: [{long: A, short: B}, {long: C, short: D}, ...]
     */
    createHedgePairs(groupAccounts) {
        if (groupAccounts.length % 2 !== 0) {
            throw new Error(`组必须包含偶数个账户才能进行对冲配对。获得 ${groupAccounts.length} 个账户。`);
        }

        if (groupAccounts.length < 2) {
            throw new Error('组必须至少包含2个账户才能进行对冲配对');
        }

        const pairs = [];
        for (let i = 0; i < groupAccounts.length; i += 2) {
            pairs.push({
                long: groupAccounts[i],      // Will place long orders
                short: groupAccounts[i + 1], // Will place short orders
                pairId: `配对${Math.floor(i / 2) + 1}`
            });
        }

        Logger.info(`从 ${groupAccounts.length} 个账户创建了 ${pairs.length} 个对冲配对`, '系统');
        return pairs;
    }

    /**
     * Create sample account template CSV
     */
    createSampleTemplate() {
        const templatePath = path.join(this.accountsPath, 'import.csv');
        const sampleData = [
            'accountName,exchange,apiKey,secretKey,proxyUrl',
            'Account_001,Aster,your_api_key_here,your_secret_key_here,',
            'Account_002,Aster,your_api_key_here,your_secret_key_here,'
        ].join('\n');

        if (!fs.existsSync(this.accountsPath)) {
            fs.mkdirSync(this.accountsPath, { recursive: true });
        }

        fs.writeFileSync(templatePath, sampleData);
        Logger.success(`示例模板已创建于: ${templatePath}`, '系统');
        
        return templatePath;
    }

    /**
     * Get account statistics with flexible grouping
     */
    getAccountStats() {
        const total = this.accounts.length;
        let maxGroups = 0;
        let maxPairs = 0;

        if (total % 2 !== 0) {
            // Odd number of accounts - cannot form complete pairs
            maxGroups = 0;
            maxPairs = 0;
        } else if (total < 6 && total >= 2) {
            // Less than 6 but even - forms 1 group
            maxGroups = 1;
            maxPairs = Math.floor(total / 2);
        } else if (total >= 6) {
            // 6 or more accounts - group by 6, handle remainder
            const fullGroups = Math.floor(total / 6);
            const remainder = total % 6;
            
            if (remainder === 0 || remainder % 2 === 0) {
                maxGroups = fullGroups + (remainder >= 2 ? 1 : 0);
                maxPairs = Math.floor(total / 2);
            } else {
                maxGroups = fullGroups;
                maxPairs = Math.floor((total - remainder) / 2);
            }
        }

        return {
            total,
            maxGroups,
            maxPairs,
            canGroup: total >= 2 && total % 2 === 0
        };
    }
}

export default AccountManager;