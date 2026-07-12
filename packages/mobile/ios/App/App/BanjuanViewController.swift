import UIKit
import WebKit
import Capacitor

class BanjuanViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FileUploaderPlugin())
        bridge?.registerPluginInstance(NativeVideoPlugin())
        bridge?.registerPluginInstance(DrawingModePlugin())

        // Handwriting on iPad dropped strokes because the WKWebView scroll view
        // delayed / cancelled touches while its gesture recognizers (text
        // selection, long-press) decided what the gesture was. Hand touches to
        // web content immediately and never let the scroll view steal an
        // in-progress touch, so pen/finger strokes aren't clipped.
        if let scrollView = bridge?.webView?.scrollView {
            scrollView.delaysContentTouches = false
            scrollView.canCancelContentTouches = false
        }
        // No long-press link preview (another interaction that competes for touches).
        bridge?.webView?.allowsLinkPreview = false
    }
}
