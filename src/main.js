import './style.css'
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
// import { setupCounter } from './counter.js' // Not used in this file's current context

import { serial as webSerialPolyfill } from 'web-serial-polyfill';
import {
    CAN_BITRATE_CMD,
    OPEN_CAN_CMD,
    CLOSE_CAN_CMD,
    CR_CHAR,
    parseCanMessage,
    constructCanFrameCommand,
    isValidHex
} from './lawicel.js';
import {
    updateStatusUI,
    addMessageToTableUI,
    saveDataToFileUI
    // formatTimestampForFile is used internally by saveDataToFileUI, no need to import directly to main.js
} from './ui.js';

// const useSerial = true;
const useSerial = ('serial' in navigator);
const serial = useSerial ? navigator.serial : webSerialPolyfill;
// const ports = await serial.getPorts();

const connectBtn = document.getElementById('connect-btn');
console.log("connectBtn", connectBtn);
const disconnectBtn = document.getElementById('disconnect-btn');
const clearLogBtn = document.getElementById('clear-log-btn');
const saveBtn = document.getElementById('save-btn');
// const canMessageInput = document.getElementById('can-message-input'); // Old input
const sendCanBtn = document.getElementById('send-can-btn');
const canIdInput = document.getElementById('can-id-input');
const canDlcInput = document.getElementById('can-dlc-input');
const canDataInput = document.getElementById('can-data-input');
const statusMessage = document.getElementById('status-message');
const messageBody = document.getElementById('message-body');

const VENDOR_ID = 0x0483;
const PRODUCT_ID = 0x5740;

// Serial Port Config
const BAUD_RATE = 115200;
// Lawicel command constants (CAN_BITRATE_CMD, OPEN_CAN_CMD, CLOSE_CAN_CMD, CR_CHAR, CR_BYTE)
// are now imported from lawicel.js. CR_BYTE is not explicitly used in main.js anymore.

let port;
let reader;
let writer;
let keepReading = false;
let lineBuffer = '';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let maxMessagesInTable = 200;
let loggedMessages = [];

// UI Update Functions are now imported from ui.js
// function updateStatus(...) { ... } // REMOVED
// function addMessageToTable(...) { ... } // REMOVED
// function formatTimestampForFile(...) { ... } // REMOVED
// function saveDataToFile(...) { ... } // REMOVED


async function writeToStream(command) {
    if (!writer) {
        console.error("Writer not available.");
        // Call imported UI function
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Error: Writer not available.",
            port ? port.readable !== null : false,
            loggedMessages.length
        );
        return;
    }
    // Basic validation for CAN message format (e.g., t1238aabbccdd)
    // Lawicel commands are typically single characters followed by parameters.
    // For sending a CAN frame, it's 't' + ID (3 hex) + DLC (1 hex) + DATA (0-8 bytes hex)
    // or 'T' + ID (8 hex) + DLC (1 hex) + DATA (0-8 bytes hex)
    // This function now expects a fully formed Lawicel command string.
    // Validation specific to ID/DLC/Data should happen before calling this.
    if (!command || typeof command !== 'string' || command.length === 0) {
        console.error("Invalid or empty command to send to stream.");
        // Error already logged by caller, or this is an internal command
        return;
    }

    const data = encoder.encode(command + CR_CHAR); // Append CR to commands
    await writer.write(data);
    console.log("Sent to Stream:", command);
    // Log the sent message to the table for user visibility
    // We need to parse it as if it were received to display it correctly.
    // However, parseCanMessage expects device responses.
    // For sent messages, we can construct a similar object or log raw.
    // For now, let's add a simple "sent" type message.
    // A more robust solution would be to parse the command we just built.
    // parseCanMessage is imported.
    const sentMsgPseudo = parseCanMessage(command); // Attempt to parse for display
    // Call imported UI function
    if (sentMsgPseudo.type === "unknown" || sentMsgPseudo.type === "other" || sentMsgPseudo.type === "parse_error") {
        addMessageToTableUI(messageBody, {
            raw: command,
            type: "sent_cmd",
            id: sentMsgPseudo.id || null,
            dlc: sentMsgPseudo.dlc || null,
            data: sentMsgPseudo.data && sentMsgPseudo.data.length > 0 ? sentMsgPseudo.data : [command],
            timestamp: Date.now()
        }, maxMessagesInTable);
    } else {
        addMessageToTableUI(messageBody, { ...sentMsgPseudo, type: `sent_${sentMsgPseudo.type}`}, maxMessagesInTable);
    }
}

// isValidHex is now imported from lawicel.js
// function isValidHex(str, len = -1) { ... } // REMOVED

async function sendCanMessageFromInput() {
    const idStr = canIdInput.value.trim();
    const dlcStr = canDlcInput.value.trim();
    const dataStr = canDataInput.value.trim().replace(/\s/g, ''); // Remove spaces from data

    const dlcNum = parseInt(dlcStr, 10);

    // Validate ID (length 3, hex) using imported isValidHex
    if (!isValidHex(idStr, 3)) {
        addMessageToTableUI(messageBody, { type: "error", message: "Invalid CAN ID: Must be 3 hex characters.", timestamp: Date.now() }, maxMessagesInTable);
        console.warn("Invalid CAN ID:", idStr);
        return;
    }
    // Validate DLC (numeric, 0-8)
    if (isNaN(dlcNum) || dlcNum < 0 || dlcNum > 8) {
        addMessageToTableUI(messageBody, { type: "error", message: "Invalid CAN DLC: Must be a number 0-8.", timestamp: Date.now() }, maxMessagesInTable);
        console.warn("Invalid CAN DLC:", dlcStr);
        return;
    }
    // Validate Data (hex, length matches DLC*2) using imported isValidHex
    if (!isValidHex(dataStr, dlcNum * 2)) {
        addMessageToTableUI(messageBody, { type: "error", message: `Invalid CAN Data: Must be ${dlcNum*2} hex characters for DLC ${dlcNum}.`, timestamp: Date.now() }, maxMessagesInTable);
        console.warn("Invalid CAN Data:", dataStr, "DLC:", dlcNum);
        return;
    }

    // Construct Lawicel command using imported constructCanFrameCommand
    // Assuming standard 't' frame for now (isExtended = false)
    const command = constructCanFrameCommand(idStr, dlcNum, dataStr, false);

    if (command) {
        await writeToStream(command);
        // Optionally clear inputs after sending
        // canIdInput.value = '';
        // canDlcInput.value = '';
        // canDataInput.value = '';
    } else {
        // This case should ideally be caught by the more specific validation above,
        // but constructCanFrameCommand also returns null on error if its internal checks fail.
        addMessageToTableUI(messageBody, { type: "error", message: "Failed to construct CAN command. Check inputs.", timestamp: Date.now() }, maxMessagesInTable);
        console.error("Failed to construct CAN command with inputs:", idStr, dlcNum, dataStr);
    }
}

async function readLoop() {
    if (!port || !port.readable) {
        console.error("Port not readable.");
        // Potentially update status here if desired, though connect/disconnect handles major states
        // updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, "Error: Port not readable", false, loggedMessages.length);
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
                        const parsedMsg = parseCanMessage(line.trim()); // Imported from lawicel.js
                        // Only log relevant messages to the table
                        if (parsedMsg.type.startsWith('can') || parsedMsg.type.startsWith('rtr') || parsedMsg.type === 'status_flags' || parsedMsg.type.includes('error')) {
                            addMessageToTableUI(messageBody, parsedMsg, maxMessagesInTable);
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
                      addMessageToTableUI(messageBody, parseCanMessage('\x07'), maxMessagesInTable); // Log error
                      lineBuffer = lineBuffer.replace('\x07', ''); // Remove it
                  }
            }
        }
    } catch (error) {
        console.error("Error in read loop:", error);
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            `Read loop error: ${error.message}`,
            false,
            loggedMessages.length
        );
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
          updateStatusUI(
              statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
              canIdInput, canDlcInput, canDataInput,
              "Disconnected (Read loop ended unexpectedly)",
              false,
              loggedMessages.length
          );
          await disconnect(); // Attempt cleanup
      }
}

async function connect() {
    updateStatusUI(
        statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
        canIdInput, canDlcInput, canDataInput,
        "Requesting port...",
        null, // connecting state
        loggedMessages.length
    );
    try {
        const filters = [{ usbVendorId: VENDOR_ID, usbProductId: PRODUCT_ID }];
        port = await serial.requestPort({ filters });
        // port = await serial.requestPort();
        console.log("Port selected:", port);

        await port.open({ baudRate: BAUD_RATE });
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Port open, configuring CAN...",
            null, // connecting state
            loggedMessages.length
        );

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

        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Connected (500 kbit/s)",
            true,
            loggedMessages.length
        );
        keepReading = true;
        readLoop(); // Start reading continuously
    } catch (error) {
        console.error("Connection failed:", error);
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            `Connection failed: ${error.message}`,
            false,
            loggedMessages.length
        );
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
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Already disconnected",
            false,
            loggedMessages.length
        );
        return;
    }

    updateStatusUI(
        statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
        canIdInput, canDlcInput, canDataInput,
        "Disconnecting...",
        null, // connecting state (or a dedicated 'disconnecting' state if desired)
        loggedMessages.length
    );

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
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Disconnected",
            false,
            loggedMessages.length // loggedMessages might have content to save
        );
    }
}

// --- Event Listeners & Init ---
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);

clearLogBtn.addEventListener('click', () => {
    if (messageBody) messageBody.innerHTML = '';
    loggedMessages = [];
    console.log("Log cleared.");
    // Update button states directly or via updateStatusUI
    saveBtn.disabled = true;
    clearLogBtn.disabled = true;
    // If disconnected, updateStatusUI would handle this. If connected, this is fine.
});

saveBtn.addEventListener('click', () => saveDataToFileUI(loggedMessages, saveBtn));
sendCanBtn.addEventListener('click', sendCanMessageFromInput);

window.addEventListener('beforeunload', async () => { if (port && port.readable) { await disconnect(); } });

document.addEventListener('DOMContentLoaded', () => {
    const isSerialSupported = ('serial' in navigator || 'usb' in navigator);
    if (!isSerialSupported) {
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Web Serial API not supported.",
            false,
            0 // No logged messages initially
        );
    } else {
        updateStatusUI(
            statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn,
            canIdInput, canDlcInput, canDataInput,
            "Disconnected",
            false, // Initial state
            0 // No logged messages initially
        );
    }
});
