import { ethers } from 'ethers';
import Logger from './logger.js';

// Configuration
const BSC_RPC = 'https://bsc-dataseed1.binance.org/'; // Free public RPC
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const MINTING_CONTRACT = '0xC271fc70dD9E678ac1AB632f797894fe4BE2C345';
const USDF_ADDRESS = '0x5A110fC00474038f6c02E89C707D638602EA44B5';

const USDT_ABI = [  // Minimal ABI for USDT operations
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

const MINT_ABI = [  // Minimal ABI for deposit
  'function deposit(uint256 amountIn) external'
];

const USDF_ABI = [  // Minimal ABI for USDF balance check
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

// Connect to provider and wallet using private key
async function connectWallet(privateKey) {
  try {
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Verify network
    const network = await provider.getNetwork();
    if (network.chainId !== 56n) {
      throw new Error('RPC provider is not connected to BNB Smart Chain (chainId 56)');
    }
    
    const address = await wallet.getAddress();
    Logger.info(`已连接钱包: ${address}`, 'MINT');
    
    return { provider, signer: wallet };
  } catch (error) {
    Logger.error(`连接钱包失败: ${error.message}`, 'MINT');
    throw error;
  }
}

// Get USDT balance
async function getUSDTBalance(signer) {
  try {
    const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);
    const address = await signer.getAddress();
    const balance = await usdtContract.balanceOf(address);
    const decimals = await usdtContract.decimals();
    
    Logger.info(`USDT 余额: ${ethers.formatUnits(balance, decimals)} USDT`, 'MINT');
    return { balance, decimals };
  } catch (error) {
    Logger.error(`获取 USDT 余额失败: ${error.message}`, 'MINT');
    throw error;
  }
}

// Approve USDT for minting contract
async function approveUSDT(signer, amountWei) {
  try {
    const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);
    const address = await signer.getAddress();
    const currentAllowance = await usdtContract.allowance(address, MINTING_CONTRACT);
    
    if (currentAllowance >= amountWei) {
      Logger.info('USDT 授权额度充足，无需重新授权', 'MINT');
      return true;
    }
    
    Logger.info('正在授权 USDT...', 'MINT');
    const tx = await usdtContract.approve(MINTING_CONTRACT, amountWei);
    Logger.info(`授权交易已提交: ${tx.hash}`, 'MINT');
    
    const receipt = await tx.wait();
    Logger.success(`USDT 授权成功: ${tx.hash}`, 'MINT');
    Logger.info(`Gas 使用量: ${receipt.gasUsed.toString()}`, 'MINT');
    
    return true;
  } catch (error) {
    Logger.error(`USDT 授权失败: ${error.message}`, 'MINT');
    throw error;
  }
}

// Mint USDF by depositing USDT
async function mintUSDF(signer, amountWei) {
  try {
    const mintContract = new ethers.Contract(MINTING_CONTRACT, MINT_ABI, signer);
    const address = await signer.getAddress();
    
    Logger.info(`正在铸造 USDF，数量: ${ethers.formatUnits(amountWei, 18)} USDT`, 'MINT');
    
    const tx = await mintContract.deposit(amountWei);
    Logger.info(`铸造交易已提交: ${tx.hash}`, 'MINT');
    
    const receipt = await tx.wait();
    Logger.success(`USDF 铸造成功: ${tx.hash}`, 'MINT');
    Logger.info(`Gas 使用量: ${receipt.gasUsed.toString()}`, 'MINT');
    
    // Check new USDF balance
    const usdfContract = new ethers.Contract(USDF_ADDRESS, USDF_ABI, signer);
    const newBalance = await usdfContract.balanceOf(address);
    const usdfDecimals = await usdfContract.decimals();
    
    Logger.success(`新的 USDF 余额: ${ethers.formatUnits(newBalance, usdfDecimals)} USDF`, 'MINT');
    
    return {
      success: true,
      txHash: tx.hash,
      gasUsed: receipt.gasUsed.toString(),
      newUSDFBalance: ethers.formatUnits(newBalance, usdfDecimals)
    };
  } catch (error) {
    Logger.error(`USDF 铸造失败: ${error.message}`, 'MINT');
    throw error;
  }
}

// Main function to convert all USDT to USDF
async function convertAllUSDTToUSDF(privateKey) {
  try {
    Logger.info('开始将所有 USDT 转换为 USDF', 'MINT');
    
    // Connect wallet
    const { signer } = await connectWallet(privateKey);
    
    // Get USDT balance
    const { balance: usdtBalance, decimals: usdtDecimals } = await getUSDTBalance(signer);
    
    // Check if there's any USDT to convert
    if (usdtBalance === 0n) {
      Logger.warn('钱包中没有 USDT 余额，无需转换', 'MINT');
      return {
        success: false,
        message: '钱包中没有 USDT 余额'
      };
    }
    
    const usdtAmount = ethers.formatUnits(usdtBalance, usdtDecimals);
    Logger.info(`准备转换 ${usdtAmount} USDT 为 USDF`, 'MINT');
    
    // Approve USDT for minting contract
    await approveUSDT(signer, usdtBalance);
    
    // Mint USDF with all USDT
    const result = await mintUSDF(signer, usdtBalance);
    
    Logger.success(`成功将 ${usdtAmount} USDT 转换为 USDF`, 'MINT');
    
    return {
      success: true,
      convertedAmount: usdtAmount,
      txHash: result.txHash,
      gasUsed: result.gasUsed,
      newUSDFBalance: result.newUSDFBalance
    };
    
  } catch (error) {
    Logger.error(`转换 USDT 为 USDF 失败: ${error.message}`, 'MINT');
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to convert specific amount of USDT to USDF
async function convertUSDTToUSDF(privateKey, amount) {
  try {
    Logger.info(`开始将 ${amount} USDT 转换为 USDF`, 'MINT');
    
    // Connect wallet
    const { signer } = await connectWallet(privateKey);
    
    // Get USDT balance to verify sufficient funds
    const { balance: usdtBalance, decimals: usdtDecimals } = await getUSDTBalance(signer);
    const amountWei = ethers.parseUnits(amount.toString(), usdtDecimals);
    
    if (usdtBalance < amountWei) {
      const availableAmount = ethers.formatUnits(usdtBalance, usdtDecimals);
      throw new Error(`USDT 余额不足。可用: ${availableAmount} USDT，需要: ${amount} USDT`);
    }
    
    // Approve USDT for minting contract
    await approveUSDT(signer, amountWei);
    
    // Mint USDF
    const result = await mintUSDF(signer, amountWei);
    
    Logger.success(`成功将 ${amount} USDT 转换为 USDF`, 'MINT');
    
    return {
      success: true,
      convertedAmount: amount,
      txHash: result.txHash,
      gasUsed: result.gasUsed,
      newUSDFBalance: result.newUSDFBalance
    };
    
  } catch (error) {
    Logger.error(`转换 USDT 为 USDF 失败: ${error.message}`, 'MINT');
    return {
      success: false,
      error: error.message
    };
  }
}

export { convertAllUSDTToUSDF, convertUSDTToUSDF };
export default { convertAllUSDTToUSDF, convertUSDTToUSDF };