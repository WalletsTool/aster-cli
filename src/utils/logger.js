/**
 * 统一的日志格式化工具
 * 生成格式：[YYYY:MM:DD/HH:mm:ss _日志类型 _钱包名称]
 */

class Logger {
    // ANSI 颜色代码
    static COLORS = {
        INFO: '\u001b[34m',     // 蓝色
        SUCCESS: '\u001b[32m',  // 绿色
        WARN: '\u001b[33m',     // 黄色
        ERROR: '\u001b[31m',    // 红色
        DEBUG: '\u001b[90m',    // 灰色
        RESET: '\u001b[0m'      // 重置颜色
    };

    /**
     * 检查是否启用颜色
     * @returns {boolean} 是否启用颜色
     */
    static isColorEnabled() {
        // 通过环境变量 NO_COLOR 控制颜色开关
        return !process.env.NO_COLOR && process.stdout.isTTY;
    }

    /**
     * 为文本添加颜色
     * @param {string} text - 要着色的文本
     * @param {string} color - 颜色代码
     * @returns {string} 着色后的文本
     */
    static colorize(text, color) {
        if (!this.isColorEnabled()) {
            return text;
        }
        return `${color}${text}${this.COLORS.RESET}`;
    }
    /**
     * 格式化时间为 YYYY:MM:DD/HH:mm:ss 格式
     * @returns {string} 格式化的时间字符串
     */
    static formatTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day}/${hours}:${minutes}:${seconds}`;
    }

    /**
     * 生成日志前缀
     * @param {string} logType - 日志类型 (INFO, ERROR, WARN, SUCCESS等)
     * @param {string} walletName - 钱包名称
     * @returns {string} 格式化的日志前缀
     */
    static formatPrefix(logType, walletName = '系统') {
        const timestamp = this.formatTime();
        return `[${timestamp}_${logType}_${walletName}]`;
    }

    /**
     * 输出INFO级别日志
     * @param {string} message - 日志消息
     * @param {string} walletName - 钱包名称
     */
    static info(message, walletName = '系统') {
        const prefix = this.formatPrefix('INFO', walletName);
        const coloredPrefix = this.colorize(prefix, this.COLORS.INFO);
        console.log(`${coloredPrefix} ${message}`);
    }

    /**
     * 输出ERROR级别日志
     * @param {string} message - 日志消息
     * @param {string} walletName - 钱包名称
     */
    static error(message, walletName = '系统') {
        const prefix = this.formatPrefix('ERROR', walletName);
        const coloredPrefix = this.colorize(prefix, this.COLORS.ERROR);
        console.log(`${coloredPrefix} ${message}`);
    }

    /**
     * 输出WARN级别日志
     * @param {string} message - 日志消息
     * @param {string} walletName - 钱包名称
     */
    static warn(message, walletName = '系统') {
        const prefix = this.formatPrefix('WARN', walletName);
        const coloredPrefix = this.colorize(prefix, this.COLORS.WARN);
        console.log(`${coloredPrefix} ${message}`);
    }

    /**
     * 输出SUCCESS级别日志
     * @param {string} message - 日志消息
     * @param {string} walletName - 钱包名称
     */
    static success(message, walletName = '系统') {
        const prefix = this.formatPrefix('SUCCESS', walletName);
        const coloredPrefix = this.colorize(prefix, this.COLORS.SUCCESS);
        console.log(`${coloredPrefix} ${message}`);
    }

    /**
     * 输出DEBUG级别日志
     * @param {string} message - 日志消息
     * @param {string} walletName - 钱包名称
     */
    static debug(message, walletName = '系统') {
        const prefix = this.formatPrefix('DEBUG', walletName);
        const coloredPrefix = this.colorize(prefix, this.COLORS.DEBUG);
        console.log(`${coloredPrefix} ${message}`);
    }
}

export default Logger;