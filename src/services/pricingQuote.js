'use strict';
const { v4: uuidv4 } = require('uuid');

const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory quote store; replaced by Redis if needed later
const quoteStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of quoteStore) {
    if (new Date(q.quote_expires_at).getTime() < now) quoteStore.delete(id);
  }
}, 60_000).unref();

function getThrPrices() {
  return {
    android: {
      apk: parseFloat(process.env.PRICE_ANDROID_APK_THR || process.env.PRICE_ANDROID_APK) || 10,
      aab: parseFloat(process.env.PRICE_ANDROID_AAB_THR || process.env.PRICE_ANDROID_AAB) || 10,
    },
    ios: {
      ipa: parseFloat(process.env.PRICE_IOS_IPA_THR || process.env.PRICE_IOS_IPA) || 50,
    },
    bundle_discount: parseFloat(process.env.PRICE_BOTH_DISCOUNT_THR) || 5,
  };
}

function getNativeThrCost(platform, buildType) {
  const p = getThrPrices();
  let cost = 0;
  if (platform === 'android' || platform === 'both') {
    cost += buildType === 'aab' ? p.android.aab : p.android.apk;
  }
  if (platform === 'ios' || platform === 'both') {
    cost += p.ios.ipa;
  }
  if (platform === 'both') {
    cost = Math.max(cost - p.bundle_discount, 0);
  }
  return cost;
}

function getPlatformKey(platform, buildType) {
  if (platform === 'both') return 'both';
  if (platform === 'ios') return 'ios_ipa';
  return `android_${buildType === 'aab' ? 'aab' : 'apk'}`;
}

function getBtcFloor(platform, buildType) {
  const key = getPlatformKey(platform, buildType);
  return {
    android_apk: parseFloat(process.env.MIN_BTC_ANDROID_APK) || 0.001,
    android_aab: parseFloat(process.env.MIN_BTC_ANDROID_AAB) || 0.0015,
    ios_ipa:     parseFloat(process.env.MIN_BTC_IOS_IPA)     || 0.003,
    both:        parseFloat(process.env.MIN_BTC_BOTH)        || 0.004,
  }[key] || 0.001;
}

function getUsdFloor(platform, buildType) {
  const key = getPlatformKey(platform, buildType);
  return {
    android_apk: parseFloat(process.env.MIN_USD_ANDROID_APK) || 100,
    android_aab: parseFloat(process.env.MIN_USD_ANDROID_AAB) || 150,
    ios_ipa:     parseFloat(process.env.MIN_USD_IOS_IPA)     || 300,
    both:        parseFloat(process.env.MIN_USD_BOTH)        || 400,
  }[key] || 100;
}

/**
 * Generate an authoritative quote for a build.
 * Returns null if no safe conversion is possible (caller should return 400).
 */
function getBuildQuote({ platform, build_type, payment_method }) {
  const nativeCostThr = getNativeThrCost(platform, build_type);
  const split = { treasury_percent: 50, burn_percent: 25, lp_percent: 25 };

  let externalAmount, externalCurrency, floorApplied = false;

  const method = payment_method || 'thr';

  if (method === 'thr' || method === 'thronos') {
    externalAmount = nativeCostThr;
    externalCurrency = 'THR';

  } else if (method === 'btc_bridge') {
    const thrBtcRate  = parseFloat(process.env.THR_BTC_RATE)       || 0;
    const btcUsdRef   = parseFloat(process.env.BTC_USD_REFERENCE)  || 0;
    const thrUsdRef   = parseFloat(process.env.THR_USD_REFERENCE)  || 0.05;
    const floor       = getBtcFloor(platform, build_type);

    let converted;
    if (thrBtcRate > 0) {
      converted = nativeCostThr * thrBtcRate;
    } else if (btcUsdRef > 0) {
      converted = (nativeCostThr * thrUsdRef) / btcUsdRef;
    } else {
      return null; // no safe conversion
    }

    if (converted < floor) { externalAmount = floor; floorApplied = true; }
    else externalAmount = parseFloat(converted.toFixed(8));
    externalCurrency = 'BTC';

  } else if (method === 'usdt_evm' || method === 'usdc_sol') {
    const thrUsdRef = parseFloat(process.env.THR_USD_REFERENCE) || 0.05;
    const floor     = getUsdFloor(platform, build_type);
    const converted = nativeCostThr * thrUsdRef;
    if (converted < floor) { externalAmount = floor; floorApplied = true; }
    else externalAmount = parseFloat(converted.toFixed(2));
    externalCurrency = method === 'usdc_sol' ? 'USDC' : 'USDT';

  } else if (method === 'eth') {
    const ethUsdRef = parseFloat(process.env.ETH_USD_REFERENCE) || 0;
    const thrUsdRef = parseFloat(process.env.THR_USD_REFERENCE) || 0.05;
    if (!ethUsdRef) return null;
    const floor    = getUsdFloor(platform, build_type);
    const usdValue = Math.max(nativeCostThr * thrUsdRef, floor);
    if (usdValue === floor) floorApplied = true;
    externalAmount   = parseFloat((usdValue / ethUsdRef).toFixed(6));
    externalCurrency = 'ETH';

  } else if (method === 'bnb') {
    const bnbUsdRef = parseFloat(process.env.BNB_USD_REFERENCE) || 0;
    const thrUsdRef = parseFloat(process.env.THR_USD_REFERENCE) || 0.05;
    if (!bnbUsdRef) return null;
    const floor    = getUsdFloor(platform, build_type);
    const usdValue = Math.max(nativeCostThr * thrUsdRef, floor);
    if (usdValue === floor) floorApplied = true;
    externalAmount   = parseFloat((usdValue / bnbUsdRef).toFixed(6));
    externalCurrency = 'BNB';

  } else {
    return null;
  }

  const quote = {
    quote_id:         uuidv4(),
    platform,
    build_type,
    payment_method:   method,
    native_cost_thr:  nativeCostThr,
    external_amount:  externalAmount,
    external_currency: externalCurrency,
    floor_applied:    floorApplied,
    quote_expires_at: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    split,
  };

  quoteStore.set(quote.quote_id, quote);
  return quote;
}

/**
 * Validate a quote submitted with a build request.
 * Returns { valid, reason, quote }.
 */
function validateQuote(quoteId, { platform, build_type, payment_method }) {
  const stored = quoteStore.get(quoteId);
  if (!stored) return { valid: false, reason: 'Quote not found or expired' };

  if (new Date(stored.quote_expires_at).getTime() < Date.now()) {
    quoteStore.delete(quoteId);
    return { valid: false, reason: 'Quote expired' };
  }

  if (
    stored.platform       !== platform       ||
    stored.build_type     !== build_type     ||
    stored.payment_method !== payment_method
  ) {
    return { valid: false, reason: 'Quote parameters do not match build request' };
  }

  return { valid: true, quote: stored };
}

function getExternalFloorTable() {
  return {
    btc: {
      android_apk: parseFloat(process.env.MIN_BTC_ANDROID_APK) || 0.001,
      android_aab: parseFloat(process.env.MIN_BTC_ANDROID_AAB) || 0.0015,
      ios_ipa:     parseFloat(process.env.MIN_BTC_IOS_IPA)     || 0.003,
      both:        parseFloat(process.env.MIN_BTC_BOTH)        || 0.004,
    },
    usd: {
      android_apk: parseFloat(process.env.MIN_USD_ANDROID_APK) || 100,
      android_aab: parseFloat(process.env.MIN_USD_ANDROID_AAB) || 150,
      ios_ipa:     parseFloat(process.env.MIN_USD_IOS_IPA)     || 300,
      both:        parseFloat(process.env.MIN_USD_BOTH)        || 400,
    },
  };
}

module.exports = { getBuildQuote, validateQuote, getNativeThrCost, getExternalFloorTable, getThrPrices };
