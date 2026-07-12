import Capacitor
import UIKit

/// Toggles the WKWebView's Pencil/text interactions for handwriting.
///
/// The dropped strokes were Apple-Pencil-only (finger was fine): iPadOS
/// **Scribble** (and the text-selection / edit-menu interactions) intercept
/// Pencil input over a web view to convert handwriting to text, swallowing whole
/// strokes. Scribble and the edit menu are `UIInteraction`s (not gesture
/// recognizers), so they must be removed, not just disabled. The handwriting
/// editor turns "drawing mode" on while open — removing those interactions — and
/// off when it closes, restoring normal text behavior in other notes.
@objc(DrawingModePlugin)
public class DrawingModePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DrawingModePlugin"
    public let jsName = "DrawingMode"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    private var disabledRecognizers: [UIGestureRecognizer] = []
    private var removedInteractions: [(UIView, UIInteraction)] = []

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else { call.resolve(); return }
            if enabled {
                self.disable(in: webView)
            } else {
                for g in self.disabledRecognizers { g.isEnabled = true }
                self.disabledRecognizers.removeAll()
                for (view, interaction) in self.removedInteractions { view.addInteraction(interaction) }
                self.removedInteractions.removeAll()
            }
            call.resolve()
        }
    }

    private func disable(in root: UIView) {
        func walk(_ v: UIView) {
            // Interactions grab the Pencil (Scribble) and pop the edit menu.
            for interaction in v.interactions {
                let name = String(describing: type(of: interaction))
                if name.contains("Scribble") || name.contains("TextContextMenu")
                    || name.contains("EditMenu") || name.contains("TextInteraction") {
                    v.removeInteraction(interaction)
                    removedInteractions.append((v, interaction))
                }
            }
            // Text-selection gesture recognizers (loupe, long-press select).
            v.gestureRecognizers?.forEach { g in
                let name = String(describing: type(of: g))
                if name.contains("Text") || name.contains("Loupe") || name.contains("Selection")
                    || g is UILongPressGestureRecognizer {
                    if g.isEnabled { g.isEnabled = false; disabledRecognizers.append(g) }
                }
            }
            v.subviews.forEach(walk)
        }
        walk(root)
    }
}
