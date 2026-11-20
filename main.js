let socket;
let lastReadingAt;

const readingStorageKey = "arduino-temp-sensor.latest-reading";
const reading = document.querySelector("#reading");
const connectionStatus = document.querySelector("#connection-status");
const updatePlaceholder = document.querySelector("#update-placeholder");
const lastUpdated = document.querySelector("#last-updated");
const relativeTime = new Intl.RelativeTimeFormat("en", { style: "long" });
const clockTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

function updateReadingAge() {
  if (!lastReadingAt) return;

  const seconds = Math.max(0, Math.floor((Date.now() - lastReadingAt.getTime()) / 1000));
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]) {
    if (seconds >= size) {
      lastUpdated.textContent = relativeTime.format(-Math.floor(seconds / size), unit);
      return;
    }
  }
  lastUpdated.textContent = "Just now";
}

function showReading(value, receivedAt) {
  reading.textContent = value;
  reading.removeAttribute("data-empty");
  lastReadingAt = receivedAt;
  lastUpdated.dateTime = receivedAt.toISOString();
  lastUpdated.title = clockTime.format(receivedAt);
  updateReadingAge();
  updatePlaceholder.hidden = true;
  lastUpdated.hidden = false;
}

function restoreReading() {
  let saved;
  try {
    saved = JSON.parse(window.localStorage.getItem(readingStorageKey));
  } catch {
    return;
  }

  if (typeof saved?.value !== "string" || !saved.value.trim()
      || typeof saved.receivedAt !== "string") return;

  const receivedAt = new Date(saved.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) return;

  showReading(saved.value, receivedAt);
}

function connectWebSocket() {
  socket = new WebSocket("wss://ws.dnb.dpdns.org");

  socket.onopen = () => {
    connectionStatus.dataset.state = "connected";
    connectionStatus.textContent = "Connected";
    sendToPython({ action: "init", message: "Hello from JS" });
  };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.warn("Invalid JSON from Python:", error);
      return;
    }

    if (typeof data?.arduino !== "string" || !data.arduino.trim()) return;

    const receivedAt = new Date();
    showReading(data.arduino, receivedAt);
    try {
      window.localStorage.setItem(readingStorageKey, JSON.stringify({
        value: data.arduino,
        receivedAt: receivedAt.toISOString(),
      }));
    } catch {
      // Keep showing live readings if browser storage is unavailable.
    }
  };

  socket.onclose = () => {
    connectionStatus.dataset.state = "reconnecting";
    connectionStatus.textContent = "Reconnecting";
    setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
    socket.close();
  };
}

// Helper function to send JSON to Python anytime
function sendToPython(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  } else {
    console.warn("Socket not open yet. Message dropped.");
  }
}

restoreReading();
setInterval(updateReadingAge, 1000);
connectWebSocket();
