import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static late SharedPreferences prefs;
  static const storage = FlutterSecureStorage();

  // API Endpoints
  static const String driverApiBase = 'https://driver-platform.thronos.io/api';
  static const String verifyApiBase = 'https://verify.thronos.io/api';
  static const String blockchainApiBase = 'https://node.thronos.io/api';
  static const String wsEndpoint = 'wss://ws.thronos.io';

  // Blockchain
  static const String thronosChainId = '0x5452';
  static const String thronosRpcUrl = 'https://rpc.thronos.io';
  static const String tokenSymbol = 'THR';
  static const int tokenDecimals = 18;

  // Agora (Video Calls)
  static const String agoraAppId = '';

  static Future<void> init() async {
    prefs = await SharedPreferences.getInstance();
  }

  static Future<String?> getAuthToken() async {
    return await storage.read(key: 'auth_token');
  }

  static Future<void> setAuthToken(String token) async {
    await storage.write(key: 'auth_token', value: token);
  }

  static Future<void> clearAuth() async {
    await storage.deleteAll();
  }
}
