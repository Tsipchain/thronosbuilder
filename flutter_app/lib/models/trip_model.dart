class TripModel {
  final String id;
  final TripType type;
  final TripStatus status;
  final String driverId;
  final String? passengerId;
  final LocationPoint pickup;
  final LocationPoint dropoff;
  final double? fare;
  final double? distance;
  final int? duration;
  final String? txHash;
  final DateTime createdAt;
  final DateTime? completedAt;
  final double? rating;

  TripModel({
    required this.id,
    required this.type,
    required this.status,
    required this.driverId,
    this.passengerId,
    required this.pickup,
    required this.dropoff,
    this.fare,
    this.distance,
    this.duration,
    this.txHash,
    required this.createdAt,
    this.completedAt,
    this.rating,
  });

  factory TripModel.fromJson(Map<String, dynamic> json) => TripModel(
        id: json['id'],
        type: TripType.fromString(json['type'] ?? 'taxi'),
        status: TripStatus.fromString(json['status'] ?? 'pending'),
        driverId: json['driver_id'],
        passengerId: json['passenger_id'],
        pickup: LocationPoint.fromJson(json['pickup']),
        dropoff: LocationPoint.fromJson(json['dropoff']),
        fare: (json['fare'] as num?)?.toDouble(),
        distance: (json['distance'] as num?)?.toDouble(),
        duration: json['duration'],
        txHash: json['tx_hash'],
        createdAt: DateTime.parse(json['created_at']),
        completedAt: json['completed_at'] != null
            ? DateTime.parse(json['completed_at'])
            : null,
        rating: (json['rating'] as num?)?.toDouble(),
      );
}

enum TripType {
  taxi('taxi'),
  school('school'),
  transport('transport'),
  drone('drone');

  final String value;
  const TripType(this.value);

  static TripType fromString(String s) =>
      TripType.values.firstWhere((e) => e.value == s, orElse: () => TripType.taxi);
}

enum TripStatus {
  pending('pending'),
  accepted('accepted'),
  enRoute('en_route'),
  inProgress('in_progress'),
  completed('completed'),
  cancelled('cancelled');

  final String value;
  const TripStatus(this.value);

  static TripStatus fromString(String s) =>
      TripStatus.values.firstWhere((e) => e.value == s, orElse: () => TripStatus.pending);
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

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng, 'address': address};
}
