class DroneModel {
  final String id;
  final String operatorId;
  final String name;
  final DroneStatus status;
  final double batteryLevel;
  final double? currentLat;
  final double? currentLng;
  final double? altitude;
  final double maxPayloadKg;
  final double maxRangeKm;
  final String? currentMissionId;
  final bool isSupervised;
  final String? supervisorId;

  DroneModel({
    required this.id,
    required this.operatorId,
    required this.name,
    required this.status,
    required this.batteryLevel,
    this.currentLat,
    this.currentLng,
    this.altitude,
    required this.maxPayloadKg,
    required this.maxRangeKm,
    this.currentMissionId,
    this.isSupervised = false,
    this.supervisorId,
  });

  factory DroneModel.fromJson(Map<String, dynamic> json) => DroneModel(
        id: json['id'],
        operatorId: json['operator_id'],
        name: json['name'],
        status: DroneStatus.fromString(json['status'] ?? 'idle'),
        batteryLevel: (json['battery_level'] as num).toDouble(),
        currentLat: (json['current_lat'] as num?)?.toDouble(),
        currentLng: (json['current_lng'] as num?)?.toDouble(),
        altitude: (json['altitude'] as num?)?.toDouble(),
        maxPayloadKg: (json['max_payload_kg'] as num?)?.toDouble() ?? 5.0,
        maxRangeKm: (json['max_range_km'] as num?)?.toDouble() ?? 15.0,
        currentMissionId: json['current_mission_id'],
        isSupervised: json['is_supervised'] ?? false,
        supervisorId: json['supervisor_id'],
      );
}

enum DroneStatus {
  idle('idle'),
  preflight('preflight'),
  inFlight('in_flight'),
  delivering('delivering'),
  returning('returning'),
  charging('charging'),
  maintenance('maintenance'),
  emergency('emergency');

  final String value;
  const DroneStatus(this.value);

  static DroneStatus fromString(String s) =>
      DroneStatus.values.firstWhere((e) => e.value == s, orElse: () => DroneStatus.idle);
}

class DeliveryMission {
  final String id;
  final String droneId;
  final String senderId;
  final String receiverId;
  final LocationPoint origin;
  final LocationPoint destination;
  final double packageWeightKg;
  final String packageDescription;
  final MissionStatus status;
  final double? estimatedMinutes;
  final String? txHash;
  final DateTime createdAt;

  DeliveryMission({
    required this.id,
    required this.droneId,
    required this.senderId,
    required this.receiverId,
    required this.origin,
    required this.destination,
    required this.packageWeightKg,
    required this.packageDescription,
    required this.status,
    this.estimatedMinutes,
    this.txHash,
    required this.createdAt,
  });

  factory DeliveryMission.fromJson(Map<String, dynamic> json) => DeliveryMission(
        id: json['id'],
        droneId: json['drone_id'],
        senderId: json['sender_id'],
        receiverId: json['receiver_id'],
        origin: LocationPoint.fromJson(json['origin']),
        destination: LocationPoint.fromJson(json['destination']),
        packageWeightKg: (json['package_weight_kg'] as num).toDouble(),
        packageDescription: json['package_description'] ?? '',
        status: MissionStatus.fromString(json['status'] ?? 'pending'),
        estimatedMinutes: (json['estimated_minutes'] as num?)?.toDouble(),
        txHash: json['tx_hash'],
        createdAt: DateTime.parse(json['created_at']),
      );
}

enum MissionStatus {
  pending('pending'),
  approved('approved'),
  inProgress('in_progress'),
  delivered('delivered'),
  failed('failed'),
  cancelled('cancelled');

  final String value;
  const MissionStatus(this.value);

  static MissionStatus fromString(String s) =>
      MissionStatus.values.firstWhere((e) => e.value == s, orElse: () => MissionStatus.pending);
}

class LocationPoint {
  final double lat;
  final double lng;
  final String? address;

  LocationPoint({required this.lat, required this.lng, this.address});

  factory LocationPoint.fromJson(Map<String, dynamic> json) => LocationPoint(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        address: json['address'],
      );
}
