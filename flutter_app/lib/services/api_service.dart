import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  Future<Map<String, String>> _headers() async {
    final token = await AppConfig.getAuthToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Driver Platform API
  Future<Map<String, dynamic>> driverGet(String path) async {
    final response = await http.get(
      Uri.parse('${AppConfig.driverApiBase}$path'),
      headers: await _headers(),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> driverPost(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('${AppConfig.driverApiBase}$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> driverPut(String path, Map<String, dynamic> body) async {
    final response = await http.put(
      Uri.parse('${AppConfig.driverApiBase}$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  // Verify ID API
  Future<Map<String, dynamic>> verifyGet(String path) async {
    final response = await http.get(
      Uri.parse('${AppConfig.verifyApiBase}$path'),
      headers: await _headers(),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> verifyPost(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('${AppConfig.verifyApiBase}$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> verifyUpload(String path, String filePath, String fieldName) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('${AppConfig.verifyApiBase}$path'),
    );
    final headers = await _headers();
    request.headers.addAll(headers);
    request.files.add(await http.MultipartFile.fromPath(fieldName, filePath));
    final streamResponse = await request.send();
    final response = await http.Response.fromStream(streamResponse);
    return _handleResponse(response);
  }

  // Blockchain API
  Future<Map<String, dynamic>> blockchainGet(String path) async {
    final response = await http.get(
      Uri.parse('${AppConfig.blockchainApiBase}$path'),
      headers: await _headers(),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> blockchainPost(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('${AppConfig.blockchainApiBase}$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {'success': true};
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      throw ApiException('Unauthorized - Please login again', 401);
    } else {
      final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};
      throw ApiException(
        body['detail'] ?? body['message'] ?? 'Request failed',
        response.statusCode,
      );
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException($statusCode): $message';
}
