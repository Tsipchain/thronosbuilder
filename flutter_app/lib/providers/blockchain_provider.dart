import 'package:flutter/foundation.dart';
import '../services/blockchain_service.dart';
import '../services/wallet_import_service.dart';
import '../config/app_config.dart';

enum WalletSource { none, created, importedKey, importedMnemonic, walletConnect }

class BlockchainProvider extends ChangeNotifier {
  final _blockchain = BlockchainService();

  double _balance = 0;
  String? _walletAddress;
  List<Map<String, dynamic>> _transactions = [];
  bool _isLoading = false;
  WalletSource _source = WalletSource.none;
  bool _wcConnected = false;
  String? _wcDAppName;

  double get balance => _balance;
  String? get walletAddress => _walletAddress;
  List<Map<String, dynamic>> get transactions => _transactions;
  bool get isLoading => _isLoading;
  WalletSource get source => _source;
  bool get wcConnected => _wcConnected;
  String? get wcDAppName => _wcDAppName;
  bool get hasWallet => _walletAddress != null;

  Future<void> loadWallet() async {
    _walletAddress = AppConfig.prefs.getString('wallet_address');
    final sourceStr = AppConfig.prefs.getString('wallet_source');
    _source = WalletSource.values.firstWhere(
      (e) => e.name == sourceStr,
      orElse: () => _walletAddress != null ? WalletSource.created : WalletSource.none,
    );
    if (_walletAddress != null) {
      await refreshBalance();
      await loadTransactions();
    }
    notifyListeners();
  }

  Future<void> createWallet() async {
    _setLoading(true);
    try {
      final wallet = await _blockchain.createWallet();
      if (wallet != null) {
        _walletAddress = wallet['address'] as String;
        await AppConfig.prefs.setString('wallet_address', _walletAddress!);
        await AppConfig.prefs.setString('wallet_source', WalletSource.created.name);
        await AppConfig.storage.write(key: 'wallet_pk', value: wallet['private_key'] as String);
        _source = WalletSource.created;
        _balance = 0;
        notifyListeners();
      }
    } catch (_) {}
    _setLoading(false);
  }

  Future<String?> importFromPrivateKey(String privateKey) async {
    _setLoading(true);
    try {
      final result = await WalletImportService.importFromPrivateKey(privateKey);
      _walletAddress = result['address'];
      _source = WalletSource.importedKey;
      await AppConfig.prefs.setString('wallet_source', _source.name);
      await refreshBalance();
      await loadTransactions();
      _setLoading(false);
      return null;
    } catch (e) {
      _setLoading(false);
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<String?> importFromMnemonic(String mnemonic) async {
    _setLoading(true);
    try {
      final result = await WalletImportService.importFromMnemonic(mnemonic);
      _walletAddress = result['address'];
      _source = WalletSource.importedMnemonic;
      await AppConfig.prefs.setString('wallet_source', _source.name);
      await refreshBalance();
      await loadTransactions();
      _setLoading(false);
      return null;
    } catch (e) {
      _setLoading(false);
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  void setWalletConnectStatus({required bool connected, String? dAppName}) {
    _wcConnected = connected;
    _wcDAppName = dAppName;
    if (connected) {
      _source = WalletSource.walletConnect;
      AppConfig.prefs.setString('wallet_source', _source.name);
    }
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
    _setLoading(true);
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
        _setLoading(false);
        return true;
      }
    } catch (_) {}
    _setLoading(false);
    return false;
  }

  Future<void> loadTransactions() async {
    if (_walletAddress == null) return;
    try {
      _transactions = await _blockchain.getTransactionHistory(_walletAddress!);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> removeWallet() async {
    await AppConfig.prefs.remove('wallet_address');
    await AppConfig.prefs.remove('wallet_source');
    await AppConfig.storage.delete(key: 'wallet_pk');
    _walletAddress = null;
    _balance = 0;
    _transactions = [];
    _source = WalletSource.none;
    _wcConnected = false;
    _wcDAppName = null;
    notifyListeners();
  }

  void _setLoading(bool v) {
    _isLoading = v;
    notifyListeners();
  }
}
