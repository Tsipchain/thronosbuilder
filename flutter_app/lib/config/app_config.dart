import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static late SharedPreferences prefs;
  static const storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  // Thronos chain ID is 3001
  static const String chainId = '3001';
  static const String blockchainApiBase = 'https://api.thronoschain.org/api';
  static const String blockchainReadBase = 'https://node-2.up.railway.app';

  // WalletConnect v2 Project ID — set in environment or replace with your project ID from cloud.walletconnect.com
  static const String walletConnectProjectId =
      String.fromEnvironment('WALLETCONNECT_PROJECT_ID', defaultValue: 'thronos-wallet-v2');

  static Future<void> init() async {
    prefs = await SharedPreferences.getInstance();
  }
}
