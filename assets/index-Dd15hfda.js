(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
var SerialPolyfillProtocol;
(function(SerialPolyfillProtocol2) {
  SerialPolyfillProtocol2[SerialPolyfillProtocol2["UsbCdcAcm"] = 0] = "UsbCdcAcm";
})(SerialPolyfillProtocol || (SerialPolyfillProtocol = {}));
const kSetLineCoding = 32;
const kSetControlLineState = 34;
const kSendBreak = 35;
const kDefaultBufferSize = 255;
const kDefaultDataBits = 8;
const kDefaultParity = "none";
const kDefaultStopBits = 1;
const kAcceptableDataBits = [16, 8, 7, 6, 5];
const kAcceptableStopBits = [1, 2];
const kAcceptableParity = ["none", "even", "odd"];
const kParityIndexMapping = ["none", "odd", "even"];
const kStopBitsIndexMapping = [1, 1.5, 2];
const kDefaultPolyfillOptions = {
  protocol: SerialPolyfillProtocol.UsbCdcAcm,
  usbControlInterfaceClass: 2,
  usbTransferInterfaceClass: 10
};
function findInterface(device, classCode) {
  const configuration = device.configurations[0];
  for (const iface of configuration.interfaces) {
    const alternate = iface.alternates[0];
    if (alternate.interfaceClass === classCode) {
      return iface;
    }
  }
  throw new TypeError(`Unable to find interface with class ${classCode}.`);
}
function findEndpoint(iface, direction) {
  const alternate = iface.alternates[0];
  for (const endpoint of alternate.endpoints) {
    if (endpoint.direction == direction) {
      return endpoint;
    }
  }
  throw new TypeError(`Interface ${iface.interfaceNumber} does not have an ${direction} endpoint.`);
}
class UsbEndpointUnderlyingSource {
  /**
   * Constructs a new UnderlyingSource that will pull data from the specified
   * endpoint on the given USB device.
   *
   * @param {USBDevice} device
   * @param {USBEndpoint} endpoint
   * @param {function} onError function to be called on error
   */
  constructor(device, endpoint, onError) {
    this.type = "bytes";
    this.device_ = device;
    this.endpoint_ = endpoint;
    this.onError_ = onError;
  }
  /**
   * Reads a chunk of data from the device.
   *
   * @param {ReadableByteStreamController} controller
   */
  pull(controller) {
    (async () => {
      var _a;
      let chunkSize;
      if (controller.desiredSize) {
        const d = controller.desiredSize / this.endpoint_.packetSize;
        chunkSize = Math.ceil(d) * this.endpoint_.packetSize;
      } else {
        chunkSize = this.endpoint_.packetSize;
      }
      try {
        const result = await this.device_.transferIn(this.endpoint_.endpointNumber, chunkSize);
        if (result.status != "ok") {
          controller.error(`USB error: ${result.status}`);
          this.onError_();
        }
        if ((_a = result.data) === null || _a === void 0 ? void 0 : _a.buffer) {
          const chunk = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
          controller.enqueue(chunk);
        }
      } catch (error) {
        controller.error(error.toString());
        this.onError_();
      }
    })();
  }
}
class UsbEndpointUnderlyingSink {
  /**
   * Constructs a new UnderlyingSink that will write data to the specified
   * endpoint on the given USB device.
   *
   * @param {USBDevice} device
   * @param {USBEndpoint} endpoint
   * @param {function} onError function to be called on error
   */
  constructor(device, endpoint, onError) {
    this.device_ = device;
    this.endpoint_ = endpoint;
    this.onError_ = onError;
  }
  /**
   * Writes a chunk to the device.
   *
   * @param {Uint8Array} chunk
   * @param {WritableStreamDefaultController} controller
   */
  async write(chunk, controller) {
    try {
      const result = await this.device_.transferOut(this.endpoint_.endpointNumber, chunk);
      if (result.status != "ok") {
        controller.error(result.status);
        this.onError_();
      }
    } catch (error) {
      controller.error(error.toString());
      this.onError_();
    }
  }
}
class SerialPort {
  /**
   * constructor taking a WebUSB device that creates a SerialPort instance.
   * @param {USBDevice} device A device acquired from the WebUSB API
   * @param {SerialPolyfillOptions} polyfillOptions Optional options to
   * configure the polyfill.
   */
  constructor(device, polyfillOptions) {
    this.polyfillOptions_ = Object.assign(Object.assign({}, kDefaultPolyfillOptions), polyfillOptions);
    this.outputSignals_ = {
      dataTerminalReady: false,
      requestToSend: false,
      break: false
    };
    this.device_ = device;
    this.controlInterface_ = findInterface(this.device_, this.polyfillOptions_.usbControlInterfaceClass);
    this.transferInterface_ = findInterface(this.device_, this.polyfillOptions_.usbTransferInterfaceClass);
    this.inEndpoint_ = findEndpoint(this.transferInterface_, "in");
    this.outEndpoint_ = findEndpoint(this.transferInterface_, "out");
  }
  /**
   * Getter for the readable attribute. Constructs a new ReadableStream as
   * necessary.
   * @return {ReadableStream} the current readable stream
   */
  get readable() {
    var _a;
    if (!this.readable_ && this.device_.opened) {
      this.readable_ = new ReadableStream(new UsbEndpointUnderlyingSource(this.device_, this.inEndpoint_, () => {
        this.readable_ = null;
      }), {
        highWaterMark: (_a = this.serialOptions_.bufferSize) !== null && _a !== void 0 ? _a : kDefaultBufferSize
      });
    }
    return this.readable_;
  }
  /**
   * Getter for the writable attribute. Constructs a new WritableStream as
   * necessary.
   * @return {WritableStream} the current writable stream
   */
  get writable() {
    var _a;
    if (!this.writable_ && this.device_.opened) {
      this.writable_ = new WritableStream(new UsbEndpointUnderlyingSink(this.device_, this.outEndpoint_, () => {
        this.writable_ = null;
      }), new ByteLengthQueuingStrategy({
        highWaterMark: (_a = this.serialOptions_.bufferSize) !== null && _a !== void 0 ? _a : kDefaultBufferSize
      }));
    }
    return this.writable_;
  }
  /**
   * a function that opens the device and claims all interfaces needed to
   * control and communicate to and from the serial device
   * @param {SerialOptions} options Object containing serial options
   * @return {Promise<void>} A promise that will resolve when device is ready
   * for communication
   */
  async open(options) {
    this.serialOptions_ = options;
    this.validateOptions();
    try {
      await this.device_.open();
      if (this.device_.configuration === null) {
        await this.device_.selectConfiguration(1);
      }
      await this.device_.claimInterface(this.controlInterface_.interfaceNumber);
      if (this.controlInterface_ !== this.transferInterface_) {
        await this.device_.claimInterface(this.transferInterface_.interfaceNumber);
      }
      await this.setLineCoding();
      await this.setSignals({ dataTerminalReady: true });
    } catch (error) {
      if (this.device_.opened) {
        await this.device_.close();
      }
      throw new Error("Error setting up device: " + error.toString());
    }
  }
  /**
   * Closes the port.
   *
   * @return {Promise<void>} A promise that will resolve when the port is
   * closed.
   */
  async close() {
    const promises = [];
    if (this.readable_) {
      promises.push(this.readable_.cancel());
    }
    if (this.writable_) {
      promises.push(this.writable_.abort());
    }
    await Promise.all(promises);
    this.readable_ = null;
    this.writable_ = null;
    if (this.device_.opened) {
      await this.setSignals({ dataTerminalReady: false, requestToSend: false });
      await this.device_.close();
    }
  }
  /**
   * Forgets the port.
   *
   * @return {Promise<void>} A promise that will resolve when the port is
   * forgotten.
   */
  async forget() {
    return this.device_.forget();
  }
  /**
   * A function that returns properties of the device.
   * @return {SerialPortInfo} Device properties.
   */
  getInfo() {
    return {
      usbVendorId: this.device_.vendorId,
      usbProductId: this.device_.productId
    };
  }
  /**
   * A function used to change the serial settings of the device
   * @param {object} options the object which carries serial settings data
   * @return {Promise<void>} A promise that will resolve when the options are
   * set
   */
  reconfigure(options) {
    this.serialOptions_ = Object.assign(Object.assign({}, this.serialOptions_), options);
    this.validateOptions();
    return this.setLineCoding();
  }
  /**
   * Sets control signal state for the port.
   * @param {SerialOutputSignals} signals The signals to enable or disable.
   * @return {Promise<void>} a promise that is resolved when the signal state
   * has been changed.
   */
  async setSignals(signals) {
    this.outputSignals_ = Object.assign(Object.assign({}, this.outputSignals_), signals);
    if (signals.dataTerminalReady !== void 0 || signals.requestToSend !== void 0) {
      const value = (this.outputSignals_.dataTerminalReady ? 1 << 0 : 0) | (this.outputSignals_.requestToSend ? 1 << 1 : 0);
      await this.device_.controlTransferOut({
        "requestType": "class",
        "recipient": "interface",
        "request": kSetControlLineState,
        "value": value,
        "index": this.controlInterface_.interfaceNumber
      });
    }
    if (signals.break !== void 0) {
      const value = this.outputSignals_.break ? 65535 : 0;
      await this.device_.controlTransferOut({
        "requestType": "class",
        "recipient": "interface",
        "request": kSendBreak,
        "value": value,
        "index": this.controlInterface_.interfaceNumber
      });
    }
  }
  /**
   * Checks the serial options for validity and throws an error if it is
   * not valid
   */
  validateOptions() {
    if (!this.isValidBaudRate(this.serialOptions_.baudRate)) {
      throw new RangeError("invalid Baud Rate " + this.serialOptions_.baudRate);
    }
    if (!this.isValidDataBits(this.serialOptions_.dataBits)) {
      throw new RangeError("invalid dataBits " + this.serialOptions_.dataBits);
    }
    if (!this.isValidStopBits(this.serialOptions_.stopBits)) {
      throw new RangeError("invalid stopBits " + this.serialOptions_.stopBits);
    }
    if (!this.isValidParity(this.serialOptions_.parity)) {
      throw new RangeError("invalid parity " + this.serialOptions_.parity);
    }
  }
  /**
   * Checks the baud rate for validity
   * @param {number} baudRate the baud rate to check
   * @return {boolean} A boolean that reflects whether the baud rate is valid
   */
  isValidBaudRate(baudRate) {
    return baudRate % 1 === 0;
  }
  /**
   * Checks the data bits for validity
   * @param {number} dataBits the data bits to check
   * @return {boolean} A boolean that reflects whether the data bits setting is
   * valid
   */
  isValidDataBits(dataBits) {
    if (typeof dataBits === "undefined") {
      return true;
    }
    return kAcceptableDataBits.includes(dataBits);
  }
  /**
   * Checks the stop bits for validity
   * @param {number} stopBits the stop bits to check
   * @return {boolean} A boolean that reflects whether the stop bits setting is
   * valid
   */
  isValidStopBits(stopBits) {
    if (typeof stopBits === "undefined") {
      return true;
    }
    return kAcceptableStopBits.includes(stopBits);
  }
  /**
   * Checks the parity for validity
   * @param {string} parity the parity to check
   * @return {boolean} A boolean that reflects whether the parity is valid
   */
  isValidParity(parity) {
    if (typeof parity === "undefined") {
      return true;
    }
    return kAcceptableParity.includes(parity);
  }
  /**
   * sends the options alog the control interface to set them on the device
   * @return {Promise} a promise that will resolve when the options are set
   */
  async setLineCoding() {
    var _a, _b, _c;
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint32(0, this.serialOptions_.baudRate, true);
    view.setUint8(4, kStopBitsIndexMapping.indexOf((_a = this.serialOptions_.stopBits) !== null && _a !== void 0 ? _a : kDefaultStopBits));
    view.setUint8(5, kParityIndexMapping.indexOf((_b = this.serialOptions_.parity) !== null && _b !== void 0 ? _b : kDefaultParity));
    view.setUint8(6, (_c = this.serialOptions_.dataBits) !== null && _c !== void 0 ? _c : kDefaultDataBits);
    const result = await this.device_.controlTransferOut({
      "requestType": "class",
      "recipient": "interface",
      "request": kSetLineCoding,
      "value": 0,
      "index": this.controlInterface_.interfaceNumber
    }, buffer);
    if (result.status != "ok") {
      throw new DOMException("NetworkError", "Failed to set line coding.");
    }
  }
}
class Serial {
  /**
   * Requests permission to access a new port.
   *
   * @param {SerialPortRequestOptions} options
   * @param {SerialPolyfillOptions} polyfillOptions
   * @return {Promise<SerialPort>}
   */
  async requestPort(options, polyfillOptions) {
    polyfillOptions = Object.assign(Object.assign({}, kDefaultPolyfillOptions), polyfillOptions);
    const usbFilters = [];
    if (options && options.filters) {
      for (const filter of options.filters) {
        const usbFilter = {
          classCode: polyfillOptions.usbControlInterfaceClass
        };
        if (filter.usbVendorId !== void 0) {
          usbFilter.vendorId = filter.usbVendorId;
        }
        if (filter.usbProductId !== void 0) {
          usbFilter.productId = filter.usbProductId;
        }
        usbFilters.push(usbFilter);
      }
    }
    if (usbFilters.length === 0) {
      usbFilters.push({
        classCode: polyfillOptions.usbControlInterfaceClass
      });
    }
    const device = await navigator.usb.requestDevice({ "filters": usbFilters });
    const port2 = new SerialPort(device, polyfillOptions);
    return port2;
  }
  /**
   * Get the set of currently available ports.
   *
   * @param {SerialPolyfillOptions} polyfillOptions Polyfill configuration that
   * should be applied to these ports.
   * @return {Promise<SerialPort[]>} a promise that is resolved with a list of
   * ports.
   */
  async getPorts(polyfillOptions) {
    polyfillOptions = Object.assign(Object.assign({}, kDefaultPolyfillOptions), polyfillOptions);
    const devices = await navigator.usb.getDevices();
    const ports = [];
    devices.forEach((device) => {
      try {
        const port2 = new SerialPort(device, polyfillOptions);
        ports.push(port2);
      } catch (e) {
      }
    });
    return ports;
  }
}
const serial$1 = new Serial();
const CAN_BITRATE_CMD = "S6";
const OPEN_CAN_CMD = "O";
const CLOSE_CAN_CMD = "C";
const CR_CHAR = "\r";
function parseCanMessage(rawString) {
  const msg = { raw: rawString, type: "unknown", id: null, dlc: null, data: [], timestamp: Date.now() };
  if (!rawString || rawString.length < 1) return msg;
  try {
    const mt = rawString[0];
    const r = rawString.substring(1);
    if (mt === "t") {
      msg.type = "can_std";
      msg.id = r.substring(0, 3);
      msg.dlc = parseInt(r.substring(3, 4), 10);
      const dataString = r.substring(4);
      if (!isNaN(msg.dlc) && dataString.length >= msg.dlc * 2) {
        msg.data = dataString.substring(0, msg.dlc * 2).match(/.{1,2}/g) || [];
      } else {
        msg.data = dataString.match(/.{1,2}/g) || [];
      }
    } else if (mt === "T") {
      msg.type = "can_ext";
      msg.id = r.substring(0, 8);
      msg.dlc = parseInt(r.substring(8, 9), 10);
      const dataString = r.substring(9);
      if (!isNaN(msg.dlc) && dataString.length >= msg.dlc * 2) {
        msg.data = dataString.substring(0, msg.dlc * 2).match(/.{1,2}/g) || [];
      } else {
        msg.data = dataString.match(/.{1,2}/g) || [];
      }
    } else if (mt === "r") {
      msg.type = "rtr_std";
      msg.id = r.substring(0, 3);
      msg.dlc = parseInt(r.substring(3, 4), 10);
      msg.data = ["RTR"];
    } else if (mt === "R") {
      msg.type = "rtr_ext";
      msg.id = r.substring(0, 8);
      msg.dlc = parseInt(r.substring(8, 9), 10);
      msg.data = ["RTR"];
    } else if (mt === "F") {
      msg.type = "status_flags";
      msg.data = [r];
    } else if (mt === "V") {
      msg.type = "version";
      msg.data = [r];
    } else if (mt === "Z" || mt === "z") {
      msg.type = "ack";
      msg.data = ["OK"];
    } else if (rawString === String.fromCharCode(7)) {
      msg.type = "error_response";
      msg.data = ["BELL (Error)"];
    } else if (rawString === CR_CHAR) {
      msg.type = "ok_response";
      msg.data = ["CR (OK)"];
    } else {
      msg.type = "other";
      msg.data = [rawString];
    }
  } catch (e) {
    console.error(`Parse error for Lawicel message '${rawString}': ${e}`);
    msg.type = "parse_error";
    msg.message = e.message;
  }
  return msg;
}
function constructCanFrameCommand(id, dlc, dataHex, isExtended = false) {
  const idUpper = id.toUpperCase();
  const dataUpper = dataHex.toUpperCase();
  if (typeof dlc !== "number" || dlc < 0 || dlc > 8) return null;
  if (isExtended && (idUpper.length !== 8 || !/^[0-9A-F]{8}$/.test(idUpper))) return null;
  if (!isExtended && (idUpper.length !== 3 || !/^[0-9A-F]{3}$/.test(idUpper))) return null;
  if (dataUpper.length !== dlc * 2 || dlc > 0 && !/^[0-9A-F]*$/.test(dataUpper)) return null;
  const dlcHex = dlc.toString(16).toUpperCase();
  const commandPrefix = isExtended ? "T" : "t";
  return `${commandPrefix}${idUpper}${dlcHex}${dataUpper}`;
}
function isValidHex(str, len = -1) {
  if (typeof str !== "string") return false;
  if (len === 0 && str === "") return true;
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(str)) return false;
  if (len !== -1 && str.length !== len) return false;
  return true;
}
function updateStatusUI(statusMessageEl, connectBtnEl, disconnectBtnEl, saveBtnEl, clearLogBtnEl, sendCanBtnEl, canIdInputEl, canDlcInputEl, canDataInputEl, message, connectedState = null, loggedMessagesCount = 0) {
  if (statusMessageEl) statusMessageEl.textContent = message;
  console.log("Status:", message);
  if (connectedState === true) {
    if (statusMessageEl) statusMessageEl.className = "status-connected";
    if (connectBtnEl) connectBtnEl.disabled = true;
    if (disconnectBtnEl) disconnectBtnEl.disabled = false;
    if (saveBtnEl) saveBtnEl.disabled = false;
    if (clearLogBtnEl) clearLogBtnEl.disabled = false;
    if (sendCanBtnEl) sendCanBtnEl.disabled = false;
    if (canIdInputEl) canIdInputEl.disabled = false;
    if (canDlcInputEl) canDlcInputEl.disabled = false;
    if (canDataInputEl) canDataInputEl.disabled = false;
  } else if (connectedState === false) {
    if (statusMessageEl) statusMessageEl.className = "status-disconnected";
    if (connectBtnEl) connectBtnEl.disabled = false;
    if (disconnectBtnEl) disconnectBtnEl.disabled = true;
    if (saveBtnEl) saveBtnEl.disabled = loggedMessagesCount === 0;
    if (clearLogBtnEl) clearLogBtnEl.disabled = loggedMessagesCount === 0;
    if (sendCanBtnEl) sendCanBtnEl.disabled = true;
    if (canIdInputEl) canIdInputEl.disabled = true;
    if (canDlcInputEl) canDlcInputEl.disabled = true;
    if (canDataInputEl) canDataInputEl.disabled = true;
  } else {
    if (statusMessageEl) statusMessageEl.className = "status-connecting";
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
function addMessageToTableUI(messageBodyEl, msg, maxMessagesInTable2 = 200) {
  if (!messageBodyEl) return;
  const row = messageBodyEl.insertRow(0);
  row.classList.add("highlight");
  const tc = row.insertCell(), tyc = row.insertCell(), idc = row.insertCell(), dlcc = row.insertCell(), dc = row.insertCell();
  const ts = new Date(msg.timestamp);
  tc.textContent = ts.toLocaleTimeString() + "." + String(ts.getMilliseconds()).padStart(3, "0");
  tc.classList.add("timestamp");
  tyc.textContent = msg.type.toUpperCase();
  idc.textContent = msg.id || "---";
  dlcc.textContent = msg.dlc !== null ? msg.dlc : "---";
  dc.textContent = msg.data ? msg.data.join(" ") : "---";
  if (msg.type === "error" || msg.type === "parse_error" || msg.type.includes("error")) {
    row.classList.add("error");
    dc.textContent = msg.raw || msg.message || "Error";
  }
  setTimeout(() => row.classList.remove("highlight"), 500);
  while (messageBodyEl.rows.length > maxMessagesInTable2) {
    messageBodyEl.deleteRow(-1);
  }
}
function formatTimestampForFile(tsMs) {
  const d = new Date(tsMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
function saveDataToFileUI(messagesToSave, saveBtnEl) {
  if (messagesToSave.length === 0) {
    alert("No messages to save.");
    if (saveBtnEl) saveBtnEl.disabled = true;
    return;
  }
  const header = "Timestamp,Type,ID,DLC,Data\n";
  const rows = messagesToSave.map((m) => {
    const timestamp = formatTimestampForFile(m.timestamp);
    const type = m.type.toUpperCase();
    const id = m.id || "";
    const dlc = m.dlc !== null ? m.dlc : "";
    const data = m.data ? m.data.join(" ") : "";
    const escapeCsvField = (field) => String(field).includes(",") ? `"${String(field).replace(/"/g, '""')}"` : field;
    return `${escapeCsvField(timestamp)},${escapeCsvField(type)},${escapeCsvField(id)},${escapeCsvField(dlc)},${escapeCsvField(data)}`;
  }).join("\n");
  const csvContent = header + rows;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  const now = /* @__PURE__ */ new Date();
  const filename = `can_trace_webusb_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}.csv`;
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
const useSerial = "serial" in navigator;
const serial = useSerial ? navigator.serial : serial$1;
const connectBtn = document.getElementById("connect-btn");
console.log("connectBtn", connectBtn);
const disconnectBtn = document.getElementById("disconnect-btn");
const clearLogBtn = document.getElementById("clear-log-btn");
const saveBtn = document.getElementById("save-btn");
const sendCanBtn = document.getElementById("send-can-btn");
const canIdInput = document.getElementById("can-id-input");
const canDlcInput = document.getElementById("can-dlc-input");
const canDataInput = document.getElementById("can-data-input");
const statusMessage = document.getElementById("status-message");
const messageBody = document.getElementById("message-body");
const VENDOR_ID = 1155;
const PRODUCT_ID = 22336;
const BAUD_RATE = 115200;
let port;
let reader;
let writer;
let keepReading = false;
let lineBuffer = "";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let maxMessagesInTable = 200;
let loggedMessages = [];
async function writeToStream(command) {
  if (!writer) {
    console.error("Writer not available.");
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Error: Writer not available.",
      port ? port.readable !== null : false,
      loggedMessages.length
    );
    return;
  }
  if (command == null || typeof command !== "string") {
    console.error("Invalid command type to send to stream (must be string):", command);
    return;
  }
  const data = encoder.encode(command + CR_CHAR);
  await writer.write(data);
  console.log("Sent to Stream:", command);
  const sentMsgPseudo = parseCanMessage(command);
  const messageObjectToLog = sentMsgPseudo.type === "unknown" || sentMsgPseudo.type === "other" || sentMsgPseudo.type === "parse_error" ? {
    raw: command,
    type: "sent_cmd",
    id: sentMsgPseudo.id || null,
    dlc: sentMsgPseudo.dlc || null,
    data: sentMsgPseudo.data && sentMsgPseudo.data.length > 0 ? sentMsgPseudo.data : [command],
    timestamp: Date.now()
  } : { ...sentMsgPseudo, type: `sent_${sentMsgPseudo.type}` };
  loggedMessages.push(messageObjectToLog);
  addMessageToTableUI(messageBody, messageObjectToLog, maxMessagesInTable);
  updateStatusUI(
    statusMessage,
    connectBtn,
    disconnectBtn,
    saveBtn,
    clearLogBtn,
    sendCanBtn,
    canIdInput,
    canDlcInput,
    canDataInput,
    statusMessage.textContent,
    // Keep current status text
    port ? port.readable ? true : null : false,
    // Current connection state
    loggedMessages.length
  );
}
async function sendCanMessageFromInput() {
  const idStr = canIdInput.value.trim();
  const dlcStr = canDlcInput.value.trim();
  const dataStr = canDataInput.value.trim().replace(/\s/g, "");
  const dlcNum = parseInt(dlcStr, 10);
  if (!isValidHex(idStr, 3)) {
    const errorMsg = { type: "error", message: "Invalid CAN ID: Must be 3 hex characters.", timestamp: Date.now() };
    loggedMessages.push(errorMsg);
    addMessageToTableUI(messageBody, errorMsg, maxMessagesInTable);
    console.warn("Invalid CAN ID:", idStr);
    updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, statusMessage.textContent, port ? port.readable ? true : null : false, loggedMessages.length);
    return;
  }
  if (isNaN(dlcNum) || dlcNum < 0 || dlcNum > 8) {
    const errorMsg = { type: "error", message: "Invalid CAN DLC: Must be a number 0-8.", timestamp: Date.now() };
    loggedMessages.push(errorMsg);
    addMessageToTableUI(messageBody, errorMsg, maxMessagesInTable);
    console.warn("Invalid CAN DLC:", dlcStr);
    updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, statusMessage.textContent, port ? port.readable ? true : null : false, loggedMessages.length);
    return;
  }
  if (!isValidHex(dataStr, dlcNum * 2)) {
    const errorMsg = { type: "error", message: `Invalid CAN Data: Must be ${dlcNum * 2} hex characters for DLC ${dlcNum}.`, timestamp: Date.now() };
    loggedMessages.push(errorMsg);
    addMessageToTableUI(messageBody, errorMsg, maxMessagesInTable);
    console.warn("Invalid CAN Data:", dataStr, "DLC:", dlcNum);
    updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, statusMessage.textContent, port ? port.readable ? true : null : false, loggedMessages.length);
    return;
  }
  const command = constructCanFrameCommand(idStr, dlcNum, dataStr, false);
  if (command) {
    await writeToStream(command);
  } else {
    const errorMsg = { type: "error", message: "Failed to construct CAN command. Check inputs.", timestamp: Date.now() };
    loggedMessages.push(errorMsg);
    addMessageToTableUI(messageBody, errorMsg, maxMessagesInTable);
    console.error("Failed to construct CAN command with inputs:", idStr, dlcNum, dataStr);
    updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, statusMessage.textContent, port ? port.readable ? true : null : false, loggedMessages.length);
  }
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
        console.log("Reader done.");
        break;
      }
      if (value) {
        lineBuffer += decoder.decode(value, { stream: true });
        let lines = lineBuffer.split(CR_CHAR);
        lineBuffer = lines.pop();
        lines.forEach((line) => {
          if (line.trim()) {
            const parsedMsg = parseCanMessage(line.trim());
            loggedMessages.push(parsedMsg);
            if (parsedMsg.type.startsWith("can") || parsedMsg.type.startsWith("rtr") || parsedMsg.type === "status_flags" || parsedMsg.type.includes("error")) {
              addMessageToTableUI(messageBody, parsedMsg, maxMessagesInTable);
            } else {
              console.log("Device Response:", line.trim());
            }
          } else {
            console.log("Device Response: CR (OK)");
          }
        });
        if (lineBuffer.includes("\x07")) {
          console.error("Device Response: BELL (Error)");
          const bellErrorMsg = parseCanMessage("\x07");
          loggedMessages.push(bellErrorMsg);
          addMessageToTableUI(messageBody, bellErrorMsg, maxMessagesInTable);
          lineBuffer = lineBuffer.replace("\x07", "");
        }
        if (lines.length > 0) {
          updateStatusUI(statusMessage, connectBtn, disconnectBtn, saveBtn, clearLogBtn, sendCanBtn, canIdInput, canDlcInput, canDataInput, statusMessage.textContent, true, loggedMessages.length);
        }
      }
    }
  } catch (error) {
    console.error("Error in read loop:", error);
    const errorMsg = { type: "error", message: `Read loop error: ${error.message}`, timestamp: Date.now() };
    loggedMessages.push(errorMsg);
    addMessageToTableUI(messageBody, errorMsg, maxMessagesInTable);
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      `Read loop error: ${error.message}`,
      false,
      loggedMessages.length
    );
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch (cancelError) {
        console.warn("Error cancelling reader:", cancelError);
      }
      reader.releaseLock();
      reader = null;
      console.log("Reader released.");
    }
  }
  console.log("Read loop finished.");
  if (keepReading) {
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Disconnected (Read loop ended unexpectedly)",
      false,
      loggedMessages.length
    );
    await disconnect();
  }
}
async function connect() {
  updateStatusUI(
    statusMessage,
    connectBtn,
    disconnectBtn,
    saveBtn,
    clearLogBtn,
    sendCanBtn,
    canIdInput,
    canDlcInput,
    canDataInput,
    "Requesting port...",
    null,
    // connecting state
    loggedMessages.length
  );
  try {
    const filters = [{ usbVendorId: VENDOR_ID, usbProductId: PRODUCT_ID }];
    port = await serial.requestPort({ filters });
    console.log("Port selected:", port);
    await port.open({ baudRate: BAUD_RATE });
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Port open, configuring CAN...",
      null,
      // connecting state
      loggedMessages.length
    );
    writer = port.writable.getWriter();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeToStream("");
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeToStream(CAN_BITRATE_CMD);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeToStream(OPEN_CAN_CMD);
    await new Promise((resolve) => setTimeout(resolve, 50));
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Connected (500 kbit/s)",
      true,
      loggedMessages.length
    );
    keepReading = true;
    readLoop();
  } catch (error) {
    console.error("Connection failed:", error);
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      `Connection failed: ${error.message}`,
      false,
      loggedMessages.length
    );
    if (writer) {
      try {
        writer.releaseLock();
        writer = null;
      } catch (e) {
      }
    }
    if (reader) {
      try {
        await reader.cancel();
        reader.releaseLock();
        reader = null;
      } catch (e) {
      }
    }
    if (port && port.readable) {
      port = null;
    } else if (port) {
      try {
        await port.close();
        port = null;
      } catch (e) {
      }
    }
  }
}
async function disconnect() {
  keepReading = false;
  if (!port) {
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Already disconnected",
      false,
      loggedMessages.length
    );
    return;
  }
  updateStatusUI(
    statusMessage,
    connectBtn,
    disconnectBtn,
    saveBtn,
    clearLogBtn,
    sendCanBtn,
    canIdInput,
    canDlcInput,
    canDataInput,
    "Disconnecting...",
    null,
    // connecting state (or a dedicated 'disconnecting' state if desired)
    loggedMessages.length
  );
  if (writer) {
    try {
      await writeToStream(CLOSE_CAN_CMD);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (e) {
      console.warn("Error sending close command:", e);
    } finally {
      try {
        writer.releaseLock();
      } catch (e) {
        console.warn("Error releasing writer lock:", e);
      }
      writer = null;
      console.log("Writer released.");
    }
  }
  try {
    await port.close();
    console.log("Port closed.");
  } catch (error) {
    console.error("Error closing port:", error);
  } finally {
    port = null;
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Disconnected",
      false,
      loggedMessages.length
      // loggedMessages might have content to save
    );
  }
}
connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);
clearLogBtn.addEventListener("click", () => {
  if (messageBody) messageBody.innerHTML = "";
  loggedMessages = [];
  console.log("Log cleared.");
  updateStatusUI(
    statusMessage,
    connectBtn,
    disconnectBtn,
    saveBtn,
    clearLogBtn,
    sendCanBtn,
    canIdInput,
    canDlcInput,
    canDataInput,
    "Log cleared.",
    // Or keep existing status if preferred
    port ? port.readable ? true : null : false,
    // Current connection state
    loggedMessages.length
    // Will be 0
  );
});
saveBtn.addEventListener("click", () => saveDataToFileUI(loggedMessages, saveBtn));
sendCanBtn.addEventListener("click", sendCanMessageFromInput);
window.addEventListener("beforeunload", async () => {
  if (port && port.readable) {
    await disconnect();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  const isSerialSupported = "serial" in navigator || "usb" in navigator;
  if (!isSerialSupported) {
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Web Serial API not supported.",
      false,
      0
      // No logged messages initially
    );
  } else {
    updateStatusUI(
      statusMessage,
      connectBtn,
      disconnectBtn,
      saveBtn,
      clearLogBtn,
      sendCanBtn,
      canIdInput,
      canDlcInput,
      canDataInput,
      "Disconnected",
      false,
      // Initial state
      0
      // No logged messages initially
    );
  }
});
