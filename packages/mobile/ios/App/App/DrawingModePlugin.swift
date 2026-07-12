import Capacitor
import UIKit

/// Toggles the WKWebView's text-selection gesture recognizers.
///
/// On iPad the web view's text-interaction recognizers (tap-to-select,
/// long-press loupe, edit menu) compete for touches with handwriting strokes and
/// sometimes win — swallowing a whole quick stroke before it ever reaches the
/// canvas. The handwriting editor turns "drawing mode" on while it is open
/// (disabling those recognizers) and off when it closes (restoring them), so
/// text selection in normal notes is unaffected.
@objc(DrawingModePlugin)
public class DrawingModePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DrawingModePlugin"
    public let jsName = "DrawingMode"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    /// Recognizers we disabled, so we can re-enable exactly those on exit.
    private var disabledRecognizers: [UIGestureRecognizer] = []

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else { call.resolve(); return }
            if enabled {
                self.disableTextGestures(in: webView)
            } else {
                for g in self.disabledRecognizers { g.isEnabled = true }
                self.disabledRecognizers.removeAll()
            }
            call.resolve()
        }
    }

    private func disableTextGestures(in root: UIView) {
        func matchesText(_ g: UIGestureRecognizer) -> Bool {
            let name = String(describing: type(of: g))
            // WKWebView text interaction recognizers (names vary by iOS version):
            // e.g. UITextTapRecognizer, *TextSelectionGestureRecognizer, loupe/forcePress.
            return name.contains("Text") || name.contains("Loupe") || name.contains("ForcePress")
                || name.contains("Selection") || g is UILongPressGestureRecognizer
        }
        func walk(_ v: UIView) {
            v.gestureRecognizers?.forEach { g in
                if matchesText(g) && g.isEnabled {
                    g.isEnabled = false
                    self.disabledRecognizers.append(g)
                }
            }
            v.subviews.forEach(walk)
        }
        walk(root)
    }
}
