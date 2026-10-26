import Capacitor
import Foundation
import QuickLook
import UIKit
import UniformTypeIdentifiers
import WebKit

/// Files in and out of the library on iPad.
///
/// - `preview`: Quick Look (PDF, Office documents, images, audio/video, text…),
///   whose share button also offers "Open in…" other apps. Used for note
///   attachments and documents the app has no viewer for.
/// - `share`: the share sheet for a file (exports: save to Files, AirDrop, …).
/// - `pickFiles`: the system document picker; picked files are moved straight
///   into a library folder natively, so a multi-GB video never passes through
///   JavaScript memory.
/// - `htmlToPdf`: an exported note's HTML as a paginated A4 PDF, laid out by
///   WebKit and drawn through the system print renderer.
@objc(FilePreviewPlugin)
public class FilePreviewPlugin: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource, UIDocumentPickerDelegate {
    public let identifier = "FilePreviewPlugin"
    public let jsName = "FilePreview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "preview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "htmlToPdf", returnType: CAPPluginReturnPromise),
    ]

    private var pdfJobs: [PdfJob] = []

    private var previewURL: URL?
    private var pickCall: CAPPluginCall?
    private var pickDest: URL?

    private func fileURL(_ value: String) -> URL? {
        value.hasPrefix("file://") ? URL(string: value) : URL(fileURLWithPath: value)
    }

    // MARK: preview

    @objc func preview(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = fileURL(value),
              FileManager.default.fileExists(atPath: url.path) else {
            call.reject("File not found")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available")
                return
            }
            self.previewURL = url
            let controller = QLPreviewController()
            controller.dataSource = self
            // Presented bare, Quick Look opened images in its immersive mode with
            // no buttons. In our own navigation controller there's always a
            // Done button, and Quick Look adds its share button ("Open in…").
            controller.navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(self.closePreview))
            let nav = UINavigationController(rootViewController: controller)
            nav.modalPresentationStyle = .pageSheet   // can also be swiped away
            presenter.present(nav, animated: true)
            call.resolve()
        }
    }

    @objc private func closePreview() {
        bridge?.viewController?.presentedViewController?.dismiss(animated: true)
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        previewURL == nil ? 0 : 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        (previewURL ?? URL(fileURLWithPath: "/")) as NSURL
    }

    // MARK: share

    @objc func share(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = fileURL(value),
              FileManager.default.fileExists(atPath: url.path) else {
            call.reject("File not found")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available")
                return
            }
            let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            // On iPad the share sheet is a popover and needs an anchor.
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            controller.completionWithItemsHandler = { _, completed, _, _ in
                call.resolve(["completed": completed])
            }
            presenter.present(controller, animated: true)
        }
    }

    // MARK: pickFiles

    @objc func pickFiles(_ call: CAPPluginCall) {
        guard let destValue = call.getString("dest"), let dest = fileURL(destValue) else {
            call.reject("Missing destination folder")
            return
        }
        let extensions = call.getArray("extensions", String.self) ?? []
        let multiple = call.getBool("multiple") ?? true
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available")
                return
            }
            let picker: UIDocumentPickerViewController
            if #available(iOS 14.0, *) {
                var types = extensions.compactMap { UTType(filenameExtension: $0) }
                if types.isEmpty { types = [.item] }
                picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            } else {
                picker = UIDocumentPickerViewController(documentTypes: ["public.item"], in: .import)
            }
            picker.allowsMultipleSelection = multiple
            picker.delegate = self
            self.pickCall?.resolve(["files": []])   // a previous picker never answered
            self.pickCall = call
            self.pickDest = dest
            presenter.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall, let dest = pickDest else { return }
        pickCall = nil
        let fm = FileManager.default
        try? fm.createDirectory(at: dest, withIntermediateDirectories: true)
        var files: [[String: Any]] = []
        for source in urls {
            let target = uniqueURL(dest.appendingPathComponent(source.lastPathComponent))
            do {
                // asCopy hands us our own temporary copy: move it, no second copy.
                do { try fm.moveItem(at: source, to: target) } catch { try fm.copyItem(at: source, to: target) }
                files.append(["name": target.lastPathComponent])
            } catch {
                files.append(["name": source.lastPathComponent, "error": error.localizedDescription])
            }
        }
        call.resolve(["files": files])
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCall?.resolve(["files": []])
        pickCall = nil
    }

    // MARK: htmlToPdf

    @objc func htmlToPdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), let destValue = call.getString("dest"), let dest = fileURL(destValue) else {
            call.reject("Missing html or dest")
            return
        }
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController?.view else {
                call.reject("No view available")
                return
            }
            let job = PdfJob(call: call, dest: dest) { [weak self] done in
                self?.pdfJobs.removeAll { $0 === done }
            }
            self.pdfJobs.append(job)
            job.start(html: html, in: host)
        }
    }

    /// `name.ext`, else `name (1).ext`, `name (2).ext`… — never overwrite a library file.
    private func uniqueURL(_ url: URL) -> URL {
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) { return url }
        let dir = url.deletingLastPathComponent()
        let ext = url.pathExtension
        let stem = url.deletingPathExtension().lastPathComponent
        var i = 1
        while true {
            let name = ext.isEmpty ? "\(stem) (\(i))" : "\(stem) (\(i)).\(ext)"
            let candidate = dir.appendingPathComponent(name)
            if !fm.fileExists(atPath: candidate.path) { return candidate }
            i += 1
        }
    }
}

/// One HTML → PDF conversion: an off-screen web view lays the page out, the
/// print renderer paginates it onto A4.
private class PdfJob: NSObject, WKNavigationDelegate {
    private let call: CAPPluginCall
    private let dest: URL
    private let finished: (PdfJob) -> Void
    private var webView: WKWebView?

    init(call: CAPPluginCall, dest: URL, finished: @escaping (PdfJob) -> Void) {
        self.call = call
        self.dest = dest
        self.finished = finished
    }

    func start(html: String, in host: UIView) {
        let webView = WKWebView(frame: CGRect(x: -10000, y: 0, width: 595, height: 842))
        webView.navigationDelegate = self
        webView.alpha = 0.01
        host.addSubview(webView)   // printing needs a web view that's in a window
        self.webView = webView
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A moment for images (data URLs) to decode before printing.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.render() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        done(error: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        done(error: error.localizedDescription)
    }

    private func render() {
        guard let webView = webView else { return }
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let paper = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)   // A4 in points
        renderer.setValue(paper, forKey: "paperRect")
        renderer.setValue(paper.insetBy(dx: 42, dy: 48), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        let pages = renderer.numberOfPages
        for i in 0..<max(pages, 1) {
            UIGraphicsBeginPDFPage()
            if i < pages { renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds()) }
        }
        UIGraphicsEndPDFContext()
        do {
            try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: dest, options: .atomic)
            call.resolve(["pages": pages])
            done(error: nil)
        } catch {
            done(error: error.localizedDescription)
        }
    }

    private func done(error: String?) {
        if let error = error { call.reject(error) }
        webView?.removeFromSuperview()
        webView = nil
        finished(self)
    }
}
