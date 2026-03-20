import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class BlockchainService {
  static final BlockchainService _instance = BlockchainService._internal();
  factory BlockchainService() => _instance;
  BlockchainService._internal();

  final String _baseUrl = AppConfig.blockchainApiBase;

  /// Get wallet balance in THR
  Future<double> getBalance(String walletAddress) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/balance/$walletAddress'),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return (data['balance'] as num).toDouble();
    }
    return 0.0;
  }

  /// Send THR tokens
  Future<String?> sendTransaction({
    required String from,
    required String to,
    required double amount,
    required String privateKey,
    String? memo,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/transaction'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'from': from,
        'to': to,
        'amount': amount,
        'private_key': privateKey,
        'memo': memo,
      }),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['tx_hash'];
    }
    return null;
  }

  /// Record verification on blockchain
  Future<String?> recordVerification({
    required String verificationId,
    required String userId,
    required String verificationType,
    required String status,
    required String agentId,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/verify/record'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'verification_id': verificationId,
        'user_id': userId,
        'type': verificationType,
        'status': status,
        'agent_id': agentId,
        'timestamp': DateTime.now().toIso8601String(),
      }),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['tx_hash'];
    }
    return null;
  }

  /// Record trip completion on blockchain
  Future<String?> recordTrip({
    required String tripId,
    required String driverId,
    required String tripType,
    required double fare,
    required double distance,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/trip/record'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'trip_id': tripId,
        'driver_id': driverId,
        'type': tripType,
        'fare': fare,
        'distance': distance,
        'timestamp': DateTime.now().toIso8601String(),
      }),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['tx_hash'];
    }
    return null;
  }

  /// Record drone delivery on blockchain
  Future<String?> recordDroneDelivery({
    required String missionId,
    required String droneId,
    required String operatorId,
    required String status,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/drone/record'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'mission_id': missionId,
        'drone_id': droneId,
        'operator_id': operatorId,
        'status': status,
        'timestamp': DateTime.now().toIso8601String(),
      }),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['tx_hash'];
    }
    return null;
  }

  /// Get transaction history
  Future<List<Map<String, dynamic>>> getTransactionHistory(String walletAddress) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/transactions/$walletAddress'),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return List<Map<String, dynamic>>.from(data['transactions'] ?? []);
    }
    return [];
  }

  /// Create new wallet
  Future<Map<String, dynamic>?> createWallet() async {
    final response = await http.post(
      Uri.parse('$_baseUrl/wallet/create'),
      headers: {'Content-Type': 'application/json'},
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }
}
