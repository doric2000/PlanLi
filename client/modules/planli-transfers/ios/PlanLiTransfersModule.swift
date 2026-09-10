import ExpoModulesCore
import Foundation
import UIKit

private let transferSessionId = "app.planli.background-media"

// URLSession owns the upload while JavaScript is suspended. Only non-secret
// transfer state is stored here; session credentials stay in URLSession's request.
final class PlanLiTransferManager: NSObject, URLSessionTaskDelegate, URLSessionDelegate, @unchecked Sendable {
  static let shared = PlanLiTransferManager()
  private let lock = NSRecursiveLock()
  private let defaults = UserDefaults.standard
  private let stateKey = "planli.transfer-state"
  var completionHandler: (() -> Void)?
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: transferSessionId)
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false
    config.waitsForConnectivity = true
    config.timeoutIntervalForResource = 30 * 60
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()
  private var directory: URL {
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("PlanLiTransfers", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    var excluded = root
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try? excluded.setResourceValues(values)
    return root
  }
  func restore() { _ = session }
  private func validate(_ id: String) throws {
    guard UUID(uuidString: id) != nil else { throw NSError(domain: "PlanLiTransfers", code: 1) }
  }
  private func state(_ id: String, _ patch: [String: Any]) {
    lock.lock(); defer { lock.unlock() }
    var all = defaults.dictionary(forKey: stateKey) as? [String: [String: Any]] ?? [:]
    all[id] = (all[id] ?? [:]).merging(patch) { _, new in new }
    defaults.set(all, forKey: stateKey)
  }
  func list(_ owner: String) -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return (defaults.dictionary(forKey: stateKey) as? [String: [String: Any]] ?? [:])
      .map { key, value in value.merging(["id": key]) { _, new in new } }
      .filter { $0["ownerUid"] as? String == owner }
  }
  func reconcile(_ owner: String) async -> [[String: Any]] {
    let live = Set(await session.allTasks.compactMap { $0.taskDescription })
    for task in list(owner) {
      if let id = task["id"] as? String, task["state"] as? String == "uploading", !live.contains(id) {
        state(id, ["state": "failed"])
      }
    }
    return list(owner)
  }
  func stage(_ id: String, _ owner: String, _ uri: String) throws -> [String: Any] {
    try validate(id)
    guard let source = URL(string: uri), source.isFileURL else { throw NSError(domain: "PlanLiTransfers", code: 2) }
    let target = directory.appendingPathComponent(id + ".jpg")
    lock.lock(); defer { lock.unlock() }
    if let old = list(owner).first(where: { $0["id"] as? String == id }),
       FileManager.default.fileExists(atPath: target.path) { return old }
    if FileManager.default.fileExists(atPath: target.path) { throw NSError(domain: "PlanLiTransfers", code: 3) }
    try FileManager.default.copyItem(at: source, to: target)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
    let size = (try FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.int64Value ?? 0
    guard size > 0 && size <= 20 * 1024 * 1024 else {
      try? FileManager.default.removeItem(at: target)
      throw NSError(domain: "PlanLiTransfers", code: 4)
    }
    let value: [String: Any] = ["ownerUid": owner, "uri": target.absoluteString, "bytes": size, "state": "staged", "progress": 0]
    state(id, value)
    return value.merging(["id": id]) { _, new in new }
  }
  func schedule(_ id: String, _ owner: String, _ sessionUrl: String) async throws {
    try validate(id)
    guard let url = URL(string: sessionUrl), url.scheme == "https", url.host == "firebasestorage.googleapis.com",
      url.path.hasPrefix("/v0/b/"), url.user == nil, url.password == nil,
      list(owner).contains(where: { $0["id"] as? String == id }) else { throw NSError(domain: "PlanLiTransfers", code: 5) }
    let tasks = await session.allTasks
    if tasks.contains(where: { $0.taskDescription == id }) { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("upload, finalize", forHTTPHeaderField: "X-Goog-Upload-Command")
    request.setValue("0", forHTTPHeaderField: "X-Goog-Upload-Offset")
    request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
    let task = session.uploadTask(with: request, fromFile: directory.appendingPathComponent(id + ".jpg"))
    task.taskDescription = id
    state(id, ["state": "uploading", "progress": 0])
    task.resume()
  }
  func remove(_ id: String, _ owner: String) async throws {
    try validate(id)
    guard list(owner).contains(where: { $0["id"] as? String == id }) else { return }
    for task in await session.allTasks where task.taskDescription == id { task.cancel() }
    lock.lock()
    var all = defaults.dictionary(forKey: stateKey) as? [String: [String: Any]] ?? [:]
    all.removeValue(forKey: id); defaults.set(all, forKey: stateKey)
    lock.unlock()
    try? FileManager.default.removeItem(at: directory.appendingPathComponent(id + ".jpg"))
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
    guard let id = task.taskDescription, totalBytesExpectedToSend > 0 else { return }
    state(id, ["progress": Double(totalBytesSent) / Double(totalBytesExpectedToSend)])
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = task.taskDescription else { return }
    lock.lock(); defer { lock.unlock() }
    guard (defaults.dictionary(forKey: stateKey)?[id]) != nil else { return }
    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    state(id, ["state": error == nil && (200..<300).contains(status) ? "uploaded" : "failed", "httpStatus": status])
  }
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      self.completionHandler?(); self.completionHandler = nil
    }
  }
}

public final class PlanLiTransfersSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void) {
    guard identifier == transferSessionId else { return }
    PlanLiTransferManager.shared.completionHandler = completionHandler
    PlanLiTransferManager.shared.restore()
  }
}

public final class PlanLiTransfersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlanLiTransfers")
    OnCreate { PlanLiTransferManager.shared.restore() }
    AsyncFunction("stage") { (id: String, owner: String, uri: String) in
      try PlanLiTransferManager.shared.stage(id, owner, uri)
    }
    AsyncFunction("list") { (owner: String) in await PlanLiTransferManager.shared.reconcile(owner) }
    AsyncFunction("schedule") { (id: String, owner: String, url: String) in
      try await PlanLiTransferManager.shared.schedule(id, owner, url)
    }
    AsyncFunction("remove") { (id: String, owner: String) in try await PlanLiTransferManager.shared.remove(id, owner) }
  }
}
