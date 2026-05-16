import UIKit
import Capacitor

class BanjuanViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FileUploaderPlugin())
    }
}
