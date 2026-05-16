import Capacitor
import Foundation

@objc(FileUploaderPlugin)
public class FileUploaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FileUploaderPlugin"
    public let jsName = "FileUploader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "upload", returnType: CAPPluginReturnPromise)
    ]

    @objc func upload(_ call: CAPPluginCall) {
        guard let filePath = call.getString("filePath"),
              let serverUrl = call.getString("serverUrl"),
              let url = URL(string: serverUrl) else {
            call.reject("Missing filePath or serverUrl")
            return
        }

        let method = call.getString("method") ?? "PUT"

        let fileURL: URL
        if filePath.hasPrefix("file://") {
            guard let parsed = URL(string: filePath) else {
                call.reject("Invalid file URL: \(filePath)")
                return
            }
            fileURL = parsed
        } else {
            fileURL = URL(fileURLWithPath: filePath)
        }

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            call.reject("File not found: \(fileURL.path)")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = method

        if let headers = call.getObject("headers") {
            for (key, value) in headers {
                if let strValue = value as? String {
                    request.setValue(strValue, forHTTPHeaderField: key)
                }
            }
        }

        let task = URLSession.shared.uploadTask(with: request, fromFile: fileURL) { data, response, error in
            if let error = error {
                call.reject("Upload failed: \(error.localizedDescription)")
                return
            }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if statusCode >= 400 {
                call.reject("HTTP \(statusCode)")
                return
            }
            call.resolve(["status": statusCode])
        }
        task.resume()
    }
}
