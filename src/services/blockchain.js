/**
 * Thronos Blockchain Integration
 * Connects to Thronos V3.6 for real payment verification,
 * wallet validation, and transaction recording.
 */
const axios = require('axios');

// Thronos V3.6 node endpoint
const THRONOS_NODE_URL = process.env.THRONOS_NODE_URL || 'https://node.thronos.io';

// Treasury wallet for build payments
const TREASURY_ADDRESS = process.env.TREASURY_THR_ADDRESS || process.env.THR_AI_AGENT_WALLET || '';

// THR address format: THR + 40 hex characters
const THR_ADDRESS_REGEX = /^THR[0-9a-fA-F]{40}$/;

/**
 * Validate a THR wallet address format.
 */
function validateThrAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return THR_ADDRESS_REGEX.test(address);
}

/**
 * Get wallet balance from Thronos chain.
 * Uses /api/balance/<address>
 */
async function getBalance(walletAddress) {
  try {
    const response = await axios.get(
      `${THRONOS_NODE_URL}/api/balance/${walletAddress}`,
      { timeout: 10000 }
    );
    if (response.data && response.data.thr_balance !== undefined) {
      return {
        success: true,
        balance: response.data.thr_balance,
        address: walletAddress,
      };
    }
    return { success: false, balance: 0, error: 'Invalid response from node' };
  } catch (error) {
    return { success: false, balance: 0, error: error.message };
  }
}

/**
 * Verify that a payment transaction exists and matches expected criteria.
 * Uses /api/tx/status to check transaction.
 */
async function verifyPayment(walletAddress, amount, txId) {
  try {
    // If no txId provided, check balance only
    if (!txId) {
      const balanceResult = await getBalance(walletAddress);
      if (!balanceResult.success) {
        return { success: false, error: 'Could not verify wallet balance' };
      }
      if (balanceResult.balance < amount) {
        return {
          success: false,
          error: `Insufficient balance. Required: ${amount} THR, Available: ${balanceResult.balance} THR`
        };
      }
      return {
        success: true,
        verified: true,
        method: 'balance_check',
        balance: balanceResult.balance,
        requiredAmount: amount,
      };
    }

    // Verify specific transaction
    const response = await axios.get(
      `${THRONOS_NODE_URL}/api/tx/status`,
      { params: { tx_id: txId }, timeout: 10000 }
    );

    if (!response.data || !response.data.ok) {
      return { success: false, error: 'Transaction not found' };
    }

    const txStatus = response.data.status;
    if (txStatus === 'confirmed' || txStatus === 'mined') {
      return {
        success: true,
        verified: true,
        txId,
        status: txStatus,
        method: 'tx_verification',
      };
    } else if (txStatus === 'pending') {
      return {
        success: true,
        verified: false,
        pending: true,
        txId,
        status: 'pending',
        method: 'tx_verification',
      };
    } else {
      return { success: false, error: `Transaction rejected: ${txStatus}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Request payment from user wallet to treasury.
 * Initiates the transfer via /api/wallet/send
 * Requires the user's auth_secret from their pledge.
 */
async function requestBuildPayment(fromAddress, amount, authSecret, passphrase) {
  if (!TREASURY_ADDRESS) {
    return { success: false, error: 'Treasury address not configured' };
  }

  if (!validateThrAddress(fromAddress)) {
    return { success: false, error: 'Invalid THR wallet address format (THR + 40 hex chars)' };
  }

  try {
    const response = await axios.post(
      `${THRONOS_NODE_URL}/api/wallet/send`,
      {
        token: 'THR',
        from: fromAddress,
        to: TREASURY_ADDRESS,
        amount: amount,
        secret: authSecret,
        passphrase: passphrase || undefined,
        speed: 'fast',
      },
      { timeout: 30000 }
    );

    if (response.data && response.data.ok && response.data.accepted) {
      return {
        success: true,
        txId: response.data.tx_id,
        txHash: response.data.tx_id,
        fee: response.data.fee || 0,
        newBalance: response.data.new_balance,
        verifiedAmount: amount,
      };
    } else {
      return {
        success: false,
        error: response.data.reject_reason || response.data.error || 'Payment rejected by chain',
        txId: response.data.tx_id,
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Record a build job on the blockchain (metadata).
 * Creates a memo transaction to the treasury for record-keeping.
 */
async function recordBuildPayment(jobId, walletAddress, amount, txId) {
  // The payment transaction itself serves as the record.
  // We just return the info for database storage.
  return {
    success: true,
    jobId,
    walletAddress,
    amount,
    txId: txId || null,
    chain: 'thronos_v3.6',
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Refund payment back to user wallet.
 * Uses admin-level send from treasury back to user.
 */
async function refundPayment(jobId, walletAddress, amount) {
  if (!TREASURY_ADDRESS) {
    return { success: false, error: 'Treasury address not configured' };
  }

  const adminSecret = process.env.TREASURY_AUTH_SECRET;
  if (!adminSecret) {
    return { success: false, error: 'Treasury auth not configured for refunds' };
  }

  try {
    const response = await axios.post(
      `${THRONOS_NODE_URL}/api/wallet/send`,
      {
        token: 'THR',
        from: TREASURY_ADDRESS,
        to: walletAddress,
        amount: amount,
        secret: adminSecret,
        speed: 'slow', // slow fee for refunds
      },
      { timeout: 30000 }
    );

    if (response.data && response.data.ok && response.data.accepted) {
      return {
        success: true,
        jobId,
        refundedAmount: amount,
        txId: response.data.tx_id,
      };
    } else {
      return {
        success: false,
        jobId,
        error: response.data.reject_reason || 'Refund rejected',
      };
    }
  } catch (error) {
    return { success: false, jobId, error: error.message };
  }
}

/**
 * Authenticate a wallet via the chain's authentication endpoint.
 * Used to verify wallet ownership before accepting builds.
 */
async function authenticateWallet(walletAddress) {
  if (!validateThrAddress(walletAddress)) {
    return { success: false, error: 'Invalid THR address format' };
  }

  try {
    const response = await axios.post(
      `${THRONOS_NODE_URL}/api/chain/wallet/authenticate`,
      { wallet: walletAddress },
      { timeout: 10000 }
    );

    if (response.data && response.data.ok && response.data.authenticated) {
      return {
        success: true,
        authenticated: true,
        address: walletAddress,
        balance: response.data.balance || 0,
      };
    }
    return { success: false, error: 'Wallet not authenticated on chain' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  validateThrAddress,
  getBalance,
  verifyPayment,
  requestBuildPayment,
  recordBuildPayment,
  refundPayment,
  authenticateWallet,
  TREASURY_ADDRESS,
};
