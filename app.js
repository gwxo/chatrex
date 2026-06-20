const CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const BASE_URL = window.location.origin + window.location.pathname;

let pc, dataChannel;
let isHost = false;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');

    if (data) {
        startGuest(data);
    }

    document.getElementById('btn-create-room').onclick = startHost;
    document.getElementById('btn-join-room').onclick = () => startGuest();
    document.getElementById('btn-send').onclick = sendMessage;
    document.getElementById('msg-input').onkeypress = (e) => e.key === 'Enter' && sendMessage();
});

// --- WebRTC Core ---
async function initPeer(role) {
    pc = new RTCPeerConnection(CONFIG);

    // This part ensures the QR code shows even if ICE gathering is slow
    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            console.log("ICE Gathering Complete");
            updateUIWithCode(role);
        }
    };

    if (role === 'guest') {
        pc.ondatachannel = (e) => setupDataChannel(e.channel);
    }
}

// Function to generate the string and QR
function updateUIWithCode(role) {
    if (!pc.localDescription) return;
    
    const sdp = btoa(JSON.stringify(pc.localDescription));
    if (role === 'host') {
        const url = `${BASE_URL}?data=${sdp}`;
        generateQR('qrcode-host', url);
        document.getElementById('host-code-out').value = sdp;
    } else {
        generateQR('qrcode-guest', sdp);
        document.getElementById('guest-code-out').value = sdp;
    }
}

function setupDataChannel(chan) {
    dataChannel = chan;
    dataChannel.onopen = () => {
        showScreen('chat-screen');
        window.history.replaceState({}, null, BASE_URL); 
    };
    dataChannel.onmessage = (e) => appendMessage(JSON.parse(e.data), 'received');
    dataChannel.onclose = () => alert("Peer disconnected.");
}

// --- Host Logic ---
async function startHost() {
    isHost = true;
    showScreen('connection-screen');
    document.getElementById('host-setup').classList.remove('hidden');
    
    await initPeer('host');
    dataChannel = pc.createDataChannel("chat");
    setupDataChannel(dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // FORCE DISPLAY after 1 second even if ICE isn't finished
    setTimeout(() => updateUIWithCode('host'), 1000);
}

document.getElementById('btn-goto-scan-answer').onclick = () => {
    document.getElementById('host-setup').classList.add('hidden');
    document.getElementById('host-scan-answer-step').classList.remove('hidden');
    startScanner("reader-answer", (text) => hostProcessManual(text));
};

async function hostProcessManual(manualCode = null) {
    const code = manualCode || document.getElementById('host-paste-answer').value.trim();
    if (!code) return;
    try {
        const answer = JSON.parse(atob(code));
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch(e) { 
        console.error(e);
        alert("Invalid Answer Code. Make sure you copied the whole string."); 
    }
}

// --- Guest Logic ---
async function startGuest(autoData = null) {
    isHost = false;
    showScreen('connection-screen');
    
    if (autoData) {
        processOffer(autoData);
    } else {
        document.getElementById('guest-scan-step').classList.remove('hidden');
        startScanner("reader-host", (text) => {
            const data = text.includes('?data=') ? text.split('?data=')[1] : text;
            processOffer(data);
        });
    }
}

async function guestProcessManual() {
    const code = document.getElementById('guest-paste-host').value.trim();
    if (code) processOffer(code);
}

async function processOffer(encodedSdp) {
    document.getElementById('guest-scan-step').classList.add('hidden');
    document.getElementById('guest-answer-step').classList.remove('hidden');
    
    await initPeer('guest');
    try {
        const offer = JSON.parse(atob(encodedSdp));
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // FORCE DISPLAY after 1 second
        setTimeout(() => updateUIWithCode('guest'), 1000);
    } catch(e) { 
        console.error(e);
        alert("Invalid Host Code."); 
    }
}

// --- UI Utilities ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function generateQR(elId, text) {
    const el = document.getElementById(elId);
    el.innerHTML = ""; // Clear existing
    new QRCode(el, {
        text: text,
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.L // Low correction = simpler QR = easier to scan
    });
}

let html5QrCode;
async function startScanner(elId, callback) {
    if (html5QrCode) { await html5QrCode.stop().catch(()=>{}); }
    html5QrCode = new Html5Qrcode(elId);
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
            html5QrCode.stop();
            callback(text);
        }
    ).catch(err => {
        console.error(err);
        alert("Camera not found or permission denied.");
    });
}

function sendMessage() {
    const msgInput = document.getElementById('msg-input');
    const val = msgInput.value.trim();
    if (!val || !dataChannel || dataChannel.readyState !== "open") return;

    const msg = { text: val, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    dataChannel.send(JSON.stringify(msg));
    appendMessage(msg, 'sent');
    msgInput.value = "";
}

function appendMessage(msg, type) {
    const chat = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerHTML = `<div>${msg.text}</div><div style="font-size:9px; opacity:0.6; margin-top:4px">${msg.time}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function copyToClipboard(id) {
    const input = document.getElementById(id);
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);
    const btn = input.nextElementSibling;
    const oldText = btn.innerText;
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = oldText, 2000);
}
