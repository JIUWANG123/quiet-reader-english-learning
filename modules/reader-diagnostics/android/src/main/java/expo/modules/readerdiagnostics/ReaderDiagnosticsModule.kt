package expo.modules.readerdiagnostics

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReaderDiagnosticsModule : Module() {
  private var callbacks: ComponentCallbacks2? = null
  override fun definition() = ModuleDefinition {
    Name("ReaderDiagnostics")
    Events("onMemoryPressure")
    Function("lastProcessExit") {
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || context == null) null
      else {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val exit = manager.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()
        exit?.let { mapOf(
          "reason" to it.reason,
          "importance" to it.importance,
          "pss" to it.pss,
          "rss" to it.rss,
          "timestamp" to it.timestamp
        ) }
      }
    }
    OnCreate {
      val context = appContext.reactContext
      if (context != null) {
        callbacks = object : ComponentCallbacks2 {
          override fun onConfigurationChanged(newConfig: Configuration) {}
          override fun onLowMemory() { sendEvent("onMemoryPressure", mapOf("level" to 15, "pressure" to "running-critical")) }
          override fun onTrimMemory(level: Int) {
            val pressure = when (level) {
              ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> "running-low"
              ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> "running-critical"
              else -> null
            }
            if (pressure != null) sendEvent("onMemoryPressure", mapOf("level" to level, "pressure" to pressure))
          }
        }
        context.registerComponentCallbacks(callbacks)
      }
    }
    OnDestroy {
      val context = appContext.reactContext
      callbacks?.let { context?.unregisterComponentCallbacks(it) }
      callbacks = null
    }
  }
}
