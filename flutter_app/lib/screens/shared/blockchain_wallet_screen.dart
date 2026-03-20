import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../providers/blockchain_provider.dart';
import '../../config/theme.dart';

class BlockchainWalletScreen extends StatefulWidget {
  const BlockchainWalletScreen({super.key});

  @override
  State<BlockchainWalletScreen> createState() => _BlockchainWalletScreenState();
}

class _BlockchainWalletScreenState extends State<BlockchainWalletScreen> {
  final _toController = TextEditingController();
  final _amountController = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<BlockchainProvider>().loadWallet();
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<BlockchainProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('THR Wallet')),
      body: wallet.walletAddress == null
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.account_balance_wallet_outlined, size: 80, color: ThronosTheme.primaryColor),
                  const SizedBox(height: 16),
                  const Text('No wallet found', style: TextStyle(fontSize: 18)),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: wallet.isLoading ? null : () => wallet.createWallet(),
                    icon: const Icon(Icons.add),
                    label: const Text('Create Wallet'),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () async {
                await wallet.refreshBalance();
                await wallet.loadTransactions();
              },
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Balance Card
                  Card(
                    color: ThronosTheme.primaryColor,
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        children: [
                          const Text('Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
                          const SizedBox(height: 8),
                          Text(
                            '${wallet.balance.toStringAsFixed(4)} THR',
                            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                          const SizedBox(height: 16),
                          InkWell(
                            onTap: () {
                              Clipboard.setData(ClipboardData(text: wallet.walletAddress!));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Address copied')),
                              );
                            },
                            child: Text(
                              wallet.walletAddress!,
                              style: const TextStyle(color: Colors.white60, fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Send Tokens
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Send THR', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _toController,
                            decoration: const InputDecoration(labelText: 'Recipient Address', prefixIcon: Icon(Icons.person)),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _amountController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Amount (THR)', prefixIcon: Icon(Icons.money)),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: wallet.isLoading
                                  ? null
                                  : () async {
                                      final amount = double.tryParse(_amountController.text);
                                      if (amount == null || _toController.text.isEmpty) return;
                                      final ok = await wallet.sendTokens(_toController.text.trim(), amount);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(content: Text(ok ? 'Sent!' : 'Failed to send')),
                                        );
                                        if (ok) {
                                          _toController.clear();
                                          _amountController.clear();
                                        }
                                      }
                                    },
                              child: wallet.isLoading
                                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Text('Send'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Transaction History
                  const Text('Recent Transactions', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  if (wallet.transactions.isEmpty)
                    const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('No transactions yet'))),
                  ...wallet.transactions.map((tx) => ListTile(
                        leading: Icon(
                          tx['type'] == 'send' ? Icons.arrow_upward : Icons.arrow_downward,
                          color: tx['type'] == 'send' ? Colors.red : Colors.green,
                        ),
                        title: Text('${tx['amount']} THR'),
                        subtitle: Text(tx['to'] ?? tx['from'] ?? '', overflow: TextOverflow.ellipsis),
                        trailing: Text(tx['timestamp'] ?? ''),
                      )),
                ],
              ),
            ),
    );
  }

  @override
  void dispose() {
    _toController.dispose();
    _amountController.dispose();
    super.dispose();
  }
}
