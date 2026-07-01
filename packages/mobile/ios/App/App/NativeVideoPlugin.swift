import Capacitor
import Foundation
import AVKit
import AVFoundation

/// Native fullscreen video playback fallback.
///
/// The WebView `<video>` element uses a restricted HTML5 media pipeline that
/// rejects some codecs the device can otherwise decode natively — notably
/// HEVC 10-bit HDR video and E-AC-3 (Dolby Digital Plus) audio. AVPlayer uses
/// the same AVFoundation stack as Photos/QuickLook and handles these, so we
/// present it as a fallback when the web player fails.
@objc(NativeVideoPlugin)
public class NativeVideoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeVideoPlugin"
    public let jsName = "NativeVideo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    @objc func play(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url") else {
            call.reject("Missing url")
            return
        }

        let fileURL: URL
        if urlString.hasPrefix("file://") {
            guard let parsed = URL(string: urlString) else {
                call.reject("Invalid file URL: \(urlString)")
                return
            }
            fileURL = parsed
        } else {
            fileURL = URL(fileURLWithPath: urlString)
        }

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            call.reject("File not found: \(fileURL.path)")
            return
        }

        // Optional resume position (seconds) carried over from the web player.
        let startAt = call.getDouble("startAt") ?? 0

        DispatchQueue.main.async {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
                // Non-fatal: playback still works, just may not respect the mute switch as expected.
            }

            let player = AVPlayer(url: fileURL)
            if startAt > 0 {
                player.seek(to: CMTime(seconds: startAt, preferredTimescale: 600))
            }

            let controller = AVPlayerViewController()
            controller.player = player
            controller.modalPresentationStyle = .fullScreen

            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available to present the player")
                return
            }

            presenter.present(controller, animated: true) {
                player.play()
            }
            call.resolve()
        }
    }
}
