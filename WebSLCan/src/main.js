import './style.css'
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'

import { serial as webSerialPolyfill } from 'web-serial-polyfill';

// const useSerial = false;
const useSerial = ('serial' in navigator);

const serial = useSerial ? navigator.serial : webSerialPolyfill;
const ports = await serial.getPorts();

console.log('ports: ', ports);

const VID = 0x0483;
const PID = 0x5740;

console.log('chosed serial: ', serial, navigator.serial, webSerialPolyfill);

document.querySelector('#app').innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank">
      <img src="${javascriptLogo}" class="logo vanilla" alt="JavaScript logo" />
    </a>
    <h1>Hello Vite!</h1>
    <div class="card">
      <button id="counter" type="button">Connect</button>
    </div>
    <p class="read-the-docs">
      Click on the Vite logo to learn more
    </p>
  </div>
`

var port = null;

async function connectToPort() {
  console.log('Connecting to port...');
  const filters = [{usbVendorId: VID, usbProductId: PID}];
  port = await serial.requestPort({ filters });
  console.log('Port selected: ', port);
}

document.querySelector('#counter').addEventListener('click', () => {
  // setCounter(counter + 1)
  connectToPort();
});

// setupCounter(document.querySelector('#counter'))
