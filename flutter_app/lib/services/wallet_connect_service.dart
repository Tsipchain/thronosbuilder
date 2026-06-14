import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:walletconnect_flutter_v2/walletconnect_flutter_v2.dart';
import '../config/app_config.dart';
import 'wallet_import_service.dart';

class WalletConnectService extends ChangeNotifier {
  static final WalletConnectService _instance = WalletConnectService._internal();
  factory WalletConnectService() => _instance;
  WalletConnectService._internal();

  Web3Wallet? _web3Wallet;
  bool _initialized = false;
  bool _isConnected = false;
  String? _connectedDAppName;
  String? _connectedDAppUrl;
  String? _pendingUri;

  bool get isInitialized => _initialized;
  bool get isConnected => _isConnected;
  String? get connectedDAppName => _connectedDAppName;
  String? get connectedDAppUrl => _connectedDAppUrl;

  // Called once at app startup
  Future<void> init() async {
    if (_initialized) return;
    try {
      _web3Wallet = await Web3Wallet.createInstance(
        projectId: AppConfig.walletConnectProjectId,
        metadata: const PairingMetadata(
          name: 'Thronos Wallet',
          description: 'Thronos Mobile Wallet v2',
          url: 'https://thronoschain.org',
          icons: ['https://thronoschain.org/assets/icon.png'],
        ),
      );
      _registerHandlers();
      _initialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('WalletConnect init error: $e');
    }
  }

  void _registerHandlers() {
    final wallet = _web3Wallet!;

    // Session proposal: dApp wants to connect
    wallet.onSessionProposal.subscribe(_onSessionProposal);

    // Signing requests
    wallet.registerRequestHandler(
      chainId: 'eip155:3001',
      method: 'eth_sign',
      handler: _handleEthSign,
    );
    wallet.registerRequestHandler(
      chainId: 'eip155:3001',
      method: 'personal_sign',
      handler: _handlePersonalSign,
    );
    wallet.registerRequestHandler(
      chainId: 'eip155:3001',
      method: 'eth_sendTransaction',
      handler: _handleSendTransaction,
    );
  }

  Future<void> _onSessionProposal(SessionProposalEvent? event) async {
    if (event == null) return;
    final address = AppConfig.prefs.getString('wallet_address');
    if (address == null) return;

    try {
      await _web3Wallet!.approveSession(
        id: event.id,
        namespaces: {
          'eip155': Namespace(
            accounts: ['eip155:3001:$address'],
            methods: ['eth_sign', 'personal_sign', 'eth_sendTransaction'],
            events: ['chainChanged', 'accountsChanged'],
          ),
        },
      );
      final meta = event.params.proposer.metadata;
      _isConnected = true;
      _connectedDAppName = meta.name;
      _connectedDAppUrl = meta.url;
      notifyListeners();
    } catch (e) {
      debugPrint('Session approval error: $e');
    }
  }

  Future<String?> _handleEthSign(String topic, dynamic params) async {
    return await WalletImportService.signMessage(params[1] as String);
  }

  Future<String?> _handlePersonalSign(String topic, dynamic params) async {
    return await WalletImportService.signMessage(params[0] as String);
  }

  Future<String?> _handleSendTransaction(String topic, dynamic params) async {
    final tx = (params as List).first as Map<String, dynamic>;
    return await WalletImportService.signTransaction(tx);
  }

  // Pair from a WalletConnect URI (from QR scan or deep link)
  Future<void> pairWithUri(String uri) async {
    if (!_initialized) await init();
    try {
      await _web3Wallet!.pair(uri: Uri.parse(uri));
    } catch (e) {
      debugPrint('WalletConnect pair error: $e');
      rethrow;
    }
  }

  Future<void> disconnectAll() async {
    if (_web3Wallet == null) return;
    final sessions = _web3Wallet!.sessions.getAll();
    for (final session in sessions) {
      await _web3Wallet!.disconnectSession(
        topic: session.topic,
        reason: Errors.getSdkError(Errors.USER_DISCONNECTED),
      );
    }
    _isConnected = false;
    _connectedDAppName = null;
    _connectedDAppUrl = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _web3Wallet?.onSessionProposal.unsubscribe(_onSessionProposal);
    super.dispose();
  }
}
