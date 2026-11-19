let socket;
let lastReadingAt;

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

    reading.textContent = data.arduino;
    reading.removeAttribute("data-empty");
    lastReadingAt = new Date();
    lastUpdated.dateTime = lastReadingAt.toISOString();
    lastUpdated.title = clockTime.format(lastReadingAt);
    updateReadingAge();
    updatePlaceholder.hidden = true;
    lastUpdated.hidden = false;
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

setInterval(updateReadingAge, 1000);
connectWebSocket();
