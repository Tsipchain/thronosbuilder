import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';

class CallCenterProvider extends ChangeNotifier {
  final _api = ApiService();
  final _ws = WebSocketService();

  bool _isAvailable = false;
  bool _inCall = false;
  String? _activeCallId;
  String? _activeCallerId;
  String? _activeCallerName;
  List<Map<String, dynamic>> _callQueue = [];
  List<Map<String, dynamic>> _activeSupervisedDrivers = [];
  List<Map<String, dynamic>> _activeSupervisedDrones = [];
  int _todayCalls = 0;
  StreamSubscription? _wsSubscription;

  bool get isAvailable => _isAvailable;
  bool get inCall => _inCall;
  String? get activeCallId => _activeCallId;
  String? get activeCallerName => _activeCallerName;
  List<Map<String, dynamic>> get callQueue => _callQueue;
  List<Map<String, dynamic>> get activeSupervisedDrivers => _activeSupervisedDrivers;
  List<Map<String, dynamic>> get activeSupervisedDrones => _activeSupervisedDrones;
  int get todayCalls => _todayCalls;

  void initCallCenter(String agentId) {
    _ws.subscribeCallCenter(agentId);
    _wsSubscription = _ws.messages.listen((message) {
      switch (message['type']) {
        case 'incoming_call':
          _callQueue.add(message);
          notifyListeners();
          break;
        case 'call_ended':
          if (message['call_id'] == _activeCallId) {
            _inCall = false;
            _activeCallId = null;
            _activeCallerId = null;
            _activeCallerName = null;
          }
          notifyListeners();
          break;
        case 'driver_update':
          _updateDriverList(message);
          break;
        case 'drone_update':
          _updateDroneList(message);
          break;
      }
    });
  }

  Future<void> loadCallCenterDashboard() async {
    try {
      final response = await _api.verifyGet('/call-center/dashboard');
      _callQueue = List<Map<String, dynamic>>.from(response['queue'] ?? []);
      _activeSupervisedDrivers = List<Map<String, dynamic>>.from(response['supervised_drivers'] ?? []);
      _activeSupervisedDrones = List<Map<String, dynamic>>.from(response['supervised_drones'] ?? []);
      _todayCalls = response['today_calls'] ?? 0;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggleAvailability() async {
    _isAvailable = !_isAvailable;
    notifyListeners();
    await _api.verifyPost('/call-center/availability', {'available': _isAvailable});
  }

  Future<bool> answerCall(String callId) async {
    try {
      final response = await _api.verifyPost('/call-center/answer/$callId', {});
      _inCall = true;
      _activeCallId = callId;
      _activeCallerId = response['caller_id'];
      _activeCallerName = response['caller_name'];
      _callQueue.removeWhere((c) => c['call_id'] == callId);
      _todayCalls++;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> endCall() async {
    if (_activeCallId == null) return;
    await _api.verifyPost('/call-center/end/$_activeCallId', {});
    _inCall = false;
    _activeCallId = null;
    _activeCallerId = null;
    _activeCallerName = null;
    notifyListeners();
  }

  Future<void> superviseDriver(String driverId) async {
    await _api.verifyPost('/call-center/supervise/driver/$driverId', {});
  }

  Future<void> superviseDrone(String droneId) async {
    await _api.verifyPost('/call-center/supervise/drone/$droneId', {});
  }

  void _updateDriverList(Map<String, dynamic> data) {
    final idx = _activeSupervisedDrivers.indexWhere((d) => d['id'] == data['driver_id']);
    if (idx >= 0) {
      _activeSupervisedDrivers[idx] = {..._activeSupervisedDrivers[idx], ...data};
    }
    notifyListeners();
  }

  void _updateDroneList(Map<String, dynamic> data) {
    final idx = _activeSupervisedDrones.indexWhere((d) => d['id'] == data['drone_id']);
    if (idx >= 0) {
      _activeSupervisedDrones[idx] = {..._activeSupervisedDrones[idx], ...data};
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
