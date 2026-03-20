import 'package:flutter/foundation.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../config/app_config.dart';

class AuthProvider extends ChangeNotifier {
  UserModel? _user;
  bool _isLoading = false;
  String? _error;

  UserModel? get user => _user;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _user != null;
  String? get error => _error;

  final _api = ApiService();

  Future<bool> login(String phone, String otp) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.driverPost('/auth/login', {
        'phone': phone,
        'otp': otp,
      });
      await AppConfig.setAuthToken(response['token']);
      _user = UserModel.fromJson(response['user']);
      WebSocketService().connect(_user!.id);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> requestOtp(String phone) async {
    try {
      await _api.driverPost('/auth/request-otp', {'phone': phone});
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String phone,
    required String fullName,
    required String email,
    required UserRole role,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await _api.driverPost('/auth/register', {
        'phone': phone,
        'full_name': fullName,
        'email': email,
        'role': role.value,
      });
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> loadUser() async {
    try {
      final token = await AppConfig.getAuthToken();
      if (token == null) return;

      final response = await _api.driverGet('/auth/me');
      _user = UserModel.fromJson(response['user']);
      WebSocketService().connect(_user!.id);
      notifyListeners();
    } catch (_) {
      await logout();
    }
  }

  Future<void> logout() async {
    await AppConfig.clearAuth();
    WebSocketService().disconnect();
    _user = null;
    notifyListeners();
  }
}
