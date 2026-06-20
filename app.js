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
function initPeer(role) {
    pc = new RTCPeerConnection(CONFIG);

    pc.onicecandidate = (e) => {
        if (!e.candidate) {
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
    };

    if (role === 'guest') {
        pc.ondatachannel = (e) => setupDataChannel(e.channel);
    }
}

function setupDataChannel(chan) {
    dataChannel = chan;
    dataChannel.onopen = () => {
        showScreen('chat-screen');
        window.history.replaceState({}, null, BASE_URL); // Clear URL
    };
    dataChannel.onmessage = (e) => appendMessage(JSON.parse(e.data), 'received');
}

// --- Host Logic ---
async function startHost() {
    isHost = true;
    showScreen('connection-screen');
    document.getElementById('host-setup').classList.remove('hidden');
    
    initPeer('host');
    dataChannel = pc.createDataChannel("chat");
    setupDataChannel(dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
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
        await pc.setRemoteDescription(answer);
    } catch(e) { alert("Invalid Code"); }
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
    
    initPeer('guest');
    try {
        const offer = JSON.parse(atob(encodedSdp));
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
    } catch(e) { alert("Invalid Offer Code"); }
}

// --- UI Utilities ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function generateQR(elId, text) {
    const el = document.getElementById(elId);
    el.innerHTML = "";
    new QRCode(el, { text: text, width: 180, height: 180 });
}

let html5QrCode;
function startScanner(elId, callback) {
    html5QrCode = new Html5Qrcode(elId);
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (text) => {
            html5QrCode.stop();
            callback(text);
        }
    ).catch(err => alert("Camera error: " + err));
}

function sendMessage() {
    const msgInput = document.getElementById('msg-input');
    const val = msgInput.value.trim();
    if (!val || !dataChannel) return;

    const msg = { text: val, time: new Date().toLocaleTimeString() };
    dataChannel.send(JSON.stringify(msg));
    appendMessage(msg, 'sent');
    msgInput.value = "";
}

function appendMessage(msg, type) {
    const chat = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerHTML = `<div>${msg.text}</div><div style="font-size:9px; opacity:0.6">${msg.time}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function copyToClipboard(id) {
    const input = document.getElementById(id);
    input.select();
    navigator.clipboard.writeText(input.value);
    alert("Code copied!");
}
