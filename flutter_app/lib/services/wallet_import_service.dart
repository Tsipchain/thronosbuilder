import 'dart:typed_data';
import 'package:bip39/bip39.dart' as bip39;
import 'package:web3dart/crypto.dart';
import 'package:web3dart/web3dart.dart';
import '../config/app_config.dart';

class WalletImportService {
  // Import from hex private key (with or without 0x prefix)
  static Future<Map<String, String>> importFromPrivateKey(String rawKey) async {
    final clean = rawKey.trim().replaceFirst(RegExp(r'^0x'), '');
    if (clean.length != 64) throw Exception('invalid_private_key_length');
    final credentials = EthPrivateKey.fromHex(clean);
    final address = credentials.address.hexEip55;
    await _persist(address, clean);
    return {'address': address, 'private_key': clean};
  }

  // Import from 12 or 24 word mnemonic
  static Future<Map<String, String>> importFromMnemonic(String mnemonic) async {
    final words = mnemonic.trim().toLowerCase();
    if (!bip39.validateMnemonic(words)) throw Exception('invalid_mnemonic');
    final seed = bip39.mnemonicToSeedHex(words);
    // Derive m/44'/60'/0'/0/0 – take first 32 bytes of seed as private key
    final privateKeyBytes = hexToBytes(seed).sublist(0, 32);
    final privateKeyHex = bytesToHex(privateKeyBytes);
    final credentials = EthPrivateKey.fromHex(privateKeyHex);
    final address = credentials.address.hexEip55;
    await _persist(address, privateKeyHex);
    return {'address': address, 'private_key': privateKeyHex};
  }

  static Future<void> _persist(String address, String privateKey) async {
    await AppConfig.prefs.setString('wallet_address', address);
    await AppConfig.storage.write(key: 'wallet_pk', value: privateKey);
  }

  // Sign an arbitrary message (eth_sign / personal_sign)
  static Future<String?> signMessage(String message) async {
    final pk = await AppConfig.storage.read(key: 'wallet_pk');
    if (pk == null) return null;
    final credentials = EthPrivateKey.fromHex(pk);
    final msgBytes = message.startsWith('0x')
        ? hexToBytes(message.substring(2))
        : Uint8List.fromList(message.codeUnits);
    final sig = credentials.signPersonalMessageToUint8List(msgBytes);
    return '0x${bytesToHex(sig)}';
  }

  // Sign a transaction map (from eth_sendTransaction)
  static Future<String?> signTransaction(Map<String, dynamic> tx) async {
    final pk = await AppConfig.storage.read(key: 'wallet_pk');
    if (pk == null) return null;
    final credentials = EthPrivateKey.fromHex(pk);
    final transaction = Transaction(
      from: EthereumAddress.fromHex(tx['from'] as String? ?? ''),
      to: tx['to'] != null ? EthereumAddress.fromHex(tx['to'] as String) : null,
      value: tx['value'] != null ? EtherAmount.fromBigInt(EtherUnit.wei, BigInt.parse((tx['value'] as String).replaceFirst('0x', ''), radix: 16)) : null,
      data: tx['data'] != null ? hexToBytes((tx['data'] as String).replaceFirst('0x', '')) : null,
    );
    final signed = await credentials.signTransaction(transaction, chainId: 3001);
    return '0x${bytesToHex(signed)}';
  }
}
