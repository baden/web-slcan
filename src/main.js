import './style.css'
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'

import { serial as webSerialPolyfill } from 'web-serial-polyfill';

// const useSerial = true;
const useSerial = ('serial' in navigator);
const serial = useSerial ? navigator.serial : webSerialPolyfill;
// const ports = await serial.getPorts();

const connectBtn = document.getElementById('connect-btn');
console.log("connectBtn", connectBtn);
const disconnectBtn = document.getElementById('disconnect-btn');
const clearLogBtn = document.getElementById('clear-log-btn');
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');
const messageBody = document.getElementById('message-body');

const VENDOR_ID = 0x0483;
const PRODUCT_ID = 0x5740;

// Lawicel Commands
const BAUD_RATE = 115200;
const CAN_BITRATE_CMD = 'S6';
const OPEN_CAN_CMD = 'O';
const CLOSE_CAN_CMD = 'C';
const CR_CHAR = '\r';
const CR_BYTE = 0x0D;

let port;
let reader;
let writer;
let keepReading = false;
let lineBuffer = '';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let maxMessagesInTable = 200;
let loggedMessages = [];

// --- UI Update Functions (mostly same) ---
function updateStatus(message, connectedState = null) {
    statusMessage.textContent = message;
    console.log("Status:", message);
    if (connectedState === true) {
        statusMessage.className = 'status-connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        saveBtn.disabled = false;
        clearLogBtn.disabled = false;
    } else if (connectedState === false) {
        statusMessage.className = 'status-disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        saveBtn.disabled = (loggedMessages.length === 0);
        clearLogBtn.disabled = (loggedMessages.length === 0);
    } else {
        statusMessage.className = 'status-connecting';
        connectBtn.disabled = true;
        disconnectBtn.disabled = true;
        saveBtn.disabled = true;
        clearLogBtn.disabled = true;
    }
}

function addMessageToTable(msg) { /* ... same ... */
    if (!messageBody) return;
    const row = messageBody.insertRow(0); row.classList.add('highlight');
    const tc = row.insertCell(), tyc = row.insertCell(), idc = row.insertCell(), dlcc = row.insertCell(), dc = row.insertCell();
    const ts = new Date(msg.timestamp); tc.textContent = ts.toLocaleTimeString() + '.' + String(ts.getMilliseconds()).padStart(3, '0'); tc.classList.add('timestamp');
    tyc.textContent = msg.type.toUpperCase(); idc.textContent = msg.id || '---'; dlcc.textContent = msg.dlc !== null ? msg.dlc : '---'; dc.textContent = msg.data ? msg.data.join(' ') : '---';
    if (msg.type === 'error' || msg.type === 'parse_error') { row.classList.add('error'); dc.textContent = msg.raw || msg.message || 'Error';}
    setTimeout(() => row.classList.remove('highlight'), 500); while (messageBody.rows.length > maxMessagesInTable) { messageBody.deleteRow(-1); }
}

function parseCanMessage(rawString) { /* ... same ... */
    const msg = { raw: rawString, type: "unknown", id: null, dlc: null, data: [], timestamp: Date.now() }; if (!rawString || rawString.length < 1) return msg;
    try {
        const mt = rawString[0]; const r = rawString.substring(1);
        if (mt === 't') { msg.type = 'can_std'; msg.id = r.substring(0, 3); msg.dlc = parseInt(r.substring(3, 4), 10); const dS = r.substring(4); if (!isNaN(msg.dlc) && dS.length >= msg.dlc * 2) { msg.data = (dS.substring(0, msg.dlc * 2)).match(/.{1,2}/g) || []; } else { msg.data = dS.match(/.{1,2}/g) || [];}}
        else if (mt === 'T') { msg.type = 'can_ext'; msg.id = r.substring(0, 8); msg.dlc = parseInt(r.substring(8, 9), 10); const dS = r.substring(9); if (!isNaN(msg.dlc) && dS.length >= msg.dlc * 2) { msg.data = (dS.substring(0, msg.dlc * 2)).match(/.{1,2}/g) || []; } else { msg.data = dS.match(/.{1,2}/g) || [];}}
        else if (mt === 'r') { msg.type = 'rtr_std'; msg.id = r.substring(0, 3); msg.dlc = parseInt(r.substring(3, 4), 10); msg.data = ['RTR'];}
        else if (mt === 'R') { msg.type = 'rtr_ext'; msg.id = r.substring(0, 8); msg.dlc = parseInt(r.substring(8, 9), 10); msg.data = ['RTR'];}
        else if (mt === 'F') { msg.type = 'status_flags'; msg.data = [r]; } else if (mt === 'V') { msg.type = 'version'; msg.data = [r]; }
        else if (mt === 'Z' || mt === 'z') { msg.type = 'ack'; msg.data = ['OK']; } else if (rawString === '\x07') { msg.type = 'error_response'; msg.data = ['BELL (Error)']; }
        else if (rawString === '\r') { msg.type = 'ok_response'; msg.data = ['CR (OK)']; } else { msg.type = 'other';}
    } catch (e) { console.error(`Parse error '${rawString}': ${e}`); msg.type = 'parse_error'; msg.message = e.message; } return msg;
}
function formatTimestampForFile(tsMs) { /* ... same ... */ const d = new Date(tsMs); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`; }
function saveDataToFile() { /* ... same ... */
    if (loggedMessages.length === 0) { alert("No messages to save."); saveBtn.disabled = true; return; } const h = "Timestamp,Type,ID,DLC,Data\n";
    const rs = loggedMessages.map(m => { const ts = formatTimestampForFile(m.timestamp); const ty = m.type.toUpperCase(); const id = m.id || ''; const dl = m.dlc !== null ? m.dlc : ''; const da = m.data ? m.data.join(' ') : ''; const esc = (f) => (String(f).includes(',') ? `"${String(f).replace(/"/g, '""')}"` : f); return `${esc(ts)},${esc(ty)},${esc(id)},${esc(dl)},${esc(da)}`; }).join('\n');
    const c = h + rs; const b = new Blob([c], { type: 'text/csv;charset=utf-8;' }); const l = document.createElement("a"); const u = URL.createObjectURL(b); l.setAttribute("href", u); const n = new Date(); const fn = `can_trace_webusb_${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}_${String(n.getHours()).padStart(2, '0')}${String(n.getMinutes()).padStart(2, '0')}${String(n.getSeconds()).padStart(2, '0')}.csv`; l.setAttribute("download", fn); l.style.visibility = 'hidden'; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(u);
}


async function writeToStream(command) {
    if (!writer) {
        console.error("Writer not available.");
        return;
    }
    const data = encoder.encode(command + CR_CHAR); // Append CR to commands
    await writer.write(data);
    console.log("Sent:", command);
}

async function readLoop() {
    if (!port || !port.readable) {
        console.error("Port not readable.");
        keepReading = false;
        return;
    }
    reader = port.readable.getReader();
    console.log("Read loop started.");

    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) {
                // reader.cancel() has been called.
                console.log("Reader done.");
                break;
            }
            if (value) {
                lineBuffer += decoder.decode(value, { stream: true });
                // Process lines ending with CR
                let lines = lineBuffer.split(CR_CHAR);
                // The last part might be incomplete, keep it in the buffer
                lineBuffer = lines.pop();

                lines.forEach(line => {
                    if (line.trim()) { // Ignore empty lines potentially created by split
                        const parsedMsg = parseCanMessage(line.trim());
                        // Only log relevant messages to the table
                        if (parsedMsg.type.startsWith('can') || parsedMsg.type.startsWith('rtr') || parsedMsg.type === 'status_flags' || parsedMsg.type.includes('error')) {
                            addMessageToTable(parsedMsg);
                        } else {
                              console.log("Device Response:", line.trim()); // Log other responses to console
                        }
                    } else {
                        // Received just CR, likely an OK response to a command
                        console.log("Device Response: CR (OK)");
                    }
                });

                  // Check for BELL character (\x07) which might not have CR
                  if (lineBuffer.includes('\x07')) {
                      console.error("Device Response: BELL (Error)");
                      addMessageToTable(parseCanMessage('\x07')); // Log error
                      lineBuffer = lineBuffer.replace('\x07', ''); // Remove it
                  }
            }
        }
    } catch (error) {
        console.error("Error in read loop:", error);
        updateStatus(`Read loop error: ${error.message}`, false);
    } finally {
        if (reader) {
            // Ensure the reader is released even if the loop crashes
              try { await reader.cancel(); } catch (cancelError) { console.warn("Error cancelling reader:", cancelError); }
              reader.releaseLock();
              reader = null;
            console.log("Reader released.");
        }
    }
      console.log("Read loop finished.");
      // If loop exited unexpectedly while 'keepReading' was true, likely a device issue
      if (keepReading) {
          updateStatus("Disconnected (Read loop ended unexpectedly)", false);
          await disconnect(); // Attempt cleanup
      }
}

async function connect() {
    updateStatus("Requesting port...", null);
    try {
        const filters = [{ usbVendorId: VENDOR_ID, usbProductId: PRODUCT_ID }];
        // port = await serial.requestPort({ filters });
        port = await serial.requestPort();
        console.log("Port selected:", port);

        await port.open({ baudRate: BAUD_RATE });
        updateStatus("Port open, configuring CAN...", null);

        // Get writer and reader
        writer = port.writable.getWriter();
        // Reader is obtained in readLoop

        // --- Configure CANUSB ---
        // Small delay to ensure device is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // 1. Send CR to clear potential pending command/get prompt
        await writeToStream(''); // Sends just CR
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for potential response

        // 2. Set CAN Bitrate (S6 = 500k)
        await writeToStream(CAN_BITRATE_CMD);
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for potential CR response

        // 3. Open CAN Channel
        await writeToStream(OPEN_CAN_CMD);
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for potential CR response

        // TODO: Could add checks here to read back the CR or BELL response
        // after each command for more robust initialization. This requires
        // starting the read loop earlier or doing short reads here.
        // For simplicity, we assume commands succeed for now.

        updateStatus("Connected (500 kbit/s)", true);
        keepReading = true;
        readLoop(); // Start reading continuously        
    } catch (error) {
        console.error("Connection failed:", error);
        updateStatus(`Connection failed: ${error.message}`, false);
        // Ensure resources are released if connection fails partially
        if (writer) { try { writer.releaseLock(); writer = null; } catch(e){} }
        if (reader) { try { await reader.cancel(); reader.releaseLock(); reader = null; } catch(e){} }
        if (port && port.readable) { port = null; } // Avoid closing if never opened
          else if (port) { try { await port.close(); port = null; } catch(e){} }
    }
}

async function disconnect() {
  keepReading = false; // Signal read loop to stop

  if (!port) {
        updateStatus("Already disconnected", false);
      return;
  }

  updateStatus("Disconnecting...", null);

    // 1. Close CAN Channel (Best effort)
    if (writer) {
        try {
            await writeToStream(CLOSE_CAN_CMD);
            await new Promise(resolve => setTimeout(resolve, 50)); // Short delay
        } catch (e) {
            console.warn("Error sending close command:", e);
        } finally {
            // Release writer lock *before* closing port
            try { writer.releaseLock(); } catch (e) { console.warn("Error releasing writer lock:", e); }
            writer = null;
            console.log("Writer released.");
        }
    }

  // 2. Cancel reader and release lock (readLoop should handle this on exit)
    if (reader) {
        try {
            // Cancel might already be called by readLoop ending
            // await reader.cancel(); // Redundant if loop exited cleanly
            // reader.releaseLock(); // Handled in readLoop finally block
        } catch (e) {
            console.warn("Error during reader cleanup:", e);
        }
        // Reader variable is cleared in readLoop finally block
    }


  // 3. Close the serial port
  try {
      await port.close();
      console.log("Port closed.");
  } catch (error) {
      console.error("Error closing port:", error);
  } finally {
        port = null;
        updateStatus("Disconnected", false);
  }
}

// --- Event Listeners & Init ---
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
clearLogBtn.addEventListener('click', () => {
    if (messageBody) messageBody.innerHTML = ''; loggedMessages = [];
    console.log("Log cleared."); saveBtn.disabled = true; clearLogBtn.disabled = true;
});
saveBtn.addEventListener('click', saveDataToFile);
window.addEventListener('beforeunload', async () => { if (device) { await disconnect(); } });

document.addEventListener('DOMContentLoaded', () => {
      if (!navigator.usb) {
          updateStatus("WebUSB API not supported.", false);
          connectBtn.disabled = true; saveBtn.disabled = true; clearLogBtn.disabled = true;
      } else { updateStatus("Disconnected", false); saveBtn.disabled = true; clearLogBtn.disabled = true;}
});
