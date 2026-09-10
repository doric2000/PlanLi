package expo.modules.planlitransfers

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.os.PersistableBundle
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.work.*
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal class TransferStore(val context: Context) {
  private val prefs = context.getSharedPreferences("planli-transfers", Context.MODE_PRIVATE)
  val directory = File(context.noBackupFilesDir, "planli-transfers").apply { mkdirs() }
  fun file(id: String): File { UUID.fromString(id); return File(directory, "$id.jpg") }
  fun read(id: String): JSONObject? = prefs.getString(id, null)?.let { JSONObject(it) }
  fun list(owner: String): List<Map<String, Any>> = synchronized(TransferStore::class.java) {
    prefs.all.keys.mapNotNull { id -> read(id)?.takeIf { it.optString("ownerUid") == owner }?.let {
      mapOf("id" to id, "ownerUid" to owner, "state" to it.optString("state"), "bytes" to it.optLong("bytes"),
        "uri" to Uri.fromFile(file(id)).toString(), "progress" to it.optDouble("progress", 0.0), "httpStatus" to it.optInt("httpStatus"))
    } }
  }
  fun patch(id: String, fields: Map<String, Any>, create: Boolean = false) = synchronized(TransferStore::class.java) {
    val value = read(id) ?: if (create) JSONObject() else return@synchronized
    fields.forEach { (key, data) -> value.put(key, data) }
    check(prefs.edit().putString(id, value.toString()).commit())
  }
  private fun key(): SecretKey = synchronized(TransferStore::class.java) {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("PlanLiTransferSessions", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(KeyGenParameterSpec.Builder("PlanLiTransferSessions", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
      generateKey()
    }
  }
  fun encrypt(url: String): String = Cipher.getInstance("AES/GCM/NoPadding").run {
    init(Cipher.ENCRYPT_MODE, key())
    Base64.encodeToString(iv + doFinal(url.toByteArray()), Base64.NO_WRAP)
  }
  fun session(id: String): String {
    val bytes = Base64.decode(read(id)!!.getString("session"), Base64.NO_WRAP)
    return Cipher.getInstance("AES/GCM/NoPadding").run {
      init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      String(doFinal(bytes.copyOfRange(12, bytes.size)))
    }
  }
  fun remove(id: String, owner: String) {
    if (read(id)?.optString("ownerUid") != owner) return
    if (Build.VERSION.SDK_INT >= 34) transferScheduler(context).allPendingJobs
      .filter { it.extras.getString("id") == id }.forEach { transferScheduler(context).cancel(it.id) }
    WorkManager.getInstance(context).cancelUniqueWork("planli-transfer-$id")
    synchronized(TransferStore::class.java) { check(prefs.edit().remove(id).commit()) }
    file(id).delete()
  }
}

private fun transferScheduler(context: Context) = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
private fun transferNotification(context: Context): android.app.Notification {
  val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("planli-uploads", "העלאות", NotificationManager.IMPORTANCE_LOW))
  return NotificationCompat.Builder(context, "planli-uploads")
    .setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("מעלים את התמונות")
    .setContentText("אפשר להמשיך להשתמש באפליקציה").setOngoing(true).setProgress(0, 0, true).build()
}
private fun uploadFile(store: TransferStore, id: String, stopped: () -> Boolean) {
  var connection: HttpURLConnection? = null
  try {
      val url = URL(store.session(id))
      require(url.protocol == "https" && url.host == "firebasestorage.googleapis.com" && url.path.startsWith("/v0/b/") && url.userInfo == null)
      connection = url.openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.requestMethod = "POST"
      connection.connectTimeout = 30000; connection.readTimeout = 60000
      connection.setRequestProperty("X-Goog-Upload-Command", "upload, finalize")
      connection.setRequestProperty("X-Goog-Upload-Offset", "0")
      connection.setRequestProperty("Content-Type", "image/jpeg")
      connection.doOutput = true
      val file = store.file(id)
      connection.setFixedLengthStreamingMode(file.length())
      store.patch(id, mapOf("state" to "uploading"))
      file.inputStream().use { source -> connection.outputStream.use { output ->
        val started = System.currentTimeMillis()
        val buffer = ByteArray(64 * 1024); var sent = 0L; var lastUpdate = 0L
        while (true) {
          if (stopped() || System.currentTimeMillis() - started > 30 * 60 * 1000) throw java.io.InterruptedIOException()
          val count = source.read(buffer); if (count < 0) break
          output.write(buffer, 0, count); sent += count
          if (System.currentTimeMillis() - lastUpdate > 1000) {
            store.patch(id, mapOf("progress" to sent.toDouble() / file.length()))
            lastUpdate = System.currentTimeMillis()
          }
        }
      } }
      val status = connection.responseCode
      store.patch(id, mapOf("state" to if (status in 200..299) "uploaded" else "failed", "httpStatus" to status, "session" to ""))
  } catch (_: Exception) {
    // Do not log session URLs or blindly replay an ambiguous finalization.
    store.patch(id, mapOf("state" to "failed", "session" to ""))
  } finally { connection?.disconnect() }
}
class PlanLiTransferWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val id = inputData.getString("id") ?: return Result.failure()
    val store = TransferStore(applicationContext)
    if (store.read(id) == null) return Result.failure()
    try {
      setForeground(ForegroundInfo(id.hashCode() and 0x7fffffff, transferNotification(applicationContext), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC))
      uploadFile(store, id) { isStopped }
    } catch (_: Exception) { store.patch(id, mapOf("state" to "failed", "session" to "")) }
    return Result.success()
  }
}
// Android 14+ assigns user-started transfers their own lifecycle and notification.
class PlanLiTransferJobService : JobService() {
  private val stopped = java.util.concurrent.ConcurrentHashMap<Int, java.util.concurrent.atomic.AtomicBoolean>()
  override fun onStartJob(params: JobParameters): Boolean {
    if (Build.VERSION.SDK_INT < 34) return false
    val id = params.extras.getString("id") ?: return false
    val store = TransferStore(applicationContext)
    if (store.read(id) == null) return false
    val stop = java.util.concurrent.atomic.AtomicBoolean(false)
    stopped[params.jobId] = stop
    setNotification(params, params.jobId, transferNotification(applicationContext), JOB_END_NOTIFICATION_POLICY_REMOVE)
    Thread {
      uploadFile(store, id) { stop.get() }
      stopped.remove(params.jobId)
      if (!stop.get()) jobFinished(params, false)
    }.start()
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean {
    stopped.remove(params.jobId)?.set(true)
    params.extras.getString("id")?.let { TransferStore(applicationContext).patch(it, mapOf("state" to "failed")) }
    // Manual retry first reconciles the server before creating a fresh session.
    return false
  }
}

class PlanLiTransfersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlanLiTransfers")
    AsyncFunction("stage") { id: String, owner: String, uri: String ->
      val context = requireNotNull(appContext.reactContext)
      val store = TransferStore(context); val file = store.file(id)
      val old = store.list(owner).find { it["id"] == id }
      if (old != null && file.exists()) return@AsyncFunction old
      check(!file.exists())
      val source = Uri.parse(uri); require(source.scheme == "file")
      File(requireNotNull(source.path)).copyTo(file)
      if (file.length() !in 1..20 * 1024 * 1024) { file.delete(); error("Invalid transfer size") }
      store.patch(id, mapOf("ownerUid" to owner, "bytes" to file.length(), "state" to "staged", "progress" to 0.0), true)
      store.list(owner).first { it["id"] == id }
    }
    AsyncFunction("list") { owner: String ->
      val context = requireNotNull(appContext.reactContext); val store = TransferStore(context)
      for (task in store.list(owner)) {
        if (task["state"] !in listOf("scheduled", "uploading")) continue
        val id = task["id"] as String
        val live = if (Build.VERSION.SDK_INT >= 34) transferScheduler(context).allPendingJobs.any { it.extras.getString("id") == id }
          else WorkManager.getInstance(context).getWorkInfosForUniqueWork("planli-transfer-$id").get().any { !it.state.isFinished }
        if (!live) store.patch(id, mapOf("state" to "failed"))
      }
      store.list(owner)
    }
    AsyncFunction("schedule") { id: String, owner: String, sessionUrl: String ->
      UUID.fromString(id)
      val context = requireNotNull(appContext.reactContext); val store = TransferStore(context)
      require(store.read(id)?.optString("ownerUid") == owner)
      val url = URL(sessionUrl)
      require(url.protocol == "https" && url.host == "firebasestorage.googleapis.com" && url.path.startsWith("/v0/b/") && url.userInfo == null)
      store.patch(id, mapOf("session" to store.encrypt(sessionUrl), "state" to "scheduled"))
      if (Build.VERSION.SDK_INT >= 34) {
        val scheduler = transferScheduler(context)
        if (scheduler.allPendingJobs.none { it.extras.getString("id") == id }) {
          val usedIds = scheduler.allPendingJobs.map { it.id }.toSet()
          var jobId = id.hashCode() and 0x7fffffff
          while (usedIds.contains(jobId)) jobId = (jobId + 1) and 0x7fffffff
          val extras = PersistableBundle().apply { putString("id", id) }
          val info = JobInfo.Builder(jobId, ComponentName(context, PlanLiTransferJobService::class.java))
            .setUserInitiated(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setEstimatedNetworkBytes(1024, store.file(id).length()).setExtras(extras).build()
          check(scheduler.schedule(info) == JobScheduler.RESULT_SUCCESS)
        }
      } else {
      val work = OneTimeWorkRequestBuilder<PlanLiTransferWorker>().setInputData(workDataOf("id" to id))
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
      WorkManager.getInstance(context).enqueueUniqueWork("planli-transfer-$id", ExistingWorkPolicy.KEEP, work).result.get()
      }
    }
    AsyncFunction("remove") { id: String, owner: String -> TransferStore(requireNotNull(appContext.reactContext)).remove(id, owner) }
  }
}
