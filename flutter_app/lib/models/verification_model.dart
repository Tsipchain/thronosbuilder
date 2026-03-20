class VerificationModel {
  final String id;
  final String userId;
  final VerificationType type;
  final VerificationStatus status;
  final String? documentUrl;
  final String? selfieUrl;
  final String? agentId;
  final String? notes;
  final double? confidenceScore;
  final String? blockchainTxHash;
  final DateTime createdAt;
  final DateTime? reviewedAt;

  VerificationModel({
    required this.id,
    required this.userId,
    required this.type,
    required this.status,
    this.documentUrl,
    this.selfieUrl,
    this.agentId,
    this.notes,
    this.confidenceScore,
    this.blockchainTxHash,
    required this.createdAt,
    this.reviewedAt,
  });

  factory VerificationModel.fromJson(Map<String, dynamic> json) => VerificationModel(
        id: json['id'],
        userId: json['user_id'],
        type: VerificationType.fromString(json['type'] ?? 'id'),
        status: VerificationStatus.fromString(json['status'] ?? 'pending'),
        documentUrl: json['document_url'],
        selfieUrl: json['selfie_url'],
        agentId: json['agent_id'],
        notes: json['notes'],
        confidenceScore: (json['confidence_score'] as num?)?.toDouble(),
        blockchainTxHash: json['blockchain_tx_hash'],
        createdAt: DateTime.parse(json['created_at']),
        reviewedAt: json['reviewed_at'] != null
            ? DateTime.parse(json['reviewed_at'])
            : null,
      );
}

enum VerificationType {
  id('id'),
  driverLicense('driver_license'),
  vehicleRegistration('vehicle_registration'),
  dronePermit('drone_permit'),
  instructorCert('instructor_cert'),
  ageVerification('age_verification');

  final String value;
  const VerificationType(this.value);

  static VerificationType fromString(String s) =>
      VerificationType.values.firstWhere((e) => e.value == s, orElse: () => VerificationType.id);
}

enum VerificationStatus {
  pending('pending'),
  inReview('in_review'),
  approved('approved'),
  rejected('rejected'),
  expired('expired');

  final String value;
  const VerificationStatus(this.value);

  static VerificationStatus fromString(String s) =>
      VerificationStatus.values.firstWhere((e) => e.value == s, orElse: () => VerificationStatus.pending);
}
