package expo.modules.networkprobe

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.ConnectException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLParameters
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

private object ProbeWorker {
  private val executor = Executors.newCachedThreadPool { runnable ->
    Thread(runnable, "quiet-reader-network-probe").apply { isDaemon = true }
  }

  fun resolve(host: String): Map<String, Any> {
    if (!host.matches(Regex("^[A-Za-z0-9.-]{1,253}$"))) return mapOf("ok" to false, "code" to "INVALID_HOST")
    val started = System.nanoTime()
    val future = executor.submit<List<String>> { InetAddress.getAllByName(host).mapNotNull { it.hostAddress } }
    return try {
      val addresses = future.get(5, TimeUnit.SECONDS)
      if (addresses.isEmpty()) mapOf("ok" to false, "code" to "DNS_EMPTY", "durationMs" to elapsed(started))
      else mapOf("ok" to true, "addresses" to addresses, "durationMs" to elapsed(started))
    } catch (_: TimeoutException) {
      future.cancel(true)
      mapOf("ok" to false, "code" to "DNS_TIMEOUT", "durationMs" to elapsed(started))
    } catch (_: Exception) {
      future.cancel(true)
      mapOf("ok" to false, "code" to "DNS_FAILED", "durationMs" to elapsed(started))
    }
  }

  fun tcp(addresses: List<String>): Map<String, Any> {
    val started = System.nanoTime()
    var lastCode = "TCP_FAILED"
    for (address in addresses.take(4)) {
      try {
        Socket().use { socket -> socket.connect(InetSocketAddress(InetAddress.getByName(address), 443), 4000) }
        return mapOf("ok" to true, "address" to address, "durationMs" to elapsed(started))
      } catch (_: SocketTimeoutException) {
        lastCode = "TCP_TIMEOUT"
      } catch (_: ConnectException) {
        lastCode = "TCP_REFUSED"
      } catch (_: Exception) {
        lastCode = "TCP_FAILED"
      }
    }
    return mapOf("ok" to false, "code" to lastCode, "durationMs" to elapsed(started))
  }

  fun tls(host: String, address: String): Map<String, Any> {
    val started = System.nanoTime()
    var plain: Socket? = null
    var secure: SSLSocket? = null
    return try {
      plain = Socket()
      plain.connect(InetSocketAddress(InetAddress.getByName(address), 443), 5000)
      plain.soTimeout = 5000
      secure = (SSLSocketFactory.getDefault() as SSLSocketFactory).createSocket(plain, host, 443, true) as SSLSocket
      secure.soTimeout = 5000
      val parameters: SSLParameters = secure.sslParameters
      parameters.endpointIdentificationAlgorithm = "HTTPS"
      parameters.serverNames = listOf(SNIHostName(host))
      secure.sslParameters = parameters
      secure.startHandshake()
      mapOf("ok" to true, "durationMs" to elapsed(started))
    } catch (_: SocketTimeoutException) {
      mapOf("ok" to false, "code" to "TLS_TIMEOUT", "durationMs" to elapsed(started))
    } catch (_: SSLHandshakeException) {
      mapOf("ok" to false, "code" to "TLS_CERTIFICATE_OR_PROTOCOL", "durationMs" to elapsed(started))
    } catch (_: SSLException) {
      mapOf("ok" to false, "code" to "TLS_FAILED", "durationMs" to elapsed(started))
    } catch (_: Exception) {
      mapOf("ok" to false, "code" to "TLS_FAILED", "durationMs" to elapsed(started))
    } finally {
      try { secure?.close() } catch (_: Exception) {}
      try { plain?.close() } catch (_: Exception) {}
    }
  }

  private fun elapsed(started: Long) = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started).toInt()
}

class NetworkProbeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NetworkProbe")
    AsyncFunction("resolveDns") { host: String -> ProbeWorker.resolve(host) }
    AsyncFunction("checkTcp") { addresses: List<String> -> ProbeWorker.tcp(addresses) }
    AsyncFunction("checkTls") { host: String, address: String -> ProbeWorker.tls(host, address) }
  }
}
