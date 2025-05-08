// Lawicel Protocol Constants & Utilities

export const CAN_BITRATE_CMD = 'S6'; // Example: 500 kbit/s
export const OPEN_CAN_CMD = 'O';
export const CLOSE_CAN_CMD = 'C';
export const CR_CHAR = '\r';
export const CR_BYTE = 0x0D;

/**
 * Parses a raw string from a Lawicel device into a structured CAN message object.
 * @param {string} rawString The raw string received from the device.
 * @returns {object} A message object with type, id, dlc, data, timestamp, and raw string.
 */
export function parseCanMessage(rawString) {
    const msg = { raw: rawString, type: "unknown", id: null, dlc: null, data: [], timestamp: Date.now() };
    if (!rawString || rawString.length < 1) return msg;

    try {
        const mt = rawString[0]; // Message Type indicator
        const r = rawString.substring(1); // Rest of the string

        if (mt === 't') { // Standard CAN frame
            msg.type = 'can_std';
            msg.id = r.substring(0, 3);
            msg.dlc = parseInt(r.substring(3, 4), 10); // DLC is a single decimal digit representing count
            const dataString = r.substring(4);
            if (!isNaN(msg.dlc) && dataString.length >= msg.dlc * 2) {
                msg.data = (dataString.substring(0, msg.dlc * 2)).match(/.{1,2}/g) || [];
            } else {
                 // If DLC is invalid or data string too short, take what's there
                msg.data = dataString.match(/.{1,2}/g) || [];
            }
        } else if (mt === 'T') { // Extended CAN frame
            msg.type = 'can_ext';
            msg.id = r.substring(0, 8);
            msg.dlc = parseInt(r.substring(8, 9), 10);
            const dataString = r.substring(9);
            if (!isNaN(msg.dlc) && dataString.length >= msg.dlc * 2) {
                msg.data = (dataString.substring(0, msg.dlc * 2)).match(/.{1,2}/g) || [];
            } else {
                msg.data = dataString.match(/.{1,2}/g) || [];
            }
        } else if (mt === 'r') { // Standard RTR frame
            msg.type = 'rtr_std';
            msg.id = r.substring(0, 3);
            msg.dlc = parseInt(r.substring(3, 4), 10);
            msg.data = ['RTR'];
        } else if (mt === 'R') { // Extended RTR frame
            msg.type = 'rtr_ext';
            msg.id = r.substring(0, 8);
            msg.dlc = parseInt(r.substring(8, 9), 10);
            msg.data = ['RTR'];
        } else if (mt === 'F') { // Status Flags
            msg.type = 'status_flags';
            msg.data = [r]; // The rest of the string is the status
        } else if (mt === 'V') { // Version number
            msg.type = 'version';
            msg.data = [r];
        } else if (mt === 'Z' || mt === 'z') { // ACK
            msg.type = 'ack';
            msg.data = ['OK'];
        } else if (rawString === String.fromCharCode(0x07)) { // BELL character (ASCII 7)
            msg.type = 'error_response';
            msg.data = ['BELL (Error)'];
        } else if (rawString === CR_CHAR) { // Carriage Return only
            msg.type = 'ok_response';
            msg.data = ['CR (OK)'];
        } else {
            msg.type = 'other'; // Unknown or non-CAN message response
            msg.data = [rawString];
        }
    } catch (e) {
        console.error(`Parse error for Lawicel message '${rawString}': ${e}`);
        msg.type = 'parse_error';
        msg.message = e.message; // Store error message
    }
    return msg;
}

/**
 * Constructs a Lawicel command string for sending a CAN message.
 * @param {string} id - The CAN ID (3 hex chars for std, 8 for ext).
 * @param {number} dlc - Data Length Code (0-8).
 * @param {string} data - Data bytes as a hex string (e.g., "AABBCC").
 * @param {boolean} [isExtended=false] - True if extended ID, false for standard.
 * @returns {string|null} The formatted Lawicel command string or null if inputs are invalid.
 */
export function constructCanFrameCommand(id, dlc, dataHex, isExtended = false) {
    const idUpper = id.toUpperCase();
    const dataUpper = dataHex.toUpperCase();

    // Basic validation (more can be added)
    if (typeof dlc !== 'number' || dlc < 0 || dlc > 8) return null;
    if (isExtended && (idUpper.length !== 8 || !/^[0-9A-F]{8}$/.test(idUpper))) return null;
    if (!isExtended && (idUpper.length !== 3 || !/^[0-9A-F]{3}$/.test(idUpper))) return null;
    if (dataUpper.length !== dlc * 2 || (dlc > 0 && !/^[0-9A-F]*$/.test(dataUpper))) return null;


    const dlcHex = dlc.toString(16).toUpperCase(); // DLC for command is single hex digit
    const commandPrefix = isExtended ? 'T' : 't';

    return `${commandPrefix}${idUpper}${dlcHex}${dataUpper}`;
}

/**
 * Checks if a string is a valid hexadecimal string of a specific length.
 * @param {string} str The string to check.
 * @param {number} [len=-1] Expected length. If -1, length is not checked.
 * @returns {boolean} True if valid hex, false otherwise.
 */
export function isValidHex(str, len = -1) {
    if (typeof str !== 'string') return false;
    // Allow empty string if len is 0 (e.g. data for DLC 0)
    if (len === 0 && str === '') return true;
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(str)) return false;
    if (len !== -1 && str.length !== len) return false;
    return true;
}
