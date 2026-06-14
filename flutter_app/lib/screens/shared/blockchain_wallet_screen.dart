import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../providers/blockchain_provider.dart';
import '../../services/wallet_connect_service.dart';
import '../../config/theme.dart';

class BlockchainWalletScreen extends StatefulWidget {
  const BlockchainWalletScreen({super.key});

  @override
  State<BlockchainWalletScreen> createState() => _BlockchainWalletScreenState();
}

class _BlockchainWalletScreenState extends State<BlockchainWalletScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _toController = TextEditingController();
  final _amountController = TextEditingController();
  final _keyController = TextEditingController();
  final _mnemonicController = TextEditingController();
  bool _showMnemonic = false;
  bool _obscureKey = true;
  bool _scanning = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    context.read<BlockchainProvider>().loadWallet();
    WalletConnectService().init();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _toController.dispose();
    _amountController.dispose();
    _keyController.dispose();
    _mnemonicController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<BlockchainProvider>();
    final wc = context.watch<WalletConnectService>();

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Thronos Wallet'),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: ThronosTheme.primaryColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text('v2', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: ThronosTheme.primaryColor)),
            ),
          ],
        ),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(icon: Icon(Icons.account_balance_wallet), text: 'Wallet'),
            Tab(icon: Icon(Icons.link), text: 'Connect'),
            Tab(icon: Icon(Icons.history), text: 'Transactions'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _buildWalletTab(wallet),
          _buildConnectTab(wallet, wc),
          _buildTransactionsTab(wallet),
        ],
      ),
    );
  }

  // ── Tab 1: Wallet ──────────────────────────────────────────────────────────
  Widget _buildWalletTab(BlockchainProvider wallet) {
    if (!wallet.hasWallet) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.account_balance_wallet_outlined, size: 80, color: ThronosTheme.primaryColor),
            const SizedBox(height: 16),
            const Text('No wallet connected', style: TextStyle(fontSize: 18)),
            const SizedBox(height: 8),
            const Text('Use the Connect tab to import or link your wallet',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => _tabs.animateTo(1),
              icon: const Icon(Icons.link),
              label: const Text('Go to Connect'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: wallet.isLoading ? null : () => wallet.createWallet(),
              icon: wallet.isLoading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add),
              label: const Text('Create New Wallet'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        await wallet.refreshBalance();
        await wallet.loadTransactions();
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Balance Card
          Card(
            elevation: 4,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            color: ThronosTheme.primaryColor,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('THR Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
                      _sourceChip(wallet.source),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${wallet.balance.toStringAsFixed(4)} THR',
                    style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: wallet.walletAddress!));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Address copied to clipboard')),
                      );
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.copy, size: 14, color: Colors.white60),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            wallet.walletAddress!,
                            style: const TextStyle(color: Colors.white60, fontSize: 12),
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Send Tokens
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Send THR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _toController,
                    decoration: const InputDecoration(
                      labelText: 'Recipient Address',
                      prefixIcon: Icon(Icons.person_outline),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Amount (THR)',
                      prefixIcon: Icon(Icons.monetization_on_outlined),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: wallet.isLoading ? null : _doSend,
                      icon: wallet.isLoading
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send),
                      label: const Text('Send'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _doSend() async {
    final wallet = context.read<BlockchainProvider>();
    final amount = double.tryParse(_amountController.text);
    if (amount == null || _toController.text.isEmpty) return;
    final ok = await wallet.sendTokens(_toController.text.trim(), amount);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ok ? 'Transaction submitted!' : 'Failed to send')),
      );
      if (ok) {
        _toController.clear();
        _amountController.clear();
      }
    }
  }

  // ── Tab 2: Connect ─────────────────────────────────────────────────────────
  Widget _buildConnectTab(BlockchainProvider wallet, WalletConnectService wc) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // WalletConnect Section
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Image.network('https://avatars.githubusercontent.com/u/37784886', width: 28, height: 28,
                          errorBuilder: (_, __, ___) => const Icon(Icons.link, color: ThronosTheme.primaryColor)),
                      const SizedBox(width: 8),
                      const Text('WalletConnect', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('Scan a QR code from a Thronos dApp to connect your mobile wallet.',
                      style: TextStyle(color: Colors.grey, fontSize: 13)),
                  const SizedBox(height: 12),
                  if (wc.isConnected) ...[  
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade300),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, color: Colors.green, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Connected to ${wc.connectedDAppName ?? "dApp"}',
                                    style: const TextStyle(fontWeight: FontWeight.w600)),
                                if (wc.connectedDAppUrl != null)
                                  Text(wc.connectedDAppUrl!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, color: Colors.red),
                            onPressed: () => wc.disconnectAll(),
                            tooltip: 'Disconnect',
                          ),
                        ],
                      ),
                    ),
                  ] else ...[  
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                        onPressed: () => setState(() => _scanning = !_scanning),
                        icon: Icon(_scanning ? Icons.close : Icons.qr_code_scanner),
                        label: Text(_scanning ? 'Close Scanner' : 'Scan WalletConnect QR'),
                      ),
                    ),
                    if (_scanning) ...[  
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          height: 260,
                          child: MobileScanner(
                            onDetect: (capture) {
                              final barcode = capture.barcodes.firstOrNull;
                              final value = barcode?.rawValue;
                              if (value != null && value.startsWith('wc:')) {
                                setState(() => _scanning = false);
                                _handleWcUri(value);
                              }
                            },
                          ),
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Import Key Section
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.vpn_key, color: ThronosTheme.primaryColor),
                      SizedBox(width: 8),
                      Text('Import Wallet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('Import your existing Thronos wallet with a private key or seed phrase.',
                      style: TextStyle(color: Colors.grey, fontSize: 13)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      ChoiceChip(
                        label: const Text('Private Key'),
                        selected: !_showMnemonic,
                        onSelected: (_) => setState(() => _showMnemonic = false),
                      ),
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: const Text('Seed Phrase'),
                        selected: _showMnemonic,
                        onSelected: (_) => setState(() => _showMnemonic = true),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (!_showMnemonic) ...[  
                    TextField(
                      controller: _keyController,
                      obscureText: _obscureKey,
                      decoration: InputDecoration(
                        labelText: 'Private Key (hex)',
                        hintText: '0x...',
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          icon: Icon(_obscureKey ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscureKey = !_obscureKey),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: context.watch<BlockchainProvider>().isLoading ? null : _importKey,
                        icon: const Icon(Icons.download),
                        label: const Text('Import with Private Key'),
                      ),
                    ),
                  ] else ...[  
                    TextField(
                      controller: _mnemonicController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Seed Phrase (12 or 24 words)',
                        hintText: 'word1 word2 word3 ...',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.article_outlined),
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: context.watch<BlockchainProvider>().isLoading ? null : _importMnemonic,
                        icon: const Icon(Icons.download),
                        label: const Text('Import with Seed Phrase'),
                      ),
                    ),
                  ],
                  if (wallet.hasWallet) ...[  
                    const SizedBox(height: 12),
                    const Divider(),
                    TextButton.icon(
                      onPressed: () => _confirmRemoveWallet(wallet),
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                      label: const Text('Remove Wallet', style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleWcUri(String uri) async {
    final wc = WalletConnectService();
    try {
      if (!context.read<BlockchainProvider>().hasWallet) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please import or create a wallet first')),
        );
        return;
      }
      await wc.pairWithUri(uri);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('WalletConnect pairing successful!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Connection failed: ${e.toString()}')),
        );
      }
    }
  }

  Future<void> _importKey() async {
    final key = _keyController.text.trim();
    if (key.isEmpty) return;
    final error = await context.read<BlockchainProvider>().importFromPrivateKey(key);
    if (mounted) {
      if (error == null) {
        _keyController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Wallet imported successfully!')),
        );
        _tabs.animateTo(0);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error')),
        );
      }
    }
  }

  Future<void> _importMnemonic() async {
    final phrase = _mnemonicController.text.trim();
    if (phrase.isEmpty) return;
    final error = await context.read<BlockchainProvider>().importFromMnemonic(phrase);
    if (mounted) {
      if (error == null) {
        _mnemonicController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Wallet imported successfully!')),
        );
        _tabs.animateTo(0);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error')),
        );
      }
    }
  }

  Future<void> _confirmRemoveWallet(BlockchainProvider wallet) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove Wallet'),
        content: const Text('Are you sure? Make sure you have your private key or seed phrase backed up.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      await wallet.removeWallet();
      await WalletConnectService().disconnectAll();
    }
  }

  // ── Tab 3: Transactions ────────────────────────────────────────────────────
  Widget _buildTransactionsTab(BlockchainProvider wallet) {
    if (!wallet.hasWallet) {
      return const Center(
        child: Text('Connect a wallet to see transactions', style: TextStyle(color: Colors.grey)),
      );
    }
    if (wallet.transactions.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No transactions yet', style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () async {
        await wallet.refreshBalance();
        await wallet.loadTransactions();
      },
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: wallet.transactions.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final tx = wallet.transactions[i];
          final isSend = tx['type'] == 'send';
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: isSend ? Colors.red.shade50 : Colors.green.shade50,
              child: Icon(isSend ? Icons.arrow_upward : Icons.arrow_downward,
                  color: isSend ? Colors.red : Colors.green, size: 20),
            ),
            title: Text('${tx['amount']} THR', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              isSend ? 'To: ${tx['to'] ?? ''}' : 'From: ${tx['from'] ?? ''}',
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(tx['timestamp'] ?? '', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                if (tx['status'] != null)
                  Text(tx['status'] as String, style: TextStyle(fontSize: 10, color: _statusColor(tx['status'] as String))),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _sourceChip(WalletSource source) {
    final labels = {
      WalletSource.created: ('New', Colors.blue),
      WalletSource.importedKey: ('Imported', Colors.orange),
      WalletSource.importedMnemonic: ('Seed', Colors.purple),
      WalletSource.walletConnect: ('WC', Colors.teal),
      WalletSource.none: ('—', Colors.grey),
    };
    final (label, color) = labels[source] ?? ('—', Colors.grey);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: color)),
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed': return Colors.green;
      case 'pending': return Colors.orange;
      case 'failed': return Colors.red;
      default: return Colors.grey;
    }
  }
}
