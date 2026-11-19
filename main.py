import asyncio
import json
from time import monotonic

import serial
import websockets
from websockets.exceptions import ConnectionClosed

PORT = "COM5"      # Update to your Arduino port
BAUD_RATE = 9600
WEBSOCKET_HOST = "127.0.0.1"
WEBSOCKET_PORT = 8765
PUBLIC_WEBSOCKET_URL = "wss://ws.dnb.dpdns.org"
UPDATE_INTERVAL_SECONDS = 60 / 5
CONNECTED_CLIENTS = set()


async def handle_client(websocket):
    CONNECTED_CLIENTS.add(websocket)
    print("JS Client connected.")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except (json.JSONDecodeError, UnicodeDecodeError):
                print("Ignoring invalid JSON from JS.")
                continue
            print("Received from JS:", data)
            reply = {"status": "received", "echo": data}
            await websocket.send(json.dumps(reply))
    except ConnectionClosed:
        pass
    finally:
        CONNECTED_CLIENTS.remove(websocket)
        print("JS Client disconnected.")


async def my_custom_task():
    try:
        # Open the serial connection
        ser = serial.Serial(PORT, BAUD_RATE, timeout=1)

        # Use non-blocking asyncio.sleep instead of time.sleep
        await asyncio.sleep(2)
        print(f"Listening on {PORT} at {BAUD_RATE} baud...")

        pending_reading = None
        next_update_at = monotonic()

        while True:
            if ser.in_waiting > 0:
                # Run blocking readline() in a separate thread so WS never freezes
                raw_bytes = await asyncio.to_thread(ser.readline)
                line = raw_bytes.decode('utf-8', errors='ignore').rstrip()

                if line:
                    pending_reading = line

            if not CONNECTED_CLIENTS:
                pending_reading = None
            elif pending_reading is not None and monotonic() >= next_update_at:
                payload = json.dumps({"arduino": pending_reading})
                websockets.broadcast(CONNECTED_CLIENTS, payload)
                next_update_at = monotonic() + UPDATE_INTERVAL_SECONDS
                pending_reading = None

            # Short sleep to prevent 100% CPU usage while staying snappy
            await asyncio.sleep(0.01)

    except serial.SerialException as e:
        print(f"Serial Error on {PORT}: {e}")
    finally:
        # Always close the port safely if the task stops
        if 'ser' in locals() and ser.is_open:
            ser.close()

async def main():
    async with websockets.serve(handle_client, WEBSOCKET_HOST, WEBSOCKET_PORT):
        print(f"WebSocket server listening on ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
        print(f"Cloudflare Tunnel endpoint: {PUBLIC_WEBSOCKET_URL}")
        await my_custom_task()
if __name__ == "__main__":
    asyncio.run(main())
