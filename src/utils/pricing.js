function calculateCost(platform, buildType) {
  const prices = {
    android: {
      apk: parseFloat(process.env.PRICE_ANDROID_APK) || 10,
      aab: parseFloat(process.env.PRICE_ANDROID_AAB) || 10
    },
    ios: {
      ipa: parseFloat(process.env.PRICE_IOS_IPA) || 50
    }
  };

  let cost = 0;

  if (platform === 'android' || platform === 'both') {
    cost += prices.android[buildType === 'aab' ? 'aab' : 'apk'];
  }

  if (platform === 'ios' || platform === 'both') {
    cost += prices.ios.ipa;
  }

  // Bundle discount
  if (platform === 'both') {
    const discount = 5; // THR discount
    cost = Math.max(cost - discount, 0);
  }

  return cost;
}

function getPricing() {
  return {
    android: {
      apk: parseFloat(process.env.PRICE_ANDROID_APK) || 10,
      aab: parseFloat(process.env.PRICE_ANDROID_AAB) || 10,
      currency: 'THR'
    },
    ios: {
      ipa: parseFloat(process.env.PRICE_IOS_IPA) || 50,
      currency: 'THR'
    },
    bundle_discount: 5,
    notes: [
      'iOS builds require GitHub Actions or AWS EC2 Mac instances',
      'Bundle discount applies when building both platforms'
    ]
  };
}

module.exports = { calculateCost, getPricing };
