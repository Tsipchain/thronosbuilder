class UserModel {
  final String id;
  final String email;
  final String phone;
  final String fullName;
  final String? avatar;
  final UserRole role;
  final bool isVerified;
  final String? walletAddress;
  final String? organizationId;
  final DateTime createdAt;

  UserModel({
    required this.id,
    required this.email,
    required this.phone,
    required this.fullName,
    this.avatar,
    required this.role,
    this.isVerified = false,
    this.walletAddress,
    this.organizationId,
    required this.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'],
        email: json['email'] ?? '',
        phone: json['phone'] ?? '',
        fullName: json['full_name'] ?? '',
        avatar: json['avatar'],
        role: UserRole.fromString(json['role'] ?? 'driver'),
        isVerified: json['is_verified'] ?? false,
        walletAddress: json['wallet_address'],
        organizationId: json['organization_id'],
        createdAt: DateTime.parse(json['created_at']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'phone': phone,
        'full_name': fullName,
        'avatar': avatar,
        'role': role.value,
        'is_verified': isVerified,
        'wallet_address': walletAddress,
        'organization_id': organizationId,
        'created_at': createdAt.toIso8601String(),
      };
}

enum UserRole {
  driver('driver'),
  agent('agent'),
  admin('admin'),
  schoolInstructor('school_instructor'),
  droneOperator('drone_operator'),
  callCenterAgent('call_center_agent');

  final String value;
  const UserRole(this.value);

  static UserRole fromString(String s) =>
      UserRole.values.firstWhere((e) => e.value == s, orElse: () => UserRole.driver);
}
