import 'package:flutter/foundation.dart';
import '../models/trip_model.dart';
import '../services/api_service.dart';
import '../services/blockchain_service.dart';

class DriverProvider extends ChangeNotifier {
  final _api = ApiService();
  final _blockchain = BlockchainService();

  bool _isOnline = false;
  bool _isLoading = false;
  TripModel? _activeTrip;
  List<TripModel> _tripHistory = [];
  List<TripModel> _availableTrips = [];
  double _todayEarnings = 0;
  double _weeklyEarnings = 0;
  int _totalTrips = 0;
  double _rating = 5.0;
  String _selectedMode = 'taxi'; // taxi, school, transport, drone

  bool get isOnline => _isOnline;
  bool get isLoading => _isLoading;
  TripModel? get activeTrip => _activeTrip;
  List<TripModel> get tripHistory => _tripHistory;
  List<TripModel> get availableTrips => _availableTrips;
  double get todayEarnings => _todayEarnings;
  double get weeklyEarnings => _weeklyEarnings;
  int get totalTrips => _totalTrips;
  double get rating => _rating;
  String get selectedMode => _selectedMode;

  void setMode(String mode) {
    _selectedMode = mode;
    notifyListeners();
  }

  Future<void> toggleOnline() async {
    _isOnline = !_isOnline;
    notifyListeners();
    await _api.driverPost('/driver/status', {'online': _isOnline, 'mode': _selectedMode});
  }

  Future<void> loadDashboard() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.driverGet('/driver/dashboard');
      _todayEarnings = (response['today_earnings'] as num?)?.toDouble() ?? 0;
      _weeklyEarnings = (response['weekly_earnings'] as num?)?.toDouble() ?? 0;
      _totalTrips = response['total_trips'] ?? 0;
      _rating = (response['rating'] as num?)?.toDouble() ?? 5.0;
      if (response['active_trip'] != null) {
        _activeTrip = TripModel.fromJson(response['active_trip']);
      }
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadAvailableTrips() async {
    try {
      final response = await _api.driverGet('/trips/available?mode=$_selectedMode');
      _availableTrips = (response['trips'] as List)
          .map((t) => TripModel.fromJson(t))
          .toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> acceptTrip(String tripId) async {
    try {
      final response = await _api.driverPost('/trips/$tripId/accept', {});
      _activeTrip = TripModel.fromJson(response['trip']);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> startTrip(String tripId) async {
    try {
      final response = await _api.driverPost('/trips/$tripId/start', {});
      _activeTrip = TripModel.fromJson(response['trip']);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> completeTrip(String tripId) async {
    try {
      final response = await _api.driverPost('/trips/$tripId/complete', {});
      final trip = TripModel.fromJson(response['trip']);

      // Record on blockchain
      await _blockchain.recordTrip(
        tripId: tripId,
        driverId: trip.driverId,
        tripType: trip.type.value,
        fare: trip.fare ?? 0,
        distance: trip.distance ?? 0,
      );

      _activeTrip = null;
      _todayEarnings += trip.fare ?? 0;
      _totalTrips++;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> loadTripHistory() async {
    try {
      final response = await _api.driverGet('/trips/history');
      _tripHistory = (response['trips'] as List)
          .map((t) => TripModel.fromJson(t))
          .toList();
      notifyListeners();
    } catch (_) {}
  }
}
