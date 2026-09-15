package expo.modules.readerkeys

import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

object ReaderKeys {
  @Volatile var enabled = false
  @Volatile var emit: ((Int) -> Unit)? = null
  private val pressed = mutableSetOf<Int>()
  fun handle(event: KeyEvent): Boolean {
    val key = event.keyCode
    if (key != KeyEvent.KEYCODE_VOLUME_UP && key != KeyEvent.KEYCODE_VOLUME_DOWN) return false
    if (event.action == KeyEvent.ACTION_UP) return pressed.remove(key)
    if (!enabled || emit == null || event.action != KeyEvent.ACTION_DOWN) return false
    pressed.add(key)
    if (event.repeatCount == 0) emit?.invoke(if (key == KeyEvent.KEYCODE_VOLUME_DOWN) 1 else -1)
    return true
  }
}
class ReaderKeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReaderKeys")
    Events("onTurn")
    OnCreate { ReaderKeys.emit = { direction -> sendEvent("onTurn", mapOf("direction" to direction)) } }
    Function("setEnabled") { enabled: Boolean -> ReaderKeys.enabled = enabled }
    OnActivityEntersBackground { ReaderKeys.enabled = false }
    OnDestroy { ReaderKeys.enabled = false; ReaderKeys.emit = null }
  }
}
