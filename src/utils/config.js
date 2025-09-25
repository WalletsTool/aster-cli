import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
    constructor(configPath = path.join(__dirname, '../../config/config.json')) {
        this.configPath = configPath;
        this.defaultConfig = {
            trading: {
                supportedCoins: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
        
                leverage: 5,
                positionSizeRange: {
                    min: 400,
                    max: 600
                },
                leverage: 5,
                closeAfterMinutesRange: {
                    min: 30,
                    max: 90
                },
                maxDelayMs: 30000,
                minDelayMs: 10000,
                maxGroups: 10,
                enableRiskManagement: true,
                maxTotalPositions: 50
            },
            api: {
                baseUrl: 'https://fapi.asterdex.com',
                timeout: 30000,
                retryAttempts: 3,
                retryDelay: 1000
            },
            logging: {
                level: 'info',
                enableFileLogging: true,
                enableConsoleLogging: true,
                logRotation: true,
                maxLogFiles: 7,
                maxLogSize: '10MB'
            },
            database: {
                enablePersistence: true,
                autoBackup: true,
                backupInterval: 3600000, // 1 hour in ms
                maxBackups: 24
            },
            notifications: {
                enableSlack: false,
                enableTelegram: false,
                enableEmail: false,
                slackWebhook: '',
                telegramBotToken: '',
                telegramChatId: '',
                emailSmtp: {
                    host: '',
                    port: 587,
                    secure: false,
                    auth: {
                        user: '',
                        pass: ''
                    }
                },
                emailTo: ''
            },
            security: {
                encryptPrivateKeys: true,
                secretKey: '',
                sessionTimeout: 3600000, // 1 hour
                maxFailedAttempts: 5,
                lockoutDuration: 300000 // 5 minutes
            },
            performance: {
                enableMetrics: true,
                metricsInterval: 60000, // 1 minute
                memoryThreshold: 500 * 1024 * 1024, // 500MB
                cpuThreshold: 80 // percentage
            }
        };
        
        this.config = { ...this.defaultConfig };
        this.loadConfig();
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = this.mergeDeep(this.defaultConfig, fileConfig);
                console.log('配置加载成功');
            } else {
                console.log('未找到配置文件，创建默认配置');
                this.saveConfig();
            }
        } catch (error) {
            console.error('加载配置失败:', error);
            console.log('使用默认配置');
        }
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('配置保存成功');
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }

    /**
     * Get configuration value by path
     */
    get(path) {
        return this.getNestedValue(this.config, path);
    }

    /**
     * Set configuration value by path
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.saveConfig();
    }

    /**
     * Get trading configuration
     */
    getTradingConfig() {
        return { ...this.config.trading };
    }

    /**
     * Update trading configuration
     */
    updateTradingConfig(updates) {
        this.config.trading = { ...this.config.trading, ...updates };
        this.saveConfig();
    }

    /**
     * Get API configuration
     */
    getApiConfig() {
        return { ...this.config.api };
    }

    /**
     * Get logging configuration
     */
    getLoggingConfig() {
        return { ...this.config.logging };
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        // Validate trading config

        if (this.config.trading.leverage < 1 || this.config.trading.leverage > 100) {
                errors.push('Trading leverage must be between 1 and 100');
        }

        // Validate position size range
        if (this.config.trading.positionSizeRange) {
            const { min, max } = this.config.trading.positionSizeRange;
            if (min <= 0 || max <= 0) {
                errors.push('Position size range min and max must be greater than 0');
            }
            if (min >= max) {
                errors.push('Position size range min must be less than max');
            }
        }

        // Validate leverage
        if (this.config.trading.leverage && (this.config.trading.leverage < 1 || this.config.trading.leverage > 100)) {
            errors.push('Leverage must be between 1 and 100');
        }

        // Validate close after minutes range
        if (this.config.trading.closeAfterMinutesRange) {
            const { min, max } = this.config.trading.closeAfterMinutesRange;
            if (min <= 0 || max <= 0) {
                errors.push('Close after minutes range min and max must be greater than 0');
            }
            if (min >= max) {
                errors.push('Close after minutes range min must be less than max');
            }
            if (min < 1 || max > 1440) { // 1 minute to 24 hours
                errors.push('Close after minutes range must be between 1 and 1440 minutes');
            }
        }

        if (this.config.trading.maxDelayMs <= this.config.trading.minDelayMs) {
            errors.push('Max delay must be greater than min delay');
        }

        // Validate API config
        if (!this.config.api.baseUrl || !this.isValidUrl(this.config.api.baseUrl)) {
            errors.push('Invalid API base URL');
        }

        if (this.config.api.timeout < 1000) {
            errors.push('API timeout must be at least 1000ms');
        }

        // Validate supported coins
        if (!Array.isArray(this.config.trading.supportedCoins) || this.config.trading.supportedCoins.length === 0) {
            errors.push('At least one supported coin must be specified');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Reset configuration to default
     */
    reset() {
        this.config = { ...this.defaultConfig };
        this.saveConfig();
        console.log('配置已重置为默认值');
    }

    /**
     * Create configuration backup
     */
    backup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(
                path.dirname(this.configPath),
                `config-backup-${timestamp}.json`
            );
            
            fs.writeFileSync(backupPath, JSON.stringify(this.config, null, 2));
            console.log(`配置已备份到: ${backupPath}`);
            return backupPath;
        } catch (error) {
            console.error('创建配置备份失败:', error);
            return null;
        }
    }

    /**
     * Restore configuration from backup
     */
    restore(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('Backup file does not exist');
            }

            const backupConfig = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            this.config = this.mergeDeep(this.defaultConfig, backupConfig);
            this.saveConfig();
            console.log('配置已从备份恢复');
            return true;
        } catch (error) {
            console.error('恢复配置失败:', error);
            return false;
        }
    }

    /**
     * Export configuration to different formats
     */
    export(format = 'json', filePath = null) {
        const timestamp = new Date().toISOString().split('T')[0];
        const defaultPath = path.join(
            path.dirname(this.configPath),
            `config-export-${timestamp}`
        );

        try {
            switch (format.toLowerCase()) {
                case 'json':
                    const jsonPath = filePath || `${defaultPath}.json`;
                    fs.writeFileSync(jsonPath, JSON.stringify(this.config, null, 2));
                    console.log(`配置已导出到: ${jsonPath}`);
                    return jsonPath;

                case 'yaml':
                    // Simple YAML export (basic implementation)
                    const yamlPath = filePath || `${defaultPath}.yaml`;
                    const yamlContent = this.toYaml(this.config);
                    fs.writeFileSync(yamlPath, yamlContent);
                    console.log(`配置已导出到: ${yamlPath}`);
                    return yamlPath;

                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
        } catch (error) {
            console.error('导出配置失败:', error);
            return null;
        }
    }

    /**
     * Get environment-specific overrides
     */
    getEnvironmentOverrides() {
        const env = process.env.NODE_ENV || 'development';
        const overrides = {};

        // Environment-specific overrides
        if (env === 'development') {
            overrides.logging = { ...this.config.logging, level: 'debug' };
        } else if (env === 'production') {
            overrides.logging = { ...this.config.logging, level: 'warn' };
            overrides.security = { ...this.config.security, encryptPrivateKeys: true };
        }

        return overrides;
    }

    /**
     * Apply environment overrides
     */
    applyEnvironmentOverrides() {
        const overrides = this.getEnvironmentOverrides();
        this.config = this.mergeDeep(this.config, overrides);
    }

    /**
     * Utility functions
     */
    mergeDeep(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }

    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    toYaml(obj, depth = 0) {
        const indent = '  '.repeat(depth);
        let yaml = '';

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                yaml += `${indent}${key}:\n${this.toYaml(value, depth + 1)}`;
            } else if (Array.isArray(value)) {
                yaml += `${indent}${key}:\n`;
                for (const item of value) {
                    yaml += `${indent}  - ${item}\n`;
                }
            } else {
                yaml += `${indent}${key}: ${value}\n`;
            }
        }

        return yaml;
    }

    /**
     * Get all configuration
     */
    getAll() {
        return { ...this.config };
    }
}

export default ConfigManager;