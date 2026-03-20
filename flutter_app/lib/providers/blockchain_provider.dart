import 'package:flutter/foundation.dart';
import '../services/blockchain_service.dart';
import '../config/app_config.dart';

class BlockchainProvider extends ChangeNotifier {
  final _blockchain = BlockchainService();

  double _balance = 0;
  String? _walletAddress;
  List<Map<String, dynamic>> _transactions = [];
  bool _isLoading = false;

  double get balance => _balance;
  String? get walletAddress => _walletAddress;
  List<Map<String, dynamic>> get transactions => _transactions;
  bool get isLoading => _isLoading;

  Future<void> loadWallet() async {
    _walletAddress = AppConfig.prefs.getString('wallet_address');
    if (_walletAddress != null) {
      await refreshBalance();
      await loadTransactions();
    }
    notifyListeners();
  }

  Future<void> createWallet() async {
    _isLoading = true;
    notifyListeners();
    try {
      final wallet = await _blockchain.createWallet();
      if (wallet != null) {
        _walletAddress = wallet['address'];
        await AppConfig.prefs.setString('wallet_address', _walletAddress!);
        await AppConfig.storage.write(key: 'wallet_pk', value: wallet['private_key']);
        _balance = 0;
      }
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  Future<void> refreshBalance() async {
    if (_walletAddress == null) return;
    try {
      _balance = await _blockchain.getBalance(_walletAddress!);
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> sendTokens(String toAddress, double amount) async {
    if (_walletAddress == null) return false;
    _isLoading = true;
    notifyListeners();
    try {
      final pk = await AppConfig.storage.read(key: 'wallet_pk');
      if (pk == null) return false;
      final txHash = await _blockchain.sendTransaction(
        from: _walletAddress!,
        to: toAddress,
        amount: amount,
        privateKey: pk,
      );
      if (txHash != null) {
        await refreshBalance();
        await loadTransactions();
        _isLoading = false;
        notifyListeners();
        return true;
      }
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<void> loadTransactions() async {
    if (_walletAddress == null) return;
    try {
      _transactions = await _blockchain.getTransactionHistory(_walletAddress!);
      notifyListeners();
    } catch (_) {}
  }
}
