import 'package:flutter/foundation.dart';
import '../models/verification_model.dart';
import '../services/api_service.dart';
import '../services/blockchain_service.dart';

class VerifyProvider extends ChangeNotifier {
  final _api = ApiService();
  final _blockchain = BlockchainService();

  bool _isLoading = false;
  List<VerificationModel> _pendingVerifications = [];
  List<VerificationModel> _completedVerifications = [];
  VerificationModel? _activeVerification;
  int _todayReviewed = 0;
  int _totalReviewed = 0;

  bool get isLoading => _isLoading;
  List<VerificationModel> get pendingVerifications => _pendingVerifications;
  List<VerificationModel> get completedVerifications => _completedVerifications;
  VerificationModel? get activeVerification => _activeVerification;
  int get todayReviewed => _todayReviewed;
  int get totalReviewed => _totalReviewed;

  Future<void> loadDashboard() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.verifyGet('/verifications/dashboard');
      _todayReviewed = response['today_reviewed'] ?? 0;
      _totalReviewed = response['total_reviewed'] ?? 0;
      _pendingVerifications = (response['pending'] as List? ?? [])
          .map((v) => VerificationModel.fromJson(v))
          .toList();
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadPending() async {
    try {
      final response = await _api.verifyGet('/verifications/pending');
      _pendingVerifications = (response['verifications'] as List)
          .map((v) => VerificationModel.fromJson(v))
          .toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> startReview(String verificationId) async {
    try {
      final response = await _api.verifyPost('/verifications/$verificationId/start-review', {});
      _activeVerification = VerificationModel.fromJson(response['verification']);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> approveVerification(String verificationId, {String? notes}) async {
    try {
      final response = await _api.verifyPost('/verifications/$verificationId/approve', {
        'notes': notes,
      });

      // Record on blockchain
      final verification = VerificationModel.fromJson(response['verification']);
      await _blockchain.recordVerification(
        verificationId: verificationId,
        userId: verification.userId,
        verificationType: verification.type.value,
        status: 'approved',
        agentId: verification.agentId ?? '',
      );

      _activeVerification = null;
      _todayReviewed++;
      _totalReviewed++;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> rejectVerification(String verificationId, {required String reason}) async {
    try {
      final response = await _api.verifyPost('/verifications/$verificationId/reject', {
        'reason': reason,
      });

      final verification = VerificationModel.fromJson(response['verification']);
      await _blockchain.recordVerification(
        verificationId: verificationId,
        userId: verification.userId,
        verificationType: verification.type.value,
        status: 'rejected',
        agentId: verification.agentId ?? '',
      );

      _activeVerification = null;
      _todayReviewed++;
      _totalReviewed++;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> submitVerification({
    required VerificationType type,
    required String documentPath,
    String? selfiePath,
  }) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _api.verifyUpload('/verifications/submit', documentPath, 'document');
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (_) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}
