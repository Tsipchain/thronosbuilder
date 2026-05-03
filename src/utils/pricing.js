'use strict';

function calculateCost(platform, buildType) {
  const prices = {
    android: {
      apk: parseFloat(process.env.PRICE_ANDROID_APK_THR || process.env.PRICE_ANDROID_APK) || 10,
      aab: parseFloat(process.env.PRICE_ANDROID_AAB_THR || process.env.PRICE_ANDROID_AAB) || 10,
    },
    ios: {
      ipa: parseFloat(process.env.PRICE_IOS_IPA_THR || process.env.PRICE_IOS_IPA) || 50,
    },
  };

  let cost = 0;
  if (platform === 'android' || platform === 'both') {
    cost += prices.android[buildType === 'aab' ? 'aab' : 'apk'];
  }
  if (platform === 'ios' || platform === 'both') {
    cost += prices.ios.ipa;
  }
  if (platform === 'both') {
    const discount = parseFloat(process.env.PRICE_BOTH_DISCOUNT_THR) || 5;
    cost = Math.max(cost - discount, 0);
  }
  return cost;
}

function getPricing() {
  return {
    android: {
      apk: parseFloat(process.env.PRICE_ANDROID_APK_THR || process.env.PRICE_ANDROID_APK) || 10,
      aab: parseFloat(process.env.PRICE_ANDROID_AAB_THR || process.env.PRICE_ANDROID_AAB) || 10,
      currency: 'THR',
    },
    ios: {
      ipa: parseFloat(process.env.PRICE_IOS_IPA_THR || process.env.PRICE_IOS_IPA) || 50,
      currency: 'THR',
    },
    bundle_discount: parseFloat(process.env.PRICE_BOTH_DISCOUNT_THR) || 5,
    notes: [
      'All prices are denominated in THR (native currency).',
      'Cross-chain quotes are generated server-side via POST /api/v1/builds/preflight.',
      'Bundle discount applies when building both platforms.',
    ],
  };
}

module.exports = { calculateCost, getPricing };
