import crypto from 'crypto';
import Logger from './logger.js';

export class AsterAPI {
    constructor(apiKey, secretKey, baseUrl = 'https://fapi.asterdex.com') {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.baseUrl = baseUrl;
    }

    /**
     * Generate query string from parameters
     */
    buildQueryString(params) {
        const cleanParams = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                cleanParams[key] = String(value);
            }
        }
        return new URLSearchParams(cleanParams).toString();
    }

    /**
     * Generate HMAC SHA256 signature for API request
     */
    generateSignature(queryString) {
        return crypto.createHmac('sha256', this.secretKey)
            .update(queryString)
            .digest('hex');
    }

    /**
     * Generate timestamp (timestamp in milliseconds)
     */
    generateTimestamp() {
        return Date.now();
    }

    /**
     * Make API request with proper Aster API authentication
     */
    async makeRequest(endpoint, method = 'GET', params = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Add timestamp and recvWindow for signed endpoints (following Aster API format)
        const needsSignature = endpoint.includes('/fapi/v1/order') || 
                              endpoint.includes('/fapi/v1/account') || 
                              endpoint.includes('/fapi/v1/positionRisk') || 
                              endpoint.includes('/fapi/v1/balance') || 
                              endpoint.includes('/fapi/v1/openOrders') || 
                              endpoint.includes('/fapi/v1/allOpenOrders') ||
                              endpoint.includes('/fapi/v1/leverage') ||
                              endpoint.includes('/fapi/v2/account') || 
                              endpoint.includes('/fapi/v2/positionRisk') || 
                              endpoint.includes('/fapi/v2/balance');
        if (needsSignature) {
            params.timestamp = this.generateTimestamp();
            params.recvWindow = 5000;
        }

        const queryString = this.buildQueryString(params);
        const signature = needsSignature ? this.generateSignature(queryString) : null;
        
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'AsterTradingCLI/1.0'
        };
        
        // Add API key header for authenticated endpoints
        if (needsSignature || endpoint.includes('/fapi/v1/') || endpoint.includes('/fapi/v2/')) {
            headers['X-MBX-APIKEY'] = this.apiKey;
        }

        const options = {
            method: method,
            headers: headers
        };

        let finalUrl = url;
        let requestBody = null;

        if (method === 'GET') {
            const finalParams = signature ? `${queryString}&signature=${signature}` : queryString;
            finalUrl = finalParams ? `${url}?${finalParams}` : url;
        } else {
            requestBody = signature ? `${queryString}&signature=${signature}` : queryString;
            options.body = requestBody;
        }

        // console.log('请求URL:', finalUrl);
        // console.log('请求方法:', method);
        // if (requestBody) console.log('请求体:', requestBody);

        try {
            const response = await fetch(finalUrl, options);
            const result = await response.json();
            
            if (!response.ok) {
                Logger.error(`API错误: ${result.msg || result.message || '未知错误'}`, 'API');
                throw new Error(`API错误: ${result.msg || result.message || '未知错误'}`);
            }
            
            return result;
        } catch (error) {
            Logger.error(`请求失败: ${error.message}`, 'API');
            throw error;
        }
    }

    // Trading methods
    async placeOrder(symbol, side, type, params = {}) {
        const orderParams = {
            symbol,
            side,
            type,
            ...params
        };
        return await this.makeRequest('/fapi/v1/order', 'POST', orderParams);
    }

    async getOrder(symbol, orderId) {
        const params = {
            symbol,
            orderId
        };
        return await this.makeRequest('/fapi/v1/order', 'GET', params);
    }

    async cancelOrder(symbol, orderId) {
        const params = {
            symbol,
            orderId
        };
        return await this.makeRequest('/fapi/v1/order', 'DELETE', params);
    }

    async getAccountInfo() {
        return await this.makeRequest('/fapi/v2/account', 'GET');
    }

    async getPositions() {
        return await this.makeRequest('/fapi/v2/positionRisk', 'GET');
    }

    async getBalance() {
        return await this.makeRequest('/fapi/v2/balance', 'GET');
    }

    async getAllOpenOrders(symbol = null) {
        const params = symbol ? { symbol } : {};
        return await this.makeRequest('/fapi/v1/openOrders', 'GET', params);
    }

    async cancelAllOpenOrders(symbol) {
        const params = { symbol };
        return await this.makeRequest('/fapi/v1/allOpenOrders', 'DELETE', params);
    }

    // Market data methods
    async getExchangeInfo() {
        return await this.makeRequest('/fapi/v1/exchangeInfo', 'GET');
    }

    async getSymbolPrice(symbol) {
        const params = { symbol };
        return await this.makeRequest('/fapi/v1/ticker/price', 'GET', params);
    }

    async getMarkPrice(symbol = null) {
        const params = symbol ? { symbol } : {};
        return await this.makeRequest('/fapi/v1/premiumIndex', 'GET', params);
    }

    /**
     * 设置杠杆倍数
     * @param {string} symbol - 交易对符号
     * @param {number} leverage - 杠杆倍数
     * @returns {Promise<Object>} 设置结果
     */
    async setLeverage(symbol, leverage) {
        const params = {
            symbol,
            leverage
        };
        return await this.makeRequest('/fapi/v1/leverage', 'POST', params);
    }
}

export default AsterAPI;