// GUI Utility Functions

/**
 * Updates the status message and button states in the UI.
 * @param {HTMLElement} statusMessageEl - The status message element.
 * @param {HTMLElement} connectBtnEl - The connect button element.
 * @param {HTMLElement} disconnectBtnEl - The disconnect button element.
 * @param {HTMLElement} saveBtnEl - The save button element.
 * @param {HTMLElement} clearLogBtnEl - The clear log button element.
 * @param {HTMLElement} sendCanBtnEl - The send CAN button element.
 * @param {HTMLElement} canIdInputEl - The CAN ID input element.
 * @param {HTMLElement} canDlcInputEl - The CAN DLC input element.
 * @param {HTMLElement} canDataInputEl - The CAN Data input element.
 * @param {string} message - The status message to display.
 * @param {boolean|null} connectedState - True if connected, false if disconnected, null if connecting.
 * @param {number} loggedMessagesCount - The number of currently logged messages.
 */
export function updateStatusUI(
    statusMessageEl,
    connectBtnEl, disconnectBtnEl, saveBtnEl, clearLogBtnEl, sendCanBtnEl,
    canIdInputEl, canDlcInputEl, canDataInputEl,
    message,
    connectedState = null,
    loggedMessagesCount = 0
) {
    if (statusMessageEl) statusMessageEl.textContent = message;
    console.log("Status:", message);

    if (connectedState === true) {
        if (statusMessageEl) statusMessageEl.className = 'status-connected';
        if (connectBtnEl) connectBtnEl.disabled = true;
        if (disconnectBtnEl) disconnectBtnEl.disabled = false;
        if (saveBtnEl) saveBtnEl.disabled = false;
        if (clearLogBtnEl) clearLogBtnEl.disabled = false;
        if (sendCanBtnEl) sendCanBtnEl.disabled = false;
        if (canIdInputEl) canIdInputEl.disabled = false;
        if (canDlcInputEl) canDlcInputEl.disabled = false;
        if (canDataInputEl) canDataInputEl.disabled = false;
    } else if (connectedState === false) {
        if (statusMessageEl) statusMessageEl.className = 'status-disconnected';
        if (connectBtnEl) connectBtnEl.disabled = false;
        if (disconnectBtnEl) disconnectBtnEl.disabled = true;
        if (saveBtnEl) saveBtnEl.disabled = (loggedMessagesCount === 0);
        if (clearLogBtnEl) clearLogBtnEl.disabled = (loggedMessagesCount === 0);
        if (sendCanBtnEl) sendCanBtnEl.disabled = true;
        if (canIdInputEl) canIdInputEl.disabled = true;
        if (canDlcInputEl) canDlcInputEl.disabled = true;
        if (canDataInputEl) canDataInputEl.disabled = true;
    } else { // connecting
        if (statusMessageEl) statusMessageEl.className = 'status-connecting';
        if (connectBtnEl) connectBtnEl.disabled = true;
        if (disconnectBtnEl) disconnectBtnEl.disabled = true;
        if (saveBtnEl) saveBtnEl.disabled = true;
        if (clearLogBtnEl) clearLogBtnEl.disabled = true;
        if (sendCanBtnEl) sendCanBtnEl.disabled = true;
        if (canIdInputEl) canIdInputEl.disabled = true;
        if (canDlcInputEl) canDlcInputEl.disabled = true;
        if (canDataInputEl) canDataInputEl.disabled = true;
    }
}

/**
 * Adds a message to the log table in the UI.
 * @param {HTMLElement} messageBodyEl - The tbody element of the message table.
 * @param {object} msg - The message object to add.
 * @param {number} maxMessagesInTable - Maximum messages to keep in the table.
 */
export function addMessageToTableUI(messageBodyEl, msg, maxMessagesInTable = 200) {
    if (!messageBodyEl) return;
    const row = messageBodyEl.insertRow(0);
    row.classList.add('highlight');

    const tc = row.insertCell(), tyc = row.insertCell(), idc = row.insertCell(), dlcc = row.insertCell(), dc = row.insertCell();
    const ts = new Date(msg.timestamp);
    tc.textContent = ts.toLocaleTimeString() + '.' + String(ts.getMilliseconds()).padStart(3, '0');
    tc.classList.add('timestamp');

    tyc.textContent = msg.type.toUpperCase();
    idc.textContent = msg.id || '---';
    dlcc.textContent = msg.dlc !== null ? msg.dlc : '---';
    dc.textContent = msg.data ? msg.data.join(' ') : '---';

    if (msg.type === 'error' || msg.type === 'parse_error' || msg.type.includes('error')) { // check for error in type
        row.classList.add('error');
        dc.textContent = msg.raw || msg.message || 'Error';
    }

    setTimeout(() => row.classList.remove('highlight'), 500);
    while (messageBodyEl.rows.length > maxMessagesInTable) {
        messageBodyEl.deleteRow(-1);
    }
}

/**
 * Formats a timestamp (milliseconds) into a string for filenames/CSV.
 * @param {number} tsMs - Timestamp in milliseconds.
 * @returns {string} Formatted timestamp string.
 */
export function formatTimestampForFile(tsMs) {
    const d = new Date(tsMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
           `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}` +
           `.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/**
 * Saves logged messages to a CSV file.
 * @param {Array<object>} messagesToSave - Array of message objects to save.
 * @param {HTMLElement} saveBtnEl - The save button element (to disable it if no messages).
 */
export function saveDataToFileUI(messagesToSave, saveBtnEl) {
    if (messagesToSave.length === 0) {
        alert("No messages to save.");
        if (saveBtnEl) saveBtnEl.disabled = true;
        return;
    }

    const header = "Timestamp,Type,ID,DLC,Data\n";
    const rows = messagesToSave.map(m => {
        const timestamp = formatTimestampForFile(m.timestamp);
        const type = m.type.toUpperCase();
        const id = m.id || '';
        const dlc = m.dlc !== null ? m.dlc : '';
        const data = m.data ? m.data.join(' ') : '';
        const escapeCsvField = (field) => (String(field).includes(',') ? `"${String(field).replace(/"/g, '""')}"` : field);
        return `${escapeCsvField(timestamp)},${escapeCsvField(type)},${escapeCsvField(id)},${escapeCsvField(dlc)},${escapeCsvField(data)}`;
    }).join('\n');

    const csvContent = header + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);

    const now = new Date();
    const filename = `can_trace_webusb_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_` +
                     `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
