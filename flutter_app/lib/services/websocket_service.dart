import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/app_config.dart';

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  WebSocketChannel? _channel;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  Timer? _heartbeat;
  bool _isConnected = false;

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  bool get isConnected => _isConnected;

  Future<void> connect(String userId) async {
    try {
      final token = await AppConfig.getAuthToken();
      _channel = WebSocketChannel.connect(
        Uri.parse('${AppConfig.wsEndpoint}?user_id=$userId&token=$token'),
      );
      _isConnected = true;

      _channel!.stream.listen(
        (data) {
          final message = jsonDecode(data as String);
          _messageController.add(message);
        },
        onDone: () {
          _isConnected = false;
          _reconnect(userId);
        },
        onError: (error) {
          _isConnected = false;
          _reconnect(userId);
        },
      );

      _startHeartbeat();
    } catch (e) {
      _isConnected = false;
    }
  }

  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(const Duration(seconds: 30), (_) {
      send({'type': 'ping'});
    });
  }

  void _reconnect(String userId) {
    Future.delayed(const Duration(seconds: 5), () {
      if (!_isConnected) connect(userId);
    });
  }

  void send(Map<String, dynamic> data) {
    if (_isConnected && _channel != null) {
      _channel!.sink.add(jsonEncode(data));
    }
  }

  /// Subscribe to trip updates
  void subscribeTripUpdates(String tripId) {
    send({'type': 'subscribe', 'channel': 'trip', 'trip_id': tripId});
  }

  /// Subscribe to drone telemetry
  void subscribeDroneTelemetry(String droneId) {
    send({'type': 'subscribe', 'channel': 'drone', 'drone_id': droneId});
  }

  /// Subscribe to call center events
  void subscribeCallCenter(String agentId) {
    send({'type': 'subscribe', 'channel': 'call_center', 'agent_id': agentId});
  }

  /// Send location update
  void sendLocationUpdate(double lat, double lng, double? speed) {
    send({
      'type': 'location_update',
      'lat': lat,
      'lng': lng,
      'speed': speed,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  void disconnect() {
    _heartbeat?.cancel();
    _channel?.sink.close();
    _isConnected = false;
  }

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
